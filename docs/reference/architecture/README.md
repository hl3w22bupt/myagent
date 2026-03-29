# 系统架构

> MyAgent 的 4 层架构设计和系统全景

**阅读时间**: 10 分钟 | **难度**: ⭐⭐ intermediate | **前置知识**: [核心概念](core-concepts.md)

---

## 🏗️ 架构概览

MyAgent 采用分层架构设计，每层职责清晰，易于扩展：

```
┌─────────────────────────────────────────────────────────────────┐
│                     Layer 1: Motia Integration                  │
│                    (事件驱动框架 + Step 抽象)                     │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Agent Orchestration                                   │
│  (Agent/MasterAgent + PTC Generator + Context Management)        │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Sandbox Execution                                     │
│  (Python 进程隔离 + 多种沙箱适配器)                              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: Skill Abstraction                                     │
│  (可复用的 Python 技能组件 + Skill Discovery)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Motia Integration

### 职责
- 事件驱动的任务调度
- Step 抽象（API Step、Event Step、Cron Step）
- 中间件支持（鉴权、日志、错误处理）

### 关键组件

**API Step**
```typescript
// 示例：Agent API Step
export const config: ApiRouteConfig = {
  route: '/agent/execute',
  method: 'POST',
};
```

**Event Step**
```typescript
// 示例：任务完成事件处理
export const config = {
  type: 'event',
  event: 'task.completed',
};
```

**Cron Step**
```typescript
// 示例：定时清理任务
export const config = {
  type: 'cron',
  cron: '0 */5 * * * *', // 每 5 分钟
};
```

### Motia 配置文件
```typescript
// motia.config.ts
export default {
  steps: [
    'steps/agents/agent-api.step.ts',
    'steps/api/context-api.step.ts',
    // ... 更多 steps
  ],
};
```

---

## Layer 2: Agent Orchestration

### 职责
- Agent 生命周期管理
- PTC（Programmatic Tool Calling）代码生成
- 上下文管理和压缩
- 知识库检索集成

### 核心组件

#### Agent 类
```typescript
class Agent {
  // 执行任务
  async execute(task: string): Promise<AgentResult>

  // 生成 PTC 代码
  private generatePTC(task: string): string

  // 执行 PTC 代码
  private executePTC(code: string): any
}
```

#### MasterAgent
支持委派模式，可以将任务分解并委派给专门的 Subagent：

```typescript
class MasterAgent extends Agent {
  // 分析并委派任务
  async delegate(task: string): Promise<AgentResult>
}
```

#### ContextManager
管理对话上下文和压缩：

```typescript
class ContextManager {
  // 添加消息到上下文
  addMessage(sessionId: string, message: Message)

  // 获取上下文（自动压缩）
  getContext(sessionId: string): Message[]

  // 压缩上下文
  compress(sessionId: string)
}
```

### 数据流

```
用户请求 → Agent API
         ↓
    AgentManager (会话管理)
         ↓
       Agent (任务分析)
         ↓
   PTC Generator (代码生成)
         ↓
   Sandbox (代码执行)
         ↓
   Skill Discovery (技能调用)
         ↓
     返回结果
```

---

## Layer 3: Sandbox Execution

### 职责
- 安全隔离的 Python 代码执行
- 多种沙箱适配器支持
- 超时和资源控制

### 沙箱适配器

**Local Sandbox**（默认）
```typescript
{
  adapter: 'local',
  pythonPath: 'python3',
  timeout: 30000,
}
```

**Daytona Sandbox**
```typescript
{
  adapter: 'daytona',
  apiKey: process.env.DAYTONA_API_KEY,
}
```

**E2B Sandbox**
```typescript
{
  adapter: 'e2b',
  apiKey: process.env.E2B_API_KEY,
}
```

### 沙箱安全性
- 进程隔离
- 超时控制（默认 30 秒）
- 资源限制（内存、CPU）
- 网络隔离（可选）

---

## Layer 4: Skill Abstraction

### 职责
- 可复用的技能组件
- 自动技能发现
- 技能参数解析

### 技能类型

**内置技能**
```python
# skills/code-analysis/skill.py
@skill.metadata(
  name="code_analysis",
  description="分析代码质量、结构和潜在问题",
  parameters=[
    Parameter(name="code", type="string", required=True),
    Parameter(name="language", type="string", required=False),
  ]
)
def code_analysis(code: str, language: str = "python") -> dict:
  # 技能实现
  pass
```

**技能发现**
```typescript
class SkillDiscovery {
  // 自动发现可用技能
  discoverSkills(): Skill[]

  // 匹配相关技能
  matchSkills(task: string): Skill[]
}
```

### 技能执行流程

```
PTC 代码 → 调用技能函数
         ↓
   Skill Discovery 解析参数
         ↓
   执行技能代码
         ↓
   返回技能结果
```

---

## 🔗 层间交互

### 完整执行流程

```
1. 用户发送请求
   POST /agent/execute { "task": "分析这个Python文件", "sessionId": "123" }

2. Motia Layer 接收请求
   → 路由到 agent-api.step.ts

3. Agent Layer 处理
   → AgentManager 获取/创建 Agent
   → Agent.execute(task)

4. PTC 生成
   → PTCGenerator.generatePTC(task)
   → 生成调用 code-analysis 技能的代码

5. Sandbox 执行
   → 在隔离环境中执行 PTC 代码
   → 调用技能函数

6. Skill Layer 执行
   → code-analysis 技能执行
   → 返回分析结果

7. 结果返回
   → Sandbox 返回执行结果
   → Agent 处理结果
   → 返回给用户
```

---

## 🎨 设计原则

### 1. 分层职责
每层只关注自己的职责，通过清晰的接口交互：

- **Motia Layer**: 事件路由和 Step 执行
- **Agent Layer**: 任务规划和代码生成
- **Sandbox Layer**: 代码执行和资源隔离
- **Skill Layer**: 具体技能实现

### 2. 可扩展性
- 新增 Agent：继承 Agent 类
- 新增 Skill：添加 Python 技能文件
- 新增 Sandbox：实现 SandboxAdapter 接口

### 3. 安全性
- 沙箱隔离执行
- 超时控制
- 参数验证

### 4. 可观测性
- 日志记录
- 流式输出
- Token 追踪

---

## 📊 性能考虑

### 上下文压缩
- 自动压缩：超过 20 条消息触发压缩
- 压缩策略：保留关键信息，去除冗余

### 沙箱池化
- 沙箱复用：减少启动开销
- 连接池：管理多个沙箱实例

### 缓存策略
- LRU 缓存：知识库检索结果
- 会话缓存：Agent 实例复用

---

## 🔧 配置和调优

### Motia 配置
```typescript
// motia.config.ts
export default {
  // Step 加载路径
  steps: 'steps/**/*.step.ts',

  // 中间件
  middlewares: [
    'motia-middleware-logger',
    'motia-middleware-error-handler',
  ],
};
```

### Agent 配置
```typescript
// config/agent.config.yaml
agent:
  maxConversationMessages: 50
  contextCompressionThreshold: 20
  defaultTimeout: 30000
```

### Sandbox 配置
```typescript
// config/sandbox.config.yaml
sandbox:
  defaultAdapter: local
  timeout: 30000
  maxRetries: 3
```

---

## 📖 相关文档

- [核心概念](core-concepts.md) - Session、Task、Agent、Skill 详解
- [Agent 系统](agent-system.md) - Agent 工作原理
- [知识库系统](knowledge-base.md) - RAG 检索增强生成
- [上下文管理](context-management.md) - 对话上下文管理
- [Hook 系统](hook-system.md) - 生命周期扩展

---

**版本**: v1.0 | **更新日期**: 2026-03-29
