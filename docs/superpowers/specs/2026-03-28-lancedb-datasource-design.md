# LanceDB 数据源支持设计文档

**日期**: 2026-03-28
**版本**: 1.0
**作者**: Claude Code
**状态**: 设计审查阶段

---

## 1. 概述

### 1.1 目标

为 MyAgent 知识库系统添加 LanceDB 作为支持的数据源类型，实现：
- 多数据源共存（一个应用可同时使用多个数据源）
- 并行检索 + 结果融合策略
- 支持云端部署和边缘计算场景

### 1.2 背景

当前系统仅支持 PostgreSQL + pgvector 作为向量数据库。为了支持云端部署（S3/GCS 集成）和边缘计算场景（轻量级本地存储），需要引入 LanceDB 作为额外的数据源选项。

### 1.3 核心需求

- ✅ 支持 LanceDB 作为新的数据源类型
- ✅ 多数据源共存模式
- ✅ 并行检索 + 结果融合策略
- ✅ 数据源独立（不需要同步）
- ✅ 专注云端部署场景

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    应用层                                │
│         Agent.run(task, context, environment)           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              知识管理层                                   │
│   KnowledgeBaseManager                                  │
│   - 解析 environment.knowledgeCollection                │
│   - 确定需要查询的数据源                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              检索协调层                                   │
│   RetrievalCoordinator                                  │
│   - 并行查询多个数据源                                   │
│   - 融合相似度分数                                       │
│   - 返回全局 Top-K 结果                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              向量存储抽象层                               │
│   interface IVectorStore                                │
│                                                         │
│   ┌──────────────┐        ┌──────────────┐             │
│   │ PostgreSQL   │        │   LanceDB    │             │
│   │  Adapter     │        │   Adapter    │             │
│   └──────────────┘        └──────────────┘             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件 | 职责 |
|------|------|
| **IVectorStore** | 统一的向量存储接口定义 |
| **PostgresVectorStore** | PostgreSQL 适配器实现 |
| **LanceDBVectorStore** | LanceDB 适配器实现 |
| **RetrievalCoordinator** | 并行检索和结果融合 |
| **KnowledgeBaseManager** | 应用层知识管理入口 |
| **DataSourceManager** | 数据源元数据管理 |

### 2.3 文件结构

```
src/core/knowledge/
├── interfaces/
│   ├── vector-store.interface.ts     # 统一接口
│   ├── adapter-config.interface.ts   # 适配器配置
│   └── knowledge-entry.interface.ts  # 知识条目定义
├── adapters/
│   ├── postgres-adapter.ts           # PostgreSQL 实现
│   └── lancedb-adapter.ts            # LanceDB 实现
├── coordinator/
│   ├── retrieval-coordinator.ts      # 并行检索协调器
│   └── coordinator-config.interface.ts
├── managers/
│   ├── knowledge-base-manager.ts     # 知识库管理器
│   └── app-knowledge-manager.ts      # 应用知识映射管理
├── datasource-manager.ts             # 扩展支持多类型
├── datasource-store.ts               # 数据源元数据
└── knowledge-base.ts                 # 保留向后兼容
```

---

## 3. 接口定义

### 3.1 向量存储接口

```typescript
// src/core/knowledge/interfaces/vector-store.interface.ts

export interface KnowledgeEntry {
  id: string | number;
  tenantId: string;
  collectionName: string;
  content: string;
  metadata?: Record<string, any>;
  similarity?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetrieveOptions {
  limit?: number;           // 默认: 5
  threshold?: number;       // 默认: 0.7
}

export interface IVectorStore {
  // 添加单条知识
  addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string | number>;

  // 批量添加知识（性能优化）
  addKnowledgeBatch(
    tenantId: string,
    collectionName: string,
    entries: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<string[]>;

  // 检索知识
  retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]>;

  // 关闭连接
  close(): Promise<void>;

  // 健康检查
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
}
```

### 3.2 适配器配置接口

```typescript
// src/core/knowledge/interfaces/adapter-config.interface.ts

export type VectorStoreType = 'postgres-pgvector' | 'lancedb';

// 配置验证约束
export const CONFIG_CONSTRAINTS = {
  // 嵌入向量维度范围
  MIN_EMBEDDING_DIMENSIONS: 128,
  MAX_EMBEDDING_DIMENSIONS: 4096,

  // 缓存 TTL 范围（毫秒）
  MIN_CACHE_TTL: 60000,      // 1分钟
  MAX_CACHE_TTL: 3600000,    // 60分钟

  // LanceDB URI 格式
  LANCEDB_URI_PATTERN: /^(\.|\.\/|[a-zA-Z]:|s3:\/\/|gs:\/\/|az:\/\/)/,

  // PostgreSQL 端口范围
  POSTGRES_PORT_RANGE: { min: 1, max: 65535 },
} as const;

export interface BaseVectorStoreConfig {
  type: VectorStoreType;
  embedding: {
    apiKey: string;
    baseURL?: string;
    model: string;
    dimensions: number;  // 必须: MIN_EMBEDDING_DIMENSIONS ~ MAX_EMBEDDING_DIMENSIONS
  };
  cacheTtl?: number;  // 必须: MIN_CACHE_TTL ~ MAX_CACHE_TTL，默认: 300000 (5分钟)
}

export interface PostgresConfig extends BaseVectorStoreConfig {
  type: 'postgres-pgvector';
  connection: {
    host: string;
    port: number;  // 必须: 1 ~ 65535
    database: string;
    user: string;
    password?: string;
  };
}

export interface LanceDBConfig extends BaseVectorStoreConfig {
  type: 'lancedb';
  connection: {
    uri: string;  // 必须: 符合 LANCEDB_URI_PATTERN
    apiKey?: string;  // 云服务可选
  };
}

export type VectorStoreConfig = PostgresConfig | LanceDBConfig;

// 配置验证函数
export function validateConfig(config: VectorStoreConfig): void {
  // 验证嵌入维度
  const { dimensions } = config.embedding;
  if (dimensions < CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS ||
      dimensions > CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimensions must be between ${CONFIG_CONSTRAINTS.MIN_EMBEDDING_DIMENSIONS} and ${CONFIG_CONSTRAINTS.MAX_EMBEDDING_DIMENSIONS}`
    );
  }

  // 验证缓存 TTL
  const cacheTtl = config.cacheTtl || 300000;
  if (cacheTtl < CONFIG_CONSTRAINTS.MIN_CACHE_TTL ||
      cacheTtl > CONFIG_CONSTRAINTS.MAX_CACHE_TTL) {
    throw new Error(
      `Cache TTL must be between ${CONFIG_CONSTRAINTS.MIN_CACHE_TTL} and ${CONFIG_CONSTRAINTS.MAX_CACHE_TTL} ms`
    );
  }

  // 类型特定验证
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

### 3.3 检索协调器配置

```typescript
// src/core/knowledge/coordinator/coordinator-config.interface.ts

export interface CoordinatorConfig {
  maxConcurrency?: number;           // 最大并发数
  limitPerSource?: number;           // 每个数据源结果数
  globalLimit?: number;              // 全局结果数
  normalizationStrategy?: 'none' | 'min-max' | 'z-score';
}
```

---

## 4. 实现细节

### 4.1 LanceDB 适配器

#### 4.1.1 连接管理

```typescript
export class LanceDBVectorStore implements IVectorStore {
  private db: lancedb.Connection;
  private openai: OpenAI;
  private embeddingCache: LRUCache<string, number[]>;
  private readonly CONNECTION_TIMEOUT = 30000;  // 30秒连接超时

  constructor(private config: LanceDBConfig) {
    try {
      // 支持 URI: 本地路径、S3、GCS
      // 超时控制：使用 Promise.race 防止连接挂起
      const connectionPromise = lancedb.connect(config.connection.uri);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), this.CONNECTION_TIMEOUT)
      );

      this.db = await Promise.race([connectionPromise, timeoutPromise]) as lancedb.Connection;
    } catch (error) {
      throw new LanceDBConnectionError(
        `Failed to connect to LanceDB at ${config.connection.uri}: ${error.message}`,
        { cause: error }
      );
    }
  }
}

// 自定义错误类型
class LanceDBConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LanceDBConnectionError';
  }
}
```

#### 4.1.2 添加知识

```typescript
async addKnowledge(
  tenantId: string,
  collectionName: string,
  content: string,
  metadata?: Record<string, any>
): Promise<string> {
  try {
    // 1. 验证输入
    if (!content || content.trim().length === 0) {
      throw new ValidationError('Content cannot be empty');
    }

    // 2. 获取或创建表
    const table = await this.openOrCreateTable(collectionName);

    // 3. 生成向量嵌入（带重试逻辑）
    const embedding = await this.embedQueryWithRetry(content, {
      maxRetries: 3,
      initialDelay: 1000,
    });

    // 4. 插入数据
    await table.add([{
      id: `${tenantId}-${collectionName}-${Date.now()}`,
      tenantId,
      content,
      metadata: metadata || {},
      vector: embedding,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);

    return `${tenantId}-${collectionName}-${Date.now()}`;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new KnowledgeInsertError(
      `Failed to add knowledge to collection ${collectionName}: ${error.message}`,
      { cause: error }
    );
  }
}

// 带重试的嵌入生成
private async embedQueryWithRetry(
  text: string,
  options: { maxRetries: number; initialDelay: number }
): Promise<number[]> {
  let lastError: Error;

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    try {
      return await this.embedQuery(text);
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries - 1) {
        // 指数退避
        await new Promise(resolve =>
          setTimeout(resolve, options.initialDelay * Math.pow(2, attempt))
        );
      }
    }
  }

  throw new EmbeddingGenerationError(
    `Failed to generate embedding after ${options.maxRetries} attempts: ${lastError.message}`,
    { cause: lastError }
  );
}

// 自定义错误类型
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class KnowledgeInsertError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'KnowledgeInsertError';
  }
}

class EmbeddingGenerationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EmbeddingGenerationError';
  }
}
```

#### 4.1.3 检索知识

```typescript
async retrieve(
  tenantId: string,
  collectionName: string,
  query: string,
  options: RetrieveOptions = {}
): Promise<KnowledgeEntry[]> {
  try {
    // 1. 验证输入
    if (!query || query.trim().length === 0) {
      throw new ValidationError('Query cannot be empty');
    }

    // 2. 获取表（处理不存在的表）
    let table;
    try {
      table = await this.db.openTable(collectionName);
    } catch (error) {
      // 表不存在，返回空结果
      return [];
    }

    // 3. 生成查询向量
    const queryEmbedding = await this.embedQueryWithRetry(query, {
      maxRetries: 2,
      initialDelay: 500,
    });

    // 4. 执行向量搜索
    const limit = options.limit || 5;
    const threshold = options.threshold || 0.7;

    const results = await table
      .search(queryEmbedding)
      .limit(limit)
      .where(`tenantId = '${tenantId}'`)
      .execute();

    // 5. 转换结果并过滤
    return results
      .map(r => ({
        id: r.id,
        tenantId: r.tenantId,
        collectionName,
        content: r.content,
        metadata: r.metadata || {},
        similarity: 1 - r._distance,  // 距离转换为相似度
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }))
      .filter(r => (r.similarity || 0) >= threshold);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    // 记录错误但不抛出异常（降级策略）
    console.error(`LanceDB retrieval error for collection ${collectionName}:`, error);
    return [];
  }
}
```

### 4.2 检索协调器

#### 4.2.1 并行检索（带超时控制）

```typescript
async retrieve(
  sources: VectorStoreConfig[],
  tenantId: string,
  collectionName: string,
  query: string,
  options?: RetrieveOptions
): Promise<KnowledgeEntry[]> {
  const QUERY_TIMEOUT = 10000;  // 每个数据源10秒超时

  // 并行查询所有数据源，带超时控制
  const results = await Promise.allSettled(
    sources.map(source => {
      const store = this.getStore(source);

      // 包装查询，添加超时
      const queryPromise = store.retrieve(
        tenantId,
        collectionName,
        query,
        { ...options, limit: this.config.limitPerSource || 10 }
      );

      const timeoutPromise = new Promise<KnowledgeEntry[]>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT)
      );

      return Promise.race([queryPromise, timeoutPromise]);
    })
  );

  // 提取成功的结果，忽略失败的
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<KnowledgeEntry[]> =>
      r.status === 'fulfilled')
    .map(r => r.value)
    .flat();

  // 如果所有数据源都失败，返回空结果
  if (successfulResults.length === 0) {
    console.warn('All data sources failed for retrieval');
    return [];
  }

  // 归一化并排序
  const normalized = this.normalizeScores(successfulResults);
  return normalized
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, options?.limit || 5);
}
```

#### 4.2.2 相似度归一化（边界情况处理）

```typescript
private normalizeScores(results: KnowledgeEntry[]): KnowledgeEntry[] {
  if (results.length === 0) return results;

  const scores = results.map(r => r.similarity || 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  // 边界情况1：所有分数相同
  if (max === min) {
    // 不需要归一化，直接返回原结果
    return results;
  }

  // Min-Max 归一化
  return results.map(r => ({
    ...r,
    similarity: ((r.similarity || 0) - min) / (max - min),
  }));
}
```

---

## 5. API 设计

### 5.1 数据源管理

#### 添加数据源

```http
POST /api/knowledge/datasources
Content-Type: application/json

请求体:
{
  "name": "LanceDB 生产环境",
  "type": "lancedb",
  "connection": {
    "uri": "s3://my-bucket/lancedb",
    "apiKey": "optional-api-key"
  }
}

成功响应 (200):
{
  "success": true,
  "data": {
    "id": "ds-1234567890",
    "name": "LanceDB 生产环境",
    "type": "lancedb",
    "status": "connected"
  }
}

错误响应:
400 Bad Request - 无效的连接配置
{
  "success": false,
  "error": "INVALID_URI",
  "message": "LanceDB URI must start with ./, ../, [drive]:/, s3://, gs://, or az://"
}

409 Conflict - 数据源名称已存在
{
  "success": false,
  "error": "DATASOURCE_EXISTS",
  "message": "Data source with name 'LanceDB 生产环境' already exists"
}
```

#### 测试连接

```http
POST /api/knowledge/datasources/test
Content-Type: application/json

请求体:
{
  "type": "lancedb",
  "connection": {
    "uri": "./data/lancedb"
  }
}

成功响应 (200):
{
  "success": true,
  "data": {
    "connected": true,
    "latency": 45  // 连接延迟（毫秒）
  }
}

错误响应 (400):
{
  "success": false,
  "error": "CONNECTION_FAILED",
  "message": "Failed to connect to LanceDB: Permission denied"
}

测试内容:
- 验证连接性（能否访问 URI）
- 验证认证（云存储的 API Key）
- 验证读写权限（尝试打开表）
```

#### 发现集合

```http
POST /api/knowledge/datasources/discover
Content-Type: application/json

请求体:
{
  "type": "lancedb",
  "connection": {
    "uri": "./data/lancedb"
  }
}

成功响应 (200):
{
  "success": true,
  "data": {
    "collections": [
      {
        "name": "python-docs",
        "entryCount": 1250,
        "hasEmbeddings": true,
        "createdAt": "2026-03-28T10:00:00Z",
        "updatedAt": "2026-03-28T12:30:00Z"
      }
    ]
  }
}

错误响应 (400):
{
  "success": false,
  "error": "DISCOVERY_FAILED",
  "message": "Failed to discover collections: Invalid credentials"
}
```

### 5.2 应用-知识集合关联

#### 更新关联

```http
PUT /api/apps/:appId/knowledge-collections/:collectionName
Content-Type: application/json

请求体:
{
  "dataSourceId": "ds-lancedb-prod",
  "priority": 1,  // 可选，默认0
  "enabled": true  // 可选，默认true
}

priority 字段说明:
- 数值越大，优先级越高
- 检索时按优先级顺序查询
- 相同优先级的数据源并行查询

成功响应 (200):
{
  "success": true,
  "data": {
    "appId": "app-123",
    "collectionName": "python-docs",
    "dataSourceId": "ds-lancedb-prod",
    "priority": 1,
    "enabled": true
  }
}

错误响应 (404):
{
  "success": false,
  "error": "DATASOURCE_NOT_FOUND",
  "message": "Data source 'ds-lancedb-prod' not found"
}
```

#### 获取配置

```http
GET /api/apps/:appId/knowledge-collections?details=true

成功响应 (200):
{
  "success": true,
  "data": {
    "collections": [
      {
        "collectionName": "python-docs",
        "dataSources": [
          {
            "dataSourceId": "ds-lancedb-prod",
            "dataSourceName": "LanceDB 生产环境",
            "dataSourceType": "lancedb",
            "priority": 1,
            "enabled": true
          },
          {
            "dataSourceId": "ds-postgres-backup",
            "dataSourceName": "PostgreSQL 备份",
            "dataSourceType": "postgres-pgvector",
            "priority": 0,
            "enabled": true
          }
        ]
      }
    ]
  }
}
```

#### 健康检查

```http
GET /api/knowledge/datasources/:dataSourceId/health

成功响应 (200):
{
  "success": true,
  "data": {
    "dataSourceId": "ds-lancedb-prod",
    "healthy": true,
    "lastCheck": "2026-03-28T12:35:00Z",
    "latency": 32
  }
}

不健康响应 (200):
{
  "success": true,
  "data": {
    "dataSourceId": "ds-lancedb-prod",
    "healthy": false,
    "lastCheck": "2026-03-28T12:35:00Z",
    "error": "Connection timeout"
  }
}
```

---

## 6. 前端设计

### 6.1 数据源添加表单

```jsx
<select value={newSource.type}>
  <option value="postgres-pgvector">PostgreSQL + pgvector</option>
  <option value="lancedb">LanceDB</option>
</select>

{newSource.type === 'lancedb' ? (
  <LanceDBConnectionForm
    uri={newSource.uri}
    onChange={setNewSource}
  />
) : (
  <PostgreSQLConnectionForm {...postgresFields} />
)}
```

### 6.2 数据源卡片

```jsx
<div className="datasource-card">
  <div className="datasource-type">
    {source.type === 'lancedb' ? '🔷 LanceDB' : '🐘 PostgreSQL'}
  </div>
  <div className="datasource-config">
    {source.type === 'lancedb'
      ? source.connection.uri
      : `${source.connection.host}:${source.connection.port}`}
  </div>
</div>
```

---

## 7. 测试策略

### 7.1 单元测试

**LanceDB 适配器**
- ✅ 添加和检索知识
- ✅ 连接错误处理
- ✅ 嵌入缓存机制
- ✅ 重试逻辑（嵌入生成失败）
- ✅ 表不存在时的降级处理
- ✅ 输入验证（空内容、无效查询）

**检索协调器**
- ✅ 并行查询多数据源
- ✅ 相似度归一化
- ✅ 部分数据源失败处理
- ✅ 超时控制
- ✅ 边界情况（所有分数相同、单个数据源失败）
- ✅ 空结果处理

**配置验证**
- ✅ 嵌入维度范围验证
- ✅ 缓存 TTL 范围验证
- ✅ LanceDB URI 格式验证
- ✅ PostgreSQL 端口范围验证

### 7.2 集成测试

**端到端测试**
- ✅ LanceDB 完整流程
- ✅ 多数据源检索
- ✅ API 端点验证
- ✅ 数据源关联管理

**并发场景**
- ✅ 并发写入同一集合
- ✅ 并发读取不同集合
- ✅ 并发写入和读取

**大规模数据测试**
- ✅ 批量插入性能（1000+ 条）
- ✅ 大数据集检索性能
- ✅ 分页机制验证

**网络故障场景**
- ✅ 网络分区时的降级处理
- ✅ S3/GCS 连接失败处理
- ✅ 超时恢复机制
- ✅ 重连逻辑

**错误恢复**
- ✅ 嵌入 API 限流恢复
- ✅ 数据源临时故障恢复
- ✅ 部分数据源不可用时的降级

### 7.3 性能测试

**基准测试**
- 单数据源检索延迟
- 多数据源并行检索延迟
- 批量插入吞吐量

**压力测试**
- 100+ 并发请求
- 10000+ 条数据检索性能
- 内存使用监控

### 7.4 测试覆盖率目标

| 组件 | 目标覆盖率 |
|------|-----------|
| LanceDB 适配器 | 90%+ |
| 检索协调器 | 90%+ |
| 配置验证 | 100% |
| API 端点 | 85%+ |

---

## 8. 依赖项

```json
{
  "dependencies": {
    "@lancedb/lancedb": "^0.5.0"
  }
}
```

---

## 9. 实施计划

### Phase 1: 核心抽象（1-2天）
**目标**: 建立向量存储抽象层

- [ ] 创建接口定义
  - [ ] `IVectorStore` 接口
  - [ ] `VectorStoreConfig` 类型
  - [ ] 配置验证函数

- [ ] 重构 PostgreSQL 适配器
  - [ ] 将现有 `KnowledgeBase` 重构为 `PostgresVectorStore`
  - [ ] 实现 `IVectorStore` 接口
  - [ ] 添加错误处理和重试逻辑
  - [ ] 向后兼容性包装

- [ ] 单元测试
  - [ ] 接口验证测试
  - [ ] PostgreSQL 适配器测试
  - [ ] 配置验证测试

**回滚策略**: 如果 PostgreSQL 适配器重构有问题，使用 `git revert` 回退提交

**验证标准**:
- 所有现有单元测试通过
- 现有 Agent 功能不受影响
- 性能与之前相当（±10%）

---

### Phase 2: LanceDB 适配器（2-3天）
**目标**: 实现 LanceDB 支持

- [ ] 实现 LanceDB 适配器
  - [ ] 连接管理（本地、S3、GCS）
  - [ ] 添加知识（单条和批量）
  - [ ] 检索知识（向量搜索）
  - [ ] 错误处理和重试逻辑
  - [ ] 嵌入缓存

- [ ] 单元测试
  - [ ] 连接测试
  - [ ] CRUD 操作测试
  - [ ] 错误处理测试
  - [ ] 缓存机制测试

- [ ] 集成测试
  - [ ] 端到端流程测试
  - [ ] 与 PostgreSQL 功能对比测试

**回滚策略**: 如果 LanceDB 适配器有问题，禁用数据源类型即可，不影响 PostgreSQL

**验证标准**:
- 单元测试覆盖率 ≥ 90%
- 功能与 PostgreSQL 适配器相当
- 性能测试通过

---

### Phase 3: 检索协调器（2-3天）
**目标**: 实现多数据源并行检索

- [ ] 实现检索协调器
  - [ ] 并行查询逻辑（带超时控制）
  - [ ] 结果融合和排序
  - [ ] 相似度归一化
  - [ ] 降级处理策略

- [ ] 单元测试
  - [ ] 并行查询测试
  - [ ] 归一化测试
  - [ ] 超时处理测试
  - [ ] 边界情况测试

- [ ] 集成测试
  - [ ] 多数据源检索测试
  - [ ] 部分故障测试
  - [ ] 性能测试

**回滚策略**: 如果协调器有问题，通过配置禁用多数据源检索：
```typescript
knowledgeBase: { multiSourceRetrieval: false }
```

**验证标准**:
- 单元测试覆盖率 ≥ 90%
- 并行查询性能优于串行
- 故障降级正常工作

---

### Phase 4: 数据源管理（2-3天）
**目标**: 扩展数据源管理功能

- [ ] 扩展数据源类型
  - [ ] 数据源存储支持 LanceDB
  - [ ] 连接测试（LanceDB）
  - [ ] 集合发现（LanceDB）

- [ ] 应用-知识集合关联
  - [ ] 数据源优先级管理
  - [ ] 启用/禁用数据源
  - [ ] 多数据源配置

- [ ] API 端点更新
  - [ ] 添加数据源 API（支持 LanceDB）
  - [ ] 测试连接 API
  - [ ] 发现集合 API
  - [ ] 更新关联 API
  - [ ] 健康检查 API

- [ ] 集成测试
  - [ ] API 端点测试
  - [ ] 数据源管理流程测试
  - [ ] 多数据源关联测试

**回滚策略**: API 更新有问题时，可以保留旧 API 并行运行，或通过配置切换

**验证标准**:
- API 测试覆盖率 ≥ 85%
- 所有 API 端点正常工作
- 错误处理完整

---

### Phase 5: 前端和文档（2-3天）
**目标**: 完善用户体验和文档

- [ ] 前端 UI 更新
  - [ ] 数据源类型选择器
  - [ ] LanceDB 连接表单
  - [ ] 数据源卡片显示
  - [ ] 优先级配置 UI

- [ ] 文档编写
  - [ ] LanceDB 配置指南
  - [ ] 多数据源使用指南
  - [ ] API 参考更新
  - [ ] 故障排查指南

- [ ] 示例和教程
  - [ ] LanceDB 快速开始
  - [ ] 多数据源配置示例
  - [ ] 迁移指南

- [ ] E2E 测试
  - [ ] 用户流程测试
  - [ ] 跨浏览器测试

**回滚策略**: 前端更新有问题时，可以回滚到旧版本 UI，后端保持兼容

**验证标准**:
- 用户可以成功添加 LanceDB 数据源
- 文档清晰完整
- E2E 测试通过

---

### 总时间估算: 9-14 天

**里程碑**:
- Day 3: Phase 1 完成，PostgreSQL 适配器重构
- Day 6: Phase 2 完成，LanceDB 适配器可用
- Day 9: Phase 3 完成，多数据源检索可用
- Day 12: Phase 4 完成，数据源管理完整
- Day 14: Phase 5 完成，生产就绪

---

## 10. 风险和注意事项

### 10.1 技术风险

| 风险 | 缓解措施 |
|------|----------|
| LanceDB API 稳定性 | 版本锁定（@lancedb/lancedb@^0.5.0），充分测试 |
| 相似度分数差异 | 归一化处理，可配置策略 |
| 并发查询性能 | 限制并发数，监控性能 |
| 单个数据源延迟影响全局 | 超时控制（10秒），降级处理 |
| 云存储网络故障 | 降级到其他数据源，错误日志 |

### 10.2 兼容性

- 保持向后兼容现有 PostgreSQL 实现
- 现有 Agent 代码无需修改
- 渐进式迁移路径

### 10.3 迁移策略

**现有用户迁移路径：**

1. **零影响阶段**（Phase 1-2）
   - PostgreSQL 适配器重构，功能保持不变
   - 现有配置和代码无需修改
   - 所有现有测试通过

2. **可选测试阶段**（Phase 3）
   - LanceDB 适配器可用
   - 用户可自愿添加 LanceDB 数据源
   - PostgreSQL 仍是默认数据源

3. **多数据源阶段**（Phase 4）
   - 用户可配置多个数据源
   - 应用可选择使用哪些数据源
   - 支持逐步迁移知识集合

**数据迁移工具：**

```bash
# PostgreSQL → LanceDB 迁移脚本
npm run migrate:to-lancedb -- --source postgres --target lancedb --collection python-docs

# 选项:
# --batch-size: 批量大小（默认: 100）
# --dry-run: 预览不执行
# --continue: 失败后继续
```

**回滚策略：**

- **Phase 1-2**: 如果 PostgreSQL 适配器重构引入问题，使用 git revert 回退
- **Phase 3**: 如果 LanceDB 适配器有问题，禁用该数据源即可，不影响 PostgreSQL
- **Phase 4**: 如果检索协调器有问题，可通过配置回退到单数据源模式：
  ```typescript
  // 禁用多数据源检索
  knowledgeBase: {
    multiSourceRetrieval: false,  // 仅使用主数据源
    primaryDataSource: 'postgres',
  }
  ```

### 10.4 监控和可观测性

**关键指标：**
- 每个数据源的检索延迟
- 检索成功率（按数据源）
- 嵌入 API 调用延迟和失败率
- 缓存命中率

**日志记录：**
- 数据源连接/断开事件
- 检索失败和降级事件
- 超时和重试事件

---

## 附录

### A. LanceDB URI 格式

- **本地**: `./data/lancedb`
- **S3**: `s3://bucket/path`
- **GCS**: `gs://bucket/path`
- **Azure**: `az://container/path`

### B. 性能考虑

- LanceDB 连接持久化
- 嵌入缓存共享
- 并行查询超时控制
- 批量操作优化

### C. 故障排查

**问题：LanceDB 连接超时**
- 检查 URI 格式是否正确
- 验证网络连接
- 检查云存储凭证

**问题：检索结果为空**
- 验证集合是否存在
- 检查相似度阈值是否过高
- 确认数据已正确导入

**问题：多数据源检索慢**
- 检查是否某个数据源响应慢
- 考虑调整数据源优先级
- 监控各数据源延迟

---

**文档版本**: 1.0
**最后更新**: 2026-03-28
