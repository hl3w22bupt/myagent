# External Agent HITL 澄清机制实现报告

## 📊 问题分析

你完全正确！之前的实现有问题：

### 1. **错误的澄清返回**
```typescript
// ❌ 旧实现
return {
  success: false,
  error: 'External agent needs clarification',  // ← 报错了！
  clarification: { needs: true, question: ... }
};
```

**问题**：返回 `success: false` 会导致任务被标记为**失败**，而不是**等待澄清**。

### 2. **正确的 HITL 流程**

查看 Agent 的实现，正确的流程应该是：

```typescript
// ✅ 正确实现（参考 Agent.checkIntentClarification）

// 1. 保存 HITL 状态到数据库
await this.saveHITLStateInternal(taskId, {
  stage: 'in_execution',
  status: 'awaiting',
  agentName: `External Agent (${this.externalConfig!.type})`,
  question: output,
  options: [],
  createdAt: new Date(),
});

// 2. 触发 Agent Hook 通知
await this.hookManager.executeHook('onAwaitingHITL', question, [], {...});

// 3. 轮询等待用户响应（内部轮询，不返回）
const clarificationResponse = await this.pollHITLResultInternal(taskId);

// 4. 清除 HITL 状态
await this.clearHITLStateInternal(taskId);

// 5. 使用用户的澄清继续执行
const continuedResult = await this.handleHITLInput(clarificationResponse.content);

// 6. 返回继续执行的结果
return {
  success: continuedResult.success,
  output: continuedResult.output,
  ...
};
```

## ✅ 新实现（已修改）

### 修改的文件
`src/core/agent/external-agent.ts`

### 新增功能

#### 1. **检测提问**
```typescript
private detectQuestionInOutput(output: string): boolean {
  // 检测 10+ 种中英文提问模式
  const questionPatterns = [
    /请问.*/, /您想要.*/, /需要.*吗[？?]?/,
    /\?[^？]*/, /\？/, /请告诉我/, ...
  ];
  return questionPatterns.some(pattern => pattern.test(output));
}
```

#### 2. **HITL 内部方法**
```typescript
// 保存 HITL 状态到数据库
private async saveHITLStateInternal(taskId: string, hitlState: any): Promise<void>

// 轮询等待用户响应（每 2 秒检查一次，超时 10 分钟）
private async pollHITLResultInternal(taskId: string): Promise<{...}>

// 清除 HITL 状态
private async clearHITLStateInternal(taskId: string): Promise<void>
```

#### 3. **完整的 HITL 流程**
```typescript
if (stopReason === 'end_turn') {
  const hasQuestion = this.detectQuestionInOutput(output);
  
  if (hasQuestion) {
    // ⭐ 使用完整的 HITL 流程
    // 保存 → 触发 Hook → 轮询 → 清除 → 继续执行
    const clarificationResponse = await this.pollHITLResultInternal(taskId);
    const continuedResult = await this.handleHITLInput(clarificationResponse.content);
    
    return { success: continuedResult.success, ... };
  }
}
```

## 🔍 当前问题

### 1. **旧的 HITL 任务卡住**
日志显示有一个旧的 HITL 任务一直在等待：
```
[Agent] Still waiting for HITL response { taskId: 'task-1775027582785-1', elapsed: 70138 }
```

**解决方案**：清理数据库中的旧 HITL 状态。

### 2. **API 路由问题**
`/api/tasks/:id/hitl` 返回 HTML 而不是 JSON，可能是因为：
- 路由被前端拦截
- 服务需要重启
- API 未正确编译

### 3. **任务一直是 pending**
提交的任务一直处于 pending 状态，可能是：
- MasterAgent 还未开始执行
- Workflow 配置有问题
- ExternalAgent 初始化失败

## 🧪 如何测试新功能

### 步骤 1：清理旧数据
```sql
-- 清理所有 HITL 状态
UPDATE task_contexts SET hitl_state = NULL WHERE hitl_state IS NOT NULL;
```

### 步骤 2：重启服务
```bash
pkill -f "motia start"
npm run build
npm run start
```

### 步骤 3：提交测试任务
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "帮我实现一个功能，但是我不确定具体是什么",
    "workflow": "simple-dev-workflow"
  }'
```

### 步骤 4：检查 HITL 状态
```bash
# 检查数据库
psql -d myagent -c "SELECT id, hitl_state FROM task_contexts WHERE id LIKE 'task-1775%' ORDER BY created_at DESC LIMIT 5;"

# 检查 API
curl http://localhost:3000/api/tasks/{taskId}/hitl
```

### 步骤 5：前端验证
```bash
# 打开浏览器
open http://localhost:5173/task/{taskId}

# 应该看到：
# - 🟡 "等待澄清回复" 卡片
# - 显示 Claude Code 的提问
# - 输入框允许回复
```

## 📝 与 Agent 的对比

### Agent 的 HITL 流程（工作正常）
```typescript
// Agent.run()
const clarificationResult = await this.checkIntentClarification(intent, task, taskId, context);

// checkIntentClarification()
if (clarification.needs_clarification) {
  await this.saveHITLState(taskId, {...});
  const clarificationResponse = await this.pollHITLResult(taskId);
  await this.clearHITLState(taskId);
  return { needs: false, clarification: clarificationResponse.content };
}
```

### ExternalAgent 的 HITL 流程（新实现）
```typescript
// ExternalAgent.run()
if (hasQuestion) {
  await this.saveHITLStateInternal(taskId, {...});
  const clarificationResponse = await this.pollHITLResultInternal(taskId);
  await this.clearHITLStateInternal(taskId);
  const continuedResult = await this.handleHITLInput(clarificationResponse.content);
  return { success: continuedResult.success, ... };
}
```

## ✅ 已完成

1. ✅ 实现提问检测（`detectQuestionInOutput`）
2. ✅ 实现 HITL 内部方法
3. ✅ 集成完整的 HITL 流程
4. ✅ 代码编译成功

## ⚠️ 待解决

1. 清理旧的 HITL 任务
2. 验证 API 路由是否正常
3. 测试完整的澄清流程
4. 验证前端是否正确显示

## 📚 相关代码

- `src/core/agent/external-agent.ts` - ExternalAgent 实现
- `src/core/agent/agent.ts` (line 1772-1948) - Agent 的 HITL 参考
- `steps/api/task-hitl-result-api.step.ts` - HITL API

---

**最后更新**: 2026-04-08  
**状态**: 代码已实现，待测试验证
