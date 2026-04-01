# Workflow Feedback Loop 设计文档

> **创建时间**: 2026-03-31
> **状态**: 设计阶段
> **版本**: v0.1

---

## 📋 目录

- [1. 核心概念](#1-核心概念)
- [2. 分层架构](#2-分层架构)
- [3. 什么是 Failure](#3-什么是-failure)
- [4. on_failure vs condition](#4-on_failure-vs-condition)
- [5. 配置示例](#5-配置示例)
- [6. 执行流程](#6-执行流程)
- [7. 需要补充的工作](#7-需要补充的工作)

---

## 1. 核心概念

### 设计目标

在现有 Workflow 机制基础上，扩展**错误恢复和人工介入**能力，实现全自动研发流水线：

```
用户需求 → [产品经理] → [架构师] → [技术设计] → [开发] → [测试]
                  ↓           ↓          ↓         ↓       ↓
              自检/重试/回滚/人工介入
```

### 核心原则

1. **分层清晰**：Agent 层负责自检，Workflow 层负责编排
2. **职责分离**：Validation 在 Agent 内部，Feedback Loop 在 Workflow 外部
3. **简化设计**：避免过度复杂的智能决策
4. **人类决策**：复杂情况由人类决定，而不是 AI 推测

---

## 2. 分层架构

### Agent 层（内部执行）

```
┌─────────────────────────────────────────────────┐
│  Agent 层（内部执行）                             │
│  agent.yaml                                        │
│                                                   │
│  hooks:                                           │
│    post-execution:                               │
│      - ValidationHook  ← ⭐ Validation 在这里    │
│                                                   │
│  内部流程：                                        │
│    1. Agent 执行任务                                │
│    2. ValidationHook 检查输出                       │
│    3. 如果验证失败 → 抛出 ValidationError         │
│    4. 如果验证成功 → 返回结果                     │
└─────────────────────────────────────────────────┘
```

### Workflow 层（外部编排）

```
┌─────────────────────────────────────────────────┐
│  Workflow 层（外部编排）                           │
│  workflow.yaml                                     │
│                                                   │
│  steps:                                           │
│    - id: developer                                │
│      on_failure:                                 │ ← ⭐ Feedback Loop 在这里
│        action: retry                              │
│        rollback_to: architect                    │
│                                                   │
│  外部流程：                                        │
│    1. 执行 Agent                                   │
│    2. 检查结果 (success/failure)                  │
│    3. 如果失败 → on_failure 处理                   │
│    4. 重试 / 回滚 / 人工介入                        │
└─────────────────────────────────────────────────┘
```

### 为什么分层？

| 层级 | 负责 | 配置文件 | 配置内容 |
|------|------|---------|---------|
| **Agent 层** | 输出质量 | `agent.yaml` | ValidationHook、自检标准 |
| **Workflow 层** | 流程编排 | `workflow.yaml` | on_failure、重试、回滚 |

**优势**：
- ✅ Agent 可复用（不同 Workflow 可用不同策略）
- ✅ 职责清晰（自检 vs 编排）
- ✅ 易于测试（单独测试 Agent 或 Workflow）

---

## 3. 什么是 Failure？

### 三种 Failure 情况

```typescript
// 情况1: Agent 抛出异常
const agent = new DeveloperAgent();
const result = await agent.run(task);
// ❌ 抛出 Error
// → status: 'failed'

// 情况2: Agent 返回失败
const result = {
  success: false,  // ← Agent 自己判断失败了
  error: '无法实现需求'
};
// → status: 'failed'

// 情况3: ValidationHook 抛出 ValidationError
const agent = new DeveloperAgent();
const result = await agent.run(task);
// ✅ 返回结果
// → ValidationHook.onTaskComplete() 检查
// → ❌ 抛出 ValidationError
// → status: 'failed'
```

### 统一定义

```typescript
// src/core/workflow/engine.ts

interface WorkflowStepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: any;
  error?: string;

  // ⭐ 失败元数据
  failureReason?: string;
  failureType?: 'agent_error' | 'agent_declined' | 'validation_failed' | 'timeout';
  retryCount?: number;
  executionTime?: number;
}

/**
 * 判断步骤是否失败
 */
private isStepFailure(stepResult: any): boolean {
  // 情况1: Agent 抛出异常
  if (stepResult.status === 'failed') {
    return true;
  }

  // 情况2: Agent 返回 success: false
  if (stepResult.output?.success === false) {
    return true;
  }

  // 情况3: ValidationError（在 executeStep 中捕获）
  // （在 executeStep 中捕获，转换为 status: 'failed'）
  return false;
}
```

---

## 4. on_failure vs condition

### 核心区别

```
condition:   [执行前] 决定"是否执行"
on_failure: [执行后] 决定"失败后怎么办"
```

### 决策流程图

```
┌─────────────────────────────────────────┐
│  Workflow 执行流程                        │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ 步骤 B                                │ │
│  │                                       │ │
│  │ [前置检查]                            │ │
│  │   └─ condition: hasIssues == true    │ │
│  │       └─ 如果 false → 跳过 (skipped) │ │
│  │       └─ 如果 true → 继续            │ │
│  │                                       │ │
│  │ [执行 Agent]                           │ │
│  │   Agent.run()                          │ │
│  │   ├─ 成功 → status: completed         │ │
│  │   └─ 失败 → status: failed            │ │
│  │                                       │ │
│  │ [后置检查]                            │ │
│  │   └─ on_failure                       │ │
│  │       ├─ 成功 → 忽略                   │ │
│  │       └─ 失败 → retry/rollback/...   │ │
│  └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

### 对比表

| 维度 | condition | on_failure |
|------|----------|-----------|
| **时机** | 执行前（pre-check） | 执行后（post-check） |
| **作用** | 决定"是否执行" | 决定"失败后怎么办" |
| **影响** | status: 'skipped' | 触发重试/回滚/介入 |
| **使用场景** | 条件执行 | 错误恢复 |
| **配置位置** | 步骤级 | 步骤级 |

### 组合使用

```yaml
steps:
  - id: optional-fix
    name: "可选修复"
    agent: developer

    # ⭐ condition: 只有在需要时才执行
    condition:
      field: "hasIssues"
      operator: ">"
      value: 0

    # ⭐ on_failure: 如果执行失败，回滚
    on_failure:
      action: rollback
      rollback_to: analyze

    # ⭐ 两种情况的组合：
    # 1. hasIssues = 0 → �新过（condition）
    # 2. hasIssues > 0 → 执行 → 失败 → 回滚（on_failure）
```

---

## 5. 配置示例

### 基础配置：重试

```yaml
name: "development-pipeline"
description: "全自动研发流水线"

steps:
  - id: product-manager
    name: "需求分析"
    agent: product-manager
    output:
      requirement: "structuredOutput"

  - id: architect
    name: "架构设计"
    agent: architect
    depends_on: [product-manager]
    input:
      requirement: "{{ requirement }}"
    output:
      architecture: "structuredOutput"

  - id: developer
    name: "代码生成"
    agent: developer
    depends_on: [technical-designer]
    input:
      detailDesign: "{{ detailDesign }}"

    # ⭐ Feedback Loop: 重试
    on_failure:
      action: retry
    retry:
      maxAttempts: 5
      backoff: exponential
      backoffMs: 1000

  - id: tester
    name: "测试验证"
    agent: tester
    depends_on: [developer]
    input:
      code: "{{ code }}"
```

### 高级配置：回滚

```yaml
steps:
  - id: analyze
    name: "代码分析"
    agent: code-analyzer
    output:
      hasIssues: "structuredOutput.hasIssues"

  - id: fix
    name: "修复问题"
    agent: developer
    depends_on: [analyze]

    # ⭐ 条件执行
    condition:
      field: "hasIssues"
      operator: "=="
      value: true

    # ⭐ 失败回滚
    on_failure:
      action: rollback
      rollback_to: analyze
      message: "修复失败，重新分析"

  - id: test
    name: "测试验证"
    agent: tester
    depends_on: [fix]

    # ⭐ 测试失败回滚
    on_failure:
      action: rollback
      rollback_to: developer
      message: "测试失败，重新开发"
```

### 高级配置：人工介入

```yaml
steps:
  - id: deploy
    name: "部署到生产"
    agent: deployer

    # ⭐ 条件性失败处理
    on_failure:
      # 测试环境失败：重试
      if: "environment == 'staging'"
        action: retry
        maxAttempts: 3

      # 生产环境失败：人工介入
      if: "environment == 'production'"
        action: human_intervention
        message: "生产部署失败，需要人工审核"
        options:
          - label: "重试部署"
            action: retry
          - label: "回滚到上一个版本"
            action: rollback
            rollback_to: previous_version
          - label: "标记为失败"
            action: fail
```

---

## 6. 执行流程

### 场景 1：正常流程

```
[产品经理] ✅
    ↓
[架构师] ✅
    ↓
[技术设计] ✅
    ↓
[开发 Agent] ✅ (第1次尝试)
    ↓
[测试 Agent] ✅
    ↓
[流水线完成]
```

### 场景 2：重试

```
...
[开发 Agent] ❌ (自检失败)
    ↓
[触发 on_failure.action: retry]
    ↓
[重试第2次] ✅
    ↓
[测试 Agent] ✅
```

### 场景 3：回滚

```
...
[开发 Agent] ✅
    ↓
[测试 Agent] ❌ (测试失败)
    ↓
[触发 on_failure.action: rollback]
    ↓
[回滚到 developer]
    ↓
[清除 tester 之后的上下文]
    ↓
[开发 Agent] 🔁 (重新执行，带反馈)
    ↓
[测试 Agent] ✅
```

### 场景 4：条件执行 + 回滚

```
[代码分析] ✅
    ↓
    hasIssues = true
    ↓
[修复问题] (condition = true，执行)
    ↓
    ❌ 修复失败
    ↓
[触发 on_failure.action: rollback]
    ↓
[回滚到 analyze]
    ↓
[代码分析] 🔁 (重新执行)
```

### 场景 5：人工介入

```
...
[部署 Agent] ❌ (生产环境失败)
    ↓
[触发 on_failure.action: human_intervention]
    ↓
[保存介入请求到数据库]
    ↓
[返回等待状态]
    ↓
... 人类决策 ...
    ↓
[恢复流水线]
    ↓
[人类选择：重试部署]
```

---

## 7. 需要补充的工作

### 7.1 类型扩展

```typescript
// src/core/workflow/types.ts

export interface RetryConfig {
  maxAttempts?: number;
  backoff?: 'linear' | 'exponential';
  backoffMs?: number;
}

export interface InterventionOption {
  label: string;
  action: 'retry' | 'rollback' | 'fail';
  rollback_to?: string;
}

export interface FailureHandler {
  action: 'retry' | 'rollback' | 'human_intervention' | 'fail';

  // 重试相关
  retry?: RetryConfig;

  // 回滚相关
  rollback_to?: string;
  fallback_rollback_to?: string;
  message?: string;

  // 人工介入相关
  options?: InterventionOption[];

  // 条件性处理
  if?: string;
  then?: FailureHandler;
}

export interface WorkflowStep {
  id: string;
  name?: string;
  agent: string;
  depends_on?: string[];
  input?: Record<string, any>;
  output?: Record<string, string | OutputMapping>;

  // ⭐ 新增：错误处理
  on_failure?: FailureHandler;
  retry?: RetryConfig;

  // 现有字段
  condition?: StepCondition;
  conditions?: MultiCondition;
  parallel?: ParallelConfig;
  always_run?: boolean;
}
```

### 7.2 Workflow Engine 实现

```typescript
// src/core/workflow/engine.ts

export class WorkflowEngine {

  /**
   * Execute workflow with retry and rollback support
   */
  async execute(
    workflowName: string,
    input: Record<string, any>,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);

    // ⭐ 新增：跟踪人工介入状态
    const humanInterventions: Array<{ stepId: string; rollbackTo?: string }> = [];

    try {
      // 执行工作流（带重试和回滚）
      const result = await this.executeWorkflowWithRetry(
        workflow,
        input,
        options,
        humanInterventions
      );

      return result;
    } catch (error: any) {
      if (error.name === 'HumanInterventionRequired') {
        // ⭐ 触发人工介入
        return await this.handleHumanIntervention(
          error,
          workflow,
          input,
          options
        );
      }

      throw error;
    }
  }

  /**
   * Execute workflow with retry and rollback
   */
  private async executeWorkflowWithRetry(
    workflow: WorkflowConfig,
    input: Record<string, any>,
    options: WorkflowOptions,
    humanInterventions: Array<{ stepId: string; rollbackTo?: string }>
  ): Promise<WorkflowResult> {
    const executionSteps: any[] = [];

    // ⭐ 获取拓扑排序后的步骤
    let sortedSteps = this.topologicalSort(workflow.steps);

    // ⭐ 当前执行索引
    let currentStepIndex = 0;

    while (currentStepIndex < sortedSteps.length) {
      const step = sortedSteps[currentStepIndex];

      try {
        // ⭐ 检查是否应该跳过该步骤
        if (this.shouldSkipStep(step, context)) {
          currentStepIndex++;
          continue;
        }

        // ⭐ 执行步骤（带重试）
        const stepResult = await this.executeStepWithRetry(step, context, workflow, options);

        executionSteps.push(stepResult);

        // ⭐ 步骤成功
        if (stepResult.status === 'completed') {
          currentStepIndex++;
        }

        // ⭐ 步骤失败：处理失败
        if (stepResult.status === 'failed') {
          const failureResult = await this.handleStepFailure(step, stepResult, workflow, context, sortedSteps);

          if (failureResult.action === 'retry') {
            // 重试当前步骤（不增加索引）
            continue;
          } else if (failureResult.action === 'rollback') {
            // ⭐ 回滚到指定步骤
            currentStepIndex = failureResult.rollbackIndex;

            // ⭐ 清除回滚点之后的上下文
            this.clearContextAfter(sortedSteps, failureResult.rollbackIndex, context);
            continue;
          } else if (failureResult.action === 'human_intervention') {
            // ⭐ 触发人工介入
            throw new HumanInterventionRequiredError(step, stepResult);
          } else {
            // 失败：停止执行
            break;
          }
        }

      } catch (error) {
        if (error.name === 'HumanInterventionRequired') {
          throw error; // 向上传递
        }

        // 其他错误：停止执行
        break;
      }
    }

    return {
      success: true,
      output: this.extractFinalOutput(executionSteps, context),
      executionTime: Date.now() - startTime,
      steps: executionSteps,
      context: context.toJSON(),
    };
  }

  /**
   * Execute a single step with retry support
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    const retryConfig = step.retry || { maxAttempts: 1 };
    const maxAttempts = retryConfig.maxAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ⭐ 执行步骤（捕获 ValidationError）
        const result = await this.executeStep(step, context, workflow, options);

        // ⭐ 成功：返回结果
        return result;

      } catch (error) {
        // ⭐ 最后一次尝试失败
        if (attempt >= maxAttempts) {
          return {
            stepId: step.id,
            status: 'failed',
            error: error.message,
            retryAttempts: attempt,
          };
        }

        // ⭐ 等待退避时间
        await this.sleep(this.calculateBackoff(retryConfig, attempt));
      }
    }
  }

  /**
   * Handle step failure
   */
  private async handleStepFailure(
    step: WorkflowStep,
    stepResult: any,
    workflow: WorkflowConfig,
    context: WorkflowContext,
    sortedSteps: WorkflowStep[]
  ): Promise<{ action: string; rollbackIndex?: number }> {
    const onFailure = step.on_failure || { action: 'fail' };

    // ⭐ 条件性处理
    if (onFailure.if && !this.evaluateCondition(onFailure.if, context)) {
      // 条件不满足，使用默认行为
      return { action: onFailure.action || 'fail' };
    }

    // ⭐ 处理不同的 action
    if (onFailure.action === 'retry') {
      return { action: 'retry' };
    }

    if (onFailure.action === 'rollback' && onFailure.rollback_to) {
      // ⭐ 回滚到指定步骤
      const rollbackIndex = this.findStepIndex(sortedSteps, onFailure.rollback_to);

      if (rollbackIndex !== -1) {
        return { action: 'rollback', rollbackIndex };
      }

      // ⭐ 回滚失败，尝试回退回滚点
      if (onFailure.fallback_rollback_to) {
        const fallbackIndex = this.findStepIndex(sortedSteps, onFailure.fallback_rollback_to);
        if (fallbackIndex !== -1) {
          return { action: 'rollback', rollbackIndex: fallbackIndex };
        }
      }
    }

    if (onFailure.action === 'human_intervention') {
      // ⭐ 触发人工介入
      throw new HumanInterventionRequiredError(step, stepResult);
    }

    // 默认：失败
    return { action: 'fail' };
  }

  /**
   * Handle human intervention
   */
  private async handleHumanIntervention(
    error: HumanInterventionRequiredError,
    workflow: WorkflowConfig,
    input: Record<string, any>,
    options: WorkflowOptions
  ): Promise<WorkflowResult> {
    const step = error.step;
    const stepResult = error.stepResult;

    // ⭐ 保存人工介入请求到数据库
    const interventionId = await this.saveInterventionRequest({
      workflowName: workflow.name,
      stepId: step.id,
      stepName: step.name,
      error: stepResult.error,
      message: step.on_failure?.message || `步骤 ${step.name} 执行失败`,
      options: step.on_failure?.options || [],
      metadata: {
        sessionId: options.sessionId,
        taskId: options.taskId,
      },
    });

    // ⭐ 返回"等待人工介入"状态
    return {
      success: false,
      error: 'Human intervention required',
      executionTime: 0,
      steps: [stepResult],
      interventionId,
      requiresHumanIntervention: true,
    };
  }

  /**
   * Resume workflow from human intervention
   */
  async resumeFromIntervention(
    workflowName: string,
    interventionId: string,
    humanDecision: {
      action: 'retry' | 'rollback' | 'fail';
      rollbackTo?: string;
      feedback?: string;
    },
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    // ⭐ 获取人工介入请求
    const intervention = await this.getInterventionRequest(interventionId);

    // ⭐ 恢复上下文
    const context = new WorkflowContext(options.taskId, intervention.context);

    // ⭐ 根据人类决策处理
    if (humanDecision.action === 'retry') {
      // 重试失败的步骤
      return await this.execute(workflowName, intervention.input, {
        ...options,
        resumeFrom: intervention.stepId,
      });
    }

    if (humanDecision.action === 'rollback' && humanDecision.rollbackTo) {
      // ⭐ 回滚到指定步骤
      return await this.execute(workflowName, intervention.input, {
        ...options,
        rollbackTo: humanDecision.rollbackTo,
        feedback: humanDecision.feedback,
      });
    }

    // fail
    return {
      success: false,
      error: 'Workflow failed by human decision',
      executionTime: 0,
      steps: [],
    };
  }

  /**
   * Clear context after a specific step (for rollback)
   */
  private clearContextAfter(
    sortedSteps: WorkflowStep[],
    rollbackIndex: number,
    context: WorkflowContext
  ): void {
    // 清除回滚点之后的步骤状态
    for (let i = rollbackIndex + 1; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      context.clearStepStatus(step.id);
      context.clearVariable(step.id);
    }
  }

  /**
   * Evaluate condition expression
   */
  private evaluateCondition(condition: string, context: WorkflowContext): boolean {
    // TODO: 实现条件表达式解析
    return true;
  }

  /**
   * Find step index by ID
   */
  private findStepIndex(steps: WorkflowStep[], stepId: string): number {
    return steps.findIndex(s => s.id === stepId);
  }

  /**
   * Calculate backoff time
   */
  private calculateBackoff(retryConfig: RetryConfig, attempt: number): number {
    if (retryConfig.backoff === 'exponential') {
      return Math.pow(2, attempt - 1) * (retryConfig.backoffMs || 1000);
    }
    return (retryConfig.backoffMs || 1000);
  }
}

/**
 * Human intervention required error
 */
class HumanInterventionRequiredError extends Error {
  constructor(
    public step: WorkflowStep,
    public stepResult: any
  ) {
    super(`Human intervention required for step: ${step.id}`);
    this.name = 'HumanInterventionRequired';
  }
}
```

### 7.3 数据库支持

```typescript
// 人工介入请求
interface InterventionRequest {
  id: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  error: string;
  message: string;
  options: InterventionOption[];
  status: 'pending' | 'completed' | 'cancelled';
  humanDecision?: HumanDecision;
  metadata: {
    sessionId?: string;
    taskId?: string;
    timestamp: number;
  };
}

// 人类决策
interface HumanDecision {
  action: 'retry' | 'rollback' | 'fail';
  rollbackTo?: string;
  feedback?: string;
  timestamp: number;
}
```

### 7.4 API 端点

```typescript
// 请求人工介入
POST /api/workflows/:workflowId/intervene
Body: {
  stepId: string;
  action: 'retry' | 'rollback' | 'fail';
  rollbackTo?: string;
  feedback?: string;
}

// 查询介入状态
GET /api/workflows/interventions/:interventionId
Response: InterventionRequest

// 人类决策（恢复流水线）
POST /api/workflows/interventions/:interventionId/decision
Body: HumanDecision

// 查询流水线状态
GET /api/workflows/:workflowId/status
Response: {
  workflowId: string;
  status: 'running' | 'waiting_intervention' | 'completed' | 'failed';
  currentStep?: string;
  interventionId?: string;
}
```

---

## 8. 完整示例

### 场景：带回滚的全自动研发流水线

```yaml
# workflows/full-development-pipeline/workflow.yaml

name: "full-development-pipeline"
description: "完整的全自动研发流水线（支持回滚）"

steps:
  # ┌─────────────────┐
  # │  产品经理        │
  # └────────┬────────┘
  - id: product-manager
    name: "需求分析"
    agent: product-manager
    output:
      requirement: "structuredOutput"

  # ┌─────────────────┐
  # │  架构师          │
  # └────────┬────────┘
  - id: architect
    name: "架构设计"
    agent: architect
    depends_on: [product-manager]
    input:
      requirement: "{{ requirement }}"
    output:
      architecture: "structuredOutput"

  # ┌─────────────────┐
  # │  技术设计        │
  # └────────┬────────┘
  - id: technical-designer
    name: "详细设计"
    agent: technical-designer
    depends_on: [architect]
    input:
      architecture: "{{ architecture }}"
    output:
      detailDesign: "structuredOutput"

  # ┌─────────────────┐       on_failure
  # │  开发 Agent      │◄────────────────┐
  # └────────┬────────┘                 │
  #          │ depends_on              │
  #          ▼                          │
  # ┌─────────────────┐                 │
  # │  测试 Agent      │                 │
  # │  on_failure:     │                 │
  # │    rollback_to:  │─────────────────┘
  # │    developer     │
  # └─────────────────┘
  - id: developer
    name: "代码生成"
    agent: developer
    depends_on: [technical-designer]
    input:
      detailDesign: "{{ detailDesign }}"

    # ⭐ 重试配置
    retry:
      maxAttempts: 5
      backoff: exponential
      backoffMs: 1000

    output:
      code: "structuredOutput"

  - id: tester
    name: "测试验证"
    agent: tester
    depends_on: [developer]
    input:
      code: "{{ code }}"

    # ⭐ 测试失败回滚
    on_failure:
      action: rollback
      rollback_to: developer
      message: "测试失败，重新开发"
```

---

## 9. API 设计

### 9.1 触发人工介入

```bash
# API 端点
POST /api/workflows/full-development-pipeline/execute

# 请求体
{
  "input": {
    "task": "实现用户登录功能"
  },
  "options": {
    "sessionId": "session-123",
    "taskId": "task-456"
  }
}

# 响应（成功）
{
  "success": true,
  "output": {...}",
  "executionTime": 12345,
  "steps": [...]
}

# 响应（需要人工介入）
{
  "success": false,
  "error": "Human intervention required",
  "executionTime": 0,
  "interventionId": "intervention-789",
  "requiresHumanIntervention": true,
  "steps": [...]
}
```

### 9.2 人类决策

```bash
# 查询介入详情
GET /api/workflows/interventions/intervention-789

# 响应
{
  "id": "intervention-789",
  "workflowName": "full-development-pipeline",
  "stepId": "tester",
  "stepName": "测试验证",
  "error": "测试失败：3/10 测试用例失败",
  "message": "测试失败，重新开发",
  "status": "pending",
  "options": [
    {
      "label": "重测",
      "action": "retry"
    },
    {
      "label": "回到开发",
      "action": "rollback",
      "rollbackTo": "developer"
    },
    {
      "label": "回到架构设计",
      "action": "rollback",
      "rollbackTo": "architect"
    },
    {
      "label": "标记为失败",
      "action": "fail"
    }
  ]
}

# 人类决策
POST /api/workflows/interventions/intervention-789/decision

{
  "action": "rollback",
  "rollbackTo": "developer",
  "feedback": "修复边界条件处理"
}
```

---

## 10. 与现有机制的集成

### 10.1 现有 Workflow 功能（保持不变）

- ✅ 依赖管理 (`depends_on`)
- ✅ 条件执行 (`condition`)
- ✅ 并行执行 (`parallel`)
- ✅ 输入输出映射 (`input`/`output`)

### 10.2 新增功能（本设计）

- ⭐ 重试机制 (`retry`)
- ⭐ 失败处理 (`on_failure`)
- ⭐ 回滚到前面步骤 (`on_failure.rollback_to`)
- ⭐ 人工介入 (`on_failure.action: human_intervention`)

### 10.3 兼容性

```yaml
# 现有配置（无 on_failure）→ 正常工作
steps:
  - id: step1
    agent: agent1
    # 没有 on_failure
    # → 失败则停止（默认行为）

# 新配置（有 on_failure）→ 增强功能
steps:
  - id: step1
    agent: agent1
    on_failure:
      action: retry
    # → 失败则重试（新功能）
```

---

## 11. 实施路线图

### Phase 1: 类型扩展（1周）

- [ ] 扩展 `WorkflowStep` 类型
- [ ] 添加 `RetryConfig`、`FailureHandler`
- [ ] 添加 `InterventionOption`
- [ ] 单元测试

### Phase 2: Engine 实现（2周）

- [ ] `executeStepWithRetry` 实现
- [ ] `handleStepFailure` 实现
- [ ] `handleHumanIntervention` 实现
- [ ] `resumeFromIntervention` 实现
- [ ] `clearContextAfter` 实现
- [ ] 集成测试

### Phase 3: 数据库和 API（1周）

- [ ] 数据库表设计
- [ ] InterventionRequest 模型
- [ ] API 端点实现
- [ ] 测试

### Phase 4: Agent 层支持（1周）

- [ ] 实现 `ValidationHook`
- [ ] 实现 `FeedbackLoopHook`（可选）
- [ ] 配置文档

### Phase 5: 完整流程测试（1周）

- [ ] 端到端测试
- [ ] 文档完善
- [ ] 示例配置

---

## 12. 总结

### 核心设计原则

1. **分层清晰**：Agent 层自检，Workflow 层编排
2. **简化设计**：避免过度复杂的智能决策
3. **人类决策**：复杂情况由人类决定
4. **渐进增强**：在现有机制上扩展，不破坏兼容性

### 关键特性

- ✅ **重试**：Agent 失败后自动重试
- ✅ **回滚**：跨 Agent 验证失败后回滚到前面步骤
- ✅ **人工介入**：无法自动处理时请求人类决策
- ✅ **条件性处理**：根据环境/上下文选择不同策略

### 与现有 Workflow 的关系

```
现有 Workflow：
- ✅ 依赖管理 (depends_on)
- ✅ 条件执行 (condition)
- ✅ 并行执行 (parallel)
- ✅ 输入输出映射

本设计新增：
- ⭐ 重试机制 (retry)
- ⭐ 错误恢复 (on_failure)
- ⭐ 人工介入 (human_intervention)
- ⭐ 回滚机制 (rollback_to)
```

---

**文档状态**: 🟡 设计阶段
**下一步**: 开始实施 Phase 1（类型扩展）
