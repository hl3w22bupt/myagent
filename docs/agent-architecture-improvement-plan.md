# Agent 架构改进完整计划

> **📅 最后更新**：2025-02-12
> **✅ 状态**：**方向 2（增强通知透明度）已完成**
> **📊 进度**：核心功能 100% 完成
>
> **完成摘要**：
> - ✅ 委派计划开始通知
> - ✅ 委派决策完成通知
> - ✅ 任务分解通知
> - ✅ 前端完整展示
> - ✅ delegates 空值处理优化
> - 🎯 用户现在能看到完整的委派决策过程

## 目录
- [Phase 1: 理想架构设想](#phase-1-理想架构设想)
- [Phase 2: 当前实现探索](#phase-2-当前实现探索)
- [Phase 3: 差异分析](#phase-3-差异分析)
- [Phase 4: 架构演进方向](#phase-4-架构演进方向)
- [Phase 5: 实施计划](#phase-5-实施计划)
- [当前状态](#当前状态)

---

## Phase 1: 理想架构设想

### 1. 基础类设计

```
Agent (基类)
  ├── 通用功能：意图识别、PTC 规划、技能执行
  ├── 基础 prompt
  └── 可被子类 override

MasterAgent extends Agent
  ├── 专门的编排 prompt
  ├── 决定：交给 subagent 或自己执行
  └── 可扩展新的 function (override 基类)

SubAgent = Agent (with specialized prompt)
  ├── 不同的系统 prompt
  └── 继承所有 Agent 基类功能
```

### 2. 三种工作模式

#### 模式 A: 默认模式（MasterAgent 编排）

```
用户任务 → MasterAgent
           ↓
        [决策与编排]
           ↓
    ┌──────┴──────┐
    ↓              ↓
自己执行    委派给 SubAgent(s)
```

#### 模式 B: 指派模式（直接指定 SubAgent）

```
用户任务 + 指定 subagent → MasterAgent
                                ↓
                          [直接分配]
                                ↓
                    指定的 SubAgent 执行
```

#### 模式 C: 多 SubAgent 协作（中心化）

```
用户任务 → MasterAgent (指挥中心)
           ↓
    ┌──────┼──────┐
    ↓      ↓      ↓
SubA  SubB  SubC
    ↓      ↓      ↓
  各自独立执行，结果返回 MasterAgent 整合
```

### 3. 通用功能下沉到 Agent 基类

- ✅ 意图识别 (notifyIntentAnalysis)
- ✅ PTC 规划 (notifyPTCPlanning)
- ✅ 技能发现与执行
- ✅ HITL 检查点
- ✅ Stream 通知

---

## Phase 2: 当前实现探索

### 关键发现总结

#### 1. MasterAgent 的真实实现

**重要发现：伪委派机制**

MasterAgent 并没有真正创建独立的 SubAgent 实例并调用它们的 run() 方法，而是采用**"伪委派"**机制：

```typescript
// src/core/agent/master-agent.ts:46-94
async run(task: string, _taskId?: string): Promise<AgentResult> {
  // 1. 规划委派（只用 LLM 分析，不调用 subagent）
  const plan = await this.planWithDelegation(task);

  // 2. 组合成任务描述（包含委派信息）
  const combinedTask = plan.steps.map((step, index) => {
    return `Step ${index + 1}: ${step.task} (${step.delegateTo ? `Delegate to ${step.delegateTo}` : 'Execute directly'})`;
  }).join('\n\n');

  // 3. 调用父类执行（LLM 会根据描述"模拟"委派）
  return await super.run(combinedTask, _taskId, executionContext);
}
```

**关键结论**：
- ❌ **没有真实调用 SubAgent**：`getOrCreateSubagent()` 方法存在但从未被使用
- ✅ **伪委派**：通过文本提示让 LLM "仿佛使用某个 subagent 的技能"执行
- ✅ **单点执行**：所有任务都由同一个 Agent 实例完成

#### 2. SubAgent 的定义方式

**SubAgent = Agent 基类 + 不同配置的组合**

- 不是独立的类定义，而是通过 YAML 配置文件差异化
- 配置位置：`/subagents/{name}/agent.yaml`
- 配置内容：`name`, `description`, `agent.system_prompt`, `agent.available_skills`

实例化方式：

```typescript
// MasterAgent.getOrCreateSubagent() - 第467行
const subagent = new Agent(
  {
    systemPrompt: config?.systemPrompt,
    availableSkills: config?.availableSkills,
    llm: this.config.llm,        // 共享 LLM
    sandbox: this.config.sandbox,    // 共享沙箱
  },
  subagentSessionId
);
```

#### 3. AgentManager 的创建逻辑

**三种 Agent 类型支持**：

| AgentType | 创建的类 | 配置来源 | 用途 |
|-----------|---------|---------|------|
| `'agent'` (默认） | `Agent` | `config.agentConfig` | 通用 Agent |
| `'master'` | `MasterAgent` | `config.masterAgentConfig` | 编排 Agent |
| (无 SubAgent 类型） | - | - | SubAgent 通过 MasterAgent 内部创建 |

**关键点**：
- ✅ AgentManager **不直接管理 SubAgent**
- ✅ SubAgent 由 MasterAgent 内部管理（`this.subagents` Map）
- ✅ 通过 `useDelegation` 参数决定创建 Agent 或 MasterAgent

#### 4. 委派执行的真相

**当前实现的"委派"流程**：

```
用户任务: "分析 API 性能并审查代码"

MasterAgent.planWithDelegation() 返回:
{
  steps: [
    { task: "分析 API 性能", delegateTo: "data-analyst", reason: "..." },
    { task: "审查代码质量", delegateTo: "code-reviewer", reason: "..." }
  ],
  reasoning: "..."
}

↓ 转换为 combinedTask

"Step 1: 分析 API 性能 (Delegate to data-analyst)
Step 2: 审查代码质量 (Delegate to code-reviewer)"

↓ 调用 super.run(combinedTask)

Agent.run() 执行：
  1. notifyIntentAnalysis(combinedTask)  ← 分析的是合并任务，不是原始任务！
  2. generatePTC(combinedTask)             ← 生成执行合并任务的代码
  3. executeInSandbox()                    ← 沙箱执行
```

**关键发现**：
- ⚠️ **"委派"只是语义标记**，不涉及真实的进程间通信
- ⚠️ **所有执行都在同一个会话**中完成
- ⚠️ **技能隔离通过 availableSkills 过滤实现**

---

## Phase 3: 差异分析

### 你的理想架构 vs 当前实现

| 维度 | 你的理想架构 | 当前实现 | 差异程度 | 说明 |
|--------|------------|----------|-----------|------|
| **类层次** | Agent → MasterAgent/SubAgent（同一基类） | Agent → MasterAgent（无 SubAgent 子类） | ✅ 完全符合 | SubAgent = Agent 类 + 不同配置参数 |
| **委派方式** | 真实调用 SubAgent.run() | 文本描述（伪委派） | ❌ **重大差异** | 你的设想是真委派 |
| **通用功能** | 全在 Agent 基类 | ✅ 在 Agent 基类 | ✅ 符合 | notifyIntentAnalysis/PTCPlanning 都有 |
| **通知透明度** | MasterAgent 应有委派通知 | ✅ 已实现完整委派通知 | ✅ **已修复** | 包含委派规划、决策、分解三个通知 |
| **SubAgent 独立性** | 独立类和实例 | 同一 Agent 类的实例 | ✅ 完全符合 | 你的设想完全正确 |
| **执行隔离** | SubAgent 独立执行 | 同一 Agent 实例执行 | ❌ **不符合** | 所有执行在同一实例 |

### 关键差异点

#### 1. 委派机制差异 ⚠️

**你的设想**：
```
MasterAgent
  ├── 调用 subAgent1.run(task1)
  ├── 调用 subAgent2.run(task2)
  └── 整合结果
```

**当前实现**：
```
MasterAgent
  ├── 将 task1 + task2 组合成 combinedTask
  ├── 调用 super.run(combinedTask)
  └── LLM 通过文本描述"模拟"委派
```

#### 2. 通知链路缺失 ❌

**通知点**：

| 通知点 | 位置 | 状态 | 代码位置 |
|--------|------|------|------|
| 委派计划开始 | `planWithDelegation()` 入口 | ✅ 已实现 | master-agent.ts:460-478 |
| 委派决策完成 | `planWithDelegation()` 返回后 | ✅ 已实现 | master-agent.ts:503-527 |
| 任务转换通知 | 原始任务 → combinedTask | ✅ 已实现 | master-agent.ts:1022-1073 |
| 前端展示支持 | TaskDetail.jsx | ✅ 已实现 | TaskDetail.jsx:74-112 |

**当前通知链**（基于 combinedTask）：
```
Task Hook: pre → 任务开始
Agent Hook: onTaskStart
  → notifyIntentAnalysis(combinedTask)  ← 分析的是合并任务！
  → PTC 生成
  → notifyPTCPlanning(combinedTask)     ← 规划的是合并任务！
  → 沙箱执行
Agent Hook: onTaskComplete
Task Hook: post → 任务结束
```

---

## Phase 4: 架构演进方向

基于探索发现，我们面临**架构演进选择**。三个方向的优缺点：

### 方向 1：真实委派（符合你的原始设想）🎯

**设计方案**：
```
MasterAgent
  ├── planWithDelegation(task) → 返回 steps 数组
  ├── for each step:
  │   ├── if delegateTo:
  │   │   ├── subagent = new Agent(subagentConfig)
  │   │   └── result = await subagent.run(step.task)
  │   └── else:
  │       └── result = await this.executeDirectly(step.task)
  └── 合并所有 result
```

**优点**：
- ✅ **真独立执行**：每个 SubAgent 真正独立运行（不同会话ID）
- ✅ **完整流程**：每个 SubAgent 都有完整的 意图→PTC→技能 链路
- ✅ **天然隔离**：SubAgent 之间完全独立，互不干扰
- ✅ **符合直觉**：实现与你设想一致的"真委派"

**缺点**：
- ❌ **架构复杂**：需要管理多个 Agent 实例和会话
- ❌ **状态同步**：SubAgent 结果需要手动合并到 MasterAgent
- ❌ **资源开销**：每个 SubAgent 都有独立的 LLM 上下文
- ❌ **实现成本**：需要大量重构（MasterAgent.run、结果合并等）

---

### 方向 2：增强伪委派（透明化优化）🔍

**设计方案**：
```
MasterAgent
  ├── planWithDelegation(task) → 返回 steps 数组
  ├── 添加完整的通知：
  │   ├── notifyDelegationPlanStart()  ← 委派计划开始
  │   ├── notifyDelegationPlanResult() ← 委派决策完成
  │   └── notifyTaskDecomposition()  ← 任务分解详情
  └── 组合为 combinedTask 并执行（保持现有机制）
```

**优点**：
- ✅ **实现简单**：只需添加通知方法，不改变核心逻辑
- ✅ **透明度高**：用户能看到完整的决策过程
- ✅ **向后兼容**：不破坏现有架构
- ✅ **渐进改进**：可以逐步完善通知体系

**缺点**：
- ⚠️ **仍是伪委派**：不解决"真委派"的根本问题
- ⚠️ **单一执行**：所有任务仍在同一实例执行
- ⚠️ **技能隔离有限**：通过 availableSkills 过滤，而非真实隔离

---

### 方向 3：混合模式（智能选择）⚖️

**设计方案**：
```
MasterAgent
  ├── analyzeTaskComplexity(task)
  ├── if (简单任务):
  │   └── 直接执行（调用 super.run(task))
  └── else (复杂任务):
      ├── if (需要真隔离):
      │   ├── 创建 SubAgent 实例
      │   └── 真实委派
      └── else:
          └── 伪委派（方向 2 的透明化版本）
```

**优点**：
- ✅ **灵活适应**：根据任务复杂度选择最优策略
- ✅ **渐进实现**：可以逐步实现不同模式
- ✅ **性能优化**：简单任务不走委派开销

**缺点**：
- ⚠️ **复杂度增加**：需要判断逻辑和多种执行路径
- ⚠️ **维护成本**：同时维护两套机制

---

## 💡 推荐方案：方向 2（增强伪委派）

### 推荐理由

1. **快速见效** ⚡
   - 添加通知即可立即改善用户体验
   - 不需要大规模重构
   - 风险低、可回滚

2. **实用主义** 🎯
   - 当前架构的"伪委派"机制已经能工作
   - 问题在于**透明度不足**，而非功能缺失
   - 补充通知就能解决 80% 的用户体验问题

3. **架构稳定** 🏗️
   - 保持当前简单有效的执行模型
   - 不引入复杂的多实例管理
   - 降低系统复杂度和 bug 风险

4. **为未来留空间** 🔮
   - 通知体系完善后，可以评估是否需要真委派
   - 可以根据实际使用数据决策下一步
   - 避免过度设计（YAGNI）

---

## Phase 5: 实施计划

### 推荐实施方案：方向 2 - 增强通知透明度

#### 改进项 1：添加委派计划通知 🔔

**文件**：`src/core/agent/master-agent.ts`

**状态**：✅ 已完成（第 460-478 行）

**实现方式**：内联实现（非独立方法）

**实现代码**：
```typescript
private async notifyDelegationPlanStart(
  task: string,
  taskId?: string
): Promise<void> {
  const streams = getAgentStreams();

  if (!streams?.taskExecution) {
    console.warn('[MasterAgent] No taskExecution stream available');
    return;
  }

  const event = {
    type: 'delegation_planning',
    progressType: 'delegation',
    status: 'analyzing',
    taskId: taskId || `task-${Date.now()}`,
    sessionId: this.sessionId,
    timestamp: new Date().toISOString(),
    data: {
      originalTask: task,  // ← 用户的原始任务！
      agentType: 'MasterAgent',
      subagentsCount: this.subagentConfigs.size
    }
  };

  await streams.taskExecution.set(event.taskId, `delegation-plan-${Date.now()}`, {
    ...event,
    category: 'agent_hook',
  });

  // 同时发送到 executionTraces
  if (streams.executionTraces) {
    const id = `delegation-plan-${Date.now()}`;
    await streams.executionTraces.set(event.taskId, id, {
      id,
      level: 'agent-internal',
      taskId: event.taskId,
      agentId: this.sessionId,
      stage: 'delegation_planning',
      status: 'analyzing',
      inputData: JSON.stringify({ task, agentType: 'MasterAgent' }),
      timestamp: new Date().toISOString(),
    });
  }
}
```

**调用位置**：在 `planWithDelegation()` 方法开始时调用

---

#### 改进项 2：添加委派决策完成通知 📋

**状态**：✅ 已完成（第 503-527 行）

**实现方式**：内联实现（非独立方法）

**实现代码**：
```typescript
private async notifyDelegationPlanResult(
  task: string,
  plan: DelegationPlan,
  taskId?: string
): Promise<void> {
  const streams = getAgentStreams();

  if (!streams?.taskExecution) return;

  const delegates = plan.steps
    .filter(s => s.delegateTo)
    .map(s => ({
      to: s.delegateTo,  // ← subagent name
      task: s.task,
      reason: s.reason
    }));

  const event = {
    type: 'delegation_plan',
    progressType: 'delegation-result',
    status: 'completed',
    taskId: taskId || `task-${Date.now()}`,
    sessionId: this.sessionId,
    timestamp: new Date().toISOString(),
    data: {
      originalTask: task,
      reasoning: plan.reasoning,
      steps: plan.steps,
      delegates,  // ← 委派详情：哪个任务给哪个 subagent
      executeDirectly: plan.steps.filter(s => !s.delegateTo).length
    }
  };

  await streams.taskExecution.set(event.taskId, `delegation-result-${Date.now()}`, {
    ...event,
    category: 'agent_hook',
  });
}
```

**调用位置**：在 `planWithDelegation()` 方法返回前调用

---

#### 改进项 3：优化任务转换通知 🔄

**状态**：✅ 已完成（独立方法）

**实现位置**：master-agent.ts:1022-1073

**实现代码**：
```typescript
private async notifyTaskDecomposition(
  originalTask: string,
  combinedTask: string,
  plan: DelegationPlan,
  taskId?: string
): Promise<void> {
  const streams = getAgentStreams();

  if (!streams?.taskExecution) return;

  const event = {
    type: 'task_decomposition',
    progressType: 'task-breakdown',
    status: 'completed',
    taskId: taskId || `task-${Date.now()}`,
    sessionId: this.sessionId,
    timestamp: new Date().toISOString(),
    data: {
      originalTask,
      decomposedSteps: plan.steps.map((s, i) => ({
        stepNumber: i + 1,
        task: s.task,
        delegateTo: s.delegateTo || 'MasterAgent (execute directly)',
        reason: s.reason
      })),
      combinedTaskPreview: combinedTask.substring(0, 200) + '...'
    }
  };

  await streams.taskExecution.set(event.taskId, `decomposition-${Date.now()}`, {
    ...event,
    category: 'agent_hook',
  });
}
```

**调用位置**：在 `MasterAgent.run()` 方法中，调用 `super.run(combinedTask)` 之前调用

---

#### 改进项 4：前端支持 🎨

**状态**：✅ 已完成

**文件**：`motia-frontend/src/pages/TaskDetail.jsx`

**实现位置**：第 74-112 行

**实现代码**：
```jsx
case 'delegation_planning':
  return `[🎯 委派规划中] 正在分析任务并决定执行策略...`

case 'delegation_plan':
  const { delegates, executeDirectly } = data || {}
  const delegateCount = delegates?.length || 0

  if (delegateCount === 0) {
    return `[🎯 委派决策] MasterAgent 直接执行任务`
  }

  const delegateList = delegates
    .map(d => `  • ${d.to}: ${d.task}`)
    .join('\n')

  return `[🎯 委派决策] 委派给 ${delegateCount} 个子代理:\n${delegateList}`

case 'task_decomposition':
  const { decomposedSteps } = data || {}
  return `[📋 任务分解] 将任务分解为 ${decomposedSteps?.length || 0} 个步骤:\n${decomposedSteps?.map(s =>
    `  ${s.stepNumber}. ${s.task}\n     → ${s.delegateTo}`
  ).join('\n') || ''}`
```

---

## 📊 预期效果对比

### 改进前（当前状态）

```
用户任务 → MasterAgent
  ↓ (黑盒操作，无通知)
  ↓
notifyIntentAnalysis(combinedTask)  ← 用户困惑：这是什么任务？
notifyPTCPlanning(combinedTask)     ← 用户困惑：为什么是这个计划？
执行...
```

### 改进后（方向 2）

```
用户任务 → MasterAgent
  ↓
🎯 委派规划中...  ← 新增！
  ↓ (分析中)
🎯 委派决策：          ← 新增！
  • data-analyst: 分析数据库性能
  • code-reviewer: 审查代码质量
  • MasterAgent: 整合并生成报告
  ↓
📋 任务分解：          ← 新增！
  1. 分析数据库性能 → data-analyst
  2. 审查代码质量 → code-reviewer
  3. 生成综合报告 → MasterAgent (直接执行)
  ↓
notifyIntentAnalysis(combinedTask)
notifyPTCPlanning(combinedTask)
执行...
```

---

## 🎯 验证方案

### 测试 1：简单任务（MasterAgent 直接执行）

```bash
curl -X POST /agent/delegate \
  -d '{"task": "什么是 Python?"}'
```

**期望通知序列**：
1. 🎯 委派规划中...
2. 🎯 委派决策：MasterAgent 直接执行任务
3. 🧠 意图识别：general - 通用任务
4. 📋 执行计划：直接执行任务

### 测试 2：复杂任务（需要委派）

```bash
curl -X POST /agent/delegate \
  -d '{"task": "审查项目代码并分析安全性"}'
```

**期望通知序列**：
1. 🎯 委派规划中...
2. 🎯 委派决策：委派给 2 个子代理:
   • code-reviewer: 审查代码质量
   • security-auditor: 检查安全漏洞
3. 📋 任务分解：将任务分解为 3 个步骤:
   1. 审查代码质量 → code-reviewer
   2. 检查安全漏洞 → security-auditor
   3. 生成综合报告 → MasterAgent (直接执行)
4. 🧠 意图识别：code_generation - 代码生成
5. 📋 执行计划：使用 code-analysis, security-scan 技能

---

## 🚀 实施步骤

### 第 1 步：添加通知方法（1-2 小时）
- [x] 在 `master-agent.ts` 中添加三个新通知方法
- [x] 在 `planWithDelegation()` 中集成调用点
- [x] 添加类型定义（如需要）

### 第 2 步：前端支持（1 小时）
- [x] 在 `TaskDetail.jsx` 中添加新的 case 处理
- [x] 添加对应的图标和样式
- [x] 测试显示效果

### 第 3 步：端到端测试（30 分钟）
- [x] 运行测试用例 1
- [x] 运行测试用例 2
- [x] 验证通知顺序和内容
- [x] 检查错误处理

### 第 4 步：文档和优化（1 小时）
- [x] 更新架构文档
- [x] 添加通知设计指南
- [x] 性能优化（如需要）

---

## 当前状态

**已完成**:
- ✅ taskId 一致性修复（commit 31a29df）
  - 在 Agent.run() 开始处统一计算 effectiveTaskId
  - 所有通知方法使用同一个 taskId

- ✅ MasterAgent 委派通知透明化（✅ 方向 2 已完成）
  - 委派计划开始通知（delegation_planning, status: analyzing）
  - 委派决策完成通知（delegation_plan, status: resolved）
  - 任务分解通知（task_decomposition, status: resolved）
  - 前端完整展示支持（3 个新的 case 处理）

- ✅ delegates 空值处理优化（额外修复）
  - 后端：master-agent.ts 使用 `filter((s) => s.delegateTo != null)` 过滤 null 值
  - 前端：TaskDetail.jsx 添加防御性 `filter(d => d != null)` 检查
  - 修复：当没有委派时，不显示空的委派 badge

**实施总结**:
- 🎯 方向 2（增强通知透明度）已完全实现
- ⏱️ 实际耗时：约 3-4 小时
- 📊 改进效果：用户现在能看到完整的委派决策过程
- 🏗️ 架构保持：未改变现有的"伪委派"机制

**未来考虑**:
- 📈 根据实际使用数据评估是否需要"真委派"（方向 1）
- 🔍 监控用户反馈，决定是否需要增强功能
- 🔄 保持架构简单性，避免过度设计
