/**
 * Token Usage Tracking Type Definitions
 */

/**
 * Token usage base type
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Task-level token usage statistics
 */
export interface TaskTokenUsage extends TokenUsage {
  taskId: string;
  llmCallsCount: number;
  firstCallAt: Date | null;
  lastCallAt: Date | null;
  updatedAt: Date;
}

/**
 * Token usage recorded event (extracted from trace)
 */
export interface TokenUsageRecordedEvent {
  traceId: string;           // Idempotency key
  taskId: string;
  agentId?: string;
  skillName?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string;
}

/**
 * Model aggregation statistics
 */
export interface ModelUsage extends TokenUsage {
  model: string;
  date: string;  // YYYY-MM-DD
  hour: number;  // 0-23
  llmCallsCount: number;
}

/**
 * Skill aggregation statistics
 */
export interface SkillUsage extends TokenUsage {
  skillName: string;
  date: string;
  hour: number;
  llmCallsCount: number;
}

/**
 * Time range type
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'custom';

/**
 * Total usage statistics
 */
export interface TotalUsage extends TokenUsage {}

/**
 * Usage trend data point
 */
export interface UsageTrend {
  timestamp: string;  // ISO 8601
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Database interface for token usage storage
 * Provides SQL-level operations for token usage queries
 */
export interface Database {
  exec(sql: string, params?: any[]): Promise<void>;
  run(sql: string, params?: any[]): Promise<void>;
  get(sql: string, params?: any[]): Promise<any>;
  all(sql: string, params?: any[]): Promise<any[]>;
  config?: {
    dialect?: string;
    client?: string;
  };
}
