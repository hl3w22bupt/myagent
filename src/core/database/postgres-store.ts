/**
 * PostgreSQL Data Store
 *
 * PostgreSQL implementation of the Database interface.
 * Supports concurrent writes and proper transaction handling.
 */

import { Pool } from 'pg';
import type { Database } from './database.interface';
import type {
  Task,
  TaskStatus,
  Session,
  CreateTaskData,
  User,
  UserProfile,
} from './data-store';
import type {
  TaskContext,
  ArtifactIndex,
  CompressionHistory,
  OutputIndex,
  ConversationRound,
} from './context-types';

/**
 * PostgreSQL DataStore configuration
 */
export interface PostgresDataStoreConfig {
  /** PostgreSQL connection URL or config */
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** Connection pool size */
  max?: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMillis?: number;
}

/**
 * PostgreSQL DataStore
 *
 * Uses connection pooling for better performance.
 * All operations are transactional and thread-safe.
 */
export class PostgresDataStore implements Database {
  private pool: Pool;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: PostgresDataStoreConfig = {}) {
    // Use connection string or individual parameters
    const poolConfig: any = {};

    if (config.connectionString) {
      poolConfig.connectionString = config.connectionString;
    } else {
      poolConfig.host = config.host || process.env.PG_HOST || 'localhost';
      poolConfig.port = config.port || parseInt(process.env.PG_PORT || '5432');
      poolConfig.database = config.database || process.env.PG_DATABASE || 'myagent';
      poolConfig.user = config.user || process.env.PG_USER || 'postgres';
      poolConfig.password = config.password || process.env.PG_PASSWORD || 'postgres';
    }

    poolConfig.max = config.max || 20;
    poolConfig.connectionTimeoutMillis = config.connectionTimeoutMillis || 10000;

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('[PostgresDataStore] Unexpected error on idle client', err);
    });
  }

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    console.log('[PostgresDataStore] Initializing PostgreSQL connection...');

    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Initialize schema
      await this.initSchema();

      console.log('[PostgresDataStore] Initialized successfully');
    } catch (error: any) {
      console.error('[PostgresDataStore] Failed to initialize:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('[PostgresDataStore] Connection pool closed');
  }

  private async initSchema(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // 🔒 获取 PostgreSQL Advisory Lock (跨进程互斥)
      // 使用固定的 lock key (12345) 防止多个进程并发初始化
      const lockResult = await client.query('SELECT pg_try_advisory_lock(12345) as locked');

      if (!lockResult.rows[0].locked) {
        console.warn('[PostgresDataStore] Another process is initializing schema, waiting...');
        // 等待获取锁
        await client.query('SELECT pg_advisory_lock(12345)');
      }

      try {
        await client.query('BEGIN');

        // Helper function to execute query and ignore initialization errors
        const safeQuery = async (query: string) => {
          // Create a savepoint before each query
          const savepoint = `safe_query_sp_${Math.random().toString(36).substr(2, 9)}`;
          await client.query(`SAVEPOINT ${savepoint}`);

          try {
            await client.query(query);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);
          } catch (error: any) {
            // Rollback to savepoint on error to keep transaction alive
            await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            await client.query(`RELEASE SAVEPOINT ${savepoint}`);

            // Ignore errors if the object already exists or during concurrent initialization
            const isIgnorableError =
              error.message.includes('already exists') ||
              error.message.includes('duplicate key') ||
              error.code === '40P01' || // deadlock
              error.code === '42P07' ||  // duplicate_table
              error.code === '42P06';    // duplicate_schema

            if (!isIgnorableError) {
              throw error;
            }

            // Log ignored concurrent initialization errors for debugging
            if (error.code === '40P01') {
              console.warn('[PostgresDataStore] Ignoring concurrent initialization deadlock (this is normal)');
            }
          }
        };

      // Tasks table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          session_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'awaiting_clarification', 'idle')),
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          completed_at BIGINT,
          output TEXT,
          error TEXT,
          execution_time INTEGER,
          metadata JSONB,
          structured_output JSONB,
          ptc_codes JSONB,
          retry_count INTEGER DEFAULT 0,
          is_retry BOOLEAN DEFAULT FALSE
        )
      `);

      // Indexes
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)');

      // Composite index for common query patterns
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_tasks_session_status_created ON tasks(session_id, status, created_at DESC)');

      await client.query('COMMIT');

      // Note: VACUUM ANALYZE should NOT be run in business initialization flow
      // Use autovacuum or scheduled maintenance scripts instead
      // See: /scripts/db-maintenance.ts or cron jobs

      await client.query('BEGIN');

      // Task contexts table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS task_contexts (
          task_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          current_turn INTEGER DEFAULT 1,
          conversation_rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
          messages_count INTEGER DEFAULT 0,
          summary JSONB NOT NULL DEFAULT '{}'::jsonb,
          skill_execution_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          tool_usage_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          working_memory JSONB NOT NULL DEFAULT '{}'::jsonb,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);

      // Migration: Add execution history columns if they don't exist
      await safeQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'task_contexts' AND column_name = 'skill_execution_history'
          ) THEN
            ALTER TABLE task_contexts ADD COLUMN skill_execution_history JSONB NOT NULL DEFAULT '[]'::jsonb;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'task_contexts' AND column_name = 'tool_usage_history'
          ) THEN
            ALTER TABLE task_contexts ADD COLUMN tool_usage_history JSONB NOT NULL DEFAULT '[]'::jsonb;
          END IF;
        END $$;
      `);

      // Artifacts table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS artifacts (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          artifact_type TEXT NOT NULL,
          action TEXT NOT NULL,
          path TEXT NOT NULL,
          description TEXT,
          commit_hash TEXT,
          metadata JSONB,
          timestamp BIGINT NOT NULL
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id)');

      // Compression history table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS compression_history (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          compressed_at BIGINT NOT NULL,
          original_token_count INTEGER NOT NULL,
          compressed_token_count INTEGER NOT NULL,
          compression_ratio REAL NOT NULL,
          summary JSONB NOT NULL,
          truncated_message_ids JSONB
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_compression_task_id ON compression_history(task_id)');

      // Outputs table - Track multi-round conversation outputs
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS outputs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          round INTEGER NOT NULL,
          output TEXT NOT NULL,
          execution_time INTEGER,
          timestamp BIGINT NOT NULL
        )
      `);

      // Indexes for outputs table
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_outputs_task_id ON outputs(task_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON outputs(session_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_outputs_round ON outputs(task_id, round)');

      // Sessions table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id TEXT PRIMARY KEY,
          created_at BIGINT NOT NULL,
          last_active_at BIGINT NOT NULL,
          metadata JSONB
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC)');

      // Users table
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY,
          profile JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          last_session_id TEXT
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_users_last_session ON users(last_session_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)');

      // 自动迁移：为 artifacts 表添加 metadata 列（如果不存在）
      await safeQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'artifacts' AND column_name = 'metadata'
          ) THEN
            ALTER TABLE artifacts ADD COLUMN metadata JSONB;
          END IF;
        END $$;
      `);

      // 自动迁移：为 tasks 表添加 pinned 列（如果不存在）
      await safeQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name = 'pinned'
          ) THEN
            ALTER TABLE tasks ADD COLUMN pinned BOOLEAN DEFAULT FALSE;
          END IF;
        END $$;
      `);

      // 自动迁移：为 task_contexts 表添加 conversation_rounds 和 messages_count 列（如果不存在）
      await safeQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'task_contexts' AND column_name = 'conversation_rounds'
          ) THEN
            ALTER TABLE task_contexts ADD COLUMN conversation_rounds JSONB NOT NULL DEFAULT '[]'::jsonb;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'task_contexts' AND column_name = 'messages_count'
          ) THEN
            ALTER TABLE task_contexts ADD COLUMN messages_count INTEGER DEFAULT 0;
          END IF;
        END $$;
      `);

      // 创建 favorites 表
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS favorites (
          id TEXT PRIMARY KEY,
          artifact_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          artifact_type TEXT NOT NULL,
          path TEXT NOT NULL,
          description TEXT,
          metadata JSONB,
          created_at BIGINT NOT NULL
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(artifact_type)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_favorites_task_id ON favorites(task_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_favorites_artifact_id ON favorites(artifact_id)');

      // Soul tables
      // soul_states table (runtime state, lightweight)
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS soul_states (
          session_id TEXT PRIMARY KEY,
          soul_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'HIBERNATED', 'IDLE', 'STOPPED')),
          current_task_id TEXT,
          last_activity TIMESTAMP,
          scheduled_wakeup TIMESTAMP,
          statistics JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_states_soul_id ON soul_states(soul_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_states_status ON soul_states(status)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_states_last_activity ON soul_states(last_activity DESC)');

      // soul_execution_history table (execution records)
      await safeQuery(`
        CREATE TABLE IF NOT EXISTS soul_execution_history (
          id TEXT PRIMARY KEY,
          soul_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          triggered_at TIMESTAMP NOT NULL,
          trigger_source TEXT NOT NULL,
          trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          started_at TIMESTAMP NOT NULL,
          completed_at TIMESTAMP,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'hibernated')),
          current_task TEXT NOT NULL,
          llm_thought_process TEXT,
          llm_decision TEXT,
          primitive_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
          output JSONB,
          error TEXT,
          duration INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_execution_history_soul_id ON soul_execution_history(soul_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_execution_history_session_id ON soul_execution_history(session_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_execution_history_user_id ON soul_execution_history(user_id)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_execution_history_status ON soul_execution_history(status)');
      await safeQuery('CREATE INDEX IF NOT EXISTS idx_soul_execution_history_triggered_at ON soul_execution_history(triggered_at DESC)');

      // 迁移：移除所有遗留的外键约束
      await safeQuery(`
        DO $$
        BEGIN
          -- 移除 task_contexts 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'task_contexts_task_id_fkey'
              AND table_name = 'task_contexts'
          ) THEN
            ALTER TABLE task_contexts DROP CONSTRAINT task_contexts_task_id_fkey;
          END IF;

          -- 移除 messages 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'messages_task_id_fkey'
              AND table_name = 'messages'
          ) THEN
            ALTER TABLE messages DROP CONSTRAINT messages_task_id_fkey;
          END IF;

          -- 移除 artifacts 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'artifacts_task_id_fkey'
              AND table_name = 'artifacts'
          ) THEN
            ALTER TABLE artifacts DROP CONSTRAINT artifacts_task_id_fkey;
          END IF;

          -- 移除 compression_history 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'compression_history_task_id_fkey'
              AND table_name = 'compression_history'
          ) THEN
            ALTER TABLE compression_history DROP CONSTRAINT compression_history_task_id_fkey;
          END IF;

          -- 移除 outputs 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'outputs_task_id_fkey'
              AND table_name = 'outputs'
          ) THEN
            ALTER TABLE outputs DROP CONSTRAINT outputs_task_id_fkey;
          END IF;

          -- 移除 favorites 的外键约束
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_favorites_task'
              AND table_name = 'favorites'
          ) THEN
            ALTER TABLE favorites DROP CONSTRAINT fk_favorites_task;
          END IF;

          -- 移除 favorites 的 artifact_id 外键约束（遗留）
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_favorites_artifact'
              AND table_name = 'favorites'
          ) THEN
            ALTER TABLE favorites DROP CONSTRAINT fk_favorites_artifact;
          END IF;
        END $$;
      `);

      await client.query('COMMIT');
      console.log('[PostgresDataStore] Schema initialized');
      } finally {
        // 🔓 释放 Advisory Lock
        await client.query('SELECT pg_advisory_unlock(12345)');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  async createTask(data: CreateTaskData): Promise<Task> {
    const client = await this.pool.connect();

    try {
      const now = Date.now();
      const result = await client.query(
        `INSERT INTO tasks (id, task, session_id, status, app, created_at, updated_at, completed_at, output, error, execution_time, metadata, structured_output, retry_count, is_retry)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          data.id,
          data.task,
          data.sessionId,
          data.status,
          data.app || 'default',  // App identifier
          now,
          now,
          data.completedAt?.getTime(),
          data.output,
          data.error,
          data.executionTime,
          data.metadata || null,  // 直接传入对象，node-postgres 自动处理为 JSONB
          data.structuredOutput || null,  // 直接传入对象，node-postgres 自动处理为 JSONB
          data.retryCount || 0,
          // Convert boolean to integer for PostgreSQL
          data.isRetry ? 1 : 0,
        ]
      );

      const task = this.mapDbTaskToTask(result.rows[0]);

      // 创建或更新会话记录
      await this.upsertSession(data.sessionId);

      return task;
    } finally {
      client.release();
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbTaskToTask(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Task> {
    const client = await this.pool.connect();

    try {
      const current = await this.getTask(taskId);
      if (!current) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const updated = {
        ...current,
        ...updates,
        updatedAt: new Date(),
      };

      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        fields.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.output !== undefined) {
        fields.push(`output = $${paramIndex++}`);
        values.push(updates.output);
      }
      if (updates.error !== undefined) {
        fields.push(`error = $${paramIndex++}`);
        values.push(updates.error);
      }
      if (updates.executionTime !== undefined) {
        fields.push(`execution_time = $${paramIndex++}`);
        values.push(updates.executionTime);
      }
      if (updates.metadata !== undefined) {
        fields.push(`metadata = $${paramIndex++}`);
        // 🔧 FIX: 显式序列化为 JSON 字符串，确保正确存储为 JSONB
        // PostgreSQL 会自动将 JSON 字符串解析为 JSONB 类型
        values.push(JSON.stringify(updates.metadata));
      }
      if (updates.structuredOutput !== undefined) {
        fields.push(`structured_output = $${paramIndex++}`);
        // 显式序列化为 JSON 字符串，确保正确存储为 JSONB
        values.push(JSON.stringify(updates.structuredOutput));
      }
      if (updates.ptcCodes !== undefined) {
        fields.push(`ptc_codes = $${paramIndex++}`);
        // 显式序列化为 JSON 字符串，确保正确存储为 JSONB
        values.push(JSON.stringify(updates.ptcCodes));
      }
      if (updates.completedAt !== undefined) {
        fields.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt.getTime());
      }
      if (updates.retryCount !== undefined) {
        fields.push(`retry_count = $${paramIndex++}`);
        values.push(updates.retryCount);
      }
      if (updates.isRetry !== undefined) {
        fields.push(`is_retry = $${paramIndex++}`);
        // Convert boolean to integer (PostgreSQL stores as INTEGER)
        values.push(updates.isRetry ? 1 : 0);
      }
      if (updates.pinned !== undefined) {
        fields.push(`pinned = $${paramIndex++}`);
        values.push(updates.pinned);
      }

      fields.push(`updated_at = $${paramIndex++}`);
      values.push(updated.updatedAt.getTime());
      values.push(taskId);

      const result = await client.query(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      return this.mapDbTaskToTask(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async listTasks(filters?: {
    sessionId?: string;
    status?: TaskStatus;
    skills?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      const connectTime = Date.now();
      console.log('[PostgresDataStore] listTasks: Connected in', connectTime - startTime, 'ms');

      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters?.sessionId) {
        conditions.push(`session_id = $${paramIndex++}`);
        values.push(filters.sessionId);
      }
      if (filters?.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }
      if (filters?.skills && filters.skills.length > 0) {
        // Check if metadata->'skillNames' array contains any of the specified skills
        // Using the ? operator to check if the skill name exists in the JSONB array
        const skillConditions: string[] = [];
        for (const skill of filters.skills) {
          skillConditions.push(`metadata->'skillNames' ? $${paramIndex++}`);
          values.push(skill);
        }
        conditions.push(`(${skillConditions.join(' OR ')})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countStart = Date.now();
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].count);
      console.log('[PostgresDataStore] listTasks: COUNT query took', Date.now() - countStart, 'ms, total:', total);

      // Get paginated results - always sort pinned tasks first, then by creation date
      let query = `SELECT * FROM tasks ${whereClause} ORDER BY pinned DESC, created_at DESC`;
      if (filters?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        values.push(filters.limit);
        if (filters?.offset) {
          query += ` OFFSET $${paramIndex++}`;
          values.push(filters.offset);
        }
      }

      const selectStart = Date.now();
      const result = await client.query(query, values);
      const selectTime = Date.now() - selectStart;
      // Log only if query is slow (> 500ms)
      if (selectTime > 500) {
        console.warn('[PostgresDataStore] Slow query detected:', selectTime, 'ms');
      }

      const tasks = result.rows.map(row => this.mapDbTaskToTask(row));

      const totalTime = Date.now() - startTime;
      if (totalTime > 1000) {
        console.warn('[PostgresDataStore] listTasks slow:', totalTime, 'ms');
      }

      return { tasks, total };
    } finally {
      client.release();
    }
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  /**
   * 删除任务（带死锁重试）
   * 使用分步顺序删除 + 死锁重试机制来避免死锁问题
   *
   * @param taskIds 要删除的任务ID列表
   * @param maxRetries 最大重试次数（默认3次）
   * @returns 实际删除的任务数量
   */
  async deleteTasks(taskIds: string[], maxRetries: number = 3): Promise<number> {
    if (taskIds.length === 0) {
      return 0;
    }

    // 死锁重试机制
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.deleteTasksInternal(taskIds);
      } catch (error: any) {
        // 检查是否为死锁错误 (code: '40P01')
        if (error.code === '40P01' && attempt < maxRetries) {
          // 死锁错误，等待随机时间后重试
          const backoffMs = Math.random() * 100 + 50; // 50-150ms 随机退避
          console.warn(
            `[PostgresDataStore] deleteTasks: Deadlock detected on attempt ${attempt}/${maxRetries}, ` +
            `retrying after ${backoffMs.toFixed(0)}ms...`
          );
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        // 非死锁错误或已达最大重试次数，抛出错误
        throw error;
      }
    }

    // 理论上不会到达这里，但 TypeScript 需要 return
    return 0;
  }

  /**
   * 内部方法：执行分步顺序删除
   * 使用固定删除顺序避免 CTE 带来的并发不确定性
   *
   * @param taskIds 要删除的任务ID列表
   * @returns 实际删除的任务数量
   */
  private async deleteTasksInternal(taskIds: string[]): Promise<number> {
    // Sort task IDs to ensure consistent lock order
    const sortedTaskIds = [...taskIds].sort();

    const client = await this.pool.connect();

    try {
      // 🔒 开启事务 - 保证原子性
      await client.query('BEGIN');

      const startTime = Date.now();

      // ============================================
      // 分步顺序删除 - 固定删除顺序避免死锁
      // ============================================
      // 不使用 CTE，而是直接分步执行 DELETE 语句
      // 这样可以确保删除顺序固定，减少并发冲突
      // ============================================

      // 1. 删除 favorites (通过 task_id)
      await client.query(
        'DELETE FROM favorites WHERE task_id = ANY($1)',
        [sortedTaskIds]
      );

      // 2. 删除 compression_history (通过 task_id)
      await client.query(
        'DELETE FROM compression_history WHERE task_id = ANY($1)',
        [sortedTaskIds]
      );

      // 3. 删除 artifacts (通过 task_id)
      await client.query(
        'DELETE FROM artifacts WHERE task_id = ANY($1)',
        [sortedTaskIds]
      );

      // 4. 删除 outputs (通过 task_id)
      await client.query(
        'DELETE FROM outputs WHERE task_id = ANY($1)',
        [sortedTaskIds]
      );

      // 6. 删除 task_contexts (通过 task_id)
      await client.query(
        'DELETE FROM task_contexts WHERE task_id = ANY($1)',
        [sortedTaskIds]
      );

      // 7. 最后删除 tasks
      const result = await client.query(
        'DELETE FROM tasks WHERE id = ANY($1) RETURNING id',
        [sortedTaskIds]
      );

      const deletedCount = result.rows.length;

      // ✅ 提交事务 - 所有删除操作永久生效
      await client.query('COMMIT');

      const duration = Date.now() - startTime;

      console.log(`[PostgresDataStore] deleteTasks: Successfully deleted ${deletedCount} tasks in ${duration}ms`);

      // 性能警告
      if (duration > 5000) {
        console.warn(`[PostgresDataStore] deleteTasks: Slow operation (${duration}ms for ${sortedTaskIds.length} tasks)`);
      }

      return deletedCount;
    } catch (error: any) {
      // ❌ 回滚事务 - 撤销所有操作，保证数据一致性
      await client.query('ROLLBACK').catch(() => {});

      console.error(
        '[PostgresDataStore] deleteTasks: Failed',
        {
          error: error.message,
          code: error.code,
          taskCount: sortedTaskIds.length
        }
      );

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pin a task to top
   */
  async pinTask(taskId: string): Promise<Task> {
    return this.updateTask(taskId, { pinned: true });
  }

  /**
   * Unpin a task
   */
  async unpinTask(taskId: string): Promise<Task> {
    return this.updateTask(taskId, { pinned: false });
  }

  /**
   * List all pinned tasks
   */
  async listPinnedTasks(): Promise<Task[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM tasks WHERE pinned = true ORDER BY updated_at DESC`
      );
      return result.rows.map(this.mapDbTaskToTask);
    } finally {
      client.release();
    }
  }

  /**
   * 批量获取任务的产物数量
   * @param taskIds 任务ID列表
   * @returns Map<taskId, artifactCount>
   */
  async getArtifactCounts(taskIds: string[]): Promise<Map<string, number>> {
    if (taskIds.length === 0) {
      return new Map();
    }

    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT task_id, COUNT(*) as count FROM artifacts WHERE task_id = ANY($1) AND metadata::text LIKE '%"is_final": true%' GROUP BY task_id`,
        [taskIds]
      );

      const counts = new Map<string, number>();
      for (const row of result.rows) {
        counts.set(row.task_id, parseInt(row.count, 10));
      }

      return counts;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Context Operations
  // ============================================================================

  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    const client = await this.pool.connect();

    try {
      const now = Date.now();

      await client.query(
        `INSERT INTO task_contexts (task_id, session_id, current_turn, summary, skill_execution_history, tool_usage_history, working_memory, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          taskId,
          sessionId,
          1,
          JSON.stringify({}),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify({}),
          JSON.stringify({}),
          now,
          now,
        ]
      );

      return {
        taskId,
        sessionId,
        conversationRounds: [],
        summary: {
          sessionIntent: '',
          currentTask: input,
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: '',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {
            functionNames: [],
            errorCodes: [],
            dependencies: [],
          },
        },
        artifactIndex: [],
        skillExecutionHistory: [],
        toolUsageHistory: [],
        workingMemory: {},
        metadata: {},
      };
    } finally {
      client.release();
    }
  }

  async getContext(taskId: string): Promise<TaskContext | null> {
    const client = await this.pool.connect();

    try {
      const contextResult = await client.query(
        'SELECT * FROM task_contexts WHERE task_id = $1',
        [taskId]
      );

      if (contextResult.rows.length === 0) {
        return null;
      }

      const contextRow = contextResult.rows[0];

      // Get artifacts
      const artifactsResult = await client.query(
        'SELECT * FROM artifacts WHERE task_id = $1',
        [taskId]
      );

      const artifacts: ArtifactIndex[] = artifactsResult.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        action: row.action,
        path: row.path,
        description: row.description,
        commitHash: row.commit_hash,
        metadata: row.metadata,
        // PostgreSQL returns bigint as string, need to convert to number then Date
        timestamp: new Date(parseInt(row.timestamp)),
      }));

      return {
        taskId: contextRow.task_id,
        sessionId: contextRow.session_id,
        conversationRounds: contextRow.conversation_rounds || [],
        summary: contextRow.summary,
        artifactIndex: artifacts,
        skillExecutionHistory: contextRow.skill_execution_history || [],
        toolUsageHistory: contextRow.tool_usage_history || [],
        workingMemory: contextRow.working_memory,
        metadata: contextRow.metadata,
      };
    } finally {
      client.release();
    }
  }

  async updateContext(taskId: string, updates: Partial<TaskContext>): Promise<void> {
    const client = await this.pool.connect();

    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.summary !== undefined) {
        fields.push(`summary = $${paramIndex++}`);
        values.push(JSON.stringify(updates.summary));
      }
      if (updates.skillExecutionHistory !== undefined) {
        fields.push(`skill_execution_history = $${paramIndex++}`);
        values.push(JSON.stringify(updates.skillExecutionHistory));
      }
      if (updates.toolUsageHistory !== undefined) {
        fields.push(`tool_usage_history = $${paramIndex++}`);
        values.push(JSON.stringify(updates.toolUsageHistory));
      }
      if (updates.workingMemory !== undefined) {
        fields.push(`working_memory = $${paramIndex++}`);
        values.push(JSON.stringify(updates.workingMemory));
      }
      if (updates.metadata !== undefined) {
        fields.push(`metadata = $${paramIndex++}`);
        // 🔧 FIX: 显式序列化为 JSON 字符串，确保正确存储为 JSONB
        // PostgreSQL 会自动将 JSON 字符串解析为 JSONB 类型
        values.push(JSON.stringify(updates.metadata));
      }

      fields.push(`updated_at = $${paramIndex++}`);
      values.push(Date.now());
      values.push(taskId);

      await client.query(
        `UPDATE task_contexts SET ${fields.join(', ')} WHERE task_id = $${paramIndex}`,
        values
      );
    } finally {
      client.release();
    }
  }

  async saveContext(context: TaskContext): Promise<void> {
    // Alias for updateContext - saves the entire context
    await this.updateContext(context.taskId, context);
  }

  async addConversationRound(taskId: string, round: ConversationRound): Promise<TaskContext> {
    console.log('[DEBUG] addConversationRound called', { taskId, round: round.round, userMessage: round.userMessage?.substring(0, 50) });
    const client = await this.pool.connect();

    try {
      // Get current context
      const context = await this.getContext(taskId);
      if (!context) {
        throw new Error(`Context not found for task: ${taskId}`);
      }

      console.log('[DEBUG] Current conversationRounds count:', context.conversationRounds?.length || 0);

      // Add new round to conversationRounds array
      const rounds = context.conversationRounds || [];
      rounds.push(round);

      console.log('[DEBUG] New conversationRounds count:', rounds.length);

      // Update conversation_rounds and messages_count in database
      await client.query(
        `UPDATE task_contexts
         SET conversation_rounds = $1,
             messages_count = $2,
             updated_at = $3
         WHERE task_id = $4`,
        [
          JSON.stringify(rounds),
          rounds.length,
          Date.now(),  // Fix: use number instead of ISO string
          taskId,
        ]
      );

      console.log('[DEBUG] Database updated successfully', { taskId, roundsCount: rounds.length });

      // Return updated context
      return await this.getContext(taskId) as TaskContext;
    } finally {
      client.release();
    }
  }

  async deleteContext(taskId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('DELETE FROM task_contexts WHERE task_id = $1', [taskId]);
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Artifact Operations
  // ============================================================================

  async createArtifact(artifact: Omit<ArtifactIndex, 'id'>): Promise<ArtifactIndex> {
    const client = await this.pool.connect();

    try {
      const id = `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO artifacts (id, task_id, artifact_type, action, path, description, commit_hash, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          artifact.taskId,
          artifact.artifactType,
          artifact.action,
          artifact.path,
          artifact.description || null,
          artifact.commitHash || null,
          artifact.metadata || null,
          artifact.timestamp.getTime(), // Convert Date to BIGINT (milliseconds)
        ]
      );

      return { ...artifact, id };
    } finally {
      client.release();
    }
  }

  async addArtifact(artifact: Omit<ArtifactIndex, 'taskId' | 'id'> & { taskId?: string; id?: string }): Promise<void> {
    // Implementation that matches Database interface
    const client = await this.pool.connect();

    try {
      const id = artifact.id || `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO artifacts (id, task_id, artifact_type, action, path, description, commit_hash, message_id, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          artifact.taskId || '',
          artifact.artifactType,
          artifact.action,
          artifact.path,
          artifact.description || null,
          artifact.commitHash || null,
          artifact.messageId || null,
          artifact.metadata || null,
          artifact.timestamp.getTime(), // Convert Date to BIGINT (milliseconds)
        ]
      );
    } finally {
      client.release();
    }
  }

  async getArtifacts(taskId: string): Promise<ArtifactIndex[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM artifacts WHERE task_id = $1',
        [taskId]
      );

      return result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        action: row.action,
        path: row.path,
        description: row.description,
        commitHash: row.commit_hash,
        metadata: row.metadata,
        // PostgreSQL returns bigint as string, need to convert to number then Date
        timestamp: new Date(parseInt(row.timestamp)),
      }));
    } finally {
      client.release();
    }
  }

  async updateArtifact(artifactId: string, updates: Partial<Omit<ArtifactIndex, 'id' | 'taskId'>>): Promise<void> {
    const client = await this.pool.connect();

    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.artifactType !== undefined) {
        setParts.push(`artifact_type = $${paramIndex++}`);
        values.push(updates.artifactType);
      }
      if (updates.action !== undefined) {
        setParts.push(`action = $${paramIndex++}`);
        values.push(updates.action);
      }
      if (updates.path !== undefined) {
        setParts.push(`path = $${paramIndex++}`);
        values.push(updates.path);
      }
      if (updates.description !== undefined) {
        setParts.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.commitHash !== undefined) {
        setParts.push(`commit_hash = $${paramIndex++}`);
        values.push(updates.commitHash);
      }
      if (updates.metadata !== undefined) {
        setParts.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }
      if (updates.timestamp !== undefined) {
        const ts = updates.timestamp instanceof Date ? updates.timestamp.getTime() : updates.timestamp;
        setParts.push(`timestamp = $${paramIndex++}`);
        values.push(ts);
      }

      if (setParts.length === 0) return;

      values.push(artifactId);

      await client.query(
        `UPDATE artifacts SET ${setParts.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Compression History Operations
  // ============================================================================

  async saveCompressionHistory(history: CompressionHistory): Promise<void> {
    const client = await this.pool.connect();

    try {
      const id = `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await client.query(
        `INSERT INTO compression_history (id, task_id, compressed_at, original_token_count, compressed_token_count, compression_ratio, summary, truncated_message_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          history.taskId,
          history.compressedAt.getTime(),
          history.originalTokenCount,
          history.compressedTokenCount,
          history.compressionRatio,
          JSON.stringify(history.summary),
          history.truncatedMessageIds ? JSON.stringify(history.truncatedMessageIds) : null,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getCompressionHistory(taskId: string): Promise<CompressionHistory[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM compression_history WHERE task_id = $1 ORDER BY compressed_at DESC',
        [taskId]
      );

      return result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        // PostgreSQL returns bigint as string, need to convert to number then Date
        compressedAt: new Date(parseInt(row.compressed_at)),
        originalTokenCount: row.original_token_count,
        compressedTokenCount: row.compressed_token_count,
        compressionRatio: row.compression_ratio,
        summary: row.summary,
        truncatedMessageIds: row.truncated_message_ids,
      }));
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Output Operations - Track execution outputs across multiple rounds
  // ============================================================================

  async addOutput(output: Omit<OutputIndex, 'id'> & { id?: string }): Promise<void> {
    const client = await this.pool.connect();

    try {
      const id = output.id || `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = output.timestamp instanceof Date ? output.timestamp.getTime() : Date.now();

      await client.query(
        `INSERT INTO outputs (id, task_id, session_id, round, message_id, output, execution_time, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          output.taskId!,
          output.sessionId || '',
          output.round,
          output.messageId || null,
          output.output,
          output.executionTime || null,
          timestamp,
        ]
      );
    } finally {
      client.release();
    }
  }

  async getOutputs(taskId: string): Promise<OutputIndex[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT * FROM outputs WHERE task_id = $1 ORDER BY round ASC`,
        [taskId]
      );

      return result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        sessionId: row.session_id,
        round: row.round,
        output: row.output,
        executionTime: row.execution_time,
        timestamp: new Date(parseInt(row.timestamp)),
      }));
    } finally {
      client.release();
    }
  }

  async deleteOutputs(taskId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM outputs WHERE task_id = $1',
        [taskId]
      );
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  async upsertSession(sessionId: string, metadata?: Record<string, any>): Promise<void> {
    const client = await this.pool.connect();

    try {
      const now = Date.now();

      // Check if session exists
      const checkResult = await client.query(
        'SELECT session_id FROM sessions WHERE session_id = $1',
        [sessionId]
      );

      if (checkResult.rows.length > 0) {
        // Update
        await client.query(
          'UPDATE sessions SET last_active_at = $1, metadata = $2 WHERE session_id = $3',
          [now, metadata || {}, sessionId]  // 直接传入对象，自动处理为 JSONB
        );
      } else {
        // Insert
        await client.query(
          'INSERT INTO sessions (session_id, created_at, last_active_at, metadata) VALUES ($1, $2, $3, $4)',
          [sessionId, now, now, metadata || {}]  // 直接传入对象，自动处理为 JSONB
        );
      }
    } finally {
      client.release();
    }
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM sessions WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        sessionId: row.session_id,
        // PostgreSQL returns bigint as string, need to convert to number then Date
        createdAt: new Date(parseInt(row.created_at)),
        lastActiveAt: new Date(parseInt(row.last_active_at)),
        metadata: row.metadata,
      };
    } finally {
      client.release();
    }
  }

  async listSessions(limit: number = 50, offset: number = 0): Promise<Session[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM sessions ORDER BY last_active_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      return result.rows.map(row => ({
        sessionId: row.session_id,
        // PostgreSQL returns bigint as string, need to convert to number then Date
        createdAt: new Date(parseInt(row.created_at)),
        lastActiveAt: new Date(parseInt(row.last_active_at)),
        metadata: row.metadata,
      }));
    } finally {
      client.release();
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  async cleanupOldData(olderThanDays: number = 7): Promise<number> {
    const client = await this.pool.connect();

    try {
      const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

      const result = await client.query(
        'DELETE FROM tasks WHERE created_at < $1 AND status = $2',
        [cutoffTime, 'completed']
      );

      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Favorites Operations
  // ============================================================================

  async addFavorite(favorite: {
    artifactId: string;
    taskId: string;
  }): Promise<string | null> {
    const client = await this.pool.connect();

    try {
      // 获取 artifact 信息
      const artifactResult = await client.query(
        'SELECT * FROM artifacts WHERE id = $1',
        [favorite.artifactId]
      );

      if (artifactResult.rows.length === 0) {
        throw new Error('Artifact not found');
      }

      const artifact = artifactResult.rows[0];

      // 检查是否已收藏
      const existingResult = await client.query(
        'SELECT id FROM favorites WHERE artifact_id = $1',
        [favorite.artifactId]
      );

      if (existingResult.rows.length > 0) {
        // 已收藏，返回现有的 favoriteId
        return existingResult.rows[0].id;
      }

      // 添加到精选
      const id = `favorite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await client.query(
        `INSERT INTO favorites (id, artifact_id, task_id, artifact_type, path, description, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          favorite.artifactId,
          favorite.taskId,
          artifact.artifact_type,
          artifact.path,
          artifact.description,
          artifact.metadata,
          Date.now(),
        ]
      );

      return id;
    } finally {
      client.release();
    }
  }

  async removeFavorite(favoriteId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('DELETE FROM favorites WHERE id = $1', [favoriteId]);
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  async getFavoriteByArtifactId(artifactId: string): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM favorites WHERE artifact_id = $1',
        [artifactId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        artifactId: row.artifact_id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        path: row.path,
        description: row.description,
        metadata: row.metadata,
        createdAt: row.created_at,
      };
    } finally {
      client.release();
    }
  }

  async getFavorite(favoriteId: string): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('SELECT * FROM favorites WHERE id = $1', [favoriteId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        artifactId: row.artifact_id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        path: row.path,
        description: row.description,
        metadata: row.metadata,
        createdAt: new Date(parseInt(row.created_at)),
      };
    } finally {
      client.release();
    }
  }

  async isFavorite(artifactId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      const result = await client.query('SELECT 1 FROM favorites WHERE artifact_id = $1', [artifactId]);
      return (result.rows.length > 0);
    } finally {
      client.release();
    }
  }

  async getFavorites(options: {
    page: number;
    limit: number;
    type?: string;
  }): Promise<{
    favorites: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const client = await this.pool.connect();

    try {
      const { page, limit, type } = options;
      const offset = (page - 1) * limit;

      // 构建 WHERE 条件
      let whereClause = '';
      const params: any[] = [];

      if (type) {
        whereClause = 'WHERE artifact_type = $1';
        params.push(type);
      }

      // 获取总数
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM favorites ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // 获取分页数据
      const dataResult = await client.query(
        `SELECT * FROM favorites ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      const favorites = dataResult.rows.map(row => ({
        id: row.id,
        artifactId: row.artifact_id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        path: row.path,
        description: row.description,
        metadata: row.metadata,
        createdAt: new Date(parseInt(row.created_at)),
      }));

      return {
        favorites,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private mapDbTaskToTask(row: any): Task {
    return {
      id: row.id,
      task: row.task,
      sessionId: row.session_id,
      status: row.status as TaskStatus,
      app: row.app || 'default',  // Use the dedicated app column
      // PostgreSQL returns bigint as string, need to convert to number
      createdAt: new Date(parseInt(row.created_at)),
      updatedAt: new Date(parseInt(row.updated_at)),
      completedAt: row.completed_at ? new Date(parseInt(row.completed_at)) : undefined,
      output: row.output,
      error: row.error,
      executionTime: row.execution_time,
      pinned: row.pinned || false,
      metadata: row.metadata,
      structuredOutput: row.structured_output,
      ptcCodes: row.ptc_codes,
      retryCount: row.retry_count,
      // Convert integer to boolean (PostgreSQL stores as INTEGER)
      isRetry: row.is_retry === 1,
    };
  }

  // ============================================================================
  // User Operations
  // ============================================================================

  /**
   * 创建新用户
   */
  async createUser(userId: string): Promise<User> {
    const client = await this.pool.connect();

    try {
      // 检查用户是否已存在
      const existing = await this.getUser(userId);
      if (existing) {
        return existing;
      }

      const now = Date.now();

      // 创建默认用户画像（通用空结构）
      const defaultProfile: UserProfile = {
        userId,
        data: {}, // 通用 key-value 结构，由应用方定义具体内容
        metadata: {
          lastUpdated: new Date(now),
          version: 1,
        },
      };

      const result = await client.query(
        `INSERT INTO users (user_id, profile, created_at, updated_at, last_session_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          JSON.stringify(defaultProfile),
          now,
          now,
          null,
        ]
      );

      return this.mapDbUserToUser(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * 获取用户
   */
  async getUser(userId: string): Promise<User | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'SELECT * FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbUserToUser(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * 更新用户画像
   */
  async updateUserProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
    const client = await this.pool.connect();

    try {
      const existing = await this.getUser(userId);
      if (!existing) {
        throw new Error(`User not found: ${userId}`);
      }

      // 合并数组字段（去重）
      const mergeArrays = (existing: string[] = [], updates: string[] = []) => {
        const merged = [...existing];
        for (const item of updates) {
          if (!merged.includes(item)) {
            merged.push(item);
          }
        }
        return merged;
      };

      // 合并画像数据
      const updatedProfile: UserProfile = {
        userId: existing.profile.userId,
        preferences: mergeArrays(existing.profile.preferences, profile.preferences),
        habits: mergeArrays(existing.profile.habits, profile.habits),
        tags: mergeArrays(existing.profile.tags, profile.tags),
        data: {
          ...existing.profile.data,
          ...profile.data,
        },
        metadata: {
          ...existing.profile.metadata,
          ...profile.metadata,
          lastUpdated: new Date(),
          version: (existing.profile.metadata.version || 0) + 1,
        },
      };

      await client.query(
        `UPDATE users SET profile = $1, updated_at = $2 WHERE user_id = $3`,
        [JSON.stringify(updatedProfile), Date.now(), userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * 更新用户的最后会话ID
   */
  async updateUserLastSession(userId: string, sessionId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE users SET last_session_id = $1, updated_at = $2 WHERE user_id = $3`,
        [sessionId, Date.now(), userId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * 获取用户的所有会话
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    const client = await this.pool.connect();

    try {
      // 获取用户信息
      const user = await this.getUser(userId);
      if (!user) {
        return [];
      }

      // 查询所有会话并按最后活跃时间倒序排列
      const result = await client.query(
        `SELECT s.* FROM sessions s
         WHERE s.session_id IN (
           SELECT DISTINCT session_id FROM tasks
         )
         ORDER BY s.last_active_at DESC
         LIMIT 100`
      );

      return result.rows.map(row => ({
        sessionId: row.session_id,
        createdAt: new Date(parseInt(row.created_at)),
        lastActiveAt: new Date(parseInt(row.last_active_at)),
        metadata: row.metadata,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * 获取或创建用户
   */
  async getOrCreateUser(userId: string): Promise<User> {
    const existing = await this.getUser(userId);
    if (existing) {
      return existing;
    }
    return await this.createUser(userId);
  }

  /**
   * 映射数据库行到 User 对象
   */
  private mapDbUserToUser(row: any): User {
    return {
      userId: row.user_id,
      profile: row.profile,
      createdAt: new Date(parseInt(row.created_at)),
      updatedAt: new Date(parseInt(row.updated_at)),
      lastSessionId: row.last_session_id || undefined,
    };
  }

  /**
   * Get the PostgreSQL connection pool
   *
   * Exposes the underlying pg.Pool for use by components that need direct database access.
   * This is useful for specialized storage implementations that need the pool directly.
   */
  getPool(): Pool {
    return this.pool;
  }
}
