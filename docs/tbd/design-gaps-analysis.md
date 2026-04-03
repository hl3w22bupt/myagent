# 设计完整性分析

**创建时间**: 2026-04-03
**目的**: 识别需要进一步设计的模块

---

## 📊 设计完整性评估

| 模块 | 设计完整度 | 实施准备度 | 需要补充设计 |
|------|-----------|-----------|-------------|
| **输出验证器** | 95% ✅ | 90% ✅ | 可直接开始实施 |
| **知识库管理** | 70% 🟡 | 60% 🟡 | 需补充实施细节 |
| **人工干预机制** | 50% 🔴 | 40% 🔴 | 需要详细设计 |
| **并行委派** | 30% 🔴 | 20% 🔴 | 需要完整设计 |
| **自定义融合** | 40% 🟡 | 30% 🟡 | 可延后（P1） |

---

## 1. 输出验证器 ✅ 可直接实施

**设计文档**: `docs/proposals/2026-03-29-add-validation-hook/`

### 已有的设计
- ✅ **详细设计决策**:
  - 使用 Zod 作为 Schema 验证库
  - 验证器接口设计（Validator, ValidationResult）
  - 验证失败策略（strict/fallback）
  - YAML 配置格式定义
- ✅ **风险分析**: 性能、维护性、降级策略
- ✅ **迁移计划**: 5 步部署流程
- ✅ **实施清单**: 10 个步骤，73 个子任务
- ✅ **测试策略**: 单元测试、集成测试、性能基准

### 缺少的部分（可忽略）
- ⚠️ 缺少 Zod Schema 与 YAML 的映射规则
  - **影响**: 实施时需要定义转换逻辑
  - **解决方案**: 实施时补充 `src/core/hook/validation/yaml-to-zod.ts`

### 建议
**可以直接开始实施**，设计文档已足够详细。实施过程中补充：
1. YAML Schema → Zod Schema 转换器设计
2. 预设的常见 Schema（UserStoryOutput, TaskOutput 等）

---

## 2. 知识库管理 🟡 需补充实施细节

**设计文档**: `docs/tbd/AGENT_PLATFORM_ARCHITECTURE.md` §2.1

### 已有的设计
- ✅ **核心功能**: KnowledgeBase.retrieve() 接口定义
- ✅ **集成方式**: Agent.run() 中的自动检索
- ✅ **安全威胁模型**: 6 种威胁分析
- ✅ **测试策略**: 单元测试、集成测试、性能基准
- ✅ **边缘情况处理**: 降级策略
- ✅ **实施路线图**: Phase 1 MVP（1 周）

### 缺少的设计（需要补充）

#### 2.1 API 接口设计

**当前状态**: 只有核心接口定义
**需要补充**:

```typescript
// 完整的 KnowledgeBase API 设计
interface KnowledgeBaseConfig {
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  embedding?: {
    provider: 'openai' | 'ollama';
    model: string;
    apiKey?: string;
    baseURL?: string;
    dimensions: number;
  };
}

class KnowledgeBase {
  // 初始化
  constructor(config: KnowledgeBaseConfig);

  // 核心方法
  async retrieve(
    collection: string,
    query: string,
    options: {
      topK?: number;
      scoreThreshold?: number;
      filter?: Record<string, any>;
    }
  ): Promise<KnowledgeChunk[]>;

  // 健康检查
  async healthCheck(): Promise<boolean>;

  // 清理（用于测试）
  async clear(): Promise<void>;
}

interface KnowledgeChunk {
  content: string;
  metadata?: Record<string, any>;
  similarity: number;
}
```

#### 2.2 配置文件格式

**当前状态**: 没有定义配置格式
**需要补充**:

```yaml
# config/knowledge-base.yaml

enabled: true

# PostgreSQL + pgvector 配置
db:
  host: localhost
  port: 5432
  database: myagent
  user: postgres
  password: ${DB_PASSWORD}
  max: 5

# Embedding 模型配置
embedding:
  provider: openai  # openai | ollama
  model: text-embedding-3-small
  apiKey: ${OPENAI_API_KEY}
  dimensions: 1536
  baseURL: https://api.openai.com/v1

# 检索配置
retrieval:
  defaultTopK: 5
  defaultScoreThreshold: 0.7
  maxTopK: 10
  cacheEnabled: true
  cacheTTL: 300  # 5 分钟

# 安全配置
security:
  enableACL: false
  enableRateLimit: true
  rateLimitPerMinute: 60
```

#### 2.3 数据库 Schema

**当前状态**: 没有定义表结构
**需要补充**:

```sql
-- 知识库表（支持多租户）
CREATE TABLE IF NOT EXISTS knowledge (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  collection_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding vector(1536),  -- pgvector 列
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 索引
  UNIQUE(tenant_id, collection_name, id)
);

-- 向量索引（IVFFlat）
CREATE INDEX ON knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 租户隔离索引
CREATE INDEX idx_knowledge_tenant_collection ON knowledge(tenant_id, collection_name);

-- ACL 表（如果启用）
CREATE TABLE IF NOT EXISTS knowledge_acl (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  collection_name VARCHAR(255) NOT NULL,
  permission VARCHAR(10) NOT NULL,  -- 'read' | 'write'
  subject_type VARCHAR(50) NOT NULL,  -- 'user' | 'role' | 'api_key'
  subject_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.4 错误处理规范

**当前状态**: 提到了降级策略，但没有具体的错误类型定义
**需要补充**:

```typescript
// 错误类型
export class KnowledgeBaseError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'KnowledgeBaseError';
  }
}

export class VectorDBTimeoutError extends KnowledgeBaseError {
  constructor(message: string) {
    super(message, 'VECTOR_DB_TIMEOUT');
  }
}

export class CollectionNotFoundError extends KnowledgeBaseError {
  constructor(collection: string) {
    super(`Collection not found: ${collection}`, 'COLLECTION_NOT_FOUND');
  }
}

export class AccessDeniedError extends KnowledgeBaseError {
  constructor(tenantId: string, collection: string) {
    super(`Access denied: ${tenantId}/${collection}`, 'ACCESS_DENIED');
  }
}

// 降级策略
export class FallbackStrategy {
  static async handle(error: Error): Promise<KnowledgeChunk[]> {
    if (error instanceof VectorDBTimeoutError) {
      // 重试 2 次
      return this.retryWithBackoff(() => [], 2);
    }

    if (error instanceof CollectionNotFoundError) {
      // 返回空结果
      logger.warn(`Collection not found, returning empty results`);
      return [];
    }

    throw error;
  }
}
```

#### 2.5 实施步骤细化

**当前状态**: 只有高阶的 Phase 1 MVP（1 周）
**需要补充**:

```
Day 1-2: 基础设施搭建
├── 创建数据库 migration 脚本
│   ├── 001_create_knowledge_table.sql
│   └── 002_create_acl_table.sql
├── 安装依赖（pgvector、pg）
├── 配置开发环境（docker-compose）
└── 编写健康检查端点

Day 3-4: KnowledgeBase 类实现
├── 实现 DatabasePool（连接池管理）
├── 实现 EmbeddingService（向量化 + LRU 缓存）
├── 实现 KnowledgeBase.retrieve()
│   ├── 向量检索 SQL
│   ├── 分数过滤
│   └── 结果排序
├── 实现 sanitizeContent()
└── 单元测试

Day 5: Agent 集成
├── 修改 Agent.run() 支持 knowledgeCollection
├── 实现 injectKnowledge()（知识注入到 prompt）
├── 降级策略实现
├── 集成测试
└── 文档

Day 6-7: 测试验证
├── 运行完整测试套件
├── 性能基准测试（p99 < 500ms）
├── 修复发现的问题
└── 提交 PR
```

### 建议
**需要补充设计文档**: `docs/proposals/YYYY-MM-DD-knowledge-base-enhancement/`

包含：
1. API 接口设计
2. 配置文件格式
3. 数据库 Schema
4. 错误处理规范
5. 细化实施步骤

---

## 3. 人工干预机制 🔴 需要详细设计

**设计文档**: `docs/tbd/AGENT_PLATFORM_ARCHITECTURE.md` §2.3

### 已有的设计
- ✅ **基本概念**: Workflow 级别和 Agent 级别的干预
- ✅ **干预点**: Workflow 阶段、Agent 执行前/后
- ✅ **集成方式**: 通过 Hook 扩展
- ✅ **实现工作量**: 3-5 天

### 当前实现状态
- ✅ **Workflow HITL 已实现** (PR #76)
  - 支持 retry、skip、rollback、abort
  - 7 天超时，10 秒轮询
  - TaskContext HITL state 管理

### 缺少的设计（需要补充）

#### 3.1 通用 InterventionHook 设计

**问题**: 当前只有 Workflow HITL，需要扩展为通用 Hook 机制

**需要设计**:

```typescript
// src/core/hook/intervention-hook.ts

export interface InterventionRequest {
  id: string;
  type: 'human_review' | 'clarification' | 'approval';
  source: 'workflow' | 'agent' | 'custom';
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  question: string;
  options?: InterventionOption[];
  context: {
    taskId?: string;
    sessionId?: string;
    workflowName?: string;
    stepId?: string;
    agentName?: string;
    metadata?: Record<string, any>;
  };
  timeout: number;  // 毫秒
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

export interface InterventionOption {
  id: string;
  label: string;
  action: 'approve' | 'reject' | 'retry' | 'skip' | 'rollback' | 'custom';
  params?: Record<string, any>;
}

export interface InterventionResponse {
  requestId: string;
  decision: string;  // option id 或 custom text
  responder: string;
  timestamp: Date;
  comments?: string;
}

export class InterventionHook extends BaseTaskHook {
  // 触发干预请求
  async requestIntervention(
    context: TaskContext,
    request: Omit<InterventionRequest, 'id' | 'status' | 'createdAt'>
  ): Promise<InterventionRequest>;

  // 等待决策（轮询）
  async waitForDecision(
    requestId: string,
    options: { timeout?: number; pollInterval?: number }
  ): Promise<InterventionResponse>;

  // 处理决策
  async handleDecision(response: InterventionResponse): Promise<void>;

  // 超时处理
  async handleTimeout(request: InterventionRequest): Promise<void>;
}
```

#### 3.2 API 端点设计

**当前状态**: Workflow HITL 使用 `PUT /api/tasks/:id/hitl`
**需要补充**:

```yaml
# RESTful API 设计

# 1. 创建干预请求
POST /api/intervention/requests
Request:
  type: "human_review"
  source: "agent"
  question: "请审核以下输出"
  context: {...}
Response:
  id: "req-123"
  status: "pending"

# 2. 查询干预请求
GET /api/intervention/requests/:id
Response:
  id: "req-123"
  status: "pending"
  question: "..."
  options: [...]

# 3. 提交决策
POST /api/intervention/requests/:id/decision
Request:
  decision: "approve"
  comments: "看起来不错"
  responder: "user-123"
Response:
  status: "approved"

# 4. 列出待处理请求
GET /api/intervention/requests?status=pending&source=agent
Response:
  requests: [...]

# 5. 撤销请求
DELETE /api/intervention/requests/:id
Response:
  status: "cancelled"
```

#### 3.3 状态机设计

**当前状态**: 没有明确的状态转换
**需要补充**:

```
Intervention Request 状态机：

[pending]
  ↓ 用户响应 / 超时
  ├─→ [approved]
  ├─→ [rejected]
  ├─→ [timeout]
  └─→ [cancelled] (撤销)

状态转换规则：
1. pending → approved: 用户选择 approve 选项
2. pending → rejected: 用户选择 reject 选项
3. pending → timeout: 超过 expiresAt 时间
4. pending → cancelled: 主动撤销（如 Agent 重试）

不可逆转换：
- approved/rejected/timeout/cancelled → ❌ 不能回到 pending
```

#### 3.4 安全设计

**当前状态**: 文档中提到了 HMAC 签名，但没有详细设计
**需要补充**:

```typescript
// 签名验证
export class InterventionSignature {
  static generate(payload: any, secret: string): string {
    const data = JSON.stringify(payload);
    return hmacSha256(data, secret);
  }

  static verify(payload: any, signature: string, secret: string): boolean {
    const expected = this.generate(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }
}

// 防重放攻击
export class ReplayAttackProtection {
  private seenRequests = new Set<string>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private ttl: number = 300000) {  // 5 分钟
    // 定期清理过期记录
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  isReplay(requestId: string): boolean {
    if (this.seenRequests.has(requestId)) {
      return true;
    }
    this.seenRequests.add(requestId);
    setTimeout(() => {
      this.seenRequests.delete(requestId);
    }, this.ttl);
    return false;
  }

  private cleanup() {
    // 由 TTL 自动处理
  }
}
```

#### 3.5 与现有 Workflow HITL 的整合

**问题**: Workflow HITL 已实现，如何与通用 InterventionHook 协同？

**建议方案**:

```typescript
// Workflow HITL 使用通用 InterventionHook

// src/core/workflow/engine.ts

export class WorkflowEngine {
  async executeStepWithHITL(
    step: WorkflowStep,
    context: WorkflowContext
  ): Promise<StepResult> {
    // ... 执行 Step

    if (hitlConfig) {
      // 使用通用 InterventionHook
      const interventionHook = new InterventionHook();
      const request = await interventionHook.requestIntervention(
        taskContext,
        {
          type: 'human_review',
          source: 'workflow',
          question: hitlConfig.question,
          options: hitlConfig.options,
          timeout: hitlConfig.timeout,
          context: {
            workflowName: this.config.name,
            stepId: step.id,
            taskId: context.taskId,
            sessionId: context.sessionId,
          },
        }
      );

      const response = await interventionHook.waitForDecision(request.id);
      return this.executeHITLAction(response, step, context);
    }
  }
}
```

### 建议
**需要创建详细设计文档**: `docs/proposals/YYYY-MM-DD-intervention-hook/`

包含：
1. InterventionHook 完整接口设计
2. RESTful API 端点定义
3. 状态机和状态转换规则
4. 安全设计（签名验证、防重放）
5. 与 Workflow HITL 的整合方案
6. 实施步骤（3-5 天细化）

---

## 4. 并行委派 🔴 需要完整设计

**设计文档**: `docs/tbd/AGENT_PLATFORM_ARCHITECTURE.md` §2.5

### 已有的设计
- ✅ **基本需求**: 同时委派给多个 subagent
- ✅ **使用场景**: 产品经理 + UI 设计师 + 技术负责人并行
- ✅ **实现工作量**: 3-5 天

### 缺少的设计（需要补充）

#### 4.1 MasterAgent 扩展设计

**当前状态**: 只有需求描述
**需要设计**:

```typescript
// src/core/agent/master-agent.ts

export interface ParallelDelegationConfig {
  delegates: string[];  // subagent 名称列表
  mode: 'parallel' | 'sequential';  // 执行模式
  fusion?: 'llm' | 'custom';  // 结果融合策略
  timeout?: number;  // 总超时时间
  failureStrategy?: 'fail_fast' | 'continue' | 'wait_all';  // 失败策略
}

export class MasterAgent {
  async run(
    task: string,
    taskId?: string,
    context?: TaskContext & {
      parallelDelegation?: ParallelDelegationConfig;
    }
  ): Promise<AgentResult> {
    // 并行委派
    if (context?.parallelDelegation) {
      return this.executeParallel(task, taskId, context);
    }

    // 单个委派（现有逻辑）
    return this.executeSingle(task, taskId, context);
  }

  private async executeParallel(
    task: string,
    taskId: string,
    context: TaskContext
  ): Promise<AgentResult> {
    const { delegates, mode, fusion, timeout, failureStrategy } =
      context.parallelDelegation!;

    // 并行执行
    const results = await Promise.allSettled(
      delegates.map((agentName) =>
        this.delegateTo(agentName, task, taskId, context)
      )
    );

    // 处理失败策略
    const processed = this.handleFailures(results, failureStrategy);

    // 融合结果
    return this.fuseResults(processed, fusion);
  }

  private handleFailures(
    results: PromiseSettledResult<AgentResult>[],
    strategy: string
  ): AgentResult[] {
    // ...
  }

  private fuseResults(
    results: AgentResult[],
    strategy: string
  ): AgentResult {
    // ...
  }
}
```

#### 4.2 失败策略设计

**需要明确**:

```typescript
type FailureStrategy =
  | 'fail_fast'      // 任何一个失败立即停止
  | 'continue'       // 忽略失败，继续执行
  | 'wait_all'       // 等待所有完成（包括失败的）

interface FailureHandler {
  handleFailFast(
    results: PromiseSettledResult<AgentResult>[]
  ): AgentResult[];

  handleContinue(
    results: PromiseSettledResult<AgentResult>[]
  ): AgentResult[];

  handleWaitAll(
    results: PromiseSettledResult<AgentResult>[]
  ): AgentResult[];
}
```

#### 4.3 结果融合策略设计

**需要设计**:

```typescript
type FusionStrategy = 'llm' | 'merge' | 'concat' | 'vote';

interface FusionHandler {
  // LLM 综合（现有）
  fuseWithLLM(results: AgentResult[]): AgentResult;

  // 合并对象
  fuseByMerge(results: AgentResult[]): AgentResult;

  // 拼接数组
  fuseByConcat(results: AgentResult[]): AgentResult;

  // 投票（多数同意）
  fuseByVote(results: AgentResult[]): AgentResult;
}
```

#### 4.4 配置文件格式

**需要设计**:

```yaml
# subagents/master-agent/agent.yaml

agent:
  name: master-agent
  description: 多 Agent 协作编排器

parallel:
  # 默认失败策略
  defaultFailureStrategy: fail_fast  # fail_fast | continue | wait_all

  # 默认融合策略
  defaultFusion: llm  # llm | merge | concat | vote

  # 默认超时（每个 subagent）
  defaultTimeout: 300000  # 5 分钟

  # 预定义的并行委派配置
  presets:
    design-team:
      delegates: [product-manager, ui-designer, tech-lead]
      failureStrategy: wait_all
      fusion: llm

    code-review:
      delegates: [code-reviewer, security-reviewer]
      failureStrategy: continue
      fusion: merge
```

### 建议
**可以延后设计**（P1 优先级），当前需求不紧急。如需要，创建：
`docs/proposals/YYYY-MM-DD-parallel-delegation/`

---

## 5. 自定义融合策略 🟡 可延后

**设计文档**: `docs/tbd/AGENT_PLATFORM_ARCHITECTURE.md` §2.4

### 已有的设计
- ✅ **当前状态**: MasterAgent 已有 synthesizeResults 方法
- ✅ **扩展方案**: 通过 CustomFusionHook 扩展
- ✅ **实施工作量**: 2-3 天

### 建议
**可以延后**，与并行委派一起设计。当前 LLM 综合已够用。

---

## 📋 总结与优先级

### 立即补充设计（高优先级）

1. **人工干预机制** 🔴
   - 建议创建：`docs/proposals/2026-04-03-intervention-hook/`
   - 需要：完整接口设计、API 端点、状态机、安全设计
   - 预估时间：1-2 天设计 + 3-5 天实施

2. **知识库管理** 🟡
   - 建议创建：`docs/proposals/2026-04-03-knowledge-base-enhancement/`
   - 需要：API 设计、配置格式、Schema、错误处理
   - 预估时间：1 天设计 + 1-2 周实施

### 可以延后设计（低优先级）

3. **并行委派** 🟢
   - 优先级：P1，当前需求不紧急
   - 等并行委派需求明确后再设计

4. **自定义融合** 🟢
   - 优先级：P1，当前 LLM 综合已够用
   - 与并行委派一起设计

### 直接可以实施

5. **输出验证器** ✅
   - 设计文档完整
   - 可以直接开始实施
   - 预估时间：2-3 天

---

## 🎯 建议的实施顺序

```
Week 1: 输出验证器（直接实施）
  └─> 2-3 天实施 + 测试

Week 2-3: 知识库管理（先补充设计）
  ├─> 1 天补充设计文档
  └─> 1-2 周实施

Week 4: 人工干预机制（先补充设计）
  ├─> 1-2 天补充设计文档
  └─> 3-5 天实施

Week 5+: 并行委派（按需）
  └─> 等需求明确后再设计和实施
```

---

**文档状态**: 🟡 需要补充设计
**下一步**: 选择一个模块，补充详细设计文档
