# db9 集成可行性分析报告

## 📋 执行摘要

本文档分析了 db9 作为 MyAgent 知识库存储和上下文存储的可行性。

**结论**：✅ **推荐集成** - db9 的能力与 MyAgent 需求高度匹配，特别是 vector search 和 JSONB 支持。

---

## 1. 当前架构分析

### 1.1 知识库存储（PostgreSQL + pgvector）

**技术栈**：
- PostgreSQL 16+ with pgvector extension
- OpenAI embeddings (text-embedding-3-small, 1536维)
- 存储：独立 knowledge table (vector column)

**核心实现**：
```typescript
// src/core/knowledge/adapters/postgres-adapter.ts
class PostgresVectorStore {
  // 使用 pgvector 的 <=> 操作符进行向量搜索
  // 支持 L2、cosine、inner product 距离
  // LRU cache for embeddings
}
```

**表结构**：
```sql
CREATE TABLE knowledge_table (
  id bigserial PRIMARY KEY,
  content text,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamp
);
CREATE INDEX ON knowledge_table USING ivfflat (embedding vector_cosine_ops);
```

**优势**：
- ✅ 本地控制，数据完全自主
- ✅ 无网络延迟
- ✅ 成本可控（自托管）

**劣势**：
- ❌ 需要维护 PostgreSQL 服务器
- ❌ 需要手动安装 pgvector extension
- ❌ 备份、扩容需要手动管理
- ❌ 没有内置的 HTTP call 能力

---

### 1.2 上下文存储（PostgreSQL + JSONB）

**表结构**：
```sql
CREATE TABLE task_contexts (
  task_id TEXT PRIMARY KEY,
  session_id TEXT,
  task TEXT,
  conversation_rounds JSONB,  -- 对话历史
  artifacts JSONB,
  skill_execution_history JSONB,
  tool_usage_history JSONB,
  summary JSONB,
  working_memory JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**特点**：
- ✅ JSONB 支持灵活的半结构化数据
- ✅ 可以创建 GIN 索引加速 JSONB 查询
- ✅ 支持上下文压缩（conversation_rounds）

**限制**：
- ❌ 没有内置的全文搜索
- ❌ 没有中文分词支持
- ❌ JSONB 查询性能在大数据量时下降

---

## 2. db9 能力映射

### 2.1 Vector Search 对比

| 特性 | 当前实现 | db9 | 评估 |
|------|---------|-----|------|
| **向量类型** | `vector(1536)` via pgvector | `vector(1536)` pgvector-compatible | ✅ 完全兼容 |
| **距离操作符** | `<=>` (cosine), `<->` (L2), `<#>` (inner product) | 相同 | ✅ 完全兼容 |
| **索引** | ivfflat | ivfflat | ✅ 完全兼容 |
| **KNN 搜索** | `ORDER BY embedding <=> query LIMIT 5` | 相同 | ✅ 完全兼容 |
| **RAG Pattern** | 手动实现 | 手动实现 | ✅ 相同 |
| **性能** | 本地 ~1-5ms | 网络 ~100-200ms | ⚠️ 有延迟 |

**代码迁移示例**：
```typescript
// 当前代码（本地 PostgreSQL）
const result = await pool.query(`
  SELECT id, content, embedding <=> $1 AS distance
  FROM knowledge_table
  WHERE embedding <=> $1 < 0.3
  ORDER BY embedding <=> $1 ASC
  LIMIT 5
`, [queryEmbedding]);

// db9 代码（HTTP API）
const response = await fetch(`https://api.db9.ai/customer/databases/${dbId}/sql`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: `SELECT id, content, embedding <=> '[0.1,0.2,...]' AS distance
            FROM knowledge_table
            WHERE embedding <=> '[0.1,0.2,...]' < 0.3
            ORDER BY embedding <=> '[0.1,0.2,...]' ASC
            LIMIT 5`
  })
});
```

**结论**：✅ **API 兼容** - SQL 查询完全一致，只需更改连接方式

---

### 2.2 JSONB 存储对比

| 特性 | 当前实现 | db9 | 评估 |
|------|---------|-----|------|
| **JSONB 类型** | ✅ 支持 | ✅ 支持 | ✅ 完全兼容 |
| **GIN 索引** | ✅ 支持 | ✅ 支持 | ✅ 完全兼容 |
| **操作符** | `->`, `->>`, `@>`, `?` 等 | 相同 | ✅ 完全兼容 |
| **函数** | `jsonb_build_object`, `jsonb_set` 等 | 相同 | ✅ 完全兼容 |
| **性能** | 本地 | 网络 ~100-200ms | ⚠️ 有延迟 |

**结论**：✅ **完全兼容** - JSONB 操作符和函数完全一致

---

### 2.3 db9 独有优势

#### 🌟 Full-Text Search（中文支持）

```sql
-- db9 内置中文分词（jieba）
CREATE INDEX idx_fts ON docs USING GIN (to_tsvector('chinese', content));

-- 搜索中文
SELECT * FROM docs
WHERE to_tsvector('chinese', content) @@ plainto_tsquery('chinese', '数据库');
```

**用途**：
- 关键词搜索补充向量搜索
- 精确匹配（如用户名、ID）
- 降低成本（不需要 embedding）

**当前实现缺失**：PostgreSQL 默认没有中文分词

#### 🌟 HTTP Extension

```sql
-- 从 SQL 直接调用外部 API
SELECT status, content::jsonb->>'origin' AS my_ip
FROM extensions.http_get('https://httpbin.org/ip');

-- POST webhook
SELECT status FROM extensions.http_post(
  'https://hooks.slack.com/services/...',
  '{"text":"Deploy complete!"}',
  'application/json'
);
```

**用途**：
- **知识库同步**：从外部 API 获取文档并存储
- **实时数据增强**：查询时从外部 API 获取最新数据
- **Webhook 通知**：任务完成时通知外部系统

**当前实现缺失**：需要在 Node.js 层面实现 HTTP 调用

#### 🌟 fs9 Extension（文件系统查询）

```sql
-- 直接从 SQL 查询 CSV/JSONL 文件
SELECT * FROM extensions.fs9('/data/*.csv');

-- 读取 JSONL 日志并过滤
SELECT _line_number, line
FROM extensions.fs9('/logs/app.jsonl')
WHERE line->>'level' = 'error';
```

**用途**：
- **批量导入**：直接从文件系统导入数据到知识库
- **日志分析**：分析应用日志存储到知识库
- **数据湖**：SQL 查询原始数据文件

#### 🌟 Cron Jobs（pg_cron）

```sql
-- 定期清理旧数据
SELECT cron.schedule('cleanup', '0 3 * * *',
  $$DELETE FROM logs WHERE created_at < now() - interval '30 days'$$);

-- 定期刷新物化视图
SELECT cron.schedule('refresh-stats', '0 * * * *',
  'REFRESH MATERIALIZED VIEW daily_stats');
```

**用途**：
- **知识库过期清理**：自动删除过期的知识条目
- **统计刷新**：定期更新使用统计
- **数据同步**：定期从外部数据源同步

---

## 3. 集成方案设计

### 3.1 混合架构（推荐）

```
┌─────────────────────────────────────────────────────────────┐
│                        MyAgent                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Agent      │  │  Knowledge   │  │   Context    │      │
│  │   Manager    │  │    Base      │  │   Manager    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │              │
│         ▼                 ▼                 ▼              │
│  ┌──────────────────────────────────────────────────┐     │
│  │         Storage Abstraction Layer                 │     │
│  │  - IVectorStore interface                        │     │
│  │  - IContextStore interface                       │     │
│  └──────────────────────────────────────────────────┘     │
│         │                                                 │
│    ┌────┴────┐                                          │
│    ▼         ▼                                          │
│  ┌─────┐  ┌─────┐                                       │
│  │PG   │  │ db9 │  ← Adapter Pattern                    │
│  │Local│  │Cloud│                                       │
│  └─────┘  └─────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**策略**：
- **开发环境**：使用本地 PostgreSQL（零延迟）
- **生产环境**：使用 db9（免运维）
- **混合模式**：热数据本地，冷数据 db9

**实现**：
```typescript
// src/core/knowledge/adapters/db9-adapter.ts
export class Db9VectorStore implements IVectorStore {
  constructor(config: Db9Config) {
    this.dbId = config.dbId;
    this.apiToken = config.apiToken;
    this.apiUrl = config.apiUrl || 'https://api.db9.ai';
  }

  async retrieve(collectionName: string, query: string, options: RetrieveOptions) {
    // 1. 生成 embedding（本地或远程）
    const embedding = await this.generateEmbedding(query);

    // 2. 调用 db9 SQL API
    const response = await fetch(`${this.apiUrl}/customer/databases/${this.dbId}/sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          SELECT id, content, embedding <=> $1 AS distance
          FROM ${collectionName}
          WHERE embedding <=> $1 < $2
          ORDER BY embedding <=> $1 ASC
          LIMIT $3
        `,
        params: [JSON.stringify(embedding), options.threshold || 0.3, options.limit || 5]
      })
    });

    return await response.json();
  }
}
```

---

### 3.2 环境变量配置

```bash
# .env
# 存储类型选择
STORAGE_TYPE=db9  # | local | hybrid

# 本地 PostgreSQL（fallback）
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myagent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# db9 配置
DB9_DATABASE_ID=t-3a7f8b2c
DB9_API_KEY=your-api-token-here
DB9_API_URL=https://api.db9.ai

# 混合模式规则
HYBRID_HOT_DATA_TTL=86400000  # 24小时内的数据保留本地
HYBRID_COLD_STORAGE=db9         # 冷数据存储到 db9
```

---

### 3.3 知识库增强功能

利用 db9 的独特能力：

#### A. 混合搜索（Vector + FTS）

```sql
-- db9 可以同时使用向量搜索和全文搜索
SELECT
  id,
  content,
  -- 向量相似度（语义搜索）
  (embedding <=> '[0.1,0.2,...]') AS vector_distance,
  -- 全文搜索排名（关键词匹配）
  ts_rank(text_vector, to_tsquery('chinese', '数据库')) AS fts_rank
FROM documents
WHERE
  -- 语义相似度阈值
  embedding <=> '[0.1,0.2,...]' < 0.3
  OR
  -- 关键词匹配
  text_vector @@ to_tsquery('chinese', '数据库')
ORDER BY
  -- 综合：向量距离 + FTS 排名
  (vector_distance * 0.7 + (1 - fts_rank) * 0.3) ASC
LIMIT 10;
```

**优势**：
- 语义搜索（向量）+ 关键词搜索（FTS）混合
- 提高召回率
- 降低成本（FTS 不需要 embedding）

#### B. 知识库自动同步

```sql
-- 使用 cron 定期从外部 API 同步文档
CREATE EXTENSION pg_cron;

-- 每天凌晨 3 点同步文档
SELECT cron.schedule('sync-docs', '0 3 * * *', $$
  -- 1. 从 HTTP API 获取文档
  WITH remote_docs AS (
    SELECT content::jsonb
    FROM extensions.http_get('https://api.example.com/docs')
  )
  -- 2. 插入到知识表
  INSERT INTO knowledge_table (content, embedding, metadata)
  SELECT
    doc->>'content',
    -- 假设有 embedding 函数
    generate_embedding(doc->>'content'),
    doc->>'metadata'
  FROM remote_docs
  ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = now();
$$);
```

#### C. 上下文压缩存储

利用 db9 的 JSONB 存储压缩后的上下文：

```sql
-- 存储压缩后的对话轮次
CREATE TABLE compressed_contexts (
  session_id TEXT PRIMARY KEY,
  -- 压缩后的摘要（JSONB）
  summary JSONB NOT NULL,
  -- 关键决策（JSONB 数组）
  key_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 文件修改记录（JSONB 数组）
  files_modified JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 压缩时间
  compressed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN 索引用于快速查询
CREATE INDEX idx_summary ON compressed_contexts USING GIN (summary);
CREATE INDEX idx_decisions ON compressed_contexts USING GIN (key_decisions);
```

---

## 4. 迁移路径

### 4.1 Phase 1: Adapter 实现（1-2 天）

```typescript
// 1. 创建 db9 adapter
src/core/knowledge/adapters/
  ├── postgres-adapter.ts (现有)
  └── db9-adapter.ts (新增)

// 2. 创建工厂模式
src/core/knowledge/factory.ts
export class VectorStoreFactory {
  static create(config: StorageConfig): IVectorStore {
    switch (config.type) {
      case 'postgres':
        return new PostgresVectorStore(config);
      case 'db9':
        return new Db9VectorStore(config);
      case 'hybrid':
        return new HybridVectorStore(config);
      default:
        throw new Error(`Unknown storage type: ${config.type}`);
    }
  }
}
```

### 4.2 Phase 2: 测试和验证（2-3 天）

```typescript
// tests/integration/db9-knowledge.test.ts
describe('Db9VectorStore', () => {
  it('should retrieve similar documents', async () => {
    const store = new Db9VectorStore({
      dbId: process.env.DB9_DATABASE_ID,
      apiToken: process.env.DB9_API_KEY,
    });

    const results = await store.retrieve('test-collection', '测试查询', {
      limit: 5,
      threshold: 0.7
    });

    expect(results).toHaveLength(5);
    expect(results[0].distance).toBeLessThan(0.7);
  });
});
```

### 4.3 Phase 3: 逐步迁移（1 周）

1. **开发环境测试**：先用 db9 作为知识库后端
2. **A/B 测试**：同时运行本地 PostgreSQL 和 db9，对比性能
3. **灰度发布**：10% → 50% → 100% 流量切换到 db9
4. **监控优化**：基于性能数据调整缓存策略

---

## 5. 性能对比

### 5.1 延迟对比

| 操作 | 本地 PostgreSQL | db9 | 说明 |
|------|----------------|-----|------|
| **向量搜索** | ~1-5ms | ~100-200ms | 网络延迟占主导 |
| **上下文存储** | ~1-3ms | ~100-150ms | 网络延迟占主导 |
| **Embedding 生成** | ~200-500ms | ~200-500ms | 相同（都调用 OpenAI） |

**优化策略**：
- ✅ **缓存**：LRU cache 缓存 embeddings（已有）
- ✅ **批量查询**：合并多个查询减少 RTT
- ✅ **预取**：提前加载可能需要的数据
- ✅ **混合架构**：热数据本地，冷数据 db9

### 5.2 成本对比

| 项目 | 本地 PostgreSQL | db9 |
|------|----------------|-----|
| **基础设施** | 服务器成本（~$20-50/月） | $0（免费额度） |
| **维护成本** | 需要运维人员 | 零运维 |
| **带宽成本** | - | API 调用成本 |
| **存储成本** | 磁盘成本 | 包含在免费额度 |

**估算**（基于 MyAgent 使用量）：
- 本地 PostgreSQL：$30/月（服务器）+ $10/月（OpenAI embeddings）= **$40/月**
- db9：$0（免费额度）+ $10/月（OpenAI embeddings）+ $5/月（API 调用）= **$15/月**

**节省**：~$25/月（62.5%）

---

## 6. 风险评估

### 6.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **网络延迟** | 高 | 高 | 缓存、批量查询、混合架构 |
| **API 限流** | 中 | 低 | 本地 fallback、重试机制 |
| **数据迁移复杂** | 中 | 中 | 渐进式迁移、双写验证 |
| **db9 服务中断** | 高 | 低 | 本地 PostgreSQL 作为 backup |

### 6.2 数据安全风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **数据泄露** | 高 | 低 | db9 使用加密传输、访问控制 |
| **数据丢失** | 高 | 极低 | db9 自动备份、定期导出 |
| **合规问题** | 中 | 低 | 数据可以存储在特定区域 |

---

## 7. 推荐方案

### 7.1 短期（1-2 个月）

**目标**：验证 db9 可行性

1. ✅ **实现 Db9VectorStore adapter**
2. ✅ **添加单元测试和集成测试**
3. ✅ **在开发环境测试**
4. ✅ **性能对比测试**

### 7.2 中期（3-6 个月）

**目标**：生产环境灰度

1. ✅ **实现混合存储模式**
2. ✅ **添加监控和告警**
3. ✅ **10% 流量切换到 db9**
4. ✅ **逐步提升到 100%**

### 7.3 长期（6-12 个月）

**目标**：全面迁移

1. ✅ **知识库完全迁移到 db9**
2. ✅ **上下文存储迁移到 db9**
3. ✅ **利用 db9 独特功能**（HTTP call、FS query、Cron）
4. ✅ **本地 PostgreSQL 仅作为 backup**

---

## 8. 下一步行动

### 8.1 立即可做

```bash
# 1. 安装 db9 CLI
curl -fsSL https://db9.ai/install | sh

# 2. 创建测试数据库
db9 db create --name myagent-knowledge-test

# 3. 运行测试脚本
npm run test:db9

# 4. 查看性能对比
npm run benchmark:storage
```

### 8.2 需要开发的文件

```
src/core/knowledge/adapters/db9-adapter.ts    # db9 adapter 实现
src/core/knowledge/factory.ts                  # 工厂模式
src/core/context/adapters/db9-context.ts       # 上下文存储 adapter
tests/integration/db9-knowledge.test.ts        # 集成测试
tests/integration/db9-context.test.ts          # 上下文测试
scripts/migrate-to-db9.ts                      # 迁移脚本
```

---

## 9. 总结

### ✅ 推荐集成 db9 的理由

1. **API 兼容**：SQL 查询完全一致，迁移成本低
2. **零运维**：不需要管理 PostgreSQL 服务器
3. **独特功能**：HTTP call、FS query、Cron jobs、中文 FTS
4. **成本降低**：预计节省 62.5% 的基础设施成本
5. **扩展性**：自动扩容、高可用、自动备份

### ⚠️ 需要注意的问题

1. **网络延迟**：需要优化缓存策略
2. **API 限流**：需要实现 fallback 机制
3. **数据迁移**：需要仔细规划迁移路径

### 🎯 最终建议

**推荐采用混合架构**：
- **开发环境**：本地 PostgreSQL（快速迭代）
- **生产环境**：db9（零运维、高可用）
- **混合模式**：热数据本地 + 冷数据 db9（最佳性能）

---

## 附录

### A. 参考链接

- db9 官方文档：https://db9.ai/skill.md
- pgvector 文档：https://github.com/pgvector/pgvector
- PostgreSQL JSONB 文档：https://www.postgresql.org/docs/current/datatype-json.html

### B. 相关 Issue

- #84: 考察 db9 作为知识库存储的可行性

### C. 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-02 | 1.0 | 初始版本 |
