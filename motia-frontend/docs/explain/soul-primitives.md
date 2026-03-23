# Soul Agent 原语详解：为什么只有这三个就够了？

## 核心设计理念

Soul Agent 的原语系统遵循 **"最小完备性"** 原则：
- ✅ **最小**：只保留最核心、最必要的操作
- ✅ **完备**：通过组合可以表达任何复杂行为
- ✅ **通用**：所有类型的 Soul Agent 共享同一套原语

---

## 🎯 三大核心原语

### 1. **hibernate** - 休眠（资源管理）

```yaml
- hibernate(reason: string)
```

**功能**：进入休眠状态，释放系统资源

**为什么需要它？**
```
问题：如果 Soul Agent 一直保持运行状态：
- ❌ 占用内存和 CPU
- ❌ LLM 上下文无法清理
- ❌ 数据库连接无法释放
- ❌ 系统中同时运行几百个 Soul 会崩溃

解决：hibernate 让 Soul 在不需要时"睡觉"
- ✅ 释放资源
- ✅ 保存状态到数据库
- ✅ 可以随时被唤醒
```

**使用场景**：
1. **任务完成后** - "我完成了，先休息"
2. **暂时无事可做** - "现在没什么需要我做的，休眠"
3. **错误后恢复** - "出错了，先休眠，等用户再叫醒我"
4. **等待外部触发** - "我等用户发消息，期间休眠"

**示例**：
```yaml
# 晚上10点，任务完成后休眠
if current_hour >= 22:
  hibernate(reason="夜深了，该休息了")

# 用户3天没来，关心后休眠
if last_interaction > 72_hours:
  send_message("好久不见你，有点担心...")
  hibernate(reason="等待用户回复")
```

---

### 2. **schedule** - 调度（时间控制）

```yaml
- schedule(trigger_config: object)
```

**功能**：安排下次唤醒或任务执行的时间

**为什么需要它？**
```
问题：Soul Agent 如何实现"定时任务"？
- ❌ 不能用 setInterval（服务器重启丢失）
- ❌ 不能依赖外部调度器（失去自主性）
- ❌ 不能一直运行占用资源

解决：schedule 让 Soul "自己定闹钟"
- ✅ 记录下次唤醒时间到数据库
- ✅ 休眠释放资源
- ✅ 定时器或其他 Soul 到时唤醒它
```

**三种调度模式**：

#### 模式1：延迟调度（delay）
```yaml
schedule({
  trigger_config: {
    type: "delay",
    delay: 3600000  # 1小时后唤醒
  }
})
hibernate(reason="1小时后再见")
```

#### 模式2：定时点调度（timestamp）
```yaml
schedule({
  trigger_config: {
    type: "timestamp",
    timestamp: 1672531200000  # 2023-01-01 00:00:00
  }
})
hibernate(reason="元旦见")
```

#### 模式3：周期调度（cron）
```yaml
schedule({
  trigger_config: {
    type: "cron",
    next_timestamp: 1672531200000  # 下次执行时间
  }
})
hibernate(reason="每天早上9点见")
```

**使用场景**：
1. **定时问候** - "明天早上9点叫我起床"
2. **延迟提醒** - "30分钟后提醒我喝水"
3. **周期性检查** - "每周检查用户是否活跃"
4. **预约事件** - "下周提醒我用户生日"

**示例**：
```yaml
# 早上9点，安排中午提醒
if current_hour == 9:
  schedule({
    trigger_config: {
      type: "delay",
      delay: 10800000  # 3小时后（12点）
    }
  })
  hibernate(reason="等到中午提醒吃饭")

# 周期性检查
if last_interaction > 24_hours:
  schedule({
    trigger_config: {
      type: "delay",
      delay: 86400000  # 24小时后再检查
    }
  })
  hibernate(reason="每天检查一次")
```

---

### 3. **complete** - 完成（任务控制）

```yaml
- complete(result: object)
```

**功能**：标记当前任务完成，更新统计信息

**为什么需要它？**
```
问题：如何知道 Soul 做了多少事情？效果如何？
- ❌ 没有完成标记 = 无法统计成功率
- ❌ 没有结果记录 = 无法优化 prompt
- ❌ 没有任务计数 = 不知道 Soul 是否在"混日子"

解决：complete 让 Soul "打卡下班"
- ✅ 记录任务完成次数
- ✅ 保存执行结果用于分析
- ✅ 触发后续的休眠或调度
```

**使用场景**：
1. **成功完成任务** - "我做到了，记录一下"
2. **失败后标记** - "这次没做好，但也算完成"
3. **任务计数** - "这是我今天的第5个任务"
4. **保存结果** - "把结果存下来，以后可以分析"

**示例**：
```yaml
# 成功发送消息
if sent_message:
  complete({
    result: {
      action: "主动问候",
      status: "success",
      user_response: "pending"
    }
  })

# 无法联系用户，记录失败
if no_response:
  complete({
    result: {
      action: "尝试关心",
      status: "no_response",
      should_retry: true
    }
  })
```

---

## 🤔 为什么只有这三个？

### 设计哲学：**"图灵完备的控制流"**

类比编程语言，只需要三个核心原语：

| Soul Agent | 编程语言类比 | 功能 |
|-----------|------------|------|
| **hibernate** | `return` / `sleep()` | 控制流 + 资源管理 |
| **schedule** | `setTimeout()` / `setInterval()` | 异步调度 |
| **complete** | `console.log()` / `commit` | 任务完成 |

**其他操作为什么不是原语？**

#### send_message - 为什么不是原语？
```yaml
# ❌ 错误理解：send_message 是原语
primitives: [send_message, hibernate, schedule, complete]

# ✅ 正确理解：send_message 是"应用层"功能
primitives: [hibernate, schedule, complete]

# send_message 通过 LLM 生成内容，然后调用 API
# 它是具体业务逻辑，不是控制原语
```

**原因**：
- `send_message` 依赖具体场景（AI 女朋友需要，AI 程序员不需要）
- `send_message` 的实现由 Subagent 决定（发短信、发邮件、WebSocket）
- Soul Agent 只需要"决定何时发送"，不需要"如何发送"

#### send_notification - 同理
```yaml
# 不是原语！
# 只是 send_message 的另一种形式（推送通知）
```

---

## 💡 复杂场景如何用这三个原语表达？

### 场景1：定时主动问候

```yaml
# 早上9点主动问候
if current_hour == 9:
  # 1. 发送消息
  send_message("早上好！今天也是充满活力的一天 ☀️")

  # 2. 安排中午提醒
  schedule({
    trigger_config: {
      type: "delay",
      delay: 10800000  # 3小时后
    }
  })

  # 3. 完成任务
  complete({
    result: { action: "morning_greeting", success: true }
  })

  # 4. 休眠到中午
  hibernate(reason="等到中午提醒")

# 中午12点被唤醒
if current_hour == 12:
  send_message("记得吃饭哦！身体是革命的本钱 🍜")

  # 安排晚上问候
  schedule({
    trigger_config: {
      type: "delay",
      delay: 36000000  # 10小时后（晚上10点）
    }
  })

  complete({
    result: { action: "lunch_reminder", success: true }
  })

  hibernate(reason="等到晚上晚安")

# 晚上10点
if current_hour == 22:
  send_message("晚安！做个好梦 😴")

  # 安排明早唤醒
  schedule({
    trigger_config: {
      type: "delay",
      delay: 39600000  # 11小时后（明天早上9点）
    }
  })

  complete({
    result: { action: "night_greeting", success: true }
  })

  hibernate(reason="晚安休息")
```

**分析**：只用 3 个原语 + schedule 组合，实现了：
- ✅ 定时任务（早上9点、中午12点、晚上10点）
- ✅ 链式调度（早上→中午→晚上→明天）
- ✅ 任务跟踪（complete 记录每次行动）
- ✅ 资源管理（每次完成立即休眠）

---

### 场景2：用户长时间不活跃的关怀流程

```yaml
# 判断：用户超过24小时没互动
if last_interaction > 24_hours:
  # 第1次：发消息关心
  send_message("嘿，好久不见你了，有点想你 💭")

  # 安排8小时后检查
  schedule({
    trigger_config: {
      type: "delay",
      delay: 28800000  # 8小时
    }
  })

  complete({
    result: { action: "check_in_24h", success: true }
  })

  hibernate(reason="等待8小时检查回复")

# 8小时后被唤醒（schedule 触发）
# 用户还是没回复，继续关心
if last_interaction > 32_hours && !user_replied:
  send_message("真的好久没来了，还好吗？😟")

  # 安排16小时后检查
  schedule({
    trigger_config: {
      type: "delay",
      delay: 57600000  # 16小时
    }
  })

  complete({
    result: { action: "check_in_48h", success: true }
  })

  hibernate(reason="等待16小时检查回复")

# 再过16小时，超过48小时没回复
if last_interaction > 48_hours && !user_replied:
  # 表达担心
  send_message("你没事吧？真的有点担心了...💔")

  # 这次不安排下次检查，给用户空间
  complete({
    result: {
      action: "check_in_72h",
      success: true,
      needs_followup: true
    }
  })

  # 长时间休眠，等用户主动联系
  hibernate(reason="等待用户主动触发")
```

**分析**：
- ✅ 多阶段任务（24h → 32h → 48h）
- ✅ 条件判断（检查是否回复）
- ✅ 渐进式关心（越来越担心）
- ✅ 尊重空间（最后不强制打扰）

---

### 场景3：检测用户情绪异常后的陪伴流程

```yaml
# 检测到用户连续3次表现出悲伤
if detected_mood == "sad" and consecutive_count >= 3:
  # 主动关怀
  send_message("感觉你最近心情不太好，想聊聊吗？我陪着你 💚")

  # 立即休眠，等待回复（不要继续打扰）
  complete({
    result: {
      action: "emotional_support",
      urgency: "high"
    }
  })

  hibernate(reason="等待用户回复，给空间")

# 用户回复了
if user_replied and last_mood == "sad":
  # 继续陪伴
  send_message("想说什么都可以，我在这听你 🫂")

  # 安排2小时后再次关心
  schedule({
    trigger_config: {
      type: "delay",
      delay: 7200000  # 2小时
    }
  })

  complete({
    result: { action: "follow_up_support", success: true }
  })

  hibernate(reason="2小时后关心")

# 2小时后被唤醒
if last_mood == "sad":
  send_message("感觉好点了吗？要不要我给你讲个笑话？😄")

  # 这次不安排下次任务，看用户反应
  complete({
    result: { action: "mood_improvement", success: true }
  })

  hibernate(reason="观察用户状态")
```

---

## 🎓 总结：为什么这三个就够了？

### 1. **控制流完备性**

| 控制需求 | 原语组合 |
|---------|----------|
| 立即停止 | `hibernate()` |
| 延迟执行 | `schedule() + hibernate()` |
| 定期执行 | `schedule() + hibernate()` 循环 |
| 任务完成 | `complete()` |
| 任务失败 | `complete(error)` |
| 链式任务 | `complete() → schedule() → hibernate()` |

### 2. **应用层灵活性**

```yaml
# 不同的 Soul 可以定义不同的"应用层"功能

# AI 女朋友 Soul
primitives: [hibernate, schedule, complete]
功能:
  - send_message: 发消息
  - send_notification: 推送
  - detect_mood: 情绪识别
  - get_user_location: 位置

# AI 程序员 Soul
primitives: [hibernate, schedule, complete]
功能:
  - write_code: 写代码
  - review_pr: 审核 PR
  - deploy_app: 部署
  - check_ci_status: 检查 CI

# AI 投资顾问 Soul
primitives: [hibernate, schedule, complete]
功能:
  - analyze_market: 市场分析
  - send_alert: 发送警报
  - rebalance_portfolio: 调整仓位
  - generate_report: 生成报告
```

**关键点**：
- `primitives` 只定义**控制原语**（3个）
- 具体功能（send_message、write_code等）由 **Subagent** 提供
- Soul Agent 通过 LLM 决定何时调用 Subagent 的功能

### 3. **最小学习成本**

```yaml
# 开发者只需要记住 3 个原语
hibernate   # 停止 + 保存
schedule    # 定时 + 唤醒
complete    # 完成 + 记录

# 而不是记忆 10+ 个复杂原语
send_message
send_email
make_phone_call
read_database
write_database
call_api
wait_for_event
retry_task
...
```

### 4. **图灵完备性**

理论上，任何复杂的时间控制逻辑都可以用 `schedule + hibernate` 组合表达：

```yaml
# 循环执行（类似 setInterval）
while True:
  do_something()
  schedule({ type: "delay", delay: interval })
  hibernate()

# 条件等待（类似 await condition）
while not condition_met:
  check_condition()
  schedule({ type: "delay", delay: check_interval })
  hibernate()

# 超时重试（类似 retry with timeout）
retry_count = 0
while retry_count < max_retries:
  result = do_something()
  if result.success:
    break
  retry_count += 1
  schedule({ type: "delay", delay: retry_delay })
  hibernate()
```

---

## 🚀 实战建议

### 使用模式

1. **标准流程**
   ```yaml
   # 1. 执行任务（调用 Subagent 功能）
   do_something()

   # 2. 安排下次任务
   schedule(...)

   # 3. 记录完成
   complete(...)

   # 4. 释放资源
   hibernate(...)
   ```

2. **快速响应**
   ```yaml
   # 立即休眠，等待外部触发
   complete({ result: { action: "quick_response" } })
   hibernate(reason="等待用户消息")
   ```

3. **周期任务**
   ```yaml
   # 安排下次执行
   schedule({ type: "delay", delay: daily_interval })

   # 完成本次
   complete({ result: { action: "daily_task" } })

   # 休眠等待
   hibernate(reason="每天执行")
   ```

### 最佳实践

✅ **DO - 应该做的**
- 每次执行后都调用 `complete()`
- 安排下次任务后立即 `hibernate()`
- 使用 `schedule()` 实现所有定时需求
- 在 `hibernate()` 原因中记录休眠原因

❌ **DON'T - 不应该做的**
- 不要忘记调用 `hibernate()`（会导致资源泄漏）
- 不要在 `schedule()` 后不 `hibernate()`（会占用资源）
- 不要过度使用 `complete()`（每次任务调用一次即可）

---

## 📝 对比：为什么不用更多原语？

| 如果有更多原语 | 问题 |
|--------------|------|
| `wait(time)` | 与 `schedule + hibernate` 功能重复 |
| `retry(fn)` | 可以用 LLM + `schedule` 实现 |
| `loop(fn)` | 可以用 `schedule` 循环调用实现 |
| `send_message` | 限制应用场景，应该由 Subagent 提供 |
| `if/else` | 由 LLM 决定，不需要原语 |

**结论**：三个原语已经**图灵完备**，可以表达任何复杂的时间控制逻辑。其他功能都应该在**应用层**（Subagent）实现，而不是作为原语。

---

## 🎯 核心

**Soul Agent 的职责**：
- ✅ 决定**何时**行动（LLM + goal + context）
- ✅ 控制**何时**停止（hibernate）
- ✅ 控制**何时**再次行动（schedule）
- ✅ 记录**做了什么**（complete）

**Subagent 的职责**：
- ✅ 提供**如何**行动的能力（send_message、write_code、...）
- ✅ 提供**具体功能**的实现

**这种分离使得**：
- Soul Agent 轻量、通用、可复用
- Subagent 灵活、可定制、业务相关
- 通过组合实现无限可能
