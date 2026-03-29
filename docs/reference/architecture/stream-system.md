# Motia Stream 数据链路

> 实时流式输出的完整数据流架构

**阅读时间**: 8 分钟 | **难度**: ⭐⭐ intermediate

---

## 🎯 Stream 系统概览

MyAgent 使用 **Motia Stream** 实现实时流式输出，让前端能实时看到 Agent 和 Skill 的执行进度。

### 核心能力

- ✅ **实时进度更新**: Agent 和 Skill 执行状态实时推送
- ✅ **多种通知类型**: step, heartbeat, status, chat
- ✅ **分层追踪**: Task → Agent → Skill 三级追踪
- ✅ **失败经验集成**: 从历史错误中学习

---

## 🔄 完整数据链路

```
┌──────────────────────────────────────────────────────────────┐
│  用户请求 (POST /agent/execute)                              │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Agent API Step (agent-api.step.ts)                         │
│  - 创建 Task                                                 │
│  - 初始化 Stream (taskExecution, executionTraces)           │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Agent 执行层                                                │
│  ┌────────────────────────────────────────────────────┐     │
│  │ AgentProgressNotifyHook (progress-notify.ts)      │     │
│  │  - Agent acquisition (可选)                         │     │
│  │  - Task start                                     │     │
│  │  - Task complete                                   │     │
│  │  - Agent status updates                            │     │
│  └────────────────────────────────────────────────────┘     │
│  ┌────────────────────────────────────────────────────┐     │
│  │ AgentTraceHook (trace-hook.ts)                    │     │
│  │  - 记录 Agent 调用链                               │     │
│  │  - 链接到 Parent Task                              │     │
│  │  - 记录输入输出                                    │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Skill 执行层                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ ProgressNotificationHook (Python)                  │     │
│  │  - pre_exec: 技能开始执行                          │     │
│  │  - post_exec: 技能执行完成                         │     │
│  │  - 发送到 /api/notify                               │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Notify API Step (notify-api.step.ts)                       │
│  - 接收通知请求                                            │
│  - 过滤和格式化消息                                        │
│  - 发送到 Motia Stream                                    │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Motia Stream (taskExecution.stream.ts)                     │
│  - 存储 Stream 数据                                        │
│  - 实时推送到前端                                          │
│  - 支持查询历史                                           │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  前端 (实时订阅)                                             │
│  - SSE / WebSocket 接收                                    │
│  - 展示执行进度                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 数据结构

### 1. TaskExecution Stream

**用途**: 追踪任务执行进度

**数据结构**:
```typescript
interface TaskExecutionEntry {
  taskId: string;
  task: string;           // 用户友好的任务描述
  status: 'running' | 'completed' | 'failed';
  sessionId?: string;
  timestamp: string;
  type: 'agent' | 'skill';
  skill?: string;          // 如果是 skill 类型
  stage: 'pre' | 'processing' | 'post';
  progressType: 'step' | 'heartbeat' | 'status' | 'chat';
  metadata: {
    data?: any;
    callChain?: string;    // Agent 调用链
    subagentName?: string;
  };
}
```

**示例数据**:
```json
{
  "taskId": "task-123",
  "task": "执行 code-analysis",
  "status": "running",
  "sessionId": "user-456",
  "timestamp": "2026-03-29T10:00:00Z",
  "type": "skill",
  "skill": "code-analysis",
  "stage": "processing",
  "progressType": "step",
  "metadata": {
    "callChain": "MasterAgent > code-reviewer",
    "subagentName": "code-reviewer"
  }
}
```

---

### 2. ExecutionTraces Stream

**用途**: 记录详细的执行追踪

**数据结构**:
```typescript
interface ExecutionTraceEntry {
  id: string;
  taskId: string;
  parentId?: string;      // 链接到父任务
  type: 'agent' | 'skill';
  subjectType: string;    // 'Master Agent' | 'Subagent' | 'Skill'
  subjectTitle: string;   // 显示名称
  subjectSubTitle?: string; // 子标题（Subagent 名称）
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  input?: any;
  output?: any;
  error?: string;
  metadata?: {
    subagentName?: string;
    skillName?: string;
    duration?: number;
  };
}
```

---

## 🔌 Stream 接口

### Streams 接口定义

```typescript
interface Streams {
  // 任务执行进度
  taskExecution?: {
    set(
      groupId: string,    // taskId
      id: string,         // unique entry ID
      value: TaskExecutionEntry
    ): Promise<void>;
  };

  // 执行追踪
  executionTraces?: {
    set(
      groupId: string,    // taskId
      id: string,         // trace entry ID
      data: ExecutionTraceEntry
    ): Promise<any>;
  };
}
```

---

## 📡 通知类型

### 1. step 通知

**用途**: Skill 执行步骤日志

**触发**: Skill 执行过程中的日志输出

**示例**:
```json
{
  "taskId": "task-123",
  "type": "step",
  "timestamp": 1700000000,
  "skill": "code-analysis",
  "stage": "processing",
  "message": "开始分析代码..."
}
```

**注意**: DEBUG 日志会被自动过滤，避免噪音。

---

### 2. status 通知

**用途**: 状态变化通知

**触发**: Agent/Skill 状态变化

**示例**:
```json
{
  "taskId": "task-123",
  "type": "status",
  "stage": "pre",
  "data": {
    "status": "acquired"
  }
}
```

---

### 3. heartbeat 通知

**用途**: 心跳信号，表示系统活跃

**触发**: 定时发送（避免超时）

---

### 4. chat 通知

**用途**: 聊天消息

**触发**: Soul Agent 主动发送消息

---

## 🎯 使用场景

### 场景 1: 监控 Agent 执行

```typescript
// AgentProgressNotifyHook
await streams.taskExecution.set(taskId, id, {
  taskId,
  task: "审查代码",
  status: 'running',
  type: 'agent',
  stage: 'pre',
  progressType: 'status',
  metadata: {
    subagentName: 'code-reviewer'
  }
});
```

### 场景 2: 追踪 Skill 执行

```python
# ProgressNotificationHook (Python)
await self._send_notification(context, 'step', {
    'message': '开始分析代码...'
})
```

### 场景 3: 链式调用追踪

```
MasterAgent (parent: task-123)
  ├─ code-reviewer (parent: task-123)
  │   └─ code-analysis (parent: task-123, callChain: MasterAgent > code-reviewer)
  └─ security-auditor (parent: task-123)
```

---

## ⚙️ 配置和优化

### 1. 禁用不必要的通知

```typescript
// AgentProgressNotifyHook 配置
{
  notifyOnAcquire: false,  // 禁用 Agent 获取通知（避免重复）
  notifyOnTaskStart: true,
  notifyOnTaskComplete: true,
  notifyOnStatusCheck: false
}
```

### 2. 过滤噪音

```typescript
// notify-api.step.ts 中自动过滤
// - 过滤 DEBUG 日志
// - 过滤重复的状态
// - 只保留用户友好的信息
```

### 3. 性能考虑

- **批量写入**: 避免频繁的 Redis 写入
- **异步发送**: 不阻塞主流程
- **失败静默**: Hook 失败不影响执行

---

## 🔧 开发指南

### 发送自定义通知

```typescript
// 获取 streams
const streams = getAgentStreams();

// 发送通知
await streams.taskExecution.set(taskId, id, {
  taskId,
  task: "自定义任务描述",
  status: 'running',
  type: 'skill',
  skill: 'my-skill',
  stage: 'processing',
  progressType: 'step'
});
```

### 监听 Stream 数据

```typescript
// 前端订阅 Stream
const stream = streams.taskExecution.observe(taskId);

stream.on('data', (entry) => {
  console.log('Progress update:', entry);
});
```

---

## 📖 相关文档

- [Hooks 详解](./hooks-guide.md) - Hook 系统详解
- [Agent 系统](./agent-system.md) - Agent 执行流程
- [Progress Notification](../api/http-api/streaming-apis.md) - Stream APIs

---

**版本**: v1.0 | **更新日期**: 2026-03-29
