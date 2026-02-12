# Agent 通知系统改进记录

## 项目背景

基于 plan 文件 `snug-nibbling-crystal.md` 的"方向 2：增强伪委派通知透明度"方案，对 Agent 通知系统进行改进。

## 问题诊断

### 原始问题
用户在 traces API 中看不到 `intent_analysis` 和 `ptc_planning` 这两个 trace，导致无法追踪完整的任务执行过程。

### 根本原因
`Agent.run()` 方法中，不同通知使用了不一致的 taskId：
- `notifyIntentAnalysis(task, context?.taskId)` ← 使用 `context?.taskId`
- `notifyPTCPlanning(task, result, context?.taskId)` ← 使用 `context?.taskId`
- 其他地方使用 `taskId || '...'` ← 生成新 ID

当 taskId 参数为 undefined 时，通知方法内部会生成新的 taskId（`task-${Date.now()}`），导致：
1. 不同通知使用不同的 taskId
2. traces API 无法正确关联同一任务的多个 trace
3. 前端无法显示完整的执行链路

---

## 解决方案

### 修改文件
`src/core/agent/agent.ts`

### 核心改动
在 `Agent.run()` 方法开始处，统一计算 `effectiveTaskId`：

```typescript
async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
  console.log('[Agent] agent.run() called', { sessionId: this.sessionId, task, taskId });

  // ✅ 确保 taskId 总是有值的（保持 traces API 关联）
  const effectiveTaskId = taskId || context?.taskId;

  console.log('[Agent] Using effective taskId:', effectiveTaskId, 'for all notifications');

  // ... 后续代码
}
```

### 修改点（共 6 处）

| 行号 | 原代码 | 修改后 | 说明 |
|------|--------|--------|------|
| 286 | `this.checkHITLCheckpoint(taskId \|\| '', context)` | `this.checkHITLCheckpoint(effectiveTaskId \|\| '', context)` | HITL 检查点恢复 |
| 298 | `this.notifyIntentAnalysis(task, context?.taskId)` | `this.notifyIntentAnalysis(task, effectiveTaskId)` | 意图分析通知 |
| 301 | `this.checkIntentClarification(intent, task, taskId \|\| '', context)` | `this.checkIntentClarification(intent, task, effectiveTaskId \|\| '', context)` | 意图澄清检查 |
| 312 | `taskId: taskId \|\| \`task-${Date.now()}\`` | `taskId: effectiveTaskId \|\| \`task-${Date.now()}\`` | 澄清请求通知 |
| 338 | `const effectiveTaskId = taskId \|\| ...` | 删除此行（重复定义） | HITL 状态保存 |
| 428 | `this.notifyPTCPlanning(task, result, context?.taskId)` | `this.notifyPTCPlanning(task, result, effectiveTaskId)` | PTC 规划通知 |

---

## 实现效果

### 修改前
```
用户任务 → Agent.run()
  ↓ notifyIntentAnalysis(task, context?.taskId)
    taskId = task-1738392048591 (新生成的)
  ↓ notifyPTCPlanning(task, context?.taskId)
    taskId = task-1738392048625 (另一个新生成的)
  ↓ traces API 中无法关联这两个 trace
```

### 修改后
```
用户任务 → Agent.run()
  ↓ effectiveTaskId = taskId || context?.taskId (统一计算)
  ↓ notifyIntentAnalysis(task, effectiveTaskId)
    taskId = task-1738392048591 (一致)
  ↓ notifyPTCPlanning(task, result, effectiveTaskId)
    taskId = task-1738392048591 (一致)
  ↓ traces API 中可以正确关联所有 trace
```

---

## 提交记录

```
commit 31a29df
fix: ensure consistent taskId across all Agent notifications

修复 Agent.run() 方法中 taskId 不一致的问题：
- 在方法开始处统一计算 effectiveTaskId = taskId || context?.taskId
- 所有通知方法（notifyIntentAnalysis, notifyPTCPlanning）都使用 effectiveTaskId
- 确保 traces API 中所有 trace 使用同一个 taskId 进行关联

这解决了之前不同通知生成不同 taskId 导致 traces 无法正确关联的问题。
```

---

## 后续计划（未实现）

根据原 plan 文件，还有以下改进项尚未实施：

### 1. MasterAgent 委派通知（未实现）

**文件**：`src/core/agent/master-agent.ts`

需要添加 3 个通知方法：
- `notifyDelegationPlanStart()` - 委派规划开始
- `notifyDelegationPlanResult()` - 委派决策完成
- `notifyTaskDecomposition()` - 任务分解详情

### 2. 前端支持（未实现）

**文件**：`motia-frontend/src/pages/TaskDetail.jsx`

需要添加新的 case 处理：
- `delegation_planning` - 委派规划中
- `delegation_plan` - 委派决策结果
- `task_decomposition` - 任务分解详情

---

## 总结

- ✅ **已完成**：Agent.run() 中 taskId 一致性修复
- ⏸️ **未实施**：MasterAgent 委派通知透明化
- ⏸️ **未实施**：前端委派通知展示

**当前状态**：taskId 一致性问题已解决，traces API 能够正确关联同一任务的多个 trace。
