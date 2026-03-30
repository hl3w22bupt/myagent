# Workflow System 详解

> 多步骤工作流编排系统

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 Workflow System 是什么？

**Workflow System** 是 MyAgent 的**多步骤编排系统**，能够将多个 Agent/Subagent 按照定义的流程组合起来，完成复杂的多步骤任务。

### 核心能力

- ✅ **步骤编排**: 定义多步骤执行流程
- ✅ **依赖管理**: 自动处理步骤依赖关系
- ✅ **条件执行**: 根据中间结果决定是否执行某步骤
- ✅ **并行执行**: 多个迭代并行执行
- ✅ **子工作流**: 工作流嵌套调用
- ✅ **输入输出映射**: 灵活的数据流转

---

## 🏗️ 架构设计

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│  WorkflowEngine (编排引擎)                               │
│  - registerWorkflow()  注册工作流                        │
│  - execute()          执行工作流                         │
│  - topologicalSort()  依赖排序                          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  WorkflowContext (执行上下文)                            │
│  - 输入数据                                              │
│  - 中间变量                                              │
│  - 步骤状态                                              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  WorkflowSteps (步骤定义)                                │
│  - Agent/Subagent 调用                                  │
│  - 依赖关系 (depends_on)                                │
│  - 条件执行 (condition)                                 │
│  - 并行执行 (parallel)                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Workflow 配置

### 基础结构

```yaml
name: "工作流名称"
description: "工作流描述"

# 输入 Schema
input_schema:
  input1:
    type: string
    required: true
  input2:
    type: number
    default: 10

# 输出 Schema
output_schema:
  output1: object
  output2: array

# 步骤定义
steps:
  - id: step1
    name: "步骤 1"
    agent: subagent-name
    input:
      param1: "{{ input.input1 }}"
    output:
      result1: "structuredOutput"

  - id: step2
    name: "步骤 2"
    agent: another-subagent
    depends_on: [step1]
    input:
      param1: "{{ result1 }}"
    output:
      result2: "structuredOutput"

# 最终输出映射
output:
  output1:
    from: "result1"
  output2:
    from: "result2"
```

---

## 🔄 执行流程

### 1. 依赖排序

WorkflowEngine 使用**拓扑排序**确保步骤按正确顺序执行：

```typescript
// 自动处理依赖关系
const sortedSteps = workflowEngine.topologicalSort(steps);

// 示例：
// Step B depends on [A]
// Step C depends on [A, B]
// 执行顺序: A → B → C
```

### 2. 输入渲染

```typescript
// 模板变量渲染
input:
  code: "{{ input.code }}"           // 来自工作流输入
  analysis: "{{ analysisResult }}"   // 来自前面步骤的输出
```

### 3. Agent 调用

```typescript
// 直接调用 Subagent（不经过 MasterAgent）
const agent = await agentManager.acquire(sessionId, {
  agentType: 'agent',
});

const result = await agent.run(taskDescription, taskId, {
  workflowName: workflow.name,
  workflowStepId: step.id,
  workflowInput: renderedInput,
});
```

### 4. 输出提取

```typescript
// 从 Agent 结果中提取输出
output:
  analysisResult: "structuredOutput"              // 完整的结构化输出
  score: "structuredOutput.data.score"           // 嵌套属性
  message: "structuredOutput.content.message"    // 深层嵌套
```

---

## 📊 实际示例

### 示例 1: 代码审查工作流

**文件**: `workflows/code-review-pipeline/workflow.yaml`

```yaml
name: "代码审查工作流"
description: "分析 -> 审查 -> 安全检查"

input_schema:
  code:
    type: string
    required: true
  language:
    type: string
    default: typescript

output_schema:
  analysis: object
  review: object
  security: object

steps:
  # Step 1: Code analysis
  - id: analysis
    name: "代码分析"
    agent: data-analyst
    input:
      code: "{{ input.code }}"
      language: "{{ input.language }}"
    output:
      analysisResult: "structuredOutput"

  # Step 2: Code review
  - id: review
    name: "代码审查"
    agent: code-reviewer
    depends_on: [analysis]  # 依赖 analysis 步骤
    input:
      code: "{{ input.code }}"
      analysis: "{{ analysisResult }}"  # 使用上一步的输出
    output:
      reviewResult: "structuredOutput"

  # Step 3: Security audit
  - id: security
    name: "安全审计"
    agent: security-auditor
    depends_on: [review]  # 依赖 review 步骤
    input:
      code: "{{ input.code }}"
      review: "{{ reviewResult }}"  # 使用上一步的输出
    output:
      securityResult: "structuredOutput"

# 映射中间变量到最终输出
output:
  analysis:
    from: "analysisResult"
  review:
    from: "reviewResult"
  security:
    from: "securityResult"
```

**执行流程**:
```
用户输入 (code, language)
    ↓
Step 1: data-analyst (代码分析)
    ↓
analysisResult (中间变量)
    ↓
Step 2: code-reviewer (代码审查，使用 analysisResult)
    ↓
reviewResult (中间变量)
    ↓
Step 3: security-auditor (安全审计，使用 reviewResult)
    ↓
securityResult (中间变量)
    ↓
最终输出: { analysis, review, security }
```

---

### 示例 2: 简单开发工作流

**文件**: `workflows/simple-dev-workflow/workflow.yaml`

```yaml
name: "简单开发工作流"
description: "开发分析 -> 代码实现"

input_schema:
  requirement:
    type: string
    required: true

output_schema:
  plan: object
  implementation: object

steps:
  - id: plan
    name: "制定计划"
    agent: developer-engineer
    input:
      requirement: "{{ input.requirement }}"
    output:
      planResult: "structuredOutput"

  - id: implement
    name: "实现代码"
    agent: developer-engineer
    depends_on: [plan]
    input:
      requirement: "{{ input.requirement }}"
      plan: "{{ planResult }}"  # 引用上一步的输出
    output:
      implementationResult: "structuredOutput"

# Map intermediate variables to final output
output:
  plan:
    from: "planResult"
  implementation:
    from: "implementationResult"
```

---

### 示例 3: 条件工作流

**文件**: `workflows/conditional-workflow/workflow.yaml`

```yaml
name: "条件执行工作流"
description: "根据条件决定是否执行某些步骤"

steps:
  - id: analyze
    name: "分析代码"
    agent: code-reviewer
    output:
      analysisResult: "structuredOutput"

  - id: fix
    name: "修复问题"
    agent: developer-engineer
    depends_on: [analyze]
    condition:
      field: "analysisResult.data.issues.length"
      operator: ">"
      value: 0
    input:
      issues: "{{ analysisResult.data.issues }}"
    output:
      fixResult: "structuredOutput"
```

**条件逻辑**:
- 只有当 `analysisResult.data.issues.length > 0` 时，才执行 `fix` 步骤
- 如果问题数为 0，跳过 `fix` 步骤

---

## 🎯 高级特性

### 1. 条件执行

#### 单一条件

```yaml
condition:
  field: "variableName"
  operator: ">"
  value: 10
```

#### 多条件 (all)

```yaml
conditions:
  all:
    - field: "score"
      operator: ">="
      value: 80
    - field: "issues.length"
      operator: "=="
      value: 0
```

#### 多条件 (any)

```yaml
conditions:
  any:
    - field: "status"
      operator: "=="
      value: "success"
    - field: "retryCount"
      operator: "<"
      value: 3
```

#### 多条件 (none)

```yaml
conditions:
  none:
    - field: "errors"
      operator: "in"
      value: ["critical", "fatal"]
```

**支持的运算符**:
- `==` 相等
- `!=` 不等
- `>` 大于
- `<` 小于
- `>=` 大于等于
- `<=` 小于等于
- `in` 包含于数组
- `not_in` 不包含于数组

---

### 2. 并行执行

```yaml
- id: parallel-analysis
    name: "并行分析多种语言"
    agent: code-reviewer
    parallel:
      iterations:
        - lang: python
          code: "{{ input.pythonCode }}"
        - lang: javascript
          code: "{{ input.jsCode }}"
        - lang: typescript
          code: "{{ input.tsCode }}"
      concurrency: 3  # 同时执行 3 个
      merge_to: "results.{{ iteration.lang }}"
    output:
      parallelResults: "structuredOutput"
```

**配置说明**:
- `iterations`: 并行执行的迭代数组
- `concurrency`: 并发数（默认全部并行）
- `merge_to`: 结果合并路径
- `merge_strategy`: 合并策略（collect/merge/overwrite/append）

---

### 3. 子工作流

```yaml
- id: subworkflow-call
    name: "调用子工作流"
    type: subworkflow
    subworkflow: "code-review-pipeline"  # 子工作流名称
    input:
      code: "{{ input.code }}"
      language: "{{ input.language }}"
    output:
      subResult: "structuredOutput"
```

---

### 4. 总是执行 (always_run)

```yaml
- id: cleanup
    name: "清理资源"
    agent: system-agent
    always_run: true  # 即使前面步骤失败也执行
```

---

## 💡 输出映射

### 基础映射

```yaml
output:
  result1:
    from: "step1Result"  # 简单引用
  result2:
    from: "step2Output.data.score"  # 嵌套属性
```

### 带默认值

```yaml
output:
  result:
    from: "stepResult"
    default: null  # 如果 stepResult 不存在，使用 null
```

### 输出路径

```typescript
// 从 Agent 结果中提取
"output"              // result.output
"structuredOutput"    // result.structuredOutput
"structuredOutput.data.score"  // result.structuredOutput.data.score
"metadata.executionTime"        // result.metadata.executionTime
```

---

## 🔧 配置和调优

### Workflow Engine 配置

```typescript
// 创建 WorkflowEngine
const workflowEngine = new WorkflowEngine(agentManager, logger);

// 注册工作流
workflowEngine.registerWorkflow('code-review-pipeline', workflowConfig);

// 批量注册
workflowEngine.registerWorkflows({
  'workflow1': config1,
  'workflow2': config2,
});
```

### 执行选项

```typescript
interface WorkflowOptions {
  taskId?: string;           // 任务 ID
  sessionId?: string;        // 会话 ID
  timeout?: number;          // 超时时间
  dryRun?: boolean;          // 试运行（不实际执行）
  parentContext?: any;       // 父上下文
  parentSessionId?: string;  // 父会话 ID（用于 trace 分组）
}
```

---

## 🚨 错误处理

### 步骤失败

```yaml
- id: risky-step
    name: "可能失败的步骤"
    agent: some-agent
    always_run: false  # 默认：失败则停止后续步骤
```

**行为**:
- 步骤失败 → 停止工作流（除非 `always_run: true`）
- 返回失败信息
- 包含已执行的步骤结果

### 错误处理

```typescript
const result = await workflowEngine.execute('workflow-name', input, options);

if (!result.success) {
  console.error('Workflow failed:', result.error);
  console.log('Completed steps:', result.steps);
}
```

---

## 🔍 调试和监控

### 查看工作流列表

```typescript
const workflows = workflowEngine.listWorkflows();
console.log('Available workflows:', workflows.map(w => w.name));
```

### 查看执行结果

```typescript
const result = await workflowEngine.execute('workflow-name', input);

console.log('Execution time:', result.executionTime);
console.log('Steps executed:', result.steps.length);
console.log('Context variables:', result.context);
```

### 步骤状态

```typescript
result.steps.forEach(step => {
  console.log(`Step ${step.stepId}:`, {
    status: step.status,  // pending/running/completed/failed/skipped
    executionTime: step.executionTime,
    error: step.error,
    reason: step.reason,  // 跳过原因
  });
});
```

---

## 💡 最佳实践

### 1. 合理拆分步骤

❌ **不好**: 一个步骤做太多事情

```yaml
steps:
  - id: everything
    agent: super-agent
    input: {...}
```

✅ **好**: 拆分为多个职责明确的步骤

```yaml
steps:
  - id: analyze
    agent: analyzer
  - id: review
    agent: reviewer
    depends_on: [analyze]
  - id: fix
    agent: fixer
    depends_on: [review]
```

---

### 2. 明确依赖关系

```yaml
steps:
  - id: step1
    agent: agent1
  - id: step2
    agent: agent2
    depends_on: [step1]  # 明确声明依赖
  - id: step3
    agent: agent3
    depends_on: [step1, step2]  # 多依赖
```

---

### 3. 使用条件避免不必要的执行

```yaml
- id: fix
    agent: fixer
    depends_on: [analyze]
    conditions:
      any:
        - field: "analyzeResult.issues.length"
          operator: ">"
          value: 0
        - field: "analyzeResult.hasErrors"
          operator: "=="
          value: true
```

---

### 4. 合理使用并行

```yaml
- id: parallel-checks
    agent: checker
    parallel:
      iterations: [...]
      concurrency: 3  # 限制并发数，避免资源耗尽
```

---

## 📈 性能优化

### 1. 减少步骤间数据传递

```yaml
# ❌ 传递大量数据
input:
  largeData: "{{ step1Result }}"  # 整个结果

# ✅ 只传递需要的字段
input:
  summary: "{{ step1Result.data.summary }}"
  score: "{{ step1Result.data.score }}"
```

### 2. 使用并行加速

```yaml
# 独立任务并行执行
- id: parallel-tasks
    parallel:
      iterations: [task1, task2, task3]
      concurrency: 3
```

### 3. 条件跳过不必要步骤

```yaml
- id: optional-step
    condition:
      field: "config.enableOptional"
      operator: "=="
      value: true
```

---

## 🔮 未来优化方向

### 1. 循环支持

```yaml
steps:
  - id: iterative-process
    agent: processor
    loop:
      while:
        field: "result.hasMore"
        operator: "=="
        value: true
      max_iterations: 10
      break_on:
        field: "result.status"
        operator: "=="
        value: "complete"
```

### 2. 动态工作流

```typescript
// 运行时动态生成工作流
const dynamicWorkflow = generateWorkflow(input);
workflowEngine.registerWorkflow('dynamic', dynamicWorkflow);
```

### 3. 工作流可视化

```typescript
// 生成工作流执行图
const graph = workflowEngine.getExecutionGraph(result);
```

### 4. 重试机制

```yaml
- id: flaky-step
    agent: unreliable-agent
    retry:
      maxAttempts: 3
      backoff: exponential
```

---

## 📖 相关文档

- [MasterAgent](./master-agent.md) - Agent 委派系统
- [Agent 系统](./agent-system.md) - Agent 基础
- [Extension Guide](./extension-guide.md) - Hook vs Skill vs Subagent vs Workflow 选择

---

**版本**: v1.0 | **更新日期**: 2026-03-29
