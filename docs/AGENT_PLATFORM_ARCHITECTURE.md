# Agent 平台架构设计文档

> **文档目的**: 明确 MyAgent（Agent 中台）与上层应用（如智能研发平台）的边界，定义 MyAgent 需要补充的通用能力

## 📋 目录

- [1. 架构边界](#1-架构边界)
- [2. MyAgent 需要补充的通用能力](#2-myagent-需要补充的通用能力)
- [3. 实施路线图](#3-实施路线图)
- [4. 附录：讨论记录](#4-附录讨论记录)

---

## 1. 架构边界

### 1.1 两层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    上层应用：智能研发平台                          │
│                   (独立 Git 仓库: dev-platform)                   │
├─────────────────────────────────────────────────────────────────┤
│  职责：                                                           │
│  - 项目管理逻辑（项目创建、任务分解、进度跟踪）                    │
│  - 业务数据模型（Project、Team、Task）                            │
│  - 领域知识库（UX原则、编码规范、测试策略）                        │
│  - 用户界面（项目配置、任务监控、Agent对话）                       │
│  - 业务规则（质量检查标准、审核流程）                              │
│  - API 端点（/api/projects、/api/tasks）                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ 调用
┌─────────────────────────────────────────────────────────────────┐
│                    MyAgent（Agent 中台）                           │
│                   (现有仓库: myagent)                              │
├─────────────────────────────────────────────────────────────────┤
│  职责：                                                           │
│  - Agent 运行时（Agent、MasterAgent、SoulAgent）                   │
│  - Subagent 管理（定义、加载、委派）                               │
│  - Workflow 引擎（预定义流程、并行/串行执行）                      │
│  - 通用能力（知识库、验证器、人工干预）                            │
│  - 基础 API（/agent/execute、/api/agents、/api/workflows）        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Subagent 的定位

**Subagent 就应该简单直接，不需要"渐进式披露"：**

```yaml
# subagents/product-manager/agent.yaml
name: product-manager
description: 产品经理

agent:
  system_prompt: |
    你是产品经理，擅长需求分析、用户故事编写

  available_skills:
    - tool-read        # 直接用 myagent 的 skills
    - tool-write
    - web-search
    # ... 不需要"渐进式披露"
```

**关键原则：**
- ✅ 定义清楚能做什么
- ✅ 直接使用 myagent 的 skills
- ❌ 不需要复杂的 prompts/knowledge-base.md
- ❌ 不需要子目录 skill 定义

### 1.3 边界划分

| 能力 | 归属 | 原因 |
|------|------|------|
| **产品设计知识库**（UX 原则、设计模式） | 上层应用 | 只对"研发平台"有用 |
| **编码规范知识库**（Google Style Guide） | 上层应用 | 只对"代码审查"有用 |
| **项目管理逻辑**（任务分解、进度跟踪） | 上层应用 | 业务逻辑，每个应用不同 |
| **组织架构管理**（团队配置、成员管理） | 上层应用 | 业务数据模型 |
| **知识库管理能力**（RAG 检索） | MyAgent | 所有 Agent 都需要"读知识" |
| **输出验证器**（Schema、完整性） | MyAgent | 所有 Agent 输出都需要验证 |
| **人工干预机制**（HITL） | MyAgent | 安全可控的 Agent 系统都需要 |

---

## 2. MyAgent 需要补充的通用能力

### 2.0 错误处理与救援策略

**核心原则**: 所有可能失败的代码路径都必须有明确的错误处理策略，不允许静默失败。

#### 错误处理注册表

| 代码路径 | 可能的错误 | 异常类 | 是否救援 | 救援动作 | 用户看到 |
|---------|-----------|--------|---------|---------|---------|
| `KnowledgeBase.retrieve()` | 向量数据库超时 | `VectorDBTimeoutError` | ✅ YES | 重试 2x，降级到无知识模式 | "知识库暂时不可用，使用通用模式" |
| `KnowledgeBase.retrieve()` | 检索返回空结果 | `EmptyResultError` | ✅ YES | 记录日志，继续执行（降级） | 无（静默降级） |
| `KnowledgeBase.retrieve()` | Collection 不存在 | `CollectionNotFoundError` | ✅ YES | 返回空结果，记录警告 | "指定的知识库不存在" |
| `KnowledgeBase.addKnowledge()` | 批量插入部分失败 | `PartialInsertError` | ✅ YES | 重试失败项，返回成功/失败详情 | "部分知识添加失败，已重试" |
| `KnowledgeBase.addKnowledge()` | 向量化失败 | `EmbeddingError` | ✅ YES | 跳过该文档，记录错误 | "部分文档无法向量化" |
| `ValidationHook.onTaskComplete()` | Schema 验证失败 | `ValidationError` | ✅ YES | 记录详细错误，触发降级策略 | "输出格式不正确，已简化输出" |
| `ValidationHook.onTaskComplete()` | 完整性检查失败 | `CompletenessError` | ✅ YES | 记录缺失字段，标记为部分成功 | "输出不完整，缺少：xxx" |
| `InterventionHook.waitForHumanDecision()` | 等待超时 | `InterventionTimeoutError` | ✅ YES | 记录超时，执行默认策略 | "等待人工审核超时，已自动处理" |
| `InterventionHook.waitForHumanDecision()` | 队列满 | `InterventionQueueFullError` | ✅ YES | 拒绝请求，建议稍后重试 | "审核队列繁忙，请稍后重试" |
| `Agent.run()` (知识注入) | Prompt 长度超限 | `PromptTooLongError` | ✅ YES | 截断知识，仅保留最相关的 K=3 | "知识内容过多，已精简" |
| `Agent.run()` (知识注入) | 注入后 Prompt 仍然过长 | `PromptExceedsLimitError` | ✅ YES | 降级到无知识模式，记录警告 | "知识内容过长，已跳过" |

**救援模式**:
- **重试**: 网络超时、临时性故障（最多 2 次）
- **降级**: 功能不可用时，提供简化的替代方案
- **阻断**: 严重错误（数据损坏、安全威胁）时阻止执行
- **静默**: 非关键路径失败，记录日志但不影响主流程

---

### 2.1 知识库管理 🔴 P0

**为什么需要？**
- 所有 Agent 都需要"读知识"，只是知识内容不同
- MyAgent 提供**能力**，**知识内容**由上层应用提供
- 无法通过 Hook 实现（需要在 Agent.run() 中修改 task 内容）

**核心功能：**
```typescript
class KnowledgeBase {
  /**
   * 检索相关知识（通用）
   */
  async retrieve(
    collection: string,  // 知识集合（由上层应用定义）
    query: string,
    options: { topK?: number; filter?: Record<string, any> }
  ): Promise<KnowledgeChunk[]>

  /**
   * 添加知识（通用）
   */
  async addKnowledge(
    collection: string,
    documents: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<void>
}
```

**集成到 Agent 执行流程：**
```typescript
class Agent {
  private knowledgeBase?: KnowledgeBase;

  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    // ⭐ 自动检索知识并注入
    if (this.knowledgeBase && context?.knowledgeCollection) {
      const knowledge = await this.knowledgeBase.retrieve(
        context.knowledgeCollection,
        task,
        { topK: 5 }
      );
      task = this.injectKnowledge(task, knowledge);
    }

    // ... 正常执行
  }
}
```

**使用示例（上层应用）：**
```typescript
// 添加知识
await knowledgeBase.addKnowledge('product-design', [
  { content: 'UX 设计原则：F-pattern...', metadata: { domain: 'ux' } },
  { content: '移动端设计规范...', metadata: { domain: 'mobile' } }
]);

// Agent 执行时自动检索
await agent.run('设计电商购物车', {
  knowledgeCollection: 'product-design'  // ← 指定知识库
});
```

**实现工作量：** 1-2 周
- 集成 pgvector 或 ChromaDB
- 实现 KnowledgeBase 类
- 在 Agent.run() 中集成 RAG 检索
- 提供配置接口

---

### 2.1.1 安全威胁模型

**威胁分析**:

| 威胁 | 可能性 | 影响 | 是否缓解 | 缓解策略 |
|-----|-------|------|---------|---------|
| **知识库注入攻击** | High | High | ✅ YES | 添加知识时验证内容（过滤 XSS、SQL 注入、恶意脚本） |
| **跨租户知识访问** | High | High | ✅ YES | Collection 命名空间隔离（`tenantId:collectionName`）+ ACL 验证 |
| **干预决策伪造** | Medium | High | ✅ YES | 签名验证干预请求（HMAC），使用 API Secret |
| **RAG 检索污染** | Medium | Medium | ✅ YES | 限制返回结果数量（topK ≤ 10），结果相关性评分过滤 |
| **验证器绕过** | Low | High | ✅ YES | 强制验证，不允许 opt-out，验证失败必须抛出异常 |
| **Prompt 注入** | Medium | Medium | ✅ YES | 知识内容转义，特殊字符过滤 |
| **DoS 攻击（大量检索）** | Medium | Medium | ✅ YES | 速率限制（每分钟最多 N 次检索） |

**安全实现要点**:

```typescript
// 1. 知识库添加时的验证
class KnowledgeBase {
  async addKnowledge(collection: string, documents: Document[]) {
    // ✅ 验证 collection 名称（防止路径遍历）
    if (!/^[a-zA-Z0-9:_-]+$/.test(collection)) {
      throw new InvalidCollectionNameError(collection);
    }

    // ✅ 验证文档内容（过滤恶意脚本）
    const sanitized = documents.map(doc => ({
      ...doc,
      content: this.sanitizeContent(doc.content)
    }));
  }

  private sanitizeContent(content: string): string {
    // 移除 HTML 标签、脚本标签、SQL 注入模式
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/('|--|;|\bDROP\b|\bDELETE\b|\bEXEC\b)/gi, '');
  }
}

// 2. Collection 隔离
async retrieve(collection: string, query: string) {
  // ✅ 验证访问权限
  const tenantId = context.tenantId;
  const fullCollection = `${tenantId}:${collection}`;

  // ✅ 检查 ACL
  if (!await this.acl.canRead(tenantId, collection)) {
    throw new AccessDeniedError(tenantId, collection);
  }
}

// 3. 人工干预签名验证
class InterventionHook {
  async requestIntervention(taskId: string, output: any) {
    const payload = JSON.stringify({ taskId, output });
    const signature = hmacSha256(payload, API_SECRET);

    // ✅ 签名验证
    await api.post('/api/intervention/request', {
      payload,
      signature,
      timestamp: Date.now()
    });
  }
}
```

---

### 2.1.2 边缘情况处理

**知识注入流程**:

```
INPUT: task + knowledgeCollection
  │
  ▼
VALIDATION: collection 是否存在？
  │
  ├─ [NO] → ✅ 记录警告，降级到无知识模式，继续执行
  │
  ▼
RETRIEVE: 向量检索
  │
  ├─ [DB 超时] → ✅ 重试 2x，仍失败则降级到无知识模式
  ├─ [返回空] → ✅ 记录日志，继续执行（降级）
  ├─ [检索结果 > topK] → ✅ 截断到 topK，记录日志
  │
  ▼
INJECT: 注入知识到 prompt
  │
  ├─ [Prompt 太长 > 8K tokens] → ✅ 减少 K 到 3，重试
  ├─ [仍然太长] → ✅ 降级到无知识模式
  │
  ▼
EXECUTE: LLM 生成
```

**人工干预流程**:

```
INPUT: 请求干预
  │
  ▼
QUEUE: 加入干预队列
  │
  ├─ [队列满 > 100] → ✅ 拒绝请求，返回 429，建议稍后重试
  │
  ▼
WAIT: 等待人工决策
  │
  ├─ [超时 > 30min] → ✅ 执行默认策略（拒绝或降级），记录超时
  ├─ [人工离线] → ✅ 发送通知（邮件/Webhook），继续等待
  │
  ▼
DECISION: 处理决策
  │
  ├─ [无效决策] → ✅ 拒绝，提示有效选项
  ├─ [决策丢失] → ✅ 重试查询，最多 3 次
  │
  ▼
EXECUTE: 执行决策
```

---

### 2.1.3 测试策略

**测试金字塔**:

```
           /\
          /  \
         / E2E \         ← 少量端到端测试（完整流程）
        /--------\
       /          \
      / Integration \    ← 中等集成测试（知识库 + Agent）
     /--------------\
    /                  \
   / Unit Tests         \  ← 大量单元测试（各个函数）
  /----------------------\
```

**测试覆盖清单**:

#### 知识库管理
```typescript
describe('KnowledgeBase', () => {
  // ✅ Happy Path
  it('should retrieve relevant knowledge')
  it('should add knowledge successfully')
  it('should update existing knowledge (upsert)')

  // ✅ Error Paths
  it('should retry on timeout and fallback')
  it('should handle empty results gracefully')
  it('should handle non-existent collection')
  it('should handle partial insertion failure')

  // ✅ Edge Cases
  it('should handle very long query (> 1000 chars)')
  it('should handle special characters in query')
  it('should handle concurrent retrieval requests')
  it('should truncate results when topK exceeded')

  // ✅ Security
  it('should reject injection attempts in content')
  it('should enforce collection name validation')
  it('should enforce ACL (access control)')

  // ✅ Performance
  it('should complete retrieval within 200ms p99')
  it('should handle 1000 concurrent requests')
});
```

#### 输出验证器
```typescript
describe('ValidationHook', () => {
  // ✅ Happy Path
  it('should validate correct schema')
  it('should check completeness successfully')

  // ✅ Error Paths
  it('should handle schema validation failure')
  it('should handle completeness check failure')
  it('should retry on recoverable errors')

  // ✅ Edge Cases
  it('should handle missing optional fields')
  it('should handle null/undefined values')
  it('should handle circular references in output')

  // ✅ Performance
  it('should complete validation within 50ms p99')
});
```

#### 人工干预
```typescript
describe('InterventionHook', () => {
  // ✅ Happy Path
  it('should request intervention successfully')
  it('should handle human approval')
  it('should handle human rejection')

  // ✅ Error Paths
  it('should handle timeout (30min)')
  it('should handle queue full')
  it('should handle invalid decision')

  // ✅ Edge Cases
  it('should handle concurrent intervention requests')
  it('should handle priority ordering')
  it('should handle intervention during retry loop'

  // ✅ Security
  it('should verify HMAC signature')
  it('should reject replay attacks')

  // ✅ Integration
  it('should integrate with Workflow engine')
});
```

**性能基准测试**:

```typescript
describe('Performance Benchmarks', () => {
  it('Knowledge retrieval p99 < 200ms', async () => {
    const durations = [];
    for (let i = 0; i < 1000; i++) {
      const start = Date.now();
      await kb.retrieve('test', 'query');
      durations.push(Date.now() - start);
    }
    durations.sort((a, b) => a - b);
    expect(durations[990]).toBeLessThan(200); // p99
  });

  it('Validation p99 < 50ms', async () => {
    // 类似的基准测试
  });
});
```

**故障注入测试**:

```typescript
describe('Chaos Tests', () => {
  it('should survive database connection loss', async () => {
    await mockDatabase.disconnect();
    const result = await agent.run('test');
    expect(result).toHaveProperty('fallbackUsed', true);
  });

  it('should survive intervention service timeout', async () => {
    await mockInterventionService.timeout();
    const result = await agent.run('test');
    expect(result).toHaveProperty('timedOut', true);
  });
});
```

---

### 2.2 输出验证器 🔴 P0

**为什么需要？**
- 所有 Agent 输出都需要"验证"（Schema、完整性）
- 验证的是**Agent 输出**，不是 Skill 输出

**可以通过 Hook 扩展：**
```typescript
// hooks/validation-hook.ts
export class ValidationHook {
  async onTaskComplete(result: AgentResult, context: any) {
    if (context.agentType === 'product-manager') {
      const validation = await this.validator.validate(result.output, [
        new SchemaValidator(ProductOutputSchema),
        new CompletenessValidator(['userStories', 'personas'])
      ]);

      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }
  }
}
```

**预定义验证器：**
- `SchemaValidator`: Zod/JSON Schema 验证
- `CompletenessValidator`: 检查必填字段
- `FormatValidator`: 格式验证（URL、Email 等）
- `CustomValidator`: 自定义验证逻辑

**实现工作量：** 3-5 天
- 实现 Validator 接口
- 提供预定义验证器
- 通过 Hook 扩展
- 在 agent.yaml 中注册

---

### 2.3 人工干预机制 🔴 P0

**为什么需要？**
- 安全可控的 Agent 系统都需要"人工审核"
- 主要用于 Workflow 阶段级别和 Agent 执行后的干预

**可以通过 Hook 扩展：**
```typescript
// hooks/intervention-hook.ts
export class InterventionHook {
  async onTaskStart(task: string, taskId: string, context: any) {
    // 执行前检查
    if (await this.requiresHumanReview(context)) {
      const decision = await this.waitForHumanDecision(taskId);
      if (decision.action === 'block') {
        throw new Error('Blocked by human intervention');
      }
    }
  }

  async onTaskComplete(result: AgentResult, context: any) {
    // 执行后检查
    if (result.estimatedQuality < 0.7) {
      const decision = await this.requestHumanReview(result);
      if (decision.action === 'retry') {
        // 重试逻辑
      }
    }
  }
}
```

**干预点：**
- Workflow 阶段级别（通过 workflow.yaml 配置）
- Agent 执行前（onTaskStart Hook）
- Agent 执行后（onTaskComplete Hook）

**实现工作量：** 3-5 天
- 实现干预管理逻辑
- 提供 API 端点（/api/intervention/request、/api/intervention/approve）
- 通过 Hook 扩展
- 集成到 Workflow 引擎

---

### 2.4 自定义融合策略 🟡 P1

**当前状态：**
- MasterAgent 已有 `synthesizeResults` 方法
- 只支持 LLM 综合一种策略

**扩展方案（通过 Hook）：**
```typescript
// hooks/custom-fusion-hook.ts
export class CustomFusionHook {
  async onTaskComplete(result: AgentResult, context: any) {
    if (context.enableCustomFusion) {
      // 自定义融合逻辑
      const fused = await this.customFuse(result);
      result.output = fused;
    }
  }
}
```

**是否需要：**
- ❌ 当前 LLM 综合已够用
- ✅ 如果未来需要其他策略（merge、concat、vote），再扩展

**实现工作量：** 2-3 天（按需实现）

---

### 2.5 并行委派 🟡 P1

**当前状态：**
- MasterAgent 支持委派给单个 subagent
- 不支持同时委派给多个 subagent

**需求场景：**
```typescript
// 同时委派给 3 个 subagent
await masterAgent.run('设计电商系统', undefined, {
  delegateTo: ['product-manager', 'ui-designer', 'tech-lead'],
  mode: 'parallel'  // ← 并行执行
});
```

**是否需要：**
- 🟡 可选功能，可以用 Promise.all 替代
- ✅ 如果需要统一的结果管理，再实现

**实现工作量：** 3-5 天（按需实现）

---

### 2.6 向量数据库配置（pgvector）✅

**决策：使用 pgvector（PostgreSQL 扩展）**

**决策依据：**
1. ✅ 项目已有 PostgreSQL，复用现有基础设施
2. ✅ 知识库数据与应用数据统一管理，便于备份和迁移
3. ✅ 部署和运维更简单，无需额外服务
4. ✅ TypeScript 支持成熟（`pg` + `pgvector`）

---

#### 2.6.1 数据库安装

**PostgreSQL 扩展安装：**

```sql
-- 1. 安装 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 验证安装
SELECT * FROM pg_extension WHERE extname = 'vector';
```

**Node.js 依赖：**

```bash
npm install pg
npm install --save-dev @types/pg
```

---

#### 2.6.2 数据库表设计

**知识库表结构：**

```sql
-- 知识表
CREATE TABLE knowledge (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,        -- 租户隔离
  collection_name VARCHAR(255) NOT NULL,  -- 集合名称
  content TEXT NOT NULL,                  -- 知识内容
  metadata JSONB,                         -- 元数据（可选）
  embedding vector(1536),                 -- 向量（OpenAI: 1536 维）
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 复合索引：租户 + 集合
CREATE INDEX idx_knowledge_tenant_collection
  ON knowledge(tenant_id, collection_name);

-- 向量索引（IVFFlat，适合 < 1M 行）
CREATE INDEX idx_knowledge_embedding_ivfflat
  ON knowledge
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 或使用 HNSW 索引（适合 > 1M 行，性能更好但占用更多内存）
-- CREATE INDEX idx_knowledge_embedding_hnsw
--   ON knowledge
--   USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);

-- 唯一约束：防止重复插入
CREATE UNIQUE INDEX idx_knowledge_unique
  ON knowledge(tenant_id, collection_name, MD5(content));
```

**参数说明：**
- `vector(1536)`: 向量维度（OpenAI `text-embedding-3-small` = 1536）
- `vector_cosine_ops`: 余弦相似度（推荐）或 `vector_l2_ops`（欧氏距离）
- `lists = 100`: IVFFlat 参数，通常设置为 √(行数)
- `m = 16, ef_construction = 64`: HNSW 参数，平衡性能和内存

---

#### 2.6.3 TypeScript 实现

**KnowledgeBase 类实现：**

```typescript
// src/core/knowledge/knowledge-base.ts
import { Client, ClientConfig, QueryResult } from 'pg';
import { OpenAI } from 'openai';

interface Knowledge {
  id: number;
  tenantId: string;
  collectionName: string;
  content: string;
  metadata?: Record<string, any>;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeInsert {
  content: string;
  metadata?: Record<string, any>;
}

export class KnowledgeBase {
  private db: Client;
  private openai: OpenAI;
  private embeddingCache = new Map<string, number[]>();

  constructor(config: { db: ClientConfig; openaiApiKey: string }) {
    this.db = new Client(config.db);
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async connect(): Promise<void> {
    await this.db.connect();
  }

  async disconnect(): Promise<void> {
    await this.db.end();
  }

  /**
   * 添加知识到集合
   */
  async addKnowledge(
    tenantId: string,
    collectionName: string,
    documents: KnowledgeInsert[]
  ): Promise<{ inserted: number; failed: number; errors: string[] }> {
    const results = { inserted: 0, failed: 0, errors: [] as string[] };

    // 1. 验证集合名称（防止路径遍历）
    if (!/^[a-zA-Z0-9:_-]+$/.test(collectionName)) {
      throw new Error(`Invalid collection name: ${collectionName}`);
    }

    // 2. 批量向量化（使用 OpenAI API）
    const texts = documents.map(doc => doc.content);
    const embeddings = await this.embedBatch(texts);

    // 3. 批量插入（使用事务）
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const embedding = embeddings[i];

        const query = `
          INSERT INTO knowledge (tenant_id, collection_name, content, metadata, embedding)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, collection_name, MD5(content))
          DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = NOW()
          RETURNING id
        `;

        try {
          await client.query(query, [
            tenantId,
            collectionName,
            this.sanitizeContent(doc.content),
            JSON.stringify(doc.metadata || {}),
            JSON.stringify(embedding),
          ]);
          results.inserted++;
        } catch (err) {
          results.failed++;
          results.errors.push((err as Error).message);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return results;
  }

  /**
   * 检索相关知识（RAG）
   */
  async retrieve(
    tenantId: string,
    collectionName: string,
    query: string,
    options: { topK?: number; scoreThreshold?: number } = {}
  ): Promise<Knowledge[]> {
    const { topK = 5, scoreThreshold = 0.7 } = options;

    // 1. 向量化查询
    const queryEmbedding = await this.embedQuery(query);

    // 2. 向量搜索（余弦相似度）
    const searchQuery = `
      SELECT
        id,
        tenant_id AS "tenantId",
        collection_name AS "collectionName",
        content,
        metadata,
        embedding,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        1 - (embedding <=> $1::vector) AS similarity
      FROM knowledge
      WHERE tenant_id = $2
        AND collection_name = $3
        AND 1 - (embedding <=> $1::vector) > $4
      ORDER BY embedding <=> $1::vector
      LIMIT $5
    `;

    const result = await this.db.query(searchQuery, [
      JSON.stringify(queryEmbedding),
      tenantId,
      collectionName,
      scoreThreshold,
      topK,
    ]);

    return result.rows;
  }

  /**
   * 向量化查询（带缓存）
   */
  private async embedQuery(query: string): Promise<number[]> {
    // 检查缓存（TTL = 5 分钟）
    const cached = this.embeddingCache.get(query);
    if (cached) {
      return cached;
    }

    // 调用 OpenAI Embedding API
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const embedding = response.data[0].embedding;

    // 缓存结果
    this.embeddingCache.set(query, embedding);

    // 5 分钟后清除缓存
    setTimeout(() => {
      this.embeddingCache.delete(query);
    }, 5 * 60 * 1000);

    return embedding;
  }

  /**
   * 批量向量化（优化性能）
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    return response.data.map(item => item.embedding);
  }

  /**
   * 内容净化（防止注入攻击）
   */
  private sanitizeContent(content: string): string {
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')  // 移除脚本标签
      .replace(/<[^>]+>/g, '')                     // 移除 HTML 标签
      .replace(/('|--|;|\bDROP\b|\bDELETE\b|\bEXEC\b)/gi, ''); // 移除 SQL 注入模式
  }
}
```

---

#### 2.6.4 使用示例

**初始化：**

```typescript
import { KnowledgeBase } from './src/core/knowledge/knowledge-base';

const kb = new KnowledgeBase({
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  openaiApiKey: process.env.OPENAI_API_KEY,
});

await kb.connect();
```

**添加知识：**

```typescript
const result = await kb.addKnowledge('tenant-123', 'product-docs', [
  {
    content: 'MyAgent 是一个分布式 AI Agent 平台',
    metadata: { category: 'introduction', version: '1.0' },
  },
  {
    content: 'Motia 是事件驱动框架',
    metadata: { category: 'framework', version: '1.0' },
  },
]);

console.log(`插入成功: ${result.inserted}, 失败: ${result.failed}`);
```

**检索知识（RAG）：**

```typescript
const results = await kb.retrieve('tenant-123', 'product-docs', '什么是 MyAgent？', {
  topK: 3,
  scoreThreshold: 0.7,
});

console.log('相关知识:', results.map(r => ({
  content: r.content,
  similarity: r.similarity,
})));
```

---

#### 2.6.5 性能优化

**1. 向量索引选择：**

| 索引类型 | 适用场景 | 构建速度 | 查询速度 | 内存占用 |
|---------|---------|---------|---------|---------|
| **IVFFlat** | < 1M 行 | 快 | 中 | 低 |
| **HNSW** | > 1M 行 | 慢 | 快 | 高 |

**2. 连接池配置：**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,              // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**3. 批量操作优化：**

```typescript
// 批量插入（使用 COPY 命令，更快）
async bulkAddKnowledge(tenantId: string, collectionName: string, documents: KnowledgeInsert[]) {
  // TODO: 实现 COPY 协议批量导入
}
```

---

#### 2.6.6 监控指标

**关键指标：**
- 知识检索延迟（p50, p99）< 200ms
- 向量化 API 调用次数/失败率
- 缓存命中率
- 数据库连接池使用率

**Grafana Dashboard 配置：**
```promql
-- 向量搜索延迟
pg_stat_statements.mean_exec_time WHERE query LIKE '%vector%'

-- 知识表大小
pg_database_size('myagent') WHERE tablename = 'knowledge'

-- 向量索引使用率
pg_stat_user_indexes.idx_scan WHERE indexname LIKE '%embedding%'
```

---

## 3. 实施路线图

### Phase 1: 核心能力（3周，调整后）

```
Week 1: 基础设施 + KnowledgeBase 类
├── ✅ 向量数据库决策：**pgvector**（已选）
│   ├── 决策依据：复用现有 PostgreSQL，降低运维复杂度
│   ├── 安装：PostgreSQL 扩展 `CREATE EXTENSION vector;`
│   ├── Node.js：`npm install pg`
│   └── 详见下方「向量数据库配置」
├── 集成向量数据库
│   ├── 创建知识表（向量列 + 元数据）
│   ├── 建立向量索引（IVFFlat 或 HNSW）
│   └── 连接池配置
├── 实现 KnowledgeBase 类
│   ├── retrieve() - 向量检索 + 错误处理 + 重试逻辑
│   ├── addKnowledge() - 批量插入 + 幂等性保证
│   ├── embedQuery() - 向量化 + 缓存
│   └── 安全防护（注入过滤、ACL 验证）
└── 单元测试

Week 2: Agent 集成 + 安全加固
├── 在 Agent.run() 中集成 RAG 检索
│   ├── 自动检索知识
│   ├── 注入知识到 prompt
│   ├── 降级策略（无知识模式）
│   └── 边缘情况处理（collection 不存在、Prompt 太长）
├── 安全加固
│   ├── Collection 隔离（tenantId 命名空间）
│   ├── ACL 验证
│   ├── 内容净化（XSS/注入过滤）
│   └── 速率限制（防 DoS）
└── 集成测试 + 安全测试

Week 3: 性能优化 + 测试验证
├── 性能优化
│   ├── 添加缓存（LRU cache, TTL=5min）
│   ├── 批量检索优化
│   ├── 异步预取（predictive prefetch）
│   └── 并行化（RAG 检索与 LLM 生成 pipeline）
├── 性能测试
│   ├── 建立性能基准（p99 < 200ms）
│   ├── 压力测试（1000 并发）
│   └── 性能回归检测
├── 故障注入测试
│   ├── DB 连接丢失
│   ├── DB 超时
│   └── 网络分区
└── 文档 + 部署准备
    ├── API 文档
    ├── 部署指南
    └── 监控配置
```

**时间调整说明**:
- 原估算：2 周 → 调整为：**3 周**
- 原因：补充了安全加固、性能优化、故障测试等必要工作
- 风险降低：从 HIGH 降为 MEDIUM
```

### Phase 2: 扩展能力（1-2 周）

```
Week 3-4: 通过 Hook 扩展
├── 实现验证器 Hook
│   ├── SchemaValidator
│   ├── CompletenessValidator
│   └── CustomValidator
├── 实现人工干预 Hook
│   ├── onTaskStart 干预
│   ├── onTaskComplete 干预
│   └── API 端点
├── 实现自定义融合 Hook
│   └── CustomFusionHook
└── 文档和示例
    ├── Hook 使用指南
    └── 扩展开发指南
```

### Phase 3: 增强能力（按需）

```
Week 5+: 并行委派（如果需要）
├── 扩展 MasterAgent 支持多 subagent 并行
├── 实现结果合并策略
└── 测试验证
```

---

## 4. 附录：讨论记录

### 4.1 关键决策

**决策 1: Subagent 不需要渐进式披露**
- Subagent 就应该简单直接
- 定义清楚能做什么，直接用
- 不需要复杂的 prompts/knowledge-base.md

**决策 2: 验证器验证 Agent 输出，不是 Skill 输出**
- Skill 输出太底层、太多样（文件内容、命令输出）
- Agent 输出是业务层面的，可以验证结构和完整性
- 可以通过 onTaskComplete Hook 实现

**决策 3: 知识库管理必须修改核心**
- 无法通过 Hook 实现
- 需要在 Agent.run() 的早期阶段介入
- 需要修改 task 内容后传递给 LLM

**决策 4: 不需要独立的并行执行引擎**
- MasterAgent 委派已够用
- 独立并行可用 Promise.all
- 未来如果需要，再扩展 MasterAgent 支持并行委派

### 4.2 架构图

**上层应用调用 MyAgent 的方式：**

```typescript
// 上层应用：智能研发平台

// 1. 准备知识库
await knowledgeBase.addKnowledge('product-design', [
  { content: 'UX 设计原则：F-pattern...' },
  { content: '移动端设计规范...' }
]);

// 2. 配置 Agent 验证规则
const validationConfig = {
  'product-manager': [
    new SchemaValidator(ProductOutputSchema),
    new CompletenessValidator(['userStories', 'personas'])
  ]
};

// 3. 调用 MyAgent API
const result = await fetch('/agent/execute', {
  method: 'POST',
  body: JSON.stringify({
    task: '设计电商购物车',
    sessionId: 'project-123',
    delegateTo: ['product-manager'],
    knowledgeCollection: 'product-design',  // ← 指定知识库
    enableValidation: true,                  // ← 启用验证
    enableIntervention: true                 // ← 启用人工干预
  })
});
```

### 4.3 API 设计

**知识库管理 API：**

```typescript
// 添加知识
POST /api/knowledge/:collection
Body: {
  documents: Array<{ content: string; metadata?: any }>
}

// 检索知识（内部使用，由 Agent 自动调用）
GET /api/knowledge/:collection/retrieve?query=xxx&topK=5
```

**人工干预 API：**

```typescript
// 请求人工干预
POST /api/intervention/request
Body: {
  taskId: string;
  stage: string;
  reason: string;
  output: any;
}

// 人工决策
POST /api/intervention/:id/decision
Body: {
  action: 'approve' | 'reject' | 'retry';
  feedback?: string;
}

// 查询待处理干预
GET /api/intervention/pending
```

---

## 📝 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2025-03-27 | v1.0 | 初始版本，基于架构讨论记录 |
| 2025-03-27 | v1.1 | **CEO 审查后补充**：
| | | - 添加完整的错误处理与救援策略表（11 个错误路径）
| | | - 添加安全威胁模型（7 个威胁 + 缓解策略）
| | | - 添加边缘情况处理流程图（知识注入 + 人工干预）
| | | - 添加详细的测试策略（单元、集成、性能、故障注入）
| | | - 调整 Phase 1 时间估算：2 周 → 3 周
| | | - 补充实施细节：安全加固、性能优化、监控配置 |
| 2025-03-28 | v1.2 | **向量数据库配置方案**：
| | | - ✅ 决策：选择 **pgvector**（PostgreSQL 扩展）
| | | - 添加完整的数据库表设计（向量索引、租户隔离）
| | | - 添加完整的 TypeScript 实现（KnowledgeBase 类）
| | | - 添加使用示例（初始化、添加知识、RAG 检索）
| | | - 添加性能优化建议（索引选择、连接池、批量操作）
| | | - 添加监控指标配置（Grafana Dashboard） |

---

## 🔗 相关文档

- [AGENTS.md](../AGENTS.md) - MyAgent 项目概览
- [docs/ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - 完整 4 层架构
- [docs/SYSTEM_CONCEPTS_OVERVIEW.md](./SYSTEM_CONCEPTS_OVERVIEW.md) - 核心概念详解
