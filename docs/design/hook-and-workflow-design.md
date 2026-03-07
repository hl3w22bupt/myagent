# Issue #46: Hook 和 Workflow 支持设计文档

## 目录

- [一、设计原则](#一设计原则)
- [二、可配置 Hook 系统](#二可配置-hook-系统)
- [三、Workflow 引擎设计](#三workflow-引擎设计)
- [四、Workflow 与 Agent 系统集成](#四workflow-与-agent-系统集成)
- [五、文件结构](#五文件结构)

---

## 一、设计原则

### 1.1 核心原则

1. **Workflow 是上层编排** - 不改动下层的 Agent/Skill
2. **Workflow 本质是特殊 Task** - 通过 YAML 配置的多步骤任务
3. **复用现有接口** - Workflow 内部调用 Agent.run()，完全复用现有逻辑

### 1.2 架构关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                 │
│  /api/agent/execute  →  Agent.run(task)                           │
│  /api/workflow/execute  →  WorkflowEngine.execute(workflow, input)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
┌────────────────────┐              ┌────────────────────────────────┐
│  Agent Task        │              │  Workflow Task (特殊 Task)     │
│  • 直接调用 Agent  │              │  • YAML 配置的多步骤            │
│  • 单次执行        │              │  • 复用 Agent.run()            │
└────────────────────┘              │  • 编排多个 Agent 调用         │
                                    └────────┬───────────────────────┘
                                             ▼ (复用现有接口)
                                  ┌────────────────────────────────┐
                                  │  AgentManager.acquire()       │
                                  │  agent.run(task)               │
                                  │  → PTC 生成                     │
                                  │  → Sandbox 执行                 │
                                  │  → Skill 调用                   │
                                  └────────────────────────────────┘
```

### 1.3 代码层面

```typescript
// Workflow 内部实现 - 完全复用现有接口
class WorkflowEngine {
  private agentManager: AgentManager;

  async executeStep(step: WorkflowStep, context: WorkflowContext) {
    // 1. 获取 Agent（现有接口，完全不动）
    const agent = await this.agentManager.acquire(step.agent);

    // 2. 准备输入（渲染模板）
    const taskInput = this.renderInput(step.input, context);

    // 3. 调用 Agent.run()（现有接口，完全不动）
    const result = await agent.run(JSON.stringify(taskInput));

    // 4. 提取输出（新增：从 AgentResult 取字段）
    this.extractOutput(result, step.output, context);
  }
}

// 现有的 Agent 完全不用改
class Agent {
  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    // ... 现有逻辑完全不动
  }
}
```

---

## 二、可配置 Hook 系统

### 2.1 设计理念

**核心问题**：现有的 Hook（TaskHook/AgentHook/SkillHook）都是系统内置的，无法通过配置扩展。

**解决方案**：设计一个**通用配置化 Hook（ConfigurableHook）**，作为"通用 Hook 容器"，通过配置实现大部分定制场景。

### 2.2 Hook 类型（4种）

| Hook 类型 | 触发时机 | 配置能力 |
|-----------|----------|----------|
| **http_webhook** | preExec/postExec | 发送 HTTP 请求到外部服务 |
| **condition_check** | preExec | 条件验证，可中止任务 |
| **middleware** | preExec/postExec | 拦截修改输入/输出 |
| **notification** | postExec/onProgress | 消息通知（支持 channel） |

### 2.3 配置示例

```yaml
# config/custom-hooks.yaml
version: "1.0"

# ========== Task Hooks ==========
task_hooks:
  # 示例1：条件检查 - 敏感词过滤
  content_moderation:
    type: condition_check
    trigger: preExec
    config:
      patterns:
        - regex: "<script[^>]*>.*?</script>"
          stop: true
          reason: "检测到 XSS 攻击"
        - regex: "(DROP|DELETE)\\s+TABLE"
          stop: true
          reason: "检测到 SQL 注入"

  # 示例2：HTTP Webhook - 外部审批
  external_approval:
    type: http_webhook
    trigger: preExec
    config:
      url: "http://approval-service/api/check"
      method: POST
      headers:
        Authorization: "Bearer {{ env.APPROVAL_TOKEN }}"
      body:
        task: "{{ task }}"
        userId: "{{ metadata.userId }}"
      # 响应映射：根据响应决定是否中止
      stop_on_response:
        field: "$.approved"
        operator: "=="
        value: false
      stop_reason: "$.reason"

  # 示例3：中间件 - 任务增强
  task_enrichment:
    type: middleware
    trigger: preExec
    config:
      # 设置字段
      set:
        metadata.userId: "{{ metadata.userId }}"
        metadata.timeout: "{{ env.DEFAULT_TIMEOUT }}"
      # 从外部加载数据
      load_from:
        - source: "http://config-service/user/{{ metadata.userId }}"
          target: "metadata.userConfig"
          cache_ttl: 300

  # 示例4：中间件 - 输出清洗
  output_sanitizer:
    type: middleware
    trigger: postExec
    config:
      # 删除敏感字段
      remove:
        - metadata.apiKey
        - metadata.token
      # 转换输出格式
      transform:
        result.formatted: "格式化后的 {{ result.raw }}"

  # 示例5：通知 - Lark 飞书
  lark_notify:
    type: notification
    trigger: [postExec, onProgressingNotify]
    config:
      channel: lark
      webhook: "{{ env.LARK_WEBHOOK }}"
      message_template: |
        **任务通知**
        - 任务：{{ task }}
        - 状态：{{ status }}
        - 耗时：{{ executionTime }}ms
      # 只在特定条件下发送
      send_when:
        - field: status
          operator: "in"
          value: ["failed", "completed"]

# ========== Agent Hooks ==========
agent_hooks:
  # Agent 调用链追踪
  call_chain_tracer:
    type: middleware
    trigger: preExec
    config:
      set:
        metadata.traceId: "{{ taskId }}"
        metadata.callChain: "{{ callChain }} > {{ agentType }}"

# ========== Skill Hooks ==========
skill_hooks:
  # 技能执行通知
  skill_notify:
    type: notification
    trigger: postExec
    config:
      channel: lark
      webhook: "{{ env.LARK_SKILL_WEBHOOK }}"
      message_template: |
        技能执行完成：{{ skillName }}
        耗时：{{ executionTime }}ms
```

### 2.4 核心实现

```typescript
// src/core/task/hooks/configurable-hook.ts

export class ConfigurableHook implements TaskHook {
  readonly name: string;
  private config: ConfigurableHookConfig;
  private handlers: Map<HookTrigger, HookHandler>;

  constructor(name: string, config: ConfigurableHookConfig) {
    this.name = name;
    this.config = config;
    this.handlers = new Map();
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    const handler = HookHandlerFactory.create(this.config);
    const triggers = Array.isArray(this.config.trigger)
      ? this.config.trigger
      : [this.config.trigger];

    for (const trigger of triggers) {
      this.handlers.set(trigger, handler);
    }
  }

  async preExec(context: TaskContext): Promise<PreExecResult> {
    const handler = this.handlers.get('preExec');
    if (!handler) return;
    return await handler.execute(context, this.config.config);
  }

  async postExec(context: TaskContext): Promise<void> {
    const handler = this.handlers.get('postExec');
    if (!handler) return;
    await handler.execute(context, this.config.config);
  }
}

type HookTrigger = 'preExec' | 'postExec' | 'onProgressingNotify';

type HookType =
  | 'http_webhook'
  | 'condition_check'
  | 'middleware'
  | 'notification';

class HookHandlerFactory {
  static create(config: ConfigurableHookConfig): HookHandler {
    switch (config.type) {
      case 'http_webhook': return new HttpWebhookHandler();
      case 'condition_check': return new ConditionCheckHandler();
      case 'middleware': return new MiddlewareHandler();
      case 'notification': return new NotificationHandler();
      default: throw new Error(`Unknown hook type: ${config.type}`);
    }
  }
}
```

---

## 三、Workflow 引擎设计

### 3.1 设计原则

**Workflow 是特殊 Task，不改动下层 Agent/Skill**

| 层级 | 是否改动 | 说明 |
|------|---------|------|
| Workflow Layer | **新增** | 新的编排层 |
| Agent Layer | **不变** | 完全复用现有接口 |
| Skill/Sandbox | **不变** | 完全复用现有接口 |

### 3.2 Workflow 配置 Schema

```yaml
# config/workflows.yaml
version: "1.0"

workflows:
  # 示例1：内容生成工作流
  content_generation:
    name: "内容生成工作流"
    description: "研究 -> 草稿 -> 审查 -> 定稿"

    # 输入定义
    input_schema:
      topic:
        type: string
        required: true
      tone:
        type: string
        default: professional

    # 输出定义
    output_schema:
      final_content: string
      metadata: object

    steps:
      # Step 1: 研究阶段
      - id: research
        name: "研究收集"
        agent: researcher
        input:
          topic: "{{ input.topic }}"
          apiKey: "{{ env.API_KEY }}"
        output:
          # 格式：变量名: 从 Agent 输出的哪里取
          findings:
            from: "structuredOutput.findings"
            default: []
          sources:
            from: "structuredOutput.metadata.sources"
          fullResult:
            from: "output"  # 取文本输出

      # Step 2: 草稿生成
      - id: draft
        name: "草稿生成"
        agent: writer
        depends_on: [research]
        input:
          topic: "{{ input.topic }}"
          research: "{{ findings }}"           # 引用上一步的输出
          sources: "{{ sources }}"
        output:
          draft: "structuredOutput.content"
          wordCount: "structuredOutput.word_count"

      # Step 3: 内容审查（条件分支）
      - id: review
        name: "内容审查"
        agent: reviewer
        depends_on: [draft]
        condition:
          field: "{{ wordCount }}"
          operator: ">"
          value: 100
        output:
          approved: "structuredOutput.approved"
          feedback: "structuredOutput.feedback"

      # Step 4A: 修改草稿（条件分支 - 如果未通过）
      - id: revise
        name: "修改草稿"
        agent: editor
        depends_on: [review]
        condition:
          field: "{{ approved }}"
          operator: "=="
          value: false
        input:
          content: "{{ draft }}"
          feedback: "{{ feedback }}"
        output:
          revised: "structuredOutput.revised"
        next_step: review  # 循环回 review
        max_iterations: 3

      # Step 4B: 定稿（如果通过）
      - id: finalize
        name: "最终定稿"
        agent: publisher
        depends_on: [review]
        condition:
          field: "{{ approved }}"
          operator: "=="
          value: true
        input:
          content: "{% if revised %}{{ revised }}{% else %}{{ draft }}{% endif %}"
        output:
          # 输出到工作流结果
          final: "output"  # 特殊：output 表示工作流最终输出

  # 示例2：多语言并行翻译
  translation_pipeline:
    name: "多语言翻译工作流"

    steps:
      # 并行翻译多种语言
      - id: translate
        name: "批量翻译"
        agent: translator
        parallel:
          iterations:
            - lang: en
              name: English
            - lang: ja
              name: Japanese
            - lang: es
              name: Spanish
        input:
          text: "{{ input.text }}"
          lang: "{{ iteration.lang }}"  # 当前迭代项
        output:
          result: "structuredOutput"
          lang: "iteration.lang"         # 保存迭代变量
        # 结果合并策略
        merge_to: "translations.{{ iteration.lang }}"
```

### 3.3 变量作用域

| 写法 | 来源 | 说明 |
|------|------|------|
| `{{ xxx }}` | 中间变量 | 步骤间传递的变量 |
| `{{ input.xxx }}` | 工作流输入 | workflow.input.xxx |
| `{{ output }}` | 工作流输出 | 最终输出（特殊） |
| `{{ env.xxx }}` | 环境变量 | process.env.xxx |
| `{{ loop.xxx }}` | 循环变量 | loop.index, loop.iteration |
| `{{ iteration.xxx }}` | 并行迭代变量 | parallel.iterations 中当前项 |

**内部存储结构：**

```typescript
// WorkflowContext 内部存储
{
  "workflow_abc123": {
    "context": {                      // 所有变量统一放这里
      "input": { topic: "AI" },       // input.xxx
      "output": {},                    // output.xxx
      "loop": { index: 0 },            // loop.xxx
      "findings": [...],               // 中间变量
      "draft": "...",
      "wordCount": 1000
    }
  }
}
```

### 3.4 Output 路径映射

**问题**：Agent 的 `structuredOutput` 结构不统一，如何提取字段？

**方案**：使用 `from` 字段指定从哪里取

```yaml
output:
  # 完整写法
  findings:
    from: "structuredOutput.findings"
    default: []

  # 简写（默认 from: "structuredOutput"）
  draft: "structuredOutput.content"

  # 取文本输出
  text: "output"

  # JSONPath 提取
  firstItem: "structuredOutput.data.items[0]"
  imageUrl: "structuredOutput.result.image_url"
```

**支持的来源：**

| 来源 | 说明 |
|------|------|
| `output` | Agent 的文本输出 |
| `structuredOutput` | 结构化输出（默认） |
| `structuredOutputs` | 多个输出 |
| `metadata.xxx` | 元数据字段 |

### 3.5 Workflow 控制流

**条件分支：**

```yaml
# 单条件
condition:
  field: "{{ approved }}"
  operator: "=="
  value: true

# 多条件 AND
condition:
  all:
    - field: "{{ status }}"
      operator: "=="
      value: ready
    - field: "{{ priority }}"
      operator: ">"
      value: 5

# 多条件 OR
condition:
  any:
    - field: "{{ type }}"
      operator: "in"
      value: [urgent, critical]
    - field: "{{ override }}"
      operator: "=="
      value: true
```

**循环控制：**

```yaml
# 并行迭代
parallel:
  iterations:
    - lang: en
    - lang: ja
    - lang: es

# While 循环
loop:
  while:
    field: "{{ converged }}"
    operator: "=="
    value: false
  max_iterations: 10
  break_on:
    field: "{{ improvement }}"
    operator: "<"
    value: 0.01
```

### 3.6 Workflow 配置验证

**在加载时验证，启动时报错**

```typescript
// src/core/workflow/validator.ts

const RESERVED_NAMES = ['input', 'output', 'env', 'loop', 'workflow', 'iteration'];

interface ValidationError {
  stepId: string;
  field: string;
  error: string;
}

export class WorkflowValidator {
  validate(config: WorkflowConfig): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. 检查 output 命名冲突
    const allOutputNames = new Set<string>();
    const outputToSteps = new Map<string, string>();

    for (const step of config.steps) {
      if (!step.output) continue;

      // 1.1 同一步骤内不能有重复字段
      const fieldNames = Object.keys(step.output);
      const duplicates = this.findDuplicates(fieldNames);
      if (duplicates.length > 0) {
        errors.push({
          stepId: step.id,
          field: duplicates.join(', '),
          error: `Duplicate output field in same step`,
        });
      }

      // 1.2 不能与保留字冲突
      for (const field of fieldNames) {
        if (RESERVED_NAMES.includes(field)) {
          errors.push({
            stepId: step.id,
            field,
            error: `Cannot use reserved name: ${field}`,
          });
        }
      }

      // 1.3 不能与之前步骤的 output 冲突
      for (const field of fieldNames) {
        if (allOutputNames.has(field)) {
          const existingStep = outputToSteps.get(field);
          errors.push({
            stepId: step.id,
            field,
            error: `Conflict with output in step "${existingStep}"`,
          });
        } else {
          allOutputNames.add(field);
          outputToSteps.set(field, step.id);
        }
      }
    }

    // 2. 检查 input 引用的字段是否存在
    const availableFields = new Set([
      ...RESERVED_NAMES,
      ...Array.from(allOutputNames),
    ]);

    for (const step of config.steps) {
      if (!step.input) continue;

      const referencedFields = this.extractReferencedFields(step.input);
      for (const field of referencedFields) {
        const rootField = field.split('.')[0];
        if (!availableFields.has(rootField)) {
          errors.push({
            stepId: step.id,
            field: rootField,
            error: `Referenced field not defined: ${rootField}`,
          });
        }
      }
    }

    // 3. 检查循环依赖
    const cyclic = this.detectCyclicDependency(config.steps);
    if (cyclic) {
      errors.push({
        stepId: cyclic[0],
        field: 'depends_on',
        error: `Cyclic dependency: ${cyclic.join(' -> ')}`,
      });
    }

    return errors;
  }

  private findDuplicates(arr: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of arr) {
      if (seen.has(item)) duplicates.add(item);
      seen.add(item);
    }
    return Array.from(duplicates);
  }

  private extractReferencedFields(input: Record<string, any>): string[] {
    const fields: string[] = [];
    for (const value of Object.values(input)) {
      if (typeof value === 'string') {
        const matches = value.matchAll(/\{\{([^}]+)\}\}/g);
        for (const match of matches) {
          const path = match[1].trim();
          const rootField = path.split('.')[0];
          fields.push(rootField);
        }
      }
    }
    return fields;
  }

  private detectCyclicDependency(steps: WorkflowStep[]): string[] | null {
    const graph = new Map<string, string[]>();
    for (const step of steps) {
      const deps = step.depends_on || [];
      graph.set(step.id, deps);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const dfs = (node: string, path: string[]): string[] | null => {
      if (path.includes(node)) return [...path, node];
      if (visited.has(node)) return null;

      visiting.add(node);
      const deps = graph.get(node) || [];
      for (const dep of deps) {
        const cycle = dfs(dep, [...path, node]);
        if (cycle) return cycle;
      }

      visiting.delete(node);
      visited.add(node);
      return null;
    };

    for (const stepId of graph.keys()) {
      const cycle = dfs(stepId, []);
      if (cycle) return cycle;
    }
    return null;
  }
}
```

**使用示例：**

```typescript
// config/workflow-loader.ts

export class WorkflowLoader {
  async load(configPath: string): Promise<WorkflowConfig[]> {
    const yamlContent = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(yamlContent) as any;

    const validator = new WorkflowValidator();

    for (const [name, workflow] of Object.entries(config.workflows)) {
      const errors = validator.validate(workflow);

      if (errors.length > 0) {
        throw new Error(
          `Workflow "${name}" validation failed:\n` +
          errors.map(e => `  [${e.stepId}] ${e.field}: ${e.error}`).join('\n')
        );
      }

      console.log(`✓ Workflow "${name}" validated successfully`);
    }

    return config.workflows;
  }
}
```

**错误示例：**

```yaml
# ❌ 错误1：同一步骤内重复
steps:
  - id: step1
    output:
      result: "output"
      result: "output"  # 重复

# ❌ 错误2：与保留字冲突
steps:
  - id: step1
    output:
      input: "output"  # input 是保留字

# ❌ 错误3：与之前步骤冲突
steps:
  - id: step1
    output:
      result: "output"
  - id: step2
    output:
      result: "output"  # step1 已定义

# ❌ 错误4：引用不存在的字段
steps:
  - id: step1
    input:
      data: "{{ unknown_field }}"  # 未定义

# ❌ 错误5：循环依赖
steps:
  - id: step1
    depends_on: [step2]
  - id: step2
    depends_on: [step1]
```

---

## 四、Workflow 与 Agent 系统集成

### 4.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         API Layer                                 │
│  /api/agent/execute  →  Agent.run(task)                           │
│  /api/workflow/execute  →  WorkflowEngine.execute(workflow, input)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Workflow Layer (新增)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  WorkflowEngine │  │  WorkflowLoader │  │  WorkflowContext │   │
│  │  • 解析 YAML     │  │  • 验证配置     │  │  • 变量管理      │   │
│  │  • 调用 Agent   │  │  • 加载 workflow │  │  • 模板渲染      │   │
│  │  • 收集结果     │  │                 │  │  • 状态追踪      │   │
│  └────────┬────────┘  └─────────────────┘  └──────────────────┘   │
└───────────┼───────────────────────────────────────────────────────────────┘
            │
            ▼ (复用现有接口，不动下层代码)
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Layer (不变)                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  AgentManager   │  │  MasterAgent    │  │  Agent           │   │
│  │  • acquire()    │  │  • run()        │  │  • run()         │   │
│  │  • release()    │  │                 │  │  • PTC 生成      │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘   │
└───────────┬───────────────────────────────────────────────────────────────┘
            │
            ▼ (完全复用)
┌─────────────────────────────────────────────────────────────────────┐
│                    Domain Layer (不变)                                │
│  ┌─────────────────┐  ┌─────────────────┐                               │
│  │  Sandbox        │  │  Skill System   │                               │
│  │  • execute()    │  │  • execute()    │                               │
│  └─────────────────┘  └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 WorkflowTask 是特殊 Task

```typescript
// 数据库中，Workflow 也是一种 Task
interface Task {
  id: string;
  type: 'agent' | 'workflow';     // 新增 workflow 类型
  workflowName?: string;            // workflow 配置名称
  workflowConfig?: WorkflowConfig;  // workflow 配置内容
  // ... 其他字段保持不变
}
```

### 4.3 API 集成

```typescript
// steps/api/workflow-api.step.ts

const workflowEngine = new WorkflowEngine(agentManager);

export default defineStep({
  name: 'workflow-api',
  async handle({ context }) {
    // 工作流列表
    context.http.get('/api/workflows', async () => {
      const workflows = workflowEngine.listWorkflows();
      return { status: 200, body: { workflows } };
    });

    // 执行工作流
    context.http.post('/api/workflows/:name/execute', async ({ params, body }) => {
      const taskId = `workflow-${Date.now()}`;

      // 创建 WorkflowTask
      const task = await createTask({
        id: taskId,
        type: 'workflow',
        workflowName: params.name,
        input: body,
      });

      // 异步执行
      workflowEngine.execute(params.name, body, { taskId })
        .then(result => emit('workflow.completed', { taskId, result }))
        .catch(error => emit('workflow.failed', { taskId, error }));

      return {
        status: 202,
        body: { taskId, message: 'Workflow execution started' }
      };
    });

    // 查询状态
    context.http.get('/api/workflows/status/:taskId', async ({ params }) => {
      const status = await workflowEngine.getStatus(params.taskId);
      return { status: 200, body: status };
    });
  },
});
```

---

## 五、文件结构

```
src/core/
├── config/
│   ├── config-loader.ts              # 通用配置加载器（YAML/TOML）
│   └── template-engine.ts            # 模板引擎
├── workflow/
│   ├── engine.ts                     # Workflow 引擎核心
│   ├── context.ts                    # Workflow 上下文
│   ├── loader.ts                     # Workflow 配置加载
│   ├── validator.ts                   # Workflow 配置验证（新增）
│   └── types.ts                      # Workflow 类型定义
├── task/hooks/
│   ├── configurable-hook.ts          # 配置化 Hook（新增）
│   ├── handlers/
│   │   ├── http-webhook.ts           # HTTP Webhook 处理器
│   │   ├── condition-check.ts        # 条件检查处理器
│   │   ├── middleware.ts             # 中间件处理器
│   │   └── notification.ts           # 通知处理器
│   │   └── channels/
│   │       ├── lark.ts               # Lark 飞书通知
│   │       ├── dingtalk.ts           # 钉钉（未来）
│   │       └── slack.ts              # Slack（未来）
│   └── workflow-hooks.ts            # Workflow 专用 Hooks（新增）

config/
├── custom-hooks.yaml                 # 自定义 Hook 配置
├── notification-channels.yaml        # 通知 Channel 配置
└── workflows.yaml                    # Workflow 配置

steps/
├── api/
│   └── workflow-api.step.ts          # Workflow API 端点
└── workflows/
    ├── workflow-executor.step.ts     # Workflow 事件消费者
    └── workflow-tracker.step.ts      # Workflow 状态追踪
```

---

## 总结

| 特性 | 实现方式 |
|------|----------|
| **Hook 类型** | http_webhook, condition_check, middleware, notification |
| **通知 Channel** | lark (飞书)，可扩展 dingtalk, slack, email |
| **Workflow 定位** | 上层编排，不改动下层 Agent/Skill |
| **Workflow 本质** | 特殊类型的 Task（type: 'workflow'） |
| **变量命名** | {{ xxx }}, {{ input.xxx }}, {{ output }}, {{ env.xxx }}, {{ loop.xxx }} |
| **Output 映射** | `from` 字段指定从 Agent 输出哪里取 |
| **配置验证** | 启动时验证，检测冲突和循环依赖 |
| **条件分支** | condition (all/any) + operator (==/!=/in/>/<) |
| **并行执行** | parallel.iterations + merge_to |
| **循环控制** | loop.while + next_step 回退 |
