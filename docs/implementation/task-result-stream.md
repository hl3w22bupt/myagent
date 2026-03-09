# Task Result Stream - 实时任务结果推送

## 概述

新的 `taskResult` Stream 实现了任务完成后的实时结果推送。数据格式与 `/agent/result` API **完全一致**。

## 订阅方式

**使用 taskId 订阅特定任务的结果**：

```typescript
// 后端推送
await streams.taskResult.set(taskId, taskId, {...});
//                     ^^^^^^^ groupId  ^^^^^^^ id

// 前端订阅
stream.subscribeGroup('taskResult', taskId);
```

## 工作流程

```
1. Agent 执行完成
   ↓
2. 触发 agent.task.completed 事件
   ↓
3. task-result-handler.step.ts 处理：
   - 解析 unified format result
   - 提取 artifacts（video, code, infographic, etc.）
   - 规范化路径（normalizeArtifactPath）
   - 保存到数据库
   ↓
4. 推送数据到 taskResult stream
   - groupId: taskId
   - id: taskId
   ↓
5. 前端实时接收结果（零延迟）✨
```

## Stream 数据结构

与 `/agent/result` API 返回格式**完全一致**：

```typescript
{
  taskId: string,
  task: string,
  sessionId?: string,
  app?: string,
  success: boolean,
  status: 'completed' | 'failed' | 'awaiting_clarification' | 'timeout',
  output?: string,
  error?: string,
  executionTime?: number,
  structuredOutput?: any,
  metadata?: {
    llmCalls?: number,
    skillCalls?: number,
    totalTokens?: number,
    skillNames?: string[],
    conversationLength?: number,
    executionCount?: number,
    data?: any,
  },
  artifacts?: Array<{
    id: string,
    type: 'video' | 'code' | 'infographic' | 'table' | 'audio' | 'text' | 'image',
    action: 'generated' | 'uploaded' | 'created',
    path: string,
    description?: string,
    metadata?: Record<string, any>,
    timestamp: string, // ISO format
  }>,
  pinned?: boolean,
  timestamp: string, // ISO format
}
```

## 前端使用示例

### 订阅特定任务的结果

```javascript
import { useStream } from '@/contexts/StreamContext';

function TaskDetail({ taskId }) {
  const stream = useStream();
  const [taskData, setTaskData] = useState(null);

  useEffect(() => {
    if (!stream || !taskId) return;

    // 订阅特定任务的结果
    const subscription = stream.subscribeGroup('taskResult', taskId);

    subscription.addChangeListener((data) => {
      console.log('任务结果已更新:', data);
      // ✨ 数据格式与 API 完全相同，直接使用
      setTaskData(data);
    });

    return () => {
      subscription.removeAllListeners();
    };
  }, [taskId]);

  // 使用 taskData 更新 UI
  return <TaskDetailUI task={taskData} />;
}
```

### React 完整示例

```jsx
import { useState, useEffect } from 'react';
import { useStream } from '@/contexts/StreamContext';

export default function TaskDetailPage({ taskId }) {
  const stream = useStream();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!stream || !taskId) return;

    // 1. 先调用 API 获取初始数据（可选）
    fetch(`/agent/result?id=${taskId}`)
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setTask(result.result);
          setLoading(false);
        }
      });

    // 2. 订阅 taskResult stream 实时更新
    const subscription = stream.subscribeGroup('taskResult', taskId);

    subscription.addChangeListener((taskResult) => {
      console.log('实时任务结果:', taskResult);
      // ✨ 直接使用，无需额外处理
      setTask(taskResult);
      setLoading(false);
    });

    return () => {
      subscription.removeAllListeners();
    };
  }, [taskId, stream]);

  if (loading) return <div>加载中...</div>;
  if (!task) return <div>任务未找到</div>;

  return (
    <div>
      <h1>{task.task}</h1>
      <StatusBadge status={task.status} />

      {/* 输出 */}
      {task.output && <pre>{task.output}</pre>}

      {/* Artifacts */}
      {task.artifacts && (
        <div>
          <h2>生成的文件</h2>
          {task.artifacts.map(artifact => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}

      {/* 元数据 */}
      <div>
        <h2>执行信息</h2>
        <p>LLM 调用: {task.metadata?.llmCalls}</p>
        <p>Skill 调用: {task.metadata?.skillCalls}</p>
        <p>Token 数: {task.metadata?.totalTokens}</p>
      </div>
    </div>
  );
}
```

## 优势对比

### 原有方式（轮询 API）

```javascript
// ❌ 需要轮询
setInterval(async () => {
  const result = await api.getTaskDetails(taskId);
  updateUI(result);
}, 2000);  // 每2秒查询一次
```

**缺点**：
- ❌ 延迟高（最多2秒延迟）
- ❌ 浪费资源（重复请求）
- ❌ 服务器压力大

### 新方式（Stream 推送）

```javascript
// ✅ 实时推送
const subscription = stream.subscribeGroup('taskResult', taskId);

subscription.addChangeListener((result) => {
  updateUI(result);  // 立即更新，无延迟
});
```

**优点**：
- ✅ 零延迟（任务完成立即推送）
- ✅ 节省资源（按需推送）
- ✅ 服务器压力小
- ✅ 数据格式与 API 一致（前端无需修改数据处理逻辑）

## 与 taskExecution Stream 的区别

| 特性 | taskExecution Stream | taskResult Stream |
|------|---------------------|-------------------|
| **用途** | 执行过程中的实时更新 | 最终结果推送 |
| **更新频率** | 高（每秒多次） | 低（任务完成时一次） |
| **groupId** | `taskId` | `taskId` |
| **订阅方式** | `subscribeGroup('taskExecution', taskId)` | `subscribeGroup('taskResult', taskId)` |
| **数据内容** | 进度、日志、心跳 | 完整结果、artifacts |
| **与 API 一致性** | - | ✅ 完全一致 |

**同时使用两个 Stream**：

```javascript
// 任务详情页：同时订阅两个 stream

// 1. 订阅执行过程（实时进度、日志）
const executionSub = stream.subscribeGroup('taskExecution', taskId);
executionSub.addChangeListener((data) => {
  updateProgress(data);
});

// 2. 订阅最终结果（完成后）
const resultSub = stream.subscribeGroup('taskResult', taskId);
resultSub.addChangeListener((data) => {
  updateFinalResult(data);
  executionSub.removeAllListeners(); // 取消执行过程订阅
});
```

## 数据一致性保证

### 与 API 的数据一致性

Stream 数据和 API 数据来自**同一个源**（数据库），并且经过**相同的处理逻辑**：

1. **相同的数据库查询**：
   ```typescript
   // API: steps/agents/agent-result.step.ts
   const task = await store.getTask(id);
   const artifacts = await store.getArtifacts(id);

   // Stream: steps/agents/task-result-handler.step.ts
   const finalTask = await store.getTask(taskId);
   const finalArtifacts = await store.getArtifacts(taskId);
   ```

2. **相同的格式化逻辑**：
   ```typescript
   // Artifacts timestamp → ISO string
   const artifactsForStream = finalArtifacts.map((artifact) => ({
     // ...
     timestamp: artifact.timestamp instanceof Date
       ? artifact.timestamp.toISOString()
       : new Date(artifact.timestamp).toISOString(),
   }));
   ```

3. **相同的数据结构**：
   - Schema 定义在 `task-result.stream.ts`
   - 与 API 响应结构完全一致

### 验证方法

```javascript
// 同一个 taskId 的数据应该完全相同
const apiResult = await api.getTaskDetails(taskId);
const streamResult = await getStreamResult(taskId);

console.log(JSON.stringify(apiResult) === JSON.stringify(streamResult));
// true
```

## 错误处理

Stream 推送失败不会影响主流程：

```typescript
// task-result-handler.step.ts
try {
  await streams.taskResult.set(taskId, taskId, {...});
  logger.info('✅ Task result pushed to stream', { taskId });
} catch (error: any) {
  // ❌ Stream 推送失败
  logger.error('Failed to push task result to stream', {
    error: error.message,
    taskId,
  });
  // ✅ 但数据库仍然正常保存，不影响业务逻辑
}
```

## 相关文件

- **Stream 定义**: `steps/streams/task-result.stream.ts`
- **推送逻辑**: `steps/agents/task-result-handler.step.ts` (line 1238-1310)
- **API 实现**: `steps/agents/agent-result.step.ts`
- **前端 API**: `motia-frontend/src/services/api.js`
- **前端示例**: `motia-frontend/src/components/TaskDetailWithStream.jsx`

## 后续改进建议

### 1. 前端缓存优化

```javascript
// 使用 stream 更新缓存
const taskCache = new Map();

const subscription = stream.subscribeGroup('taskResult', taskId);
subscription.addChangeListener((result) => {
  taskCache.set(result.taskId, result);
});

// API 调用时先查缓存
async function getTaskWithCache(taskId) {
  if (taskCache.has(taskId)) {
    return taskCache.get(taskId);
  }
  const result = await api.getTaskDetails(taskId);
  return result;
}
```

### 2. 自动取消订阅

```javascript
// 任务完成后自动取消订阅
const subscription = stream.subscribeGroup('taskResult', taskId);

subscription.addChangeListener((result) => {
  updateUI(result);

  // 如果任务已完成，取消订阅
  if (result.status === 'completed' || result.status === 'failed') {
    subscription.removeAllListeners();
  }
});
```

### 3. 多个任务同时订阅

```javascript
// 任务列表页：订阅多个任务
const taskIds = ['task1', 'task2', 'task3'];
const subscriptions = [];

taskIds.forEach(id => {
  const sub = stream.subscribeGroup('taskResult', id);
  sub.addChangeListener((result) => {
    updateTaskInList(result);
  });
  subscriptions.push(sub);
});

// 清理
return () => {
  subscriptions.forEach(sub => sub.removeAllListeners());
};
```
