# 委派通知透明化实现文档

## 概述

本文档记录了 MasterAgent 委派计划通知透明化的实现，用于增强用户体验。

## 实现时间

2025-02-12

## 实现内容

### 后端实现（`src/core/agent/master-agent.ts`）

#### 1. 新增三个通知方法

**`notifyDelegationPlanStart(task, taskId)`**
- 发送委派规划开始通知
- 事件类型：`delegation_planning`
- 包含原始任务和可用的 subagent 数量

**`notifyDelegationPlanResult(task, plan, taskId)`**
- 发送委派决策完成通知
- 事件类型：`delegation_plan`
- 包含委派详情：
  - `delegates`: 委派给哪些 subagent
  - `executeDirectly`: 直接执行的步骤数
  - `reasoning`: 委派策略理由
  - `steps`: 所有分解的步骤

**`notifyTaskDecomposition(originalTask, combinedTask, plan, taskId)`**
- 发送任务分解通知
- 事件类型：`task_decomposition`
- 包含分解详情：
  - `originalTask`: 用户原始任务
  - `decomposedSteps`: 分解后的步骤列表
    - `stepNumber`: 步骤编号
    - `task`: 步骤任务内容
    - `delegateTo`: 执行者（subagent 名称或 MasterAgent）
  - `combinedTaskPreview`: 合并任务预览

#### 2. 集成到执行流程

**修改 `planWithDelegation(task, taskId)` 方法**
- 在方法开始时调用 `notifyDelegationPlanStart()`
- 在所有返回路径（缓存命中/LLM 解析）中调用 `notifyDelegationPlanResult()`

**修改 `run(task, taskId)` 方法**
- 在生成 `combinedTask` 后调用 `notifyTaskDecomposition()`
- 确保用户能看到完整的任务分解过程

### 前端实现（`motia-frontend/src/pages/TaskDetail.jsx`）

#### 新增三个 case 处理

**`case 'delegation_planning'`**
```
[🎯 委派规划中] 正在分析任务并决定执行策略...
```

**`case 'delegation_plan'`**
```
[🎯 委派决策] 委派给 2 个子代理:
  • code-reviewer: 审查代码质量
  • security-auditor: 检查安全漏洞
```

或者直接执行：
```
[🎯 委派决策] MasterAgent 将直接执行任务
```

**`case 'task_decomposition'`**
```
[📋 任务分解] 将任务分解为 3 个步骤:
  1. 审查代码质量 → code-reviewer
  2. 检查安全漏洞 → security-auditor
  3. 生成综合报告 → MasterAgent (execute directly)
```

## 用户体验改进

### 改进前

```
用户提交任务 → (黑盒操作，无反馈)
  ↓ (执行几秒钟)
  ↓
[🧠 意图识别] code_generation
  ↓
[📋 执行计划] 使用 code-analysis skill
  ↓
(开始执行)
```

**问题**：用户在执行前看不到任何规划信息，不知道 MasterAgent 如何处理任务

### 改进后

```
用户提交任务 → MasterAgent
  ↓
🎯 委派规划中... (立即反馈)
  ↓ (分析中，2-5秒)
  ↓
🎯 委派决策：          ← 用户看到决策过程
  • code-reviewer: 审查代码质量
  • security-auditor: 检查安全漏洞
  ↓
📋 任务分解：          ← 用户看到执行计划
  1. 审查代码质量 → code-reviewer
  2. 检查安全漏洞 → security-auditor
  3. 生成综合报告 → MasterAgent (直接执行)
  ↓
[🧠 意图识别] code_generation
[📋 执行计划] 使用 code-analysis skill
  ↓
(开始执行)
```

**改进点**：
1. ✅ **即时反馈**：提交任务后立即看到"委派规划中"
2. ✅ **透明决策**：清楚显示选择了哪些 subagent 及理由
3. ✅ **执行计划**：展示任务如何分解和分配
4. ✅ **降低焦虑**：用户知道系统在做什么，不再困惑

## 技术细节

### 通知数据流

```
MasterAgent.planWithDelegation()
  ↓
notifyDelegationPlanStart()
  → streams.taskExecution.set(groupId, entryId, {
      type: 'delegation_planning',
      progressType: 'delegation',
      status: 'analyzing',
      data: { originalTask, subagentsCount }
    })
  ↓
[LLM 分析或缓存查询]
  ↓
notifyDelegationPlanResult()
  → streams.taskExecution.set(groupId, entryId, {
      type: 'delegation_plan',
      progressType: 'delegation-result',
      status: 'completed',
      data: { originalTask, reasoning, steps, delegates }
    })
  ↓
MasterAgent.run() 继续执行
  ↓
notifyTaskDecomposition()
  → streams.taskExecution.set(groupId, entryId, {
      type: 'task_decomposition',
      progressType: 'task-breakdown',
      status: 'completed',
      data: { originalTask, decomposedSteps, combinedTaskPreview }
    })
```

### 前端处理流程

```
formatAgentHookMessage(event)
  ↓
switch (event.type)
  ↓
case 'delegation_planning':
  return "[🎯 委派规划中] ..."

case 'delegation_plan':
  const { delegates, executeDirectly } = event.data
  // 根据委派数量生成不同消息
  if (delegateCount > 0) {
    return `[🎯 委派决策] 委派给 ${delegateCount} 个子代理: ...`
  } else {
    return `[🎯 委派决策] MasterAgent 将直接执行任务`
  }

case 'task_decomposition':
  const { decomposedSteps } = event.data
  return `[📋 任务分解] 将任务分解为 ${stepsCount} 个步骤: ...`
```

## 测试场景

### 测试 1：简单任务（MasterAgent 直接执行）

**输入**：
```bash
curl -X POST /agent/delegate \
  -d '{"task": "什么是 Python?"}'
```

**期望通知序列**：
1. `[🎯 委派规划中] 正在分析任务并决定执行策略...`
2. `[🎯 委派决策] MasterAgent 将直接执行任务`
3. `[📋 任务分解] 任务无需分解，将直接执行`
4. `[🧠 意图识别] general - 通用任务`
5. `[📋 执行计划] 直接执行任务`

### 测试 2：复杂任务（需要委派）

**输入**：
```bash
curl -X POST /agent/delegate \
  -d '{"task": "审查项目代码并分析安全性"}'
```

**期望通知序列**：
1. `[🎯 委派规划中] 正在分析任务并决定执行策略...`
2. `[🎯 委派决策] 委派给 2 个子代理:`
   - `  • code-reviewer: 审查代码质量`
   - `  • security-auditor: 检查安全漏洞`
3. `[📋 任务分解] 将任务分解为 3 个步骤:`
   - `  1. 审查代码质量 → code-reviewer`
   - `  2. 检查安全漏洞 → security-auditor`
   - `  3. 生成综合报告 → MasterAgent (直接执行)`
4. `[🧠 意图识别] code_generation - 代码生成`
5. `[📋 执行计划] 依次使用 code-analysis、security-scan skills`

### 测试 3：混合任务（部分委派）

**输入**：
```bash
curl -X POST /agent/delegate \
  -d '{"task": "分析数据库性能，审查相关代码，生成优化建议"}'
```

**期望通知序列**：
1. `[🎯 委派规划中] 正在分析任务并决定执行策略...`
2. `[🎯 委派决策] 委派给 1 个子代理:`
   - `  • code-reviewer: 审查相关代码`
3. `[📋 任务分解] 将任务分解为 2 个步骤:`
   - `  1. 分析数据库性能 → data-analyst`
   - `  2. 审查相关代码并生成优化建议 → MasterAgent (直接执行)`
4. 后续的意图识别和 PTC 计划...

## 已验证内容

- ✅ TypeScript 编译通过
- ✅ 新增通知方法已实现
- ✅ 前端 case 处理已添加
- ✅ 通知数据结构符合现有规范
- ✅ 开发服务器启动成功

## 后续优化建议

### 短期（可选）
1. **错误处理增强**
   - 如果委派规划失败，发送错误通知
   - 格式：`[❌ 委派规划失败] ${error.message}`

2. **进度条显示**
   - 在"委派规划中"时显示加载动画
   - 更符合用户预期的视觉反馈

### 中期（可选）
1. **委派历史记录**
   - 保存每次委派决策的历史
   - 用于分析和优化委派策略

2. **SubAgent 性能统计**
   - 记录每个 subagent 的执行时间
   - 在委派决策时显示预估时间

### 长期（可选）
1. **真委派机制评估**
   - 收集数据评估是否需要真实的多进程委派
   - 权衡：性能 vs 隔离性 vs 复杂度

2. **委派策略优化**
   - 基于历史数据优化 LLM prompt
   - 提高委派决策准确率

## 相关文件

### 后端
- `/Users/leo/workspace/myagent/src/core/agent/master-agent.ts`
  - 新增：`notifyDelegationPlanStart()` (行 283-317)
  - 新增：`notifyDelegationPlanResult()` (行 333-367)
  - 新增：`notifyTaskDecomposition()` (行 376-418)
  - 修改：`planWithDelegation()` (行 420-593)
  - 修改：`run()` (行 46-95)

### 前端
- `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx`
  - 新增：`case 'delegation_planning'` (行 80-81)
  - 新增：`case 'delegation_plan'` (行 83-109)
  - 新增：`case 'task_decomposition'` (行 111-127)

## 总结

本次实现遵循**方向 2：增强伪委派的通知透明度**策略：

1. ✅ **不改变现有委派机制**：保持"伪委派"架构（通过文本提示 LLM 模拟委派）
2. ✅ **只添加通知链**：补充完整的用户可见反馈
3. ✅ **为未来留空间**：可以基于使用数据评估是否需要真委派
4. ✅ **风险可控**：小改动、易回滚、不影响现有功能

**核心价值**：通过透明的通知体系，解决了用户在 MasterAgent 编排时的"黑盒焦虑"，显著提升了用户体验。
