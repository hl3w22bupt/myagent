import {
  TaskTokenUsage,
  TotalUsage,
  TokenUsageRecordedEvent
} from '../types';

/**
 * Token Usage Storage Interface
 *
 * Abstract storage layer for token usage data.
 * Supports both PostgreSQL (production) and SQLite (development).
 * Designed for future migration to data lakes.
 *
 * NOTE: Phase 1 focuses on task-level tracking only.
 * Model/skill aggregation is done in API layer (from execution-traces stream).
 */
export interface TokenUsageStorage {
  /**
   * Initialize database tables
   * Creates necessary tables if they don't exist
   */
  initializeTables(): Promise<void>;

  /**
   * Save task-level token usage (idempotent)
   * Uses UPSERT to handle concurrent writes
   */
  saveTaskUsage(taskId: string, usage: TokenUsageRecordedEvent): Promise<void>;

  /**
   * Get token usage statistics for a specific task
   */
  getTaskUsage(taskId: string): Promise<TaskTokenUsage | null>;

  /**
   * Check if a trace has already been processed (idempotency)
   */
  isTraceProcessed(traceId: string): Promise<boolean>;

  /**
   * Mark a trace as processed
   */
  markTraceProcessed(traceId: string): Promise<void>;

  /**
   * Get total usage statistics across all tasks
   */
  getTotalUsage(startDate: Date, endDate: Date): Promise<TotalUsage>;

  /**
   * Get usage trends over time with specified granularity
   * @param startDate Start of time range
   * @param endDate End of time range
   * @param granularity Time granularity: 'hour' or 'day'
   */
  getUsageTrends(startDate: Date, endDate: Date, granularity: 'hour' | 'day'): Promise<Array<{
    timestamp: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    taskCount: number;
  }>>;

  /**
   * Execute operations in a transaction
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
