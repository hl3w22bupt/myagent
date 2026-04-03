# HITL 机制对比分析

**创建时间**: 2026-04-03
**目的**: 澄清 Agent 层 HITL 和 Workflow 层 HITL 的关系

---

## 🎯 核心结论

**Agent 层 HITL 和 Workflow 层 HITL 使用相同的底层机制，只是触发方式不同！**

---

## 📊 对比表

| 维度 | Agent 层 HITL（意图澄清） | Workflow 层 HITL（失败处理） |
|------|-------------------------|---------------------------|
| **触发方式** | **动态判断** ⭐ | **预配置** ⭐ |
| **触发条件** | `confidence < 0.7` 或任务模糊 | Step 执行失败 |
| **触发时机** | Intent Analysis 阶段（PTC CodeGen 之前） | Step 执行失败后 |
| **决策方式** | 人类提供文本澄清 | 人类选择预定义动作 |
| **恢复策略** | 从 checkpoint 继续，不重新开始 | 执行选择的动作（retry/skip/rollback/abort） |
| **配置位置** | Agent 内部逻辑（代码判断） | `workflow.yaml` 的 `on_failure.hitl` |
| **使用场景** | 需求不明确时澄清 | 执行失败后决策 |

---

## 🔧 共同的底层机制

两者使用**完全相同**的实现：

### 1. 状态管理
```typescript
// 都使用 TaskContext.hitlState
interface HITLState {
  stage: 'post_intent' | 'in_execution';  // 不同
  status: 'awaiting' | 'completed';      // 相同
  question: string;                       // 相同
  options?: string[];                      // 相同（可选）
  response?: {                             // 相同
    content: string;
    feedback?: string;
    timestamp: Date;
  };
  createdAt: Date;                         // 相同
}
```

### 2. 轮询机制
```typescript
// 都使用 Agent.pollHITLResult()
private async pollHITLResult(taskId: string): Promise<{...}> {
  const POLL_INTERVAL = 2000;  // 2 秒
  const TIMEOUT = 600000;      // 10 分钟
  
  while (Date.now() - startTime < TIMEOUT) {
    // 检查 TaskContext.hitlState.status
    if (taskContext.hitlState.status === 'completed') {
      return taskContext.hitlState.response;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}
```

### 3. API 接口
```typescript
// 都使用同一个接口
PUT /api/tasks/:id/hitl
Body: {
  decision: string;  // 澄清文本 或 动作 ID
  feedback?: string;
}
```

### 4. 状态存储
```typescript
// 都使用 ContextManager
await contextManager.getContext(taskId);
await contextManager.saveContext(taskContext);
```

---

## 📝 详细流程对比

### Agent 层 HITL（动态触发）

```
Agent.execute(task, taskId, context)
  ↓
1. checkHITLCheckpoint(taskId) - 检查是否有待恢复的 HITL
  ├─ 有 → 恢复澄清结果，继续执行
  └─ 无 → 继续
  ↓
2. notifyIntentAnalysis() - 分析意图
  ↓
3. checkIntentClarification() - 动态判断是否需要澄清 ⭐
  ├─ confidence < 0.7 → 调用 LLM 判断
  ├─ LLM 返回 needs_clarification: true
  ├─ 生成澄清问题
  └─ 继续
  ↓
4. saveHITLState(taskId, {
    stage: 'post_intent',           ← Agent 特定
    status: 'awaiting',
    question: clarification.question,
    options: clarification.options, ← 可选（选择题）
  })
  ↓
5. pollHITLResult(taskId) - 轮询等待响应
  ↓ (收到响应)
6. 更新 task = task + clarification.content
  ↓
7. clearHITLState(taskId)
  ↓
8. PTC CodeGen - 继续执行（需求已明确）
```

**关键特点**：
- ✅ **动态判断**：每次执行时都可能触发
- ✅ **时机固定**：总是在 Intent Analysis 阶段
- ✅ **恢复点明确**：澄清后从 checkpoint 继续，不重新开始

---

### Workflow 层 HITL（预配置触发）

```
WorkflowEngine.executeStep(step, context)
  ↓
1. 执行 Step（Agent 或 Webhook）
  ↓
2. Step 执行失败 ❌
  ↓
3. 检查 on_failure.action
  ├─ action: 'hitl' → 继续
  └─ 其他 → 执行其他动作
  ↓
4. handleHITL(step, context, error) ⭐
  ↓
5. saveHITLState(taskId, {
    stage: 'in_execution',         ← Workflow 特定
    status: 'awaiting',
    agentName: `Workflow:${workflowName}`,
    question: step.hitl?.question || `步骤失败：${error.message}`,
    options: hitlOptions,          ← 必有（选择题）
    workflowName: workflow.name,   ← Workflow 特定
    stepId: step.id,               ← Workflow 特定
    failureReason: error.message,  ← Workflow 特定
  })
  ↓
6. 发送事件到 Stream
  ↓
7. pollHITLResult(taskId) - 轮询等待响应
  ↓ (收到响应)
8. executeHITLAction(response, step)
  ├─ action: 'retry' → 重试 Step
  ├─ action: 'skip' → 跳过 Step
  ├─ action: 'rollback' → 回滚到指定 Step
  └─ action: 'abort' → 中止 Workflow
  ↓
9. clearHITLState(taskId)
```

**关键特点**：
- ✅ **预配置**：在 `workflow.yaml` 中定义
- ✅ **时机可变**：在任何 Step 失败时触发
- ✅ **动作多样**：retry/skip/rollback/abort

---

## 🤔 是否需要"通用 InterventionHook"？

### 答案：**不需要！**

**原因**：
1. ✅ **底层机制已经通用**：
   - Agent 和 Workflow 都使用相同的 `TaskContext.hitlState`
   - 相同的轮询机制
   - 相同的 API 接口
   - 相同的存储和恢复逻辑

2. ✅ **只是触发方式不同**：
   - Agent 层：代码中的动态判断（`checkIntentClarification()`）
   - Workflow 层：配置文件中的预定义触发（`on_failure.hitl`）

3. ✅ **扩展方式明确**：
   - 如需添加新的 HITL 场景，只需：
     - 定义新的触发条件
     - 调用 `saveHITLState()`
     - 调用 `pollHITLResult()`
     - 处理响应

---

## 🔍 实际实现状态

### Agent 层 HITL

**文件**: `src/core/agent/agent.ts`

**已实现**：
- ✅ `checkHITLCheckpoint()` - 检查恢复点
- ✅ `saveHITLState()` - 保存 HITL 状态
- ✅ `pollHITLResult()` - 轮询等待响应
- ✅ `clearHITLState()` - 清理 HITL 状态
- ✅ `checkIntentClarification()` - 意图澄清判断逻辑
  - 调用 LLM 判断是否需要澄清
  - 生成澄清问题
  - Fallback 规则处理
- ✅ 完整测试套件（7个单元测试）

**完成度**: 100% ✅（2026-04-03）

### Workflow 层 HITL

**文件**: `src/core/workflow/engine.ts`

**已实现**：
- ✅ `handleHITL()` - 处理 HITL 请求
- ✅ `executeHITLAction()` - 执行 HITL 动作
- ✅ 失败触发机制（`on_failure.hitl`）
- ✅ 支持 retry/skip/rollback/abort

**完成度**: 100% ✅

---

## 💡 如何扩展 HITL 机制

### 场景 1: 添加新的 Agent 层 HITL 触发

**示例**: 在 Agent 执行后请求人工审核

```typescript
// src/core/agent/agent.ts

async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
  // ... 正常执行
  
  const result = await this.llm.generate(messages);
  
  // ⭐ 新增：执行后质量检查
  if (await this.needsHumanReview(result)) {
    await this.saveHITLState(taskId, {
      stage: 'post_execution',
      status: 'awaiting',
      question: '请审核以下输出质量',
      options: ['approve', 'reject', 'retry'],
    });
    
    const review = await this.pollHITLResult(taskId);
    
    if (review.content === 'reject') {
      return { success: false, error: '人工审核拒绝' };
    }
    
    if (review.content === 'retry') {
      return this.run(task, taskId, context);  // 递归重试
    }
  }
  
  return result;
}
```

### 场景 2: 添加自定义 Workflow HITL 触发

**示例**: 在特定 Step 前请求人工确认

```yaml
# workflows/critical-operation/workflow.yaml

steps:
  - id: deploy-production
    name: "部署到生产"
    agent: deployer
    
    # ⭐ 新增：执行前 HITL
    pre_check:
      type: hitl
      config:
        question: "即将部署到生产环境，请确认"
        options:
          - { id: 'confirm', label: '确认部署', action: 'proceed' }
          - { id: 'cancel', label: '取消部署', action: 'skip' }
    
    on_failure:
      action: hitl
      hitl:
        question: "部署失败，如何处理？"
        options:
          - { id: 'retry', label: '重试', action: 'retry' }
          - { id: 'rollback', label: '回滚', action: 'rollback' }
```

---

## 📋 设计更新

### 原计划（design-gaps-analysis.md）

```
❌ 错误理解：需要创建"通用 InterventionHook"
```

### 实际情况

```
✅ HITL 机制已经通用化！
├── Agent 层：使用相同的底层机制
├── Workflow 层：使用相同的底层机制
└── 只需添加新的触发场景
```

### 需要做的事情

**不是**：创建新的 InterventionHook
**而是**：补充 Agent 层 HITL 的触发逻辑

**已完成** ✅ (2026-04-03)：

1. ✅ **实现 `checkIntentClarification()`**
   - 完整的 LLM 判断逻辑
   - 澄清问题生成
   - Fallback 规则处理
   - 代码位置：`src/core/agent/agent.ts:1750-1986`

2. ✅ **编写测试套件**
   - 7 个单元测试覆盖所有场景
   - 测试文件：`tests/unit/agent/intent-clarification.test.ts`
   - 测试通过：7/7 ✅

3. ✅ **测试环境支持**
   - 添加 `enableHITLInTest` 标志
   - 移除 `NODE_ENV === 'test'` 硬编码跳过

**可选工作**（低优先级）：

4. ⏳ **配置 Agent Hook（可选）**
   ```yaml
   # hooks/agent/hitl-webhook.yaml
   type: hitl_webhook
   trigger: onAwaitingHITL
   enabled: true
   config:
     url: "{{ env.HITL_WEBHOOK_URL }}"
     method: POST
   ```

---

## 🎯 结论

### 两个 HITL 的关系

```
┌─────────────────────────────────────────────────────┐
│           HITL 底层机制（已通用化）                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ • TaskContext.hitlState                       │  │
│  │ • pollHITLResult()                            │  │
│  │ • saveHITLState()                             │  │
│  │ • PUT /api/tasks/:id/hitl                     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
          ↑                              ↑
┌─────────────────────┐    ┌──────────────────────┐
│  Agent 层触发        │    │  Workflow 层触发      │
│  (动态判断)          │    │  (预配置)             │
├─────────────────────┤    ├──────────────────────┤
│ • confidence < 0.7  │    │ • on_failure.hitl    │
│ • 任务模糊          │    │ • Step 失败          │
│ • checkIntent...()  │    │ • handleHITL()       │
└─────────────────────┘    └──────────────────────┘
```

### 下一步工作

**不需要**：
- ❌ 创建新的 InterventionHook 类
- ❌ 重新设计 HITL 机制
- ❌ 创建新的 API 接口

**需要**：
- ✅ 实现 `checkIntentClarification()` 逻辑
- ✅ 添加 LLM Prompt 用于判断是否需要澄清
- ✅ 测试 Agent 层 HITL 流程
- ✅ 文档说明两种 HITL 的使用场景

---

**文档状态**: ✅ 已实现
**完成日期**: 2026-04-03
**实现状态**:
- ✅ 核心逻辑已实现
- ✅ 测试套件已完成（7/7 通过）
- ✅ 文档已更新

**分支**: `feature/agent-intent-clarification`
**提交**: c273fc7
