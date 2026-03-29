# 多轮对话API文档

## 概述

多轮对话API允许用户与Agent进行连续的对话，Agent会记住对话历史并提供上下文相关的回复。

## 核心概念

### Session ID

- **作用**: 标识一个对话会话
- **生成**: 在任务创建时由前端生成UUID v4
- **传递**: 在所有API调用中必须包含相同的sessionId
- **生命周期**: 与任务关联，保存在sessionStorage中

### 对话流程

```
1. 创建任务 (生成sessionId)
   ↓
2. Agent执行任务
   ↓
3. 用户发送聊天消息 (携带sessionId)
   ↓
4. Agent接收消息并回复
   ↓
5. 循环步骤3-4
```

---

## API端点

### 1. 创建任务

#### 端点
`POST /agent/execute`

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| task | string | 是 | 任务描述 |
| sessionId | string | 否 | 会话ID，不传则自动生成 |

#### 请求示例

\`\`\`json
{
  "task": "分析这个React项目的架构",
  "sessionId": "session-abc123"
}
\`\`\`

#### 响应

\`\`\`json
{
  "success": true,
  "taskId": "task-xyz789",
  "sessionId": "session-abc123",
  "output": {
    "result_type": "text",
    "content": {
      "text": "项目架构分析..."
    }
  }
}
\`\`\`

---

### 2. 发送聊天消息

#### 端点
`POST /api/tasks/:id/chat`

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务ID |

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息内容 |
| sessionId | string | 是 | 会话ID，必须与任务创建时的一致 |

#### 请求示例

\`\`\`bash
curl -X POST http://localhost:3000/api/tasks/task-xyz789/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "请详细说明组件结构",
    "sessionId": "session-abc123"
  }'
\`\`\`

#### 响应

\`\`\`json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "taskId": "task-xyz789",
    "message": "请详细说明组件结构",
    "timestamp": "2026-01-27T10:30:00Z"
  }
}
\`\`\`

---

### 3. 获取任务结果

#### 端点
`GET /agent/result`

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务ID |

#### 响应

\`\`\`json
{
  "success": true,
  "result": {
    "taskId": "task-xyz789",
    "task": "分析这个React项目的架构",
    "sessionId": "session-abc123",
    "status": "completed",
    "success": true,
    "output": {...},
    "timestamp": "2026-01-27T10:25:00Z"
  }
}
\`\`\`

---

## WebSocket Stream事件

### 聊天消息事件

Agent的回复会通过`taskExecution` Stream实时推送：

\`\`\`javascript
{
  "progressType": "chat",
  "type": "chat",
  "role": "assistant",
  "content": "这个项目的组件结构如下...",
  "timestamp": "2026-01-27T10:30:05Z"
}
\`\`\`

### Agent进度事件

Agent的关键行动会通过Stream推送：

\`\`\`javascript
{
  "progressType": "step",
  "type": "agent",
  "message": "Agent acquired: master",
  "data": {
    "agentType": "master",
    "conversationLength": 5
  },
  "timestamp": "2026-01-27T10:30:00Z"
}
\`\`\`

---

## 使用示例

### 完整的多轮对话流程

\`\`\`javascript
// 1. 创建任务
const response1 = await fetch('http://localhost:3000/agent/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: '我是一个React专家',
    sessionId: 'session-demo-1'
  })
});
const { taskId } = await response1.json();

// 保存sessionId到sessionStorage
sessionStorage.setItem(`sessionId_${taskId}`, 'session-demo-1');

// 2. 等待任务完成...

// 3. 发送第一条聊天消息
await fetch(`http://localhost:3000/api/tasks/${taskId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '请介绍一下React Hooks',
    sessionId: 'session-demo-1'
  })
});

// 4. Agent回复通过WebSocket Stream推送

// 5. 发送第二条聊天消息
await fetch(`http://localhost:3000/api/tasks/${taskId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '那useEffect呢?',
    sessionId: 'session-demo-1'
  })
});

// Agent会记得之前在讨论React Hooks
\`\`\`

---

## 错误处理

### 常见错误

#### 1. Session ID缺失

\`\`\`json
{
  "success": false,
  "message": "Session ID is required for chat messages"
}
\`\`\`

**解决方案**: 确保在发送聊天消息时包含与任务创建时相同的sessionId。

#### 2. Session不匹配

\`\`\`json
{
  "success": false,
  "message": "Session not found"
}
\`\`\`

**解决方案**: 确保sessionId正确，并且任务尚未被清理。

#### 3. 消息格式错误

\`\`\`json
{
  "success": false,
  "message": "Invalid request body",
  "error": "message must be a string"
}
\`\`\`

**解决方案**: 确保message字段是非空字符串。

---

## 最佳实践

### 1. Session管理

- ✅ 使用UUID v4生成sessionId
- ✅ 将sessionId保存到sessionStorage
- ✅ 在整个对话过程中保持sessionId一致
- ❌ 不要在每次请求中生成新的sessionId

### 2. 错误处理

- ✅ 捕获网络错误并显示用户友好的消息
- ✅ 提供重试机制
- ✅ 记录错误日志用于调试

### 3. UI更新

- ✅ 使用乐观更新立即显示用户消息
- ✅ 通过WebSocket Stream接收Agent回复
- ✅ 显示Agent正在处理的状态指示器

---

## 性能考虑

### 上下文限制

- 最大消息数: 100条（超过会触发压缩）
- Token限制: 100,000 tokens
- 压缩后保留: 最近50条消息 + 摘要

### 建议

- 定期清理过期的session
- 使用上下文压缩减少token使用
- 监控上下文大小避免超出限制

---

## 相关文档

- [Agent Hook系统](/docs/guides/hook-development.md)
- [Context管理器](/docs/design/context-engineering.md)
- [多轮对话设计](/docs/design/multi-turn-conversation-system.md)
