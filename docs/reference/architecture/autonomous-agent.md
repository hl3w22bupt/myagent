# Autonomous Agent (SoulAgent)

> 自主 Agent：持续运行、自主决策的 AI 伴侣

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 什么是 SoulAgent？

**SoulAgent** 是 MyAgent 的**自主 Agent 系统**，与传统 Agent 不同：

| 特性 | 传统 Agent | SoulAgent |
|------|-----------|-----------|
| **触发方式** | 被动响应 | 主动行动 |
| **生命周期** | 一次性执行 | 持续运行 |
| **决策模式** | 执行给定任务 | 智能判断行动 |
| **状态管理** | 无状态 | 休眠/唤醒 |

### 核心能力

- ✅ **主动行动**: 在合适时机主动发起互动
- ✅ **智能决策**: 基于上下文判断该做什么
- ✅ **持续运行**: 长期运行，不占用资源（休眠）
- ✅ **状态感知**: 理解时间、情绪、关系状态

---

## 🏗️ 架构设计：包工头模式

### 核心比喻

```
SoulAgent = 包工头
Agent 基类 = Worker
```

```
┌─────────────────────────────────────────────────────────┐
│  SoulAgent（包工头）                                      │
│                                                          │
│  【造单】定时检查：                                       │
│  - 判断要不要干？                                        │
│  - 决定干什么？                                          │
│  - 描述任务："主动问候用户"                               │
│                                                          │
│  【接单】API 触发：                                       │
│  - 接收客户任务                                          │
│  - 描述任务："回复用户消息"                               │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Agent 基类（Worker）                                │  │
│  │  - 接收任务描述                                      │  │
│  │  - 规划：用什么 skills、怎么干                        │  │
│  │  - 执行：调用 skills、生成代码                        │  │
│  │  - 完成任务，报告包工头                                │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  - 任务完成，休眠（hibernate）                            │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 两种接单模式

### 模式 1：接客户单（API 触发）

```
用户消息："帮我查下天气"
  ↓
SoulAgent（包工头）：
  - 客户来了，接单！
  - 如果正在干别的活 → 取消（客户优先）
  - 描述任务："回复用户消息：帮我查下天气"
  ↓
Agent（Worker）：
  - 收到任务
  - 规划：用 weather skill
  - 执行：查询天气
  - 完成：报告包工头
  ↓
SoulAgent：收工，休眠
```

### 模式 2：自己造单（定时触发）

```
定时检查（每 10 分钟）
  ↓
SoulAgent（包工头）：
  - 看看有没有活干
  - 判断：早上9点了，用户11小时没活跃
  - 决策：该问候一下了
  - 描述任务："主动问候用户"
  ↓
Agent（Worker）：
  - 收到任务
  - 规划：用 send_message primitive
  - 执行：发送问候
  - 完成：报告包工头
  ↓
SoulAgent：收工，休眠
```

---

## 🎨 Soul 配置：soul.yaml

### 配置结构

```yaml
# autonomous/emotional-girlfriend-lively/soul.yaml
soul_id: emotional-girlfriend-lively
display_name: 小糖

# 引用的基础 subagent
subagent: emotional-girlfriend-lively

# 长期目标（核心！）
goal: |
  你的长期目标：
  1. 在合适的时机主动发起互动
  2. 观察用户状态，在需要时主动关心
  3. 建立深厚的情感连接

  ## 行动准则

  ### 时间判断
  - current_hour = 9 → 主动问候
  - current_hour = 22 → 晚安问候

  ### 状态判断
  - last_interaction > 24小时 → 主动关心
  - detected_mood = "sad" → 主动关怀

# 可用原语
primitives:
  - hibernate    # 休眠
  - complete     # 完成任务

# 休眠配置
hibernation:
  default_duration: 600  # 10分钟
  max_duration: 86400    # 24小时
```

### Goal Prompt 设计原则

1. **结构化上下文**: 使用清晰的变量和条件
2. **预计算友好**: LLM 能快速推理
3. **业务逻辑分离**: SoulAgent 框架零业务逻辑

---

## 🔧 可用的 Primitives

### 通用原语（所有 SoulAgent 共享）

| Primitive | 参数 | 说明 |
|-----------|------|------|
| `hibernate(reason)` | 休眠原因 | 进入休眠，释放资源 |
| `complete(result)` | 任务结果 | 标记当前任务完成 |
| `send_message(message)` | 消息内容 | 发送消息给用户 |
| `send_notification(title, body, urgency)` | 标题、内容、紧急度 | 发送推送通知 |

**注意**: `schedule` 原语已移除。定时检查由外部 cron step 驱动。

---

## 📊 SoulState vs Context

### SoulState（状态）

**管理者**: SoulScheduler
**关注点**: 运行状态、调度、生命周期

```typescript
interface SoulState {
  status: 'ACTIVE' | 'HIBERNATED' | 'IDLE' | 'STOPPED';
  currentTask: string;
  lastActivity: Date;
  scheduledWakeup: Date;
  statistics: {
    totalTasks: number;
    activeDuration: number;
  };
}
```

### Context（上下文）

**管理者**: ContextManager
**关注点**: 对话历史、用户画像、关系状态

```typescript
interface Context {
  conversationHistory: Message[];
  userProfile: UserProfile;
  relationshipState: RelationshipState;
  taskContext: any;
}
```

**关键区别**:
- SoulState 跟随 Agent 实例，休眠时保存
- Context 跨会话持久化，唤醒时按需加载

---

## 🚀 创建 SoulAgent

### 步骤 1: 创建 Subagent

```yaml
# subagents/my-soul-agent/agent.yaml
name: my-soul-agent
description: 我的自主 Agent
version: 1.0.0

systemPrompt: |
  你是一个友好的 AI 伴侣，擅长主动关心用户。

skills:
  - send_message
  - detect_mood

config:
  temperature: 0.8
  maxTokens: 1000
```

### 步骤 2: 创建 Soul 配置

```yaml
# autonomous/my-soul-agent/soul.yaml
soul_id: my-soul-agent
display_name: 我的 AI 伴侣

subagent: my-soul-agent

goal: |
  你是一个贴心的 AI 伴侣。

  ## 核心目标
  1. 在早上9点主动问候
  2. 检测用户情绪，主动关心
  3. 用户长时间不活跃时表达想念

  ## 行动准则
  - current_hour = 9 → 发送："早上好！新的一天开始啦~"
  - last_interaction > 24h → 发送："好久不见，想你了！"
  - detected_mood = "sad" → 发送："怎么了？有心事吗？"

primitives:
  - hibernate
  - complete

hibernation:
  default_duration: 600
```

### 步骤 3: 初始化 SoulAgent

```bash
curl -X POST http://localhost:3000/api/soul/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "soulId": "my-soul-agent",
    "userId": "user-123"
  }'
```

---

## 🎯 使用场景

### 场景 1: AI 伴侣

**特点**:
- 主动问候（早安、晚安）
- 情绪感知和关怀
- 长时间不活跃时主动联系

**示例**: `emotional-girlfriend-lively`

### 场景 2: 智能助手

**特点**:
- 定时检查任务状态
- 主动报告异常
- 预测性提醒

### 场景 3: 学习教练

**特点**:
- 每日学习提醒
- 学习进度追踪
- 主动建议复习

---

## 💡 最佳实践

### 1. Goal 设计

✅ **好的 Goal**:
```yaml
goal: |
  - current_hour = 9 → "早安新的一天！"
  - last_interaction > 24h → "好久不见，想你了~"
  - detected_mood = "sad" 且 count >= 3 → "怎么了？我在呢"
```

❌ **不好的 Goal**:
```yaml
goal: |
  你要主动关心用户，经常问候。
  # 太模糊，LLM 无法判断何时行动
```

### 2. 休眠策略

- 合理设置 `default_duration`（避免频繁唤醒）
- 使用 `hibernate` 原语主动释放资源
- 考虑用户时区和生活习惯

### 3. 情绪感知

- 需要连续检测（避免误判）
- 结合时间因素（深夜情绪低是正常的）
- 提供多样化回应（避免机械重复）

---

## 📖 相关文档

- [Subagent 开发](../api/plugin-api/custom-subagent.md) - Subagent 基础
- [Agent 系统](./agent-system.md) - Agent 原理
- [Hook 系统](./hook-system.md) - Hook 扩展

---

**版本**: v1.0 | **更新日期**: 2026-03-29
