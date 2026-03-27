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

## 3. 实施路线图

### Phase 1: 核心能力（2 周）

```
Week 1-2: 知识库管理（必须修改核心）
├── 集成 pgvector 或 ChromaDB
├── 实现 KnowledgeBase 类
│   ├── retrieve() - 向量检索
│   ├── addKnowledge() - 批量插入
│   └── embedQuery() - 向量化
├── 在 Agent.run() 中集成 RAG 检索
│   └── 自动注入知识到 prompt
├── 提供配置接口
│   └── context.knowledgeCollection
└── 测试验证
    ├── 单元测试
    └── 集成测试
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

---

## 🔗 相关文档

- [AGENTS.md](../AGENTS.md) - MyAgent 项目概览
- [docs/ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - 完整 4 层架构
- [docs/SYSTEM_CONCEPTS_OVERVIEW.md](./SYSTEM_CONCEPTS_OVERVIEW.md) - 核心概念详解
