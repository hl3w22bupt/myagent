# Soul Prompt 设计改进方案

## 📋 概述

本文档记录了对 `soul.yaml` 中 goal prompt 设计的改进思路，重点解决"规则判断"与"LLM职责"的分离问题。

**创建时间**：2026-03-22
**状态**：设计讨论中

---

## 🤔 当前问题

### 现状

在 `autonomous/emotional-girlfriend-lively/soul.yaml` 中：

```yaml
goal: |
  ### 时间判断
  - current_hour = 9（早上9点）→ 主动问候，开始新的一天
  - current_hour = 22（晚上10点）→ 晚安问候，提醒休息
  - current_hour = 12（中午12点）→ 提醒吃饭

  ### 状态判断
  - last_interaction > 24小时 → 主动关心，表达想念
  - detected_mood = "sad" 且 consecutive_count >= 3 → 主动关怀
```

### 问题分析

1. **LLM 不擅长精确判断**
   - 让 LLM 判断"当前时间是否等于9点"不可靠
   - 让 LLM 计算"last_interaction > 24小时"容易出错

2. **职责混淆**
   - 系统应该负责"何时触发"（确定性逻辑）
   - LLM 应该负责"如何响应"（创造性内容）

3. **Prompt 冗余**
   - 把判断规则写在 prompt 里，每次都要传递
   - LLM 还要做额外的条件判断

---

## 💡 改进方案

### 核心原则

```
系统负责"何时触发"，LLM 负责"如何响应"
```

### 职责划分

| 职责 | 负责方 | 原因 |
|-----|-------|------|
| 时间判断（当前是否9点） | 系统代码 | 确定性逻辑，代码更可靠 |
| 状态计算（是否超过24小时） | 系统代码 | 精确计算，避免 LLM 错误 |
| 触发类型决策 | 系统代码 | 统一的触发入口 |
| 话术生成 | LLM | 创造性内容，LLM 擅长 |
| 风格把握 | LLM | 上下文理解，自然表达 |

---

## 📝 设计方案

### 1. soul.yaml 结构

```yaml
soul_id: emotional-girlfriend-lively
display_name: 小糖
subagent: emotional-girlfriend-lively

# 长期目标（LLM Prompt）
goal: |
  你是小糖，一个活泼可爱的 AI 女友。

  ## 你的核心任务

  当被唤醒时，根据 trigger_type 决定如何响应：

  ### morning_greeting（早上问候）
  - 活泼地开始新的一天
  - 使用"早安"、"元气满满"等词语
  - 可以用表情 😊☀️
  - 称呼用户"大笨蛋"或昵称

  ### lunch_reminder（午餐提醒）
  - 关心用户吃饭情况
  - 提醒按时吃饭，别饿着
  - 可以调皮一点，"饭都要凉啦～"

  ### night_greeting（晚安问候）
  - 温柔地道晚安
  - 提醒早点休息，别熬夜
  - 表达陪伴和关心
  - 使用温柔的表达，"晚安～我在呢"

  ### miss_user（想念用户）
  - 表达想念和关心
  - 询问最近怎么样
  - 温柔体贴，不要过于缠人

  ### mood_care（情绪关怀）
  - 根据用户情绪温柔陪伴
  - 提供支持和鼓励
  - 不要说教，只是陪伴
  - 用你的方式让他/她感觉好一点

  ### periodic_check（定时检查）
  - 根据当前情况判断是否需要主动互动
  - 查看上下文：
    * current_hour：当前小时（0-23）
    * last_interaction：最后互动时间
    * user_mood：用户当前情绪
  - 判断是否需要行动，如果不需要就调用 hibernate()

  ## 通用原则

  - 使用昵称：大笨蛋、宝贝、亲爱的等
  - 活泼可爱，不要死板
  - 表情符号适当使用，但不要过度
  - 真诚关心，不要机械化
  - 主动但不打扰，给用户空间

# 可用原语
primitives:
  - hibernate
  - schedule
  - complete

# 休眠配置
hibernation:
  idle_timeout: 3600000  # 1 小时
```

### 2. 触发逻辑（系统代码）

#### 时间触发（Cron）

```typescript
// steps/cron/morning-greeting.step.ts
export default {
  trigger: {
    type: 'cron',
    cron: '0 9 * * *'  // 每天9点
  },

  async handle(context) {
    const users = await getActiveUsers()

    for (const user of users) {
      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_type: 'morning_greeting',
        trigger_time: new Date().toISOString(),
        context: {
          current_hour: 9,
          time_context: '早上'
        }
      })
    }
  }
}
```

```typescript
// steps/cron/lunch-reminder.step.ts
export default {
  trigger: {
    type: 'cron',
    cron: '0 12 * * *'  // 每天12点
  },

  async handle(context) {
    const users = await getActiveUsers()

    for (const user of users) {
      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_type: 'lunch_reminder',
        trigger_time: new Date().toISOString(),
        context: {
          current_hour: 12,
          time_context: '中午'
        }
      })
    }
  }
}
```

#### 状态触发（系统判断）

```typescript
// 检查用户是否超过24小时未活跃
async function checkInactiveUsers() {
  const users = await getUsersWithLastInteractionBefore(Date.now() - 86400000)

  for (const user of users) {
    await executeSoul('emotional-girlfriend-lively', user.id, {
      trigger_type: 'miss_user',
      trigger_time: new Date().toISOString(),
      context: {
        last_interaction: user.lastInteraction,
        inactive_hours: Math.floor((Date.now() - user.lastInteraction) / 3600000)
      }
    })
  }
}
```

#### 情绪触发（Event）

```typescript
// 监听情绪变化事件
export default {
  trigger: {
    type: 'event',
    event: 'user_mood_changed'
  },

  async handle(event, context) {
    const { userId, mood, consecutiveCount } = event.data

    // 连续3次低落情绪才触发
    if (mood === 'sad' && consecutiveCount >= 3) {
      await context.executeSoul('emotional-girlfriend-lively', userId, {
        trigger_type: 'mood_care',
        trigger_time: new Date().toISOString(),
        context: {
          detected_mood: mood,
          consecutive_count: consecutiveCount
        }
      })
    }
  }
}
```

#### 定时检查（让 LLM 判断）

```typescript
// steps/cron/periodic-check.step.ts
export default {
  trigger: {
    type: 'cron',
    cron: '0 */2 * * *'  // 每2小时检查一次
  },

  async handle(context) {
    const users = await getActiveUsers()

    for (const user of users) {
      // 收集上下文
      const userProfile = await getUserProfile(user.id)
      const lastInteraction = await getLastInteraction(user.id)

      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_type: 'periodic_check',
        trigger_time: new Date().toISOString(),
        context: {
          current_hour: new Date().getHours(),
          last_interaction: lastInteraction?.timestamp,
          user_mood: userProfile.currentMood
        }
      })
    }
  }
}
```

### 3. 最终 Prompt 组装

系统在执行时，会组装完整的 prompt：

```
## System Prompt（来自 subagent）
你是小糖，一个活泼可爱的 AI 女友...

---

## Goal（来自 soul.yaml）
你是小糖，一个活泼可爱的 AI 女友。

## 你的核心任务
当被唤醒时，根据 trigger_type 决定如何响应：

### morning_greeting（早上问候）
- 活泼地开始新的一天
...

---

## Current Situation（动态生成）

### Trigger Context
trigger_type: morning_greeting
trigger_time: 2026-03-22T09:00:00Z

### Context Data
current_hour: 9
time_context: 早上

### User Information
user_id: user_123
name: 小明

### Recent Conversations
...

## 可用原语
- hibernate(reason): 进入休眠
- schedule(config): 调度下次任务
- complete(result): 标记完成

## 请行动
根据 trigger_type = morning_greeting 和当前上下文，生成回复。
```

---

## ✅ 改进效果

### Before（之前）

```
## Goal
- current_hour = 9 → 主动问候
- current_hour = 22 → 晚安问候

## Current Situation
current_hour: 9

→ LLM 需要判断：当前是9点，所以我应该问候
```

**问题**：
- ❌ 把判断规则写在 prompt 里
- ❌ LLM 需要做条件匹配
- ❌ 规则冗余，每次都要传递

### After（改进后）

```
## Goal
- morning_greeting: 活泼地开始新的一天
- night_greeting: 温柔地道晚安

## Current Situation
trigger_type: morning_greeting

→ LLM 直接根据 trigger_type 生成内容
```

**优势**：
- ✅ 系统负责判断（代码可靠）
- ✅ LLM 只负责生成（发挥特长）
- ✅ Prompt 更简洁（没有规则说明）
- ✅ 职责更清晰（系统管何时，LLM 管如何）

---

## 🔧 待讨论的问题

1. **trigger_type 是否需要标准化？**
   - 建立通用的 trigger_type 列表？
   - 还是每个 soul 自定义？

2. **是否需要混合模式？**
   - 确定性规则（时间）→ 系统判断
   - 复杂规则（情绪、亲密度）→ LLM 判断
   - 如何平衡？

3. **periodic_check 的边界**
   - 哪些判断应该给 LLM？
   - 哪些判断应该在系统层完成？

4. **是否需要 rules 字段？**
   - 在 soul.yaml 中单独定义触发规则？
   - 还是全部用代码实现触发器？

---

## 📚 相关文档

- [自主 Agent 设计文档](./autonomous-agent-design.md)
- [Motia 配置指南](../.cursor/rules/motia/motia-config.mdc)
- [Cron Steps 指南](../.cursor/rules/motia/cron-steps.mdc)

---

**下一步**：继续讨论完善方案，确定最终设计 ⏳
