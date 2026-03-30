# API 总览

> MyAgent 完整的 API 文档：47 个端点分类说明

**阅读时间**: 10 分钟 | **难度**: ⭐⭐ intermediate

---

## 📊 API 分类概览

| 分类 | 端点数量 | 说明 | 重要性 |
|------|----------|------|--------|
| **Agent APIs** | 3 | Agent 执行相关 | ⭐⭐⭐ 核心 |
| **Context APIs** | 8 | 上下文查询相关 | ⭐⭐⭐ 核心 |
| **Knowledge APIs** | 8 | 知识库相关 | ⭐⭐ 重要 |
| **System APIs** | 6 | 系统管理相关 | ⭐⭐ 重要 |
| **Streaming APIs** | 5 | 实时流式输出 | ⭐⭐ 重要 |
| **Other APIs** | 17 | 其他功能 | ⭐ 普通 |

---

## 🚀 快速开始

### 基础请求格式

```bash
# 所有 API 请求的基础格式
curl -X {METHOD} http://localhost:3000{PATH} \
  -H "Content-Type: application/json" \
  -d '{请求体}'
```

### 认证方式

当前版本不需要认证（开发模式）。

生产环境建议添加：
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"task": "你好"}'
```

---

## ⭐ 核心 API（重点标注）

### 1. Agent APIs

#### 🔥 执行任务（最重要）

```bash
POST /agent/execute
```

**描述**: 执行一个 Agent 任务

**请求体**:
```json
{
  "task": "任务描述",
  "sessionId": "会话ID（可选）",
  "useDelegation": false,
  "environment": {
    "workspace": "/path/to/workspace"
  }
}
```

**响应**:
```json
{
  "taskId": "task-123",
  "status": "running",
  "result": "任务结果"
}
```

**文档**: [Agent APIs 详细文档](http-api/agent-apis.md)

---

### 2. Context APIs

#### 🔥 查询上下文（重要）

```bash
GET /api/contexts/{taskId}
```

**描述**: 查询任务的上下文信息

**响应**:
```json
{
  "taskId": "task-123",
  "messages": [
    {"role": "user", "content": "你好"},
    {"role": "assistant", "content": "你好！"}
  ],
  "status": "completed"
}
```

#### 🔥 查询任务输出（重要）

```bash
GET /api/contexts/outputs/{taskId}
```

**描述**: 查询任务的输出结果

**文档**: [Context APIs 详细文档](http-api/context-apis.md)

---

### 3. Knowledge APIs

#### 🔥 列出知识库集合

```bash
GET /api/knowledge/collections
```

**描述**: 列出所有可用的知识库集合

**响应**:
```json
{
  "collections": [
    {
      "name": "python-docs",
      "type": "postgres",
      "count": 1234
    }
  ]
}
```

#### 🔥 添加数据源

```bash
POST /api/knowledge/datasources
```

**描述**: 添加新的知识库数据源

**文档**: [Knowledge APIs 详细文档](http-api/knowledge-apis.md)

---

## 📋 完整 API 列表

### Agent APIs (3)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/agent/execute` | POST | 执行任务 | ⭐⭐⭐ |
| `/agent/results` | GET | 获取结果 | ⭐⭐⭐ |
| `/agent/tasks/delete` | DELETE | 删除任务 | ⭐⭐ |

### Context APIs (8)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/api/contexts/:taskId` | GET | 查询上下文 | ⭐⭐⭐ |
| `/api/contexts/outputs/:taskId` | GET | 查询输出 | ⭐⭐⭐ |
| `/api/contexts/compression` | POST | 压缩上下文 | ⭐⭐ |
| `/api/contexts/artifacts` | GET | 获取文件 | ⭐⭐ |
| `/api/stream-history` | GET | 流式历史 | ⭐ |
| `/api/sessions` | GET | 获取会话 | ⭐⭐ |
| `/api/favorites` | GET | 收藏列表 | ⭐ |
| `/api/favorites/add` | POST | 添加收藏 | ⭐ |

### Knowledge APIs (8)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/api/knowledge/collections` | GET | 列出集合 | ⭐⭐⭐ |
| `/api/knowledge/datasources` | GET | 列出数据源 | ⭐⭐⭐ |
| `/api/knowledge/datasources` | POST | 添加数据源 | ⭐⭐⭐ |
| `/api/knowledge/datasources/:id` | DELETE | 删除数据源 | ⭐⭐ |
| `/api/knowledge/datasources/:id/test` | POST | 测试数据源 | ⭐⭐ |
| `/api/knowledge/datasources/:id/discover` | POST | 发现集合 | ⭐⭐ |
| `/api/app/knowledge/collections` | GET | App 知识库 | ⭐⭐ |
| `/api/app/knowledge/collections` | POST | 添加集合 | ⭐⭐ |

### System APIs (6)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/health` | GET | 健康检查 | ⭐⭐⭐ |
| `/api/system` | GET | 系统信息 | ⭐⭐ |
| `/api/agents` | GET | 列出 Agents | ⭐⭐ |
| `/api/workflows` | GET | 列出 Workflows | ⭐ |
| `/api/apps` | GET | 列出 Apps | ⭐ |
| `/api/token-usage` | GET | Token 使用 | ⭐⭐ |

### Streaming APIs (5)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/api/streams/notify` | POST | 流式通知 | ⭐⭐ |
| `/agent/result/stream` | GET | 结果流 | ⭐⭐ |
| `/api/traces` | POST | 提交追踪 | ⭐ |
| `/api/traces/:traceId` | GET | 查询追踪 | ⭐ |
| `/api/task-chat` | POST | 任务聊天 | ⭐⭐ |

### Soul APIs (5)

| 端点 | 方法 | 描述 | 重要性 |
|------|------|------|--------|
| `/api/soul` | POST | Soul 执行 | ⭐ |
| `/api/soul/config` | GET/POST | Soul 配置 | ⭐ |
| `/api/soul/initialize` | POST | 初始化 | ⭐ |
| `/api/soul/session/:sessionId/stop` | POST | 停止会话 | ⭐ |
| `/api/soul/agents/status` | GET | Agent 状态 | ⭐ |

---

## 🔌 插件 API

插件 API 用于扩展 MyAgent 的功能：

- [自定义 Agent](plugin-api/custom-agent.md)
- [自定义 Skill](plugin-api/custom-skill.md)
- [自定义 Subagent](plugin-api/custom-subagent.md)
- [Hook 开发](plugin-api/hook-development.md)

---

## 📖 通用参数

### 请求参数

```typescript
interface RequestParams {
  taskId?: string;        // 任务 ID
  sessionId?: string;     // 会话 ID
  limit?: number;         // 分页大小
  offset?: number;        // 分页偏移
}
```

### 响应格式

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |
| 503 | 服务不可用 |

---

## 📖 下一步

- [Agent APIs 详细文档](http-api/agent-apis.md)
- [Context APIs 详细文档](http-api/context-apis.md)
- [Knowledge APIs 详细文档](http-api/knowledge-apis.md)
- [插件开发指南](plugin-api/README.md)

---

**版本**: v1.0 | **更新日期**: 2026-03-29
