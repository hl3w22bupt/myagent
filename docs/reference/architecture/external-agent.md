# ExternalAgent - 外部 Agent 集成指南

## 概述

ExternalAgent 是 MyAgent 的一种特殊 Agent 类型,它通过 ACP (Agent Client Protocol) 协议与外部 coding agent 进行通信。

### 支持的外部 Agents

- **Claude Code** (`claude`) - Anthropic 的编码助手
- **Cursor** (`cursor`) - Cursor AI 编码助手
- **Codex** (`codex`) - OpenAI Codex
- **OpenClaw** (`openclaw`) - OpenClaw 通用客户端
- **Pi** (`pi`) - Pi AI 助手
- **Gemini** (`gemini`) - Google Gemini

### 架构

```
MyAgent (ExternalAgent)
    ↓
AcpClient (@agentclientprotocol/sdk)
    ↓
External Agent (Claude Code, etc.)
```

## 配置 ExternalAgent

### 1. 创建 Agent 配置文件

在 `subagents/<agent-name>/agent.yaml` 中创建配置:

```yaml
name: claude-code-external
description: External agent that delegates to Claude Code via ACP

agent:
  system_prompt: |
    You are a proxy to Claude Code.

  # External agent configuration
  external_agent:
    # Agent type: claude, codex, cursor, openclaw, pi, gemini
    type: claude

    # Protocol: acp (Agent Client Protocol)
    protocol: acp

    # Timeout in milliseconds (default: 5 minutes)
    timeout: 300000

    # Working directory for external agent
    working_directory: /path/to/project

    # Additional command-line arguments (optional)
    args: []

  # No skills needed - ExternalAgent doesn't use skills
  available_skills: []

  constraints:
    max_iterations: 1
    timeout: 300000
```

### 2. 关键配置项

| 配置项 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `external_agent.type` | string | ✅ | 外部 agent 类型 |
| `external_agent.protocol` | string | ❌ | 协议类型 (默认: `acp`) |
| `external_agent.timeout` | number | ❌ | 超时时间 (毫秒) |
| `external_agent.working_directory` | string | ❌ | 工作目录 |
| `external_agent.args` | string[] | ❌ | 额外命令行参数 |

## 使用 ExternalAgent

### 通过 API 使用

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "实现一个用户认证系统",
    "agentName": "claude-code-external",
    "sessionId": "session-123"
  }'
```

### 通过 MasterAgent 委托

MasterAgent 可以智能地将任务委托给 ExternalAgent:

```yaml
# subagents/master-agent/agent.yaml
agent:
  subagents:
    - developer-engineer
    - claude-code-external  # 添加到委托列表
```

## HITL (Human-in-the-Loop) 支持

ExternalAgent 支持 HITL 澄清机制:

1. **检测提问**: ExternalAgent 检测外部 Agent 输出中是否包含需要用户澄清的提问
2. **保存状态**: `saveHITLStateInternal()` 保存 HITL 状态到 TaskContext（status: `awaiting`）
3. **通知**: 触发 `onAwaitingHITL` Hook（webhook 通知）
4. **轮询等待**: `pollHITLResultInternal()` 轮询等待用户回复（最多 10 分钟）
5. **解决**: `resolveHITLStateInternal()` 记录解决方式（`resolvedBy: 'human' | 'timeout'`）
6. **继续执行**: 使用用户澄清内容继续对话

### 提问检测 (`detectQuestionInOutput`)

ACP 协议提供 `stopReason: 'awaiting_input'`，但 Claude Code 经常以 `end_turn` 结束并在输出中提问。因此 ExternalAgent 使用 `detectQuestionInOutput()` 进行二次检测。

**检测规则**（两层检测：关键字快速匹配 + LLM 兜底）：

**第一层：关键字/模式匹配**（快速路径，零延迟）

| 规则 | 条件 | 说明 |
|------|------|------|
| 加粗/独立提问 | 最后 5 行中包含 `**...？**` 或匹配中文提问模式且以 `？` 结尾的行 | 强信号，覆盖选项列表前的提问 |
| 短输出问号结尾 | 输出 < 300 字符且以 `？`/`?` 结尾 | 短输出大概率是提问 |
| 显式请求模式 | 尾部 200 字符包含 `请选择`/`请确认`/`是否继续`/`请提供`/`请描述` | 无歧义 |
| 选项列表 + 问号 | 尾部有 A/B/C/D 或 ①②③ 选项列表，且附近有 `？` | 选项列表暗示前方有提问 |

**第二层：LLM 判定**（兜底路径，仅在模式匹配未命中时触发）

当模式匹配全部未命中且输出 >50 字符时，将输出发送给 LLM 判定：
- Prompt 要求 LLM 区分"等待用户回复"和"已完成/纯解释"
- 仅返回 YES/NO，token 开销极小（max_tokens=10）
- LLM 调用失败时默认不触发 HITL（安全降级）

**为什么需要两层？**
- ACP 协议的 `StopReason` 只有 `end_turn`（不区分"提问等待"和"任务完成"）
- 关键字匹配无法穷举所有提问模式
- LLM 能理解语义，但每次调用有延迟和成本
- 两层结合：常见模式快速匹配，罕见模式 LLM 兜底

### HITL 状态解决方式

| resolvedBy | 触发条件 | Stream 事件类型 |
|-----------|---------|----------------|
| `human` | 用户在 10 分钟内通过 UI 提交了回复 | `user_clarification` |
| `timeout` | 轮询 10 分钟超时，自动继续 | `hitl_auto_resolved` |

### Workspace 解析

ExternalAgent 的 workspace 优先级：

1. `context.environment.workspace` — 动态，每次任务可不同
2. `context.environment.workingDirectory` — 向后兼容
3. `externalAgent.workingDirectory` — 静态配置
4. `/tmp/myagent-workspace` — 默认共享目录

### 澄清响应格式

```json
{
  "success": false,
  "error": "External agent is awaiting input (clarification needed)",
  "clarification": {
    "needs": true,
    "question": "The external agent needs more information to proceed.",
    "stage": "in_execution"
  }
}
```

## 工作流程

### 1. 初始化流程

```
1. ExternalAgent 构造函数被调用
2. 读取 external_agent 配置
3. 等待首次 run() 调用
```

### 2. 执行流程

```
1. run(task, taskId, context) 被调用
2. 初始化 AcpClient (首次运行时)
3. 创建 ACP session
4. 发送 prompt 到外部 agent
5. 处理响应:
   - end_turn: 任务完成
   - awaiting_input: 需要 HITL 澄清
   - 其他: 错误或异常终止
```

### 3. 清理流程

```
1. cleanup() 被调用
2. 关闭 ACP session
3. 关闭 AcpClient
4. 清理资源
```

## 与 claude-code-cli skill 的区别

| 特性 | ExternalAgent | claude-code-cli skill |
|------|---------------|----------------------|
| **协议** | ACP (官方) | CLI (非官方) |
| **澄清支持** | ✅ 原生支持 | ❌ 需要关键词检测 |
| **会话管理** | ✅ 完整支持 | ❌ 无状态 |
| **性能** | 更好 (持久连接) | 较差 (每次启动进程) |
| **可靠性** | ✅ 高 | ⚠️ 中等 |

## 依赖

```json
{
  "dependencies": {
    "@agentclientprotocol/sdk": "^0.17.0"
  },
  "devDependencies": {
    "acpx": "latest"
  }
}
```

## 调试

### 启用详细日志

ExternalAgent 默认启用 `verbose` 模式,会输出:

- ACP 消息流
- Session 更新
- Client 操作
- 错误信息

### 检查 ACP 连接

```bash
# 检查外部 agent 是否可用
claude --version
cursor --version
```

### 常见问题

**Q: ExternalAgent 初始化失败**

A: 检查:
1. 外部 agent 是否已安装
2. `working_directory` 是否存在
3. `agentCommand` 是否正确

**Q: HITL 澄清无法到达 MyAgent UI**

A: 这是预期的正常行为 - ExternalAgent 通过 ACP 协议原生支持澄清,无需额外配置。

**Q: 任务执行超时**

A: 增加 `timeout` 配置:

```yaml
external_agent:
  timeout: 600000  # 10 minutes
```

## 示例

### 示例 1: 简单编码任务

```yaml
# subagents/coding-helper/agent.yaml
name: coding-helper
agent:
  external_agent:
    type: claude
    working_directory: /Users/leo/my-project
  available_skills: []
```

### 示例 2: 复杂重构任务

```yaml
# subagents/refactoring-expert/agent.yaml
name: refactoring expert
agent:
  external_agent:
    type: cursor
    timeout: 900000  # 15 minutes for complex refactoring
    working_directory: /Users/leo/large-project
  available_skills: []
```

### 示例 3: 通过 MasterAgent 混合使用

```yaml
# subagents/master-agent/agent.yaml
name: master agent
agent:
  subagents:
    - developer-engineer      # 简单任务
    - claude-code-external    # 复杂编码任务
    - data-analyst            # 数据分析
```

## 未来改进

- [ ] 支持多种协议 (stdio, websocket)
- [ ] 支持多个外部 agent 并行执行
- [ ] 支持外部 agent 流式输出
- [ ] 支持自定义 ACP 客户端配置
- [ ] 支持外部 agent 能力检测

## 参考

- [ACP 协议规范](https://github.com/openclaw/acp)
- [acpx 文档](https://github.com/openclaw/acpx)
- [Agent Client Protocol SDK](https://github.com/agentclientprotocol/sdk)
