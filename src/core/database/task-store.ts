/**
 * Task Store - Database backed task storage
 *
 * Provides persistent storage for tasks with full lifecycle tracking.
 * Supports SQLite for development and PostgreSQL for production.
 */

import initSqlJs, { Database } from 'sql.js';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { UnifiedStore, getUnifiedStore as getUnifiedStoreImpl } from './unified-store';

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Task interface
 */
export interface Task {
  id: string;
  task: string;
  sessionId: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  output?: string;
  error?: string;
  executionTime?: number;
  metadata?: {
    llmCalls?: number;
    skillCalls?: number;
    totalTokens?: number;
    retries?: {
      attempts: number;
      totalDelay: number;
      recovered: boolean;
    };
  };
  retryCount: number;
  isRetry: boolean;
}

/**
 * Create task data (without auto-generated fields)
 */
export type CreateTaskData = Omit<Task, 'createdAt' | 'updatedAt' | 'retryCount' | 'isRetry'>;

/**
 * Task Store abstract base class
 */
abstract class TaskStore {
  /**
   * Create a new task
   */
  abstract create(task: Omit<Task, 'createdAt' | 'updatedAt' | 'retryCount' | 'isRetry'>): Promise<Task>;

  /**
   * Get task by ID
   */
  abstract get(id: string): Promise<Task | null>;

  /**
   * Update task status and result
   */
  abstract update(
    id: string,
    updates: Partial<Pick<Task, 'status' | 'output' | 'error' | 'executionTime' | 'metadata' | 'completedAt'>>
  ): Promise<Task>;

  /**
   * List tasks with filters
   */
  abstract list(filters?: {
    status?: TaskStatus;
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }>;

  /**
   * Delete task by ID
   */
  abstract delete(id: string): Promise<void>;

  /**
   * Get task count by status
   */
  abstract getCountByStatus(): Promise<{ total: number; completed: number; failed: number }>;

  /**
   * Import an existing task (used for migration)
   */
  abstract importTask(task: Task): Promise<Task>;
}

/**
 * SQLite Task Store implementation using sql.js
 */
export class SQLiteTaskStore extends TaskStore {
  private db: Database | null = null;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    super();
    // Use provided path or default to project data directory
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(dataDir, 'tasks.db');
    this.initPromise = this.init();
  }

  private async init() {
    try {
      // Initialize sql.js
      const SQL = await initSqlJs();

      // Load database from file if exists, otherwise create new
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
        this.initSchema();
        await this.save();
      }

      // Enable foreign keys
      if (this.db) {
        this.db.run('PRAGMA foreign_keys = ON');
      }
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  private async ensureInitialized() {
    await this.initPromise;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  private async save() {
    if (this.db) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  private initSchema() {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        output TEXT,
        error TEXT,
        execution_time INTEGER,
        metadata TEXT,
        retry_count INTEGER DEFAULT 0,
        is_retry INTEGER DEFAULT 0
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)`);
  }

  async create(
    taskData: Omit<Task, 'createdAt' | 'updatedAt' | 'retryCount' | 'isRetry'>
  ): Promise<Task> {
    await this.ensureInitialized();

    const now = Date.now();
    const task: Task = {
      ...taskData,
      status: TaskStatus.PENDING,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      retryCount: 0,
      isRetry: false,
    };

    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(
      `INSERT INTO tasks (
        id, task, session_id, status, created_at, updated_at,
        output, error, execution_time, metadata, retry_count, is_retry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.bind([
      task.id,
      task.task,
      task.sessionId,
      task.status,
      now,
      now,
      task.output || null,
      task.error || null,
      task.executionTime || null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      task.retryCount,
      task.isRetry ? 1 : 0,
    ]);
    stmt.step();
    stmt.free();

    await this.save();
    return task;
  }

  async get(id: string): Promise<Task | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`);
    stmt.bind([id]);

    const result = stmt.step();

    if (!result) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as any;
    stmt.free();

    return this.rowToTask(row);
  }

  async update(
    id: string,
    updates: Partial<Pick<Task, 'status' | 'output' | 'error' | 'executionTime' | 'metadata' | 'completedAt'>>
  ): Promise<Task> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const current = await this.get(id);
    if (!current) {
      throw new Error(`Task ${id} not found`);
    }

    const updated: Task = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };

    const setClause: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClause.push('status = ?');
      values.push(updates.status);
    }
    if (updates.output !== undefined) {
      setClause.push('output = ?');
      values.push(updates.output);
    }
    if (updates.error !== undefined) {
      setClause.push('error = ?');
      values.push(updates.error);
    }
    if (updates.executionTime !== undefined) {
      setClause.push('execution_time = ?');
      values.push(updates.executionTime);
    }
    if (updates.metadata !== undefined) {
      setClause.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.completedAt !== undefined) {
      setClause.push('completed_at = ?');
      values.push(updates.completedAt.getTime());
    }

    setClause.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`UPDATE tasks SET ${setClause.join(', ')} WHERE id = ?`);
    stmt.bind(values);
    stmt.step();
    stmt.free();

    await this.save();
    return updated;
  }

  async list(filters?: {
    status?: TaskStatus;
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    let query = 'SELECT * FROM tasks';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countStmt = this.db.prepare(countQuery);
    countStmt.bind(params);
    countStmt.step();
    const countRow = countStmt.getAsObject() as { count: number };
    const total = countRow.count;
    countStmt.free();

    // Add pagination
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(query);
    stmt.bind(params);

    const tasks: Task[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      tasks.push(this.rowToTask(row));
    }
    stmt.free();

    return { tasks, total };
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    stmt.free();

    await this.save();
  }

  async getCountByStatus(): Promise<{ total: number; completed: number; failed: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM tasks
    `);
    stmt.step();
    const row = stmt.getAsObject() as { total: number; completed: number; failed: number };
    stmt.free();

    return row;
  }

  async importTask(task: Task): Promise<Task> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const createdAt = task.createdAt instanceof Date ? task.createdAt.getTime() : new Date().getTime();
    const updatedAt = task.updatedAt instanceof Date ? task.updatedAt.getTime() : now;
    const completedAt = task.completedAt instanceof Date ? task.completedAt.getTime() : undefined;

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO tasks (
        id, task, session_id, status, created_at, updated_at,
        output, error, execution_time, metadata, retry_count, is_retry, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.bind([
      task.id,
      task.task,
      task.sessionId,
      task.status,
      createdAt,
      updatedAt,
      task.output || null,
      task.error || null,
      task.executionTime || null,
      task.metadata ? JSON.stringify(task.metadata) : null,
      task.retryCount,
      task.isRetry ? 1 : 0,
      completedAt || null,
    ]);
    stmt.step();
    stmt.free();

    await this.save();
    return task;
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      task: row.task,
      sessionId: row.session_id,
      status: row.status as TaskStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      output: row.output,
      error: row.error,
      executionTime: row.execution_time,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      retryCount: row.retry_count,
      isRetry: row.is_retry === 1,
    };
  }
}

/**
 * PostgreSQL Task Store implementation (for production)
 */
export class PostgresTaskStore extends TaskStore {
  private pool: Pool;

  constructor(connectionString: string) {
    super();
    this.pool = new Pool({ connectionString });
  }

  async initSchema() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          task TEXT NOT NULL,
          session_id TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP,
          output TEXT,
          error TEXT,
          execution_time INTEGER,
          metadata JSONB,
          retry_count INTEGER DEFAULT 0,
          is_retry BOOLEAN DEFAULT FALSE
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
      `);
    } finally {
      client.release();
    }
  }

  async create(
    taskData: Omit<Task, 'createdAt' | 'updatedAt' | 'retryCount' | 'isRetry'>
  ): Promise<Task> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Task>(
        `INSERT INTO tasks (
          id, task, session_id, status, created_at, updated_at,
          output, error, execution_time, metadata, retry_count, is_retry
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          taskData.id,
          taskData.task,
          taskData.sessionId,
          TaskStatus.PENDING,
          new Date(),
          new Date(),
          taskData.output || null,
          taskData.error || null,
          taskData.executionTime || null,
          taskData.metadata || null,
          0,
          false,
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async get(id: string): Promise<Task | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) return null;

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    updates: Partial<Pick<Task, 'status' | 'output' | 'error' | 'executionTime' | 'metadata' | 'completedAt'>>
  ): Promise<Task> {
    const client = await this.pool.connect();
    try {
      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setClause.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.output !== undefined) {
        setClause.push(`output = $${paramIndex++}`);
        values.push(updates.output);
      }
      if (updates.error !== undefined) {
        setClause.push(`error = $${paramIndex++}`);
        values.push(updates.error);
      }
      if (updates.executionTime !== undefined) {
        setClause.push(`execution_time = $${paramIndex++}`);
        values.push(updates.executionTime);
      }
      if (updates.metadata !== undefined) {
        setClause.push(`metadata = $${paramIndex++}`);
        values.push(updates.metadata);
      }
      if (updates.completedAt !== undefined) {
        setClause.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completedAt);
      }

      setClause.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);

      const result = await client.query<Task>(
        `UPDATE tasks SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Task ${id} not found`);
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async list(filters?: {
    status?: TaskStatus;
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM tasks';
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters?.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters?.sessionId) {
        conditions.push(`session_id = $${paramIndex++}`);
        params.push(filters.sessionId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY created_at DESC';

      // Get total count
      const countResult = await client.query<{ count: string }>(
        query.replace('SELECT *', 'SELECT COUNT(*) as count'),
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      if (filters?.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
      }
      if (filters?.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
      }

      const result = await client.query<Task>(query, params);

      return {
        tasks: result.rows,
        total,
      };
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM tasks WHERE id = $1', [id]);
    } finally {
      client.release();
    }
  }

  async getCountByStatus(): Promise<{ total: number; completed: number; failed: number }> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ total: string; completed: string; failed: string }>(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM tasks
      `);

      return {
        total: parseInt(result.rows[0].total),
        completed: parseInt(result.rows[0].completed || '0'),
        failed: parseInt(result.rows[0].failed || '0'),
      };
    } finally {
      client.release();
    }
  }

  async importTask(task: Task): Promise<Task> {
    const client = await this.pool.connect();
    try {
      const now = new Date();
      const createdAt = task.createdAt instanceof Date ? task.createdAt : new Date();
      const updatedAt = task.updatedAt instanceof Date ? task.updatedAt : now;
      const completedAt = task.completedAt instanceof Date ? task.completedAt : undefined;

      const result = await client.query<Task>(
        `INSERT INTO tasks (
          id, task, session_id, status, created_at, updated_at,
          output, error, execution_time, metadata, retry_count, is_retry, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          task = EXCLUDED.task,
          session_id = EXCLUDED.session_id,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          output = EXCLUDED.output,
          error = EXCLUDED.error,
          execution_time = EXCLUDED.execution_time,
          metadata = EXCLUDED.metadata,
          retry_count = EXCLUDED.retry_count,
          is_retry = EXCLUDED.is_retry,
          completed_at = EXCLUDED.completed_at
        RETURNING *`,
        [
          task.id,
          task.task,
          task.sessionId,
          task.status,
          createdAt,
          updatedAt,
          task.output || null,
          task.error || null,
          task.executionTime || null,
          task.metadata || null,
          task.retryCount,
          task.isRetry,
          completedAt || null,
        ]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }
}

/**
 * Get task store instance based on environment
 *
 * @deprecated Use getUnifiedStore() instead. This function now returns UnifiedStore
 * for backward compatibility, but the old TaskStore/SQLiteTaskStore are deprecated.
 */
export function getTaskStore(): TaskStore {
  // Return UnifiedStore for all cases
  // UnifiedStore implements all TaskStore methods plus context management
  return getUnifiedStoreImpl() as any;
}

/**
 * Get unified store instance (singleton)
 */
export function getUnifiedStore(): UnifiedStore {
  return getUnifiedStoreImpl();
}
