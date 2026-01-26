/**
 * Unified Store - 统一数据库存储层
 *
 * 合并 TaskStore 和 ContextStore，使用单一数据库文件
 * 支持外键约束和级联删除，保证数据完整性
 *
 * 数据库文件: data/myagent.db
 */

import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { Task, TaskStatus } from './task-store';
import type { CreateTaskData } from './task-store';
import type {
  TaskContext,
  Message,
  ArtifactIndex,
  CompressionHistory,
} from './context-types';

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
 * 统一数据库存储
 */
export class UnifiedStore {
  private db: Database | null = null;
  private dbPath: string;
  private initPromise: Promise<void>;

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

  private async init() {
    try {
      const SQL = await initSqlJs();

      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
        this.initSchema();
        await this.save();
      }

      if (this.db) {
        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');
        console.log(`[UnifiedStore] Database initialized: ${this.dbPath}`);
      }
    } catch (error) {
      console.error('[UnifiedStore] Failed to initialize database:', error);
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

    console.log('[UnifiedStore] Initializing database schema...');

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
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES tasks(session_id) ON DELETE SET NULL
      )
    `);

    // 3. 任务上下文表 (依赖于 tasks)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS task_contexts (
        task_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        current_turn INTEGER DEFAULT 0,
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
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // 6. 压缩历史表 (依赖于 tasks)
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

    // 索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_compression_task_id ON compression_history(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at DESC)`);

    console.log('[UnifiedStore] Schema initialized successfully');
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

    const result = stmt.getAsObject() as any;
    stmt.free();

    if (!result) return null;

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

    this.db.run(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    await this.save();
    return updated;
  }

  async listTasks(filters?: {
    sessionId?: string;
    status?: TaskStatus;
    limit?: number;
    offset?: number;
  }): Promise<Task[]> {
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

    query += ' ORDER BY created_at DESC';

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

    return tasks;
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
      messages: [],
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
      metadata: {
        totalTokens: 0,
        llmCallsCount: 0,
        skillCallsCount: 0,
      },
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
    const contextRow = contextStmt.getAsObject() as any;
    contextStmt.free();

    if (!contextRow) return null;

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
        metadata: msgRow.metadata ? JSON.parse(msgRow.metadata) : undefined,
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
      messages,
      summary: JSON.parse(contextRow.summary),
      artifactIndex: artifacts,
      workingMemory: JSON.parse(contextRow.working_memory),
      metadata: JSON.parse(contextRow.metadata),
    };
  }

  async saveContext(context: TaskContext): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    this.db.run(
      `UPDATE task_contexts
       SET current_turn = ?, summary = ?, working_memory = ?, metadata = ?, updated_at = ?
       WHERE task_id = ?`,
      [
        context.currentTurn,
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

    await this.save();
    return (await this.getContext(taskId))!;
  }

  async addArtifact(artifact: Omit<ArtifactIndex, 'taskId'> & { taskId?: string }): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const artifactId = artifact.id || `art-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.db.run(
      `INSERT INTO artifacts (id, task_id, artifact_type, action, path, description, commit_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifactId,
        artifact.taskId!,
        artifact.artifactType,
        artifact.action,
        artifact.path,
        artifact.description || null,
        artifact.commitHash || null,
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
        timestamp: row.timestamp,
      });
    }
    stmt.free();

    return artifacts;
  }

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

    const result = stmt.getAsObject() as any;
    stmt.free();

    if (!result) return null;

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
      retryCount: row.retry_count,
      isRetry: row.is_retry === 1,
    };
  }
}

/**
 * 获取全局 UnifiedStore 实例
 */
let globalStore: UnifiedStore | null = null;

export function getUnifiedStore(): UnifiedStore {
  if (!globalStore) {
    globalStore = new UnifiedStore();
  }
  return globalStore;
}

export function setUnifiedStore(store: UnifiedStore): void {
  globalStore = store;
}
