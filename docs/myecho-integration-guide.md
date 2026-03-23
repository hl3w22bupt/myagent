# MyEcho 集成指南 - Soul Agent API

## 完整工作流程

### 1. 初始化 - 创建 echo 实例

MyEcho 创建新 thread 时调用：

```javascript
POST /api/soul/emotional-girlfriend-lively/initialize
{
  "userId": "user-123",
  "characterId": "char-456",
  "deviceId": "device-789",
  "taskName": "对话",
  "app": "myecho",
  "threadId": "thread-abc"
}

// 响应
{
  "success": true,
  "data": {
    "sessionId": "soul-emotional-girlfriend-lively-user-123-thread-abc",
    "taskId": "task-soul-emotional-girlfriend-lively-user-123-thread-abc",  // ← 保存这个 taskId
    "soulId": "emotional-girlfriend-lively",
    "userId": "user-123",
    "status": "idle"
  }
}
```

**重要：** 保存返回的 `taskId`，后续所有请求都需要使用它。

---

### 2. 用户发送消息

MyEcho 收到用户消息后调用：

```javascript
POST /api/soul/emotional-girlfriend-lively/execute
{
  "userId": "user-123",
  "taskId": "task-soul-emotional-girlfriend-lively-user-123-thread-abc",  // ← 使用 initialize 返回的 taskId
  "context": {
    "source": "api",
    "data": {
      "threadId": "thread-abc",
      "messageId": "msg-xyz",
      "message": {
        "role": "user",
        "content": "你好，我今天工作很累"
      }
    }
  }
}
```

**关键点：**
- ✅ 必须传入 `taskId`（从 initialize 保存的）
- ✅ Soul Agent 会复用已有 task，不会创建新的
- ✅ `messageId` 用于 MyEcho 匹配响应

---

### 3. MyEcho 后端触发主动行为

MyEcho 后端需要 Soul Agent 主动行动时调用：

```javascript
// 场景 A: 定时检查（每 10 分钟）
POST /api/soul/emotional-girlfriend-lively/execute
{
  "userId": "user-123",
  "taskId": "task-soul-emotional-girlfriend-lively-user-123-thread-abc",  // ← 使用相同的 taskId
  "context": {
    "source": "periodic_check",
    "data": {
      "last_interaction": "2026-03-20T09:00:00Z",
      "current_hour": 9
    }
  }
}

// 场景 B: 事件触发（检测到用户情绪低落）
POST /api/soul/emotional-girlfriend-lively/execute
{
  "userId": "user-123",
  "taskId": "task-soul-emotional-girlfriend-lively-user-123-thread-abc",  // ← 使用相同的 taskId
  "context": {
    "source": "event",
    "data": {
      "type": "user_mood_change",
      "event_name": "user_mood_detected",
      "detected_mood": "sad",
      "confidence": 0.85
    }
  }
}
```

**关键点：**
- ✅ 必须传入相同的 `taskId`
- ✅ Soul Agent 会复用已有 task
- ✅ `source` 不同会触发不同的决策逻辑（造单模式）

---

## 方案 C 优势

### 1. 不会误创建新 task

**旧方案（通过 threadId 推导）：**
```javascript
// 如果 threadId 不匹配，会创建新的 task
POST /api/soul/.../execute
{
  "context": {
    "data": {
      "threadId": "thread-abc"  // ← 如果拼错，会创建新 task
    }
  }
}
```

**新方案（直接传 taskId）：**
```javascript
// 直接指定 taskId，不会出错
POST /api/soul/.../execute
{
  "taskId": "task-soul-...",  // ← 明确指定，不会误创建
  "context": {...}
}
```

### 2. 明确的错误提示

```javascript
// 如果 taskId 不存在
{
  "status": 404,
  "body": {
    "success": false,
    "error": "Task not found",
    "taskId": "task-nonexistent"
  }
}
```

### 3. 统一的数据关联

所有请求都使用同一个 taskId：
- ✅ 对话历史正确关联
- ✅ 状态更新一致
- ✅ 不会产生 orphaned tasks

---

## 完整示例代码

```typescript
class MyEchoSoulIntegration {
  private taskId: string | null = null;

  // 1. 初始化
  async initialize(userId: string, threadId: string) {
    const response = await fetch('/api/soul/emotional-girlfriend-lively/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        threadId,
        taskName: '对话',
        app: 'myecho'
      })
    });

    const data = await response.json();
    this.taskId = data.data.taskId;  // ← 保存 taskId
    return data;
  }

  // 2. 用户消息
  async sendMessage(userId: string, message: string, threadId: string) {
    if (!this.taskId) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    const response = await fetch('/api/soul/emotional-girlfriend-lively/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        taskId: this.taskId,  // ← 使用保存的 taskId
        context: {
          source: 'api',
          data: {
            threadId,
            message: {
              role: 'user',
              content: message
            }
          }
        }
      })
    });

    return await response.json();
  }

  // 3. 触发主动行为
  async triggerAutonomousAction(userId: string, triggerSource: string, triggerData: any) {
    if (!this.taskId) {
      throw new Error('Not initialized. Call initialize() first.');
    }

    const response = await fetch('/api/soul/emotional-girlfriend-lively/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        taskId: this.taskId,  // ← 使用保存的 taskId
        context: {
          source: triggerSource,  // 'periodic_check' | 'event' | 'cron'
          data: triggerData
        }
      })
    });

    return await response.json();
  }
}
```

---

## 测试

运行测试脚本：

```bash
bash test-execute-with-taskid.sh
```

---

## 常见问题

### Q: taskId 什么时候会失效？
A: taskId 不会失效，除非：
1. 手动调用 `/api/soul/:soulId/stop` 停止实例
2. 超过 12 小时且状态为 STOPPED（自动清理）

### Q: 可以不传 taskId 吗？
A: 可以，但必须传 `threadId`，系统会通过 threadId 推导 taskId。建议始终传 taskId，更安全。

### Q: 如果 taskId 错了会怎样？
A: 返回 404，不会创建新 task。你需要重新调用 initialize 获取正确的 taskId。

### Q: 不同 thread 可以用同一个 taskId 吗？
A: 不可以。每个 thread 有独立的 taskId 和 sessionId。

---

**创建时间：** 2026-03-22
**版本：** 2.0.0（方案 C）
