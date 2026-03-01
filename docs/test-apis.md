# 测试接口文档

## 1. 提交任务

> **推荐使用 `/agent/execute`**：有 race condition 保护，参数更丰富

```bash
# POST /agent/execute
curl -X POST http://localhost:5173/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "生成一个视频"}'

# 返回
{
  "success": true,
  "taskId": "task-1234567890-1",
  "sessionId": "session-xxx",
  "message": "Task submitted for execution"
}
```

**可选参数**：
```bash
# 使用 MasterAgent 委托模式
curl -X POST http://localhost:5173/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "生成一个视频",
    "useDelegation": true,
    "subagents": ["code-reviewer", "data-analyst"]
  }'

# 指定 sessionId（多轮对话）
curl -X POST http://localhost:5173/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "我叫小明",
    "sessionId": "my-session-123"
  }'
```

## 2. 查看结果

```bash
# GET /agent/result?id={taskId}
curl "http://localhost:5173/agent/result?id=task-1234567890-1"

# 返回
{
  "result": {
    "taskId": "task-1234567890-1",
    "status": "completed",  // 或 "running" | "failed"
    "output": "...",
    "error": "...",
    "sessionId": "session-xxx",
    "artifacts": [...],
    "structuredOutput": {...}
  }
}
```

## 3. 多轮聊天

```bash
# POST /api/tasks/{taskId}/chat
curl -X POST "http://localhost:5173/api/tasks/task-1234567890-1/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "把视频加上水印",
    "sessionId": "session-xxx"
  }'

# 返回
{
  "success": true,
  "message": "Message sent successfully"
}
```

## 4. 查看 Trace

```bash
# GET /api/tasks/{id}/traces
curl "http://localhost:5173/api/tasks/task-1234567890-1/traces"

# 返回
[
  {
    "id": "trace-xxx",
    "type": "ptc-generation",
    "content": "...",
    "timestamp": "...",
    "metadata": {...}
  }
]
```

## 5. 查看对话上下文

```bash
# GET /api/contexts/{taskId}
curl "http://localhost:5173/api/contexts/task-1234567890-1"

# 返回
{
  "success": true,
  "data": {
    "taskId": "...",
    "sessionId": "...",
    "conversationRounds": [
      {
        "round": 1,
        "userMessage": "生成一个视频",
        "assistantOutput": "...",
        "timestamp": 1234567890,
        "artifacts": [{"type": "video"}]
      }
    ]
  }
}
```

## 测试流程示例

```bash
# 1. 提交任务
TASK=$(curl -s -X POST http://localhost:5173/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "我叫小明"}' | jq -r '.taskId')

echo "Task ID: $TASK"

# 2. 等待并查看结果
sleep 10
curl "http://localhost:5173/agent/result?id=$TASK" | jq '.result.output'

# 3. 查看对话上下文
curl "http://localhost:5173/api/contexts/$TASK" | jq '.data.conversationRounds'

# 4. 多轮对话
SESSION=$(curl -s "http://localhost:5173/api/contexts/$TASK" | jq -r '.data.sessionId')
curl -X POST "http://localhost:5173/api/tasks/$TASK/chat" \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"我叫什么名字？\", \"sessionId\": \"$SESSION\"}"

# 5. 查看更新后的结果和上下文
sleep 10
curl "http://localhost:5173/agent/result?id=$TASK" | jq '.result.output'
curl "http://localhost:5173/api/contexts/$TASK" | jq '.data.conversationRounds'

# 6. 查看 traces
curl "http://localhost:5173/api/tasks/$TASK/traces" | jq '.[0:3]'
```

## 接口说明

| 接口 | 推荐度 | 说明 |
|------|--------|------|
| `/agent/execute` | ✅ 推荐 | 有 race condition 保护，参数丰富，支持委托和直连模式 |
| `/agent/delegate` | ⚠️ 即将废弃 | 功能被 `/agent/execute` 覆盖，无 race condition 保护 |
