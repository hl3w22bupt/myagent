/**
 * Context Store - 上下文管理系统数据库层
 *
 * 提供任务上下文的持久化存储，包括消息、摘要和Artifact索引
 */

import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import type {
  TaskContext,
  Message,
  ArtifactIndex,
  CompressionHistory,
  StructuredSummary,
} from './context-types';

/**
 * Context Store抽象基类
 */
abstract class ContextStoreBase {
  /**
   * 创建任务上下文
   */
  abstract createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext>;

  /**
   * 获取任务上下文
   */
  abstract getContext(taskId: string): Promise<TaskContext | null>;

  /**
   * 保存任务上下文
   */
  abstract saveContext(context: TaskContext): Promise<void>;

  /**
   * 添加消息到上下文
   */
  abstract addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext>;

  /**
   * 添加Artifact
   */
  abstract addArtifact(artifact: Omit<ArtifactIndex, 'taskId'> & { taskId?: string }): Promise<void>;

  /**
   * 获取Artifact列表
   */
  abstract getArtifacts(taskId: string): Promise<ArtifactIndex[]>;

  /**
   * 保存压缩历史
   */
  abstract saveCompressionHistory(history: CompressionHistory): Promise<void>;

  /**
   * 获取压缩历史
   */
  abstract getCompressionHistory(taskId: string): Promise<CompressionHistory[]>;

  /**
   * 删除任务上下文
   */
  abstract deleteContext(taskId: string): Promise<void>;
}

/**
 * SQLite Context Store实现
 */
export class ContextStore extends ContextStoreBase {
  private db: Database | null = null;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    super();
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(dataDir, 'context.db');
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
        this.db.run('PRAGMA foreign_keys = ON');
      }
    } catch (error) {
      console.error('Failed to initialize Context database:', error);
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

    // 任务上下文表
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

    // 消息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        compressed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES task_contexts(task_id) ON DELETE CASCADE
      )
    `);

    // Artifact索引表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS artifact_index (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        action TEXT NOT NULL,
        path TEXT NOT NULL,
        description TEXT,
        commit_hash TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES task_contexts(task_id) ON DELETE CASCADE
      )
    `);

    // 压缩历史表
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
        FOREIGN KEY (task_id) REFERENCES task_contexts(task_id) ON DELETE CASCADE
      )
    `);

    // 索引
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifact_index(task_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_compression_task_id ON compression_history(task_id)`);
  }

  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    await this.ensureInitialized();

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

    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(
      `INSERT INTO task_contexts (
        task_id, session_id, current_turn, summary, working_memory, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.bind([
      taskId,
      sessionId,
      0,
      JSON.stringify(context.summary),
      JSON.stringify(context.workingMemory),
      JSON.stringify(context.metadata),
      now,
      now,
    ]);
    stmt.step();
    stmt.free();

    await this.save();
    return context;
  }

  async getContext(taskId: string): Promise<TaskContext | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    // 获取任务上下文
    const stmt = this.db.prepare(`SELECT * FROM task_contexts WHERE task_id = ?`);
    stmt.bind([taskId]);

    const result = stmt.step();
    if (!result) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as any;
    stmt.free();

    // 获取消息
    const messagesStmt = this.db.prepare(`SELECT * FROM messages WHERE task_id = ? ORDER BY created_at`);
    messagesStmt.bind([taskId]);
    const messages: Message[] = [];
    while (messagesStmt.step()) {
      const msgRow = messagesStmt.getAsObject() as any;
      messages.push({
        id: msgRow.id,
        taskId: msgRow.task_id,
        role: msgRow.role,
        content: msgRow.content,
        metadata: JSON.parse(msgRow.metadata),
        compressed: msgRow.compressed === 1,
      });
    }
    messagesStmt.free();

    // 获取Artifacts
    const artifactsStmt = this.db.prepare(`SELECT * FROM artifact_index WHERE task_id = ? ORDER BY timestamp`);
    artifactsStmt.bind([taskId]);
    const artifactIndex: any[] = [];
    while (artifactsStmt.step()) {
      const artRow = artifactsStmt.getAsObject() as any;
      artifactIndex.push({
        taskId: artRow.task_id,
        artifactType: artRow.artifact_type,
        action: artRow.action,
        path: artRow.path,
        description: artRow.description,
        commitHash: artRow.commit_hash,
        timestamp: new Date(artRow.timestamp),
      });
    }
    artifactsStmt.free();

    return {
      taskId: row.task_id,
      sessionId: row.session_id,
      currentTurn: row.current_turn,
      messages,
      summary: JSON.parse(row.summary),
      artifactIndex,
      workingMemory: JSON.parse(row.working_memory),
      metadata: JSON.parse(row.metadata),
    };
  }

  async saveContext(context: TaskContext): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();

    const stmt = this.db.prepare(
      `UPDATE task_contexts
       SET current_turn = ?, summary = ?, working_memory = ?, metadata = ?, updated_at = ?
       WHERE task_id = ?`
    );

    stmt.bind([
      context.currentTurn,
      JSON.stringify(context.summary),
      JSON.stringify(context.workingMemory),
      JSON.stringify(context.metadata),
      now,
      context.taskId,
    ]);
    stmt.step();
    stmt.free();

    // 保存消息
    for (const message of context.messages) {
      const msgStmt = this.db.prepare(
        `INSERT OR REPLACE INTO messages (id, task_id, role, content, metadata, compressed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      msgStmt.bind([
        message.id,
        message.taskId,
        message.role,
        message.content,
        JSON.stringify(message.metadata),
        message.compressed ? 1 : 0,
        message.metadata.timestamp.getTime(),
      ]);
      msgStmt.step();
      msgStmt.free();
    }

    await this.save();
  }

  async addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext> {
    const context = await this.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    const fullMessage: Message = {
      ...message,
      taskId,
    };

    context.messages.push(fullMessage);
    context.currentTurn += 1;
    context.metadata.totalTokens += message.metadata.tokens || 0;

    await this.saveContext(context);

    return context;
  }

  async addArtifact(artifact: Omit<ArtifactIndex, 'taskId'> & { taskId?: string }): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const id = `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stmt = this.db.prepare(
      `INSERT INTO artifact_index (id, task_id, artifact_type, action, path, description, commit_hash, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.bind([
      id,
      artifact.taskId || '',
      artifact.artifactType,
      artifact.action,
      artifact.path,
      artifact.description || null,
      artifact.commitHash || null,
      artifact.timestamp.getTime(),
    ]);
    stmt.step();
    stmt.free();

    await this.save();
  }

  async getArtifacts(taskId: string): Promise<ArtifactIndex[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`SELECT * FROM artifact_index WHERE task_id = ? ORDER BY timestamp DESC`);
    stmt.bind([taskId]);

    const artifacts: ArtifactIndex[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      artifacts.push({
        taskId: row.task_id,
        artifactType: row.artifact_type,
        action: row.action,
        path: row.path,
        description: row.description,
        commitHash: row.commit_hash,
        timestamp: new Date(row.timestamp),
      });
    }
    stmt.free();

    return artifacts;
  }

  async saveCompressionHistory(history: CompressionHistory): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const id = `compression-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stmt = this.db.prepare(
      `INSERT INTO compression_history
       (id, task_id, compressed_at, original_token_count, compressed_token_count, compression_ratio, summary, truncated_message_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    stmt.bind([
      id,
      history.taskId,
      history.compressedAt.getTime(),
      history.originalTokenCount,
      history.compressedTokenCount,
      history.compressionRatio,
      JSON.stringify(history.summary),
      JSON.stringify(history.truncatedMessageIds),
    ]);
    stmt.step();
    stmt.free();

    await this.save();
  }

  async getCompressionHistory(taskId: string): Promise<CompressionHistory[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`SELECT * FROM compression_history WHERE task_id = ? ORDER BY compressed_at DESC`);
    stmt.bind([taskId]);

    const history: CompressionHistory[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      history.push({
        taskId: row.task_id,
        compressedAt: new Date(row.compressed_at),
        originalTokenCount: row.original_token_count,
        compressedTokenCount: row.compressed_token_count,
        compressionRatio: row.compression_ratio,
        summary: JSON.parse(row.summary),
        truncatedMessageIds: JSON.parse(row.truncated_message_ids),
      });
    }
    stmt.free();

    return history;
  }

  async deleteContext(taskId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`DELETE FROM task_contexts WHERE task_id = ?`);
    stmt.bind([taskId]);
    stmt.step();
    stmt.free();

    await this.save();
  }
}

/**
 * 获取ContextStore实例
 */
export function getContextStore(dbPath?: string): ContextStore {
  return new ContextStore(dbPath);
}
