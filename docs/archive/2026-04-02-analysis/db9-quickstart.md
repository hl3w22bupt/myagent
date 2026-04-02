# db9 快速体验指南

## 🚀 5 分钟快速上手

### 1. 安装 db9 CLI

```bash
# 安装 db9 CLI
curl -fsSL https://db9.ai/install | sh

# 验证安装
db9 --version
```

### 2. 创建免费测试数据库

```bash
# 创建数据库（自动注册匿名账户）
db9 db create --name myagent-test

# 输出示例：
# Database created successfully!
# ID: t-3a7f8b2c
# Name: myagent-test
# Connection String:
# postgresql://t-3a7f8b2c.admin:xK9mP2qR4vBn@pg.db9.io:5433/postgres
```

### 3. 测试向量搜索功能

```bash
# 创建测试表
db9 db sql -q "
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  content TEXT,
  embedding vector(1536)
);
"

# 插入测试数据
db9 db sql -q "
INSERT INTO documents (content, embedding) VALUES
('PostgreSQL 是一个强大的开源关系型数据库', '[0.1, 0.2, 0.3, ...]'),
('Python 是一种流行的编程语言', '[0.2, 0.3, 0.4, ...]'),
('JavaScript 是 Web 开发的核心语言', '[0.3, 0.4, 0.5, ...]');
"

# 向量搜索（找到最相似的文档）
db9 db sql -q "
SELECT id, content, embedding <=> '[0.1, 0.2, 0.3, ...]' AS distance
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, 0.3, ...]' ASC
LIMIT 2;
"
```

### 4. 测试中文全文搜索

```bash
# 创建测试表
db9 db sql -q "
CREATE TABLE articles (
  id SERIAL PRIMARY KEY,
  title TEXT,
  content TEXT
);
"

# 插入中文数据
db9 db sql -q "
INSERT INTO articles (title, content) VALUES
('分布式数据库', '分布式数据库是现代互联网架构的核心组件，支持水平扩展'),
('PostgreSQL 介绍', 'PostgreSQL 是一个功能强大的开源关系型数据库管理系统'),
('混合语言示例', 'TiKV 是一个分布式事务型 key-value 数据库，支持 ACID 事务');
"

# 创建中文全文搜索索引
db9 db sql -q "
CREATE INDEX idx_articles_chinese ON articles
USING GIN (to_tsvector('chinese', content));
"

# 中文搜索
db9 db sql -q "
SELECT id, title
FROM articles
WHERE to_tsvector('chinese', content) @@ plainto_tsquery('chinese', '数据库');
"
```

### 5. 测试 JSONB 存储

```bash
# 创建 JSONB 表
db9 db sql -q "
CREATE TABLE task_contexts (
  task_id TEXT PRIMARY KEY,
  conversation_rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
"

# 插入 JSONB 数据
db9 db sql -q "
INSERT INTO task_contexts (task_id, conversation_rounds, summary) VALUES
('task-123', '[
  {\"round\": 1, \"userMessage\": \"你好\", \"assistantReply\": \"你好！有什么可以帮助你的吗？\"},
  {\"round\": 2, \"userMessage\": \"介绍下 PostgreSQL\", \"assistantReply\": \"PostgreSQL 是...\"}
]'::jsonb, '{\"currentTask\": \"介绍 PostgreSQL\", \"decisionsMade\": []}'::jsonb);
"

# JSONB 查询
db9 db sql -q "
SELECT
  task_id,
  conversation_rounds->0->>'userMessage' AS first_message,
  summary->>'currentTask' AS current_task
FROM task_contexts
WHERE conversation_rounds @> '[{\"round\": 1}]'::jsonb;
"
```

### 6. 测试 HTTP Extension（从 SQL 调用 API）

```bash
# 启用 HTTP extension
db9 db sql -q "CREATE EXTENSION http;"

# GET 请求
db9 db sql -q "
SELECT
  status,
  content_type,
  content::jsonb->>'origin' AS my_ip
FROM extensions.http_get('https://httpbin.org/ip');
"

# POST 请求示例
db9 db sql -q "
SELECT status, content
FROM extensions.http_post(
  'https://httpbin.org/post',
  '{\"message\": \"Hello from db9!\"}',
  'application/json'
);
"
```

### 7. 测试 Cron Jobs（定时任务）

```bash
# 启用 pg_cron
db9 db sql -q "CREATE EXTENSION pg_cron;"

# 创建定时任务（每分钟执行一次）
db9 db sql -q "
SELECT cron.schedule(
  'test-job',
  '* * * * *',
  \$\$INSERT INTO logs (message) VALUES ('Cron job executed at ' || now())\$\$
);
"

# 查看所有定时任务
db9 db cron list

# 查看执行历史
db9 db cron history --limit 10

# 删除定时任务
db9 db cron delete test-job
```

### 8. 查看数据库性能

```bash
# 性能概览
db9 db inspect

# 慢查询分析
db9 db inspect slow-queries

# 完整报告（JSON 格式）
db9 --json db inspect report
```

---

## 📊 对比测试：本地 PostgreSQL vs db9

### 本地 PostgreSQL

```bash
# 连接本地数据库
psql "postgresql://postgres:password@localhost:5432/myagent"

# 向量搜索
\timing on
SELECT id, content, embedding <=> '[0.1, 0.2, ...]' AS distance
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]' ASC
LIMIT 5;

# 典型结果：1-5ms
```

### db9

```bash
# 连接 db9
DB_ID=$(db9 --json db list | jq -r '.[0].id')

# 向量搜索
time db9 db sql -q "
SELECT id, content, embedding <=> '[0.1, 0.2, ...]' AS distance
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]' ASC
LIMIT 5;
"

# 典型结果：100-200ms（网络延迟）
```

---

## 🔧 与 MyAgent 集成测试

### 1. 创建知识库表

```bash
# 使用现有的 setup-knowledge-base 脚本
npm run setup:knowledge-base -- --db9 --execute

# 或手动创建
db9 db sql -q "
CREATE TABLE knowledge_table (
  id bigserial PRIMARY KEY,
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_knowledge_embedding ON knowledge_table
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
"
```

### 2. 测试 RAG 查询

```bash
# 插入测试文档（需要先生成 embeddings）
# 这里假设你有 embeddings 数组

db9 db sql -q "
INSERT INTO knowledge_table (content, embedding, metadata) VALUES
('MyAgent 是一个 4 层分布式 AI Agent 系统', '[0.1, 0.2, ...]'::vector(1536), '{"source": "docs"}'::jsonb),
('Motia 是事件驱动的 Agent 编排框架', '[0.2, 0.3, ...]'::vector(1536), '{"source": "docs"}'::jsonb);
"

# 查询最相似的文档
db9 db sql -q "
SELECT id, content, metadata, embedding <=> '[0.1, 0.2, ...]' AS distance
FROM knowledge_table
ORDER BY embedding <=> '[0.1, 0.2, ...]' ASC
LIMIT 3;
"
```

### 3. 性能基准测试

```bash
# 创建测试脚本
cat > benchmark-db9.sh <<'EOF'
#!/bin/bash

echo "=== db9 性能基准测试 ==="

# 测试 1: 简单查询
echo "测试 1: 简单 SELECT 查询"
time for i in {1..100}; do
  db9 db sql -q "SELECT 1" > /dev/null
done

# 测试 2: 向量搜索
echo "测试 2: 向量搜索（100 次）"
time for i in {1..100}; do
  db9 db sql -q "
    SELECT id FROM knowledge_table
    ORDER BY embedding <=> '[0.1, 0.2, ...]' ASC
    LIMIT 5
  " > /dev/null
done

# 测试 3: JSONB 查询
echo "测试 3: JSONB 查询（100 次）"
time for i in {1..100}; do
  db9 db sql -q "
    SELECT task_id FROM task_contexts
    WHERE conversation_rounds @> '[{\"round\": 1}]'::jsonb
    LIMIT 5
  " > /dev/null
done
EOF

chmod +x benchmark-db9.sh
./benchmark-db9.sh
```

---

## 🎯 下一步行动

### 立即可做

1. **安装 db9 CLI**
   ```bash
   curl -fsSL https://db9.ai/install | sh
   ```

2. **创建测试数据库**
   ```bash
   db9 db create --name myagent-knowledge-test
   ```

3. **运行测试脚本**
   ```bash
   # 将在下一步创建
   npm run test:db9-quickstart
   ```

### 需要开发的文件

```
scripts/test-db9-quickstart.sh       # 快速测试脚本
scripts/benchmark-db9.sh             # 性能基准测试
src/core/knowledge/adapters/db9-adapter.ts  # db9 adapter 实现
tests/integration/db9-knowledge.test.ts     # 集成测试
```

---

## 📚 参考资料

- **完整分析报告**：`docs/analysis/db9-integration-analysis.md`
- **db9 官方文档**：https://db9.ai/skill.md
- **pgvector 文档**：https://github.com/pgvector/pgvector

---

## ❓ 常见问题

### Q: db9 免费额度是多少？

A: db9 提供慷慨的免费额度：
- 数据库数量：5 个（匿名账户）
- 存储空间：每数据库 1GB
- API 调用：每月 10,000 次
- 查询：每月 100,000 次

### Q: 数据安全吗？

A: db9 使用：
- TLS 加密传输
- 自动备份
- 访问控制（Bearer token）
- 符合 SOC 2 标准

### Q: 可以导出数据吗？

A: 可以，多种方式：
```bash
# 导出为 SQL
db9 db dump -o backup.sql

# 使用 psql 导出
psql "postgresql://..." -c "COPY table TO stdout WITH CSV" > data.csv

# 使用 API 导出
curl -X POST "https://api.db9.ai/customer/databases/$DB_ID/dump"
```

### Q: 性能如何？

A: 典型延迟：
- 简单查询：100-150ms
- 向量搜索：150-200ms
- JSONB 查询：100-150ms

优化建议：
- 使用连接池（amortize TLS 握手成本）
- 批量查询（减少 RTT）
- LRU cache（缓存 embeddings）
- 混合架构（热数据本地）

---

## 🎓 学习路径

1. **基础操作**（30 分钟）
   - 安装 CLI
   - 创建数据库
   - 基本 SQL 操作

2. **核心功能**（1 小时）
   - Vector search
   - JSONB 查询
   - Full-text search（中文）

3. **高级功能**（2 小时）
   - HTTP extension
   - fs9 文件系统
   - Cron jobs

4. **集成实践**（4 小时）
   - 实现 Db9VectorStore adapter
   - 集成到 MyAgent
   - 性能测试和优化

---

**准备好开始了吗？** 运行 `curl -fsSL https://db9.ai/install | sh` 开始你的 db9 之旅！
