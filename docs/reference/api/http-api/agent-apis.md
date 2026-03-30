# Agent APIs

> Agent 执行相关的 API（3个端点）

**阅读时间**: 5 分钟 | **难度**: ⭐ beginner

---

## ⭐ 核心端点：执行任务

### POST /agent/execute

**描述**: 执行一个 Agent 任务

**重要性**: ⭐⭐⭐ (最重要)

### 请求示例

```bash
# 简单任务
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "你好，介绍一下你自己"
  }'

# 带会话的任务
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "我刚才说了什么？",
    "sessionId": "user-123"
  }'

# 使用 MasterAgent 委派
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "审查这个项目的代码",
    "useDelegation": true
  }'

# 使用知识库
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Python 有什么特点？",
    "environment": {
      "knowledgeCollection": "python-docs"
    }
  }'
```

### 请求参数

```typescript
{
  // 必需
  task: string;              // 任务描述

  // 可选
  sessionId?: string;        // 会话 ID（多轮对话）
  systemPrompt?: string;     // 自定义系统提示
  availableSkills?: string[]; // 可用技能列表
  app?: string;              // 应用标识符
  useDelegation?: boolean;   // 是否使用 MasterAgent
  delegateTo?: string[];     // 显式委派的 Subagent
  environment?: {            // 环境配置
    workspace?: string;      // 工作目录
    gitUrl?: string;         // Git 仓库 URL
    language?: string;       // 编程语言
    knowledgeCollection?: string; // 知识库集合
    // ... 其他自定义环境变量
  }
}
```

### 响应示例

```json
{
  "taskId": "task-abc123",
  "status": "running",
  "sessionId": "user-123",
  "result": "任务执行结果..."
}
```

---

## GET /agent/results

**描述**: 获取任务结果

**重要性**: ⭐⭐⭐

### 请求示例

```bash
curl http://localhost:3000/agent/results?taskId=task-abc123
```

### 响应示例

```json
{
  "taskId": "task-abc123",
  "status": "completed",
  "result": {
    "content": "任务结果",
    "artifacts": []
  },
  "createdAt": "2026-03-29T10:00:00Z",
  "completedAt": "2026-03-29T10:00:05Z"
}
```

---

## DELETE /agent/tasks/delete

**描述**: 删除任务

**重要性**: ⭐⭐

### 请求示例

```bash
curl -X DELETE http://localhost:3000/agent/tasks/delete?taskId=task-abc123
```

### 响应示例

```json
{
  "success": true,
  "message": "任务已删除"
}
```

---

## 📖 相关文档

- [Context APIs](context-apis.md) - 查询任务上下文
- [Agent 系统](../../architecture/agent-system.md) - Agent 工作原理
- [核心概念](../../architecture/core-concepts.md) - Task 和 Session

---

**版本**: v1.0 | **更新日期**: 2026-03-29
