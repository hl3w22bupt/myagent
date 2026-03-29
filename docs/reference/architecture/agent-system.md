# Agent 系统

> Agent 的工作原理：从任务理解到代码执行

**阅读时间**: 6 分钟 | **难度**: ⭐⭐ intermediate

---

## 🤖 Agent 是什么？

Agent 是 MyAgent 的核心执行引擎，负责：
- 🧠 理解用户任务
- 📝 生成 PTC 代码
- ⚙️ 执行代码并返回结果

---

## 🏗️ Agent 架构

```typescript
class Agent {
  // 核心组件
  protected llm: LLMClient;          // LLM 客户端
  protected ptcGenerator: PTCGenerator; // PTC 生成器
  protected sandbox: SandboxAdapter;  // 沙箱环境
  protected skillDiscovery: SkillDiscovery; // 技能发现

  // 执行任务
  async execute(task: string): Promise<AgentResult>
}
```

---

## 🔄 Agent 执行流程

### 1. 接收任务

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "分析这段代码", "sessionId": "123"}'
```

### 2. 上下文组装

```typescript
// Agent 组装上下文
const context = await this.orchestrator.getContext({
  sessionId,
  task,
  environment,
});

// 上下文来源：
// - Session 对话历史
// - 知识库检索
// - 环境变量
```

### 3. PTC 代码生成

```typescript
// PTC 生成器生成代码
const ptcCode = await this.ptcGenerator.generate({
  task,
  context,
  availableSkills,
});

// 生成的代码示例：
/*
def execute_task():
    code = get_user_input()
    analysis = code_analysis(code)
    return analysis
*/
```

### 4. 沙箱执行

```typescript
// 在隔离环境中执行
const result = await this.sandbox.execute(ptcCode, {
  timeout: 30000,
  workspace: '/tmp/sandbox',
});
```

### 5. 结果处理

```typescript
// 处理执行结果
const processed = this.processResult(result);

// 更新 Session 上下文
await this.contextManager.addMessage(sessionId, {
  role: 'assistant',
  content: processed,
});
```

---

## 🎯 Agent 类型

### Base Agent
适用于简单任务：

```typescript
// 使用 Base Agent
curl -X POST http://localhost:3000/agent/execute \
  -d '{"task": "简单的任务"}'
```

### MasterAgent
适用于复杂任务，支持委派：

```typescript
// 使用 MasterAgent
curl -X POST http://localhost:3000/agent/execute \
  -d '{
    "task": "复杂任务",
    "useDelegation": true
  }'
```

MasterAgent 会：
1. 分析任务复杂度
2. 分解为子任务
3. 委派给专门的 Subagent
4. 整合结果

---

## 🔌 Subagent

### 可用的 Subagent

```bash
subagents/
├── code-reviewer/       # 代码审查
├── data-analyst/        # 数据分析
├── security-auditor/    # 安全审计
└── developer-engineer/  # 开发工程师
```

### 自定义 Subagent

```yaml
# subagents/my-agent/agent.yaml
name: my-custom-agent
description: 我的自定义 Agent
version: 1.0.0

# 系统提示
systemPrompt: |
  你是一个专门处理 XXX 的专家

# 可用技能
skills:
  - skill1
  - skill2

# 配置
config:
  temperature: 0.7
  maxTokens: 2000
```

---

## 🧠 PTC Generator

### 什么是 PTC？

**PTC (Programmatic Tool Calling)** 是 Agent 自动生成的工具调用代码。

### PTC 生成流程

```
任务描述 → LLM 理解
         ↓
    匹配相关技能
         ↓
    生成调用代码
         ↓
    返回 PTC 代码
```

### PTC 代码示例

```python
# Agent 生成的 PTC 代码
def execute_task():
    # 获取用户输入
    code = get_user_input()

    # 调用技能
    analysis = code_analysis(
        code=code,
        language="python"
    )

    # 返回结果
    return analysis
```

---

## 🔧 Agent 配置

### 基础配置

```typescript
// config/agent.config.yaml
agent:
  # 最大对话消息数
  maxConversationMessages: 50

  # 上下文压缩阈值
  contextCompressionThreshold: 20

  # 默认超时
  defaultTimeout: 30000

  # 默认沙箱
  defaultSandbox: local
```

### LLM 配置

```typescript
// .env
ANTHROPIC_API_KEY=sk-ant-xxx
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-6
```

---

## 📊 Agent 性能

### 性能指标

- **启动时间**: < 100ms
- **PTC 生成**: 1-3 秒
- **代码执行**: 取决于任务复杂度
- **总体延迟**: 通常 < 5 秒

### 性能优化

1. **Session 复用**
   ```typescript
   // 相同 sessionId 复用 Agent 实例
   const agent = agentManager.acquire(sessionId);
   ```

2. **沙箱池化**
   ```typescript
   // 复用沙箱实例
   sandboxPool.acquire();
   ```

3. **上下文压缩**
   ```typescript
   // 自动压缩长对话
   contextManager.compress(sessionId);
   ```

---

## 📖 相关文档

- [核心概念](core-concepts.md) - Session、Task、Agent、Skill
- [系统架构](README.md) - 4 层架构
- [Hook 系统](hook-system.md) - Agent 生命周期扩展

---

**版本**: v1.0 | **更新日期**: 2026-03-29
