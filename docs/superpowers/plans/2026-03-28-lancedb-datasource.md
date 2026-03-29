# LanceDB 数据源支持实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 为 MyAgent 知识库系统添加 LanceDB 作为支持的数据源类型，实现多数据源共存和并行检索融合

**架构:** 适配器模式 - 通过 IVectorStore 接口抽象不同的向量数据库实现，使用 RetrievalCoordinator 协调多数据源并行检索

**技术栈:** TypeScript, LanceDB (@lancedb/lancedb), PostgreSQL (pgvector), OpenAI Embeddings API

---

## 文件结构

```
src/core/knowledge/
├── interfaces/
│   ├── vector-store.interface.ts      # NEW - 统一接口定义
│   ├── knowledge-entry.interface.ts   # NEW - 知识条目类型
│   └── adapter-config.interface.ts    # NEW - 适配器配置类型
├── adapters/
│   ├── postgres-adapter.ts            # NEW - PostgreSQL 适配器（重构现有代码）
│   └── lancedb-adapter.ts             # NEW - LanceDB 适配器
├── coordinator/
│   ├── retrieval-coordinator.ts       # NEW - 检索协调器
│   └── coordinator-config.interface.ts # NEW - 协调器配置
├── errors/
│   └── knowledge-errors.ts             # NEW - 自定义错误类型
├── knowledge-base.ts                   # MODIFY - 保留向后兼容
├── datasource-manager.ts              # MODIFY - 扩展支持 LanceDB
└── datasource-store.ts                # MODIFY - 扩展数据源类型
```

---

## Chunk 1: 核心接口和类型定义

### Task 1: 创建知识条目接口

**Files:**
- Create: `src/core/knowledge/interfaces/knowledge-entry.interface.ts`

- [ ] **Step 1: 创建文件并定义接口**

```typescript
/**
 * Knowledge Entry Interface
 * Unified knowledge entry structure across all vector stores
 */

export interface KnowledgeEntry {
  id: string | number;
  tenantId: string;
  collectionName: string;
  content: string;
  metadata?: Record<string, any>;
  similarity?: number;  // Computed during retrieval
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrieveOptions {
  limit?: number;           // Default: 5
  threshold?: number;       // Default: 0.7
}

export interface EmbeddingOptions {
  maxRetries?: number;      // Default: 3
  initialDelay?: number;    // Default: 1000ms
}
```

- [ ] **Step 2: 提交接口定义**

```bash
git add src/core/knowledge/interfaces/knowledge-entry.interface.ts
git commit -m "feat(knowledge): add unified knowledge entry interface"
```

---

### Task 2: 创建向量存储抽象接口

**Files:**
- Create: `src/core/knowledge/interfaces/vector-store.interface.ts`

- [ ] **Step 1: 定义向量存储接口**

```typescript
/**
 * Vector Store Interface
 * Abstraction for different vector database backends
 */

import type { KnowledgeEntry, RetrieveOptions } from './knowledge-entry.interface.js';

export interface IVectorStore {
  /**
   * Add a single knowledge entry
   * @returns ID of the created entry
   */
  addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string | number>;

  /**
   * Add multiple knowledge entries in batch
   * @returns Array of created entry IDs
   */
  addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<(string | number)[]>;

  /**
   * Retrieve knowledge entries by vector similarity
   * @returns Array of relevant entries with similarity scores
   */
  retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]>;

  /**
   * Health check for the vector store
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;

  /**
   * Close connection and cleanup resources
   */
  close(): Promise<void>;
}
```

- [ ] **Step 2: 提交接口定义**

```bash
git add src/core/knowledge/interfaces/vector-store.interface.ts
git commit -m "feat(knowledge): add vector store abstraction interface"
```

---

### Task 3: 创建适配器配置接口

**Files:**
- Create: `src/core/knowledge/interfaces/adapter-config.interface.ts`

- [ ] **Step 1: 定义配置接口和验证**

```typescript
/**
 * Vector Store Adapter Configuration
 * Type-safe configuration with validation
 */

export type VectorStoreType = 'postgres-pgvector' | 'lancedb';

// Configuration constraints
export const CONFIG_CONSTRAINTS = {
  MIN_EMBEDDING_DIMENSIONS: 128,
  MAX_EMBEDDING_DIMENSIONS: 4096,
  MIN_CACHE_TTL: 60000,      // 1 minute
  MAX_CACHE_TTL: 3600000,    // 60 minutes
  LANCEDB_URI_PATTERN: /^(\.|\.\/|[a-zA-Z]:|s3:\/\/|gs:\/\/|az:\/\/)/,
  POSTGRES_PORT_RANGE: { min: 1, max: 65535 },
} as const;

export interface BaseVectorStoreConfig {
  type: VectorStoreType;
  embedding: {
    apiKey: string;
    baseURL?: string;
    model: string;
    dimensions: number;
  };
  cacheTtl?: number;
}

export interface PostgresConfig extends BaseVectorStoreConfig {
  type: 'postgres-pgvector';
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
}

export interface LanceDBConfig extends BaseVectorStoreConfig {
  type: 'lancedb';
  connection: {
    uri: string;
    apiKey?: string;
  };
}

export type VectorStoreConfig = PostgresConfig | LanceDBConfig;

export function validateConfig(config: VectorStoreConfig): void {
  const { dimensions } = config.embedding;
  if (dimensions < CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS ||
      dimensions > CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimensions must be between ${CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS} and ${CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS}`
    );
  }

  const cacheTtl = config.cacheTtl || 300000;
  if (cacheTtl < CONFIG_CONSTRAINTS.MIN_CACHE_TTL ||
      cacheTtl > CONFIG_CONSTRAINTS.MAX_CACHE_TTL) {
    throw new Error(
      `Cache TTL must be between ${CONFIG_CONSTRAINTS.MIN_CACHE_TTL} and ${CONFIG_CONSTRAINTS.MAX_CACHE_TTL} ms`
    );
  }

  if (config.type === 'postgres-pgvector') {
    const { port } = config.connection;
    if (port < CONFIG_CONSTRAINTS.POSTGRES_PORT_RANGE.min ||
        port > CONFIG_CONSTRAINTS.POSTGRES_PORT_RANGE.max) {
      throw new Error(`PostgreSQL port must be between 1 and 65535`);
    }
  } else if (config.type === 'lancedb') {
    if (!CONFIG_CONSTRAINTS.LANCEDB_URI_PATTERN.test(config.connection.uri)) {
      throw new Error(
        `LanceDB URI must start with ./, ../, [drive]:/, s3://, gs://, or az://`
      );
    }
  }
}
```

- [ ] **Step 2: 提交配置定义**

```bash
git add src/core/knowledge/interfaces/adapter-config.interface.ts
git commit -m "feat(knowledge): add adapter configuration with validation"
```

---

### Task 4: 创建自定义错误类型

**Files:**
- Create: `src/core/knowledge/errors/knowledge-errors.ts`

- [ ] **Step 1: 定义错误类型**

```typescript
/**
 * Custom Error Types for Knowledge Base
 * Provides specific error handling and recovery strategies
 */

export class KnowledgeBaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KnowledgeBaseError';
  }
}

export class ValidationError extends KnowledgeBaseError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConnectionError extends KnowledgeBaseError {
  constructor(message: string, public readonly dataSourceType: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

export class KnowledgeInsertError extends KnowledgeBaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KnowledgeInsertError';
  }
}

export class EmbeddingGenerationError extends KnowledgeBaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingGenerationError';
  }
}

export class RetrievalError extends KnowledgeBaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RetrievalError';
  }
}
```

- [ ] **Step 2: 提交错误类型定义**

```bash
git add src/core/knowledge/errors/knowledge-errors.ts
git commit -m "feat(knowledge): add custom error types"
```

---

## Chunk 2: PostgreSQL 适配器（重构现有代码）

### Task 5: 重构 KnowledgeBase 为 PostgreSQL 适配器

**Files:**
- Create: `src/core/knowledge/adapters/postgres-adapter.ts`
- Modify: `src/core/knowledge/knowledge-base.ts` (保留向后兼容包装)

- [ ] **Step 1: 创建 PostgreSQL 适配器**

```typescript
/**
 * PostgreSQL + pgvector Adapter
 * Implements IVectorStore interface for PostgreSQL with pgvector extension
 */

import { Pool, PoolConfig } from 'pg';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import type {
  IVectorStore,
  KnowledgeEntry,
  RetrieveOptions,
  EmbeddingOptions,
} from '../interfaces/vector-store.interface.js';
import type { PostgresConfig } from '../interfaces/adapter-config.interface.js';
import {
  ValidationError,
  ConnectionError,
  KnowledgeInsertError,
  EmbeddingGenerationError,
} from '../errors/knowledge-errors.js';

export class PostgresVectorStore implements IVectorStore {
  private pool: Pool;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions: number;

  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private readonly MAX_CONTENT_LENGTH = 100000;

  constructor(config: PostgresConfig) {
    if (!config.embedding.apiKey) {
      throw new Error('API key is required for PostgresVectorStore');
    }

    this.pool = new Pool({
      host: config.connection.host,
      port: config.connection.port,
      database: config.connection.database,
      user: config.connection.user,
      password: config.connection.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.openai = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseURL,
    });

    this.embeddingModel = config.embedding.model;
    this.embeddingDimensions = config.embedding.dimensions;

    this.embeddingCache = new LRUCache<string, number[]>({
      max: 1000,
      ttl: config.cacheTtl || 300000,
    });
  }

  async addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<number> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    const sanitizedContent = this.sanitizeContent(content);
    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      throw new ValidationError('Content cannot be empty');
    }

    const embedding = await this.embedQueryWithRetry(sanitizedContent);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<{ id: number }>(
        `INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, collection_name, content)
         DO UPDATE SET
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()
         RETURNING id`,
        [tenantId, collectionName, sanitizedContent, JSON.stringify(metadata || {}), embedding]
      );

      await client.query('COMMIT');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new KnowledgeInsertError(`Failed to add knowledge: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }

  async addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<number[]> {
    const ids: number[] = [];
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const entry of entries) {
        const sanitizedContent = this.sanitizeContent(entry.content);
        const embedding = await this.embedQueryWithRetry(sanitizedContent);

        const result = await client.query<{ id: number }>(
          `INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, collection_name, content)
           DO UPDATE SET metadata = EXCLUDED.metadata
           RETURNING id`,
          [tenantId, collectionName, sanitizedContent, JSON.stringify(entry.metadata || {}), embedding]
        );

        ids.push(result.rows[0].id);
      }

      await client.query('COMMIT');
      return ids;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new KnowledgeInsertError(`Failed to add batch knowledge: ${(err as Error).message}`, { cause: err });
    } finally {
      client.release();
    }
  }

  async retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options: RetrieveOptions = {}
  ): Promise<KnowledgeEntry[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }

    const limit = options.limit || 5;
    const threshold = options.threshold || 0.7;

    const queryEmbedding = await this.embedQueryWithRetry(query);

    const client = await this.pool.connect();
    try {
      const searchQuery = `
        SELECT id, tenant_id, collection_name, content, metadata,
               1 - (embedding <=> $1::vector) AS similarity,
               created_at, updated_at
        FROM knowledge
        WHERE tenant_id = $2 AND collection_name = $3
          AND 1 - (embedding <=> $1::vector) > $4
        ORDER BY embedding <=> $1::vector
        LIMIT $5
      `;

      const result = await client.query<KnowledgeEntry>(
        searchQuery,
        [`[${queryEmbedding.join(',')}]`, tenantId, collectionName, threshold, limit]
      );

      return result.rows;
    } catch (err) {
      console.error(`PostgreSQL retrieval error for collection ${collectionName}:`, err);
      return [];
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  async close(): Promise<void> {
    this.embeddingCache.clear();
    await this.pool.end();
  }

  private async embedQueryWithRetry(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;

    const cached = this.embeddingCache.get(text);
    if (cached) return cached;

    let lastError: Error;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: text,
        });

        const embedding = response.data[0].embedding;
        this.embeddingCache.set(text, embedding);
        return embedding;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
        }
      }
    }

    throw new EmbeddingGenerationError(
      `Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`,
      { cause: lastError }
    );
  }

  private sanitizeContent(content: string): string {
    if (content.length > this.MAX_CONTENT_LENGTH) {
      content = content.substring(0, this.MAX_CONTENT_LENGTH);
    }

    content = content.replace(/<[^>]*>/g, '');
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    content = content.replace(/;.*DROP TABLE.*/gi, '');
    content = content.replace(/;.*DELETE FROM.*/gi, '');
    content = content.replace(/;.*EXEC.*/gi, '');
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }
}
```

- [ ] **Step 2: 更新 knowledge-base.ts 保留向后兼容**

在 `src/core/knowledge/knowledge-base.ts` 文件开头添加：

```typescript
/**
 * MyAgent Knowledge Base Management
 *
 * @deprecated Use PostgresVectorStore adapter directly.
 * This file is kept for backward compatibility.
 */

import { PostgresVectorStore } from './adapters/postgres-adapter.js';
import type { PostgresConfig } from './interfaces/adapter-config.interface.js';

// Re-export for backward compatibility
export type { KnowledgeEntry, RetrieveOptions } from './interfaces/knowledge-entry.interface.js';
export type { KnowledgeBaseConfig } from './interfaces/adapter-config.interface.js';

// Backward compatible wrapper
export class KnowledgeBase extends PostgresVectorStore {
  constructor(config: any) {
    // Convert old config format to new format
    const postgresConfig: PostgresConfig = {
      type: 'postgres-pgvector',
      embedding: {
        apiKey: config.openaiApiKey || config.apiKey,
        baseURL: config.baseURL,
        model: config.embeddingModel || 'text-embedding-3-small',
        dimensions: config.embeddingDimensions || 1536,
      },
      cacheTtl: config.cacheTtl,
      connection: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
      },
    };

    super(postgresConfig);
  }
}
```

- [ ] **Step 3: 提交 PostgreSQL 适配器**

```bash
git add src/core/knowledge/adapters/postgres-adapter.ts src/core/knowledge/knowledge-base.ts
git commit -m "refactor(knowledge): implement PostgreSQL adapter with IVectorStore interface"
```

---

### Task 6: 创建 PostgreSQL 适配器单元测试

**Files:**
- Create: `tests/unit/knowledge/adapters/postgres-adapter.test.ts`

- [ ] **Step 1: 编写测试文件**

```typescript
/**
 * PostgreSQL Adapter Unit Tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PostgresVectorStore } from '../../../../src/core/knowledge/adapters/postgres-adapter.js';
import type { PostgresConfig } from '../../../../src/core/knowledge/interfaces/adapter-config.js';

const TEST_CONFIG: PostgresConfig = {
  type: 'postgres-pgvector',
  embedding: {
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  connection: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'myagent_test',
    user: process.env.PG_USER || 'leo',
  },
};

describe('PostgresVectorStore', () => {
  let store: PostgresVectorStore;

  beforeAll(() => {
    store = new PostgresVectorStore(TEST_CONFIG);
  });

  afterAll(async () => {
    await store.close();
  });

  describe('addKnowledge', () => {
    it('should add knowledge entry', async () => {
      const id = await store.addKnowledge(
        'test-tenant',
        'test-collection',
        'Test content for knowledge base'
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
    });

    it('should reject invalid collection name', async () => {
      await expect(
        store.addKnowledge('test-tenant', 'invalid name', 'content')
      ).rejects.toThrow('Invalid collection name');
    });

    it('should reject empty content', async () => {
      await expect(
        store.addKnowledge('test-tenant', 'test-collection', '')
      ).rejects.toThrow('Content cannot be empty');
    });
  });

  describe('retrieve', () => {
    beforeAll(async () => {
      await store.addKnowledge('test-tenant', 'search-test', 'Python is a programming language');
      await store.addKnowledge('test-tenant', 'search-test', 'JavaScript is used for web development');
    });

    it('should retrieve relevant knowledge', async () => {
      const results = await store.retrieve('test-tenant', 'search-test', 'programming language');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('programming');
    });

    it('should respect limit option', async () => {
      const results = await store.retrieve('test-tenant', 'search-test', 'language', { limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when connected', async () => {
      const health = await store.healthCheck();

      expect(health.healthy).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
npm test -- tests/unit/knowledge/adapters/postgres-adapter.test.ts
```

预期：测试通过（需要测试数据库）

- [ ] **Step 3: 提交测试**

```bash
git add tests/unit/knowledge/adapters/postgres-adapter.test.ts
git commit -m "test(knowledge): add PostgreSQL adapter unit tests"
```

---

## Chunk 3: LanceDB 适配器

### Task 7: 安装 LanceDB 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 LanceDB 依赖**

在 `package.json` 的 dependencies 中添加：

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.5.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
npm install
```

- [ ] **Step 3: 提交依赖更改**

```bash
git add package.json package-lock.json
git commit -m "deps: add @lancedb/lancedb dependency"
```

---

### Task 8: 实现 LanceDB 适配器

**Files:**
- Create: `src/core/knowledge/adapters/lancedb-adapter.ts`

- [ ] **Step 1: 创建 LanceDB 适配器**

```typescript
/**
 * LanceDB Adapter
 * Implements IVectorStore interface for LanceDB vector database
 */

import * as lance from '@lancedb/lancedb';
import OpenAI from 'openai';
import { LRUCache } from 'lru-cache';
import type {
  IVectorStore,
  KnowledgeEntry,
  RetrieveOptions,
  EmbeddingOptions,
} from '../interfaces/vector-store.interface.js';
import type { LanceDBConfig } from '../interfaces/adapter-config.interface.js';
import {
  ValidationError,
  ConnectionError,
  KnowledgeInsertError,
  EmbeddingGenerationError,
} from '../errors/knowledge-errors.js';

export class LanceDBVectorStore implements IVectorStore {
  private db: lance.Connection;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions: number;
  private readonly CONNECTION_TIMEOUT = 30000;

  private readonly COLLECTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private readonly MAX_CONTENT_LENGTH = 100000;

  constructor(private config: LanceDBConfig) {
    if (!config.embedding.apiKey) {
      throw new Error('API key is required for LanceDBVectorStore');
    }

    this.openai = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseURL,
    });

    this.embeddingModel = config.embedding.model;
    this.embeddingDimensions = config.embedding.dimensions;

    this.embeddingCache = new LRUCache<string, number[]>({
      max: 1000,
      ttl: config.cacheTtl || 300000,
    });
  }

  private async initializeConnection(): Promise<void> {
    try {
      const connectionPromise = lance.connect(this.config.connection.uri);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
      );

      this.db = await Promise.race([connectionPromise, timeoutPromise]) as lance.Connection;
    } catch (error) {
      throw new ConnectionError(
        `Failed to connect to LanceDB at ${this.config.connection.uri}: ${(error as Error).message}`,
        'lancedb',
        { cause: error }
      );
    }
  }

  async addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    const sanitizedContent = this.sanitizeContent(content);
    if (!sanitizedContent || sanitizedContent.trim().length === 0) {
      throw new ValidationError('Content cannot be empty');
    }

    try {
      const table = await this.openOrCreateTable(collectionName);
      const embedding = await this.embedQueryWithRetry(sanitizedContent);

      const id = `${tenantId}-${collectionName}-${Date.now()}`;

      await table.add([{
        id,
        tenantId,
        content: sanitizedContent,
        metadata: metadata || {},
        vector: embedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }]);

      return id;
    } catch (error) {
      throw new KnowledgeInsertError(
        `Failed to add knowledge to collection ${collectionName}: ${(error as Error).message}`,
        { cause: error }
      );
    }
  }

  async addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<string[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    try {
      const table = await this.openOrCreateTable(collectionName);
      const ids: string[] = [];
      const data = [];

      for (const entry of entries) {
        const sanitizedContent = this.sanitizeContent(entry.content);
        const embedding = await this.embedQueryWithRetry(sanitizedContent);

        const id = `${tenantId}-${collectionName}-${Date.now()}-${ids.length}`;
        ids.push(id);

        data.push({
          id,
          tenantId,
          content: sanitizedContent,
          metadata: entry.metadata || {},
          vector: embedding,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      await table.add(data);
      return ids;
    } catch (error) {
      throw new KnowledgeInsertError(
        `Failed to add batch knowledge to collection ${collectionName}: ${(error as Error).message}`,
        { cause: error }
      );
    }
  }

  async retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options: RetrieveOptions = {}
  ): Promise<KnowledgeEntry[]> {
    if (!this.COLLECTION_NAME_REGEX.test(collectionName)) {
      throw new ValidationError(`Invalid collection name: ${collectionName}`);
    }

    if (!query || query.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }

    try {
      const table = await this.db.openTable(collectionName);
      if (!table) return [];

      const queryEmbedding = await this.embedQueryWithRetry(query);
      const limit = options.limit || 5;
      const threshold = options.threshold || 0.7;

      const results = await table
        .search(queryEmbedding)
        .limit(limit)
        .where(`tenantId = '${tenantId}'`)
        .execute();

      return results
        .map((r: any) => ({
          id: r.id,
          tenantId: r.tenantId,
          collectionName,
          content: r.content,
          metadata: r.metadata || {},
          similarity: 1 - r._distance,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
        }))
        .filter(r => (r.similarity || 0) >= threshold);
    } catch (error) {
      console.error(`LanceDB retrieval error for collection ${collectionName}:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const tables = await this.db.tableNames();
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: (error as Error).message };
    }
  }

  async close(): Promise<void> {
    this.embeddingCache.clear();
    await this.db.close();
  }

  private async openOrCreateTable(name: string) {
    try {
      return await this.db.openTable(name);
    } catch {
      return await this.db.createTable(name, [
        { name: 'id', type: 'string' },
        { name: 'tenantId', type: 'string' },
        { name: 'content', type: 'string' },
        { name: 'metadata', type: 'json' },
        { name: 'vector', type: 'vector', dimension: this.embeddingDimensions },
        { name: 'createdAt', type: 'string' },
        { name: 'updatedAt', type: 'string' },
      ]);
    }
  }

  private async embedQueryWithRetry(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    const maxRetries = options.maxRetries || 3;
    const initialDelay = options.initialDelay || 1000;

    const cached = this.embeddingCache.get(text);
    if (cached) return cached;

    let lastError: Error;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.embeddingModel,
          input: text,
        });

        const embedding = response.data[0].embedding;
        this.embeddingCache.set(text, embedding);
        return embedding;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
        }
      }
    }

    throw new EmbeddingGenerationError(
      `Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`,
      { cause: lastError }
    );
  }

  private sanitizeContent(content: string): string {
    if (content.length > this.MAX_CONTENT_LENGTH) {
      content = content.substring(0, this.MAX_CONTENT_LENGTH);
    }

    content = content.replace(/<[^>]*>/g, '');
    content = content.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    content = content.replace(/\s+/g, ' ').trim();

    return content;
  }
}
```

- [ ] **Step 2: 提交 LanceDB 适配器**

```bash
git add src/core/knowledge/adapters/lancedb-adapter.ts
git commit -m "feat(knowledge): implement LanceDB adapter"
```

---

### Task 9: 创建 LanceDB 适配器单元测试

**Files:**
- Create: `tests/unit/knowledge/adapters/lancedb-adapter.test.ts`

- [ ] **Step 1: 编写测试文件**

```typescript
/**
 * LanceDB Adapter Unit Tests
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { LanceDBVectorStore } from '../../../../src/core/knowledge/adapters/lancedb-adapter.js';
import type { LanceDBConfig } from '../../../../src/core/knowledge/interfaces/adapter-config.js';
import { promises as fs } from 'fs';

const TEST_URI = `./test-lancedb-${Date.now()}`;

const TEST_CONFIG: LanceDBConfig = {
  type: 'lancedb',
  embedding: {
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  connection: {
    uri: TEST_URI,
  },
};

describe('LanceDBVectorStore', () => {
  let store: LanceDBVectorStore;

  beforeAll(async () => {
    // Ensure test directory exists
    await fs.mkdir('./test-data', { recursive: true });
    store = new LanceDBVectorStore(TEST_CONFIG);
  });

  afterAll(async () => {
    await store.close();
    // Cleanup test directory
    await fs.rm(TEST_URI, { recursive: true, force: true }).catch(() => {});
  });

  describe('addKnowledge', () => {
    it('should add knowledge entry', async () => {
      const id = await store.addKnowledge(
        'test-tenant',
        'test-collection',
        'Test content for LanceDB'
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should reject invalid collection name', async () => {
      await expect(
        store.addKnowledge('test-tenant', 'invalid name', 'content')
      ).rejects.toThrow('Invalid collection name');
    });
  });

  describe('addKnowledgeBatch', () => {
    it('should add multiple entries', async () => {
      const ids = await store.addKnowledgeBatch(
        'test-tenant',
        'batch-test',
        [
          { content: 'First entry' },
          { content: 'Second entry', metadata: { key: 'value' } },
        ]
      );

      expect(ids).toHaveLength(2);
    });
  });

  describe('retrieve', () => {
    beforeAll(async () => {
      await store.addKnowledge('test-tenant', 'search-test', 'Python programming language');
      await store.addKnowledge('test-tenant', 'search-test', 'JavaScript web development');
    });

    it('should retrieve relevant knowledge', async () => {
      const results = await store.retrieve('test-tenant', 'search-test', 'programming');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when connected', async () => {
      const health = await store.healthCheck();

      expect(health.healthy).toBe(true);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证**

```bash
npm test -- tests/unit/knowledge/adapters/lancedb-adapter.test.ts
```

- [ ] **Step 3: 提交测试**

```bash
git add tests/unit/knowledge/adapters/lancedb-adapter.test.ts
git commit -m "test(knowledge): add LanceDB adapter unit tests"
```

---

## Chunk 4: 检索协调器

### Task 10: 实现检索协调器

**Files:**
- Create: `src/core/knowledge/coordinator/retrieval-coordinator.ts`
- Create: `src/core/knowledge/coordinator/coordinator-config.interface.ts`

- [ ] **Step 1: 创建协调器配置接口**

```typescript
/**
 * Retrieval Coordinator Configuration
 */

export interface CoordinatorConfig {
  maxConcurrency?: number;
  limitPerSource?: number;
  globalLimit?: number;
  normalizationStrategy?: 'none' | 'min-max';
}
```

- [ ] **Step 2: 创建检索协调器**

```typescript
/**
 * Retrieval Coordinator
 * Coordinates parallel retrieval from multiple vector stores
 */

import type { IVectorStore, KnowledgeEntry, RetrieveOptions } from '../interfaces/vector-store.interface.js';
import type { VectorStoreConfig } from '../interfaces/adapter-config.interface.js';
import type { CoordinatorConfig } from './coordinator-config.interface.js';
import { PostgresVectorStore } from '../adapters/postgres-adapter.js';
import { LanceDBVectorStore } from '../adapters/lancedb-adapter.js';
import { validateConfig } from '../interfaces/adapter-config.interface.js';

export class RetrievalCoordinator {
  private stores: Map<string, IVectorStore> = new Map();
  private config: Required<CoordinatorConfig>;

  constructor(config: CoordinatorConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency || 5,
      limitPerSource: config.limitPerSource || 10,
      globalLimit: config.globalLimit || 5,
      normalizationStrategy: config.normalizationStrategy || 'min-max',
    };
  }

  /**
   * Get or create vector store instance for a config
   */
  private getStore(config: VectorStoreConfig): IVectorStore {
    const key = this.getStoreKey(config);

    if (!this.stores.has(key)) {
      validateConfig(config);

      if (config.type === 'postgres-pgvector') {
        this.stores.set(key, new PostgresVectorStore(config));
      } else if (config.type === 'lancedb') {
        this.stores.set(key, new LanceDBVectorStore(config));
      }
    }

    return this.stores.get(key)!;
  }

  /**
   * Generate unique key for store caching
   */
  private getStoreKey(config: VectorStoreConfig): string {
    if (config.type === 'postgres-pgvector') {
      return `${config.type}://${config.connection.host}:${config.connection.port}/${config.connection.database}`;
    } else {
      return `${config.type}://${config.connection.uri}`;
    }
  }

  /**
   * Retrieve from multiple sources in parallel
   */
  async retrieve(
    sources: VectorStoreConfig[],
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]> {
    const QUERY_TIMEOUT = 10000;

    const results = await Promise.allSettled(
      sources.map(source => {
        const store = this.getStore(source);

        const queryPromise = store.retrieve(
          tenantId,
          collectionName,
          query,
          { ...options, limit: this.config.limitPerSource }
        );

        const timeoutPromise = new Promise<KnowledgeEntry[]>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT)
        );

        return Promise.race([queryPromise, timeoutPromise]);
      })
    );

    const successfulResults = results
      .filter((r): r is PromiseFulfilledResult<KnowledgeEntry[]> =>
        r.status === 'fulfilled')
      .map(r => r.value)
      .flat();

    if (successfulResults.length === 0) {
      console.warn('All data sources failed for retrieval');
      return [];
    }

    const normalized = this.normalizeScores(successfulResults);
    return normalized
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      .slice(0, options?.limit || this.config.globalLimit);
  }

  /**
   * Normalize similarity scores across different sources
   */
  private normalizeScores(results: KnowledgeEntry[]): KnowledgeEntry[] {
    if (results.length === 0) return results;

    if (this.config.normalizationStrategy === 'none') {
      return results;
    }

    const scores = results.map(r => r.similarity || 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    if (max === min) {
      return results;
    }

    return results.map(r => ({
      ...r,
      similarity: ((r.similarity || 0) - min) / (max - min),
    }));
  }

  /**
   * Close all store connections
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.stores.values()).map(store => store.close());
    await Promise.all(closePromises);
    this.stores.clear();
  }
}
```

- [ ] **Step 3: 提交检索协调器**

```bash
git add src/core/knowledge/coordinator/
git commit -m "feat(knowledge): implement retrieval coordinator for multi-source queries"
```

---

### Task 11: 创建检索协调器单元测试

**Files:**
- Create: `tests/unit/knowledge/coordinator/retrieval-coordinator.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
/**
 * Retrieval Coordinator Unit Tests
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { RetrievalCoordinator } from '../../../../src/core/knowledge/coordinator/retrieval-coordinator.js';
import type { PostgresConfig, LanceDBConfig } from '../../../../src/core/knowledge/interfaces/adapter-config.js';

const POSTGRES_CONFIG: PostgresConfig = {
  type: 'postgres-pgvector',
  embedding: {
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'test',
    user: 'test',
  },
};

const LANCEDB_CONFIG: LanceDBConfig = {
  type: 'lancedb',
  embedding: {
    apiKey: 'test-key',
    model: 'text-embedding-3-small',
    dimensions: 1536,
  },
  connection: {
    uri: './test-coordinator',
  },
};

describe('RetrievalCoordinator', () => {
  let coordinator: RetrievalCoordinator;

  afterAll(async () => {
    await coordinator?.close();
  });

  it('should normalize scores', async () => {
    coordinator = new RetrievalCoordinator({ normalizationStrategy: 'min-max' });

    const results = await coordinator.retrieve(
      [POSTGRES_CONFIG],
      'test',
      'collection',
      'query'
    );

    // Check that scores are normalized
    const scores = results.map(r => r.similarity || 0);
    const max = Math.max(...scores);
    expect(max).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 提交测试**

```bash
git add tests/unit/knowledge/coordinator/
git commit -m "test(knowledge): add retrieval coordinator unit tests"
```

---

## Chunk 5: API 端点更新

### Task 12: 更新数据源添加 API

**Files:**
- Modify: `steps/api/knowledge-datasources-add-api.step.ts`

- [ ] **Step 1: 更新 schema 支持 LanceDB**

找到 `addDataSourceSchema` 定义，更新为：

```typescript
const addDataSourceSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['postgres-pgvector', 'lancedb']),
  connection: z.object({
    // PostgreSQL fields
    host: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    // LanceDB fields
    uri: z.string().optional(),
    apiKey: z.string().optional(),
  }).refine(
    (data) => {
      // Either PostgreSQL fields or LanceDB URI must be present
      return !!(data.host && data.port && data.database) || !!data.uri;
    },
    { message: "Either PostgreSQL connection (host, port, database) or LanceDB URI is required" }
  ),
});
```

- [ ] **Step 2: 更新 handler 保存逻辑**

更新数据源保存部分，支持 LanceDB 字段：

```typescript
const connection = connection.host ? {
  host: connection.host,
  port: connection.port,
  database: connection.database,
  user: connection.user || process.env.PG_USER || 'leo',
} : {
  uri: connection.uri,
  apiKey: connection.apiKey,
};

const dataSource: DataSource = {
  id,
  name,
  type,
  connection,
  status: 'connected',
  appIds: [],
  createdAt: new Date().toISOString(),
};
```

- [ ] **Step 3: 提交 API 更新**

```bash
git add steps/api/knowledge-datasources-add-api.step.ts
git commit -m "feat(api): support LanceDB in datasources add API"
```

---

### Task 13: 更新连接测试 API

**Files:**
- Modify: `steps/api/knowledge-datasources-test-api.step.ts`

- [ ] **Step 1: 添加 LanceDB 测试逻辑**

```typescript
// In testConnection function, add LanceDB support
if (config.type === 'lancedb') {
  const *lance* = await import('@lancedb/lancedb');

  try {
    const db = await lance.connect(config.connection.uri);
    await db.close();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 2: 提交更新**

```bash
git add steps/api/knowledge-datasources-test-api.step.ts
git commit -m "feat(api): add LanceDB connection test support"
```

---

### Task 14: 更新集合发现 API

**Files:**
- Modify: `steps/api/knowledge-datasources-discover-api.step.ts`

- [ ] **Step 1: 添加 LanceDB 集合发现**

```typescript
if (config.type === 'lancedb') {
  const *lance* = await import('@lancedb/lancedb');

  try {
    const db = await lance.connect(config.connection.uri);
    const tableNames = await db.tableNames();

    const collections = [];
    for (const name of tableNames) {
      const table = await db.openTable(name);
      const count = await table.count();
      collections.push({
        name,
        entryCount: count,
        hasEmbeddings: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await db.close();
    return collections;
  } catch (error: any) {
    console.error('Failed to discover LanceDB collections:', error);
    return [];
  }
}
```

- [ ] **Step 2: 提交更新**

```bash
git add steps/api/knowledge-datasources-discover-api.step.ts
git commit -m "feat(api): add LanceDB collection discovery"
```

---

## Chunk 6: 前端更新

### Task 15: 更新数据源添加表单

**Files:**
- Modify: `motia-frontend/src/pages/Knowledge.jsx`

- [ ] **Step 1: 添加数据源类型选择**

在 state 中添加 type 字段：

```jsx
const [newSource, setNewSource] = useState({
  name: '',
  type: 'postgres-pgvector',
  // PostgreSQL fields
  host: 'localhost',
  port: 5432,
  database: 'myagent',
  user: 'leo',
  password: '',
  // LanceDB fields
  uri: './data/lancedb',
  apiKey: ''
});
```

- [ ] **Step 2: 添加类型选择器和动态表单**

```jsx
<select
  value={newSource.type}
  onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}
>
  <option value="postgres-pgvector">PostgreSQL + pgvector</option>
  <option value="lancedb">LanceDB</option>
</select>

{newSource.type === 'postgres-pgvector' ? (
  <div className="postgres-fields">
    <input
      placeholder="Host"
      value={newSource.host}
      onChange={(e) => setNewSource({ ...newSource, host: e.target.value })}
    />
    <input
      type="number"
      placeholder="Port"
      value={newSource.port}
      onChange={(e) => setNewSource({ ...newSource, port: parseInt(e.target.value) })}
    />
    <input
      placeholder="Database"
      value={newSource.database}
      onChange={(e) => setNewSource({ ...newSource, database: e.target.value })}
    />
    <input
      placeholder="User"
      value={newSource.user}
      onChange={(e) => setNewSource({ ...newSource, user: e.target.value })}
    />
    <input
      type="password"
      placeholder="Password"
      value={newSource.password}
      onChange={(e) => setNewSource({ ...newSource, password: e.target.value })}
    />
  </div>
) : (
  <div className="lancedb-fields">
    <input
      placeholder="URI (e.g., ./data/lancedb or s3://bucket/path)"
      value={newSource.uri}
      onChange={(e) => setNewSource({ ...newSource, uri: e.target.value })}
    />
    <input
      placeholder="API Key (optional)"
      value={newSource.apiKey}
      onChange={(e) => setNewSource({ ...newSource, apiKey: e.target.value })}
    />
  </div>
)}
```

- [ ] **Step 3: 更新数据源卡片显示**

```jsx
<div className="datasource-card">
  <div className="datasource-type">
    {source.type === 'lancedb' ? '🔷 LanceDB' : '🐘 PostgreSQL'}
  </div>
  <div className="datasource-name">{source.name}</div>
  <div className="datasource-config">
    {source.type === 'lancedb'
      ? source.connection.uri
      : `${source.connection.host}:${source.connection.port}/${source.connection.database}`
    }
  </div>
</div>
```

- [ ] **Step 4: 提交前端更新**

```bash
git add motia-frontend/src/pages/Knowledge.jsx
git commit -m "feat(ui): add LanceDB support to knowledge page"
```

---

## 完成检查清单

在实施完成后，验证以下功能：

- [ ] PostgreSQL 适配器正常工作（向后兼容）
- [ ] LanceDB 适配器可以连接和查询
- [ ] 多数据源并行检索正常
- [ ] API 端点支持 LanceDB 数据源
- [ ] 前端可以添加 LanceDB 数据源
- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 文档已更新

---

**注意事项：**
1. 每个 Task 完成后立即提交
2. 遇到测试失败时，先修复再继续
3. 保持代码简洁，避免过度设计
4. 遵循现有代码风格
