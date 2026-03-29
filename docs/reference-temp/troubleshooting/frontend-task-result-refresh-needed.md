# 前端任务详情页 - Posthook 完成后需要主动刷新 Task Result

**问题ID**: FRONTEND-TASK-REFRESH
**发现日期**: 2026-02-01
**状态**: 待修复
**优先级**: 中

## 问题描述

在任务详情页，当 task hook 中的 posthook 完成后，前端不会自动刷新最新的 task result，需要用户手动刷新页面才能看到更新后的结果。

## 复现步骤

1. 创建一个带有 posthook 的任务
2. 等待任务执行完成
3. 观察 posthook 执行完成后的前端表现
4. 需要手动刷新浏览器页面才能看到最新的 task result

## 预期行为

Posthook 完成后，前端应该自动刷新并显示最新的 task result，无需用户手动刷新页面。

## 实际行为

- Posthook 执行完成
- 前端没有自动更新 task result
- 用户需要手动刷新页面才能看到最新结果

## 影响范围

- 所有使用 task hook 的任务
- 特别是那些 posthook 会修改或补充结果的场景
- 用户体验受影响，需要额外的手动操作

## 相关代码位置

### 前端
- `motia-frontend/src/pages/TaskDetail.jsx` - 任务详情页组件
- `motia-frontend/src/services/api.js` - API 调用服务

### 后端
- `steps/streams/notify-api.step.ts` - API 通知步骤
- `steps/agents/result-logger.step.ts` - 结果记录步骤
- `src/core/agent/hooks/progress-notify.ts` - Agent Hook 进度通知

## 可能的原因

1. **SSE 事件不完整**：Posthook 完成后可能没有发送相应的 SSE 事件通知前端
2. **前端未监听相关事件**：前端可能没有监听 posthook 完成的事件
3. **状态更新时机**：可能在 posthook 完成之前就更新了前端状态

## 建议的解决方案

### 方案1：在 Posthook 完成后发送 SSE 事件

在 posthook 执行完成后，发送一个专门的事件通知前端：

```typescript
// 在 progress-notify.ts 或相关位置
await publishToStream(taskId, {
  type: 'posthook.completed',
  timestamp: Date.now(),
  data: {
    result: finalResult
  }
});
```

### 方案2：前端监听并自动刷新

在 `TaskDetail.jsx` 中添加对 posthook 完成事件的监听：

```javascript
useEffect(() => {
  const eventSource = new EventSource(`/api/tasks/stream/${taskId}`);

  eventSource.addEventListener('posthook.completed', (event) => {
    // 自动刷新 task result
    fetchTaskResult(taskId);
  });

  return () => eventSource.close();
}, [taskId]);
```

### 方案3：使用轮询作为备用方案

如果 SSE 不可靠，可以在 posthook 执行期间使用短间隔轮询：

```javascript
// 在检测到 posthook 开始后
const pollInterval = setInterval(async () => {
  const result = await fetchTaskResult(taskId);
  if (result.posthookCompleted) {
    clearInterval(pollInterval);
    setTaskResult(result);
  }
}, 2000);
```

## 临时解决方案

用户手动刷新浏览器页面（F5 或 Cmd+R）

## 测试计划

1. 创建一个带 posthook 的测试任务
2. 执行任务并观察前端行为
3. 验证 posthook 完成后前端是否自动更新
4. 检查 SSE 事件是否正确发送
5. 测试多轮对话场景下的行为

## 相关 Issue

- 多轮对话中第二轮视频显示问题
- 任务状态更新问题

## 参考资料

- SSE API 文档
- TaskDetail 页面组件代码
- Agent Hook 实现代码

---

**记录人**: Leo
**最后更新**: 2026-02-01
