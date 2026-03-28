# MyAgent 知识库（Knowledge Base）使用指南

> **功能**: RAG（Retrieval-Augmented Generation）- 基于向量相似度的知识检索
> **状态**: Phase 1 MVP - 已完成实现

## 📚 功能概述

MyAgent 现在支持知识库功能，允许 Agent 在执行任务时检索相关背景知识，提供更准确和上下文相关的回答。

### 核心特性

- **向量嵌入**: 使用 OpenAI `text-embedding-3-small` (1536 维)
- **多租户支持**: 使用 `tenantId:collectionName` 命名空间隔离
- **相似度搜索**: 基于余弦相似度（cosine similarity）
- **内容安全**: 自动清理 HTML 标签和 SQL 注入模式
- **性能优化**: LRU 缓存（5分钟 TTL）和连接池
- **降级策略**: 知识检索失败时自动降级，不影响 Agent 执行

## 🚀 快速开始

### 1. 安装 pgvector 扩展

```bash
# macOS (Homebrew)
brew install pgvector

# 验证安装
psql -d postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
```

### 2. 初始化知识库表

```bash
# Dry-run 模式（查看将要执行的操作）
npm run setup:knowledge-base

# 执行安装
npm run setup:knowledge-base -- --execute
```

这将创建：
- `knowledge` 表（带向量列）
- 复合索引（tenant + collection）
- 唯一约束（防止重复）
- 更新时间戳触发器

### 3. 配置 Agent 使用知识库

在创建 Agent 时添加 `knowledgeBase` 配置：

```typescript
import { MasterAgent } from './src/core/agent/master-agent';

const agent = new MasterAgent(
  {
    systemPrompt: 'You are a helpful assistant.',

    // 沙库库配置
    knowledgeBase: {
      db: {
        host: 'localhost',
        port: 5432,
        database: 'myagent',
        user: 'your-user',
        password: 'your-password',
        max: 20,              // 最大连接数
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      },
      openaiApiKey: process.env.OPENAI_API_KEY,
      embeddingModel: 'text-embedding-3-small',  // 可选
    },

    // 其他配置...
    sandbox: { /* ... */ },
    llm: { /* ... */ },
  },
  'session-id'
);
```

### 4. 添加知识到集合

```typescript
// 添加知识条目
await agent.knowledgeBase?.addKnowledge(
  'tenant-123',           // 租户 ID
  'product-docs',         // 集合名称
  '我们的产品支持 XXX 功能',  // 知识内容
  {
    category: 'feature',
    version: '1.0',
    tags: ['product', 'feature'],
  }
);
```

### 5. 使用知识库执行任务

```typescript
const result = await agent.run(
  'XXX 功能如何使用？',
  undefined,
  {
    knowledgeCollection: 'product-docs',  // 指定知识集合
  }
);
```

Agent 将自动：
1. 从指定集合中检索相关知识
2. 将知识注入到 PTC 生成上下文中
3. 基于知识生成更准确的回答

## 📖 API 参考

### KnowledgeBase 类

#### `constructor(config: KnowledgeBaseConfig)`

创建知识库实例。

**参数**:
- `db`: PostgreSQL 连接池配置
- `openaiApiKey`: OpenAI API 密钥
- `embeddingModel`: 嵌入模型（默认：'text-embedding-3-small'）
- `cacheTtl`: 缓存 TTL（默认：300000ms = 5分钟）

#### `addKnowledge(tenantId, collectionName, content, metadata?)`

添加知识到集合。

**参数**:
- `tenantId`: 租户 ID（用于多租户隔离）
- `collectionName`: 集合名称（只能包含字母、数字、下划线、连字符）
- `content`: 知识内容
- `metadata`: 可选元数据（JSON 对象）

**返回**: 创建的知识条目 ID

**示例**:
```typescript
const id = await kb.addKnowledge(
  'tenant-1',
  'docs',
  'Feature X allows users to do Y',
  { feature: 'X', category: 'user-guide' }
);
```

#### `retrieve(tenantId, collectionName, query, options?)`

从集合中检索相关知识。

**参数**:
- `tenantId`: 租户 ID
- `collectionName`: 集合名称
- `query`: 查询文本
- `options`: 可选项
  - `limit`: 最大返回结果数（默认：5）
  - `threshold`: 最小相似度分数（默认：0.7）

**返回**: 知识条目数组（带相似度分数）

**示例**:
```typescript
const results = await kb.retrieve(
  'tenant-1',
  'docs',
  'How do I use feature X?',
  { limit: 3, threshold: 0.8 }
);

// 结果格式
[
  {
    id: 123,
    tenantId: 'tenant-1',
    collectionName: 'docs',
    content: 'Feature X allows users to...',
    metadata: { feature: 'X' },
    similarity: 0.92,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  // ...
]
```

## 🌐 使用其他 OpenAI 兼容的 API

KnowledgeBase 支持任何兼容 OpenAI API 格式的服务，只需配置 `baseURL` 和 `apiKey`。

### 配置示例

```typescript
// 示例1：使用智谱AI
knowledgeBase: {
  apiKey: 'your_zhipu_api_key',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  embeddingModel: 'embedding-3',
  embeddingDimensions: 1024,
}

// 示例2：使用本地模型
knowledgeBase: {
  apiKey: 'dummy-key',
  baseURL: 'http://localhost:8000/v1',
  embeddingModel: 'local-model',
  embeddingDimensions: 768,
}

// 示例3：使用其他兼容服务
knowledgeBase: {
  apiKey: 'your_key',
  baseURL: 'https://your-api.com/v1',
  embeddingModel: 'model-name',
  embeddingDimensions: 1536,
}
```

### 重要提示

- **向量维度**：确保数据库表的向量维度与模型的维度一致
- **模型名称**：使用API提供商指定的模型名称
- **创建表**：根据维度创建表：`npm run setup:knowledge-base -- --execute --dimensions 1024`

## 🔧 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `EMBEDDING_API_KEY` | Embedding API 密钥 | 是 |
| `EMBEDDING_BASE_URL` | Embedding API 地址（可选，默认OpenAI） | 否 |
| `PG_HOST` / `DB_HOST` | PostgreSQL 主机地址 | 否（默认：localhost） |
| `PG_PORT` / `DB_PORT` | PostgreSQL 端口 | 否（默认：5432） |
| `PG_DATABASE` / `DB_NAME` | 数据库名称 | 否（默认：myagent） |
| `PG_USER` / `DB_USER` | 数据库用户 | 否（默认：postgres） |
| `PG_PASSWORD` / `DB_PASSWORD` | 数据库密码 | 否（默认：空） |

## 🛡️ 安全特性

### 内容清理

自动移除潜在危险内容：
- HTML 标签
- SQL 注入模式
- 控制字符
- 过度空格

### 集合名称验证

集合名称只能包含：
- 字母（a-z, A-Z）
- 数字（0-9）
- 下划线（_）
- 连字符（-）

### 多租户隔离

每个租户的知识完全隔离，使用 `tenantId:collectionName` 命名空间。

## 📊 性能优化

### 连接池

- 最大连接数：20（可配置）
- 空闲超时：30秒
- 连接超时：2秒

### LRU 缓存

- 最大缓存条目：1000
- TTL：5 分钟
- 自动过期和清理

### 向量索引

- 对于 1000+ 行的集合：自动创建 IVFFlat 索引
- 对于 <1000 行：顺序扫描可能更快
- 索引类型：余弦相似度（`vector_cosine_ops`）

## 🔍 监控和调试

### 日志输出

知识检索过程中的关键日志：

```
[Agent] Retrieving knowledge from collection: { tenantId, collection, query }
[Agent] Retrieved relevant knowledge: { count, avgSimilarity }
[Agent] No relevant knowledge found
[Agent] Knowledge retrieval failed: { error }
[Agent] Continuing without knowledge (fallback strategy)
```

### 查询知识库

```sql
-- 查看所有知识条目
SELECT tenant_id, collection_name, content, metadata, created_at
FROM knowledge
ORDER BY created_at DESC
LIMIT 10;

-- 查看特定租户和集合的知识
SELECT id, content, metadata
FROM knowledge
WHERE tenant_id = 'tenant-123' AND collection_name = 'docs'
ORDER BY created_at DESC;

-- 统计知识条目数量
SELECT tenant_id, collection_name, COUNT(*) as count
FROM knowledge
GROUP BY tenant_id, collection_name;
```

## ⚠️ 注意事项

### OpenAI API 地区限制

OpenAI Embedding API 在某些地区可能不可用。如果遇到 403 错误：

1. 检查 API 密钥是否有效
2. 确认网络可以访问 OpenAI API
3. 考虑使用代理或 VPN

### 集合命名规范

集合名称必须符合验证规则，否则会抛出错误：

```typescript
// ✅ 正确的集合名
'product-docs'
'user_manuals'
'test-collection'

// ❌ 错误的集合名
'product docs'  // 包含空格
'product/docs'  // 包含斜杠
'product.docs'  // 包含点号
```

### 相似度阈值调整

- **高精度**（0.9+）：只返回非常相关的知识
- **平衡**（0.7）：默认值，相关性和召回率平衡
- **高召回**（0.5+）：返回更多可能相关的知识

根据具体场景调整阈值。

## 🚀 下一步

Phase 1 MVP 已完成！未来增强功能包括：

### Phase 2: 增强功能（按需）
- 安全加固：ACL、速率限制
- 性能优化：批量检索、异步预取
- 验证器：输入验证、内容验证

### Phase 3: 高级功能（按需）
- 并行委托：多 Agent 并行检索
- 自定义融合：多源知识融合

## 📝 示例用例

### 1. 产品文档问答

```typescript
// 添加产品文档
await kb.addKnowledge(
  'tenant-1',
  'product-manual',
  '要重置密码，请访问设置页面并点击"重置密码"'
);

// Agent 执行
const result = await agent.run(
  '如何重置密码？',
  undefined,
  { knowledgeCollection: 'product-manual' }
);
```

### 2. 技术文档查询

```typescript
// 添加技术文档
await kb.addKnowledge(
  'dev-team',
  'api-docs',
  'GET /api/users 返回所有用户列表，需要管理员权限'
);

// 查询
const result = await agent.run(
  '获取用户列表的 API 是什么？',
  undefined,
  { knowledgeCollection: 'api-docs' }
);
```

### 3. 知识库管理

```typescript
// 创建不同集合的知识库
await kb.addKnowledge('tenant-1', 'sales', '销售话术...');
await kb.addKnowledge('tenant-1', 'support', '支持文档...');
await kb.addKnowledge('tenant-1', 'training', '培训材料...');

// 根据场景选择不同知识库
await agent.run(task, undefined, { knowledgeCollection: 'sales' });
await agent.run(task, undefined, { knowledgeCollection: 'support' });
await agent.run(task, undefined, { knowledgeCollection: 'training' });
```

## 🆘 故障排查

### 问题：pgvector 扩展不可用

**错误**: `extension "vector" is not available`

**解决方案**:
```bash
# 检查 pgvector 是否已安装
psql -d postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"

# 如果没有，安装 pgvector
brew install pgvector
```

### 问题：知识检索返回空结果

**可能原因**:
1. 集合中没有相关知识
2. 相似度阈值设置太高
3. 查询与知识内容差异较大

**解决方案**:
- 降低 `threshold` 参数（如 0.5）
- 增加 `limit` 参数（如 10）
- 确认知识内容已正确添加

### 问题：性能较慢

**可能原因**:
1. 没有创建向量索引（行数 <1000）
2. OpenAI API 延迟
3. 数据库连接池配置不当

**解决方案**:
- 等待数据积累到 1000+ 行后自动创建索引
- 启用 LRU 缓存（默认已启用）
- 检查网络连接

## 📞 获取帮助

如有问题，请查看：
- 架构文档：`docs/AGENT_PLATFORM_ARCHITECTURE.md`
- 单元测试：`tests/unit/knowledge/knowledge-base.test.ts`
- 集成测试：`tests/integration/knowledge-integration.test.ts`

---

**最后更新**: 2026-03-28
**版本**: Phase 1 MVP
