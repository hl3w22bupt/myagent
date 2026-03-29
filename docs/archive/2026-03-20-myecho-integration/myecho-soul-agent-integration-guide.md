# MyEcho + Soul Agent 集成指南

## 概述

本文档说明如何在 MyEcho 中集成 Soul Agent 功能，使其支持主动式 AI 伴侣。

## 架构设计

### 核心概念

1. **Soul Agent**：自主式 AI Agent，可以主动发起对话
2. **MyEcho**：上层应用，管理用户、Echo、Thread
3. **myagent**：底层平台，提供 Soul Agent 执行能力

### 集成流程

```
MyEcho                     myagent
  |                          |
  | 1. 创建 Echo             |
  |------------------------->| POST /api/soul/:soulId/initialize
  |                          |   - 创建 idle task
  |                          |   - 激活 Soul Agent
  |  返回 sessionId, taskId  |
  |<-------------------------|
  |                          |
  | 2. 用户发消息            |
  |------------------------->| POST /api/soul/:soulId/execute
  |                          |   - source: user_message
  |  返回 AI 响应           |
  |<-------------------------|
  |                          |
  | 3. 订阅 stream           |
  |<========================>| taskExecution stream
  |                          |   - 接收主动消息
  |                          |   - 接收状态更新
```

## 实现步骤

### 步骤 1：数据库扩展

在 MyEcho 数据库中添加 Soul Agent 相关字段：

```sql
-- 在 echoes 表中添加字段
ALTER TABLE echoes ADD COLUMN IF NOT EXISTS agent_type VARCHAR(50) DEFAULT 'regular';
ALTER TABLE echoes ADD COLUMN IF NOT EXISTS soul_session_id VARCHAR(255);
ALTER TABLE echoes ADD COLUMN IF NOT EXISTS soul_task_id VARCHAR(255);

-- 在 threads 表中添加字段
ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_soul_thread BOOLEAN DEFAULT FALSE;
```

### 步骤 2：修改 echo-create API

**文件**：`/Users/leo/workspace/myecho-backend/nodejs/src/steps/api/echo-create.step.ts`

```typescript
export const handler = async (request: any, { logger, streams }: any) => {
  // ... 现有代码 ...

  const dataStore = createDataStore();
  await dataStore.initialize();

  // Get or create user
  let user = await dataStore.getUserByDeviceId(deviceId);
  if (!user) {
    user = await dataStore.createUser(deviceId);
  }

  // Validate character exists
  const character = await dataStore.getCharacter(characterId);
  if (!character) {
    return { status: 400, body: { success: false, message: 'Character not found' } };
  }

  // 判断是否是 Soul Agent
  const isSoulAgent = character.type === 'soul' || characterId.startsWith('emotional-');

  let echo;
  if (isSoulAgent) {
    // ===== Soul Agent 集成 =====
    logger.info('Echo Create API: Creating Soul Agent', { characterId });

    // 1. 调用 myagent 初始化 API
    const myagentUrl = `${process.env.MYAGENT_API_URL || 'http://localhost:3000'}/api/soul/${characterId}/initialize`;
    const initResponse = await axios.post(myagentUrl, {
      userId: user.id,
      characterId: characterId,
      deviceId: deviceId
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (!initResponse.data.success) {
      throw new Error(`Failed to initialize Soul Agent: ${initResponse.data.error}`);
    }

    const { sessionId, taskId } = initResponse.data.data;

    logger.info('Echo Create API: Soul Agent initialized', { sessionId, taskId });

    // 2. 创建 echo（保存 Soul Agent 信息）
    echo = await dataStore.createEcho({
      userId: user.id,
      characterId: characterId,
      avatarId: avatarId,
      customName: customName,
      agentType: 'soul',
      soulSessionId: sessionId,
      soulTaskId: taskId
    });

    logger.info('Echo Create API: Soul Echo created', {
      echoId: echo.id,
      sessionId,
      taskId
    });

  } else {
    // ===== 普通 Agent（现有逻辑）=====
    echo = await dataStore.getOrCreateEcho(user.id, characterId, avatarId);
  }

  // ... 推送 stream 等 ...

  return {
    status: 200,
    body: { success: true, data: echo }
  };
};
```

### 步骤 3：修改 chat-send API

**文件**：`/Users/leo/workspace/myecho-backend/nodejs/src/steps/api/chat-send.step.ts`

```typescript
export const handler = async (request: any, { logger, streams }: any) => {
  // ... 现有验证逻辑 ...

  const dataStore = createDataStore();
  await dataStore.initialize();

  // Verify thread exists
  const thread = await dataStore.getThread(threadId);
  if (!thread) {
    return { status: 404, body: { success: false, message: 'Thread not found' } };
  }

  // 获取 echo 判断是否是 Soul Agent
  const echo = await dataStore.getEchoByThreadId(threadId);
  const isSoulAgent = echo?.agentType === 'soul';

  // Save user message
  const userMessage = await dataStore.createMessage(threadId, 'user', message);

  // Push to stream
  await streams.messageStream.set(deviceId, userMessage.id, { /* ... */ });

  // Call myagent API
  try {
    let myagentUrl: string;
    let requestBody: any;

    if (isSoulAgent) {
      // ===== Soul Agent 执行 =====
      logger.info('Chat Send API: Using Soul Agent', {
        echoId: echo.id,
        soulSessionId: echo.soulSessionId
      });

      myagentUrl = `${MYAGENT_API_URL}/api/soul/${echo.characterId}/execute`;
      requestBody = {
        userId: user.id,
        trigger_time: new Date().toISOString(),
        context: {
          source: 'user_message',
          data: {
            userRequest: message,
            messageId: userMessage.id,
            threadId: threadId
          }
        }
      };

    } else {
      // ===== 普通 Agent（现有逻辑）=====
      const hasActiveTask = thread.myagentSessionId && thread.myagentSessionId.trim() !== '';
      const useChatApi = hasActiveTask;

      if (useChatApi) {
        myagentUrl = `${MYAGENT_API_URL}/api/tasks/${thread.myagentSessionId}/chat`;
        requestBody = { /* 现有代码 */ };
      } else {
        myagentUrl = `${MYAGENT_API_URL}/agent/execute`;
        requestBody = { /* 现有代码 */ };
      }
    }

    const response = await axios.post(myagentUrl, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    // ... 处理响应 ...

  } catch (error: any) {
    logger.error('Chat Send API: myagent request failed', { error: error.message });
    // ... 错误处理 ...
  }

  return { status: 200, body: { success: true } };
};
```

### 步骤 4：订阅 Soul Agent Stream（可选）

如果需要接收 Soul Agent 的主动消息，可以在 MyEcho 中订阅 myagent 的 stream：

**文件**：新建 `/Users/leo/workspace/myecho-backend/nodejs/src/steps/soul-stream-subscriber.step.ts`

```typescript
import { StepConfig } from 'motia';
import { createDataStore } from '../core/database/data-store-factory.js';
import axios from 'axios';

const MYAGENT_WS_URL = process.env.MYAGENT_WS_URL || 'ws://localhost:3000';

export const config: StepConfig = {
  name: 'soul-stream-subscriber',
  description: 'Subscribe to Soul Agent stream for proactive messages',
  triggers: [],
  enqueues: [],
  virtualSubscribes: [],
  flows: ['background'],
};

export const handler = async (_event: any, { logger }: any) => {
  logger.info('Soul Stream Subscriber: Starting...');

  // 订阅 myagent 的 taskExecution stream
  const wsUrl = `${MYAGENT_WS_URL}/stream/taskExecution`;
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    logger.info('Soul Stream Subscriber: Connected to myagent stream');
  });

  ws.on('message', async (data: string) => {
    try {
      const event = JSON.parse(data);

      // 只处理 Soul Agent 事件
      if (event.metadata?.data?.source?.startsWith('soul_agent')) {
        logger.info('Soul Stream Subscriber: Received Soul event', {
          taskId: event.taskId,
          stage: event.stage
        });

        // 根据 sessionId 查找对应的 echo
        const dataStore = createDataStore();
        await dataStore.initialize();

        const echo = await dataStore.getEchoBySoulSessionId(event.sessionId);
        if (!echo) {
          logger.warn('Soul Stream Subscriber: Echo not found for session', {
            sessionId: event.sessionId
          });
          return;
        }

        if (event.stage === 'proactive_message') {
          // 主动消息：保存到数据库 + 推送到前端
          const message = event.metadata.data.message;

          await dataStore.createMessage(
            echo.thread_id,
            'assistant',
            message,
            { source: 'soul_agent_proactive' }
          );

          // 推送到前端 WebSocket
          // await streams.messageStream.set(...)

          logger.info('Soul Stream Subscriber: Proactive message processed', {
            echoId: echo.id,
            message: message.substring(0, 50)
          });
        }
      }
    } catch (error: any) {
      logger.error('Soul Stream Subscriber: Failed to process message', {
        error: error.message
      });
    }
  });

  ws.on('error', (error: any) => {
    logger.error('Soul Stream Subscriber: WebSocket error', { error: error.message });
  });

  ws.on('close', () => {
    logger.warn('Soul Stream Subscriber: Connection closed, reconnecting...');
    // 实现重连逻辑
    setTimeout(() => {
      // 重新启动 subscriber
    }, 5000);
  });

  // 保持连接
  return new Promise(() => {});
};
```

## 测试验证

### 1. 单元测试

测试初始化 API：

```bash
curl -X POST "http://localhost:3000/api/soul/emotional-girlfriend-lively/initialize" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "characterId": "emotional-girlfriend-lively",
    "deviceId": "device-test-001"
  }'
```

预期响应：
```json
{
  "success": true,
  "data": {
    "sessionId": "soul-emotional-girlfriend-lively-test-user-001",
    "taskId": "task-soul-emotional-girlfriend-lively-test-user-001",
    "status": "idle"
  }
}
```

### 2. 集成测试

测试完整流程：

```bash
# 运行集成测试脚本
./test-myecho-integration.sh
```

### 3. 端到端测试

1. 启动 MyEcho 服务
2. 通过 MyEcho API 创建 Echo（Soul Agent）
3. 发送消息
4. 验证响应
5. 触发主动消息（schedule）

## 配置说明

### MyEcho .env 配置

```bash
# myagent API 配置
MYAGENT_API_URL=http://localhost:3000
MYAGENT_WS_URL=ws://localhost:3000

# MyEcho 服务配置
PORT=3001
DATABASE_URI=postgresql://leo@localhost:5432/myecho_ai
```

### Character 配置

标记 character 为 Soul Agent：

```sql
-- 方法1：通过 character type
UPDATE characters SET type = 'soul' WHERE id = 'emotional-girlfriend-lively';

-- 方法2：通过命名约定（代码中判断）
-- characterId 以 'emotional-' 开头的自动识别为 Soul Agent
```

## 故障排查

### 问题1：初始化失败

**症状**：`Failed to initialize Soul Agent`

**检查**：
- myagent 服务是否运行：`curl http://localhost:3000/health`
- 网络连接：`curl http://localhost:3000/api/soul/emotional-girlfriend-lively/initialize`
- 数据库约束：确认 `idle` 状态已添加到 tasks 表

### 问题2：执行超时

**症状**：`timeout of 60000ms exceeded`

**解决**：
- 增加超时时间
- 检查 LLM API 响应时间
- 检查网络延迟

### 问题3：Stream 订阅失败

**症状**：收不到主动消息

**检查**：
- WebSocket 连接是否建立
- myagent stream 是否正确推送
- sessionId 是否匹配

## 性能优化

### 1. 连接池

复用 HTTP 连接：

```typescript
import axios from 'axios';

const myagentClient = axios.create({
  baseURL: process.env.MYAGENT_API_URL,
  timeout: 60000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});
```

### 2. 批量处理

对于批量触发，合并请求：

```typescript
// 批量初始化多个 Soul Agent
const initPromises = characters.map(character =>
  myagentClient.post(`/api/soul/${character.id}/initialize`, {...})
);

await Promise.all(initPromises);
```

### 3. 缓存

缓存 Soul Agent 实例状态：

```typescript
const soulAgentCache = new Map();

function getSoulAgent(sessionId: string) {
  if (soulAgentCache.has(sessionId)) {
    return soulAgentCache.get(sessionId);
  }
  // 从数据库加载
}
```

## 总结

本集成方案提供了：

✅ **最小侵入**：MyEcho 主要代码保持不变，通过判断 agentType 分流
✅ **向后兼容**：现有普通 Agent 完全不受影响
✅ **渐进增强**：可以逐步添加功能，先实现基本对话，再添加主动消息
✅ **清晰分层**：MyEcho（应用层）← myagent（平台层）← Soul Agent（执行层）

**实施建议**：
1. 先实现 echo-create 集成（初始化）
2. 再实现 chat-send 集成（消息发送）
3. 最后实现 stream 订阅（主动消息）
4. 每一步都进行充分测试

---

**最后更新**：2026-03-21
