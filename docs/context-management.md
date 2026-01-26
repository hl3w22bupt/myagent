# 上下文管理系统使用指南

## 概述

上下文管理系统提供了任务级别的对话历史、智能压缩和Artifact跟踪功能。

## 核心组件

### 1. ContextManager

上下文管理器，提供上下文的创建、查询、更新和压缩功能。

```typescript
import { ContextManager } from './src/core/context/manager';
import { getContextStore } from './src/core/database/context-store';

const store = getContextStore();
const manager = new ContextManager(store);

// 创建任务上下文
const context = await manager.createTaskContext('task-1', 'session-1', '创建React组件');

// 添加消息
await manager.addMessage('task-1', {
  id: 'msg-1',
  taskId: 'task-1',
  role: 'user',
  content: '创建一个用户列表组件',
  metadata: { timestamp: new Date(), tokens: 20 },
});

// 获取LLM格式的上下文
const llmContext = await manager.getContextForLLM('task-1');
```

### 2. ContextStore

数据库层，负责上下文的持久化存储。

```typescript
import { ContextStore } from './src/core/database/context-store';

const store = new ContextStore();
await store.initialize();

// 创建上下文
const context = await store.createTaskContext('task-1', 'session-1', '测试');

// 查询上下文
const retrieved = await store.getContext('task-1');

// 添加消息
const updated = await store.addMessage('task-1', message);

// 查询Artifacts
const artifacts = await store.getArtifacts('task-1');
```

### 3. TaskHook集成

通过TaskHook自动管理任务上下文。

```typescript
import { ContextManagerTaskHook } from './src/core/task/hooks/context-manager';

const hook = new ContextManagerTaskHook();

// 在任务执行前自动创建上下文
await hook.preExec(taskContext);

// 在任务执行后自动保存上下文
await hook.postExec(taskContext, result);
```

## 配置

### 环境变量

```bash
# LLM API配置（用于上下文压缩）
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4

# 数据库配置
DB_TYPE=sqlite
# 或
DB_TYPE=postgres
DATABASE_URL=postgresql://localhost:5432/motia
```

### 压缩阈值配置

```typescript
import { ContextCompressor } from './src/core/context/compressor';

const compressor = new ContextCompressor(
  100000,  // maxTokens
  0.8,     // threshold (80%)
  20       // messagesToKeep
);
```

## 使用场景

### 场景1: 简单任务执行

```typescript
// 任务执行时会自动创建和管理上下文
const result = await agent.run('创建一个用户列表组件', 'task-1');

// 查询上下文
const context = await contextManager.getContext('task-1');
console.log('对话轮次:', context.currentTurn);
console.log('总token数:', context.metadata.totalTokens);
```

### 场景2: 多轮对话

```typescript
// 第一轮
await contextManager.addMessage('task-1', {
  id: 'msg-1',
  taskId: 'task-1',
  role: 'user',
  content: '创建一个用户列表组件',
  metadata: { timestamp: new Date(), tokens: 20 },
});

// 第二轮
await contextManager.addMessage('task-1', {
  id: 'msg-2',
  taskId: 'task-1',
  role: 'user',
  content: '添加分页功能',
  metadata: { timestamp: new Date(), tokens: 15 },
});

// 上下文自动累积
const context = await contextManager.getContext('task-1');
console.log('对话轮次:', context.currentTurn); // 2
```

### 场景3: 上下文压缩

```typescript
// 当token数超过阈值时自动压缩
const context = await contextManager.getContext('task-1');

if (context.metadata.lastCompressedAt) {
  console.log('上下文已压缩于:', context.metadata.lastCompressedAt);
  console.log('摘要:', context.summary);
}

// 查看压缩历史
const history = await contextStore.getCompressionHistory('task-1');
for (const record of history) {
  console.log(`压缩率: ${record.compressionRatio * 100}%`);
}
```

## API端点

### 查询任务上下文

```bash
GET /api/contexts/:id
```

响应:
```json
{
  "success": true,
  "data": {
    "taskId": "task-1",
    "sessionId": "session-1",
    "currentTurn": 5,
    "messages": [...],
    "summary": {...},
    "artifactIndex": [...]
  }
}
```

### 查询压缩历史

```bash
GET /api/contexts/:id/compression-history
```

### 查询Artifacts

```bash
GET /api/contexts/:id/artifacts
```

## 最佳实践

1. **及时保存上下文**: 在关键步骤后调用`saveContext()`
2. **合理设置压缩阈值**: 根据实际token消耗调整`maxTokens`和`threshold`
3. **利用Artifact索引**: 通过Artifact跟踪快速定位文件修改
4. **监控压缩质量**: 定期检查压缩历史，确保摘要质量
5. **处理长对话**: 对于超长对话，考虑调整`messagesToKeep`参数

## 故障排查

### 问题: 上下文未自动创建

**解决方案**: 检查TaskHook是否正确注册

```typescript
const hookExecutor = new TaskHookExecutor();
hookExecutor.registerHook(new ContextManagerTaskHook());
```

### 问题: LLM摘要失败

**解决方案**: 检查API密钥配置或网络连接

```typescript
const summarizer = new LLMSummarizer({
  apiKey: process.env.LLM_API_KEY,
  model: 'gpt-4',
});
```

### 问题: 数据库锁定

**解决方案**: 确保每个ContextStore实例正确关闭

```typescript
await store.close();
```
