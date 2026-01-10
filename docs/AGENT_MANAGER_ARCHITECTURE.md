# Agent Manager 架构设计

> **创建时间**: 2026-01-09
> **状态**: 设计确认，待实现

---

## 📋 设计决策

### ❌ **不使用 Motia Plugin**

**原因**：

1. Plugin 系统将 Manager 逻辑耦合到 Motia 框架
2. 换框架需要重新实现 Plugin
3. Plugin 主要是为了单例模式，但我们已有更好的方案

### ✅ **使用独立的 Manager 层**

**优势**：

1. ✅ 框架解耦 - Manager 不依赖 Motia
2. ✅ 职责清晰 - Motia 管事件，Manager 管实例
3. ✅ 易于迁移 - 换框架只需改应用层代码
4. ✅ 易于测试 - 可独立测试 Manager

---

## 🏗️ 架构分层

```
┌─────────────────────────────────────┐
│   Framework Layer                   │
│   Motia / Express / Fastify / ...   │
│   - 职责：事件流转、请求处理           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Application Layer                 │
│   Motia Steps / Express Routes      │
│   - 职责：集成 Manager 和框架         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Manager Layer (框架无关)          │
│   - AgentManager                    │
│   - SandboxManager                  │
│   - 职责：session 到实例的生命周期管理  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Core Layer (业务逻辑)             │
│   - Agent (有状态，session-scoped)  │
│   - Sandbox (有状态，session-scoped)│
│   - PTCGenerator                    │
└─────────────────────────────────────┘
```

---

## 🎯 核心设计原则

### 1. **每个 Session 独立的 Agent 和 Sandbox 实例**

```typescript
sessionId "abc-123" → Agent Instance A (有状态)
                         ├─ conversationHistory
                         ├─ executionHistory
                         └─ variables

sessionId "def-456" → Agent Instance B (有状态)
                         ├─ conversationHistory
                         ├─ executionHistory
                         └─ variables
```

**关键**：

- ✅ 每个 session 有独立的 Agent/Sandbox
- ✅ Agent/Sandbox 可以安全地持有状态
- ✅ 不同 session 之间状态完全隔离

### 2. **Manager 负责实例生命周期**

```typescript
class AgentManager {
  private sessions: Map<string, Agent> = new Map();

  async acquire(sessionId: string): Promise<Agent> {
    // 获取或创建 session 对应的 Agent
    if (!this.sessions.has(sessionId)) {
      const agent = new Agent(config, sessionId);
      this.sessions.set(sessionId, agent);
    }
    return this.sessions.get(sessionId)!;
  }

  async release(sessionId: string): Promise<void> {
    // 清理 session
    const agent = this.sessions.get(sessionId);
    await agent.cleanup();
    this.sessions.delete(sessionId);
  }
}
```

### 3. **Agent 维护 Session 状态**

```typescript
class Agent {
  private sessionId: string; // ✅ 绑定到特定 session
  private state: SessionState;

  constructor(config: AgentConfig, sessionId: string) {
    this.sessionId = sessionId;
    this.state = {
      sessionId,
      conversationHistory: [],
      executionHistory: [],
      variables: new Map(),
    };
  }

  async run(task: string): Promise<AgentResult> {
    // ✅ 可以安全地访问和更新状态
    this.state.conversationHistory.push({ role: 'user', content: task });

    // 执行任务...

    this.state.conversationHistory.push({ role: 'assistant', content: result });
    return result;
  }
}
```

---

## 📝 实现要点

### Phase 1: AgentManager 实现

**文件**: `src/core/agent/manager.ts`

```typescript
export class AgentManager {
  private sessions: Map<string, Agent>;
  private config: AgentManagerConfig;

  constructor(config: AgentManagerConfig) {
    this.sessions = new Map();
    this.config = config;

    // 定期清理过期 session
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  async acquire(sessionId: string): Promise<Agent> {
    if (!this.sessions.has(sessionId)) {
      const agent = new Agent(this.config.agentConfig, sessionId);
      this.sessions.set(sessionId, agent);
    }
    return this.sessions.get(sessionId)!;
  }

  async release(sessionId: string): Promise<void> {
    // 实现释放逻辑
  }

  private async cleanupExpiredSessions(): Promise<void> {
    // 清理过期 session
  }
}
```

### Phase 2: SandboxManager 实现

**文件**: `src/core/sandbox/manager.ts`

```typescript
export class SandboxManager {
  private sessions: Map<string, SandboxAdapter>;
  private config: SandboxManagerConfig;

  constructor(config: SandboxManagerConfig) {
    this.sessions = new Map();
    this.config = config;
  }

  async acquire(sessionId: string): Promise<SandboxAdapter> {
    if (!this.sessions.has(sessionId)) {
      const sandbox = SandboxFactory.create(this.config.sandboxConfig);
      this.sessions.set(sessionId, sandbox);
    }
    return this.sessions.get(sessionId)!;
  }

  async release(sessionId: string): Promise<void> {
    // 实现
  }
}
```

### Phase 3: Agent 类修改

**文件**: `src/core/agent/agent.ts`

**修改点**：

1. 构造函数接受 `sessionId`
2. 添加 `SessionState` 字段
3. `run()` 方法维护会话历史

```typescript
export class Agent {
  private sessionId: string; // ✅ 新增
  private state: SessionState; // ✅ 新增

  constructor(config: AgentConfig, sessionId: string) {
    // ✅ 修改签名
    this.sessionId = sessionId;
    this.state = this.initializeState();
    // ...
  }

  async run(task: string): Promise<AgentResult> {
    // ✅ 维护对话历史
    this.state.conversationHistory.push({
      role: 'user',
      content: task,
      timestamp: Date.now(),
    });

    // 执行...

    // ✅ 记录助手回复
    this.state.conversationHistory.push({
      role: 'assistant',
      content: result,
      timestamp: Date.now(),
    });

    return result;
  }
}
```

### Phase 4: Motia Step 集成

**文件**: `steps/agents/master-agent.step.ts`

```typescript
import { agentManager } from '@/core/agent/manager';
import { sandboxManager } from '@/core/sandbox/manager';

export const handler = async (input, { emit, logger }) => {
  const sessionId = input.sessionId || uuidv4();

  // ✅ 从 Manager 获取实例（每个 session 独立）
  const agent = await agentManager.acquire(sessionId);
  const sandbox = await sandboxManager.acquire(sessionId);

  try {
    // ✅ 执行任务（Agent 维护 session 状态）
    const result = await agent.run(input.task);

    return {
      success: true,
      sessionId, // ✅ 返回 sessionId，客户端可以继续
      output: result.output,
    };
  } finally {
    // ✅ 不立即释放，让 session 持续存在
    // Manager 会自动清理过期 session
  }
};
```

---

## 🧪 并发安全验证

### 测试场景

```typescript
// 测试 1: 并发请求无状态污染
async function testConcurrentRequests() {
  const sessionId1 = 'session-1';
  const sessionId2 = 'session-2';

  // 并发执行
  const [result1, result2] = await Promise.all([
    agentManager.execute(sessionId1, 'Task A'),
    agentManager.execute(sessionId2, 'Task B'),
  ]);

  // 验证：两个 session 的状态独立
  const agent1 = await agentManager.acquire(sessionId1);
  const agent2 = await agentManager.acquire(sessionId2);

  assert(agent1.getState().sessionId === sessionId1);
  assert(agent2.getState().sessionId === sessionId2);
  assert(agent1.getState() !== agent2.getState());
}

// 测试 2: 同一个 session 的状态保持
async function testSessionState() {
  const sessionId = 'session-test';

  const agent = await agentManager.acquire(sessionId);

  await agent.run('First task');
  const state1 = agent.getState();

  await agent.run('Second task');
  const state2 = agent.getState();

  // 验证：状态在累积
  assert(state2.conversationHistory.length === 4); // 2轮 × 2条
  assert(state2.conversationHistory[0].content === 'First task');
}
```

---

## 📊 与其他方案对比

### 方案 A: Motia Plugin（不采用）

```typescript
// ❌ 耦合到 Motia
motia.config.ts:
  plugins: [
    agentPlugin({...})  // 换框架需要重写
  ]
```

**问题**：

- ❌ 框架耦合
- ❌ 难以测试
- ❌ 迁移成本高

### 方案 B: 全局单例 + 无状态（不采用）

```typescript
// ❌ Agent 无状态，无法维护会话
class Agent {
  async run(task, sessionId) {
    // 每次 run 都传入 sessionId
    // 无法记住对话历史
  }
}
```

**问题**：

- ❌ Agent 无法维护状态
- ❌ 多轮对话困难

### 方案 C: Manager + Session-Scoped Agent（✅ 采用）

```typescript
// ✅ 框架无关，Agent 有状态
const agentManager = new AgentManager(config);

// 在任何框架中使用
const agent = await agentManager.acquire(sessionId);
await agent.run(task); // Agent 维护 session 状态
```

**优势**：

- ✅ 框架解耦
- ✅ Agent 有状态
- ✅ 并发安全
- ✅ 易于测试

---

## 🚀 后续优化（见 PERFORMANCE_OPTIMIZATION.md）

当前的实现优先保证正确性，性能优化作为后续任务：

1. **资源池化** - 全局共享 LLM/Sandbox/PTCGenerator
2. **状态压缩** - 长对话自动压缩
3. **惰性加载** - 按需初始化资源
4. **分层存储** - 热/温/冷数据分离
5. **Session 共享** - 引用计数

这些优化不影响架构，只是性能提升。

---

## 📝 TODO

- [ ] 实现 `AgentManager`
- [ ] 实现 `SandboxManager`
- [ ] 修改 `Agent` 类支持 session 状态
- [ ] 更新 `Master-Agent` Step
- [ ] 并发安全测试
- [ ] 更新文档

---

**最后更新**: 2026-01-09
