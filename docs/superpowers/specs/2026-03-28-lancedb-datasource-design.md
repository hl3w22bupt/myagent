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
  // 添加知识
  addKnowledge(
    tenantId: string,
    collectionName: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<string | number>;

  // 检索知识
  retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options?: RetrieveOptions
  ): Promise<KnowledgeEntry[]>;

  // 关闭连接
  close(): Promise<void>;
}
```

### 3.2 适配器配置接口

```typescript
// src/core/knowledge/interfaces/adapter-config.interface.ts

export type VectorStoreType = 'postgres-pgvector' | 'lancedb';

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
    uri: string;  // 本地路径或云 URI
    apiKey?: string;  // 云服务可选
  };
}

export type VectorStoreConfig = PostgresConfig | LanceDBConfig;
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

  constructor(private config: LanceDBConfig) {
    // 支持 URI: 本地路径、S3、GCS
    this.db = await lancedb.connect(config.connection.uri);
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
  const table = await this.openOrCreateTable(collectionName);
  const embedding = await this.embedQuery(content);

  await table.add([{
    tenantId,
    content,
    metadata,
    vector: embedding,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }]);

  return `${tenantId}-${collectionName}-${Date.now()}`;
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
  const table = await this.db.openTable(collectionName);
  const queryEmbedding = await this.embedQuery(query);

  const results = await table
    .search(queryEmbedding)
    .limit(options.limit || 5)
    .where(`tenantId = '${tenantId}'`)
    .execute();

  return results.map(r => ({
    id: r.id,
    tenantId: r.tenantId,
    collectionName,
    content: r.content,
    metadata: r.metadata,
    similarity: 1 - r._distance,  // 距离转换为相似度
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  }));
}
```

### 4.2 检索协调器

#### 4.2.1 并行检索

```typescript
async retrieve(
  sources: VectorStoreConfig[],
  tenantId: string,
  collectionName: string,
  query: string,
  options?: RetrieveOptions
): Promise<KnowledgeEntry[]> {
  // 并行查询所有数据源
  const results = await Promise.allSettled(
    sources.map(source =>
      this.getStore(source).retrieve(tenantId, collectionName, query, options)
    )
  );

  // 提取成功的结果
  const successfulResults = results
    .filter((r): r is PromiseFulfilledResult<KnowledgeEntry[]> =>
      r.status === 'fulfilled')
    .map(r => r.value)
    .flat();

  // 归一化并排序
  const normalized = this.normalizeScores(successfulResults);
  return normalized
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, options?.limit || 5);
}
```

#### 4.2.2 相似度归一化

```typescript
private normalizeScores(results: KnowledgeEntry[]): KnowledgeEntry[] {
  if (results.length === 0) return results;

  // Min-Max 归一化
  const scores = results.map(r => r.similarity || 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  if (max === min) return results;

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

{
  "name": "LanceDB 生产环境",
  "type": "lancedb",
  "connection": {
    "uri": "s3://my-bucket/lancedb",
    "apiKey": "optional-api-key"
  }
}
```

#### 测试连接

```http
POST /api/knowledge/datasources/test
Content-Type: application/json

{
  "type": "lancedb",
  "connection": {
    "uri": "./data/lancedb"
  }
}
```

#### 发现集合

```http
POST /api/knowledge/datasources/discover
Content-Type: application/json

{
  "type": "lancedb",
  "connection": {
    "uri": "./data/lancedb"
  }
}
```

### 5.2 应用-知识集合关联

#### 更新关联

```http
PUT /api/apps/:appId/knowledge-collections/:collectionName
Content-Type: application/json

{
  "dataSourceId": "ds-lancedb-prod",
  "priority": 1,
  "enabled": true
}
```

#### 获取配置

```http
GET /api/apps/:appId/knowledge-collections?details=true
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
- 添加和检索知识
- 连接错误处理
- 嵌入缓存机制

**检索协调器**
- 并行查询多数据源
- 相似度归一化
- 部分数据源失败处理

### 7.2 集成测试

**端到端测试**
- LanceDB 完整流程
- 多数据源检索
- API 端点验证

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

### Phase 1: 核心抽象
- [ ] 创建接口定义
- [ ] 重构 PostgreSQL 适配器
- [ ] 实现 LanceDB 适配器
- [ ] 单元测试

### Phase 2: 检索协调器
- [ ] 实现检索协调器
- [ ] 并行查询逻辑
- [ ] 结果融合和排序
- [ ] 单元测试

### Phase 3: 数据源管理
- [ ] 扩展数据源类型
- [ ] 应用-知识集合关联
- [ ] API 端点更新
- [ ] 集成测试

### Phase 4: 前端和文档
- [ ] 前端 UI 更新
- [ ] 文档编写
- [ ] 示例和教程

---

## 10. 风险和注意事项

### 10.1 技术风险

| 风险 | 缓解措施 |
|------|----------|
| LanceDB API 稳定性 | 版本锁定，充分测试 |
| 相似度分数差异 | 归一化处理，可配置策略 |
| 并发查询性能 | 限制并发数，监控性能 |

### 10.2 兼容性

- 保持向后兼容现有 PostgreSQL 实现
- 现有 Agent 代码无需修改
- 渐进式迁移路径

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

---

**文档版本**: 1.0
**最后更新**: 2026-03-28
