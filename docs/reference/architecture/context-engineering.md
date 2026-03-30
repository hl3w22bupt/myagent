# 上下文工程

> Context Engineering: 上下文编排和优化的艺术

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 什么是上下文工程？

**上下文工程 (Context Engineering)** 是 Harness Engineering 的核心组成部分，负责：

1. **理解 Agent 的上下文需求**
2. **从多个数据源获取数据**
3. **智能组装和优化上下文**
4. **从历史中学习和改进**

### 核心问题

> 如何为 Agent 提供最合适的上下文，让它高效完成任务？

---

## 🏗️ 上下文编排层 (Context Orchestration)

### 职责

```
┌─────────────────────────────────────────────────────────┐
│  ContextOrchestrator (编排层)                            │
│                                                          │
│  【输入】Agent 需求 + 当前状态                            │
│  【决策】从哪些数据源获取什么数据                          │
│  【组装】返回格式化的 OrchestratedContext                │
└─────────────────────────────────────────────────────────┘
```

### 数据源

```typescript
interface OrchestratedContext {
  // 1. 对话历史
  history: Array<{ role, content, timestamp }>;

  // 2. 会话变量
  variables: Record<string, any>;

  // 3. 原始任务（多轮对话时）
  originalTask?: string;

  // 4. 用户画像
  userProfile?: UserProfile;

  // 5. 应用特定上下文
  userContext?: any;  // 如 AI 女友的性格设定

  // 6. 环境配置
  environment?: Record<string, any>;

  // 7. 技能执行记录（最近 5 条）
  recentSkillExecutions?: Array<{
    skillName, success, timestamp, error, scenario
  }>;

  // 8. 失败经验（从历史中学习）
  failureExperiences?: FailureExperience[];

  // 9. 知识库（RAG）
  knowledgeCollection?: string;
}
```

---

## 🧠 失败经验系统

### 核心概念

从历史执行中提取教训，让 Agent 避免重复犯错。

### 数据结构

```typescript
interface FailureExperience {
  skillName?: string;          // 相关技能
  toolName?: string;           // 相关工具
  scenario: string;            // 触发场景
  error: string;               // 错误信息
  solution: string;            // 解决方案
  frequency: number;           // 出现频率
  lastOccurred: Date;          // 最后发生时间
}
```

### 工作流程

```
Agent 执行失败
      ↓
提取关键信息
  - 哪个技能/工具
  - 什么场景
  - 什么错误
      ↓
存储到数据库
  (failure_experiences 表)
      ↓
下次相似任务
      ↓
ContextOrchestrator
  检索相关失败经验
      ↓
组装到上下文
  "上次 XXX 场景时，
   用 YYY 方法解决了"
      ↓
Agent 避免
  重复犯错
```

---

## 📚 知识库集成 (RAG)

### 检索策略

```typescript
// 环境变量指定知识库
{
  environment: {
    knowledgeCollection: "python-docs"
  }
}

// ContextOrchestrator
// 1. 检索知识库
// 2. 返回最相关的文档
// 3. 组装到上下文
```

### 上下文组装

```
上下文 = [
  ...对话历史,
  ...失败经验,
  ...知识库检索结果,
  ...用户画像,
  ...环境配置
]
```

---

## 🔄 上下文压缩

### 触发条件

- 对话消息数 > 20 条
- Token 数量超过阈值

### 压缩策略

```typescript
// ContextManager
async compress(sessionId: string) {
  const messages = this.getMessages(sessionId);

  // 保留关键信息
  const compressed = [
    ...messages.slice(0, 5),    // 前 5 条
    ...messages.slice(-5),      // 后 5 条
    // 中间内容摘要为要点
  ];

  this.setMessages(sessionId, compressed);
}
```

---

## 💡 上下文工程最佳实践

### 1. 逐步提供上下文

❌ **不好**: 一次性提供所有上下文

```typescript
// 不推荐
const context = {
  history: all100Messages,
  failureExperiences: all500,
  knowledge: allDocuments
};
```

✅ **好**: 分阶段提供

```typescript
// 推荐
const context = {
  // 核心上下文
  history: last10Messages,

  // 失败经验：只提供相关的
  failureExperiences: filterRelevant(failures, currentTask),

  // 知识库：按需检索
  knowledge: await retrieveRelevant(currentTask)
};
```

### 2. 智能选择数据源

```typescript
// 根据任务类型选择数据源
if (task.includes('代码审查')) {
  return {
    ...context,
    failureExperiences: getRelevantFailures('code-review'),
    userProfile: getUserCodingStyle()
  };
}
```

### 3. 时效性过滤

```typescript
// 失败经验：只保留最近的
const recentFailures = failures.filter(f => {
  const daysSince = (Date.now() - f.lastOccurred.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince < 30;  // 30 天内的
});
```

---

## 🎛️ 配置和调优

### 上下文阈值

```typescript
// config/context.config.yaml
compression:
  threshold: 20              # 触发压缩的消息数
  keep_recent: 5             # 保留最近 N 条
  keep_old: 5                # 保留最早 N 条

failure_experiences:
  max_count: 10              # 最多提供多少条失败经验
  time_window: 30             # 时间窗口（天）
  min_frequency: 2            # 最小出现次数
```

### 数据源优先级

```
1. 对话历史（核心）
2. 失败经验（学习）
3. 知识库（RAG）
4. 用户画像（个性化）
5. 环境配置（上下文）
```

---

## 🔍 调试和监控

### 查看上下文内容

```bash
# 查询任务的上下文
curl http://localhost:3000/api/contexts/{taskId}

# 响应包含完整的 OrchestratedContext
```

### 监控上下文大小

```typescript
// 在 Hook 中记录上下文大小
async onTaskStart(task, taskId, context) {
  const contextSize = JSON.stringify(context).length;
  console.log(`Context size: ${contextSize} bytes`);

  if (contextSize > 10000) {
    console.warn('Context too large, consider compression');
  }
}
```

---

## 📈 优化方向

### 当前局限

1. **静态组装**: 数据源选择逻辑固定
2. **无动态学习**: 失败经验系统未充分利用
3. **缺乏优先级**: 所有数据源同等对待

### 未来优化

1. **智能排序**: 根据任务类型动态调整数据源优先级
2. **强化学习**: 用 RL 模型优化上下文组装策略
3. **个性化**: 根据用户反馈调整上下文偏好
4. **实时压缩**: 流式上下文压缩

---

## 📖 相关文档

- [上下文管理](./context-management.md) - 上下文管理详解
- [Agent 系统](./agent-system.md) - Agent 如何使用上下文
- [失败经验](../guides/advanced-usage/failure-experience.md) - 失败经验系统

---

**版本**: v1.0 | **更新日期**: 2026-03-29
