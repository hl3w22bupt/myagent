# Soul Prompt 设计改进方案

## 📋 概述

本文档记录了对 `soul.yaml` 中 goal prompt 设计的改进方案，采用**结构化上下文 + 预计算友好变量**的方法，让 LLM 基于推理能力判断何时行动，而不是依赖精确的规则匹配。

**创建时间**：2026-03-22
**状态**：✅ 设计确定
**方案**：结构化上下文 + LLM 推理

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
   - 系统应该负责"提供友好上下文"
   - LLM 应该负责"基于上下文推理"

3. **Prompt 冗余**
   - 把判断规则写在 prompt 里，每次都要传递
   - LLM 还要做额外的条件判断

4. **规则引擎的陷阱**（已否决的方案）
   - 需要预定义变量字典 → 扩展性差
   - 编写规则有学习门槛 → 伪智能
   - 回到传统规则系统的老路 → 失去了 LLM 的灵活性

---

## 💡 最终方案：结构化上下文 + LLM 推理

### 核心原则

```
系统计算友好变量 → 结构化上下文 → LLM 推理判断 → 生成内容
```

### 职责划分

| 职责 | 负责方 | 理由 |
|-----|-------|------|
| 时间计算（当前时间段） | 系统代码 | 确定性逻辑，计算友好变量 |
| 状态计算（未活跃小时数） | 系统代码 | 精确计算，生成相对时间描述 |
| 复杂业务逻辑（情绪分析） | myecho 服务 | 专业服务，提供分析结果 |
| 简单推理（是否需要互动） | LLM | 基于友好变量进行推理判断 |
| 内容生成（如何表达） | LLM | 创造性内容，LLM 擅长 |

### 关键设计决策

1. **不引入规则引擎** - 避免伪智能和学习门槛
2. **预计算友好变量** - 系统负责将原始数据转换为 LLM 易理解的形式
3. **结构化 JSON 注入** - 现代 LLM 理解 JSON 很好
4. **混合模式** - 简单逻辑 LLM 推理，复杂逻辑服务计算

---

## 📐 架构设计

### 数据流

```
┌─────────────────────────────────────────────────────────┐
│  触发源（Cron/Event/API）                                 │
│  - trigger_time: "2026-03-22T09:00:00Z"                  │
│  - context: { source, data }                             │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  SoulContextBuilder                                      │
│  - 计算友好变量（time_period, inactive_hours 等）          │
│  - 构建结构化上下文（SoulExecutionContext）               │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  buildTaskPrompt                                         │
│  - 将结构化上下文以 JSON 格式注入 prompt                  │
│  - 组合 System Prompt + Goal + Context                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  LLM 推理与生成                                          │
│  - 理解当前上下文                                         │
│  - 推理是否需要行动                                       │
│  - 生成符合风格的内容                                     │
└─────────────────────────────────────────────────────────┘
```

### 代码架构

```
src/core/
├── agent/
│   ├── soul-context-types.ts      # TypeScript 类型定义
│   └── soul-agent.ts               # SoulAgent 类（更新 buildTaskPrompt）
└── context/
    └── soul-context-builder.ts     # 上下文构建器

autonomous/
└── emotional-girlfriend-lively/
    └── soul.yaml                    # Soul 配置（简化的 goal）
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

## 📝 更新 buildTaskPrompt

**文件**：`src/core/agent/soul-agent.ts`

```typescript
import { SoulContextBuilder } from '../context/soul-context-builder';

/**
 * 构建任务提示词（更新版本）
 *
 * 使用结构化上下文，让 LLM 基于友好的变量进行推理
 */
private buildTaskPrompt(trigger_time: string, triggerContext: any): string {
  // 1. 使用 ContextBuilder 构建友好的上下文
  const ctx = SoulContextBuilder.build(trigger_time, triggerContext);

  // 2. 构建结构化的提示词
  return `
## 📍 当前情况

以下是你当前的所有上下文信息，用这些信息来判断是否需要行动：

\`\`\`json
${JSON.stringify(ctx, null, 2)}
\`\`\`

---

## 🎯 你的目标

${this.soulConfig.goal}

---

## 💡 如何使用这些信息

- 查看 \`time.period\` 了解当前是早上/中午/晚上
- 查看 \`user_activity.inactive_hours\` 了解用户多久没活跃了
- 查看 \`user_mood\` 了解用户情绪状态（如果有）
- 用你的推理能力判断：**现在**是否需要主动互动？
- 如果不需要，调用 \`hibernate()\`
- 如果需要，直接行动，完成后调用 \`hibernate()\`
  `.trim();
}
```

---

## 🎨 soul.yaml 示例

**文件**：`autonomous/emotional-girlfriend-lively/soul.yaml`（更新版）

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
  - schedule
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
查看 time.period，如果是"早上"，元气问候

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

→ LLM 推理：现在是早上，用户11小时没活跃了，我应该问候
```

**优势**：
- ✅ 系统计算友好变量（period = "早上"）
- ✅ LLM 基于推理判断（而不是精确匹配）
- ✅ Prompt 更简洁（自然语言描述）
- ✅ 职责清晰（系统管计算，LLM 管推理）

---

## 🚀 扩展性

### 添加新的上下文字段

只需在 `SoulContextBuilder` 中添加新的计算逻辑：

```typescript
// 1. 在类型定义中添加字段
export interface SoulExecutionContext {
  // ... 现有字段
  weather?: {
    condition: string;  // "晴" | "雨" | "多云"
    temperature: number;
  };
}

// 2. 在 ContextBuilder 中添加计算
private static buildWeatherContext(data: Record<string, any>) {
  return {
    condition: data.weather_condition,
    temperature: data.temperature,
  };
}

// 3. soul.yaml 自然就可以使用
goal: |
  ## 根据天气调整问候
  - weather.condition 为"雨"时，提醒带伞
```

### 集成 myecho 服务

```typescript
// myecho 服务计算复杂逻辑后，通过 API 触发
await context.executeSoul('emotional-girlfriend-lively', userId, {
  trigger_time: new Date().toISOString(),
  context: {
    source: 'emotion_detection',
    data: {
      // myecho 服务已经计算好的结果
      mood: 'sad',
      mood_trend: '持续低落',
      consecutive_count: 3,
      needs_attention: true,
      // 额外的分析结果
      stress_level: 0.8,
      recommended_action: 'gentle_companionship'
    }
  }
});
```

---

## 📚 相关文档

- [自主 Agent 设计文档](./autonomous-agent-design.md)
- [Motia 配置指南](../.cursor/rules/motia/motia-config.mdc)
- [Cron Steps 指南](../.cursor/rules/motia/cron-steps.mdc)

---

## 📅 实施计划

1. ✅ 设计方案确定
2. ⏭️ 实现 TypeScript 类型定义
3. ⏭️ 实现 SoulContextBuilder
4. ⏭️ 更新 SoulAgent.buildTaskPrompt
5. ⏭️ 更新 soul.yaml 示例
6. ⏭️ 编写单元测试
7. ⏭️ 更新文档

---

**版本**: v2.0
**最后更新**: 2026-03-22
**状态**: ✅ 设计确定，准备实施
