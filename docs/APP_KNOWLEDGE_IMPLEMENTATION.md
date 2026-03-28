# App-Knowledge 功能实现总结

## 已完成功能

### Phase 1: 核心功能 ✅

1. **数据库表结构** ✅
   - `app_knowledge_mappings` 表已创建
   - 外键约束关联到 `knowledge` 表
   - 支持多租户隔离

2. **App-Knowledge Manager** ✅
   - 文件：`src/core/knowledge/app-knowledge-manager.ts`
   - 功能：
     - `getAppKnowledgeCollections()` - 获取 app 的知识库列表
     - `addAppKnowledgeCollection()` - 添加知识库关联
     - `removeAppKnowledgeCollection()` - 移除知识库关联
     - `batchConfigureAppKnowledgeCollections()` - 批量配置

3. **Agent 自动检索逻辑** ✅
   - 文件：`src/core/agent/agent.ts`
   - 修改：支持根据 `app` 自动获取关联的知识库
   - 特性：
     - 并行检索多个知识库
     - 按优先级和相似度排序
     - 向后兼容 `knowledgeCollection` 参数

### Phase 2: API 端点 ✅

1. **GET /api/apps/:appId/knowledge-collections** ✅
   - 获取 app 的知识库列表

2. **POST /api/apps/:appId/knowledge-collections/add** ✅
   - 添加单个知识库关联

3. **POST /api/apps/:appId/knowledge-collections/batch** ✅
   - 批量配置知识库关联

## 使用方式

### 1. 配置 App-Knowledge 关联

```bash
# 批量配置
curl -X POST "http://localhost:3001/api/apps/myecho/knowledge-collections/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "session-123",
    "collections": [
      {"collectionName": "product-docs", "enabled": true, "priority": 0},
      {"collectionName": "support-faq", "enabled": true, "priority": 1}
    ]
  }'
```

### 2. 提交任务（自动检索）

```bash
# 使用 app 参数，自动检索关联知识库
curl -X POST "http://localhost:3001/agent/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "如何重置密码？",
    "app": "myecho",
    "sessionId": "session-123"
  }'
```

### 3. 向后兼容（手动指定）

```bash
# 仍然支持手动指定 knowledgeCollection
curl -X POST "http://localhost:3001/agent/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "如何重置密码？",
    "sessionId": "session-123",
    "environment": {
      "knowledgeCollection": "product-docs"
    }
  }'
```

## 文件清单

### 新增文件
- `src/core/knowledge/app-knowledge-manager.ts` - App-Knowledge 管理器
- `scripts/setup-app-knowledge-mappings.ts` - 数据库初始化脚本
- `scripts/init-test-knowledge.ts` - 测试数据初始化脚本
- `steps/api/app-knowledge-collections-api.step.ts` - GET API
- `steps/api/app-knowledge-collections-add-api.step.ts` - POST API (单个)
- `steps/api/app-knowledge-collections-batch-api.step.ts` - POST API (批量)
- `docs/APP_KNOWLEDGE_DESIGN.md` - 设计文档

### 修改文件
- `src/core/agent/agent.ts` - 添加自动检索逻辑
- `src/core/context/orchestrator.ts` - 添加 `app` 属性到 OrchestratedContext
- `scripts/setup-knowledge-base.ts` - 添加唯一约束
- `package.json` - 添加新脚本命令

## 数据库表结构

### app_knowledge_mappings

```sql
CREATE TABLE app_knowledge_mappings (
  id BIGSERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  collection_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT app_collection_unique UNIQUE(app_id, tenant_id, collection_name),
  CONSTRAINT fk_collection
    FOREIGN KEY (tenant_id, collection_name)
    REFERENCES knowledge(tenant_id, collection_name)
    ON DELETE CASCADE
);
```

### knowledge 表修改

```sql
-- 添加唯一约束以支持外键
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_tenant_collection_unique
  ON knowledge(tenant_id, collection_name);
```

## 下一步

### Phase 3: 增强功能（可选）

1. **前端管理界面** - 可视化配置知识库
2. **知识库使用统计** - 记录检索次数和效果
3. **智能推荐** - 根据任务内容推荐知识库

### 测试流程

1. 创建知识库数据（需要 OpenAI API key）
2. 配置 app-knowledge 关联
3. 提交任务验证自动检索

## 重要提示

1. **外键约束**：配置 app-knowledge 关联前，需要先在 knowledge 表中创建对应的集合
2. **多租户**：确保使用正确的 tenantId（通常是 sessionId）
3. **优先级**：数字越小优先级越高，用于多知识库结果排序
