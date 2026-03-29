# Context APIs

> 上下文查询相关的 API（8个端点）

**阅读时间**: 5 分钟 | **难度**: ⭐ beginner

---

## ⭐ 核心端点

### GET /api/contexts/:taskId

**描述**: 查询任务的上下文信息

**重要性**: ⭐⭐⭐

```bash
curl http://localhost:3000/api/contexts/task-abc123
```

**响应**:
```json
{
  "taskId": "task-abc123",
  "sessionId": "user-123",
  "messages": [
    {"role": "user", "content": "你好"},
    {"role": "assistant", "content": "你好！"}
  ],
  "status": "completed"
}
```

---

### GET /api/contexts/outputs/:taskId

**描述**: 查询任务的输出结果

**重要性**: ⭐⭐⭐

```bash
curl http://localhost:3000/api/contexts/outputs/task-abc123
```

**响应**:
```json
{
  "taskId": "task-abc123",
  "outputs": [
    {"type": "text", "content": "结果内容"}
  ]
}
```

---

### POST /api/contexts/compression

**描述**: 压缩会话上下文

**重要性**: ⭐⭐

```bash
curl -X POST http://localhost:3000/api/contexts/compression \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user-123"}'
```

---

## 📋 其他端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/contexts/artifacts` | GET | 获取文件 |
| `/api/stream-history` | GET | 流式历史 |
| `/api/sessions` | GET | 获取会话 |
| `/api/favorites` | GET | 收藏列表 |
| `/api/favorites/add` | POST | 添加收藏 |

---

## 📖 相关文档

- [Agent APIs](agent-apis.md) - 执行任务
- [上下文管理](../../architecture/context-management.md) - 上下文原理

---

**版本**: v1.0 | **更新日期**: 2026-03-29
