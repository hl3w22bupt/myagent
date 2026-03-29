# Event-Driven Skill Execution Architecture

**设计文档版本**: v1.0
**创建日期**: 2026-01-21
**设计目标**: 将 Skill 执行从 Sandbox 本地模式升级为基于 Motia Event-driven 的分布式执行模式

---

## 目录

1. [设计概览](#1-设计概览)
2. [架构设计](#2-架构设计)
3. [核心数据结构](#3-核心数据结构)
4. [Event Schema 设计](#4-event-schema-设计)
5. [Transform DSL](#5-transform-dsl)
6. [执行流程](#6-执行流程)
7. [组件设计](#7-组件设计)
8. [与现有系统集成](#8-与现有系统集成)
9. [实现计划](#9-实现计划)
10. [TODO 事项](#10-todo-事项)

---

## 1. 设计概览

### 1.1 核心思想

将 Skill 执行从当前的 Sandbox 本地模式（PTC Code 生成）升级为基于 Motia Event-driven 的分布式执行模式（Skill Graph + Event Orchestration）。

### 1.2 双模式架构

系统支持两种执行策略，通过配置选择，后期可支持动态决策：

| 模式 | 流程 | 适用场景 |
|------|------|----------|
| **PTC Sandbox 模式** | Agent → PTCGenerator → 生成 PTC Code → Sandbox 执行 → 调用 Skills | 简单任务、快速原型 |
| **Skill Graph 模式** | Agent → SkillGraphGenerator → 生成 Skill DAG → emit workflow.start → Motia 编排执行 | 复杂工作流、分布式执行、需要并行优化 |

### 1.3 设计优势

**静态 Graph 的优势**：
- **全局规划能力**：LLM 生成完整 DAG 时具有全局观
- **并行优化**：DAG 中独立的 Skill 可以并行执行
- **可观测性**：整个执行图已知，易于追踪和调试
- **资源预估**：可提前预估资源需求

**Event-driven 的优势**：
- **分布式执行**：利用 Motia 的分布式能力
- **解耦合**：Skill 之间通过事件松耦合
- **可扩展**：易于添加新的 Skill
- **容错性**：利用 Motia 的重试和错误处理机制

---

## 2. 架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────┐
│  Agent Layer (策略选择层)                        │
│  - MasterAgent / Agent                         │
│  - 配置决定使用 PTC 或 Skill Graph             │
│  - 后期可动态决策                               │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Orchestration Layer (编排层)                   │
│  - PTC Sandbox 模式: PTCGenerator              │
│  - Skill Graph 模式: SkillGraphGenerator        │
│  - 两者都使用 LLM 生成，只是输出格式不同        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Execution Layer (执行层)                       │
│  - PTC Sandbox 模式: LocalSandboxAdapter        │
│  - Skill Graph 模式: Motia Event System         │
│    + Skill Execution Step (Python)              │
└─────────────────────────────────────────────────┘
```

### 2.2 决策流程

```typescript
// Agent 配置
interface AgentConfig {
  executionStrategy: 'ptc-sandbox' | 'skill-graph' | 'auto';  // 执行策略
  // ... 其他配置
}

// Agent.run() 中的决策
async run(task: string): Promise<AgentResult> {
  if (this.config.executionStrategy === 'ptc-sandbox') {
    return this.executeWithPTC(task);
  } else if (this.config.executionStrategy === 'skill-graph') {
    return this.executeWithSkillGraph(task);
  } else {
    // auto 模式：后期根据任务特征动态决策
    const strategy = await this.decideStrategy(task);
    return strategy === 'ptc' ? this.executeWithPTC(task) : this.executeWithSkillGraph(task);
  }
}
```

---

## 3. 核心数据结构

### 3.1 SkillGraph DAG

```typescript
interface SkillGraph {
  graphId: string;              // 唯一标识（UUID）
  sessionId: string;            // 会话 ID
  nodes: SkillNode[];           // Skill 节点数组
  edges: SkillEdge[];           // 依赖关系边（包含 transform）
  metadata: GraphMetadata;      // 元数据
}

interface SkillNode {
  nodeId: string;               // 节点唯一 ID（如 "node1", "node2"）
  skillName: string;            // Skill 名称（如 "web-search"）
  args: Record<string, any>;    // 初始参数（仅第一个节点需要，其他节点从 transform 获取）
}

interface SkillEdge {
  from: string;                 // 源节点 ID
  to: string;                   // 目标节点 ID
  transform: TransformMap;      // 输出→输入转换规则
}

interface TransformMap {
  [outputField: string]: TransformExpression;  // outputField: 当前 skill 的输出字段
}

interface GraphMetadata {
  createdAt: number;            // 创建时间戳
  estimatedDuration?: number;   // 预估执行时间（ms）
  maxParallelism?: number;      // 最大并行度
  description?: string;         // Graph 描述
}
```

### 3.2 示例：三节点 DAG

```yaml
graphId: "graph-20240121-001"
sessionId: "session-abc123"
nodes:
  - nodeId: "node1"
    skillName: "web-search"
    args:
      query: "AI 最新进展"

  - nodeId: "node2"
    skillName: "summarize"
    args: {}

  - nodeId: "node3"
    skillName: "save-file"
    args: {}

edges:
  - from: "node1"
    to: "node2"
    transform:
      search_results: "$output.search_results"  # 简单映射

  - from: "node2"
    to: "node3"
    transform:
      content: "$output.summary"                # 简单映射
      filename: "const('summary.txt')"          # 常量值
      timestamp: "number(Date.now())"           # 类型转换

metadata:
  createdAt: 1705845600000
  estimatedDuration: 15000
  description: "搜索并总结 AI 进展，保存到文件"
```

---

## 4. Event Schema 设计

### 4.1 统一的 Event Schema

所有 Skill Workflow 事件使用统一的 Schema：

```typescript
interface SkillWorkflowEvent {
  eventType: 'skill.workflow.start' | 'skill.workflow.running' | 'skill.workflow.completed';
  payload: {
    skillName: string;           // 要执行的 skill 名称
    inputs: Record<string, any>; // 输入参数（支持值、state key 引用、transform 表达式）
  };
  skillGraph: SkillGraph;        // 完整的 DAG，贯穿整个 workflow
}
```

### 4.2 Event 类型说明

| eventType | 使用场景 | 说明 |
|-----------|----------|------|
| `skill.workflow.start` | 第一个 Skill | 标识 workflow 开始 |
| `skill.workflow.running` | 中间的 Skill | 标识 workflow 正在执行 |
| `skill.workflow.completed` | 最后一个 Skill | 标识 workflow 完成 |

**判断逻辑**：
- 如果当前 node 没有上游 → `skill.workflow.start`
- 如果当前 node 有下游 → `skill.workflow.running`
- 如果当前 node 没有下游 → `skill.workflow.completed`

### 4.3 Event 流转示例

```
Step 1: Agent emit
{
  eventType: 'skill.workflow.start',
  payload: {
    skillName: 'web-search',
    inputs: { query: 'AI 最新进展' }
  },
  skillGraph: { nodes: [...], edges: [...] }
}
        ↓
Step 2: web-search 执行完 emit
{
  eventType: 'skill.workflow.running',
  payload: {
    skillName: 'summarize',
    inputs: { data: '$state.web_search_result' }  # 从 state 读取
  },
  skillGraph: { nodes: [...], edges: [...] }  # 同一个 graph
}
        ↓
Step 3: summarize 执行完 emit
{
  eventType: 'skill.workflow.completed',
  payload: {
    skillName: 'save-file',
    inputs: { content: '$state.summary' }
  },
  skillGraph: { nodes: [...], edges: [...] }
}
```

---

## 5. Transform DSL

### 5.1 设计目标

定义上游 Skill 输出与下游 Skill 输入之间的转换规则，支持：
- 简单字段映射
- 类型转换
- 字符串操作
- 多字段组合
- State 引用
- 常量值

### 5.2 Transform 表达式语法

```typescript
type TransformExpression =
  | string                        // 简单映射或表达式
  | TransformObject;

type TransformObject =
  | { state: string }             // State 引用
  | { cast: CastSpec }            // 类型转换
  | { stringOps: StringOpsSpec }  // 字符串操作
  | { combine: CombineSpec }      // 多字段组合
  | { expression: string }        // 自定义表达式
  | { constant: any };            // 常量值
```

### 5.3 语法示例

```yaml
edges:
  - from: "node1"
    to: "node2"
    transform:
      # 1. 简单映射
      data: "$output.search_results"

      # 2. State 引用
      result: { state: "web_search_result" }

      # 3. 类型转换
      count: "number($output.count, 0)"
      flag: "bool($output.enabled)"

      # 4. 字符串操作
      title: "upper(trim($output.title))"
      short: "substr($output.content, 0, 100)"
      formatted: 'format("URL: {}", $output.url)'

      # 5. 多字段组合
      full_name: 'concat($output.first_name, " ", $output.last_name)'
      address: 'format("{city}, {country}", $output)'

      # 6. 常量值
      timestamp: "const('2024-01-21')"
      version: "const(1)"
```

### 5.4 内置函数库

| 函数类别 | 函数 | 说明 | 示例 |
|---------|------|------|------|
| **类型转换** | `number(value, default?)` | 转为数字 | `number($output.count, 0)` |
| | `bool(value)` | 转为布尔 | `bool($output.enabled)` |
| | `str(value)` | 转为字符串 | `str($output.id)` |
| **字符串操作** | `trim(s)` | 去首尾空格 | `trim($output.title)` |
| | `upper(s)` | 转大写 | `upper($output.title)` |
| | `lower(s)` | 转小写 | `lower($output.title)` |
| | `substr(s, start, end)` | 截取子串 | `substr($output.text, 0, 100)` |
| | `replace(s, pattern, repl)` | 替换 | `replace($output.text, "\n", " ")` |
| | `format(template, ...args)` | 格式化 | `format("Name: {}", $output.name)` |
| **组合操作** | `concat(...args)` | 拼接 | `concat($output.first, " ", $output.last)` |
| | `join(separator, ...args)` | 连接 | `join(", ", $output.tags)` |
| **State 操作** | `state:set(key, value)` | 保存到 state | `state:set("result", $output.data)` |
| | `state:get(key)` | 从 state 读取 | `state:get("result")` |
| **常量** | `const(value)` | 常量值 | `const("fixed")` |

### 5.5 执行逻辑（Python 实现）

```python
def apply_transform(output_value: any, transform_spec: TransformExpression, context: Context) -> any:
    """应用 transform 转换"""

    if isinstance(transform_spec, str):
        # 可能是简单映射或表达式
        if transform_spec.startswith("$output."):
            # 简单映射: "$output.field"
            field_name = transform_spec.replace("$output.", "")
            return output_value.get(field_name)
        else:
            # 表达式: "func($output.field)"
            return eval_expression(transform_spec, {"output": output_value}, context)

    elif isinstance(transform_spec, dict):
        if "state" in transform_spec:
            # State 引用
            key = transform_spec["state"]
            context.state.set(key, output_value)
            return f"$state.{key}"

        elif "cast" in transform_spec:
            # 类型转换
            return apply_cast(output_value, transform_spec["cast"])

        elif "stringOps" in transform_spec:
            # 字符串操作
            return apply_string_ops(output_value, transform_spec["stringOps"])

        elif "combine" in transform_spec:
            # 多字段组合
            return apply_combine(output_value, transform_spec["combine"])

        elif "expression" in transform_spec:
            # 自定义表达式
            return eval_expression(transform_spec["expression"], {"output": output_value}, context)

        elif "constant" in transform_spec:
            # 常量值
            return transform_spec["constant"]

    return output_value
```

---

## 6. 执行流程

### 6.1 完整流程图

```
┌─────────────────────────────────────────────────┐
│  1. Agent 接收任务                               │
│     - 根据配置选择执行策略                       │
│     - 选择 Skill Graph 模式                      │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  2. SkillGraphGenerator 生成 DAG                │
│     - 调用 LLM 规划（选择 Skills）               │
│     - 调用 LLM 生成 Graph 结构                   │
│     - 返回 SkillGraph 对象                      │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  3. Agent emit 第一个事件                        │
│     - eventType: skill.workflow.start           │
│     - payload: {skillName, inputs}              │
│     - skillGraph: 完整的 DAG                     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  4. Skill Execution Step (Python) 执行 Skill     │
│     - 从 payload 获取 skillName 和 inputs        │
│     - 动态加载并执行 Skill                       │
│     - 将结果保存到 Motia State                  │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  5. 判断是否有下游 Skill                         │
│     - 从 skillGraph.edges 查找 downstream        │
│     - 如果没有 → emit skill.workflow.completed  │
│     - 如果有 → 对每个 downstream apply transform │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  6. Emit 下游事件（循环）                         │
│     - eventType: skill.workflow.running/completed│
│     - payload: {skillName, inputs}              │
│     - skillGraph: 同一个 graph（传递）          │
└─────────────────────────────────────────────────┘
                    ↓
                    └─→ 返回步骤 4，直到所有 Skill 完成
```

### 6.2 核心算法：决定下一个事件类型

```python
def determine_next_event_type(current_node_id: str, skill_graph: SkillGraph) -> str:
    """决定下一个事件的类型"""

    # 检查是否有下游节点
    downstream_edges = [
        edge for edge in skill_graph.edges
        if edge.from == current_node_id
    ]

    if not downstream_edges:
        # 没有下游 → 最后一个节点
        return 'skill.workflow.completed'
    else:
        # 有下游 → 中间节点
        # 但需要检查是否是第一个节点（特殊情况）
        upstream_edges = [
            edge for edge in skill_graph.edges
            if edge.to == current_node_id
        ]

        if not upstream_edges:
            # 没有上游 → 第一个节点
            return 'skill.workflow.start'
        else:
            # 有上游也有下游 → 中间节点
            return 'skill.workflow.running'
```

### 6.3 核心算法：生成下游事件

```python
def generate_downstream_events(
    current_node_id: str,
    current_output: dict,
    skill_graph: SkillGraph,
    context: Context
) -> List[dict]:
    """为所有下游节点生成事件"""

    # 1. 查找所有下游 edges
    downstream_edges = [
        edge for edge in skill_graph.edges
        if edge.from == current_node_id
    ]

    if not downstream_edges:
        return []

    # 2. 为每个下游 edge 构建事件
    events = []
    for edge in downstream_edges:
        downstream_node = next(
            node for node in skill_graph.nodes
            if node.nodeId == edge.to
        )

        # 3. 应用 transform 生成 inputs
        inputs = {}
        for output_field, transform_spec in edge.transform.items():
            output_value = current_output.get(output_field)
            transformed_value = apply_transform(output_value, transform_spec, context)

            # transform_spec 的 key 就是下游节点的 input 字段名
            # 但需要解析 transform_spec 获取目标字段名
            target_field = resolve_target_field(transform_spec)
            inputs[target_field] = transformed_value

        # 4. 决定事件类型
        event_type = determine_next_event_type(edge.to, skill_graph)

        # 5. 构建事件
        event = {
            'eventType': event_type,
            'payload': {
                'skillName': downstream_node.skillName,
                'inputs': inputs
            },
            'skillGraph': skill_graph  # 传递同一个 graph
        }

        events.append(event)

    return events

def resolve_target_field(transform_spec: TransformExpression) -> str:
    """从 transform_spec 解析目标字段名"""

    if isinstance(transform_spec, str):
        # 表达式中可能包含字段名，但需要从下游节点的 input schema 获取
        # 这里简化处理，实际应该查询 schema
        return "data"  # 默认值

    elif "state" in transform_spec:
        # State 引用，返回 state key
        return transform_spec["state"]

    # 其他情况，需要额外逻辑
    return "data"  # 默认值
```

### 6.4 错误处理

**失败策略**：
- Skill 执行失败时，直接失败（不重试）
- Emit `skill.workflow.failed` 事件
- Agent 订阅该事件，决定是否 retry
- **当前实现**：暂时订阅该事件，打印日志，不做重试

**失败事件 Schema**：

```typescript
interface SkillWorkflowFailedEvent {
  eventType: 'skill.workflow.failed';
  payload: {
    skillName: string;
    nodeId: string;
    error: string;
    inputs: Record<string, any>;
  };
  skillGraph: SkillGraph;
}
```

---

## 7. 组件设计

### 7.1 Skill Execution Step (Python)

**文件位置**: `steps/skills/skill-executor.step.py`

```python
from motia import step, context
from core.skill.executor import SkillExecutor

@step(
    name="skill-executor",
    subscribes=["skill.workflow.start", "skill.workflow.running", "skill.workflow.completed"],
    emits=["skill.workflow.start", "skill.workflow.running", "skill.workflow.completed", "skill.workflow.failed"]
)
async def execute_skill(input, ctx):
    """统一的 Skill 执行 Step"""

    try:
        # 1. 解析输入
        skill_name = input['payload']['skillName']
        inputs = input['payload']['inputs']
        skill_graph = input['skillGraph']

        # 2. 查找当前节点
        current_node = find_current_node(skill_name, skill_graph)

        # 3. 解析 inputs（处理 state 引用）
        resolved_inputs = resolve_inputs(inputs, ctx.state)

        # 4. 执行 Skill
        result = await SkillExecutor.execute(skill_name, resolved_inputs)

        # 5. 保存输出到 state
        if result.success:
            ctx.state.set(f"{skill_graph.graphId}.{current_node.nodeId}.output", result.data)

            # 6. 生成下游事件
            downstream_events = generate_downstream_events(
                current_node.nodeId,
                result.data,
                skill_graph,
                ctx
            )

            # 7. Emit 所有下游事件
            for event in downstream_events:
                await ctx.emit(event['eventType'], event['payload'], event['skillGraph'])

        else:
            # 执行失败，emit 失败事件
            await ctx.emit('skill.workflow.failed', {
                'skillName': skill_name,
                'nodeId': current_node.nodeId,
                'error': result.error,
                'inputs': inputs
            }, skill_graph)

    except Exception as e:
        # 异常处理
        await ctx.emit('skill.workflow.failed', {
            'skillName': skill_name,
            'nodeId': current_node.nodeId,
            'error': str(e),
            'inputs': inputs
        }, skill_graph)
```

### 7.2 SkillGraphGenerator

**文件位置**: `src/core/agent/skill-graph-generator.ts`

```typescript
export class SkillGraphGenerator {
  constructor(private llm: LLMClient, private skills: SkillMetadata[]) {}

  async generate(task: string, context: GenerationContext): Promise<SkillGraph> {
    // Step 1: 规划 Skills（类似 PTCGenerator.planSkills）
    const { selectedSkills, reasoning } = await this.planSkills(task, context);

    // Step 2: 生成 Graph（新的）
    const graph = await this.generateGraph(task, selectedSkills, context);

    return graph;
  }

  private async planSkills(task: string, context: GenerationContext): Promise<{
    selectedSkills: string[];
    reasoning: string;
  }> {
    const prompt = this.buildPlanPrompt(task, this.skills, context);
    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);

    // 解析 LLM 返回的技能选择
    return this.parseSkillsResponse(response.content);
  }

  private async generateGraph(
    task: string,
    selectedSkills: string[],
    context: GenerationContext
  ): Promise<SkillGraph> {
    const prompt = this.buildGraphPrompt(task, selectedSkills, this.skills, context);
    const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }]);

    // 解析 LLM 返回的 YAML Graph
    return this.parseGraphResponse(response.content);
  }
}
```

### 7.3 Agent 集成

**文件位置**: `src/core/agent/agent.ts`

```typescript
class Agent {
  private skillGraphGenerator?: SkillGraphGenerator;

  async executeWithSkillGraph(task: string): Promise<AgentResult> {
    // 1. 生成 Skill Graph
    const graph = await this.skillGraphGenerator.generate(task, {
      history: this.state.conversationHistory,
      variables: Object.fromEntries(this.state.variables),
    });

    // 2. 找到第一个节点
    const firstNode = graph.nodes[0];

    // 3. Emit 第一个事件
    await motia.emit('skill.workflow.start', {
      skillName: firstNode.skillName,
      inputs: firstNode.args,
    }, graph);

    // 4. 等待 workflow 完成（订阅 skill.workflow.completed 和 skill.workflow.failed）
    // 这里需要实现等待逻辑，可能需要额外的协调机制

    return {
      success: true,
      output: 'Workflow started',
      metadata: {
        graphId: graph.graphId,
        strategy: 'skill-graph',
      },
    };
  }
}
```

---

## 8. 与现有系统集成

### 8.1 兼容性设计

**保持现有 PTC Sandbox 模式不变**：
- `PTCGenerator` 继续工作
- `LocalSandboxAdapter` 继续使用
- Skill Registry 和 Executor 复用

**新增 Skill Graph 模式**：
- `SkillGraphGenerator` 新增组件
- `Skill Execution Step` 新增 Motia Step
- 复用 Skill Registry 和 Executor

### 8.2 共享组件

| 组件 | PTC 模式 | Skill Graph 模式 | 说明 |
|------|----------|------------------|------|
| SkillRegistry | ✅ 使用 | ✅ 使用 | 共享 |
| SkillExecutor | ✅ 使用 | ✅ 使用 | 共享 |
| LLMClient | ✅ 使用 | ✅ 使用 | 共享 |
| AgentManager | ✅ 使用 | ✅ 使用 | 共享 |
| PTCGenerator | ✅ 使用 | ❌ 不使用 | PTC 专用 |
| SkillGraphGenerator | ❌ 不使用 | ✅ 使用 | Graph 专用 |
| LocalSandboxAdapter | ✅ 使用 | ❌ 不使用 | PTC 专用 |
| SkillExecutionStep | ❌ 不使用 | ✅ 使用 | Graph 专用 |

### 8.3 配置示例

```typescript
// motia.config.ts 或 src/index.ts
export const agentConfig: AgentConfig = {
  executionStrategy: 'skill-graph',  // 或 'ptc-sandbox' 或 'auto'

  // Skill Graph 模式配置
  skillGraphConfig: {
    maxParallelism: 10,
    timeout: 60000,
    retryOnFailure: false,  // 暂时关闭
  },

  // PTC Sandbox 模式配置（现有）
  ptcConfig: {
    maxRetries: 3,
    timeout: 60000,
  },

  // 共享配置
  llmConfig: { ... },
  skills: [...],
};
```

---

## 9. 实现计划

### 9.1 Phase 1: 核心数据结构和类型定义

**任务**：
1. 定义 TypeScript 接口（SkillGraph, SkillNode, SkillEdge, TransformSpec）
2. 编写单元测试验证数据结构

**文件**：
- `src/core/skill-graph/types.ts`
- `tests/unit/skill-graph/types.test.ts`

### 9.2 Phase 2: Transform DSL 实现

**任务**：
1. 实现 Transform 表达式解析器
2. 实现内置函数库
3. 编写单元测试

**文件**：
- `src/core/skill-graph/transform.ts`
- `tests/unit/skill-graph/transform.test.ts`

### 9.3 Phase 3: SkillGraphGenerator 实现

**任务**：
1. 设计 Prompt 模板（plan skills + generate graph）
2. 实现 Graph Generator
3. 实现 YAML 解析器
4. 编写集成测试

**文件**：
- `src/core/agent/skill-graph-generator.ts`
- `prompts/skill-graph-plan.jinja`
- `prompts/skill-graph-generate.jinja`
- `tests/integration/skill-graph-generator.test.ts`

### 9.4 Phase 4: Skill Execution Step 实现

**任务**：
1. 实现 Python Motia Step
2. 实现执行逻辑和错误处理
3. 实现下游事件生成
4. 编写集成测试

**文件**：
- `steps/skills/skill-executor.step.py`
- `tests/integration/skill-executor.test.py`

### 9.5 Phase 5: Agent 集成

**任务**：
1. Agent 添加 `executeWithSkillGraph()` 方法
2. 实现策略选择逻辑
3. 实现事件订阅和等待机制
4. 端到端测试

**文件**：
- `src/core/agent/agent.ts` (修改)
- `tests/e2e/skill-graph-workflow.test.ts`

### 9.6 Phase 6: 监控和可观测性

**任务**：
1. 实现执行追踪
2. 实现日志记录
3. 实现性能监控

**文件**：
- `src/core/skill-graph/tracer.ts`
- `docs/monitoring.md`

---

## 10. TODO 事项

### 10.1 高优先级

- [ ] **实现 Skill-level Hook 系统**：用于追踪和监控 Skill 执行状态
  - 参考：`docs/design/skill-hook-system.md`
  - 与本系统独立，但可以集成

- [ ] **实现 Workflow 完成检测机制**：
  - 当前通过判断下游节点数量
  - 可能需要更可靠的机制（如计数器）

### 10.2 中优先级

- [ ] **实现重试机制**：
  - 订阅 `skill.workflow.failed` 事件
  - 根据错误类型决定是否重试
  - 参考现有的三层重试架构

- [ ] **优化并行执行**：
  - 当前依赖 Motia 内置并发
  - 可能需要显式控制并发度

- [ ] **实现动态策略选择**（auto 模式）：
  - 根据任务特征选择 PTC 或 Skill Graph
  - 可能需要 ML 模型或规则引擎

### 10.3 低优先级

- [ ] **实现 Workflow 可视化**：
  - DAG 可视化展示
  - 执行状态追踪 UI

- [ ] **实现 Workflow 持久化**：
  - 保存 Graph 到数据库
  - 支持恢复和断点续传

- [ ] **实现 Workflow 版本管理**：
  - Graph 版本控制
  - 回滚和迁移

---

## 附录

### A. 参考资料

- **Motia 文档**: https://docs.motia.dev
- **现有架构**: `docs/ARCHITECTURE_OVERVIEW.md`
- **三层重试**: `docs/ARCHITECTURE_OVERVIEW.md#8-三层重试架构`

### B. 相关文档

- **Skill Hook 系统**: `docs/design/skill-hook-system.md`
- **Task Hook 系统**: `docs/design/task-hook-system.md`

### C. 设计决策记录

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 执行环境 | Event-driven Step | 符合 Motia 设计理念，利用分布式能力 |
| Graph 类型 | 静态 DAG | 全局规划能力，更好的并行优化 |
| 并发策略 | Motia 内置并发 | 简单实用，早期阶段够用 |
| 数据传递 | Event Payload | 简洁灵活，支持 state key 引用 |
| 触发机制 | 单次触发 + 完整 Graph | 与 Motia 一致，一次触发完整上下文 |
| Step 实现 | 单一通用 Step | 支持动态扩展，不可能为每个 skill 写 step |
| Transform 语法 | DSL 风格 | 简洁直观，易于实现和验证 |
| State 管理 | Motia State System | 框架原生支持，无需额外实现 |
| 错误处理 | 直接失败 + emit 事件 | 简单明确，后续扩展重试 |

---

**文档结束**
