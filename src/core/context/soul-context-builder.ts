/**
 * Soul Context Builder
 *
 * 将原始触发数据转换为 LLM 友好的结构化上下文
 * 系统负责计算友好变量，LLM 负责推理判断
 *
 * @module SoulContextBuilder
 */

import {
  SoulExecutionContext,
  RawTriggerContext,
  TimePeriod,
  MoodTrend
} from '../agent/soul-context-types.js';

/**
 * Soul Context Builder
 *
 * 职责：将原始触发数据转换为 LLM 友好的结构化上下文
 * - 计算友好变量（时间段、相对时间等）
 * - 预计算布尔判断（是否长时间未活跃等）
 * - 提供情绪状态分析
 */
export class SoulContextBuilder {
  /**
   * 构建完整的执行上下文
   *
   * @param triggerTime - 触发时间（ISO 8601 格式）
   * @param rawContext - 原始触发上下文
   * @returns 结构化的执行上下文
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
   *
   * 将时间转换为友好的中文描述和布尔判断
   *
   * @param date - 触发时间
   * @returns 时间上下文
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
   *
   * @param hour - 小时数（0-23）
   * @returns 时间段
   */
  private static getTimePeriod(hour: number): TimePeriod {
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
   *
   * 计算未活跃小时数，并生成相对时间描述
   *
   * @param data - 原始数据（可能包含 last_interaction 字段）
   * @returns 用户活跃状态上下文
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
   *
   * @param hours - 小时数
   * @returns 相对时间描述
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
   *
   * 如果有情绪数据，进行情绪趋势分析和关注判断
   *
   * @param data - 原始数据（可能包含 mood、detected_mood 等字段）
   * @returns 用户情绪上下文，如果没有情绪数据则返回 undefined
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
   *
   * @param mood - 当前情绪
   * @param consecutiveCount - 连续次数
   * @returns 情绪趋势
   */
  private static calculateMoodTrend(mood: string, consecutiveCount: number): MoodTrend {
    if (consecutiveCount >= 3 && (mood === 'sad' || mood === 'stressed')) {
      return '持续低落';
    }
    return '平稳';
  }

  /**
   * 判断是否需要情绪关注
   *
   * @param mood - 当前情绪
   * @param consecutiveCount - 连续次数
   * @returns 是否需要关注
   */
  private static needsMoodAttention(mood: string, consecutiveCount: number): boolean {
    return (mood === 'sad' || mood === 'stressed') && consecutiveCount >= 3;
  }
}
