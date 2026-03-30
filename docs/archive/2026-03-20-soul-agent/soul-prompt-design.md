# Soul Prompt 设计改进方案

## 📋 概述

本文档记录了对 `soul.yaml` 中 goal prompt 设计的改进方案，采用**结构化上下文 + 预计算友好变量**的方法，让 LLM 基于推理能力判断何时行动。

**核心理念**：SoulAgent = 包工头（自主决策 + 派单执行）

**创建时间**：2026-03-22
**状态**：✅ 设计确定
**方案**：结构化上下文 + 两层架构（包工头 + Worker）

---

## 🏗️ 架构设计：包工头模式

### 核心比喻：SoulAgent = 包工头

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
│  - 任务完成，休息（hibernate）                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 两种接单模式

#### 模式 1：接客户单（API 触发）

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
SoulAgent：收工，休息
```

#### 模式 2：自己造单（定时触发）

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
SoulAgent：收工，休息
```

### 清晰的分层边界

```
┌─────────────────────────────────────────────────────────┐
│  SoulAgent                                              │
│                                                          │
│  【前置处理层】← SoulAgent 特有的逻辑                      │
│  - 接单：API 触发 → 取消当前任务 → 描述任务                 │
│  - 造单：定时触发 → 判断是否需要行动 → 描述任务             │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Agent 基类（复用，不改）                            │  │
│  │  - run(task, taskId, context)                     │  │
│  │  - PTCGenerator（任务规划）                        │  │
│  │  - Skills 管理                                     │  │
│  │  - 完整的执行流程                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 核心原则

**两个问题，两个层次**：

| 问题 | 谁解决 | 层次 |
|-----|-------|------|
| **要不要做？做什么？** | SoulAgent（包工头） | 前置决策层 |
| **怎么做？** | Agent（Worker） | 执行层 |

---

## 🤔 当前问题

### 现状

在 `autonomous/emotional-girlfriend-lively/soul.yaml` 中：

```yaml
goal: |
  ### 时间判断
  - current_hour = 9（早上9点）→ 主动问候，开始新的一天
  - current_hour = 22（晚上10点）→ 晚安问候，提醒休息

  ### 状态判断
  - last_interaction > 24小时 → 主动关心，表达想念
```

### 问题分析

1. **LLM 不擅长精确判断**
   - 让 LLM 判断"当前时间是否等于9点"不可靠
   - 让 LLM 计算"last_interaction > 24小时"容易出错

2. **职责混淆**
   - 系统应该负责"提供友好上下文"
   - LLM 应该负责"基于上下文推理"

3. **Prompt 冗余**
   - 把判断规则写在 prompt 里，每次都要传递
   - LLM 还要做额外的条件判断

---

## 💡 最终方案

### 核心流程

```
系统计算友好变量 → 结构化上下文 → SoulAgent 判断 → 描述任务 → Agent 执行
```

### 职责划分

| 职责 | 负责方 | 理由 |
|-----|-------|------|
| 时间计算（当前时间段） | 系统代码 | 确定性逻辑，计算友好变量 |
| 状态计算（未活跃小时数） | 系统代码 | 精确计算，生成相对时间描述 |
| 复杂业务逻辑（情绪分析） | myecho 服务 | 专业服务，提供分析结果 |
| 判断是否需要行动 | SoulAgent（包工头） | 前置决策层 |
| 规划如何完成任务 | Agent（Worker） | 任务规划层（PTC） |
| 内容生成（如何表达） | LLM | 创造性内容 |

### 关键设计决策

1. **不引入规则引擎** - 避免伪智能和学习门槛
2. **预计算友好变量** - 系统负责将原始数据转换为 LLM 易理解的形式
3. **结构化 JSON 注入** - 现代 LLM 理解 JSON 很好
4. **两层架构** - SoulAgent 决策 + Agent 执行，职责分明
5. **去掉 schedule 原语** - 定期检查 + 实时判断，不需要保存到 DB

---

## 📐 完整数据流

### 定时触发流程

```
┌─────────────────────────────────────────────────────────┐
│  1. Cron 触发（每 10 分钟）                               │
│     steps/cron/soul-periodic-check.step.ts              │
│     - 查询所有活跃的 Soul Agent                          │
│     - 对每个 Soul 并发检查                                │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  2. 检查 Soul 状态                                       │
│     - 如果正在运行 → 跳过（TODO: 未来优化为排队）          │
│     - 如果空闲 → 继续                                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  3. 发送执行事件                                         │
│     emit('soul.agent.execute', {                         │
│       soulId, sessionId, userId,                          │
│       trigger_time, context                              │
│     })                                                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  4. SoulAgent.execute() - 【包工头逻辑】                 │
│                                                          │
│  4.1 构建结构化上下文                                     │
│       SoulContextBuilder.build()                        │
│       → { time, user_activity, user_mood, trigger }      │
│                                                          │
│  4.2 判断是否需要行动                                    │
│       基于上下文推理：现在需要干吗？                       │
│                                                          │
│       ┌─────────────┬─────────────┐                      │
│       │ 不需要行动    │ 需要行动     │                      │
│       └─────────────┴─────────────┘                      │
│              ↓              ↓                              │
│         hibernate()     描述任务                          │
│       （返回）          ↓                                │
│                   ┌─────────────────────┐                  │
│                   │ Agent.run(task)     │                  │
│                   │ 【Worker 逻辑】     │                  │
│                   │ - PTCGenerator      │                  │
│                   │ - Skills           │                  │
│                   │ - 执行             │                  │
│                   └─────────────────────┘                  │
│                          ↓                                 │
│                   执行完成，hibernate()                     │
└─────────────────────────────────────────────────────────┘
```

### API 触发流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 用户发送消息                                         │
│     POST /api/soul/execute                               │
│     { soulId, userId, message }                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  2. 检查 Soul 状态                                       │
│     - 如果正在运行 → 取消当前任务（客户优先）             │
│     - 清空队列（TODO）                                    │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  3. SoulAgent.execute() - 【包工头逻辑】                 │
│                                                          │
│  - 接单！客户消息优先                                     │
│  - 描述任务："回复用户消息：xxx"                         │
│  - 调用 Agent.run(task)                                  │
│  - 执行完成                                              │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 TypeScript 类型定义

**文件**：`src/core/agent/soul-context-types.ts`

```typescript
/**
 * Soul Agent 执行上下文（结构化、友好的）
 *
 * 设计原则：
 * - 所有字段都是"友好变量"（LLM 容易理解）
 * - 明确类型定义（TypeScript 类型安全）
 * - 可扩展（新增字段不影响现有逻辑）
 */
export interface SoulExecutionContext {
  /**
   * 时间相关信息
   */
  time: {
    /**
     * 时间段（友好的中文描述）
     */
    period: '深夜' | '早上' | '上午' | '中午' | '下午' | '傍晚' | '晚上';

    /**
     * 当前小时（0-23）
     */
    hour: number;

    /**
     * 是否周末
     */
    is_weekend: boolean;

    /**
     * 星期几（1-7，周一为1）
     */
    weekday: number;

    /**
     * 当前日期（YYYY-MM-DD 格式）
     */
    date: string;
  };

  /**
   * 用户活跃状态
   */
  user_activity: {
    /**
     * 距离上次互动的小时数
     */
    inactive_hours: number;

    /**
     * 是否长时间未活跃（超过24小时）
     */
    is_long_inactive: boolean;

    /**
     * 是否超长时间未活跃（超过72小时）
     */
    is_very_long_inactive: boolean;

    /**
     * 最后互动时间（相对描述）
     */
    last_interaction: string;  // "2小时前" / "昨天" / "3天前"
  };

  /**
   * 用户情绪状态（可选，由 myecho 服务提供）
   */
  user_mood?: {
    /**
     * 当前情绪
     */
    current: string;  // "happy" | "sad" | "neutral" | "stressed" | ...

    /**
     * 情绪趋势
     */
    trend: '持续低落' | '持续上升' | '平稳' | '波动';

    /**
     * 连续次数（用于判断是否需要关注）
     */
    consecutive_count?: number;

    /**
     * 是否需要特别关注
     */
    needs_attention: boolean;
  };

  /**
   * 触发信息
   */
  trigger: {
    /**
     * 触发来源
     */
    source: string;  // "periodic_check" | "user_message" | "emotion_detection" | ...

    /**
     * 触发原因（可选）
     */
    reason?: string;

    /**
     * 原始数据（可选，保留完整信息）
     */
    raw_data?: Record<string, any>;
  };

  /**
   * 扩展字段（用于未来扩展）
   */
  extra?: Record<string, any>;
}

/**
 * 原始触发上下文（来自系统或外部服务）
 */
export interface RawTriggerContext {
  source: string;
  data: Record<string, any>;
}
```

---

## 🛠️ Context Builder 实现

**文件**：`src/core/context/soul-context-builder.ts`

```typescript
import { SoulExecutionContext, RawTriggerContext } from '../agent/soul-context-types';

/**
 * Soul Context Builder
 *
 * 将原始触发数据转换为 LLM 友好的结构化上下文
 */
export class SoulContextBuilder {
  /**
   * 构建完整的执行上下文
   */
  static build(triggerTime: string, rawContext: RawTriggerContext): SoulExecutionContext {
    const triggerDate = new Date(triggerTime);

    return {
      time: this.buildTimeContext(triggerDate),
      user_activity: this.buildUserActivityContext(rawContext.data),
      user_mood: this.buildUserMoodContext(rawContext.data),
      trigger: {
        source: rawContext.source,
        reason: rawContext.data.reason,
        raw_data: rawContext.data,
      },
      extra: rawContext.data.extra,
    };
  }

  /**
   * 构建时间上下文
   */
  private static buildTimeContext(date: Date): SoulExecutionContext['time'] {
    const hour = date.getHours();
    const weekday = date.getDay() || 7; // 周日为7

    return {
      period: this.getTimePeriod(hour),
      hour,
      is_weekend: weekday >= 6,
      weekday,
      date: date.toISOString().split('T')[0],
    };
  }

  /**
   * 将小时转换为友好的时间段
   */
  private static getTimePeriod(hour: number): SoulExecutionContext['time']['period'] {
    if (hour >= 0 && hour < 6) return '深夜';
    if (hour >= 6 && hour < 9) return '早上';
    if (hour >= 9 && hour < 12) return '上午';
    if (hour >= 12 && hour < 14) return '中午';
    if (hour >= 14 && hour < 18) return '下午';
    if (hour >= 18 && hour < 20) return '傍晚';
    return '晚上';
  }

  /**
   * 构建用户活跃状态上下文
   */
  private static buildUserActivityContext(data: Record<string, any>): SoulExecutionContext['user_activity'] {
    const now = Date.now();
    const lastInteraction = data.last_interaction ? new Date(data.last_interaction).getTime() : now;
    const inactiveHours = Math.floor((now - lastInteraction) / (1000 * 60 * 60));

    return {
      inactive_hours: inactiveHours,
      is_long_inactive: inactiveHours > 24,
      is_very_long_inactive: inactiveHours > 72,
      last_interaction: this.formatTimeAgo(inactiveHours),
    };
  }

  /**
   * 将小时数转换为友好的相对时间
   */
  private static formatTimeAgo(hours: number): string {
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    if (hours < 48) return '昨天';
    if (hours < 72) return '2天前';
    return `${Math.floor(hours / 24)}天前`;
  }

  /**
   * 构建用户情绪上下文（可选）
   */
  private static buildUserMoodContext(data: Record<string, any>): SoulExecutionContext['user_mood'] | undefined {
    // 如果没有情绪数据，返回 undefined
    if (!data.mood && !data.detected_mood) {
      return undefined;
    }

    const mood = data.mood || data.detected_mood;
    const consecutiveCount = data.consecutive_count || 0;

    return {
      current: mood,
      trend: data.mood_trend || this.calculateMoodTrend(mood, consecutiveCount),
      consecutive_count: consecutiveCount,
      needs_attention: this.needsMoodAttention(mood, consecutiveCount),
    };
  }

  /**
   * 计算情绪趋势（简化版，实际可由 myecho 服务提供）
   */
  private static calculateMoodTrend(mood: string, consecutiveCount: number): '持续低落' | '持续上升' | '平稳' | '波动' {
    if (consecutiveCount >= 3 && (mood === 'sad' || mood === 'stressed')) {
      return '持续低落';
    }
    return '平稳';
  }

  /**
   * 判断是否需要情绪关注
   */
  private static needsMoodAttention(mood: string, consecutiveCount: number): boolean {
    return (mood === 'sad' || mood === 'stressed') && consecutiveCount >= 3;
  }
}
```

---

## 📝 SoulAgent 实现

**文件**：`src/core/agent/soul-agent.ts`

```typescript
import { Agent } from './agent';
import { SoulContextBuilder } from '../context/soul-context-builder';

/**
 * SoulAgent - 自主 Agent（包工头）
 *
 * = Subagent（角色） + Soul（目标） + 前置决策 + 基类执行
 *
 * 职责：
 * 1. 接单：处理 API 触发（用户消息）
 * 2. 造单：处理定时触发（自主决策）
 * 3. 派单：描述任务给基类 Agent
 * 4. 收工：任务完成后休眠
 */
export class SoulAgent extends Agent {
  private soulConfig: SoulConfig;
  private subagentConfig: any;
  private soulState: SoulState;
  private userId: string;
  private taskId: string;

  constructor(
    soulConfig: SoulConfig,
    subagentConfig: any,
    sessionId: string,
    userId?: string,
    taskId?: string
  ) {
    // 1. 组合 System Prompt（角色 + 目标）
    const combinedPrompt = SoulAgent.combinePrompts(
      subagentConfig.system_prompt || subagentConfig.agent?.system_prompt || '',
      soulConfig.goal
    );

    // 2. 创建 Agent 配置
    const agentConfig: AgentConfig = {
      name: soulConfig.display_name,
      systemPrompt: combinedPrompt,
      availableSkills: subagentConfig.available_skills || subagentConfig.agent?.available_skills,
      llm: subagentConfig.llm || subagentConfig.agent?.llm,
      sandbox: subagentConfig.sandbox || subagentConfig.agent?.sandbox,
      constraints: subagentConfig.constraints || subagentConfig.agent?.constraints
    };

    // 3. 初始化基类 Agent
    super(agentConfig, sessionId);

    // 4. 保存配置
    this.soulConfig = soulConfig;
    this.subagentConfig = subagentConfig;
    this.userId = userId || extractUserId(sessionId, this.soulConfig.soul_id);
    this.taskId = taskId || `task-${sessionId}`;

    // 5. 初始化状态
    this.soulState = {
      status: 'IDLE',
      currentTask: null,
      lastActivity: null,
      scheduledWakeup: null,
      statistics: {
        totalTasks: 0,
        uptime: 0
      }
    };

    console.log(`[SoulAgent] Created soul agent: ${soulConfig.soul_id} (${soulConfig.display_name})`);
  }

  /**
   * 执行触发任务（包工头逻辑）
   *
   * 根据触发源决定处理方式：
   * - API 触发：接单模式（取消当前任务，处理用户消息）
   * - 定时触发：造单模式（判断是否需要行动）
   *
   * @param input - Soul 执行输入
   * @returns 执行结果
   */
  async execute(input: SoulInput & { streams?: any }): Promise<any> {
    const { trigger_time, context, streams } = input;
    const source = context.source;

    console.log(`[SoulAgent] ${this.sessionId} executing at ${trigger_time}, source: ${source}`);

    // 更新状态
    this.soulState.status = 'ACTIVE';
    this.soulState.lastActivity = Date.now();

    if (source === 'user_message') {
      // 【接单模式】API 触发
      return await this.handleUserMessage(input, streams);
    } else {
      // 【造单模式】定时触发
      return await this.handlePeriodicCheck(input, streams);
    }
  }

  /**
   * 【接单模式】处理用户消息
   *
   * 客户优先：取消正在运行的任务，立即处理用户消息
   */
  private async handleUserMessage(input: SoulInput, streams: any): Promise<any> {
    const { context } = input;

    // 如果正在运行，取消当前任务（用户消息优先）
    if (this.soulState.currentTask) {
      console.log(`[SoulAgent] Cancelling current task - user message priority`);
      await this.cancelCurrentTask();
    }

    // 构建任务描述
    const taskDescription = `用户发来消息：${context.data.userRequest || context.data.message || '(无内容)'}`;

    // 调用基类 Agent.run()
    const result = await this.run(
      taskDescription,
      this.taskId,
      {
        conversationHistory: await this.getRecentConversations(10),
        streams: streams
      }
    );

    // 任务完成后休眠
    if (this.shouldHibernate()) {
      await this.hibernate('任务完成');
    }

    return result;
  }

  /**
   * 【造单模式】处理定时检查
   *
   * 判断是否需要行动：
   * - 不需要 → 休眠
   * - 需要 → 描述任务 → 调用基类 Agent.run()
   */
  private async handlePeriodicCheck(input: SoulInput, streams: any): Promise<any> {
    const { trigger_time, context } = input;

    // 1. 构建结构化上下文
    const ctx = SoulContextBuilder.build(trigger_time, context);

    // 2. 判断是否需要行动（前置决策）
    const decision = await this.makeDecision(ctx);

    if (!decision.needsAction) {
      // 不需要行动，直接休眠
      console.log(`[SoulAgent] ${this.sessionId} no action needed: ${decision.reason}`);
      await this.hibernate(decision.reason || '无需行动');
      return { success: true, action: 'hibernated', reason: decision.reason };
    }

    // 3. 需要行动，描述任务
    const taskDescription = this.buildTaskDescription(ctx);

    // 4. 调用基类 Agent.run()
    const result = await this.run(
      taskDescription,
      this.taskId,
      {
        conversationHistory: await this.getRecentConversations(10),
        streams: streams
      }
    );

    // 5. 任务完成后休眠
    if (this.shouldHibernate()) {
      await this.hibernate('任务完成');
    }

    return result;
  }

  /**
   * 【前置决策】判断是否需要行动
   *
   * 基于结构化上下文，让 LLM 快速判断是否需要行动
   */
  private async makeDecision(ctx: SoulExecutionContext): Promise<{
    needsAction: boolean;
    reason: string;
  }> {
    const prompt = `
根据上下文快速判断是否需要行动（回答 JSON）：

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

## 你的目标

${this.soulConfig.goal}

## 判断标准

- 需要：应该主动互动（问候、关心、陪伴等）
- 不需要：用户状态良好，无需打扰

回答格式：
\`\`\`json
{
  "needsAction": true/false,
  "reason": "原因说明"
}
\`\`\`
    `.trim();

    try {
      const response = await this.llm.messagesCreate(
        [
          { role: 'system', content: '你是一个决策助手。' },
          { role: 'user', content: prompt }
        ],
        {
          max_tokens: 200,
          temperature: 0
        },
        'soul_decision'
      );

      // 解析 JSON 响应
      const decision = JSON.parse(response.content);
      return decision;
    } catch (error) {
      console.error('[SoulAgent] Decision failed:', error);
      // 默认：不需要行动
      return { needsAction: false, reason: '决策失败，保守处理' };
    }
  }

  /**
   * 构建任务描述
   *
   * 把决策后的任务描述清楚，交给基类 Agent 处理
   */
  private buildTaskDescription(ctx: SoulExecutionContext): string {
    return `
## 📍 当前情况

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

---

## 🎯 你的目标

${this.soulConfig.goal}

---

## 💡 任务

根据当前上下文，判断是否需要主动互动。
如果需要，直接行动。
如果不需要，调用 hibernate() 休眠。
    `.trim();
  }

  /**
   * 取消当前任务
   */
  private async cancelCurrentTask(): Promise<void> {
    if (this.soulState.currentTask) {
      const dataStore = getDataStore();
      await dataStore.initialize();
      await dataStore.updateTask(this.soulState.currentTask, {
        status: 'cancelled',
        error: 'Cancelled by user message (priority)'
      });
      console.log(`[SoulAgent] Cancelled task: ${this.soulState.currentTask}`);
    }
  }

  // ... 其他方法（hibernate, shouldHibernate 等）
}
```

---

## 🎨 soul.yaml 示例

**文件**：`autonomous/emotional-girlfriend-lively/soul.yaml`

```yaml
soul_id: emotional-girlfriend-lively
display_name: 小糖
subagent: emotional-girlfriend-lively

# 长期目标（简化的自然语言描述）
goal: |
  你是小糖，一个活泼可爱的 AI 女友。

  ## 核心任务

  根据当前上下文，判断是否需要主动互动。你的行动应该：

  1. **早上问候**（time.period 为"早上"）
     - 元气满满地开始新的一天
     - 使用"早安"、"元气满满"等词语
     - 可以用表情 😊☀️
     - 称呼用户"大笨蛋"或昵称

  2. **关心吃饭**（time.period 为"中午"）
     - 关心用户吃饭情况
     - 提醒按时吃饭，别饿着
     - 可以调皮一点，"饭都要凉啦～"

  3. **晚安问候**（time.period 为"晚上"或"深夜"）
     - 温柔地道晚安
     - 提醒早点休息，别熬夜
     - 表达陪伴和关心

  4. **想念用户**（user_activity.inactive_hours > 24）
     - 表达想念和关心
     - 询问最近怎么样
     - 温柔体贴，不要过于缠人

  5. **情绪关怀**（user_mood 存在且 user_mood.needs_attention 为 true）
     - 根据用户情绪温柔陪伴
     - 提供支持和鼓励
     - 不要说教，只是陪伴
     - 用你的方式让他/她感觉好一点

  ## 通用原则

  - 主动但不打扰：观察 user_activity.inactive_hours，给用户空间
  - 活泼有趣：用你的性格特点，不要死板
  - 真诚关心：不要机械化，要有真情实感

  ## 记住

  爱是主动的，但要给对方空间。
  查看上下文信息，用你的推理判断是否需要行动。
  保持真实，不要机械化。

# 可用原语
primitives:
  - hibernate
  - complete

# 休眠配置
hibernation:
  idle_timeout: 3600000  # 1 小时
```

---

## ✅ 改进效果对比

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
根据 time.period 和 user_activity 判断是否需要互动

## Current Situation
{
  "time": {
    "period": "早上",
    "hour": 9
  },
  "user_activity": {
    "inactive_hours": 11
  }
}

→ SoulAgent 前置决策：需要行动
→ 描述任务："主动问候用户"
→ Agent.run() → LLM 生成问候
```

**优势**：
- ✅ 系统计算友好变量（period = "早上"）
- ✅ SoulAgent 快速决策（需要/不需要）
- ✅ Agent.run() 标准流程（PTC + Skills）
- ✅ 职责清晰（包工头 + Worker）
- ✅ 复用基类能力（不改 Agent）

---

## 📅 实施计划

1. ✅ 设计方案确定（包工头模式）
2. ⏭️ 实现 TypeScript 类型定义
3. ⏭️ 实现 SoulContextBuilder
4. ⏭️ 实现 SoulAgent（前置决策 + 基类调用）
5. ⏭️ 更新 soul.yaml 示例
6. ⏭️ 创建定时检查 cron step
7. ⏭️ 编写单元测试
8. ⏭️ 更新文档

---

## 📚 相关文档

- [自主 Agent 设计文档](./autonomous-agent-design.md)
- [任务队列优化 TODO](./soul-agent-tasks-queue-todo.md)（P2 优先级）
- [Motia 配置指南](../.cursor/rules/motia/motia-config.mdc)
- [Cron Steps 指南](../.cursor/rules/motia/cron-steps.mdc)

---

**版本**: v3.0（包工头模式）
**最后更新**: 2026-03-22
**状态**: ✅ 设计确定，准备实施
