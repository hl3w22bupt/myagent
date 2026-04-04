# 人工干预机制 - 简化方案

> **核心思路**：在 Workflow 中支持一个新的 Step 类型 `hitl`，作为显式的人工卡点
> **工作量**：1-2 天（vs 之前的 5-7 天）
> **覆盖场景**：90% 的 HITL 需求

---

## 1. 设计原则

**KISS（Keep It Simple, Stupid）**：
- ❌ 不需要 InterventionHook
- ❌ 不需要新的 API 端点（复用现有的 HITL 机制）
- ❌ 不需要复杂的签名验证
- ✅ 只需要在 Workflow 中支持 `hitl` step 类型

**复用现有机制**：
- ✅ 复用 `TaskContext.hitlState` 状态管理
- ✅ 复用 `awaiting_clarification` Stream 事件
- ✅ 复用现有的 HITL UI 和决策提交逻辑

---

## 2. Workflow 配置示例

### 2.1 基本用法

```yaml
name: "deployment-workflow"
description: "部署流程"

steps:
  # Step 1: 代码审查
  - id: code-review
    name: "代码审查"
    agent: code-reviewer
    input:
      task: "审查 PR #123 的代码"

  # ⭐ HITL 卡点：审查结果确认
  - id: review-approval
    name: "人工确认审查结果"
    type: hitl  # ← 新的 step 类型
    hitl:
      question: "代码审查已完成，是否通过？"
      context:
        from_step: code-review  # 显示前一步的输出
      options:
        - id: approve
          label: "批准"
          description: "审查通过，继续部署"
          action: continue  # 继续下一步
        - id: reject
          label: "拒绝"
          description: "审查不通过，中止部署"
          action: abort  # 中止工作流
        - id: retry
          label: "重新审查"
          description: "要求 Agent 重新审查"
          action: retry
          retry_step: code-review  # 重试指定步骤

  # Step 2: 部署到测试环境
  - id: deploy-staging
    name: "部署到测试环境"
    agent: deployment-agent
    depends_on: [review-approval]
    input:
      task: "部署到 staging 环境"

  # Step 3: 测试
  - id: run-tests
    name: "运行测试"
    agent: test-agent
    depends_on: [deploy-staging]

  # ⭐ HITL 卡点：测试结果确认
  - id: test-approval
    name: "测试结果确认"
    type: hitl
    hitl:
      question: "测试已完成，是否部署到生产环境？"
      context:
        from_step: run-tests
      options:
        - id: approve
          label: "部署到生产"
          action: continue
        - id: reject
          label: "测试失败，中止"
          action: abort

  # Step 4: 部署到生产环境
  - id: deploy-production
    name: "部署到生产环境"
    agent: deployment-agent
    depends_on: [test-approval]
    input:
      task: "部署到生产环境"
```

---

### 2.2 场景示例

#### 场景 1：敏感操作确认

```yaml
steps:
  - id: dangerous-operation
    name: "危险操作"
    agent: ops-agent
    input:
      task: "删除生产环境的旧数据"

  # ⭐ HITL 卡点：确认危险操作
  - id: confirm-deletion
    type: hitl
    hitl:
      question: "即将删除生产环境数据，是否确认？⚠️"
      options:
        - id: confirm
          label: "确认删除"
          action: continue
          style: danger  # 红色按钮
        - id: cancel
          label: "取消操作"
          action: abort
```

#### 场景 2：质量门禁

```yaml
steps:
  - id: generate-code
    name: "生成代码"
    agent: code-generator
    input:
      task: "生成用户认证模块代码"

  # ⭐ HITL 卡点：代码质量审核
  - id: quality-gate
    type: hitl
    hitl:
      question: "请审核生成的代码质量"
      context:
        from_step: generate-code
        show_fields:
          - code
          - test_coverage
          - complexity
      options:
        - id: pass
          label: "质量合格，继续"
          action: continue
        - id: fail
          label: "质量不合格，重新生成"
          action: retry
          retry_step: generate-code
        - id: modify
          label: "手动修改后继续"
          action: continue
          # 允许用户修改输出
          allow_modify: true
```

#### 场景 3：多路径决策

```yaml
steps:
  - id: analyze
    name: "分析需求"
    agent: analyst
    input:
      task: "分析用户需求"

  # ⭐ HITL 卡点：选择实现方案
  - id: choose-approach
    type: hitl
    hitl:
      question: "请选择实现方案："
      options:
        - id: monolithic
          label: "单体架构"
          description: "快速实现，适合小规模"
          action: continue
          set_context:
            approach: monolithic
        - id: microservices
          label: "微服务架构"
          description: "可扩展，适合大规模"
          action: continue
          set_context:
            approach: microservices
        - id: serverless
          label: "无服务器架构"
          description: "成本优化，适合波动负载"
          action: continue
          set_context:
            approach: serverless

  # 后续步骤根据选择执行
  - id: implement
    name: "实现方案"
    agent: developer
    depends_on: [choose-approach]
    input:
      task: "按照 {{ choose-approach.context.approach }} 方案实现"
```

---

## 3. 类型定义

### 3.1 WorkflowStep 类型扩展

```typescript
// src/core/workflow/types.ts

export type WorkflowStepType = 'agent' | 'subworkflow' | 'hitl';

export interface HITLStepConfig {
  /** 向人类提出的问题 */
  question: string;

  /** 显示前一步的输出作为上下文 */
  context?: {
    from_step?: string;  // 从哪个 step 获取输出
    show_fields?: string[];  // 只显示特定字段
  };

  /** 选项列表 */
  options: HITLOption[];
}

export interface HITLOption {
  /** 选项 ID */
  id: string;

  /** 显示标签 */
  label: string;

  /** 选项描述 */
  description?: string;

  /** 动作类型 */
  action: 'continue' | 'abort' | 'retry';

  /** 样式（影响 UI） */
  style?: 'primary' | 'secondary' | 'danger' | 'warning';

  /** 重试时要重新执行的 step */
  retry_step?: string;

  /** 设置上下文变量（供后续步骤使用） */
  set_context?: Record<string, any>;

  /** 是否允许用户修改输出 */
  allow_modify?: boolean;
}

export interface WorkflowStep {
  id: string;
  name?: string;

  // ⭐ 新增类型
  type?: WorkflowStepType;

  // Agent Step 专用
  agent?: string;
  input?: Record<string, any>;

  // HITL Step 专用
  hitl?: HITLStepConfig;

  // 通用字段
  depends_on?: string[];
  output?: Record<string, string | OutputMapping>;
  // ... 其他现有字段
}
```

---

## 4. 实现逻辑

### 4.1 WorkflowEngine.executeStep()

```typescript
// src/core/workflow/engine.ts

private async executeStep(
  step: WorkflowStep,
  context: WorkflowContext,
  workflow: WorkflowConfig,
  options: WorkflowOptions
): Promise<WorkflowExecutionStep> {
  // ⭐ 新增：处理 HITL step
  if (step.type === 'hitl') {
    return await this.executeHITLStep(step, context, workflow, options);
  }

  // 现有逻辑：agent step
  const agent = await this.agentManager.acquire(step.agent, {
    sessionId: options.sessionId,
  });

  const result = await agent.run(step.input?.task || '', options.taskId, {
    ...context,
    ...step.input,
  });

  // ... 现有逻辑
}
```

### 4.2 executeHITLStep()

```typescript
/**
 * 执行 HITL 步骤
 */
private async executeHITLStep(
  step: WorkflowStep,
  context: WorkflowContext,
  workflow: WorkflowConfig,
  options: WorkflowOptions
): Promise<WorkflowExecutionStep> {
  this.logger.info('[WorkflowEngine] Executing HITL step', {
    stepId: step.id,
    stepName: step.name,
  });

  const hitl = step.hitl!;
  const taskId = options.taskId || `workflow-${Date.now()}`;

  // 1. 获取上下文（前一步的输出）
  let contextOutput: any = null;
  if (hitl.context?.from_step) {
    const fromStepId = hitl.context.from_step;
    const fromStep = this.internalExecutionSteps.find(s => s.stepId === fromStepId);
    if (fromStep?.output) {
      contextOutput = fromStep.output;

      // 如果指定了 show_fields，只显示特定字段
      if (hitl.context.show_fields) {
        contextOutput = hitl.context.show_fields.reduce((acc, field) => {
          if (field in contextOutput) {
            acc[field] = contextOutput[field];
          }
          return acc;
        }, {} as any);
      }
    }
  }

  // 2. 保存 HITL 状态（复用现有机制）
  const contextManager = new ContextManager();
  const existingContext = await contextManager.getContext(taskId);

  if (existingContext) {
    existingContext.hitlState = {
      stage: 'in_execution',
      status: 'awaiting',
      agentName: `Workflow:${workflow.name}`,
      question: hitl.question,
      contextOutput,  // ⭐ 附加上下文输出
      options: hitl.options.map(opt => ({
        id: opt.id,
        label: opt.label,
        description: opt.description,
        action: opt.action,
        style: opt.style,
      })),
      createdAt: new Date(),
      workflowName: workflow.name,
      stepId: step.id,
      retryAttempt: 0,
    };

    await contextManager.saveContext(existingContext);
  }

  // 3. 发送 Stream 事件（复用现有机制）
  const streams = getAgentStreams();
  if (streams?.taskExecution) {
    streams.taskExecution.emit({
      type: 'awaiting_clarification',
      progressType: 'hitl',
      status: 'awaiting_clarification',
      taskId,
      sessionId: options.sessionId,
      timestamp: new Date().toISOString(),
      data: {
        stage: 'in_execution',
        agentName: `Workflow:${workflow.name}`,
        question: hitl.question,
        options: hitl.options.map(opt => opt.label),
        context: contextOutput,  // ⭐ 附加上下文
      },
    });
  }

  // 4. 轮询等待决策（复用现有 HITL 轮询逻辑）
  const pollInterval = 5000;  // 5 秒
  const timeout = 7 * 24 * 60 * 60 * 1000;  // 7 天（与现有 HITL 一致）
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // 等待轮询间隔
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    // 检查状态
    const updatedContext = await contextManager.getContext(taskId);
    if (!updatedContext?.hitlState) {
      continue;
    }

    const hitlState = updatedContext.hitlState;

    // 检查是否有响应
    if (hitlState.status === 'completed' && hitlState.response) {
      this.logger.info('[WorkflowEngine] HITL decision received', {
        stepId: step.id,
        decision: hitlState.response.decision,
      });

      // 清除 HITL 状态
      delete updatedContext.hitlState;
      await contextManager.saveContext(updatedContext);

      // 执行决策动作
      return await this.executeHITLAction(
        step,
        context,
        workflow,
        options,
        hitlState.response,
        contextOutput
      );
    }
  }

  // 超时
  this.logger.warn('[WorkflowEngine] HITL timeout', {
    stepId: step.id,
  });

  return {
    stepId: step.id,
    status: 'failed',
    error: 'HITL timeout: no decision received',
  };
}
```

### 4.3 executeHITLAction()

```typescript
/**
 * 执行 HITL 决策动作
 */
private async executeHITLAction(
  step: WorkflowStep,
  context: WorkflowContext,
  workflow: WorkflowConfig,
  options: WorkflowOptions,
  response: any,
  contextOutput?: any
): Promise<WorkflowExecutionStep> {
  const hitl = step.hitl!;
  const selectedOption = hitl.options.find(opt => opt.id === response.decision);

  if (!selectedOption) {
    return {
      stepId: step.id,
      status: 'failed',
      error: `Invalid decision: ${response.decision}`,
    };
  }

  this.logger.info('[WorkflowEngine] Executing HITL action', {
    stepId: step.id,
    action: selectedOption.action,
  });

  // 根据动作类型执行
  switch (selectedOption.action) {
    case 'continue':
      // 继续下一步
      // 如果设置了 set_context，更新上下文
      if (selectedOption.set_context) {
        Object.assign(context.variables, selectedOption.set_context);
      }

      return {
        stepId: step.id,
        status: 'completed',
        output: {
          decision: selectedOption.id,
          label: selectedOption.label,
          context: contextOutput,
          // 如果允许修改，包含用户的修改
          modifiedOutput: response.modifiedOutput,
        },
      };

    case 'abort':
      // 中止工作流
      return {
        stepId: step.id,
        status: 'failed',
        error: `Aborted by HITL: ${selectedOption.label}`,
      };

    case 'retry':
      // 重试指定的步骤
      const retryStepId = selectedOption.retry_step || step.id;
      this.logger.info('[WorkflowEngine] Retrying step', {
        retryStepId,
      });

      // 找到要重试的步骤并重新执行
      const retryStep = workflow.steps.find(s => s.id === retryStepId);
      if (!retryStep) {
        return {
          stepId: step.id,
          status: 'failed',
          error: `Retry step not found: ${retryStepId}`,
        };
      }

      // 递归执行（注意重试次数限制）
      const retryResult = await this.executeStep(retryStep, context, workflow, options);

      // 如果重试成功，当前 HITL step 也标记为完成
      if (retryResult.status === 'completed') {
        return {
          stepId: step.id,
          status: 'completed',
          output: {
            decision: selectedOption.id,
            label: selectedOption.label,
            retriedStep: retryStepId,
            retryResult: retryResult.output,
          },
        };
      } else {
        return {
          stepId: step.id,
          status: 'failed',
          error: `Retry failed: ${retryResult.error}`,
        };
      }

    default:
      return {
        stepId: step.id,
        status: 'failed',
        error: `Unknown action: ${selectedOption.action}`,
      };
  }
}
```

---

## 5. UI 交互流程

### 5.1 前端显示

当 Workflow 执行到 `hitl` step 时：

```
┌─────────────────────────────────────────┐
│  HITL - 人工介入                        │
├─────────────────────────────────────────┤
│                                          │
│  问题：代码审查已完成，是否通过？        │
│                                          │
│  ┌─────────────────────────────────┐   │
│  │ 上下文（前一步输出）             │   │
│  │ ─────────────────────────────── │   │
│  │ 代码质量评分: 85/100             │   │
│  │ 测试覆盖率: 78%                  │   │
│  │ 安全问题: 0                      │   │
│  └─────────────────────────────────┘   │
│                                          │
│  请选择：                               │
│                                          │
│  [🟢 批准]   继续部署                    │
│  [🔴 拒绝]   中止部署                    │
│  [🟡 重新审查] 要求 Agent 重新审查       │
│                                          │
│  [允许修改输出并继续] ✓                  │
│  [修改内容]                              │
│  ┌─────────────────────────────────┐   │
│  │ （可编辑的文本框）                │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### 5.2 API 交互（复用现有端点）

**前端轮询状态**：
```typescript
// 复用现有的 task-context API
const taskContext = await fetch(`/api/contexts/${taskId}`);
const hitlState = taskContext.hitlState;

if (hitlState?.status === 'awaiting') {
  // 显示干预 UI
  showInterventionUI({
    question: hitlState.question,
    context: hitlState.contextOutput,  // ⭐ 新增字段
    options: hitlState.options,
  });
}
```

**提交决策**（复用现有端点）：
```typescript
// 复用现有的 /api/tasks/:id/hitl 端点
await fetch(`/api/tasks/${taskId}/hitl`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    decision: selectedOption.id,  // 'approve' | 'reject' | 'retry'
    feedback: userFeedback,
    modifiedOutput: userModifiedOutput,  // 可选
  }),
});
```

---

## 6. 与现有 HITL 的关系

### 6.1 复用现有机制

| 现有机制 | 复用方式 |
|---------|---------|
| `TaskContext.hitlState` | ✅ 完全复用，新增 `contextOutput` 字段 |
| Stream 事件 `awaiting_clarification` | ✅ 完全复用，新增 `context` 字段 |
| `/api/tasks/:id/hitl` 端点 | ✅ 完全复用，支持 `modifiedOutput` |
| HITL UI | ✅ 复用，增加上下文显示和编辑功能 |

### 6.2 两种 HITL 的区别

| 特性 | Workflow 失败 HITL（现有） | HITL Step（新增） |
|-----|------------------------|----------------------|
| **触发条件** | Step 执行失败 | 显式配置在 workflow 中 |
| **配置位置** | `on_failure: hitl` | `type: hitl` |
| **控制权** | Workflow Engine 控制 | 用户主动配置 |
| **灵活性** | 只能处理失败 | 任意卡点 |
| **用途** | 错误恢复 | 流程控制、质量门禁 |

---

## 7. 工作量估算

| 任务 | 时间 | 说明 |
|------|------|------|
| 类型定义 | 0.5 天 | `HITLStepConfig` 接口 |
| `executeHITLStep()` | 0.5 天 | 核心执行逻辑 |
| `executeHITLAction()` | 0.5 天 | 动作执行（continue/abort/retry） |
| 前端 UI 适配 | 0.5 天 | 显示上下文、支持编辑 |
| 测试 | 0.5 天 | 单元测试 + 集成测试 |
| **总计** | **2-3 天** | vs 之前的 5-7 天 |

---

## 8. 总结

**核心优势**：
1. ✅ **简单**：不需要新的 API 端点、不需要 Hook、不需要签名验证
2. ✅ **灵活**：哪里需要人工介入，就在 workflow 中加一个 `type: hitl` step
3. ✅ **复用**：完全复用现有的 HITL 机制
4. ✅ **直观**：在 workflow.yaml 中一眼就能看出所有人肉卡点

**覆盖场景**：
- ✅ 敏感操作确认（部署、删除、支付）
- ✅ 质量门禁（代码审查、测试结果）
- ✅ 多路径决策（选择实现方案）
- ✅ 任意人工审核（文档、设计、报告）

**不适用场景**（需要更复杂机制）：
- ❌ Agent 执行过程中的实时干预（需要 InterventionHook）
- ❌ 非 Workflow 场景的单 Agent 调用（但可以通过包装成单步 Workflow 解决）

**建议**：
- 🚀 **先实现这个简化版本**（2-3 天）
- 🔄 **根据实际需求再考虑扩展**（如 InterventionHook）
