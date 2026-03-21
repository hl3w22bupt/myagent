# Soul Agent 唤醒机制详解：时间 vs 事件

## 🎯 核心概念

Soul Agent 支持**两种唤醒方式**：

### 1️⃣ **时间驱动唤醒**（Schedule）
通过 `schedule()` 原语，安排未来某个时间点唤醒

### 2️⃣ **事件驱动唤醒**（External Trigger）
通过外部事件（用户消息、系统事件、webhook 等）触发唤醒

---

## 📊 两种唤醒方式对比

| 特性 | 时间驱动 (schedule) | 事件驱动 (external trigger) |
|------|---------------------|---------------------------|
| **触发条件** | 到达预定时间 | 外部事件发生 |
| **使用原语** | `schedule()` + `hibernate()` | 直接调用 API |
| **典型场景** | 定时问候、周期检查 | 用户消息、webhook、系统事件 |
| **主动性** | Soul 主动"定闹钟" | Soul 被动"被叫醒" |
| **预测性** | 可预测（固定时间） | 不可预测（随时发生） |
| **控制流** | Soul → schedule → hibernate → 唤醒 | 外部事件 → API → 唤醒 → execute |

---

## 🔧 事件驱动唤醒的机制

### 核心流程

```
┌─────────────────────────────────────────────────┐
│  外部事件发生                                     │
│  - 用户发消息                                    │
│  - WebSocket 收到数据                            │
│  - Webhook 被调用                                │
│  - 系统检测到异常                                │
│  - 其他服务推送事件                               │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  触发层（应用代码）                              │
│                                                 │
│  POST /api/soul/:soulId/execute                │
│  {                                              │
│    "userId": "user-123",                         │
│    "context": {                                  │
│      "source": "user_message",                   │
│      "data": {...}                               │
│    }                                             │
│  }                                              │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  SoulScheduler.activateSoul()                   │
│                                                 │
│  1. 检查 Soul 是否已活跃                          │
│     - 已活跃 → 复用实例                           │
│     - 已休眠 → 唤醒实例 (wakeup)                  │
│     - 不存在 → 创建新实例                         │
│                                                 │
│  2. 执行 Soul.execute()                           │
│     - LLM 分析 context 和 goal                    │
│     - LLM 决定行动策略                             │
│     - 执行具体行动（send_message 等）             │
│     - 调用 schedule() 安排下次任务                │
│     - 调用 hibernate() 休眠                         │
└─────────────────────────────────────────────────┘
```

### 关键代码

#### 1. 触发端点（`/api/soul/:soulId/execute`）

```typescript
export const handler = async (request: any, { logger }: any) => {
  const soulId = request.pathParams?.soulId;
  const { userId, trigger_time, context: triggerContext } = request.body;

  const sessionId = `soul-${soulId}-${userId}`;

  // 核心：通过调度器激活 Soul
  const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

  // 执行 Soul
  const result = await soulAgent.execute({
    trigger_time: trigger_time || new Date().toISOString(),
    context: triggerContext
  });

  return { success: true, result };
};
```

#### 2. 调度器激活（`soulScheduler.activateSoul`）

```typescript
async activateSoul(soulId: string, sessionId: string): Promise<SoulAgent> {
  // 检查是否已活跃
  const existingSoul = this.getActiveSoul(sessionId);
  if (existingSoul) {
    console.log(`[SoulScheduler] Soul already active: ${sessionId}`);
    return existingSoul;
  }

  // 检查是否已休眠
  const hibernatedAt = this.hibernatedSouls.get(sessionId);
  if (hibernatedAt) {
    console.log(`[SoulScheduler] Waking up hibernated soul: ${sessionId}`);
    return await this.wakeupSoul(soulId, sessionId);
  }

  // 创建新实例
  return await this.createNewSoul(soulId, sessionId);
}
```

---

## 💡 实际使用场景

### 场景1：用户发消息（最常见）

```javascript
// 前端代码
async function sendMessage(message) {
  await fetch('/api/soul/emotional-girlfriend-lively/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'user-123',
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: {
          message: message,
          timestamp: Date.now()
        }
      }
    })
  });
}

// Soul 收到触发后
// Soul Agent 会：
// 1. 唤醒（如果休眠）
// 2. LLM 分析："用户说'想吃火锅'，我应该..."
// 3. 决定行动：send_message("好啊！我也想吃辣的🌶️")
// 4. 安排后续：schedule({ type: "delay", delay: 3600000 })  // 1小时后关心
// 5. 完成：complete({ result: { action: "respond_to_message" } })
// 6. 休眠：hibernate("等待用户回复")
```

---

### 场景2：WebSocket 推送事件

```javascript
// WebSocket 服务器
socket.on('user:mood:changed', async (data) => {
  const { userId, soulId, mood, confidence } = data;

  // 检测到用户情绪低落
  if (mood === 'sad' && confidence > 0.8) {
    // 触发 Soul Agent
    await fetch(`/api/soul/${soulId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        trigger_time: new Date().toISOString(),
        context: {
          source: 'mood_detection',
          data: {
            type: 'user_mood_change',
            detected_mood: mood,
            confidence: confidence,
            timestamp: Date.now()
          }
        }
      })
    });
  }
});

// Soul Agent 收到事件后
// Soul 会：
// 1. LLM 分析："检测到用户连续3次情绪低落..."
// 2. 决定行动：send_message("感觉你最近心情不太好...")
// 3. schedule({ type: "delay", delay: 7200000 })  // 2小时后关心
// 4. complete({ result: { action: "emotional_support" } })
// 5. hibernate("等待用户回复")
```

---

### 场景3：Webhook 回调

```javascript
// Webhook 处理器
app.post('/webhooks/payment-received', async (req, res) => {
  const { userId, amount, timestamp } = req.body;

  // 用户收到钱（庆祝事件）
  await fetch(`/api/soul/financial-advisor/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: userId,
      trigger_time: new Date(timestamp).toISOString(),
      context: {
        source: 'payment_webhook',
        data: {
          type: 'payment_received',
          amount: amount,
          description: '用户收入'
        }
      }
    })
  });

  res.status(200).json({ received: true });
});

// Soul Agent 收到 webhook 后
// 财务顾问 Soul 会：
// 1. LLM 分析："用户收到钱了，应该..."
// 2. 决定行动：send_notification("恭喜！收到 ¥" + amount)
// 3. schedule({ type: "delay", delay: 86400000 })  // 24小时后关心
// 4. complete({ result: { action: "payment_congratulate" } })
// 5. hibernate("等待用户回复")
```

---

### 场景4：Cron 定时器（混合模式）

```javascript
// Cron 任务
cron.schedule('0 9 * * *', async () => {
  // 每天9点检查活跃用户
  const activeUsers = await database.getActiveUsers(24);

  for (const user of activeUsers) {
    // 触发 Soul 执行
    await fetch(`/api/soul/${user.soulId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        trigger_time: new Date().toISOString(),
        context: {
          source: 'daily_check',
          data: {
            type: 'periodic_check',
            current_hour: 9,
            last_interaction: user.lastInteraction
          }
        }
      })
    });
  }
});

// Soul Agent 收到定时触发后
// 会像正常事件一样执行
```

---

## 🔄 完整的生命周期示例

### 用户一天内的 Soul 交互

```
时间轴：

08:00 ───────────────────────────────────────────
       用户还没醒
       Soul 状态：HIBERNATED

09:00 ───────────────────────────────────────────
       Cron 定时器触发
       context: { source: "daily_check", data: { hour: 9 } }
       ↓
       Soul 唤醒 → execute()
       LLM 判断：早上9点，该问候了
       → send_message("早上好！☀️")
       → schedule(12:00 提醒吃饭)
       → complete()
       → hibernate("等到中午")

12:00 ───────────────────────────────────────────
       schedule 唤醒（自动）
       LLM 判断：中午了
       → send_message("记得吃饭！🍜")
       → schedule(22:00 晚安)
       → complete()
       → hibernate("等到晚上")

14:30 ───────────────────────────────────────────
       👤 用户发消息："今天工作好累..."
       context: { source: "user_message", data: { message: "..." } }
       ↓
       Soul 唤醒 → execute()
       LLM 判断：用户说累了，要关心
       → send_message("辛苦了！要不要休息一下？💪")
       → schedule(18:00 关心)
       → complete()
       → hibernate("等待用户回复")

18:00 ───────────────────────────────────────────
       schedule 唤醒（自动）
       LLM 判断：应该关心一下
       → send_message("现在怎么样了？好点了吗？")
       → complete()
       → hibernate("等待用户回复")

19:00 ───────────────────────────────────────────
       👤 用户回复："好多了，谢谢关心"
       context: { source: "user_message", data: { message: "..." } }
       ↓
       Soul 唤醒 → execute()
       LLM 判断：用户状态好转
       → send_message("太好了！想吃点好吃的庆祝一下吗？🎉")
       → schedule(22:00 晚安)
       → complete()
       → hibernate("等待用户回复")

22:00 ───────────────────────────────────────────
       schedule 唤醒（自动）
       LLM 判断：该晚安了
       → send_message("晚安！做个好梦😴")
       → schedule(明天09:00)
       → complete()
       → hibernate("晚安休息")
```

---

## 🎓 设计模式：事件驱动 + 时间调度

### 实际上是**双模式系统**

```
┌─────────────────────────────────────────────┐
│          Soul Agent 唤醒源                   │
└─────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌────────────────┐    ┌──────────────────┐
│  时间调度器      │    │   事件触发器      │
│  (Cron/Timer)   │    │   (API/Webhook)   │
└────────────────┘    └──────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────┐
│         SoulScheduler.activateSoul()        │
│                                                 │
│  统一的唤醒入口：                             │
│  - 检查活跃状态                               │
│  - 创建/复用 Soul 实例                         │
│  - 调用 soul.execute()                         │
└─────────────────────────────────────────────┘
```

### 关键洞察

**`schedule` 不是唯一的唤醒方式！**

- `schedule()` 只是 Soul **自主安排**下次唤醒的方式
- **外部事件**可以通过 **直接调用 API** 随时唤醒 Soul
- Soul 的休眠/唤醒由 **SoulScheduler** 统一管理

---

## 💡 回答你的问题

> "schedule 都是跟时间有关的，那其他 awake 怎么应对，比如用户来了一句话，其它 channel 发了一条消息过来？"

### 答案：

#### 1. **外部唤醒机制已经存在！**

```typescript
// 任何外部事件都可以通过这个 API 唤醒 Soul
POST /api/soul/:soulId/execute

{
  "userId": "user-123",
  "context": {
    "source": "user_message",           // ← 事件来源
    "data": { message: "..." }     // ← 事件数据
  }
}
```

#### 2. **不需要 awake 原语！**

因为：
- ✅ 外部事件直接调用 API → 自动唤醒
- ✅ `schedule()` 只是 Soul **自己**安排时间的方式
- ✅ SoulScheduler 会管理所有唤醒逻辑

#### 3. **实际的唤醒流程**

```javascript
// 用户发消息
用户 → 前端 → API → SoulScheduler.activateSoul()

// 检测到情绪事件
情绪检测 → Webhook → API → SoulScheduler.activateSoul()

// 定时任务
Cron → API → SoulScheduler.activateSoul()

// 所有路径都汇聚到同一个入口
```

---

## 🚀 实战代码示例

### 示例1：用户消息触发

```typescript
// 前端：聊天界面
async function onUserSend() {
  const message = input.value;

  // 显示用户消息
  addMessageToChat('user', message);

  // 触发 Soul Agent（唤醒 + 执行）
  const response = await fetch('/api/soul/emotional-girlfriend-lively/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'user-123',
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: {
          message: message,
          chatHistory: getRecentMessages()
        }
      }
    })
  }).then(r => r.json());

  // 显示 Soul 回复
  addMessageToChat('assistant', response.result.output);
}
```

### 示例2：情绪检测触发

```typescript
// 后端：情绪检测服务
class EmotionDetectionService {
  async detectMood(text: string) {
    const mood = await this.analyzeSentiment(text);
    return mood;
  }
}

// 当用户发消息时
socket.on('message', async (data) => {
  const { userId, message } = data;

  // 检测情绪
  const mood = await emotionService.detectMood(message);

  // 如果检测到负面情绪，触发 Soul 关心
  if (mood === 'sad' && mood.confidence > 0.8) {
    await fetch(`/api/soul/emotional-girlfriend-lively/execute`, {
      method: 'POST',
      headers: { Content-Type: 'application/json' },
      body: JSON.stringify({
        userId: userId,
        trigger_time: new Date().toISOString(),
        context: {
          source: 'emotion_detection',
          data: {
            type: 'user_mood_change',
            detected_mood: 'sad',
            confidence: mood.confidence,
            original_message: message
          }
        }
      })
    });
  }
});
```

### 示例3：多 Channel 消息整合

```typescript
// 统一的消息处理中心
class MessageRouter {
  async handleIncomingMessage(source: string, data: any) {
    const { userId, soulId } = await this.getUserInfo(userId);

    // 统一的触发格式
    const context = {
      source: source,  // 'wechat', 'slack', 'email', 'sms' 等
      data: {
        channel: source,
        content: data.content,
        timestamp: data.timestamp,
        metadata: data.metadata
      }
    };

    // 统一的唤醒入口
    return await fetch(`/api/soul/${soulId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        trigger_time: new Date().toISOString(),
        context
      })
    });
  }
}

// 使用
const router = new MessageRouter();

// 微信消息
router.handleIncomingMessage('wechat', { content: "你好", ... });

// Slack 消息
router.handleIncomingMessage('slack', { content: "hello", ... });

// Email 消息
router.handleIncomingMessage('email', { content: "Hi", ... });
```

---

## 📝 总结

### 唤醒的完整机制

| 唤醒方式 | 触发者 | 机制 | 使用场景 |
|---------|--------|------|---------|
| **时间调度** | Soul 自己 | `schedule()` → `hibernate()` → 定时器唤醒 | 定时问候、周期检查 |
| **用户消息** | 用户 | API → `activateSoul()` → `execute()` | 聊天互动 |
| **系统事件** | 后端服务 | API → `activateSoul()` → `execute()` | 情绪检测、webhook |
| **定时任务** | Cron | API → `activateSoul()` → `execute()` | 定期检查、批量处理 |

### 为什么不需要 `awake` 原语？

1. ✅ **外部唤醒通过 API** - 不需要原语
2. ✅ **内部调度通过 `schedule`** - 已经覆盖时间场景
3. ✅ **统一的唤醒入口** - `SoulScheduler.activateSoul()`
4. ✅ **自动状态管理** - 检查活跃/休眠状态，自动决定创建/复用/唤醒

### 核心要点

- **`schedule`** 是 Soul **自主**控制时间的唯一方式
- **事件触发** 通过 **外部 API** 实现，不需要原语
- 所有唤醒路径最终都汇聚到 **`activateSoul()`**
- Soul 只需要关心"何时休眠"，不需要关心"如何被唤醒"

这就是为什么只有 3 个原语，但可以处理任何复杂场景的原因！🎉
