/**
 * Soul Data Service
 *
 * Data access layer for Soul agent state and execution history
 * Provides methods to save/load soul_states and soul_execution_history
 */

import { PostgresDataStore } from './postgres-store';
import { SoulState } from '../agent/soul-types';
import { SoulExecutionRecord, ExecutionHistoryQuery } from '../agent/soul-execution-types';

// Global store instance
let postgresStore: PostgresDataStore | null = null;

/**
 * Get or create PostgresDataStore instance
 */
function getPostgresStore(): PostgresDataStore {
  if (!postgresStore) {
    postgresStore = new PostgresDataStore();
  }
  return postgresStore;
}

/**
 * Soul State Data Service
 *
 * Manages soul_states table (runtime state, lightweight)
 */
export class SoulStateDataService {
  /**
   * Save soul state to database
   *
   * @param sessionId - Session ID
   * @param soulId - Soul ID
   * @param state - Soul state to save
   */
  async saveSoulState(sessionId: string, soulId: string, state: SoulState): Promise<void> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      await client.query(`
        INSERT INTO soul_states (session_id, soul_id, status, current_task_id, last_activity, scheduled_wakeup, statistics, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (session_id)
        DO UPDATE SET
          soul_id = EXCLUDED.soul_id,
          status = EXCLUDED.status,
          current_task_id = EXCLUDED.current_task_id,
          last_activity = EXCLUDED.last_activity,
          scheduled_wakeup = EXCLUDED.scheduled_wakeup,
          statistics = EXCLUDED.statistics,
          updated_at = CURRENT_TIMESTAMP
      `, [
        sessionId,
        soulId,
        state.status,
        state.currentTask,
        state.lastActivity ? new Date(state.lastActivity) : null,
        state.scheduledWakeup ? new Date(state.scheduledWakeup) : null,
        JSON.stringify(state.statistics)
      ]);

      console.log(`[SoulStateDataService] Saved soul state: ${sessionId}, status: ${state.status}`);
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to save soul state: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get soul state from database
   *
   * @param sessionId - Session ID
   * @returns Soul state or null if not found
   */
  async getSoulState(sessionId: string): Promise<SoulState | null> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT soul_id, session_id, status, current_task_id, last_activity, scheduled_wakeup, statistics
        FROM soul_states
        WHERE session_id = $1
      `, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        status: row.status,
        currentTask: row.current_task_id,
        lastActivity: row.last_activity ? new Date(row.last_activity).getTime() : null,
        scheduledWakeup: row.scheduled_wakeup ? new Date(row.scheduled_wakeup).getTime() : null,
        statistics: row.statistics || { totalTasks: 0, uptime: 0 }
      };
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to get soul state: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all active soul states
   *
   * @param soulId - Optional soul ID filter
   * @returns Array of active soul states
   */
  async getActiveSoulStates(soulId?: string): Promise<Array<{ sessionId: string; soulId: string; state: SoulState }>> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      let query = `
        SELECT session_id, soul_id, status, current_task_id, last_activity, scheduled_wakeup, statistics
        FROM soul_states
        WHERE status = 'ACTIVE'
      `;
      const params: any[] = [];

      if (soulId) {
        query += ` AND soul_id = $1`;
        params.push(soulId);
      }

      query += ` ORDER BY last_activity DESC`;

      const result = await client.query(query, params);

      return result.rows.map((row: any) => ({
        sessionId: row.session_id,
        soulId: row.soul_id,
        state: {
          status: row.status,
          currentTask: row.current_task_id,
          lastActivity: row.last_activity ? new Date(row.last_activity).getTime() : null,
          scheduledWakeup: row.scheduled_wakeup ? new Date(row.scheduled_wakeup).getTime() : null,
          statistics: row.statistics || { totalTasks: 0, uptime: 0 }
        }
      }));
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to get active soul states: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all Soul Agent states (including IDLE, HIBERNATED, ACTIVE)
   * Used by soul-agents-status API to show all instances
   */
  async getAllSoulStates(soulId?: string): Promise<Array<{ sessionId: string; soulId: string; state: SoulState }>> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      let query = `
        SELECT session_id, soul_id, status, current_task_id, last_activity, scheduled_wakeup, statistics
        FROM soul_states
        WHERE 1=1
      `;
      const params: any[] = [];

      if (soulId) {
        query += ` AND soul_id = $1`;
        params.push(soulId);
      }

      query += ` ORDER BY last_activity DESC`;

      const result = await client.query(query, params);

      return result.rows.map((row: any) => ({
        sessionId: row.session_id,
        soulId: row.soul_id,
        state: {
          status: row.status,
          currentTask: row.current_task_id,
          lastActivity: row.last_activity ? new Date(row.last_activity).getTime() : null,
          scheduledWakeup: row.scheduled_wakeup ? new Date(row.scheduled_wakeup).getTime() : null,
          statistics: row.statistics || { totalTasks: 0, uptime: 0 }
        }
      }));
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to get all soul states: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete soul state
   *
   * @param sessionId - Session ID
   */
  async deleteSoulState(sessionId: string): Promise<void> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      await client.query(`
        DELETE FROM soul_states
        WHERE session_id = $1
      `, [sessionId]);

      console.log(`[SoulStateDataService] Deleted soul state: ${sessionId}`);
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to delete soul state: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update scheduled wakeup time for a Soul Agent
   *
   * @param sessionId - Session ID
   * @param delayMs - Delay in milliseconds from now, or null to clear
   */
  async updateScheduledWakeup(sessionId: string, delayMs: number | null): Promise<void> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      const now = Date.now();
      // 使用 toISOString() 确保 PostgreSQL 正确解析为 UTC
      const scheduledWakeup = delayMs !== null
        ? new Date(now + delayMs).toISOString()
        : null;

      await client.query(`
        UPDATE soul_states
        SET scheduled_wakeup = $1::timestamp with time zone,
            updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $2
      `, [scheduledWakeup, sessionId]);

      if (delayMs !== null) {
        console.log(`[SoulStateDataService] Scheduled wakeup for ${sessionId} in ${Math.round(delayMs / 1000)}s`);
      } else {
        console.log(`[SoulStateDataService] Cleared scheduled wakeup for ${sessionId}`);
      }
    } catch (error: any) {
      console.error(`[SoulStateDataService] Failed to update scheduled wakeup: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }
}


/**
 * Soul Execution History Data Service
 *
 * Manages soul_execution_history table (execution records)
 */
export class SoulExecutionHistoryDataService {
  /**
   * Save soul execution record
   *
   * @param record - Execution record to save
   */
  async saveExecution(record: SoulExecutionRecord): Promise<void> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      await client.query(`
        INSERT INTO soul_execution_history (
          id, soul_id, session_id, user_id, triggered_at, trigger_source, trigger_data,
          started_at, completed_at, status, current_task, llm_thought_process, llm_decision,
          primitive_calls, output, error, duration
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id)
        DO UPDATE SET
          completed_at = EXCLUDED.completed_at,
          status = EXCLUDED.status,
          current_task = EXCLUDED.current_task,
          llm_thought_process = EXCLUDED.llm_thought_process,
          llm_decision = EXCLUDED.llm_decision,
          primitive_calls = EXCLUDED.primitive_calls,
          output = EXCLUDED.output,
          error = EXCLUDED.error,
          duration = EXCLUDED.duration
      `, [
        record.id,
        record.soulId,
        record.sessionId,
        record.userId,
        record.triggeredAt,
        record.triggerSource,
        JSON.stringify(record.triggerData),
        record.startedAt,
        record.completedAt || null,
        record.status,
        record.currentTask,
        record.llmThoughtProcess || null,
        record.llmDecision || null,
        JSON.stringify(record.primitiveCalls),
        record.output ? JSON.stringify(record.output) : null,
        record.error || null,
        record.duration || null
      ]);

      console.log(`[SoulExecutionHistory] Saved execution: ${record.id}, status: ${record.status}`);
    } catch (error: any) {
      console.error(`[SoulExecutionHistory] Failed to save execution: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get execution history
   *
   * @param query - Query parameters
   * @returns Array of execution records
   */
  async getExecutionHistory(query: ExecutionHistoryQuery): Promise<SoulExecutionRecord[]> {
    const store = getPostgresStore();
    await store.initialize();

    const pool = store.getPool();
    const client = await pool.connect();

    try {
      let sql = `
        SELECT id, soul_id, session_id, user_id, triggered_at, trigger_source, trigger_data,
               started_at, completed_at, status, current_task, llm_thought_process, llm_decision,
               primitive_calls, output, error, duration
        FROM soul_execution_history
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (query.soulId) {
        sql += ` AND soul_id = $${paramIndex++}`;
        params.push(query.soulId);
      }

      if (query.sessionId) {
        sql += ` AND session_id = $${paramIndex++}`;
        params.push(query.sessionId);
      }

      if (query.userId) {
        sql += ` AND user_id = $${paramIndex++}`;
        params.push(query.userId);
      }

      if (query.status) {
        sql += ` AND status = $${paramIndex++}`;
        params.push(query.status);
      }

      if (query.from) {
        sql += ` AND triggered_at >= $${paramIndex++}`;
        params.push(query.from);
      }

      if (query.to) {
        sql += ` AND triggered_at <= $${paramIndex++}`;
        params.push(query.to);
      }

      sql += ` ORDER BY triggered_at DESC`;

      if (query.limit) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(query.limit);
      }

      if (query.offset) {
        sql += ` OFFSET $${paramIndex++}`;
        params.push(query.offset);
      }

      const result = await client.query(sql, params);

      // Helper function to safely parse JSONB fields
      const safeParse = (value: any, defaultValue: any = null) => {
        if (value === null || value === undefined) return defaultValue;
        if (typeof value === 'object') return value; // Already parsed (JSONB)
        try {
          return JSON.parse(value);
        } catch {
          return defaultValue;
        }
      };

      return result.rows.map((row: any) => ({
        id: row.id,
        soulId: row.soul_id,
        sessionId: row.session_id,
        userId: row.user_id,
        triggeredAt: new Date(row.triggered_at),
        triggerSource: row.trigger_source,
        triggerData: safeParse(row.trigger_data, {}),
        startedAt: new Date(row.started_at),
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        status: row.status,
        currentTask: row.current_task,
        llmThoughtProcess: row.llm_thought_process,
        llmDecision: row.llm_decision,
        primitiveCalls: safeParse(row.primitive_calls, []),
        output: safeParse(row.output, undefined),
        error: row.error,
        duration: row.duration
      }));
    } catch (error: any) {
      console.error(`[SoulExecutionHistory] Failed to get execution history: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get recent executions (for dashboard)
   *
   * @param limit - Number of records to return
   * @returns Array of recent execution records
   */
  async getRecentExecutions(limit: number = 20): Promise<SoulExecutionRecord[]> {
    return this.getExecutionHistory({ limit });
  }
}

// Export singleton instances
export const soulStateDataService = new SoulStateDataService();
export const soulExecutionHistoryService = new SoulExecutionHistoryDataService();
