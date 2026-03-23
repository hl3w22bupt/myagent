/**
 * Soul Agent Execution History Types
 *
 * 记录 Soul Agent 的执行历史，包括触发、LLM 决策、原语调用等
 */

/**
 * Soul 执行记录
 *
 * 记录每次 Soul Agent 的完整执行过程
 */
export interface SoulExecutionRecord {
  /** 执行 ID（唯一标识） */
  id: string;

  /** Soul ID */
  soulId: string;

  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** 触发时间 */
  triggeredAt: Date;

  /** 触发来源 */
  triggerSource: string;

  /** 触发上下文数据 */
  triggerData: any;

  /** 执行开始时间 */
  startedAt: Date;

  /** 执行完成时间 */
  completedAt?: Date;

  /** 执行状态 */
  status: 'running' | 'completed' | 'failed' | 'hibernated';

  /** 当前任务描述 */
  currentTask: string;

  /** LLM 的思考过程 */
  llmThoughtProcess?: string;

  /** LLM 的决策/行动 */
  llmDecision?: string;

  /** 调用的原语 */
  primitiveCalls: PrimitiveCallRecord[];

  /** 执行结果/输出 */
  output?: any;

  /** 错误信息 */
  error?: string;

  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * 原语调用记录
 */
export interface PrimitiveCallRecord {
  /** 原语名称 */
  name: string;

  /** 调用参数 */
  arguments: any;

  /** 调用时间 */
  timestamp: Date;

  /** 调用结果 */
  result?: any;

  /** 是否成功 */
  success: boolean;

  /** 错误信息 */
  error?: string;
}

/**
 * 执行历史查询参数
 */
export interface ExecutionHistoryQuery {
  /** Soul ID */
  soulId?: string;

  /** Session ID */
  sessionId?: string;

  /** User ID */
  userId?: string;

  /** 状态过滤 */
  status?: SoulExecutionRecord['status'];

  /** 时间范围（开始） */
  from?: Date;

  /** 时间范围（结束） */
  to?: Date;

  /** 返回数量限制 */
  limit?: number;

  /** 偏移量（分页） */
  offset?: number;
}
