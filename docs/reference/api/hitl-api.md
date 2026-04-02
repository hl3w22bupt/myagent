# HITL API 文档

> Human-In-The-Loop (人工介入) API 参考

**版本**: v1.0 | **最后更新**: 2026-04-01

---

## 📋 概述

HITL API 允许人类在工作流执行过程中介入，做出决策或提供澄清。当工作流步骤配置了 `on_failure: hitl` 时，系统会请求人类介入。

### 工作流反馈循环中的 HITL

在工作流反馈循环场景中，HITL 用于：
- 步骤失败后的人工决策（重试、跳过、回滚、中止）
- 复杂错误的上下文判断
- 需要人类经验的决策点

---

## 🔧 API 端点

### 提交 HITL 响应

**请求**:
```http
PUT /api/tasks/:taskId/hitl
Content-Type: application/json
```

**路径参数**:
- `taskId` (string, required): 任务 ID

**请求体**:
```json
{
  "decision": "string",      // 必需：决策内容（文本或 JSON）
  "feedback": "string"       // 可选：补充说明或备注
}
```

**响应**:
```json
{
  "success": true,
  "message": "HITL result saved, Agent will resume execution",
  "data": {
    "taskId": "workflow-123",
    "decision": "{\"action\":\"retry\"}",
    "feedback": "Optional feedback",
    "timestamp": "2026-04-01T12:00:00.000Z"
  }
}
```

---

## 📝 Decision 格式

### 1. 结构化决策（推荐用于工作流 HITL）

对于工作流反馈循环，`decision` 应该是 JSON 字符串：

```json
{
  "action": "retry" | "skip" | "rollback" | "abort",
  "params": {
    // action 相关参数
    "targetStepId": "step-id"  // 仅 rollback 需要
  }
}
```

**示例**:

重试步骤：
```bash
curl -X PUT http://localhost:3000/api/tasks/{taskId}/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "{\"action\": \"retry\", \"params\": {}}",
    "feedback": "网络问题已修复，可以重试"
  }'
```

跳过步骤：
```bash
curl -X PUT http://localhost:3000/api/tasks/{taskId}/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "{\"action\": \"skip\", \"params\": {}}",
    "feedback": "此步骤非关键，跳过继续"
  }'
```

回滚到指定步骤：
```bash
curl -X PUT http://localhost:3000/api/tasks/{taskId}/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "{\"action\": \"rollback\", \"params\": {\"targetStepId\": \"build\"}}",
    "feedback": "部署失败，回滚到构建阶段"
  }'
```

中止工作流：
```bash
curl -X PUT http://localhost:3000/api/tasks/{taskId}/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "{\"action\": \"abort\", \"params\": {}}",
    "feedback": "发现严重问题，需要人工介入"
  }'
```

### 2. 文本决策（兼容 Agent HITL）

对于 Agent HITL（需求澄清），`decision` 是纯文本：

```bash
curl -X PUT http://localhost:3000/api/tasks/{taskId}/hitl \
  -H "Content-Type: application/json" \
  -d '{
    "decision": "请开发一个用户登录功能",
    "feedback": "需要支持邮箱和手机号登录"
  }'
```

**文本关键词映射**:
- 包含 "retry" / "重试" / "再试" → `retry` action
- 包含 "skip" / "跳过" → `skip` action
- 包含 "rollback" / "回滚" → `rollback` action
- 其他 → `abort` action

---

## 🔄 完整工作流

### HITL 流程时序图

```
┌─────────┐      ┌─────────────┐      ┌─────────┐
│ Workflow│ ───> │ TaskContext │ ───> │   API   │
│ Engine  │      │   (DB)      │      │ Endpoint│
└─────────┘      └─────────────┘      └─────────┘
    │                │                    │
    │ 1. 步骤失败     │                    │
    │                │                    │
    │ 2. 保存 HITL   │                    │
    │    状态        │                    │
    │──────────────>│                    │
    │                │                    │
    │ 3. 开始轮询     │                    │
    │<──────────────│                    │
    │                │                    │
    │ 4. 每 10 秒检查 │                    │
    │    一次        │                    │
    │                │                    │
    │                │              ┌─────┐
    │                │              │Human│
    │                │              └─────┘
    │                │                   │
    │                │ 5. PUT /api/tasks/:id/hitl
    │                │<──────────────────│
    │                │                   │
    │ 6. status = completed
    │<──────────────│                   │
    │                │                   │
    │ 7. 清除 HITL   │                   │
    │    状态        │                   │
    │──────────────>│                   │
    │                │                   │
    │ 8. 执行 action │                   │
    │                │                   │
    ▼                ▼                   ▼
```

### 步骤详解

1. **步骤失败**
   - WorkflowEngine 检测到步骤失败
   - 检查 `on_failure` 配置

2. **保存 HITL 状态**
   - 创建/更新 `TaskContext.hitlState`
   - 状态包含：
     - `stage`: `'in_execution'`
     - `status`: `'awaiting'`
     - `agentName`: 工作流名称
     - `question`: 失败原因和选项
     - `options`: 可选操作列表
     - `workflowName`: 工作流名称
     - `stepId`: 失败步骤 ID
     - `failureReason`: 错误信息

3. **开始轮询**
   - WorkflowEngine 每 10 秒检查一次 HITL 状态
   - 默认超时时间：7 天

4. **人类响应**
   - 人类通过 API 提交决策
   - API 验证请求：
     - TaskContext 必须存在
     - HITL 状态必须存在
     - HITL 状态必须是 `'awaiting'`

5. **更新状态**
   - API 设置 `hitlState.status = 'completed'`
   - 保存人类响应到 `hitlState.response`
   - 添加响应到对话历史

6. **引擎检测到响应**
   - 下一次轮询检测到 `status === 'completed'`
   - 解析 `response.content`

7. **清除 HITL 状态**
   - 删除 `TaskContext.hitlState`
   - 保存更新后的 TaskContext

8. **执行 Action**
   - 根据解析的 action 执行相应操作：
     - `retry`: 重新执行步骤
     - `skip`: 标记步骤为 skipped
     - `rollback`: 回滚到指定步骤
     - `abort`: 抛出异常中止工作流

---

## 📊 TaskContext.hitlState 结构

### 工作流 HITL 状态

```typescript
{
  stage: 'in_execution',
  status: 'awaiting' | 'completed',
  agentName: 'Workflow:workflow-name',
  question: '步骤 "deploy" 执行失败：

错误：Deployment failed: insufficient resources

请选择处理方式：',
  options: ['重试', '跳过', '回滚', '中止'],
  createdAt: Date,

  // 工作流特定字段
  workflowName: 'feedback-loop-demo',
  stepId: 'deploy-prod',
  failureReason: 'Deployment failed: insufficient resources',
  retryAttempt: 0,

  // 人类响应（status = completed 时）
  response?: {
    content: string,      // JSON 字符串或文本
    feedback?: string,    // 可选补充说明
    timestamp: Date
  }
}
```

### Agent HITL 状态

```typescript
{
  stage: 'pre_intent' | 'post_intent' | 'in_execution',
  status: 'awaiting' | 'completed',
  agentName: 'emotional-girlfriend',
  question: '你想要什么样的聊天风格？',
  options?: ['温柔体贴', '活泼开朗', '甜美可爱'],
  createdAt: Date,

  // 人类响应
  response?: {
    content: string,      // 文本响应
    feedback?: string,
    timestamp: Date
  }
}
```

---

## ⚠️ 错误处理

### HTTP 400: Bad Request

**原因**:
- 请求体格式错误
- `decision` 字段缺失或为空

**响应**:
```json
{
  "success": false,
  "message": "Invalid request body",
  "error": "decision is required",
  "details": [...]
}
```

### HTTP 400: HITL 状态不正确

**原因**:
- HITL 状态不是 `'awaiting'`
- 可能已经响应过或已超时

**响应**:
```json
{
  "success": false,
  "message": "HITL state is not awaiting (current status: completed)"
}
```

### HTTP 404: TaskContext 不存在

**原因**:
- `taskId` 不存在
- Task 已过期或被清理

**响应**:
```json
{
  "success": false,
  "message": "Task not found"
}
```

### HTTP 404: HITL 状态不存在

**原因**:
- Task 存在但没有等待 HITL
- 可能是正常执行中的任务

**响应**:
```json
{
  "success": false,
  "message": "HITL state not found - task is not waiting for clarification"
}
```

---

## 🔐 安全考虑

1. **认证授权**: 生产环境应添加认证中间件
2. **输入验证**: 所有输入都应经过验证和清理
3. **超时保护**: 默认 7 天超时，防止无限等待
4. **状态验证**: 检查 HITL 状态避免重复响应
5. **审计日志**: 记录所有 HITL 操作用于审计

---

## 📚 相关文档

- [Workflow System](../reference/architecture/workflow-system.md) - 工作流系统详解
- [Workflow Feedback Loop Implementation](../plans/workflow-feedback-loop-implementation.md) - 实施计划
- [Agent System](../reference/architecture/agent-system.md) - Agent 系统详解

---

## 🔄 API 版本历史

- **v1.0** (2026-04-01): 初始版本，支持工作流反馈循环 HITL
