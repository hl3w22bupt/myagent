/**
 * Data Store - 数据库存储层
 *
 * 提供任务、上下文、会话的持久化存储
 * 支持外键约束和级联删除，保证数据完整性
 *
 * 数据库文件: data/myagent.db
 */

import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';

// Import PostgreSQL store (will be used if DATABASE_BACKEND=postgres)
import { PostgresDataStore } from './postgres-store';

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  AWAITING_CLARIFICATION = 'awaiting_clarification', // HITL: 等待用户澄清
}

/**
 * PTC Code record for storing generated PTC code
 */
export interface PtcCodeRecord {
  round: number;
  code: string;
  selectedSkills: string[];
  reasoning?: string;
  timestamp: number;
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
    /** Subagent used for this task */
    subagent?: string;
    retries?: {
      attempts: number;
      totalDelay: number;
      recovered: boolean;
    };
    outputHistory?: Array<{
      round: number;
      output: string;
      timestamp: string;
      executionTime?: number;
    }>;
  };
  /** Structured output from skill execution (at root level, not in metadata) */
  structuredOutput?: any;
  /** PTC generated codes (one per round, stores final code only) */
  ptcCodes?: PtcCodeRecord[];
  retryCount: number;
  isRetry: boolean;
}

/**
 * Create task data (without auto-generated fields)
 */
export type CreateTaskData = Omit<Task, 'createdAt' | 'updatedAt'>;

import type {
  TaskContext,
  Message,
  ArtifactIndex,
  OutputIndex,
  CompressionHistory,
  ConversationRound,
} from './context-types';

/**
 * UserProfile - 通用用户画像
 *
 * 跨会话累积的用户数据，使用通用字段结构。
 * myagent 负责维护通用的用户数据（偏好、习惯、标签），
 * 应用特定的业务逻辑应由应用层（如 MyEcho）处理。
 *
 * 数据流：
 * - myagent: 维护 preferences/habits/tags 通用字段
 * - MyEcho: 通过 userContext 传入业务特定数据
 * - data 字段: 预留扩展空间，应用可存储自定义数据
 */
export interface UserProfile {
  userId: string;

  /**
   * 通用用户偏好（应用无关）
   * 例如：["喜欢简洁回复", "喜欢使用 emoji", "偏好中文"]
   *
   * 由 myagent 根据会话特征自动累积
   */
  preferences?: string[];

  /**
   * 通用用户习惯（应用无关）
   * 例如：["夜间活跃", "喜欢问问题", "频繁会话"]
   *
   * 由 myagent 根据会话模式自动累积
   */
  habits?: string[];

  /**
   * 通用标签（应用无关）
   * 例如：["新用户", "高活跃", "付费用户"]
   *
   * 由 myagent 根据统计数据自动添加
   */
  tags?: string[];

  /**
   * 应用扩展数据（预留）
   * 应用方可存储特定数据，myagent 不解释
   *
   * 向后兼容：保持旧的 data 字段以支持现有数据
   * 例如：
   * - behavior: { totalSessions, activeHours, ... }
   * - custom: { any: "application specific data" }
   */
  data?: Record<string, any>;

  /**
   * 元数据
   */
  metadata: {
    lastUpdated: Date;
    version: number;
    // 应用类型标识（可选）
    appType?: string;
  };
}

/**
 * User - 用户记录
 */
export interface User {
  userId: string;
  profile: UserProfile;
  createdAt: Date;
  updatedAt: Date;
  lastSessionId?: string;
}

/**
 * 会话信息
 */
export interface Session {
  sessionId: string;
  createdAt: Date;
  lastActiveAt: Date;
  metadata?: Record<string, any>;
}

/**
 * 数据库存储
 */
export class DataStore {
  private db: Database | null = null;
  private dbPath: string;
  private initPromise: Promise<void>;
  private saveLock: Promise<void> = Promise.resolve(); // Save lock to prevent concurrent saves
  private dbLock: Promise<void> = Promise.resolve(); // Global DB lock to serialize all updates

  constructor(dbPath?: string) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(dataDir, 'myagent.db');
    this.initPromise = this.init();
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.save();
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Initialize SQLite database using sql.js.
   *
   * Uses file-based persistence with save lock to prevent concurrent saves.
   */
  private async init() {
    try {
      const SQL = await initSqlJs();

      console.log('[DataStore] Initializing SQLite database:', this.dbPath);

      // Load existing database or create new one
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
        console.log('[DataStore] Loaded existing database');
        // Run migrations for existing databases
        this.runMigrations();
      } else {
        this.db = new SQL.Database();
        this.initSchema();
        await this.save();
        console.log('[DataStore] Created new database');
      }

      // Enable foreign keys
      this.db.run('PRAGMA foreign_keys = ON');

      console.log('[DataStore] Database initialized successfully');
    } catch (error) {
      console.error('[DataStore] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Run database migrations to add new columns/tables
   */
  private runMigrations() {
    if (!this.db) return;

    console.log('[DataStore] Running database migrations...');

    try {
      // Migration 0: Add users table (MyEcho integration)
      const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables[0]?.values?.flatMap((v: any[]) => v) || [];
      const hasUsersTable = tableNames.includes('users');

      if (!hasUsersTable) {
        console.log('[DataStore] Migration: Adding users table');
        this.db.run(`
          CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            profile TEXT NOT NULL DEFAULT '{}',
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            last_session_id TEXT
          )
        `);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_last_session ON users(last_session_id)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)`);
        console.log('[DataStore] Migration: users table added successfully');
      } else {
        console.log('[DataStore] Migration: users table already exists');
      }

      // Migration 1: Add ptc_codes column to tasks table
      const tableInfo = this.db.exec('PRAGMA table_info(tasks)');
      const hasPtcCodes = tableInfo[0]?.values?.some((row: any[]) => row[1] === 'ptc_codes');

      if (!hasPtcCodes) {
        console.log('[DataStore] Migration: Adding ptc_codes column to tasks table');
        this.db.run('ALTER TABLE tasks ADD COLUMN ptc_codes TEXT');
        console.log('[DataStore] Migration: ptc_codes column added successfully');
      } else {
        console.log('[DataStore] Migration: ptc_codes column already exists');
      }

      // Migration 2: Add conversation_rounds and messages_count columns to task_contexts table
      const contextTableInfo = this.db.exec('PRAGMA table_info(task_contexts)');
      const hasConversationRounds = contextTableInfo[0]?.values?.some((row: any[]) => row[1] === 'conversation_rounds');

      if (!hasConversationRounds) {
        console.log('[DataStore] Migration: Adding conversation_rounds and messages_count columns to task_contexts table');
        this.db.run('ALTER TABLE task_contexts ADD COLUMN conversation_rounds TEXT');
        this.db.run('ALTER TABLE task_contexts ADD COLUMN messages_count INTEGER DEFAULT 0');
        console.log('[DataStore] Migration: conversation_rounds and messages_count columns added successfully');
      } else {
        console.log('[DataStore] Migration: conversation_rounds and messages_count columns already exist');
      }
    } catch (error) {
      console.error('[DataStore] Migration error:', error);
      // Don't throw - allow app to continue even if migration fails
    }
  }

  private async ensureInitialized() {
    await this.initPromise;
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Save database to disk with lock to prevent concurrent saves.
   *
   * CRITICAL: This ensures that concurrent updates don't overwrite each other.
   * The saveLock serializes save operations.
   */
  private async save(): Promise<void> {
    const saveId = Math.random().toString(36).substr(2, 9);
    console.log(`[DataStore] save() START [${saveId}]`);

    // Use promise chain to serialize saves
    this.saveLock = this.saveLock.then(async () => {
      console.log(`[DataStore] save() EXECUTING [${saveId}]`);
      if (this.db) {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
        console.log(`[DataStore] save() COMPLETED [${saveId}] - size: ${buffer.length} bytes`);
      }
    });

    // Wait for save to complete
    await this.saveLock;
    console.log(`[DataStore] save() WAIT DONE [${saveId}]`);
  }

  private initSchema() {
    if (!this.db) return;

    console.log('[DataStore] Initializing database schema...');

    // 0. 用户表 (MyEcho 集成)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        profile TEXT NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        last_session_id TEXT
      )
    `);

    // 索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_last_session ON users(last_session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC)`);

    // 1. 任务表 (核心表)
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

    // 2. 会话表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    // 3. 任务上下文表 (依赖于 tasks)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS task_contexts (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        current_turn INTEGER DEFAULT 0,
        conversation_rounds TEXT,
        messages_count INTEGER DEFAULT 0,
        summary TEXT,
        working_memory TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 4. 消息表 (依赖于 tasks)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        compressed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 5. Artifact 索引表 (依赖于 tasks)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        action TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        commit_hash TEXT,
        metadata TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 6. Outputs 表 - 跟踪多轮对话的输出记录
    this.db.run(`
      CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        round INTEGER NOT NULL,
        output TEXT NOT NULL,
        execution_time INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 7. 压缩历史表 (依赖于 tasks)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS compression_history (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        compressed_at INTEGER NOT NULL,
        original_token_count INTEGER NOT NULL,
        compressed_token_count INTEGER NOT NULL,
        compression_ratio REAL NOT NULL,
        summary TEXT NOT NULL,
        truncated_message_ids TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 7. 精选表 (依赖于 artifacts)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
      )
    `);

    // 索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_compression_task_id ON compression_history(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_favorites_artifact_id ON favorites(artifact_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at DESC)`);

    // Outputs 表索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_outputs_task_id ON outputs(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_outputs_session_id ON outputs(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_outputs_round ON outputs(task_id, round)`);

    // 自动迁移：为 artifacts 表添加 metadata 列（如果不存在）
    try {
      this.db.run(`ALTER TABLE artifacts ADD COLUMN metadata TEXT`);
    } catch (err: any) {
      // SQLite 会报错如果列已存在，忽略这个错误
      if (!err.message.includes('duplicate column name')) {
        console.error('[DataStore] Migration failed:', err);
      }
    }

    console.log('[DataStore] Schema initialized successfully');
  }

  // ============================================================================
  // 任务管理 (原 TaskStore 功能)
  // ============================================================================

  async createTask(taskData: CreateTaskData): Promise<Task> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const task: Task = {
      ...taskData,
      status: TaskStatus.PENDING,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      retryCount: 0,
      isRetry: false,
    };

    this.db.run(
      `INSERT INTO tasks (id, task, session_id, status, created_at, updated_at, output, error, execution_time, metadata, retry_count, is_retry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.task,
        task.sessionId,
        task.status,
        task.createdAt.getTime(),
        task.updatedAt.getTime(),
        task.output || null,
        task.error || null,
        task.executionTime || null,
        task.metadata ? JSON.stringify(task.metadata) : null,
        task.retryCount,
        task.isRetry ? 1 : 0,
      ]
    );

    // 创建或更新会话
    await this.upsertSession(task.sessionId);

    await this.save();
    return task;
  }

  async getTask(taskId: string): Promise<Task | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    stmt.bind([taskId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const result = stmt.getAsObject() as any;
    stmt.free();

    return this.mapDbTaskToTask(result);
  }

  async updateTask(
    taskId: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Task> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

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

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.output !== undefined) {
      fields.push('output = ?');
      values.push(updates.output);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.executionTime !== undefined) {
      fields.push('execution_time = ?');
      values.push(updates.executionTime);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.structuredOutput !== undefined) {
      fields.push('structured_output = ?');
      values.push(JSON.stringify(updates.structuredOutput));
    }
    if (updates.ptcCodes !== undefined) {
      fields.push('ptc_codes = ?');
      values.push(JSON.stringify(updates.ptcCodes));
    }
    if (updates.completedAt !== undefined) {
      fields.push('completed_at = ?');
      values.push(updates.completedAt.getTime());
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }
    if (updates.isRetry !== undefined) {
      fields.push('is_retry = ?');
      values.push(updates.isRetry ? 1 : 0);
    }

    fields.push('updated_at = ?');
    values.push(updated.updatedAt.getTime());
    values.push(taskId);

    // CRITICAL: Use global DB lock to serialize all updates
    // This prevents race conditions where multiple updateTask() calls
    // interleave their db.run() and save() operations
    this.dbLock = this.dbLock.then(async () => {
      console.log('[DataStore] updateTask: Updating task', taskId, 'fields:', fields.join(', '));
      if (!this.db) {
        throw new Error('Database not initialized');
      }
      this.db.run(
        `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      console.log('[DataStore] updateTask: Calling save() for task', taskId);
      await this.save();
      console.log('[DataStore] updateTask: save() completed for task', taskId);
    });

    await this.dbLock;
    return updated;
  }

  async listTasks(filters?: {
    sessionId?: string;
    status?: TaskStatus;
    skills?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filters?.sessionId) {
      query += ' AND session_id = ?';
      params.push(filters.sessionId);
    }
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.skills && filters.skills.length > 0) {
      // Check if metadata JSON contains the skill in skillNames array
      // SQLite's json_extract can parse JSON, we use LIKE to check array membership
      const skillConditions = filters.skills.map(() => {
        return `json_extract(metadata, '$.skillNames') LIKE ?`;
      });
      query += ` AND (${skillConditions.join(' OR ')})`;
      // For JSON array ["skill1", "skill2"], we search for '"skill1"' to match exactly
      params.push(...filters.skills.map(skill => `%"${skill}"%`));
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
      if (filters?.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(query);
    stmt.bind(params);

    const tasks: Task[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      tasks.push(this.mapDbTaskToTask(row));
    }
    stmt.free();

    return { tasks, total };
  }

  async deleteTask(taskId: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 外键约束会自动删除 task_contexts, messages, artifacts, compression_history
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.bind([taskId]);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();

    await this.save();
    return changes > 0;
  }

  async deleteTasks(taskIds: string[]): Promise<number> {
    if (taskIds.length === 0) {
      return 0;
    }

    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // SQLite doesn't support array parameters, so we build a dynamic IN clause
    const placeholders = taskIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`);
    stmt.bind(taskIds);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();

    await this.save();
    return changes;
  }

  /**
   * 批量获取任务的产物数量
   * @param taskIds 任务ID列表
   * @returns Map<taskId, artifactCount>
   */
  async getArtifactCounts(taskIds: string[]): Promise<Map<string, number>> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    if (taskIds.length === 0) {
      return new Map();
    }

    const placeholders = taskIds.map(() => '?').join(',');
    const stmt = this.db.prepare(
      `SELECT task_id, COUNT(*) as count FROM artifacts WHERE task_id IN (${placeholders}) GROUP BY task_id`
    );
    stmt.bind(taskIds);

    const counts = new Map<string, number>();
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      counts.set(row.task_id, row.count);
    }
    stmt.free();

    return counts;
  }

  // ============================================================================
  // 上下文管理 (原 ContextStore 功能)
  // ============================================================================

  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    const context: TaskContext = {
      taskId,
      sessionId,
      currentTurn: 0,
      conversationRounds: [],  // 新格式：扁平的对话轮次
      messages: [],  // 保留用于向后兼容
      summary: {
        sessionIntent: '',
        currentTask: input,
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      },
      artifactIndex: [],
      workingMemory: {},
      metadata: {},
    };

    this.db.run(
      `INSERT INTO task_contexts (task_id, session_id, current_turn, summary, working_memory, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        context.taskId,
        context.sessionId,
        context.currentTurn,
        JSON.stringify(context.summary),
        JSON.stringify(context.workingMemory),
        JSON.stringify(context.metadata),
        now,
        now,
      ]
    );

    await this.save();
    return context;
  }

  async getContext(taskId: string): Promise<TaskContext | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 获取上下文
    const contextStmt = this.db.prepare('SELECT * FROM task_contexts WHERE task_id = ?');
    contextStmt.bind([taskId]);
    if (!contextStmt.step()) {
      contextStmt.free();
      return null;
    }
    const contextRow = contextStmt.getAsObject() as any;
    contextStmt.free();

    // 获取消息
    const messagesStmt = this.db.prepare('SELECT * FROM messages WHERE task_id = ? ORDER BY created_at ASC');
    messagesStmt.bind([taskId]);
    const messages: Message[] = [];
    while (messagesStmt.step()) {
      const msgRow = messagesStmt.getAsObject() as any;
      messages.push({
        id: msgRow.id,
        taskId: msgRow.task_id,
        role: msgRow.role,
        content: msgRow.content,
        metadata: msgRow.metadata ? JSON.parse(msgRow.metadata) : {
          timestamp: new Date(),
          tokens: 0,
        },
        compressed: msgRow.compressed === 1,
      });
    }
    messagesStmt.free();

    // 获取 artifacts
    const artifactsStmt = this.db.prepare('SELECT * FROM artifacts WHERE task_id = ?');
    artifactsStmt.bind([taskId]);
    const artifacts: ArtifactIndex[] = [];
    while (artifactsStmt.step()) {
      const artRow = artifactsStmt.getAsObject() as any;
      artifacts.push({
        id: artRow.id,
        taskId: artRow.task_id,
        artifactType: artRow.artifact_type,
        action: artRow.action,
        path: artRow.path,
        description: artRow.description,
        commitHash: artRow.commit_hash,
        timestamp: artRow.timestamp,
      });
    }
    artifactsStmt.free();

    return {
      taskId: contextRow.task_id,
      sessionId: contextRow.session_id,
      currentTurn: contextRow.current_turn,
      conversationRounds: JSON.parse(contextRow.conversation_rounds || '[]'),
      messages,
      summary: JSON.parse(contextRow.summary),
      artifactIndex: artifacts,
      workingMemory: JSON.parse(contextRow.working_memory),
      metadata: JSON.parse(contextRow.metadata),
    };
  }

  /**
   * 添加对话轮次到上下文
   * 新方法：使用扁平的 ConversationRound 结构
   */
  async addConversationRound(taskId: string, round: ConversationRound): Promise<TaskContext> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 先获取当前 context
    const context = await this.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    // 更新 conversationRounds 数组
    const rounds = context.conversationRounds || [];
    rounds.push(round);

    // 同时更新 messages（用于向后兼容）
    // 从 conversationRounds 构建 messages
    const updatedMessages: Message[] = [];
    for (const r of rounds) {
      // 添加用户消息
      updatedMessages.push({
        id: `msg-round-${r.round}-user`,
        taskId,
        role: 'user',
        content: r.userMessage,
        metadata: { timestamp: r.timestamp },
      });
      // 添加助手消息（如果有）
      if (r.assistantReply) {
        updatedMessages.push({
          id: `msg-round-${r.round}-assistant`,
          taskId,
          role: 'assistant',
          content: r.assistantReply,
          metadata: { timestamp: r.timestamp },
        });
      }
    }

    this.db.run(
      `UPDATE task_contexts
       SET conversation_rounds = ?, messages_count = ?, updated_at = ?
       WHERE task_id = ?`,
      [
        JSON.stringify(rounds),
        rounds.length,
        Date.now(),
        taskId,
      ]
    );

    await this.save();

    // 返回更新后的 context
    const updated = await this.getContext(taskId);
    if (!updated) {
      throw new Error(`Task context not found after update: ${taskId}`);
    }
    return updated;
  }

  /**
   * 获取对话轮次历史
   */
  async getConversationRounds(taskId: string): Promise<ConversationRound[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const context = await this.getContext(taskId);
    return context?.conversationRounds || [];
  }

  async saveContext(context: TaskContext): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    this.db.run(
      `UPDATE task_contexts
       SET current_turn = ?, conversation_rounds = ?, messages_count = ?, summary = ?, working_memory = ?, metadata = ?, updated_at = ?
       WHERE task_id = ?`,
      [
        context.currentTurn,
        JSON.stringify(context.conversationRounds || []),
        (context.conversationRounds || []).length,
        JSON.stringify(context.summary),
        JSON.stringify(context.workingMemory),
        JSON.stringify(context.metadata),
        now,
        context.taskId,
      ]
    );

    await this.save();
  }

  async addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const messageId = message.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 先获取当前 context
    const context = await this.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    // 插入消息
    this.db.run(
      `INSERT INTO messages (id, task_id, role, content, metadata, compressed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        taskId,
        message.role,
        message.content,
        message.metadata ? JSON.stringify(message.metadata) : null,
        message.compressed ? 1 : 0,
        Date.now(),
      ]
    );

    // 更新 currentTurn
    const newCurrentTurn = context.currentTurn + 1;

    this.db.run(
      `UPDATE task_contexts
       SET current_turn = ?, metadata = ?, updated_at = ?
       WHERE task_id = ?`,
      [
        newCurrentTurn,
        JSON.stringify(context.metadata),
        Date.now(),
        taskId,
      ]
    );

    await this.save();
    return (await this.getContext(taskId))!;
  }

  async addArtifact(artifact: Omit<ArtifactIndex, 'taskId' | 'id'> & { taskId?: string; id?: string }): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const artifactId = artifact.id || `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.db.run(
      `INSERT INTO artifacts (id, task_id, artifact_type, action, path, description, commit_hash, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifactId,
        artifact.taskId!,
        artifact.artifactType,
        artifact.action,
        artifact.path,
        artifact.description || null,
        artifact.commitHash || null,
        artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        artifact.timestamp instanceof Date ? artifact.timestamp.getTime() : Date.now(),
      ]
    );

    await this.save();
  }

  async getArtifacts(taskId: string): Promise<ArtifactIndex[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM artifacts WHERE task_id = ?');
    stmt.bind([taskId]);

    const artifacts: ArtifactIndex[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      artifacts.push({
        id: row.id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        action: row.action,
        path: row.path,
        description: row.description,
        commitHash: row.commit_hash,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        timestamp: row.timestamp,
      });
    }
    stmt.free();

    return artifacts;
  }

  // ============================================================================
  // Output Operations - Track execution outputs across multiple rounds
  // ============================================================================

  async addOutput(output: Omit<OutputIndex, 'id'> & { id?: string }): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const outputId = output.id || `output-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.db.run(
      `INSERT INTO outputs (id, task_id, session_id, round, output, execution_time, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        outputId,
        output.taskId!,
        output.sessionId || '',
        output.round,
        output.output,
        output.executionTime || null,
        output.timestamp instanceof Date ? output.timestamp.getTime() : Date.now(),
      ]
    );

    await this.save();
  }

  async getOutputs(taskId: string): Promise<OutputIndex[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM outputs WHERE task_id = ? ORDER BY round ASC');
    stmt.bind([taskId]);

    const outputs: OutputIndex[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      outputs.push({
        id: row.id,
        taskId: row.task_id,
        sessionId: row.session_id,
        round: row.round,
        output: row.output,
        executionTime: row.execution_time,
        timestamp: new Date(row.timestamp),
      });
    }
    stmt.free();

    return outputs;
  }

  async deleteOutputs(taskId: string): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM outputs WHERE task_id = ?');
    stmt.bind([taskId]);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();

    return changes;
  }

  // ============================================================================
  // Compression History Operations
  // ============================================================================

  async saveCompressionHistory(history: CompressionHistory): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const historyId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.db.run(
      `INSERT INTO compression_history (id, task_id, compressed_at, original_token_count, compressed_token_count, compression_ratio, summary, truncated_message_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        historyId,
        history.taskId,
        history.compressedAt.getTime(),
        history.originalTokenCount,
        history.compressedTokenCount,
        history.compressionRatio,
        JSON.stringify(history.summary),
        history.truncatedMessageIds ? JSON.stringify(history.truncatedMessageIds) : null,
      ]
    );

    await this.save();
  }

  async getCompressionHistory(taskId: string): Promise<CompressionHistory[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM compression_history WHERE task_id = ? ORDER BY compressed_at DESC');
    stmt.bind([taskId]);

    const history: CompressionHistory[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      history.push({
        id: row.id,
        taskId: row.task_id,
        compressedAt: new Date(row.compressed_at),
        originalTokenCount: row.original_token_count,
        compressedTokenCount: row.compressed_token_count,
        compressionRatio: row.compression_ratio,
        summary: JSON.parse(row.summary),
        truncatedMessageIds: row.truncated_message_ids ? JSON.parse(row.truncated_message_ids) : undefined,
      });
    }
    stmt.free();

    return history;
  }

  // ============================================================================
  // 会话管理 (新增功能)
  // ============================================================================

  async upsertSession(sessionId: string, metadata?: Record<string, any>): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    // 检查会话是否存在
    const checkStmt = this.db.prepare('SELECT session_id FROM sessions WHERE session_id = ?');
    checkStmt.bind([sessionId]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (exists) {
      // 更新最后活跃时间
      this.db.run(
        'UPDATE sessions SET last_active_at = ?, metadata = ? WHERE session_id = ?',
        [now, metadata ? JSON.stringify(metadata) : null, sessionId]
      );
    } else {
      // 创建新会话
      this.db.run(
        'INSERT INTO sessions (session_id, created_at, last_active_at, metadata) VALUES (?, ?, ?, ?)',
        [sessionId, now, now, metadata ? JSON.stringify(metadata) : null]
      );
    }

    await this.save();
  }

  async getSession(sessionId: string): Promise<Session | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    stmt.bind([sessionId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const result = stmt.getAsObject() as any;
    stmt.free();

    return {
      sessionId: result.session_id,
      createdAt: new Date(result.created_at),
      lastActiveAt: new Date(result.last_active_at),
      metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
    };
  }

  async listSessions(limit: number = 50, offset: number = 0): Promise<Session[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC LIMIT ? OFFSET ?');
    stmt.bind([limit, offset]);

    const sessions: Session[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      sessions.push({
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        lastActiveAt: new Date(row.last_active_at),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
    }
    stmt.free();

    return sessions;
  }

  // ============================================================================
  // 精选管理 (新增功能)
  // ============================================================================

  async addFavorite(favorite: {
    artifactId: string;
    taskId: string;
  }): Promise<string | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 获取 artifact 信息
    const artifacts = await this.getArtifacts(favorite.taskId);
    const artifact = artifacts.find((a: ArtifactIndex) => a.id === favorite.artifactId);

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    // 检查是否已收藏
    const existing = await this.getFavoriteByArtifactId(favorite.artifactId);
    if (existing) {
      return existing.id;
    }

    // 添加到精选
    const id = `favorite-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.db.run(
      `INSERT INTO favorites (id, artifact_id, task_id, artifact_type, path, description, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        favorite.artifactId,
        favorite.taskId,
        artifact.artifactType,
        artifact.path,
        artifact.description || null,
        artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        Date.now(),
      ]
    );

    await this.save();
    return id;
  }

  async removeFavorite(favoriteId: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM favorites WHERE id = ?');
    stmt.bind([favoriteId]);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();

    await this.save();
    return changes > 0;
  }

  async getFavorite(favoriteId: string): Promise<any | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM favorites WHERE id = ?');
    stmt.bind([favoriteId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as any;
    stmt.free();

    return {
      id: row.id,
      artifactId: row.artifact_id,
      taskId: row.task_id,
      artifactType: row.artifact_type,
      path: row.path,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  async getFavoriteByArtifactId(artifactId: string): Promise<any | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM favorites WHERE artifact_id = ?');
    stmt.bind([artifactId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as any;
    stmt.free();

    return {
      id: row.id,
      artifactId: row.artifact_id,
      taskId: row.task_id,
      artifactType: row.artifact_type,
      path: row.path,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  async isFavorite(artifactId: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT 1 FROM favorites WHERE artifact_id = ?');
    stmt.bind([artifactId]);
    const exists = stmt.step();
    stmt.free();

    return exists;
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
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const { page, limit, type } = options;
    const offset = (page - 1) * limit;

    // 构建 WHERE 条件
    let whereClause = '';
    const params: any[] = [];

    if (type) {
      whereClause = 'WHERE artifact_type = ?';
      params.push(type);
    }

    // 获取总数
    const countQuery = `SELECT COUNT(*) as total FROM favorites ${whereClause}`;
    const countStmt = this.db.prepare(countQuery);
    countStmt.bind(params);
    countStmt.step();
    const countRow = countStmt.getAsObject() as { total: number };
    const total = countRow.total;
    countStmt.free();

    // 获取分页数据
    const dataQuery = `SELECT * FROM favorites ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const dataStmt = this.db.prepare(dataQuery);
    dataStmt.bind([...params, limit, offset]);

    const favorites: any[] = [];
    while (dataStmt.step()) {
      const row = dataStmt.getAsObject() as any;
      favorites.push({
        id: row.id,
        artifactId: row.artifact_id,
        taskId: row.task_id,
        artifactType: row.artifact_type,
        path: row.path,
        description: row.description,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(row.created_at),
      });
    }
    dataStmt.free();

    return {
      favorites,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================================================
  // 用户管理 (MyEcho 集成)
  // ============================================================================

  /**
   * 创建新用户
   */
  async createUser(userId: string): Promise<User> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    // 检查用户是否已存在
    const existing = await this.getUser(userId);
    if (existing) {
      return existing;
    }

    // 创建默认用户画像（通用结构）
    const defaultProfile: UserProfile = {
      userId,
      preferences: [],
      habits: [],
      tags: [],
      data: {}, // 应用扩展数据（预留）
      metadata: {
        lastUpdated: new Date(now),
        version: 1,
      },
    };

    this.db.run(
      `INSERT INTO users (user_id, profile, created_at, updated_at, last_session_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        JSON.stringify(defaultProfile),
        now,
        now,
        null,
      ]
    );

    await this.save();

    return {
      userId,
      profile: defaultProfile,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * 获取用户
   */
  async getUser(userId: string): Promise<User | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?');
    stmt.bind([userId]);

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as any;
    stmt.free();

    return this.mapDbUserToUser(row);
  }

  /**
   * 更新用户画像
   */
  async updateUserProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const existing = await this.getUser(userId);
    if (!existing) {
      throw new Error(`User not found: ${userId}`);
    }

    // 合并画像数据
    const updatedProfile: UserProfile = {
      userId: existing.profile.userId,
      preferences: profile.preferences ?? existing.profile.preferences,
      habits: profile.habits ?? existing.profile.habits,
      tags: profile.tags ?? existing.profile.tags,
      // 深度合并 data 字段（向后兼容）
      data: {
        ...(existing.profile.data || {}),
        ...(profile.data || {}),
      },
      metadata: {
        ...existing.profile.metadata,
        ...profile.metadata,
        lastUpdated: new Date(),
        version: (existing.profile.metadata.version || 0) + 1,
      },
    };

    this.db.run(
      `UPDATE users SET profile = ?, updated_at = ? WHERE user_id = ?`,
      [JSON.stringify(updatedProfile), Date.now(), userId]
    );

    await this.save();
  }

  /**
   * 更新用户的最后会话ID
   */
  async updateUserLastSession(userId: string, sessionId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(
      `UPDATE users SET last_session_id = ?, updated_at = ? WHERE user_id = ?`,
      [sessionId, Date.now(), userId]
    );

    await this.save();
  }

  /**
   * 获取用户的所有会话
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 获取用户信息
    const user = await this.getUser(userId);
    if (!user) {
      return [];
    }

    // 查询该用户相关的所有任务，按 sessionId 分组
    const stmt = this.db.prepare('SELECT DISTINCT session_id FROM tasks WHERE session_id IN (SELECT session_id FROM tasks WHERE id IN (SELECT task_id FROM task_contexts WHERE task_id IN (SELECT id FROM tasks ORDER BY created_at DESC)))');
    stmt.bind([]);

    // 简化：直接查询所有会话，然后根据用户画像中的会话信息过滤
    const sessionsStmt = this.db.prepare(
      `SELECT s.* FROM sessions s
       WHERE s.session_id IN (
         SELECT DISTINCT session_id FROM tasks
         ORDER BY created_at DESC
       )
       ORDER BY s.last_active_at DESC
       LIMIT 100`
    );

    const sessions: Session[] = [];
    while (sessionsStmt.step()) {
      const row = sessionsStmt.getAsObject() as any;
      sessions.push({
        sessionId: row.session_id,
        createdAt: new Date(row.created_at),
        lastActiveAt: new Date(row.last_active_at),
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      });
    }
    sessionsStmt.free();

    return sessions;
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

  // ============================================================================
  // 数据清理
  // ============================================================================

  async cleanupOldData(olderThanDays: number = 7): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    // 外键约束会自动级联删除相关数据
    const stmt = this.db.prepare('DELETE FROM tasks WHERE created_at < ? AND status = ?');
    stmt.bind([cutoffTime, 'completed']);
    stmt.step();
    const deletedCount = this.db.getRowsModified();
    stmt.free();

    await this.save();
    return deletedCount;
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private mapDbUserToUser(row: any): User {
    return {
      userId: row.user_id,
      profile: row.profile ? JSON.parse(row.profile) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastSessionId: row.last_session_id || undefined,
    };
  }

  private mapDbTaskToTask(row: any): Task {
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
      structuredOutput: row.structured_output ? JSON.parse(row.structured_output) : undefined,
      ptcCodes: row.ptc_codes ? JSON.parse(row.ptc_codes) : undefined,
      retryCount: row.retry_count,
      isRetry: row.is_retry === 1,
    };
  }
}

/**
 * Get DataStore instance (supports multiple backends)
 *
 * Automatically selects backend based on DATABASE_BACKEND environment variable:
 * - "postgres" → PostgreSQL
 * - "sqlite" or undefined → SQLite
 *
 * This function provides backward compatibility while supporting the new
 * database abstraction layer.
 */
export function getDataStore(dbPath?: string): any {
  const backend = process.env.DATABASE_BACKEND || 'sqlite';

  // Use PostgreSQL if requested
  if (backend === 'postgres') {
    const globalKey = '__database_postgres';

    if (!(global as any)[globalKey]) {
      console.log('[getDataStore] Creating PostgreSQL database instance');
      const instance = new PostgresDataStore();
      // Store instance BEFORE initializing to prevent race conditions
      (global as any)[globalKey] = instance;
      // Initialize synchronously (wait for it to complete)
      instance.initialize().catch(err => {
        console.error('[getDataStore] Failed to initialize PostgreSQL:', err);
      });
    } else {
      console.log('[getDataStore] Reusing PostgreSQL database instance');
    }

    return (global as any)[globalKey];
  }

  // Fall back to SQLite
  const globalKey = '__database_sqlite';

  if (dbPath) {
    console.log('[DataStore] Creating new SQLite instance with path:', dbPath);
    return new DataStore(dbPath);
  }

  if (!(global as any)[globalKey]) {
    console.log('[DataStore] Creating global SQLite singleton instance');
    (global as any)[globalKey] = new DataStore();
  } else {
    console.log('[DataStore] Reusing global SQLite singleton instance');
  }

  return (global as any)[globalKey];
}

export function setDataStore(store: DataStore): void {
  (global as any).__motiaDataStore = store;
}

