# 对话历史重构设计文档 v2

## 一、问题分析

### 当前架构的问题

1. **双重数据存储混乱**
   - `task_contexts.conversation_rounds` (JSONB) - 新格式
   - `messages` 表 (独立表) - 旧格式
   - 两者不同步，导致数据不一致

2. **数据流分散**
   ```
   task-result-handler (900+ 行) → 保存 conversationRound
   MasterAgent.run() → 读取 messages (空的!)
   getContextForLLM() → 生成 XML 格式
   Agent.run() → 某些路径用 formattedHistory，某些不用
   ```

3. **对 Agent 有侵入性**
   - Agent 需要知道 formattedHistory、XML 格式等概念
   - 对话逻辑散落在 Agent、ContextManager、MasterAgent 多处

## 二、设计原则

1. **单一数据源**：conversationRounds 是唯一真实数据源
2. **事件驱动保存**：通过 `agent.task.completed` 事件触发保存
3. **Agent 无感知**：Agent 只管执行任务，不关心对话历史存储
4. **通用层复用**：所有 Agent 都能自动获得对话上下文

## 三、新架构设计

### 3.1 数据结构

```typescript
// 唯一的对话历史格式
interface ConversationRound {
  round: number;
  timestamp: number;
  userMessage: string;
  assistantOutput?: string;
  error?: string;
}

// TaskContext
interface TaskContext {
  taskId: string;
  sessionId: string;
  conversationRounds: ConversationRound[];  // 唯一数据源

  // messages 字段保留（但不使用），保持兼容
  messages: Message[];  // @deprecated

  // 其他字段...
  summary: StructuredSummary;
  artifactIndex: ArtifactIndex[];
  workingMemory: Record<string, any>;
}
```

**保留**：
- ✅ `messages` 表（保留表结构，其他分支可能在使用）
- ✅ `TaskContext.messages` 字段（保留但不使用）

### 3.2 模块职责划分

```
┌─────────────────────────────────────────────────────────────┐
│              ContextManagerTaskHook (在 master-agent 中)     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ preExec()                                             │ │
│  │ - 加载 context.conversationRounds                       │ │
│  │ - 构建 context.conversationHistory                       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ postExec()                                            │ │
│  │ - 保存 conversationRound ⭐                            │ │
│  │ - 调用 contextManager.addConversationRound()            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│              MasterAgent / SubAgent                         │
│  - 通过 context.conversationHistory 获取历史                │
│  - 无需关心存储逻辑                                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 删除 task-result-handler 的 conversationRound 保存逻辑

```typescript
// steps/agents/task-result-handler.step.ts
// 删除这部分代码（约 100+ 行）：
// - const existingRounds = taskContext?.conversationRounds || [];
// - const roundNumber = existingRounds.length + 1;
// - const conversationRound = { round, timestamp, userMessage, ... };
// - await contextManager.addConversationRound(taskId, conversationRound);
```

### 3.3 代码组织

**1. ContextManager（现有模块扩展）**

```typescript
// src/core/context/manager.ts

export class ContextManager {
  // 读取对话历史（已有，优化）
  async getContext(taskId: string): Promise<TaskContext | null> {
    // 直接从 task_contexts 表读取 conversation_rounds
  }

  // 保存对话轮次（已有，修复）
  async addConversationRound(taskId: string, round: ConversationRound): Promise<void> {
    // 更新 task_contexts.conversation_rounds
  }

  // 新增：获取 Agent 使用的对话历史格式
  getConversationHistoryForAgent(context: TaskContext): ConversationHistoryEntry[] {
    return context.conversationRounds.flatMap(r => [
      { role: 'user', content: r.userMessage, timestamp: r.timestamp },
      r.assistantOutput ? { role: 'assistant', content: r.assistantOutput, timestamp: r.timestamp } : null,
    ].filter(Boolean));
  }
}
```

**2. Agent 通用层（现有模块扩展）**

```typescript
// src/core/agent/agent.ts

export class Agent {
  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    // 在通用 Agent 层加载对话历史（不侵入具体 Agent 逻辑）
    const conversationHistory = await this.loadConversationHistory(taskId, context);

    // Agent 可以选择性使用（通过 context 传递）
    if (!context) context = {};
    context.conversationHistory = conversationHistory;

    // ... 执行任务
  }

  private async loadConversationHistory(taskId: string, context?: any) {
    if (context?.conversationHistory) {
      // 如果已有，直接使用
      return context.conversationHistory;
    }

    // 否则从 ContextManager 加载
    const contextManager = new ContextManager(getDataStore());
    const taskContext = await contextManager.getContext(taskId);
    return taskContext ? contextManager.getConversationHistoryForAgent(taskContext) : [];
  }
}
```

**3. ContextManagerTaskHook（扩展）**

```typescript
// src/core/task/hooks/context-manager.ts

export class ContextManagerTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    // 创建/加载任务上下文
    const taskContext = await this.contextManager.createTaskContext(...);
    context.context = taskContext;

    // ⭐ 新增：构建对话历史供 Agent 使用
    const history = this.buildConversationHistory(taskContext.conversationRounds);
    context.conversationHistory = history;
  }

  async postExec(context: TaskContext, result: any) {
    // ⭐ 新增：保存对话轮次
    const newRound: ConversationRound = {
      round: context.context.conversationRounds.length + 1,
      timestamp: Date.now(),
      userMessage: context.task,
      assistantOutput: result.success ? result.output : undefined,
      error: result.success ? undefined : result.error,
    };
    await this.contextManager.addConversationRound(context.taskId, newRound);

    // ... 其他保存逻辑
  }

  private buildConversationHistory(rounds: ConversationRound[]): ConversationHistoryEntry[] {
    return rounds.flatMap(r => [
      { role: 'user', content: r.userMessage, timestamp: r.timestamp },
      r.assistantOutput ? { role: 'assistant', content: r.assistantOutput, timestamp: r.timestamp } : null,
    ].filter(Boolean));
  }
}
```

**4. 删除 task-result-handler 的保存逻辑**

### 3.4 删除的代码

```
src/core/context/manager.ts
  - formatConversationHistory() → 移到 Agent 层或删除
  - getContextForLLM() → 删除（Agent 直接使用 conversationHistory）
  - formatConversationHistory() → 删除

steps/agents/master-agent.step.ts
  - getContextForLLM 相关调用 → 删除
  - formattedHistory 相关 → 删除

steps/agents/task-result-handler.step.ts
  - 大幅简化，只保留核心保存逻辑
```

### 3.5 不新增的文件

```
❌ src/core/task/hooks/conversation-history-loader.ts   (不需要)
❌ src/core/task/hooks/conversation-history-saver.ts    (不需要)
```

**理由**：对话历史加载在 Agent 层，保存通过事件监听器，不需要额外的 Hook。

## 四、数据流（新架构）

```
用户发送消息 "我叫小明"
    │
    ▼
┌───────────────────────────────────────────────────────┐
│ task-chat-api → emit(agent.task.execute)             │
└───────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────┐
│ master-agent.step.ts                                 │
│ - agent.run("我叫小明", taskId, context)              │
└───────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────┐
│ Agent.run()                                          │
│ - loadConversationHistory() → 从 ContextManager 读取   │
│ - context.conversationHistory = [] (第一次，空的)      │
│ - 执行任务...                                         │
│ - return result                                      │
└───────────────────────────────────────────────────────┘
    │
    ▼ emit(agent.task.completed)
┌───────────────────────────────────────────────────────┐
│ task-result-handler.step.ts                         │
│ - addConversationRound(taskId, round1)                 │
│ - 保存到 task_contexts.conversation_rounds            │
└───────────────────────────────────────────────────────┘

用户发送第二条消息 "我叫什么名字？"
    │
    ▼
┌───────────────────────────────────────────────────────┐
│ Agent.run()                                          │
│ - loadConversationHistory() → 读取到 round1           │
│ - context.conversationHistory = [{                   │
│     role: 'user', content: '我叫小明'                 │
│   }, {role: 'assistant', ...}]                        │
│ - 执行任务时可以使用这个历史                           │
└───────────────────────────────────────────────────────┘
```

## 五、修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/core/context/manager.ts` | 修改 | 删除 getContextForLLM、formatConversationHistory，添加 getConversationHistoryForAgent |
| `src/core/agent/agent.ts` | 修改 | 添加 loadConversationHistory 方法，统一加载历史 |
| `src/core/agent/master-agent.ts` | 修改 | 删除 getContextForLLM 相关，使用 Agent 基类的加载逻辑 |
| `steps/agents/task-result-handler.step.ts` | 修改 | 简化，只保留对话轮次保存逻辑 |
| `src/core/database/postgres-store.ts` | 保持 | addConversationRound 已正确 |
| `messages` 表 | 保留 | 不删除，其他分支可能使用 |

## 六、执行计划

1. **Phase 1: 简化 ContextManager**
   - 删除 getContextForLLM()
   - 删除 formatConversationHistory()
   - 添加 getConversationHistoryForAgent()

2. **Phase 2: Agent 层统一加载**
   - 在 Agent.run() 中添加 loadConversationHistory()
   - 删除 MasterAgent 中的重复逻辑

3. **Phase 3: 简化 task-result-handler**
   - 移除复杂的 artifacts 处理逻辑
   - 只保留核心的 conversationRound 保存

4. **Phase 4: 测试**
   - 单轮对话测试
   - 多轮对话测试

## 七、关键决策

| 决策 | 理由 |
|------|------|
| conversationRounds 作为唯一数据源 | 避免同步问题 |
| Agent 层统一加载历史 | 所有 Agent 自动获得对话能力 |
| 事件驱动保存 | 解耦保存逻辑，Agent 无感知 |
| 保留 messages 表 | 其他分支兼容性 |
