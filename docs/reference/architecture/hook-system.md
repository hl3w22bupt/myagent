# Hook 系统

> Agent 生命周期扩展：在特定时机插入自定义逻辑

**阅读时间**: 5 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🔌 什么是 Hook？

Hook 允许你在 Agent 生命周期的特定时机插入自定义逻辑。

---

## 🎯 Hook 类型

### 1. Agent Hook

在 Agent 生命周期触发：

```typescript
interface AgentHook {
  // Agent 创建前
  beforeCreate?(config: AgentConfig): Promise<void>

  // Agent 创建后
  afterCreate?(agent: Agent): Promise<void>

  // 任务执行前
  beforeExecute?(task: string): Promise<void>

  // 任务执行后
  afterExecute?(result: AgentResult): Promise<void>
}
```

### 2. Task Hook

在 Task 生命周期触发：

```typescript
interface TaskHook {
  // Task 创建前
  beforeCreate?(task: TaskInput): Promise<void>

  // Task 完成后
  afterComplete?(task: Task, result: any): Promise<void>

  // Task 失败时
  onFailure?(task: Task, error: Error): Promise<void>
}
```

### 3. Skill Hook

在 Skill 执行时触发：

```typescript
interface SkillHook {
  // Skill 执行前
  beforeExecute?(skill: string, params: any): Promise<void>

  // Skill 执行后
  afterExecute?(skill: string, result: any): Promise<void>
}
```

---

## 💡 Hook 使用场景

### 日志记录

```typescript
// 记录所有 Agent 执行
export const loggerHook: AgentHook = {
  async beforeExecute(task) {
    console.log(`[Agent] 开始执行: ${task}`);
  },
  async afterExecute(result) {
    console.log(`[Agent] 执行完成:`, result);
  },
};
```

### 性能监控

```typescript
// 监控执行时间
export const perfHook: AgentHook = {
  async beforeExecute(task) {
    this.startTime = Date.now();
  },
  async afterExecute(result) {
    const duration = Date.now() - this.startTime;
    metrics.record('agent.duration', duration);
  },
};
```

### 自定义验证

```typescript
// 验证任务内容
export const validationHook: AgentHook = {
  async beforeExecute(task) {
    if (!isSafe(task)) {
      throw new Error('任务不安全');
    }
  },
};
```

---

## 🚀 开发 Hook

### 1. 创建 Hook

```typescript
// hooks/my-hook.ts
export const myHook: AgentHook = {
  async beforeExecute(task) {
    // 自定义逻辑
  },
};
```

### 2. 注册 Hook

```typescript
// config/hooks.config.ts
export const hooks = [
  {
    type: 'agent',
    hook: myHook,
  },
];
```

### 3. 启用 Hook

```typescript
// 在 Agent 配置中启用
const agent = new Agent({
  ...config,
  hooks: [myHook],
});
```

---

## 🔄 HITL (Human-in-the-Loop) Hook

### 概述

HITL 机制在 Agent 需要用户澄清时触发，用于暂停执行、等待用户输入、然后继续。

### 触发位置

| Agent 类型 | 触发时机 | 检测方式 |
|-----------|---------|---------|
| 内置 Agent | 意图分析后，置信度 < 0.7 | LLM 判断 `needs_clarification` |
| ExternalAgent | 外部 Agent 输出包含提问 | `detectQuestionInOutput()` 字符串模式匹配 |

### HITL 状态

```typescript
interface HITLState {
  stage: 'pre_intent' | 'post_intent' | 'in_execution';
  status: 'awaiting' | 'completed';
  agentName?: string;
  question?: string;
  options?: string[];
  response?: {
    content: string;
    feedback?: string;
    timestamp: Date;
  };
  resolvedBy?: 'human' | 'timeout';  // 解决方式
  resolvedAt?: Date;                  // 解决时间
  createdAt: Date;
}
```

### `resolvedBy` 字段

HITL 状态完成后记录解决方式：

| 值 | 说明 | 前端展示 |
|----|------|---------|
| `human` | 用户通过 UI 提交了澄清回复 | 绿色卡片"已收到澄清回复" |
| `timeout` | 轮询超时（10 分钟），自动继续 | 灰色卡片"超时自动继续" |

### 流程

```
Agent 执行
    ↓
检测到需要澄清（低置信度 / 外部 Agent 提问）
    ↓
saveHITLState() → status: 'awaiting'
    ↓
触发 onAwaitingHITL Hook（webhook 通知）
    ↓
pollHITLResult()（轮询等待，最多 10 分钟）
    ↓
resolveHITLState(resolvedBy) → status: 'completed'
    ↓
继续执行 / 超时自动继续
```

### 前端状态映射

| hitlState.status | hitlState.resolvedBy | 卡片颜色 | 说明 |
|-----------------|---------------------|---------|------|
| `awaiting` | - | 橙色 | 等待用户回复 |
| `completed` | `human` | 绿色 | 已收到用户回复 |
| `completed` | `timeout` | 灰色 | 超时自动继续 |

---

## 📖 相关文档

- [Agent 系统](agent-system.md) - Agent 生命周期
- [External Agent](external-agent.md) - 外部 Agent HITL 检测
- [Workspace 和 Artifacts](workspace-artifacts.md) - 产物系统
- [插件开发](../api/plugin-api/README.md) - 开发自定义插件

---

**版本**: v1.1 | **更新日期**: 2026-04-11
