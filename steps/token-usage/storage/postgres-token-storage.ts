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

      // Per-call timeline entries for detailed breakdown
      `CREATE TABLE IF NOT EXISTS token_usage_timeline (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL,
        trace_id TEXT UNIQUE NOT NULL,
        agent_id TEXT,
        skill_name TEXT,
        model TEXT NOT NULL,
        provider TEXT NOT NULL,
        prompt_tokens BIGINT NOT NULL DEFAULT 0,
        completion_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,

      // Task execution events for stream history persistence
      `CREATE TABLE IF NOT EXISTS task_execution_events (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'task',
        status TEXT,
        output TEXT,
        error TEXT,
        current_step TEXT,
        skill TEXT,
        stage TEXT,
        progress_type TEXT,
        execution_time INTEGER,
        session_id TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(task_id, event_id)
      )`,

      // Indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_token_usage_task_updated ON token_usage_task(updated_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_processed_traces_processed ON token_usage_processed_traces(processed_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_by_model_date_hour ON token_usage_by_model(date DESC, hour)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_by_skill_date_hour ON token_usage_by_skill(date DESC, hour)`,
      `CREATE INDEX IF NOT EXISTS idx_token_usage_timeline_task ON token_usage_timeline(task_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_task_execution_events_task ON task_execution_events(task_id, created_at)`,
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
   * Save a timeline entry for per-call token usage tracking.
   */
  async saveTimelineEntry(event: TokenUsageRecordedEvent): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO token_usage_timeline
          (task_id, trace_id, agent_id, skill_name, model, provider,
           prompt_tokens, completion_tokens, total_tokens, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (trace_id) DO NOTHING`,
        [
          event.taskId,
          event.traceId,
          event.agentId || null,
          event.skillName || null,
          event.model,
          event.provider,
          event.promptTokens,
          event.completionTokens,
          event.totalTokens,
          event.timestamp,
        ]
      );
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to save timeline entry:', {
        traceId: event.traceId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get task timeline with breakdown by skill and model.
   */
  async getTaskTimeline(taskId: string): Promise<{
    timeline: Array<{
      timestamp: string;
      skillName: string;
      agentId: string | null;
      llmUsage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        model: string;
        provider: string;
      };
    }>;
    bySkill: Array<{
      skillName: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      llmCallsCount: number;
    }>;
    byModel: Array<{
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      llmCallsCount: number;
    }>;
  }> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM token_usage_timeline
         WHERE task_id = $1
         ORDER BY created_at ASC`,
        [taskId]
      );

      const rows = result.rows as Array<{
        task_id: string;
        trace_id: string;
        agent_id: string | null;
        skill_name: string | null;
        model: string;
        provider: string;
        prompt_tokens: string;
        completion_tokens: string;
        total_tokens: string;
        created_at: string;
      }>;

      const timeline: any[] = [];
      const bySkill: Record<string, any> = {};
      const byModel: Record<string, any> = {};

      for (const row of rows) {
        const promptTokens = parseInt(row.prompt_tokens) || 0;
        const completionTokens = parseInt(row.completion_tokens) || 0;
        const totalTokens = parseInt(row.total_tokens) || 0;

        timeline.push({
          timestamp: row.created_at,
          skillName: row.skill_name,
          agentId: row.agent_id,
          llmUsage: {
            promptTokens,
            completionTokens,
            totalTokens,
            model: row.model,
            provider: row.provider,
          },
        });

        const skill = row.skill_name || 'Agent直接调用';
        if (!bySkill[skill]) {
          bySkill[skill] = {
            skillName: skill,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            llmCallsCount: 0,
          };
        }
        bySkill[skill].promptTokens += promptTokens;
        bySkill[skill].completionTokens += completionTokens;
        bySkill[skill].totalTokens += totalTokens;
        bySkill[skill].llmCallsCount += 1;

        const model = row.model || 'unknown';
        if (!byModel[model]) {
          byModel[model] = {
            model,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            llmCallsCount: 0,
          };
        }
        byModel[model].promptTokens += promptTokens;
        byModel[model].completionTokens += completionTokens;
        byModel[model].totalTokens += totalTokens;
        byModel[model].llmCallsCount += 1;
      }

      return {
        timeline,
        bySkill: Object.values(bySkill),
        byModel: Object.values(byModel),
      };
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get task timeline:', {
        taskId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Save a task execution event for stream history persistence.
   */
  async saveExecutionEvent(eventData: {
    taskId: string;
    eventId: string;
    type?: string;
    status?: string;
    output?: string;
    error?: string;
    currentStep?: string;
    skill?: string;
    stage?: string;
    progressType?: string;
    executionTime?: number;
    sessionId?: string;
    role?: string;
    content?: string;
    taskDescription?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO task_execution_events
          (task_id, event_id, event_type, status, output, error, current_step,
           skill, stage, progress_type, execution_time, session_id, role, content, task_description, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
         ON CONFLICT (task_id, event_id) DO UPDATE SET
           status = EXCLUDED.status,
           output = EXCLUDED.output,
           error = EXCLUDED.error,
           current_step = EXCLUDED.current_step,
           execution_time = EXCLUDED.execution_time,
           role = EXCLUDED.role,
           content = EXCLUDED.content,
           task_description = EXCLUDED.task_description,
           metadata = EXCLUDED.metadata`,
        [
          eventData.taskId,
          eventData.eventId,
          eventData.type || 'task',
          eventData.status || null,
          eventData.output || null,
          eventData.error || null,
          eventData.currentStep || null,
          eventData.skill || null,
          eventData.stage || null,
          eventData.progressType || null,
          eventData.executionTime || null,
          eventData.sessionId || null,
          eventData.role || null,
          eventData.content || null,
          eventData.taskDescription || null,
          eventData.metadata ? JSON.stringify(eventData.metadata) : null,
        ]
      );
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to save execution event:', {
        taskId: eventData.taskId,
        eventId: eventData.eventId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all execution events for a task.
   */
  async getExecutionEvents(taskId: string): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM task_execution_events
         WHERE task_id = $1
         ORDER BY created_at ASC`,
        [taskId]
      );

      return result.rows.map((row: any) => ({
        id: row.event_id,
        taskId: row.task_id,
        type: row.event_type,
        category: row.event_type
          ? (['agent', 'intent_analysis', 'ptc_planning', 'delegation_planning', 'delegation_plan', 'task_decomposition', 'awaiting_clarification'].includes(row.event_type) ? 'agent_hook' : undefined)
          : undefined,
        status: row.status,
        output: row.output,
        error: row.error,
        currentStep: row.current_step,
        skill: row.skill,
        stage: row.stage,
        progressType: row.progress_type,
        executionTime: row.execution_time,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        task: row.task_description,
        timestamp: row.created_at,
        metadata: row.metadata,
      }));
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get execution events:', {
        taskId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Save an execution trace to the database.
   */
  async saveExecutionTrace(traceData: {
    id: string;
    taskId: string;
    level: string;
    stage?: string;
    agentId?: string;
    skillName?: string;
    parentId?: string;
    status: string;
    inputData?: any;
    outputData?: any;
    errorData?: any;
    isRetry?: boolean;
    retryAttempt?: number;
    retryReason?: string;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    timestamp?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO execution_traces
          (task_id, trace_id, level, stage, agent_id, skill_name, parent_id,
           status, input_data, output_data, error_data, is_retry, retry_attempt,
           retry_reason, started_at, completed_at, duration_ms, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (task_id, trace_id) DO UPDATE SET
           status = EXCLUDED.status,
           output_data = EXCLUDED.output_data,
           error_data = EXCLUDED.error_data,
           duration_ms = EXCLUDED.duration_ms,
           metadata = EXCLUDED.metadata`,
        [
          traceData.taskId,
          traceData.id,
          traceData.level,
          traceData.stage || null,
          traceData.agentId || null,
          traceData.skillName || null,
          traceData.parentId || null,
          traceData.status,
          traceData.inputData ? JSON.stringify(traceData.inputData) : null,
          traceData.outputData ? JSON.stringify(traceData.outputData) : null,
          traceData.errorData ? JSON.stringify(traceData.errorData) : null,
          traceData.isRetry || false,
          traceData.retryAttempt || 0,
          traceData.retryReason || null,
          traceData.startedAt || null,
          traceData.completedAt || null,
          traceData.durationMs || null,
          traceData.metadata ? JSON.stringify(traceData.metadata) : null,
          traceData.timestamp || new Date().toISOString(),
        ]
      );
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to save execution trace:', {
        traceId: traceData.id,
        taskId: traceData.taskId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get all execution traces for a task.
   */
  async getExecutionTraces(taskId: string): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM execution_traces
         WHERE task_id = $1
         ORDER BY created_at ASC`,
        [taskId]
      );

      return result.rows.map((row: any) => ({
        id: row.trace_id,
        taskId: row.task_id,
        level: row.level,
        stage: row.stage,
        agentId: row.agent_id,
        skillName: row.skill_name,
        parentId: row.parent_id,
        status: row.status,
        inputData: row.input_data,
        outputData: row.output_data,
        errorData: row.error_data,
        isRetry: row.is_retry,
        retryAttempt: row.retry_attempt,
        retryReason: row.retry_reason,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        durationMs: row.duration_ms,
        timestamp: row.created_at,
        metadata: row.metadata,
      }));
    } catch (error: any) {
      console.error('[PostgresTokenUsageStorage] Failed to get execution traces:', {
        taskId,
        error: error.message,
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
