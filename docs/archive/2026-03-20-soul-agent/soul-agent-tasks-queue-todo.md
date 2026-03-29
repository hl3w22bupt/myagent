# Soul Agent 任务队列优化 - TODO

**创建时间**：2026-03-22
**优先级**：P2（后续优化）
**状态**：待实现

---

## 背景问题

### 当前问题

当 Soul Agent 正在执行任务时，如果定时检查再次触发，会：
- **当前实现**：跳过（丢弃任务）
- **问题**：可能丢失重要的定时任务

### 期望行为

- **定时任务**：如果正在运行，应该排队等待
- **API 消息**：优先处理，取消正在运行的定时任务

---

## 设计方案

### 1. 数据库扩展

```sql
-- 在 soul_states 表添加队列字段
ALTER TABLE soul_states ADD COLUMN pending_tasks JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN soul_states.pending_tasks IS '待执行的任务队列（定时任务）';
```

**队列数据结构**：
```json
{
  "pending_tasks": [
    {
      "id": "task-123",
      "trigger_time": "2026-03-22T10:10:00Z",
      "context": {
        "source": "periodic_check",
        "data": { ... }
      },
      "queued_at": 1711234567890
    }
  ]
}
```

### 2. 核心逻辑

#### 定期检查（每 10 分钟）

```typescript
if (soulState.status === 'ACTIVE' && soulState.current_task_id) {
  // 正在运行，加入队列
  await dataStore.addPendingTask(sessionId, newTask);
} else {
  // 空闲，直接执行
  await emit({ topic: 'soul.agent.execute', data: {...} });
}
```

#### 任务完成后处理队列

```typescript
private async processPendingQueue(): Promise<void> {
  const pendingTasks = await getPendingTasks(sessionId);

  if (pendingTasks.length === 0) {
    await hibernate('任务完成');
    return;
  }

  // FIFO：取出第一个任务
  const nextTask = pendingTasks[0];
  await updatePendingTasks(sessionId, pendingTasks.slice(1));

  // 递归执行
  await this.execute(nextTask);
}
```

#### API 消息优先

```typescript
// 用户消息：清空队列，优先处理
if (soulState.status === 'ACTIVE' && soulState.current_task_id) {
  // 1. 取消当前任务
  await dataStore.updateTask(currentTaskId, { status: 'cancelled' });

  // 2. 清空队列
  await dataStore.clearPendingTasks(sessionId);
}

// 执行用户消息
await emit({ topic: 'soul.agent.execute', data: {...} });
}
```

### 3. 数据库辅助方法

需要添加以下方法到 `SoulDataService`：

- `addPendingTask(sessionId, task)` - 添加任务到队列
- `updatePendingTasks(sessionId, tasks)` - 更新队列
- `clearPendingTasks(sessionId)` - 清空队列
- `getPendingTasks(sessionId)` - 获取队列

### 4. 去重逻辑

避免相同的定时任务重复排队：

```typescript
// 判断是否重复（相同 source 和时间段）
const isDuplicate = pendingTasks.some(t =>
  t.context.source === task.context.source &&
  new Date(t.trigger_time).getHours() === new Date(task.trigger_time).getHours()
);

if (isDuplicate) {
  return; // 跳过
}
```

---

## 实现步骤

1. ✅ 数据库 migration（添加 `pending_tasks` 字段）
2. ✅ 扩展 `SoulDataService` 添加队列相关方法
3. ✅ 更新 `soul-periodic-check` cron step（排队逻辑）
4. ✅ 更新 `SoulAgent.execute()`（处理队列）
5. ✅ 更新 `soul-api` step（清空队列，优先处理）
6. ✅ 添加单元测试
7. ✅ 更新文档

---

## 复杂度评估

| 方面 | 复杂度 | 说明 |
|-----|--------|------|
| **数据结构** | ⭐ 低 | 就是一个 JSON 字段 |
| **持久化** | ⭐ 低 | 自动保存到数据库，服务重启不丢失 |
| **队列消费** | ⭐⭐ 中 | 任务完成后检查队列，递归执行 |
| **优先级处理** | ⭐ 低 | API 消息清空队列即可 |
| **去重** | ⭐ 低 | 简单的时间段判断 |
| **状态管理** | ⭐ 低 | 复用现有的状态字段 |

**总体复杂度：⭐⭐ 中低**

**代码量预估**：100-150 行

---

## 流程示例

### 场景 1：定时任务排队

```
10:00 - 定时检查触发 → Soul-A 判断需要行动 → 开始执行
10:10 - 定时检查触发 → Soul-A 还在运行 → 加入队列 [task-2]
10:20 - 定时检查触发 → Soul-A 还在运行 → 加入队列 [task-2, task-3]
10:25 - task-1 完成 → 从队列取出 task-2 → 执行
10:35 - task-2 完成 → 从队列取出 task-3 → 执行
10:40 - 定时检查触发 → Soul-A 空闲 → 直接执行新任务
```

### 场景 2：用户消息优先

```
10:00 - 定时检查触发 → Soul-A 判断需要行动 → 开始执行
10:05 - 用户发送消息 → 取消当前任务 → 清空队列 → 执行用户消息
10:06 - 用户消息完成 → 休眠
10:10 - 定时检查触发 → Soul-A 空闲 → 直接执行
```

---

## 相关文档

- [Soul Prompt 设计改进方案](./soul-prompt-design.md)
- [自主 Agent 设计文档](./autonomous-agent-design.md)

---

**最后更新**：2026-03-22
