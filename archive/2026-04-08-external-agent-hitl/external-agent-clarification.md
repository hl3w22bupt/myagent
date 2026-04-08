# External Agent 澄清机制验证指南

## 📋 机制概述

当 Claude Code (External Agent) 需要更多信息才能继续执行时，它会通过 ACP 协议返回 `stopReason: 'awaiting_input'`。MyAgent 会捕获这个信号并触发 HITL (Human-In-The-Loop) 澄清流程。

## 🔄 完整流程

### 1. ExternalAgent 检测澄清需求
```typescript
// src/core/agent/external-agent.ts:370-387
if (stopReason === 'awaiting_input') {
  return {
    success: false,
    error: 'External agent is awaiting input (clarification needed)',
    clarification: {
      needs: true,
      question: 'The external agent needs more information to proceed.',
      stage: 'in_execution',
    },
    metadata: { stopReason, workspace },
  };
}
```

### 2. MasterAgent 传递澄清信息
```typescript
// src/core/agent/master-agent.ts:1292
return {
  ...,
  clarification: result.clarification, // ✅ 传递澄清
  metadata: { ...result.metadata },
};
```

### 3. HITL API 保存澄清状态
```typescript
// POST /api/hitl/:taskId
// 保存到 hitl_states 表
{
  status: 'awaiting',
  question: '...',
  agentType: 'External Agent',
  timestamp: Date.now()
}
```

### 4. 前端轮询并显示
```jsx
// 每 5 秒轮询 HITL 状态
const { hitlState } = useTaskPolling(taskId, 5000)

if (hitlState?.status === 'awaiting') {
  <ClarificationWaitingCard
    agentName={hitlState.agentType}
    question={hitlState.question}
    onExpand={openClarificationModal}
  />
}
```

### 5. 用户提交澄清
```typescript
// POST /api/task-hitl/:taskId
{
  response: {
    content: "用户澄清内容",
    role: "user"
  }
}

// ExternalAgent.handleHITLInput() 处理澄清
// 继续执行任务
```

## 🧪 验证方法

### 方法 1：模拟澄清请求（推荐）

由于 Claude Code 可能不总是返回澄清，我们可以通过以下方式测试：

```bash
# 1. 提交一个可能触发澄清的任务
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "修复那个bug，但是我不告诉你是哪个文件",
    "workflow": "simple-dev-workflow"
  }'

# 2. 等待 10-30 秒
sleep 20

# 3. 检查 HITL 状态
curl http://localhost:3000/api/hitl/{taskId}

# 4. 如果 status === 'awaiting'，说明澄清机制工作正常
```

### 方法 2：直接查看数据库

```sql
-- 查看 HITL 状态
SELECT * FROM hitl_states 
WHERE task_id = 'task-xxx' 
ORDER BY created_at DESC 
LIMIT 1;

-- 如果 status = 'awaiting'，说明正在等待澄清
```

### 方法 3：前端 UI 验证

1. 打开浏览器：`http://localhost:5173/task/{taskId}`
2. 如果需要澄清，应该看到：
   - 🟡 黄色的 **"等待澄清回复"** 卡片
   - 点击后弹出澄清输入框
   - 输入澄清后继续执行

## 🔍 调试技巧

### 检查日志
```bash
# 查看 ExternalAgent 日志
tail -f .motia/logs/motia.log | grep "ExternalAgent"

# 查看澄清相关日志
tail -f .motia/logs/motia.log | grep -i "clarification\|hitl\|awaiting"
```

### 检查任务状态
```bash
# 查看完整上下文
curl http://localhost:3000/api/contexts/{taskId} | jq '.'

# 查看任务 metadata
curl http://localhost:3000/api/contexts/{taskId} | jq '.data.task.metadata'

# 查看澄清标志
curl http://localhost:3000/api/contexts/{taskId} | jq '.data.task.metadata.clarification'
```

### 常见问题

**Q: 任务一直 pending，没有触发澄清**
A: 可能原因：
- ExternalAgent 初始化失败
- ACP 连接问题
- Claude Code 直接执行了任务（没有请求澄清）

**Q: 澄清卡片没有显示**
A: 检查：
1. HITL 状态是否正确保存到数据库
2. 前端轮询是否正常工作
3. ClarificationWaitingCard 组件是否正确渲染

**Q: 提交澄清后任务没有继续**
A: 检查：
1. ExternalAgent.handleHITLInput() 是否被调用
2. ACP runTurn 是否成功
3. 任务是否被重新提交到队列

## 📝 当前实现状态

✅ **已完成**：
- ExternalAgent 检测 `awaiting_input`
- MasterAgent 传递 clarification
- HITL API 保存状态
- 前端 ClarificationWaitingCard 组件
- 前端 ClarificationModal 组件
- 澄清提交和恢复执行

⚠️ **需要注意**：
- Claude Code 不总是请求澄清（取决于任务）
- 需要真实的模糊任务来触发
- 当前测试任务可能不够模糊

## 🎯 推荐测试案例

以下任务更容易触发澄清：

1. **超级模糊**："帮我修一下那个问题"
2. **缺少上下文**："优化性能"（没有说明是哪个模块）
3. **二义性**："实现用户功能"（什么用户？什么功能？）
4. **不完整需求**："创建一个应用"（什么类型的应用？）

## 📚 相关文件

- `src/core/agent/external-agent.ts` - ExternalAgent 澄清检测
- `src/core/agent/master-agent.ts` - 澄清信息传递
- `steps/api/task-hitl-result-api.step.ts` - HITL API
- `motia-frontend/src/pages/TaskDetail.jsx` - 前端页面
- `motia-frontend/src/components/task/ClarificationWaitingCard.jsx` - 澄清卡片
- `motia-frontend/src/components/task/ClarificationModal.jsx` - 澄清模态框
