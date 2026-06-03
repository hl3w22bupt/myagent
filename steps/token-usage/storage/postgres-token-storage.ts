/**
 * PostgreSQL Token Usage Storage Implementation
 *
 * Implements TokenUsageStorage interface using pg.Pool.
 * Uses PostgreSQL with $1, $2 parameter placeholders.
 *
 * Features:
 * - Idempotent token usage tracking with UPSERT
 * - Transaction support for atomicity
 * - Optimized with indexes for performance
 * - Input validation and error logging
 */

import type { TokenUsageStorage } from './token-storage.interface.js';
import type { TaskTokenUsage, TotalUsage, TokenUsageRecordedEvent } from '../types.js';
import { Pool } from 'pg';

/**
 * PostgreSQL Token Usage Storage
 *
 * Implements token usage tracking using PostgreSQL.
 */
export class PostgresTokenUsageStorage implements TokenUsageStorage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize database tables
   * Creates 5 tables: task usage, processed traces, aggregation state, by model, by skill
   */
  async initializeTables(): Promise<void> {
    const queries = [
      // Task-level token usage
      `CREATE TABLE IF NOT EXISTS token_usage_task (
        task_id TEXT PRIMARY KEY,
        prompt_tokens BIGINT NOT NULL DEFAULT 0,
        completion_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        llm_calls_count INTEGER NOT NULL DEFAULT 0,
        first_call_at TIMESTAMPTZ,
        last_call_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // Processed traces (idempotency)
      `CREATE TABLE IF NOT EXISTS token_usage_processed_traces (
        trace_id TEXT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // Aggregation state checkpoint
      `CREATE TABLE IF NOT EXISTS token_usage_aggregation_state (
        key TEXT PRIMARY KEY,
        last_aggregated_trace_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // Model-level aggregation
      `CREATE TABLE IF NOT EXISTS token_usage_by_model (
        id SERIAL PRIMARY KEY,
        model TEXT NOT NULL,
        date DATE NOT NULL,
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens BIGINT NOT NULL DEFAULT 0,
        completion_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        llm_calls_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(model, date, hour)
      )`,

      // Skill-level aggregation
      `CREATE TABLE IF NOT EXISTS token_usage_by_skill (
        id SERIAL PRIMARY KEY,
        skill_name TEXT NOT NULL,
        date DATE NOT NULL,
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens BIGINT NOT NULL DEFAULT 0,
        completion_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        llm_calls_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(skill_name, date, hour)
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_token_usage_task_updated ON token_usage_task(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_processed_traces_processed ON token_usage_processed_traces(processed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_by_model_date_hour ON token_usage_by_model(date DESC, hour)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_by_skill_date_hour ON token_usage_by_skill(date DESC, hour)`,
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }
  }

  /**
   * Save task-level token usage (idempotent)
   * Uses UPSERT to handle concurrent writes
   */
  async saveTaskUsage(taskId: string, usage: TokenUsageRecordedEvent): Promise<void> {
    // Input validation
    if (usage.promptTokens < 0 || usage.completionTokens < 0 || usage.totalTokens < 0) {
      const error = new Error('Token counts must be non-negative');
      console.error('[PostgresTokenUsageStorage] Invalid token usage:', {
        taskId,
        usage,
        error: error.message
      });
      throw error;
    }

    try {
      const timestamp = usage.timestamp;

      // PostgreSQL UPSERT syntax
      await this.pool.query(
        `INSERT INTO token_usage_task
          (task_id, prompt_tokens, completion_tokens, total_tokens,
           llm_calls_count, first_call_at, last_call_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (task_id) DO UPDATE SET
           prompt_tokens = token_usage_task.prompt_tokens + EXCLUDED.prompt_tokens,
           completion_tokens = token_usage_task.completion_tokens + EXCLUDED.completion_tokens,
           total_tokens = token_usage_task.total_tokens + EXCLUDED.total_tokens,
           llm_calls_count = token_usage_task.llm_calls_count + EXCLUDED.llm_calls_count,
           first_call_at = CASE
             WHEN token_usage_task.first_call_at IS NULL THEN EXCLUDED.first_call_at
             ELSE token_usage_task.first_call_at
           END,
           last_call_at = GREATEST(COALESCE(token_usage_task.last_call_at, EXCLUDED.last_call_at), EXCLUDED.last_call_at),
           updated_at = NOW()`,
        [
          taskId,
          usage.promptTokens,
          usage.completionTokens,
          usage.totalTokens,
          1, // llm_calls_count
          timestamp,
          timestamp,
        ]
      );
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to save task usage:', {
        taskId,
        usage,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get token usage statistics for a specific task
   */
  async getTaskUsage(taskId: string): Promise<TaskTokenUsage | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM token_usage_task WHERE task_id = $1',
        [taskId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        taskId: row.task_id,
        promptTokens: parseInt(row.prompt_tokens),
        completionTokens: parseInt(row.completion_tokens),
        totalTokens: parseInt(row.total_tokens),
        llmCallsCount: parseInt(row.llm_calls_count),
        firstCallAt: row.first_call_at ? new Date(row.first_call_at) : null,
        lastCallAt: row.last_call_at ? new Date(row.last_call_at) : null,
        updatedAt: new Date(row.updated_at),
      };
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get task usage:', {
        taskId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check if a trace has already been processed (idempotency)
   */
  async isTraceProcessed(traceId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'SELECT 1 FROM token_usage_processed_traces WHERE trace_id = $1',
        [traceId]
      );
      return result.rows.length > 0;
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to check trace processed:', {
        traceId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Mark a trace as processed
   */
  async markTraceProcessed(traceId: string): Promise<void> {
    try {
      await this.pool.query(
        'INSERT INTO token_usage_processed_traces (trace_id, processed_at) VALUES ($1, NOW()) ON CONFLICT (trace_id) DO NOTHING',
        [traceId]
      );
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to mark trace processed:', {
        traceId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get total usage statistics across all tasks
   */
  async getTotalUsage(startDate: Date, endDate: Date): Promise<TotalUsage> {
    try {
      const result = await this.pool.query(
        `SELECT
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as task_count
         FROM token_usage_task
         WHERE first_call_at >= $1 AND first_call_at <= $2`,
        [startDate.toISOString(), endDate.toISOString()]
      );

      const row = result.rows[0];
      return {
        promptTokens: parseInt(row.prompt_tokens) || 0,
        completionTokens: parseInt(row.completion_tokens) || 0,
        totalTokens: parseInt(row.total_tokens) || 0,
        taskCount: parseInt(row.task_count) || 0,
      };
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get total usage:', {
        startDate,
        endDate,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get usage trends over time with specified granularity
   * Uses local timezone for date truncation (configurable via TZ env var)
   */
  async getUsageTrends(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day'
  ): Promise<Array<{
    timestamp: string;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    taskCount: number;
  }>> {
    try {
      const truncateUnit = granularity === 'hour' ? 'hour' : 'day';

      // Get timezone from environment, default to Asia/Shanghai (UTC+8)
      const timezone = process.env.TZ || 'Asia/Shanghai';

      // Convert to local timezone before truncating
      // This ensures dates are grouped by local day/hour, not UTC
      const result = await this.pool.query(
        `SELECT
          DATE_TRUNC('${truncateUnit}',
            (first_call_at AT TIME ZONE 'UTC' AT TIME ZONE $3)
          ) as timestamp,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
          COALESCE(SUM(completion_tokens), 0) as completion_tokens,
          COUNT(*) as task_count
         FROM token_usage_task
         WHERE first_call_at >= $1 AND first_call_at <= $2
         GROUP BY DATE_TRUNC('${truncateUnit}',
           (first_call_at AT TIME ZONE 'UTC' AT TIME ZONE $3)
         )
         ORDER BY timestamp ASC`,
        [startDate.toISOString(), endDate.toISOString(), timezone]
      );

      return result.rows.map(row => ({
        timestamp: row.timestamp,
        totalTokens: parseInt(row.total_tokens) || 0,
        promptTokens: parseInt(row.prompt_tokens) || 0,
        completionTokens: parseInt(row.completion_tokens) || 0,
        taskCount: parseInt(row.task_count) || 0,
      }));
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get usage trends:', {
        startDate,
        endDate,
        granularity,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Execute operations in a transaction
   * Provides atomicity for multi-step operations
   */
  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (error: any) {
      await client.query('ROLLBACK');
      console.error('[PostgresTokenUsageStorage] Transaction failed, rolled back:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
