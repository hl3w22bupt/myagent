# App-Knowledge 多对多关联设计方案

## 问题：当前设计的缺陷

### 现状
- 每次提交任务需要手动指定 `environment.knowledgeCollection`
- App 和知识库的关联关系没有持久化
- 用户使用体验差

### 用户需求
1. **App 关联多个知识库**：一个 app 可以配置多个可用知识库
2. **自动检索**：提交任务时根据 `app` 自动检索所有关联的知识库
3. **配置管理 API**：提供 API 管理 app 的知识库列表
4. **前端菜单展示**：用户可以查看和选择可用知识库

---

## 设计方案

### 1. 数据库表设计

#### 1.1 App-Knowledge 映射表

```sql
CREATE TABLE app_knowledge_mappings (
  id BIGSERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  collection_name VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,  -- 检索优先级（数字越小越优先）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(app_id, tenant_id, collection_name),
  CONSTRAINT fk_collection
    FOREIGN KEY (tenant_id, collection_name)
    REFERENCES knowledge(tenant_id, collection_name)
    ON DELETE CASCADE
);

CREATE INDEX idx_app_lookup ON app_knowledge_mappings(app_id, tenant_id, enabled);
CREATE INDEX idx_tenant_lookup ON app_knowledge_mappings(tenant_id, collection_name);
```

**字段说明**：
- `app_id`: 应用标识（如 "myecho", "default"）
- `tenant_id`: 租户ID（多租户隔离）
- `collection_name`: 知识库集合名称
- `enabled`: 是否启用（可禁用某个知识库）
- `priority`: 检索优先级（越小越优先，用于结果排序）

#### 1.2 现有表无需修改

- `knowledge` 表保持不变
- `tasks` 表保持不变

---

### 2. API 接口设计

#### 2.1 获取 App 的知识库列表

```
GET /api/apps/:appId/knowledge-collections?tenantId=xxx
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "collectionName": "product-docs",
      "enabled": true,
      "priority": 0,
      "metadata": {
        "totalKnowledge": 150,
        "lastUpdated": "2026-03-28T10:00:00Z"
      }
    },
    {
      "collectionName": "support-docs",
      "enabled": true,
      "priority": 1,
      "metadata": {...}
    }
  ]
}
```

#### 2.2 配置 App 的知识库

```
POST /api/apps/:appId/knowledge-collections
```

**请求**：
```json
{
  "tenantId": "tenant-123",
  "collectionName": "product-docs",
  "enabled": true,
  "priority": 0
}
```

#### 2.3 移除 App 的知识库

```
DELETE /api/apps/:appId/knowledge-collections/:collectionName?tenantId=xxx
```

#### 2.4 批量配置

```
POST /api/apps/:appId/knowledge-collections/batch
```

**请求**：
```json
{
  "tenantId": "tenant-123",
  "collections": [
    {"collectionName": "product-docs", "enabled": true, "priority": 0},
    {"collectionName": "support-docs", "enabled": true, "priority": 1},
    {"collectionName": "training-materials", "enabled": false, "priority": 2}
  ]
}
```

---

### 3. Agent 执行逻辑改动

#### 3.1 当前逻辑（需要改动的部分）

```typescript
// src/core/agent/agent.ts - Agent.run() 方法

// 当前：手动指定 environment.knowledgeCollection
if (this.knowledgeBase && orchestratedContext.knowledgeCollection) {
  const query = task || orchestratedContext.originalTask || '';
  const knowledgeEntries = await this.knowledgeBase.retrieve(
    this.sessionId,
    orchestratedContext.knowledgeCollection,
    query,
    { limit: 5, threshold: 0.7 }
  );
  // ...
}
```

#### 3.2 新逻辑：根据 app 自动检索

```typescript
// src/core/agent/agent.ts - Agent.run() 方法

// 新：根据 app 自动检索所有关联知识库
if (this.knowledgeBase && orchestratedContext.app) {
  const query = task || orchestratedContext.originalTask || '';

  // 1. 获取 app 关联的所有知识库
  const collections = await getAppKnowledgeCollections(
    this.sessionId,  // 作为 tenantId
    orchestratedContext.app
  );

  // 2. 从多个知识库并行检索
  if (collections.length > 0) {
    const knowledgePromises = collections.map(collection =>
      this.knowledgeBase.retrieve(
        this.sessionId,
        collection.collectionName,
        query,
        { limit: 5, threshold: 0.7 }
      ).then(results => results.map(entry => ({
        ...entry,
        collectionName: collection.collectionName,
        priority: collection.priority
      })))
    );

    const allResults = await Promise.all(knowledgePromises);
    const allKnowledge = allResults.flat();

    // 3. 按优先级和相似度排序
    const sortedKnowledge = allKnowledge.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.similarity || 0) - (a.similarity || 0);
    });

    // 4. 注入到 PTC 上下文
    if (sortedKnowledge.length > 0) {
      ptcOptions.knowledge = sortedKnowledge;
      console.log(`[Agent ${this.sessionId}] Retrieved ${sortedKnowledge.length} knowledge entries from ${collections.length} collections`);
    }
  }
}
```

#### 3.3 新增辅助函数

```typescript
// src/core/knowledge/app-knowledge-manager.ts

/**
 * 获取 App 关联的知识库列表
 */
export async function getAppKnowledgeCollections(
  tenantId: string,
  appId: string
): Promise<AppKnowledgeMapping[]> {
  const query = `
    SELECT
      app_id,
      tenant_id,
      collection_name,
      enabled,
      priority
    FROM app_knowledge_mappings
    WHERE tenant_id = $1
      AND app_id = $2
      AND enabled = TRUE
    ORDER BY priority ASC
  `;

  const result = await pool.query(query, [tenantId, appId]);
  return result.rows;
}

export interface AppKnowledgeMapping {
  app_id: string;
  tenant_id: string;
  collection_name: string;
  enabled: boolean;
  priority: number;
}
```

---

### 4. 提交任务接口改动

#### 4.1 agent-api.step.ts inputSchema

**无需改动**，已经支持：
- `app`: 应用标识（已有字段）
- `environment.knowledgeCollection`: 可选，向后兼容

#### 4.2 执行逻辑

```typescript
// 根据 app 自动检索关联知识库
if (this.knowledgeBase && orchestratedContext.app) {
  const query = task || orchestratedContext.originalTask || '';

  // 获取 app 关联的知识库
  const collections = await getAppKnowledgeCollections(
    this.sessionId,
    orchestratedContext.app
  );

  // 从所有知识库并行检索
  if (collections.length > 0) {
    const knowledgePromises = collections.map(collection =>
      this.knowledgeBase.retrieve(
        this.sessionId,
        collection.collection_name,
        query,
        { limit: 5, threshold: 0.7 }
      )
    );

    const allResults = await Promise.all(knowledgePromises);
    // ... 合并和排序
  }
}
```

---

### 5. 类型定义改动

```typescript
// src/core/agent/types.ts

export interface AgentConfig {
  // ... 其他字段 ...

  /** Knowledge Base configuration for RAG */
  knowledgeBase?: {
    db: { /* ... */ },
    apiKey: string,
    baseURL?: string,
    embeddingModel?: string,
    embeddingDimensions?: number,
  };
}

// OrchestratedContext 已经有 app 字段，无需改动
export interface OrchestratedContext {
  app?: string;
  // ...
}
```

---

### 6. 实施清单

#### 新增文件
1. `src/core/knowledge/app-knowledge-manager.ts` - App-Knowledge 关联管理
2. `scripts/setup-app-knowledge-mappings.ts` - 数据库表初始化脚本
3. `steps/api/app-knowledge-collections-api.step.ts` - API 端点

#### 修改文件
1. `src/core/agent/agent.ts` - Agent.run() 方法，添加自动检索逻辑
2. `src/core/agent/types.ts` - 无需大改动，确认字段存在

#### 文档更新
1. `CLAUDE.md` - 更新测试流程说明
2. `docs/KNOWLEDGE_BASE_GUIDE.md` - 添加 App-Knowledge 配置说明

---

### 7. 测试场景

#### 场景1：MyEcho 配置多个知识库

```bash
# 1. 配置知识库
POST /api/apps/myecho/knowledge-collections/batch
{
  "tenantId": "echo-abc123",
  "collections": [
    {"collectionName": "product-docs", "enabled": true, "priority": 0},
    {"collectionName": "support-docs", "enabled": true, "priority": 1},
    {"collectionName": "girlfriend-personality", "enabled": true, "priority": 0}
  ]
}

# 2. 提交任务（自动检索）
POST /agent/execute
{
  "task": "如何重置密码？",
  "app": "myecho",
  "sessionId": "echo-abc123"
}

# 结果：自动从 product-docs 和 support-docs 中检索
```

---

### 8. 实施优先级

#### Phase 1: 核心功能
1. 创建 `app_knowledge_mappings` 表
2. 实现 `getAppKnowledgeCollections()` 函数
3. 修改 `Agent.run()` 自动检索逻辑

#### Phase 2: API 端点
1. 知识库配置 API
2. 批量配置 API
3. 删除知识库 API

#### Phase 3: 增强功能
1. 前端管理界面
2. 知识库使用统计
3. 智能推荐知识库

---

## 总结

### 核心改动
1. **数据库**：新增 `app_knowledge_mappings` 表
2. **Agent 逻辑**：根据 `app` 自动检索多个知识库
3. **API**：提供知识库配置管理接口

### 用户体验提升
- ✅ 一次配置，多次使用
- ✅ 自动检索，无需手动指定
- ✅ 支持多知识库并行检索
- ✅ 优先级控制结果排序
- ✅ 可禁用某个知识库而不删除关联

### 设计原则
- **自动化**：减少手动配置
- **灵活性**：支持不同场景配置
- **多租户**：完整的租户隔离
