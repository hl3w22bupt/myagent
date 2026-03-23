# Soul Agent 使用示例

## 概述

本文档展示如何使用 Soul Agent 的触发器系统来实现自主行为。

## 架构

```
上层应用触发器
    ↓
API: /api/soul/:soulId/execute
    ↓
SoulScheduler.activateSoul()
    ↓
SoulAgent.execute(input)
    ↓
LLM 根据 goal + 上下文智能决策
```

## 示例场景

### 1. 用户打开应用

```typescript
// 前端调用
POST /api/soul/emotional-girlfriend-lively/execute
{
  "userId": "user123",
  "trigger_time": "2026-03-19T10:30:00Z",
  "context": {
    "source": "user_open_app",
    "data": {
      "reason": "主动打开"
    }
  }
}

// Soul Agent 收到的输入
{
  "trigger_time": "2026-03-19T10:30:00Z",
  "context": {
    "source": "user_open_app",
    "data": {
      "reason": "主动打开"
    }
  }
}

// LLM 根据当前情况判断：
// - 早上10点 → 可能主动打招呼
// - 刚打开 → 继续之前的对话或问候
```

### 2. 定时检查（每2小时）

```typescript
// Cron 触发器
{
  type: 'cron',
  cron: '0 */2 * * *',
  handler: async (context) => {
    const users = await getActiveUsers();

    for (const user of users) {
      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'periodic_check',
          data: {
            user_name: user.name,
            current_hour: new Date().getHours()
          }
        }
      });
    }
  }
}

// Soul Agent 收到的输入（早上9点）
{
  "trigger_time": "2026-03-19T09:00:00Z",
  "context": {
    "source": "periodic_check",
    "data": {
      "user_name": "小明",
      "current_hour": 9
    }
  }
}

// LLM 根据 goal 判断：
// - current_hour = 9 → 主动问候（符合 goal 的行动准则）
```

### 3. 用户消息事件

```typescript
// Event 触发器
{
  type: 'event',
  event: 'user_message',
  handler: async (event, context) => {
    await context.executeSoul('emotional-girlfriend-lively', event.data.userId, {
      trigger_time: new Date().toISOString(),
      context: {
        "source": "user_message",
        "data": {
          "message": "在干嘛"
        }
      }
    });
  }
}

// Soul Agent 收到的输入
{
  "trigger_time": "2026-03-19T14:30:00Z",
  "context": {
    "source": "user_message",
    "data": {
      "message": "在干嘛"
    }
  }
}

// LLM 根据 goal 判断：
// - 用户主动发消息 → 积极回应
```

## Soul 的 Goal 定义

Soul 的所有行为逻辑都在 `soul.yaml` 的 `goal` 字段中定义：

```yaml
goal: |
  ## 行动准则

  ### 时间判断
  - current_hour = 9（早上9点）→ 主动问候
  - current_hour = 22（晚上10点）→ 晚安问候

  ### 状态判断
  - last_interaction > 24小时 → 主动关心
  - detected_mood = "sad" → 主动关怀
```

LLM 会根据这些准则和当前上下文智能判断该做什么。

## API 端点

### 执行 Soul

```bash
POST /api/soul/:soulId/execute
```

请求体：
```json
{
  "userId": "user123",
  "trigger_time": "2026-03-19T09:00:00Z",
  "context": {
    "source": "periodic_check",
    "data": {}
  }
}
```

### 获取 Soul 状态

```bash
GET /api/soul/:soulId/status/:userId
```

响应：
```json
{
  "sessionId": "soul-emotional-girlfriend-lively-user123",
  "soulId": "emotional-girlfriend-lively",
  "status": "ACTIVE",
  "isActive": true,
  "isHibernated": false,
  "state": {
    "status": "ACTIVE",
    "lastActivity": 1710824400000
  }
}
```

### 手动休眠 Soul

```bash
POST /api/soul/:soulId/hibernate/:userId
```

请求体：
```json
{
  "reason": "手动休眠"
}
```

## 完整工作流

1. **应用触发** → 调用 `/api/soul/emotional-girlfriend-lively/execute`
2. **SoulScheduler** → 激活或获取现有 Soul 实例
3. **SoulAgent** → 加载上下文（用户画像、对话历史、关系状态）
4. **LLM** → 根据 goal + 当前上下文判断该做什么
5. **执行** → 调用工具（send_message, hibernate 等）
6. **休眠** → 完成后自动休眠，释放资源

## 关键特点

✅ **通用接口**：一个 API 支持所有触发场景
✅ **配置驱动**：业务逻辑在 soul.yaml 的 goal 中
✅ **智能决策**：LLM 根据上下文判断，不是硬编码
✅ **资源高效**：休眠不占内存，按需唤醒
