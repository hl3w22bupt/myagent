# 委派通知修复 - 实施记录

## 修复日期
2026-02-12

## 修复的问题

### 问题 1: 委派通知重复 ✅ 已修复

**症状**:
```
08:13:17.346Z | delegation_plan | completed | 委派给 security-auditor
08:13:17.350Z | delegation_planning | completed | 委派给 security-auditor
```
两条通知仅相差 4ms，内容重复。

**根本原因**:
- `planWithDelegation()` 方法在 `cacheAndReturn()` 中发送了 `delegation_plan` (completed) 通知
- `executeDirectDelegation()` 方法又发送了 `delegation_planning` (completed) 通知
- 两条通知都表示委派完成，但使用不同的 `type` 和相同的内容

**修复方案**:
- **文件**: `src/core/agent/master-agent.ts`
- **位置**: 第 660-685 行
- **操作**: 注释掉 `executeDirectDelegation()` 中的 `delegation_planning` 通知发送代码
- **保留**: `planWithDelegation()` 中的 `delegation_plan` 通知（因为包含更详细的 plan.reasoning 和 plan.steps）
- **保留**: executionTraces 中的记录（用于调试）

**修复后的时间线**:
```
[delegation_planning] analyzing (规划开始)
[delegation_plan] completed (规划完成，包含详细 plan)
[Subagent] started (Subagent 开始执行)
[Subagent] completed (Subagent 完成)
[Master Agent] completed (Master Agent 完成)
```

### 问题 2: Subagent completed 通知缺失 🔍 调试中

**症状**:
从 stream-history API 返回的数据中，只看到一条 `agent | stage: post` 通知：
```json
{
  "type": "agent",
  "stage": "post",
  "data": {
    "subjectTitle": "Master Agent",  // ← 这是 Master Agent，不是 Subagent！
    "subjectSubTitle": undefined
  }
}
```

**预期行为**:
应该有两条 `agent | stage: post` 通知：
1. Subagent (security-auditor) completed
2. Master Agent completed

**代码分析**:
从 `src/core/agent/master-agent.ts:719-722` 可以看到：
```typescript
// Call onTaskComplete hook
if (this.hookManager) {
  await this.hookManager.executeHook('onTaskComplete', result, subagentContext);
  console.log(`[MasterAgent] Subagent onTaskComplete hook executed`, { subagentName });
}
```

**Subagent 创建** (第 597-606 行):
```typescript
const subagent = new Agent(
  {
    name,  // ← 传递了 name 参数
    systemPrompt: config?.systemPrompt || `You are ${name}.`,
    availableSkills: config?.availableSkills || [],
    llm: this.config.llm,
    sandbox: this.config.sandbox,
  },
  subagentSessionId
);
```

**getSubjectInfo()** (src/core/agent/agent.ts:819-824):
```typescript
getSubjectInfo(): { subjectTitle: string; subjectSubTitle?: string } {
  const subjectTitle = 'Subagent';
  const subjectSubTitle = this.agentName || undefined;  // ← 应该返回 subagent 名称
  return { subjectTitle, subjectSubTitle };
}
```

**onTaskComplete hook** (src/core/agent/hooks/progress-notify.ts:262-318):
```typescript
async onTaskComplete(result: AgentResult, context: any): Promise<void> {
  const agent = context.agent as any;
  const subjectInfo = agent?.getSubjectInfo?.() || {
    subjectTitle: agentType === 'MasterAgent' ? 'Master Agent' : 'Subagent',
    subjectSubTitle: undefined,
  };

  const event = {
    type: 'agent',
    stage: 'post',
    progressType: 'task-result',
    status: result.success ? 'completed' : 'failed',
    data: {
      subjectTitle: subjectInfo.subjectTitle,      // ← 应该是 'Subagent'
      subjectSubTitle: subjectInfo.subjectSubTitle, // ← 应该是 'security-auditor'
    }
  };

  await this.sendNotification(sessionId, event);
}
```

**代码逻辑看起来是正确的**：
1. ✅ Subagent 创建时传入了 `name` 参数
2. ✅ `Agent` 构造函数保存了 `this.agentName`
3. ✅ `getSubjectInfo()` 返回 `subjectSubTitle: this.agentName`
4. ✅ `onTaskComplete` hook 调用了 `agent.getSubjectInfo()`
5. ✅ `onTaskComplete` hook 发送通知到 taskExecution stream

**可能的问题**:
- Subagent 的 `onTaskComplete` hook 通知可能被后续的 Master Agent 的 `onTaskComplete` hook 覆盖
- 或者通知被发送了，但因为某种原因没有出现在 stream-history API 中

**调试措施**:
添加了更详细的日志来追踪问题：
- `src/core/agent/hooks/progress-notify.ts`: 添加 `subjectTitle` 和 `subjectSubTitle` 到日志
- `src/core/agent/master-agent.ts`: 添加 `subagent.getSubjectInfo()` 的日志输出

**验证步骤**:
1. 提交测试任务
2. 检查控制台日志，确认：
   - `[MasterAgent] Calling subagent onTaskComplete hook` 包含 `agentInfo`
   - `[AgentProgressNotifyHook] Task complete notification sent` 包含 `subjectTitle: 'Subagent'` 和 `subjectSubTitle: 'security-auditor'`
3. 检查 stream-history API，确认两条 `agent | stage: post` 通知都存在

## 修改的文件

### 1. src/core/agent/master-agent.ts
**修改 1**: 注释掉重复的 delegation_planning 通知
- 行号: 660-685
- 修改: 将 26 行代码注释掉
- 原因: 移除与 `delegation_plan` 重复的通知

**修改 2**: 添加详细的调试日志
- 行号: 710-714 (onTaskStart)
- 行号: 719-725 (onTaskComplete)
- 修改: 添加 `subagent.getSubjectInfo()` 的日志输出

### 2. src/core/agent/hooks/progress-notify.ts
**修改 1**: 增强 onTaskComplete 日志
- 行号: 306-311
- 修改: 添加 `subjectTitle` 和 `subjectSubTitle` 到日志

**修改 2**: 增强 onTaskStart 日志
- 行号: 238-242
- 修改: 添加 `subjectTitle` 和 `subjectSubTitle` 到日志

**修改 3**: 增强 sendNotification 日志
- 行号: 390-395
- 修改: 添加 `subjectTitle` 和 `subjectSubTitle` 到日志

## 测试验证

### 预期的正确时间线
```
1. [task] started
2. [agent] Master Agent started (pre)
3. [delegation_planning] analyzing
4. [delegation_plan] completed (包含详细 plan)
5. [agent] Subagent (security-auditor) started (pre)
6. [intent_analysis] analyzing
7. [ptc_planning] planning
8. [skill] running
9. [skill] completed
10. [agent] Subagent (security-auditor) completed (post) ← 应该有！
11. [agent] Master Agent completed (post)
```

### 关键检查点
1. ✅ delegation_planning 和 delegation_plan 通知不再重复
2. 🔍 Subagent (security-auditor) completed 通知出现
3. ✅ Master Agent completed 通知在 Subagent 完成之后
4. 🔍 通知中的 subjectSubTitle 显示正确的 subagent 名称

## 下一步
1. 运行测试任务
2. 检查控制台日志
3. 检查 stream-history API
4. 如果 Subagent completed 通知仍然缺失，需要进一步调查：
   - hookManager 是否正确传递 context
   - sendNotification 是否成功
   - stream-history API 是否过滤了某些通知
