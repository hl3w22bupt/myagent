# Knowledge APIs

> 知识库相关的 API（8个端点）

**阅读时间**: 5 分钟 | **难度**: ⭐⭐ intermediate

---

## ⭐ 核心端点

### GET /api/knowledge/collections

**描述**: 列出所有知识库集合

**重要性**: ⭐⭐⭐

```bash
curl http://localhost:3000/api/knowledge/collections
```

**响应**:
```json
{
  "collections": [
    {
      "name": "python-docs",
      "type": "postgres",
      "count": 1234
    }
  ]
}
```

---

### GET /api/knowledge/datasources

**描述**: 列出所有数据源

**重要性**: ⭐⭐⭐

```bash
curl http://localhost:3000/api/knowledge/datasources
```

---

### POST /api/knowledge/datasources

**描述**: 添加新的数据源

**重要性**: ⭐⭐⭐

```bash
curl -X POST http://localhost:3000/api/knowledge/datasources \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-postgres-kb",
    "type": "postgres",
    "config": {
      "host": "localhost",
      "port": 5432,
      "database": "myagent_kb",
      "user": "postgres",
      "password": "postgres"
    }
  }'
```

---

## 📋 其他端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/knowledge/datasources/:id` | DELETE | 删除数据源 |
| `/api/knowledge/datasources/:id/test` | POST | 测试数据源 |
| `/api/knowledge/datasources/:id/discover` | POST | 发现集合 |
| `/api/app/knowledge/collections` | GET | App 知识库 |
| `/api/app/knowledge/collections` | POST | 添加集合 |

---

## 📖 相关文档

- [知识库系统](../../architecture/knowledge-base.md) - RAG 原理
- [知识库使用指南](../../guides/getting-started/using-knowledge-base.md) - 使用教程

---

**版本**: v1.0 | **更新日期**: 2026-03-29
