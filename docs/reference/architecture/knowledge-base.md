# 知识库系统

> RAG（检索增强生成）：让 Agent 访问外部知识

**阅读时间**: 7 分钟 | **难度**: ⭐⭐ intermediate

---

## 🧠 什么是知识库？

知识库系统通过 **RAG (Retrieval-Augmented Generation)** 技术，让 Agent 能够检索和利用外部知识。

---

## 🎯 核心能力

### 1. 多数据源支持

```typescript
// 支持的数据源
const datasources = [
  {
    type: 'postgres',     // PostgreSQL + pgvector
    connection: { /* ... */ }
  },
  {
    type: 'lancedb',      // LanceDB
    connection: { /* ... */ }
  }
];
```

### 2. 向量相似度搜索

```typescript
// 基于 embedding 的语义检索
const results = await knowledgeBase.search({
  query: "Python 的特点",
  topK: 5,
  threshold: 0.7,
});
```

### 3. 多租户隔离

```typescript
// 使用 namespace 隔离
const collection = "tenantId:collectionName";

// 示例
const pythonDocs = "default:python-docs";
const userKnowledge = "user-123:my-docs";
```

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────┐
│           Agent 请求知识                     │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│      KnowledgeBase (知识库管理器)            │
│  - 发现数据源                                │
│  - 并行检索                                  │
│  - 结果融合                                  │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│        DataSource (数据源适配器)             │
│  ┌────────────┐  ┌────────────┐             │
│  │ PostgreSQL │  │  LanceDB   │             │
│  │   Adapter  │  │   Adapter  │             │
│  └────────────┘  └────────────┘             │
└─────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. 配置知识库

```bash
# .env
# PostgreSQL 配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myagent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Embedding 配置
OPENAI_API_KEY=sk-xxx
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

### 2. 创建知识表

```bash
# 创建知识表
npm run setup:knowledge-base -- --execute --dimensions 1536
```

### 3. 使用知识库

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Python 有什么特点？",
    "environment": {
      "knowledgeCollection": "python-docs"
    }
  }'
```

---

## 📊 数据源配置

### PostgreSQL

```yaml
# config/datasources.yaml
- name: my-postgres-kb
  type: postgres
  config:
    host: localhost
    port: 5432
    database: myagent_kb
    user: postgres
    password: postgres
  collections:
    - name: python-docs
      tableName: python_docs
```

### LanceDB

```yaml
- name: my-lancedb-kb
  type: lancedb
  config:
    uri: ./lancedb-data
  collections:
    - name: vector-docs
      tableName: documents
```

---

## 🔍 知识检索

### 检索流程

```
Agent 请求知识
      ↓
获取可用的数据源
      ↓
并行检索所有数据源
      ↓
向量相似度计算
      ↓
结果排序和过滤
      ↓
返回 Top-K 结果
```

### 检索 API

```typescript
// 检索知识
const results = await knowledgeBase.retrieve({
  collection: 'python-docs',
  query: 'Python 的异步编程',
  topK: 5,
  minScore: 0.7,
});

// 结果格式
[
  {
    content: 'Python 的异步编程使用 async/await...',
    metadata: { source: 'docs/python.md' },
    score: 0.89
  },
  // ... 更多结果
]
```

---

## ⚡ 性能优化

### 1. LRU 缓存

```typescript
// 5 分钟 TTL
const cache = new LRUCache({
  max: 100,
  ttl: 5 * 60 * 1000,
});
```

### 2. 连接池

```typescript
// 复用数据库连接
const pool = new Pool({
  max: 10,
  idleTimeoutMillis: 30000,
});
```

### 3. 并行检索

```typescript
// 并行检索多个数据源
const results = await Promise.all([
  postgresAdapter.search(query),
  lancedbAdapter.search(query),
]);
```

---

## 📖 相关文档

- [核心概念](core-concepts.md) - Session、Task、Agent、Skill
- [Agent 系统](agent-system.md) - Agent 如何使用知识库
- [Knowledge API](../api/http-api/knowledge-apis.md) - 知识库 API

---

**版本**: v1.0 | **更新日期**: 2026-03-29
