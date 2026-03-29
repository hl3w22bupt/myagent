# Soul Agent Task 集成设计

## 📋 概述

Soul Agent 与 myagent task 系统的集成设计：

- **一个 Soul Agent = 一个主 task**
- **所有对话（主动+被动）都在同一个 task 内**
- **Task 创建和执行拆分为独立 API**
- **通过 stream 推送执行状态和主动消息**

---

## 🏗️ 架构设计

### 核心原则

1. **职责分离**：
   - Task = 对话容器
   - Soul Agent = 驱动器（控制何时执行）
   - Trigger = 启动器（用户消息/定时唤醒）

2. **统一对话历史**：
   - 用户主动消息 → 添加到 task 历史中
   - Soul Agent 主动消息 → 也添加到 task 历史中
   - 所有对话连续记录在一个 task 内

3. **分层架构**：
   - myagent（底层）：提供执行能力，向上推送事件
   - MyEcho（上层）：调用 API，订阅 stream，处理业务逻辑

---

## 🔄 数据流

### 1. 初始化流程（MyEcho 创建 Echo 后）

```
MyEcho
  ↓
POST /api/soul/:soulId/initialize
  {
    "userId": "user123",
    "characterId": "emotional-girlfriend-lively",
    "deviceId": "device-abc"
  }
  ↓
myagent: Soul Initialize API
  - 创建空 task（status: 'idle'）
  - 创建 Soul Agent 实例
  - 关联 task 和 Soul
  ↓
返回: { sessionId, taskId, status: 'idle' }
```

### 2. 用户主动发消息

```
用户 → MyEcho → POST /api/chat/send
  ↓
MyEcho: 判断这是 Soul Agent
  ↓
POST /api/soul/:soulId/execute
  {
    "userId": "user123",
    "context": {
      "source": "user_message",
      "data": { "userRequest": "你好" }
    }
  }
  ↓
myagent: Soul Execute API
  - 检测到用户消息
  - 发送到 stream（taskExecution）
  - 触发 agent.task.execute 事件
  ↓
现有 Task 执行流程
  - 在关联的 task 上执行对话
  - 更新对话历史
  - 推送结果到 stream
  ↓
MyEcho 订阅 stream，显示结果
```

### 3. Soul Agent 主动消息

```
时间触发 / 事件触发
  ↓
Soul Agent 唤醒 → execute()
  - LLM 判断：需要主动关心
  - 调用 send_message("早上好！☀️")
  ↓
Soul Execute API
  - 检测到主动消息
  - 添加到 task 对话历史
  - 推送到 stream（taskExecution）
  ↓
MyEcho 订阅 stream
  - 显示主动消息
  - 发送推送通知
```

---

## 📡 API 接口

### 1. 初始化 Soul Agent

**端点**：`POST /api/soul/:soulId/initialize`

**请求**：
```json
{
  "userId": "user123",
  "characterId": "emotional-girlfriend-lively",
  "deviceId": "device-abc",
  "metadata": {}
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "sessionId": "soul-emotional-girlfriend-lively-user123",
    "taskId": "task-soul-emotional-girlfriend-lively-user123",
    "soulId": "emotional-girlfriend-lively",
    "userId": "user123",
    "characterId": "emotional-girlfriend-lively",
    "status": "idle",
    "message": "Soul Agent initialized successfully"
  }
}
```

### 2. 执行 Soul Agent（通用触发）

**端点**：`POST /api/soul/:soulId/execute`

**场景A：用户主动发消息**
```json
{
  "userId": "user123",
  "trigger_time": "2026-03-21T10:00:00Z",
  "context": {
    "source": "user_message",
    "data": {
      "userRequest": "你好",
      "messageId": "msg-xxx"
    }
  }
}
```

**场景B：定时唤醒（主动问候）**
```json
{
  "userId": "user123",
  "trigger_time": "2026-03-21T09:00:00Z",
  "context": {
    "source": "soul_schedule",
    "data": {
      "type": "morning_greeting"
    }
  }
}
```

**场景C：情绪检测触发**
```json
{
  "userId": "user123",
  "trigger_time": "2026-03-21T14:30:00Z",
  "context": {
    "source": "emotion_detection",
    "data": {
      "detectedMood": "sad",
      "confidence": 0.9
    }
  }
}
```

**响应**：
```json
{
  "success": true,
  "sessionId": "soul-emotional-girlfriend-lively-user123",
  "soulId": "emotional-girlfriend-lively",
  "userId": "user123",
  "taskId": "task-soul-emotional-girlfriend-lively-user123",
  "type": "user_message" | "internal_trigger",
  "result": {
    "executed": true,
    "output": {...},
    "proactiveMessages": 0
  }
}
```

---

## 💾 Task 状态管理

### Task 状态转换

```
创建（initialize）
  ↓
idle（空闲，等待 trigger）
  ↓
  ↙ (用户发消息)    ↘ (Soul 主动触发)
  running             running
  ↓                    ↓
idle ←── 执行完成 ──── idle
```

### Task 数据结构

```typescript
{
  id: "task-soul-emotional-girlfriend-lively-user123",
  sessionId: "soul-emotional-girlfriend-lively-user123",
  task: "",  // 初始为空（idle 状态）
  status: "idle" | "running",
  metadata: {
    type: "soul_agent",
    soulId: "emotional-girlfriend-lively",
    userId: "user123",
    characterId: "emotional-girlfriend-lively",
    subagent: "emotional-girlfriend-lively",
    conversationHistory: [
      {
        role: "user",
        content: "你好",
        timestamp: "2026-03-21T10:00:00Z",
        source: "user_message"
      },
      {
        role: "assistant",
        content: "你好呀！今天过得怎么样？😊",
        timestamp: "2026-03-21T10:00:01Z",
        source: "user_chat"
      },
      {
        role: "assistant",
        content: "早上好！今天也是充满活力的一天 ☀️",
        timestamp: "2026-03-21T09:00:00Z",
        source: "soul_agent_proactive",
        triggerSource: "soul_schedule"
      }
    ]
  }
}
```

---

## 🌊 Stream 推送

### taskExecution Stream 事件

**用户消息**：
```typescript
{
  taskId: "task-xxx",
  task: "你好",
  status: "running",
  sessionId: "soul-xxx",
  timestamp: "2026-03-21T10:00:00Z",
  type: "soul",
  stage: "processing",
  progressType: "chat",
  metadata: {
    data: {
      message: "你好",
      sender: "user",
      source: "soul_agent_user_chat"
    }
  }
}
```

**主动消息**：
```typescript
{
  taskId: "task-xxx",
  task: "早上好！今天也是充满活力的一天 ☀️",
  status: "completed",
  sessionId: "soul-xxx",
  timestamp: "2026-03-21T09:00:00Z",
  type: "soul",
  stage: "proactive_message",
  progressType: "soul_proactive",
  metadata: {
    data: {
      message: "早上好！今天也是充满活力的一天 ☀️",
      sender: "assistant",
      source: "soul_agent_proactive",
      triggerSource: "soul_schedule"
    }
  }
}
```

---

## 🔌 MyEcho 集成示例

### 创建 Echo Thread

```typescript
// MyEcho 后端
async function createEchoThread(deviceId, characterId, avatarId) {
  const user = await getUserByDeviceId(deviceId);

  // 1. 调用 Soul Agent 初始化 API
  const initResponse = await fetch(`http://localhost:3000/api/soul/${characterId}/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      characterId: characterId,
      deviceId: deviceId
    })
  }).then(r => r.json());

  if (!initResponse.success) {
    throw new Error(initResponse.error);
  }

  const { sessionId, taskId } = initResponse.data;

  // 2. 保存到 MyEcho 数据库
  const echo = await dataStore.createEcho({
    userId: user.id,
    characterId: characterId,
    avatarId: avatarId,
    sessionId: sessionId,
    taskId: taskId,
    agentType: 'soul'
  });

  // 3. 创建 thread（关联 echo）
  const thread = await dataStore.createThread({
    echoId: echo.id,
    threadId: `thread-${echo.id}`,
    sessionId: sessionId,
    taskId: taskId
  });

  return { echo, thread };
}
```

### 处理用户消息

```typescript
// MyEcho 后端
async function handleUserMessage(message, threadId, deviceId) {
  const thread = await dataStore.getThread(threadId);
  const echo = await dataStore.getEcho(thread.echoId);

  // 调用 Soul Agent 执行 API
  const response = await fetch(`http://localhost:3000/api/soul/${echo.characterId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: echo.userId,
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: {
          userRequest: message
        }
      }
    })
  }).then(r => r.json());

  return response;
}
```

### 订阅 Stream

```typescript
// MyEcho 后端（启动时订阅）
const myagentStream = await connectToMyagentStream();

myagentStream.on('taskExecution', async (event) => {
  const { taskId, type, stage, metadata } = event;

  // 只处理 Soul Agent 的事件
  if (metadata.data.source?.startsWith('soul_agent')) {
    const thread = await dataStore.getThreadByTaskId(taskId);

    if (stage === 'proactive_message') {
      // 主动消息：保存到历史 + 推送 + 发送通知
      await saveMessageToHistory(thread.id, metadata.data.message, 'assistant', {
        source: 'soul_agent_proactive',
        triggerSource: metadata.data.triggerSource
      });

      await pushToWebSocket(thread.id, metadata.data.message);
      await sendPushNotification(thread.userId, metadata.data.message);

    } else if (stage === 'processing') {
      // 用户消息：等待结果（现有流程处理）
      console.log('User message processing, waiting for result...');
    }
  }
});
```

---

## ✅ 实现清单

### 已完成

- ✅ 创建 Soul Agent 初始化 API (`/api/soul/:soulId/initialize`)
- ✅ 修改 SoulAgent 类，添加 taskId 属性
- ✅ 修改 SoulScheduler，添加 createSoul 方法
- ✅ 更新 Soul API (`/api/soul/:soulId/execute`)，支持：
  - 用户消息 → 触发 task 执行
  - 内部触发 → 执行 Soul Agent，处理主动消息
- ✅ 主动消息添加到 task 对话历史
- ✅ 通过 stream 推送主动消息

### 待实现（可选）

- ⏳ 定时任务调度器（实际执行 schedule 的唤醒）
- ⏳ Soul Agent 休眠/唤醒的完整生命周期
- ⏳ 主动消息的推送通知集成

---

## 🎯 设计优势

1. **改动最小**：Task 创建和执行分离，其他逻辑保持不变
2. **向后兼容**：现有 task 执行流程完全保留
3. **分层清晰**：底层不依赖上层，通过 stream 解耦
4. **统一历史**：所有对话在一个 task 内，便于管理
5. **灵活扩展**：可以独立控制和监控 Soul Agent

---

**最后更新**：2026-03-21
