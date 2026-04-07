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

1. **外部 agent 请求澄清**: 当 Claude Code 需要更多信息时,它会返回 `stopReason: 'awaiting_input'`
2. **MyAgent 转发请求**: MyAgent 将澄清请求显示在 UI 上
3. **用户提供反馈**: 用户通过 UI 提供澄清信息
4. **恢复执行**: MyAgent 将用户的反馈发送给 Claude Code,继续执行

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
