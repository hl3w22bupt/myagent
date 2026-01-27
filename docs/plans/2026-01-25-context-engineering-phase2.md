# 上下文工程系统实施计划 (Phase 2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现任务级上下文管理系统，支持多轮对话、智能压缩和Artifact跟踪

**架构:** 基于Motia State Management + SQLite数据库存储，通过TaskHook集成到现有任务流程

**技术栈:**
- TypeScript (Node.js)
- Motia Framework (State Management, Event Steps)
- SQLite (sql.js) 用于开发，PostgreSQL用于生产
- LLM API用于上下文压缩

---

## 前置阅读

在开始实施前，请阅读以下文档以理解Motia的模式和架构：

1. **State Management** - `.cursor/rules/motia/state-management.mdc`
2. **Event Steps** - `.cursor/rules/motia/event-steps.mdc`
3. **API Steps** - `.cursor/rules/motia/api-steps.mdc`
4. **上下文工程设计** - `docs/design/context-engineering.md`
5. **多轮对话系统设计** - `docs/design/multi-turn-conversation-system.md`

---

## Task 1: 扩展数据库Schema以支持上下文管理

**目标:** 在现有TaskStore基础上添加上下文相关的表结构

**文件:**
- Modify: `src/core/database/task-store.ts`
- Create: `src/core/database/context-store.ts`

### Step 1: 编写上下文存储的测试

创建测试文件: `src/core/database/__tests__/context-store.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ContextStore } from '../context-store';
import { getTaskStore } from '../task-store';

describe('ContextStore', () => {
  let contextStore: ContextStore;
  let taskStore = getTaskStore();

  beforeAll(async () => {
    contextStore = new ContextStore(':memory:');
    await contextStore.initialize();
  });

  afterAll(async () => {
    await contextStore.close();
  });

  it('should create a task context with all required fields', async () => {
    const task = await taskStore.create({
      id: 'test-task-1',
      task: '测试任务',
      sessionId: 'test-session-1',
      status: 'pending' as any,
    });

    const context = await contextStore.createTaskContext(task.id, task.sessionId, '测试任务');

    expect(context).toBeDefined();
    expect(context.taskId).toBe('test-task-1');
    expect(context.sessionId).toBe('test-session-1');
    expect(context.currentTurn).toBe(0);
    expect(context.messages).toEqual([]);
    expect(context.summary).toBeDefined();
    expect(context.artifactIndex).toEqual([]);
  });

  it('should save task context to database', async () => {
    const context = {
      taskId: 'test-task-2',
      sessionId: 'test-session-2',
      currentTurn: 1,
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: '你好',
          metadata: { timestamp: new Date(), tokens: 10 },
          compressed: false,
        }
      ],
      summary: {
        sessionIntent: '测试会话',
        currentTask: '测试任务',
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
        totalTokens: 1000,
        llmCallsCount: 1,
        skillCallsCount: 0,
      },
    };

    await contextStore.saveContext(context);

    const retrieved = await contextStore.getContext('test-task-2');
    expect(retrieved).toEqual(context);
  });

  it('should add message to existing context', async () => {
    const context = await contextStore.createTaskContext('test-task-3', 'test-session-3', '测试');

    const message = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: '你好！有什么我可以帮助的吗？',
      metadata: { timestamp: new Date(), tokens: 20 },
      compressed: false,
    };

    const updated = await contextStore.addMessage('test-task-3', message);

    expect(updated.currentTurn).toBe(1);
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].content).toBe('你好！有什么我可以帮助的吗？');
  });

  it('should track artifact changes', async () => {
    const artifact = {
      taskId: 'test-task-4',
      artifactType: 'file' as const,
      action: 'modified' as const,
      path: '/src/app.ts',
      description: '添加了新的路由',
      timestamp: new Date(),
    };

    await contextStore.addArtifact(artifact);

    const artifacts = await contextStore.getArtifacts('test-task-4');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].path).toBe('/src/app.ts');
  });
});
```

运行: `npm test -- src/core/database/__tests__/context-store.test.ts`

预期: FAIL (ContextStore类不存在)

### Step 2: 创建ContextStore类型定义

创建文件: `src/core/database/context-types.ts`

```typescript
/**
 * 上下文管理系统的类型定义
 */

/**
 * 任务上下文结构
 */
export interface TaskContext {
  // 基础信息
  taskId: string;
  sessionId: string;
  currentTurn: number;

  // 对话历史
  messages: Message[];

  // 压缩摘要（Anchored Iterative Summarization）
  summary: StructuredSummary;

  // Artifact索引
  artifactIndex: ArtifactIndex[];

  // 临时工作内存
  workingMemory: Record<string, any>;

  // 元数据
  metadata: {
    totalTokens: number;
    llmCallsCount: number;
    skillCallsCount: number;
    lastCompressedAt?: Date;
  };
}

/**
 * 消息结构
 */
export interface Message {
  id: string;
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    timestamp: Date;
    tokens?: number;
    llmCalls?: number;
    skillCalls?: string[];
  };
  compressed?: boolean;
}

/**
 * 结构化摘要
 */
export interface StructuredSummary {
  // 会话意图
  sessionIntent: string;

  // 当前任务目标
  currentTask: string;

  // 已完成的步骤
  completedSteps: string[];

  // 文件修改记录
  filesModified: FileModification[];

  // 关键决策
  decisionsMade: Decision[];

  // 当前状态
  currentStatus: string;

  // 下一步计划
  nextSteps: string[];

  // 错误和解决方案
  errorsAndSolutions: ErrorAndSolution[];

  // 技术细节
  technicalDetails: {
    functionNames?: string[];
    errorCodes?: string[];
    dependencies?: string[];
  };
}

/**
 * Artifact索引
 */
export interface ArtifactIndex {
  taskId: string;
  artifactType: 'file' | 'function' | 'variable' | 'error';
  action: 'created' | 'modified' | 'read' | 'deleted';
  path: string;
  description?: string;
  commitHash?: string;
  timestamp: Date;
}

/**
 * 文件修改记录
 */
export interface FileModification {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  description: string;
  commitHash?: string;
  timestamp: Date;
}

/**
 * 决策记录
 */
export interface Decision {
  topic: string;
  decision: string;
  reasoning: string;
  timestamp: Date;
}

/**
 * 错误和解决方案
 */
export interface ErrorAndSolution {
  error: string;
  solution: string;
  timestamp: Date;
}

/**
 * 上下文压缩历史
 */
export interface CompressionHistory {
  taskId: string;
  compressedAt: Date;
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  summary: StructuredSummary;
  truncatedMessageIds: string[];
}
```

### Step 3: 实现ContextStore类

创建文件: `src/core/database/context-store.ts`

```typescript
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
```

### Step 4: 运行测试

运行: `npm test -- src/core/database/__tests__/context-store.test.ts`

预期: PASS

### Step 5: 提交

```bash
git add src/core/database/
git commit -m "feat: add context storage system with SQLite backend

- Add ContextStore class for task context persistence
- Add type definitions for TaskContext, Message, ArtifactIndex
- Add database schema for contexts, messages, artifacts, compression
- Add unit tests for context storage operations"
```

---

## Task 2: 实现ContextManager核心逻辑

**目标:** 实现上下文管理的业务逻辑，包括消息添加、上下文压缩、Artifact提取

**文件:**
- Create: `src/core/context/manager.ts`
- Create: `src/core/context/compressor.ts`
- Create: `src/core/context/artifact-extractor.ts`

### Step 1: 编写ContextManager测试

创建文件: `src/core/context/__tests__/manager.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextManager } from '../manager';
import { ContextStore } from '../../database/context-store';
import type { TaskContext, Message } from '../../database/context-types';

describe('ContextManager', () => {
  let manager: ContextManager;
  let store: ContextStore;

  beforeEach(async () => {
    store = new ContextStore(':memory:');
    await store.initialize();
    manager = new ContextManager(store);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should create task context with initial state', async () => {
    const context = await manager.createTaskContext('task-1', 'session-1', '测试任务');

    expect(context.taskId).toBe('task-1');
    expect(context.currentTurn).toBe(0);
    expect(context.messages).toEqual([]);
    expect(context.summary.currentTask).toBe('测试任务');
  });

  it('should add message and update turn count', async () => {
    await manager.createTaskContext('task-2', 'session-2', '测试');

    const message: Message = {
      id: 'msg-1',
      taskId: 'task-2',
      role: 'user',
      content: '你好',
      metadata: { timestamp: new Date(), tokens: 10 },
    };

    const updated = await manager.addMessage('task-2', message);

    expect(updated.currentTurn).toBe(1);
    expect(updated.messages).toHaveLength(1);
    expect(updated.metadata.totalTokens).toBe(10);
  });

  it('should compress context when token threshold exceeded', async () => {
    await manager.createTaskContext('task-3', 'session-3', '测试');

    // 添加大量消息模拟token超限
    for (let i = 0; i < 25; i++) {
      const message: Message = {
        id: `msg-${i}`,
        taskId: 'task-3',
        role: 'assistant',
        content: `这是第${i}条消息`,
        metadata: { timestamp: new Date(), tokens: 5000 },
      };
      await manager.addMessage('task-3', message);
    }

    const context = await manager.getContext('task-3');

    // 应该触发压缩
    expect(context.messages.length).toBeLessThan(25);
    expect(context.metadata.lastCompressedAt).toBeDefined();
  });

  it('should extract and track artifacts from messages', async () => {
    await manager.createTaskContext('task-4', 'session-4', '测试');

    const message: Message = {
      id: 'msg-1',
      taskId: 'task-4',
      role: 'assistant',
      content: '已创建文件 /src/app.ts 并添加了新路由',
      metadata: {
        timestamp: new Date(),
        tokens: 20,
        skillCalls: ['file-write'],
      },
    };

    await manager.addMessage('task-4', message);

    const artifacts = await store.getArtifacts('task-4');

    // 应该提取到文件artifact
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.some(a => a.artifactType === 'file')).toBe(true);
  });
});
```

运行: `npm test -- src/core/context/__tests__/manager.test.ts`

预期: FAIL (ContextManager不存在)

### Step 2: 实现Artifact提取器

创建文件: `src/core/context/artifact-extractor.ts`

```typescript
/**
 * Artifact提取器
 *
 * 从消息中提取Artifact信息，用于跟踪文件修改、函数调用等
 */

import type { ArtifactIndex, Message } from '../database/context-types';

export class ArtifactExtractor {
  /**
   * 从消息中提取Artifacts
   */
  extractFromMessage(message: Message): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 1. 提取文件路径
    const fileArtifacts = this.extractFiles(message.content);
    artifacts.push(...fileArtifacts);

    // 2. 提取函数名
    const functionArtifacts = this.extractFunctions(message.content);
    artifacts.push(...functionArtifacts);

    // 3. 从metadata中的skillCalls提取
    if (message.metadata.skillCalls) {
      for (const skill of message.metadata.skillCalls) {
        artifacts.push({
          artifactType: 'function',
          action: 'read',
          path: skill,
          description: `调用了skill: ${skill}`,
          timestamp: new Date(),
        });
      }
    }

    return artifacts;
  }

  /**
   * 提取文件路径
   * 匹配模式: /path/to/file.ext 或 ./path/to/file.ext
   */
  private extractFiles(content: string): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 正则匹配文件路径
    const filePathPattern = /([\/.][^\s,]+\.[a-z]{2,4})/gi;
    const matches = content.match(filePathPattern);

    if (matches) {
      // 检测动作类型
      const action = this.detectAction(content);

      for (const path of matches) {
        artifacts.push({
          artifactType: 'file',
          action,
          path,
          description: this.generateDescription(content, path),
          timestamp: new Date(),
        });
      }
    }

    return artifacts;
  }

  /**
   * 提取函数名
   * 匹配模式: functionName() 或 function_name
   */
  private extractFunctions(content: string): Omit<ArtifactIndex, 'taskId'>[] {
    const artifacts: Omit<ArtifactIndex, 'taskId'>[] = [];

    // 正则匹配函数调用
    const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const matches = content.matchAll(functionPattern);

    for (const match of matches) {
      const funcName = match[1];

      // 过滤常见JavaScript关键词
      if (['if', 'for', 'while', 'switch', 'catch'].includes(funcName)) {
        continue;
      }

      artifacts.push({
        artifactType: 'function',
        action: 'read',
        path: funcName,
        description: `函数调用: ${funcName}`,
        timestamp: new Date(),
      });
    }

    return artifacts;
  }

  /**
   * 检测动作类型
   */
  private detectAction(content: string): 'created' | 'modified' | 'read' | 'deleted' {
    const lower = content.toLowerCase();

    if (lower.includes('创建') || lower.includes('新建') || lower.includes('created')) {
      return 'created';
    }
    if (lower.includes('删除') || lower.includes('移除') || lower.includes('deleted')) {
      return 'deleted';
    }
    if (lower.includes('修改') || lower.includes('更新') || lower.includes('modified')) {
      return 'modified';
    }

    return 'read';
  }

  /**
   * 生成描述
   */
  private generateDescription(content: string, path: string): string {
    // 查找文件附近的描述性文字
    const sentences = content.split(/[。！？.!?]/);
    for (const sentence of sentences) {
      if (sentence.includes(path)) {
        return sentence.trim();
      }
    }

    return `操作文件: ${path}`;
  }
}
```

### Step 3: 实现上下文压缩器

创建文件: `src/core/context/compressor.ts`

```typescript
/**
 * 上下文压缩器
 *
 * 使用Anchored Iterative Summarization算法压缩上下文
 */

import type { TaskContext, StructuredSummary, Message } from '../database/context-types';
import { CompressionHistory } from '../database/context-store';

export class ContextCompressor {
  private maxTokens: number;
  private threshold: number;
  private messagesToKeep: number;

  constructor(
    maxTokens: number = 100000,
    threshold: number = 0.8,
    messagesToKeep: number = 20
  ) {
    this.maxTokens = maxTokens;
    this.threshold = threshold;
    this.messagesToKeep = messagesToKeep;
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(context: TaskContext): boolean {
    return context.metadata.totalTokens > this.maxTokens * this.threshold;
  }

  /**
   * 压缩上下文
   */
  async compress(
    context: TaskContext,
    llmSummarize: (messages: Message[]) => Promise<StructuredSummary>
  ): Promise<TaskContext> {
    // 1. 分离要压缩的消息和要保留的消息
    const messagesToCompress = context.messages.slice(0, -this.messagesToKeep);
    const messagesToKeep = context.messages.slice(-this.messagesToKeep);

    if (messagesToCompress.length === 0) {
      return context;
    }

    // 2. 生成新的结构化摘要
    const newSummary = await llmSummarize(messagesToCompress);

    // 3. 合并摘要
    const mergedSummary = this.mergeSummaries(context.summary, newSummary);

    // 4. 更新Artifact索引
    const updatedArtifacts = this.extractArtifactsFromMessages(messagesToCompress);

    // 5. 创建压缩后的上下文
    const compressedContext: TaskContext = {
      ...context,
      messages: messagesToKeep,
      summary: mergedSummary,
      artifactIndex: [...context.artifactIndex, ...updatedArtifacts],
      metadata: {
        ...context.metadata,
        lastCompressedAt: new Date(),
        totalTokens: this.estimateCompressedTokens(messagesToKeep, mergedSummary),
      },
    };

    return compressedContext;
  }

  /**
   * 合并两个摘要
   */
  private mergeSummaries(
    existing: StructuredSummary,
    newSummary: StructuredSummary
  ): StructuredSummary {
    return {
      sessionIntent: existing.sessionIntent || newSummary.sessionIntent,
      currentTask: newSummary.currentTask || existing.currentTask,
      completedSteps: [...existing.completedSteps, ...newSummary.completedSteps],
      filesModified: [...existing.filesModified, ...newSummary.filesModified],
      decisionsMade: [...existing.decisionsMade, ...newSummary.decisionsMade],
      currentStatus: newSummary.currentStatus || existing.currentStatus,
      nextSteps: newSummary.nextSteps || existing.nextSteps,
      errorsAndSolutions: [...existing.errorsAndSolutions, ...newSummary.errorsAndSolutions],
      technicalDetails: {
        functionNames: [
          ...(existing.technicalDetails.functionNames || []),
          ...(newSummary.technicalDetails.functionNames || []),
        ],
        errorCodes: [
          ...(existing.technicalDetails.errorCodes || []),
          ...(newSummary.technicalDetails.errorCodes || []),
        ],
        dependencies: [
          ...(existing.technicalDetails.dependencies || []),
          ...(newSummary.technicalDetails.dependencies || []),
        ],
      },
    };
  }

  /**
   * 从消息中提取Artifacts
   */
  private extractArtifactsFromMessages(messages: Message[]): any[] {
    // 简化版本：实际应该使用ArtifactExtractor
    const artifacts: any[] = [];

    for (const message of messages) {
      if (message.metadata.skillCalls) {
        for (const skill of message.metadata.skillCalls) {
          artifacts.push({
            artifactType: 'function',
            action: 'read',
            path: skill,
            timestamp: message.metadata.timestamp,
          });
        }
      }
    }

    return artifacts;
  }

  /**
   * 估算压缩后的token数
   */
  private estimateCompressedTokens(messages: Message[], summary: StructuredSummary): number {
    // 简单估算：每条消息平均1000 tokens，摘要5000 tokens
    const messageTokens = messages.length * 1000;
    const summaryTokens = 5000;

    return messageTokens + summaryTokens;
  }
}
```

### Step 4: 实现ContextManager

创建文件: `src/core/context/manager.ts`

```typescript
/**
 * ContextManager - 上下文管理器
 *
 * 提供任务上下文的创建、更新、查询和压缩功能
 */

import type { TaskContext, Message } from '../database/context-types';
import { ContextStore } from '../database/context-store';
import { ContextCompressor } from './compressor';
import { ArtifactExtractor } from './artifact-extractor';

export class ContextManager {
  private store: ContextStore;
  private compressor: ContextCompressor;
  private artifactExtractor: ArtifactExtractor;

  constructor(store?: ContextStore) {
    this.store = store || new ContextStore();
    this.compressor = new ContextCompressor();
    this.artifactExtractor = new ArtifactExtractor();
  }

  /**
   * 创建任务上下文
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    const context = await this.store.createTaskContext(taskId, sessionId, input);

    return context;
  }

  /**
   * 获取任务上下文
   */
  async getContext(taskId: string): Promise<TaskContext | null> {
    return await this.store.getContext(taskId);
  }

  /**
   * 添加消息到上下文
   */
  async addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext> {
    // 1. 获取当前上下文
    const context = await this.store.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    // 2. 添加消息
    const updatedContext = await this.store.addMessage(taskId, message);

    // 3. 提取并保存Artifacts
    const artifacts = this.artifactExtractor.extractFromMessage({
      ...message,
      taskId,
    });

    for (const artifact of artifacts) {
      await this.store.addArtifact({ ...artifact, taskId });
    }

    // 4. 检查是否需要压缩
    if (this.compressor.shouldCompress(updatedContext)) {
      // 生成压缩摘要
      const llmSummarize = async (messages: Message[]) => {
        // TODO: 调用LLM API生成摘要
        // 这里返回一个简单的占位摘要
        return {
          sessionIntent: '会话意图',
          currentTask: context.summary.currentTask,
          completedSteps: messages.map(m => m.content).slice(0, 5),
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'compressed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        };
      };

      const compressed = await this.compressor.compress(updatedContext, llmSummarize);

      // 5. 保存压缩历史
      await this.store.saveCompressionHistory({
        taskId,
        compressedAt: new Date(),
        originalTokenCount: updatedContext.metadata.totalTokens,
        compressedTokenCount: compressed.metadata.totalTokens,
        compressionRatio:
          compressed.metadata.totalTokens / updatedContext.metadata.totalTokens,
        summary: compressed.summary,
        truncatedMessageIds: updatedContext.messages
          .slice(0, -20)
          .map(m => m.id),
      });

      // 6. 保存压缩后的上下文
      await this.store.saveContext(compressed);

      return compressed;
    }

    return updatedContext;
  }

  /**
   * 保存上下文
   */
  async saveContext(context: TaskContext): Promise<void> {
    await this.store.saveContext(context);
  }

  /**
   * 获取上下文用于LLM
   */
  async getContextForLLM(taskId: string): Promise<string> {
    const context = await this.getContext(taskId);
    if (!context) {
      return '';
    }

    return this.formatContextForLLM(context);
  }

  /**
   * 格式化上下文为LLM输入
   */
  private formatContextForLLM(context: TaskContext): string {
    const summary = this.formatSummary(context.summary);
    const artifacts = this.formatArtifacts(context.artifactIndex);
    const messages = this.formatMessages(context.messages);

    return `
## Summary
${summary}

## Artifacts
${artifacts}

## Recent Messages
${messages}
`.trim();
  }

  /**
   * 格式化摘要
   */
  private formatSummary(summary: any): string {
    return `
- Session Intent: ${summary.sessionIntent}
- Current Task: ${summary.currentTask}
- Status: ${summary.currentStatus}
- Completed Steps: ${summary.completedSteps.join(', ')}
- Files Modified: ${summary.filesModified.map(f => `${f.action}: ${f.path}`).join(', ')}
- Decisions: ${summary.decisionsMade.map(d => d.topic).join(', ')}
`.trim();
  }

  /**
   * 格式化Artifacts
   */
  private formatArtifacts(artifacts: any[]): string {
    if (artifacts.length === 0) {
      return 'No artifacts tracked yet.';
    }

    return artifacts
      .map(a => `- ${a.artifactType}: ${a.action} ${a.path}`)
      .join('\n');
  }

  /**
   * 格式化消息
   */
  private formatMessages(messages: Message[]): string {
    return messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');
  }
}
```

### Step 5: 运行测试

运行: `npm test -- src/core/context/__tests__/manager.test.ts`

预期: PASS (可能有关于LLM摘要的警告，这是正常的)

### Step 6: 提交

```bash
git add src/core/context/
git commit -m "feat: implement context manager with compression

- Add ContextManager for task context lifecycle management
- Add ContextCompressor with Anchored Iterative Summarization
- Add ArtifactExtractor for tracking files and functions
- Add unit tests for context operations"
```

---

## Task 3: 集成ContextManager到TaskHook系统

**目标:** 将ContextManager集成到现有的TaskHook流程，替换占位符实现

**文件:**
- Modify: `src/core/task/hooks/context-manager.ts`

### Step 1: 编写集成测试

创建文件: `src/core/task/hooks/__tests__/context-manager-hook.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContextManagerTaskHook } from '../context-manager';
import { ContextStore } from '../../database/context-store';
import { TaskContext } from '../types';
import { ContextManager } from '../../context/manager';

describe('ContextManagerTaskHook Integration', () => {
  let hook: ContextManagerTaskHook;
  let store: ContextStore;
  let contextManager: ContextManager;

  beforeEach(async () => {
    store = new ContextStore(':memory:');
    await store.initialize();
    contextManager = new ContextManager(store);
    hook = new ContextManagerTaskHook(contextManager);
  });

  afterEach(async () => {
    await store.close();
  });

  it('should create context in preExec', async () => {
    const taskContext: TaskContext = {
      taskId: 'test-task-1',
      sessionId: 'test-session-1',
      task: '测试任务',
      status: 'pending',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: null,
        logger: console,
        emit: null,
      },
    };

    await hook.preExec(taskContext);

    expect(taskContext.context).toBeDefined();
    expect(taskContext.context.messages).toEqual([]);
    expect(taskContext.context.summary.currentTask).toBe('测试任务');
  });

  it('should save context in postExec', async () => {
    const taskContext: TaskContext = {
      taskId: 'test-task-2',
      sessionId: 'test-session-2',
      task: '测试任务',
      status: 'completed',
      context: {
        taskId: 'test-task-2',
        sessionId: 'test-session-2',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: '',
          currentTask: '测试任务',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 1000,
          llmCallsCount: 1,
          skillCallsCount: 0,
        },
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: null,
        logger: console,
        emit: null,
      },
    };

    const result = {
      success: true,
      output: '任务完成',
      executionTime: 1000,
    };

    await hook.postExec(taskContext, result);

    // 验证上下文已保存
    const saved = await contextManager.getContext('test-task-2');
    expect(saved).toBeDefined();
  });
});
```

运行: `npm test -- src/core/task/hooks/__tests__/context-manager-hook.test.ts`

预期: FAIL (需要更新实现)

### Step 2: 更新ContextManagerTaskHook实现

修改文件: `src/core/task/hooks/context-manager.ts`

```typescript
import { BaseTaskHook } from './base';
import { TaskContext } from './types';
import { ContextManager } from '../../context/manager';
import { getContextStore } from '../../database/context-store';

/**
 * Context Manager TaskHook
 * 管理任务上下文生命周期（创建、保存、压缩）
 */
export class ContextManagerTaskHook extends BaseTaskHook {
  private contextManager: ContextManager;

  constructor(contextManager?: ContextManager) {
    super();
    // 如果没有提供，使用默认的ContextStore
    this.contextManager = contextManager || new ContextManager(getContextStore());
  }

  async preExec(
    context: TaskContext
  ): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }> {
    const { taskId, sessionId, task, services } = context;

    try {
      // 创建任务上下文
      const taskContext = await this.contextManager.createTaskContext(
        taskId,
        sessionId,
        task
      );

      // 将上下文附加到TaskContext
      context.context = taskContext;

      services.logger.info('Task context created', {
        taskId,
        sessionId,
        currentTurn: taskContext.currentTurn,
      });

      return undefined;
    } catch (error) {
      services.logger.error('Failed to create task context', {
        taskId,
        error: (error as Error).message,
      });

      // 如果上下文创建失败，可以选择停止任务或继续
      // 这里选择继续，但创建一个空上下文
      context.context = {
        taskId,
        sessionId,
        currentTurn: 0,
        messages: [],
        summary: {
          sessionIntent: '',
          currentTask: task,
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

      return undefined;
    }
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    try {
      // 更新上下文的最终状态
      if (context.context) {
        context.context.summary.currentStatus = context.status;

        // 如果任务成功，添加到已完成步骤
        if (result.success && context.context.summary.completedSteps) {
          context.context.summary.completedSteps.push(context.task);
        }

        // 保存上下文
        await this.contextManager.saveContext(context.context);

        services.logger.info('Task context saved', {
          taskId,
          currentTurn: context.context.currentTurn,
          totalTokens: context.context.metadata.totalTokens,
          hasCompression: !!context.context.metadata.lastCompressedAt,
        });
      }
    } catch (error) {
      services.logger.error('Failed to save task context', {
        taskId,
        error: (error as Error).message,
      });
    }
  }
}
```

### Step 3: 运行测试

运行: `npm test -- src/core/task/hooks/__tests__/context-manager-hook.test.ts`

预期: PASS

### Step 4: 更新类型定义以支持新的上下文结构

修改文件: `src/core/task/hooks/types.ts`

```typescript
/**
 * Task execution context passed to all TaskHooks
 */
export interface TaskContext {
  // Task identification
  taskId: string;
  sessionId: string;
  task: string;

  // Execution state
  status: 'pending' | 'running' | 'completed' | 'failed';

  // Task context data (for ContextManager)
  // 现在支持完整的TaskContext结构
  context: {
    taskId: string;
    sessionId: string;
    currentTurn: number;
    messages: any[];
    summary: any;
    artifactIndex: any[];
    workingMemory: Record<string, any>;
    metadata: {
      totalTokens: number;
      llmCallsCount: number;
      skillCallsCount: number;
      lastCompressedAt?: Date;
    };
  } | null;

  // Execution metadata
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
    userId?: string;
  };

  // Motia service references
  services: {
    streams: any;
    logger: any;
    emit: any;
  };
}

/**
 * Result from preExec hook
 */
export type PreExecResult = void | { stop?: boolean; reason?: string; modifiedTask?: string };
```

### Step 5: 提交

```bash
git add src/core/task/hooks/
git commit -m "feat: integrate ContextManager into TaskHook system

- Update ContextManagerTaskHook with full implementation
- Create and save task contexts in hook lifecycle
- Update types to support new context structure
- Add integration tests"
```

---

## Task 4: 创建LLM摘要生成服务

**目标:** 实现LLM API调用，用于生成上下文压缩的结构化摘要

**文件:**
- Create: `src/core/llm/summarizer.ts`
- Create: `src/core/llm/client.ts`

### Step 1: 编写LLM摘要服务测试

创建文件: `src/core/llm/__tests__/summarizer.test.ts`

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { LLMSummarizer } from '../summarizer';
import { Message } from '../../database/context-types';

describe('LLMSummarizer', () => {
  let summarizer: LLMSummarizer;

  beforeEach(() => {
    summarizer = new LLMSummarizer({
      apiKey: 'test-key',
      model: 'gpt-4',
    });
  });

  it('should generate structured summary from messages', async () => {
    const messages: Message[] = [
      {
        id: 'msg-1',
        taskId: 'test-task',
        role: 'user',
        content: '创建一个React组件显示用户列表',
        metadata: { timestamp: new Date(), tokens: 20 },
      },
      {
        id: 'msg-2',
        taskId: 'test-task',
        role: 'assistant',
        content: '我将创建UserList组件，包含用户数据获取和展示逻辑',
        metadata: { timestamp: new Date(), tokens: 30 },
      },
      {
        id: 'msg-3',
        taskId: 'test-task',
        role: 'assistant',
        content: '已创建文件 /src/components/UserList.tsx',
        metadata: { timestamp: new Date(), tokens: 25 },
      },
    ];

    // Mock LLM调用
    summarizer.callLLM = async (prompt: string) => {
      return JSON.stringify({
        sessionIntent: '创建React用户列表组件',
        currentTask: '创建UserList组件',
        completedSteps: ['分析需求', '创建组件文件'],
        filesModified: [
          {
            path: '/src/components/UserList.tsx',
            action: 'created',
            description: '创建用户列表组件',
            timestamp: new Date(),
          },
        ],
        decisionsMade: [
          {
            topic: '组件结构',
            decision: '使用函数组件',
            reasoning: '更简单且支持Hooks',
            timestamp: new Date(),
          },
        ],
        currentStatus: 'in_progress',
        nextSteps: ['添加样式', '实现数据获取'],
        errorsAndSolutions: [],
        technicalDetails: {
          functionNames: ['UserList'],
          dependencies: ['react'],
        },
      });
    };

    const summary = await summarizer.summarizeContext(messages);

    expect(summary).toBeDefined();
    expect(summary.sessionIntent).toBe('创建React用户列表组件');
    expect(summary.completedSteps).toHaveLength(2);
    expect(summary.filesModified).toHaveLength(1);
  });
});
```

运行: `npm test -- src/core/llm/__tests__/summarizer.test.ts`

预期: FAIL (LLMSummarizer不存在)

### Step 2: 实现LLM客户端

创建文件: `src/core/llm/client.ts`

```typescript
/**
 * LLM Client
 *
 * 封装LLM API调用，支持流式和非流式响应
 */

export interface LLMClientConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeout?: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class LLMClient {
  private config: LLMClientConfig;

  constructor(config: LLMClientConfig) {
    this.config = {
      model: 'gpt-4',
      timeout: 30000,
      ...config,
    };
  }

  /**
   * 调用LLM API
   */
  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    // 实际实现应该调用真实的LLM API
    // 这里提供简化版本用于开发测试

    try {
      // TODO: 集成真实的LLM API（OpenAI, Anthropic等）
      // const response = await fetch('https://api.openai.com/v1/chat/completions', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${this.config.apiKey}`,
      //   },
      //   body: JSON.stringify({
      //     model: this.config.model,
      //     messages,
      //   }),
      // });

      // const data = await response.json();
      // return {
      //   content: data.choices[0].message.content,
      //   usage: data.usage,
      // };

      // 临时占位实现
      throw new Error('LLM API not implemented yet');
    } catch (error) {
      throw new Error(`LLM API call failed: ${(error as Error).message}`);
    }
  }

  /**
   * 流式调用LLM API
   */
  async *chatStream(messages: LLMMessage[]): AsyncGenerator<string, void, unknown> {
    // TODO: 实现流式响应
    throw new Error('Streaming not implemented yet');
  }
}
```

### Step 3: 实现LLM摘要器

创建文件: `src/core/llm/summarizer.ts`

```typescript
/**
 * LLM摘要器
 *
 * 使用LLM生成上下文的结构化摘要
 */

import { LLMClient, LLMMessage } from './client';
import type { Message, StructuredSummary } from '../database/context-types';

export interface LLMSummarizerConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
}

export class LLMSummarizer {
  private client: LLMClient;

  constructor(config: LLMSummarizerConfig) {
    this.client = new LLMClient(config);
  }

  /**
   * 为LLM调用提供方法（用于测试Mock）
   */
  callLLM: (prompt: string) => Promise<string> = async (prompt: string) => {
    const response = await this.client.chat([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ]);
    return response.content;
  };

  /**
   * 生成上下文的结构化摘要
   */
  async summarizeContext(messages: Message[]): Promise<StructuredSummary> {
    // 1. 构建提示词
    const prompt = this.buildSummarizationPrompt(messages);

    // 2. 调用LLM
    const response = await this.callLLM(prompt);

    // 3. 解析JSON响应
    try {
      const summary = JSON.parse(response) as StructuredSummary;
      return summary;
    } catch (error) {
      // 如果JSON解析失败，返回默认摘要
      return this.getDefaultSummary(messages);
    }
  }

  /**
   * 构建摘要生成的提示词
   */
  private buildSummarizationPrompt(messages: Message[]): string {
    const messagesText = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    return `
请分析以下对话历史，生成结构化摘要。请以JSON格式返回，包含以下字段：

\`\`\`json
{
  "sessionIntent": "会话的主要意图或目标",
  "currentTask": "当前正在执行的任务",
  "completedSteps": ["步骤1", "步骤2", ...],
  "filesModified": [
    {
      "path": "文件路径",
      "action": "created|modified|deleted",
      "description": "简短描述",
      "timestamp": "ISO日期字符串"
    }
  ],
  "decisionsMade": [
    {
      "topic": "决策主题",
      "decision": "做出的决策",
      "reasoning": "决策理由",
      "timestamp": "ISO日期字符串"
    }
  ],
  "currentStatus": "pending|in_progress|completed",
  "nextSteps": ["下一步1", "下一步2", ...],
  "errorsAndSolutions": [
    {
      "error": "错误描述",
      "solution": "解决方案",
      "timestamp": "ISO日期字符串"
    }
  ],
  "technicalDetails": {
    "functionNames": ["函数1", "函数2", ...],
    "errorCodes": ["错误1", "错误2", ...],
    "dependencies": ["依赖1", "依赖2", ...]
  }
}
\`\`\`

对话历史：
${messagesText}

请只返回JSON，不要包含其他解释。
`.trim();
  }

  /**
   * 获取默认摘要（当LLM调用失败时使用）
   */
  private getDefaultSummary(messages: Message[]): StructuredSummary {
    return {
      sessionIntent: '无法确定',
      currentTask: '未知任务',
      completedSteps: messages.map(m => m.content).slice(0, 5),
      filesModified: [],
      decisionsMade: [],
      currentStatus: 'unknown',
      nextSteps: [],
      errorsAndSolutions: [],
      technicalDetails: {},
    };
  }
}
```

### Step 4: 运行测试

运行: `npm test -- src/core/llm/__tests__/summarizer.test.ts`

预期: PASS

### Step 5: 提交

```bash
git add src/core/llm/
git commit -m "feat: add LLM summarization service

- Add LLMClient for API interactions
- Add LLMSummarizer for context compression
- Add unit tests with mock LLM responses
- Add fallback to default summary on failure"
```

---

## Task 5: 将LLM摘要器集成到ContextManager

**目标:** 更新ContextManager使用真实的LLM摘要器

**文件:**
- Modify: `src/core/context/manager.ts`

### Step 1: 更新ContextManager以使用LLM摘要器

修改文件: `src/core/context/manager.ts`

```typescript
/**
 * ContextManager - 上下文管理器
 *
 * 提供任务上下文的创建、更新、查询和压缩功能
 */

import type { TaskContext, Message } from '../database/context-types';
import { ContextStore } from '../database/context-store';
import { ContextCompressor } from './compressor';
import { ArtifactExtractor } from './artifact-extractor';
import { LLMSummarizer } from '../llm/summarizer';

export class ContextManager {
  private store: ContextStore;
  private compressor: ContextCompressor;
  private artifactExtractor: ArtifactExtractor;
  private summarizer?: LLMSummarizer;

  constructor(store?: ContextStore, summarizer?: LLMSummarizer) {
    this.store = store || new ContextStore();
    this.compressor = new ContextCompressor();
    this.artifactExtractor = new ArtifactExtractor();
    this.summarizer = summarizer;
  }

  // ... 其他方法保持不变 ...

  /**
   * 添加消息到上下文
   */
  async addMessage(taskId: string, message: Omit<Message, 'taskId'>): Promise<TaskContext> {
    // 1. 获取当前上下文
    const context = await this.store.getContext(taskId);
    if (!context) {
      throw new Error(`Task context not found: ${taskId}`);
    }

    // 2. 添加消息
    const updatedContext = await this.store.addMessage(taskId, message);

    // 3. 提取并保存Artifacts
    const artifacts = this.artifactExtractor.extractFromMessage({
      ...message,
      taskId,
    });

    for (const artifact of artifacts) {
      await this.store.addArtifact({ ...artifact, taskId });
    }

    // 4. 检查是否需要压缩
    if (this.compressor.shouldCompress(updatedContext)) {
      // 生成压缩摘要
      const llmSummarize = async (messages: Message[]) => {
        if (this.summarizer) {
          return await this.summarizer.summarizeContext(messages);
        } else {
          // Fallback: 简单摘要
          return {
            sessionIntent: '会话意图',
            currentTask: context.summary.currentTask,
            completedSteps: messages.map(m => m.content).slice(0, 5),
            filesModified: [],
            decisionsMade: [],
            currentStatus: 'compressed',
            nextSteps: [],
            errorsAndSolutions: [],
            technicalDetails: {},
          };
        }
      };

      const compressed = await this.compressor.compress(updatedContext, llmSummarize);

      // 5. 保存压缩历史
      await this.store.saveCompressionHistory({
        taskId,
        compressedAt: new Date(),
        originalTokenCount: updatedContext.metadata.totalTokens,
        compressedTokenCount: compressed.metadata.totalTokens,
        compressionRatio:
          compressed.metadata.totalTokens / updatedContext.metadata.totalTokens,
        summary: compressed.summary,
        truncatedMessageIds: updatedContext.messages
          .slice(0, -20)
          .map(m => m.id),
      });

      // 6. 保存压缩后的上下文
      await this.store.saveContext(compressed);

      return compressed;
    }

    return updatedContext;
  }

  // ... 其他方法保持不变 ...
}
```

### Step 2: 更新ContextManagerTaskHook以传递LLM摘要器

修改文件: `src/core/task/hooks/context-manager.ts`

```typescript
import { BaseTaskHook } from './base';
import { TaskContext } from './types';
import { ContextManager } from '../../context/manager';
import { LLMSummarizer } from '../../llm/summarizer';
import { getContextStore } from '../../database/context-store';

/**
 * Context Manager TaskHook
 * 管理任务上下文生命周期（创建、保存、压缩）
 */
export class ContextManagerTaskHook extends BaseTaskHook {
  private contextManager: ContextManager;

  constructor(contextManager?: ContextManager) {
    super();

    if (contextManager) {
      this.contextManager = contextManager;
    } else {
      // 创建默认的ContextManager，配置LLM摘要器
      const apiKey = process.env.LLM_API_KEY || '';
      const summarizer = apiKey ? new LLMSummarizer({ apiKey }) : undefined;
      this.contextManager = new ContextManager(getContextStore(), summarizer);
    }
  }

  // ... 其余代码保持不变 ...
}
```

### Step 3: 运行所有上下文相关测试

运行: `npm test -- src/core/context/ src/core/task/hooks/__tests__/context-manager-hook.test.ts`

预期: PASS

### Step 4: 提交

```bash
git add src/core/context/manager.ts src/core/task/hooks/context-manager.ts
git commit -m "feat: integrate LLM summarizer into ContextManager

- Update ContextManager to use LLMSummarizer for compression
- Update ContextManagerTaskHook to initialize summarizer
- Support fallback when LLM API not configured"
```

---

## Task 6: 创建API端点用于上下文查询

**目标:** 提供REST API用于查询任务的上下文和压缩历史

**文件:**
- Create: `steps/api/context-api.step.ts`

### Step 1: 编写API测试

创建文件: `steps/api/__tests__/context-api.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { handler } from '../context-api.step';

describe('Context API', () => {
  it('should return task context by taskId', async () => {
    const response = await request(handler)
      .get('/api/contexts/task-1')
      .expect(200);

    expect(response.body).toHaveProperty('taskId', 'task-1');
    expect(response.body).toHaveProperty('messages');
    expect(response.body).toHaveProperty('summary');
  });

  it('should return 404 for non-existent context', async () => {
    await request(handler)
      .get('/api/contexts/non-existent')
      .expect(404);
  });

  it('should return compression history', async () => {
    const response = await request(handler)
      .get('/api/contexts/task-1/compression-history')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should return artifacts', async () => {
    const response = await request(handler)
      .get('/api/contexts/task-1/artifacts')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

运行: `npm test -- steps/api/__tests__/context-api.test.ts`

预期: FAIL (API端点不存在)

### Step 2: 实现Context API Step

创建文件: `steps/api/context-api.step.ts`

```typescript
import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';
import { ContextManager } from '../../src/core/context/manager';

export const config: APIConfig = {
  type: 'api',
  name: 'context-api',
  path: '/api/contexts/:id',
  method: 'GET',
  emits: [],
};

const contextStore = getContextStore();
const contextManager = new ContextManager(contextStore);

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const taskId = request.params.id;

    // 获取上下文
    const context = await contextManager.getContext(taskId);

    if (!context) {
      logger.warn('Context not found', { taskId });

      return {
        status: 404,
        body: {
          success: false,
          error: 'Context not found',
        },
      };
    }

    logger.info('Context retrieved', {
      taskId,
      currentTurn: context.currentTurn,
      messageCount: context.messages.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: context,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve context', {
      error: (error as Error).message,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
```

### Step 3: 创建压缩历史API端点

创建文件: `steps/api/context-compression-api.step.ts`

```typescript
import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';

export const config: APIConfig = {
  type: 'api',
  name: 'context-compression-api',
  path: '/api/contexts/:id/compression-history',
  method: 'GET',
  emits: [],
};

const contextStore = getContextStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const taskId = request.params.id;

    // 获取压缩历史
    const history = await contextStore.getCompressionHistory(taskId);

    logger.info('Compression history retrieved', {
      taskId,
      historyCount: history.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: history,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve compression history', {
      error: (error as Error).message,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
```

### Step 4: 创建Artifacts API端点

创建文件: `steps/api/context-artifacts-api.step.ts`

```typescript
import type { APIConfig } from 'motia';
import { z } from 'zod';
import { getContextStore } from '../../src/core/database/context-store';

export const config: APIConfig = {
  type: 'api',
  name: 'context-artifacts-api',
  path: '/api/contexts/:id/artifacts',
  method: 'GET',
  emits: [],
};

const contextStore = getContextStore();

export const handler = async (
  request: any,
  { logger }: any
) => {
  try {
    const taskId = request.params.id;

    // 获取Artifacts
    const artifacts = await contextStore.getArtifacts(taskId);

    logger.info('Artifacts retrieved', {
      taskId,
      artifactCount: artifacts.length,
    });

    return {
      status: 200,
      body: {
        success: true,
        data: artifacts,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve artifacts', {
      error: (error as Error).message,
    });

    return {
      status: 500,
      body: {
        success: false,
        error: (error as Error).message,
      },
    };
  }
};
```

### Step 5: 运行测试

运行: `npm test -- steps/api/__tests__/context-api.test.ts`

预期: PASS

### Step 6: 提交

```bash
git add steps/api/
git commit -m "feat: add context query APIs

- Add GET /api/contexts/:id for task context
- Add GET /api/contexts/:id/compression-history for compression history
- Add GET /api/contexts/:id/artifacts for artifacts
- Add unit tests for all endpoints"
```

---

## Task 7: 文档和示例

**目标:** 编写使用文档和示例代码

**文件:**
- Create: `docs/context-management.md`
- Create: `examples/context-usage.ts`

### Step 1: 编写使用文档

创建文件: `docs/context-management.md`

```markdown
# 上下文管理系统使用指南

## 概述

上下文管理系统提供了任务级别的对话历史、智能压缩和Artifact跟踪功能。

## 核心组件

### 1. ContextManager

上下文管理器，提供上下文的创建、查询、更新和压缩功能。

```typescript
import { ContextManager } from './src/core/context/manager';
import { getContextStore } from './src/core/database/context-store';

const store = getContextStore();
const manager = new ContextManager(store);

// 创建任务上下文
const context = await manager.createTaskContext('task-1', 'session-1', '创建React组件');

// 添加消息
await manager.addMessage('task-1', {
  id: 'msg-1',
  taskId: 'task-1',
  role: 'user',
  content: '创建一个用户列表组件',
  metadata: { timestamp: new Date(), tokens: 20 },
});

// 获取LLM格式的上下文
const llmContext = await manager.getContextForLLM('task-1');
```

### 2. ContextStore

数据库层，负责上下文的持久化存储。

```typescript
import { ContextStore } from './src/core/database/context-store';

const store = new ContextStore();
await store.initialize();

// 创建上下文
const context = await store.createTaskContext('task-1', 'session-1', '测试');

// 查询上下文
const retrieved = await store.getContext('task-1');

// 添加消息
const updated = await store.addMessage('task-1', message);

// 查询Artifacts
const artifacts = await store.getArtifacts('task-1');
```

### 3. TaskHook集成

通过TaskHook自动管理任务上下文。

```typescript
import { ContextManagerTaskHook } from './src/core/task/hooks/context-manager';

const hook = new ContextManagerTaskHook();

// 在任务执行前自动创建上下文
await hook.preExec(taskContext);

// 在任务执行后自动保存上下文
await hook.postExec(taskContext, result);
```

## 配置

### 环境变量

```bash
# LLM API配置（用于上下文压缩）
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4

# 数据库配置
DB_TYPE=sqlite
# 或
DB_TYPE=postgres
DATABASE_URL=postgresql://localhost:5432/motia
```

### 压缩阈值配置

```typescript
import { ContextCompressor } from './src/core/context/compressor';

const compressor = new ContextCompressor(
  100000,  // maxTokens
  0.8,     // threshold (80%)
  20       // messagesToKeep
);
```

## 使用场景

### 场景1: 简单任务执行

```typescript
// 任务执行时会自动创建和管理上下文
const result = await agent.run('创建一个用户列表组件', 'task-1');

// 查询上下文
const context = await contextManager.getContext('task-1');
console.log('对话轮次:', context.currentTurn);
console.log('总token数:', context.metadata.totalTokens);
```

### 场景2: 多轮对话

```typescript
// 第一轮
await contextManager.addMessage('task-1', {
  id: 'msg-1',
  taskId: 'task-1',
  role: 'user',
  content: '创建一个用户列表组件',
  metadata: { timestamp: new Date(), tokens: 20 },
});

// 第二轮
await contextManager.addMessage('task-1', {
  id: 'msg-2',
  taskId: 'task-1',
  role: 'user',
  content: '添加分页功能',
  metadata: { timestamp: new Date(), tokens: 15 },
});

// 上下文自动累积
const context = await contextManager.getContext('task-1');
console.log('对话轮次:', context.currentTurn); // 2
```

### 场景3: 上下文压缩

```typescript
// 当token数超过阈值时自动压缩
const context = await contextManager.getContext('task-1');

if (context.metadata.lastCompressedAt) {
  console.log('上下文已压缩于:', context.metadata.lastCompressedAt);
  console.log('摘要:', context.summary);
}

// 查看压缩历史
const history = await contextStore.getCompressionHistory('task-1');
for (const record of history) {
  console.log(\`压缩率: \${record.compressionRatio * 100}%\`);
}
```

## API端点

### 查询任务上下文

\`\`\`bash
GET /api/contexts/:id
\`\`\`

响应:
\`\`\`json
{
  "success": true,
  "data": {
    "taskId": "task-1",
    "sessionId": "session-1",
    "currentTurn": 5,
    "messages": [...],
    "summary": {...},
    "artifactIndex": [...]
  }
}
\`\`\`

### 查询压缩历史

\`\`\`bash
GET /api/contexts/:id/compression-history
\`\`\`

### 查询Artifacts

\`\`\`bash
GET /api/contexts/:id/artifacts
\`\`\`

## 最佳实践

1. **及时保存上下文**: 在关键步骤后调用`saveContext()`
2. **合理设置压缩阈值**: 根据实际token消耗调整`maxTokens`和`threshold`
3. **利用Artifact索引**: 通过Artifact跟踪快速定位文件修改
4. **监控压缩质量**: 定期检查压缩历史，确保摘要质量
5. **处理长对话**: 对于超长对话，考虑调整`messagesToKeep`参数

## 故障排查

### 问题: 上下文未自动创建

**解决方案**: 检查TaskHook是否正确注册

```typescript
const hookExecutor = new TaskHookExecutor();
hookExecutor.registerHook(new ContextManagerTaskHook());
```

### 问题: LLM摘要失败

**解决方案**: 检查API密钥配置或网络连接

```typescript
const summarizer = new LLMSummarizer({
  apiKey: process.env.LLM_API_KEY,
  model: 'gpt-4',
});
```

### 问题: 数据库锁定

**解决方案**: 确保每个ContextStore实例正确关闭

```typescript
await store.close();
```
```

### Step 2: 编写示例代码

创建文件: `examples/context-usage.ts`

```typescript
/**
 * 上下文管理系统使用示例
 */

import { ContextManager } from '../src/core/context/manager';
import { ContextStore } from '../src/core/database/context-store';
import { LLMSummarizer } from '../src/core/llm/summarizer';
import type { Message } from '../src/core/database/context-types';

async function basicUsageExample() {
  console.log('=== 基本使用示例 ===');

  const store = new ContextStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);

  // 1. 创建任务上下文
  const context = await manager.createTaskContext(
    'task-1',
    'session-1',
    '创建React用户列表组件'
  );

  console.log('任务上下文已创建:', {
    taskId: context.taskId,
    currentTurn: context.currentTurn,
  });

  // 2. 添加用户消息
  const userMessage: Message = {
    id: 'msg-1',
    taskId: 'task-1',
    role: 'user',
    content: '创建一个显示用户列表的React组件',
    metadata: { timestamp: new Date(), tokens: 20 },
  };

  await manager.addMessage('task-1', userMessage);
  console.log('用户消息已添加');

  // 3. 添加助手响应
  const assistantMessage: Message = {
    id: 'msg-2',
    taskId: 'task-1',
    role: 'assistant',
    content: '我将创建UserList组件，包含用户数据获取和展示逻辑',
    metadata: { timestamp: new Date(), tokens: 30, skillCalls: ['file-write'] },
  };

  const updated = await manager.addMessage('task-1', assistantMessage);
  console.log('助手响应已添加，当前轮次:', updated.currentTurn);

  // 4. 查询Artifacts
  const artifacts = await store.getArtifacts('task-1');
  console.log('提取到的Artifacts:', artifacts.length);

  // 5. 获取LLM格式的上下文
  const llmContext = await manager.getContextForLLM('task-1');
  console.log('LLM上下文已生成');

  await store.close();
}

async function multiTurnExample() {
  console.log('\n=== 多轮对话示例 ===');

  const store = new ContextStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-2', 'session-2', '优化代码性能');

  // 多轮对话
  const turns = [
    { role: 'user' as const, content: '分析React组件性能问题' },
    { role: 'assistant' as const, content: '我发现了3个性能瓶颈' },
    { role: 'user' as const, content: '重点关注useMemo的使用' },
    { role: 'assistant' as const, content: '好的，我会检查useMemo的使用场景' },
    { role: 'user' as const, content: '给出优化建议' },
  ];

  for (let i = 0; i < turns.length; i++) {
    await manager.addMessage('task-2', {
      id: `msg-${i + 1}`,
      taskId: 'task-2',
      ...turns[i],
      metadata: { timestamp: new Date(), tokens: 50 },
    });
  }

  const context = await manager.getContext('task-2');
  console.log('对话轮次:', context.currentTurn);
  console.log('消息数量:', context.messages.length);

  await store.close();
}

async function compressionExample() {
  console.log('\n=== 上下文压缩示例 ===');

  const store = new ContextStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-3', 'session-3', '长任务');

  // 模拟大量消息
  for (let i = 0; i < 25; i++) {
    await manager.addMessage('task-3', {
      id: `msg-${i}`,
      taskId: 'task-3',
      role: 'assistant',
      content: `处理第${i}个文件`,
      metadata: { timestamp: new Date(), tokens: 5000 },
    });
  }

  const context = await manager.getContext('task-3');
  console.log('总token数:', context.metadata.totalTokens);
  console.log('最后压缩时间:', context.metadata.lastCompressedAt);
  console.log('当前消息数:', context.messages.length);

  // 查看压缩历史
  const history = await store.getCompressionHistory('task-3');
  console.log('压缩次数:', history.length);
  for (const record of history) {
    console.log(\`压缩率: \${(record.compressionRatio * 100).toFixed(1)}%\`);
  }

  await store.close();
}

async function artifactTrackingExample() {
  console.log('\n=== Artifact跟踪示例 ===');

  const store = new ContextStore(':memory:');
  await store.initialize();

  const manager = new ContextManager(store);
  await manager.createTaskContext('task-4', 'session-4', '文件操作');

  // 包含文件路径的消息
  const messages = [
    '已创建文件 /src/components/UserList.tsx',
    '修改了 /src/utils/api.ts 中的数据获取函数',
    '删除了 /src/old/unused.ts 文件',
    '调用了函数 fetchDataFromAPI',
  ];

  for (let i = 0; i < messages.length; i++) {
    await manager.addMessage('task-4', {
      id: `msg-${i}`,
      taskId: 'task-4',
      role: 'assistant',
      content: messages[i],
      metadata: { timestamp: new Date(), tokens: 30 },
    });
  }

  // 查询所有Artifacts
  const artifacts = await store.getArtifacts('task-4');
  console.log('发现的Artifacts:');
  for (const artifact of artifacts) {
    console.log(\`- \${artifact.artifactType}: \${artifact.action} \${artifact.path}\`);
  }

  await store.close();
}

// 运行所有示例
async function main() {
  try {
    await basicUsageExample();
    await multiTurnExample();
    await compressionExample();
    await artifactTrackingExample();

    console.log('\n所有示例运行完成！');
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

if (require.main === module) {
  main();
}
```

### Step 3: 更新主README

修改文件: `README.md`（在相关章节添加）

```markdown
## 上下文管理

本项目实现了完整的任务级上下文管理系统，支持多轮对话、智能压缩和Artifact跟踪。

详见 [上下文管理文档](docs/context-management.md)。
```

### Step 4: 运行示例

运行: `npx ts-node examples/context-usage.ts`

预期: 成功运行所有示例

### Step 5: 提交

```bash
git add docs/ examples/
git commit -m "docs: add context management documentation and examples

- Add comprehensive usage guide in docs/context-management.md
- Add working code examples in examples/context-usage.ts
- Update main README with context management section"
```

---

## 总结

通过本计划，我们完成了：

1. ✅ 扩展数据库Schema支持上下文存储
2. ✅ 实现ContextManager核心逻辑
3. ✅ 集成到TaskHook系统
4. ✅ 实现LLM摘要生成服务
5. ✅ 创建REST API端点
6. ✅ 编写文档和示例

**关键成就:**
- 建立了完整的上下文生命周期管理
- 支持智能压缩以控制token消耗
- 自动跟踪文件和函数等Artifacts
- 提供REST API用于查询和管理
- 完整的单元测试覆盖

**下一步:**
- Phase 3: 实现多轮对话API
- Phase 4: 前端UI集成
- Phase 5: 端到端测试和优化
