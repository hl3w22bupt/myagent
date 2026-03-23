/**
 * Soul Agent Context Types
 *
 * 定义 Soul Agent 执行上下文的类型定义
 * 采用"友好变量"原则，让 LLM 容易理解
 *
 * @module SoulContextTypes
 */

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
    period: TimePeriod;

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
  user_mood?: UserMoodContext;

  /**
   * 触发信息
   */
  trigger: {
    /**
     * 触发来源
     */
    source: TriggerSource;

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
 * 时间段类型
 */
export type TimePeriod =
  | '深夜'  // 0-5点
  | '早上'  // 6-8点
  | '上午'  // 9-11点
  | '中午'  // 12-13点
  | '下午'  // 14-17点
  | '傍晚'  // 18-19点
  | '晚上'; // 20-23点

/**
 * 触发来源类型
 */
export type TriggerSource =
  | 'periodic_check'     // 定时检查
  | 'user_message'       // 用户消息（API 触发）
  | 'emotion_detection'  // 情绪检测触发
  | 'webhook'            // Webhook 触发
  | 'manual'             // 手动触发
  | string;              // 其他自定义来源

/**
 * 用户情绪上下文
 */
export interface UserMoodContext {
  /**
   * 当前情绪
   */
  current: string;  // "happy" | "sad" | "neutral" | "stressed" | ...

  /**
   * 情绪趋势
   */
  trend: MoodTrend;

  /**
   * 连续次数（用于判断是否需要关注）
   */
  consecutive_count?: number;

  /**
   * 是否需要特别关注
   */
  needs_attention: boolean;
}

/**
 * 情绪趋势类型
 */
export type MoodTrend =
  | '持续低落'
  | '持续上升'
  | '平稳'
  | '波动';

/**
 * 原始触发上下文（来自系统或外部服务）
 */
export interface RawTriggerContext {
  /**
   * 触发来源
   */
  source: TriggerSource;

  /**
   * 触发数据
   */
  data: Record<string, any>;
}

/**
 * Soul Agent 执行输入
 */
export interface SoulInput {
  /**
   * 触发时间（ISO 8601 格式）
   */
  trigger_time: string;

  /**
   * 触发上下文
   */
  context: RawTriggerContext;

  /**
   * Stream 相关（可选）
   */
  streams?: any;
}

/**
 * 前置决策结果
 *
 * SoulAgent 在调用基类 Agent.run() 之前的决策结果
 */
export interface DecisionResult {
  /**
   * 是否需要行动
   */
  needsAction: boolean;

  /**
   * 决策原因
   */
  reason: string;

  /**
   * 任务类型（可选）
   */
  taskType?: 'greeting' | 'care' | 'check_in' | 'response';
}
