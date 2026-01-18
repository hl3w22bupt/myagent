# Motia Agent System - API 参考文档

> 本文档列出了项目中的所有API端点，可用于测试和参考。
> 生成时间: 2026-01-17

---

## 目录

1. [健康检查 API](#健康检查-api)
2. [代理执行 API](#代理执行-api)
3. [子代理列表 API](#子代理列表-api)
4. [技能列表 API](#技能列表-api)
5. [技能详情 API](#技能详情-api)
6. [系统概览 API](#系统概览-api)

---

## 健康检查 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/health` |
| **方法** | `GET` |
| **文件** | `steps/health/health-check.step.ts` |
| **描述** | 系统健康状态和指标检查 |

### 响应示例

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 1234,
  "timestamp": "2026-01-17T10:00:00.000Z",
  "services": {
    "api": true,
    "agent": true,
    "sandbox": true,
    "llm": true
  },
  "metrics": {
    "totalTasks": 10,
    "successfulTasks": 8,
    "failedTasks": 2,
    "averageExecutionTime": 150
  }
}
```

### 响应字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `status` | enum | `healthy`, `degraded`, `unhealthy` |
| `version` | string | 系统版本号 |
| `uptime` | number | 运行时间(秒) |
| `timestamp` | string | ISO 8601 时间戳 |
| `services.api` | boolean | API服务健康状态 |
| `services.agent` | boolean | 代理服务健康状态 |
| `services.sandbox` | boolean | 沙箱服务健康状态 |
| `services.llm` | boolean | LLM服务健康状态 |
| `metrics.totalTasks` | number | 总任务数 |
| `metrics.successfulTasks` | number | 成功任务数 |
| `metrics.failedTasks` | number | 失败任务数 |
| `metrics.averageExecutionTime` | number | 平均执行时间(毫秒) |

### 测试命令

```bash
curl http://localhost:3000/health
```

---

## 代理执行 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/agent/execute` |
| **方法** | `POST` |
| **文件** | `steps/agents/agent-api.step.ts` |
| **描述** | 触发代理任务执行的REST API |
| **事件** | 发出 `agent.task.execute` 事件 |

### 请求体 Schema

```typescript
{
  task: string;              // 必需 - 任务描述
  sessionId?: string;        // 可选 - 会话ID，用于多轮对话
 上下文
  systemPrompt?: string;     // 可选 - 自定义系统提示
  availableSkills?: string[]; // 可选 - 可用技能列表
}
```

### 请求示例

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "帮我分析这个函数的性能",
    "sessionId": "session-123",
    "systemPrompt": "你是一个代码性能分析专家",
    "availableSkills": ["code-analysis", "profiling"]
  }'
```

### 响应示例

```json
{
  "success": true,
  "message": "Task submitted for execution",
  "taskId": "task-17371234567890",
  "task": "帮我分析这个函数的性能",
  "sessionId": "session-123"
}
```

### 请求字段说明

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `task` | string | 是 | 要执行的任务描述 |
| `sessionId` | string | 否 | 会话ID，用于多轮对话上下文 |
| `systemPrompt` | string | 否 | 自定义系统提示词 |
| `availableSkills` | string[] | 否 | 代理可用的技能列表 |

---

## 子代理列表 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/api/agents` |
| **方法** | `GET` |
| **文件** | `steps/api/agents-api.step.ts` |
| **描述** | 查询可用子代理列表 |

### 响应示例

```json
{
  "success": true,
  "count": 3,
  "agents": [
    {
      "id": "code-reviewer",
      "name": "Code Reviewer",
      "description": "Specialized agent for code review and quality analysis",
      "type": "subagent",
      "status": "active",
      "availableSkills": ["code-analysis", "read-file", "git-diff"],
      "systemPrompt": "You are a code review expert..."
    },
    {
      "id": "data-analyst",
      "name": "Data Analyst",
      "description": "Specialized agent for data analysis and visualization",
      "type": "subagent",
      "status": "active",
      "availableSkills": ["data-processing", "visualization"],
      "systemPrompt": "You are a data analysis expert..."
    },
    {
      "id": "security-auditor",
      "name": "Security Auditor",
      "description": "Specialized agent for security auditing and vulnerability assessment",
      "type": "subagent",
      "status": "active",
      "availableSkills": ["security-scan", "dependency-check"],
      "systemPrompt": "You are a security expert..."
    }
  ],
  "note": "These are default subagents that can be used by the MasterAgent for task delegation"
}
```

### 内置子代理

| ID | 名称 | 描述 | 可用技能 |
|-----|------|------|----------|
| `code-reviewer` | Code Reviewer | 代码审查和质量分析 | code-analysis, read-file, git-diff |
| `data-analyst` | Data Analyst | 数据分析和可视化 | data-processing, visualization |
| `security-auditor` | Security Auditor | 安全审计和漏洞评估 | security-scan, dependency-check |

### 测试命令

```bash
curl http://localhost:3000/api/agents
```

---

## 技能列表 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/api/skills` |
| **方法** | `GET` |
| **文件** | `steps/api/skills-api.step.ts` |
| **描述** | 查询可用技能列表，支持标签过滤 |

### 查询参数

| 参数 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `tags` | string | 否 | 逗号分隔的标签，用于过滤技能 |

### 响应示例

```json
{
  "success": true,
  "count": 5,
  "skills": [
    {
      "name": "web-search",
      "version": "1.0.0",
      "description": "搜索Web获取信息",
      "tags": ["search", "web"],
      "type": "tool"
    },
    {
      "name": "code-analysis",
      "version": "1.0.0",
      "description": "分析代码质量",
      "tags": ["code", "analysis"],
      "type": "tool"
    }
  ]
}
```

### 测试命令

```bash
# 获取所有技能
curl http://localhost:3000/api/skills

# 按标签过滤
curl "http://localhost:3000/api/skills?tags=search,web"
```

---

## 技能详情 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/api/skills/:skillName` |
| **方法** | `GET` |
| **文件** | `steps/api/skill-details-api.step.ts` |
| **描述** | 获取特定技能的详细信息 |

### 路径参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `skillName` | string | 技能名称 |

### 响应示例

```json
{
  "success": true,
  "skill": {
    "name": "web-search",
    "version": "1.0.0",
    "description": "搜索Web获取信息",
    "tags": ["search", "web"],
    "type": "tool",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      }
    },
    "output_schema": {
      "type": "object",
      "properties": {
        "results": { "type": "array" }
      }
    },
    "prompt_template": "...",
    "execution": "..."
  }
}
```

### 测试命令

```bash
# 获取特定技能详情
curl http://localhost:3000/api/skills/web-search
curl http://localhost:3000/api/skills/code-analysis
```

### 错误响应示例

```json
{
  "success": false,
  "message": "Skill 'nonexistent' not found",
  "availableSkills": ["web-search", "code-analysis", "summarize"]
}
```

---

## 系统概览 API

### 基础信息

| 项目 | 值 |
|------|-----|
| **路径** | `/api/system` |
| **方法** | `GET` |
| **文件** | `steps/api/system-api.step.ts` |
| **描述** | 获取系统概览和统计信息 |

### 响应示例

```json
{
  "success": true,
  "system": {
    "name": "Motia Agent Dashboard",
    "version": "1.0.0",
    "uptime": 3600
  },
  "stats": {
    "totalSkills": 10,
    "totalAgents": 3,
    "totalTasks": 50,
    "successfulTasks": 45,
    "failedTasks": 5,
    "activeSessions": 10
  },
  "skills": [
    {
      "name": "web-search",
      "version": "1.0.0",
      "description": "搜索Web获取信息",
      "tags": ["search", "web"],
      "type": "tool"
    }
  ],
  "agents": [
    {
      "id": "code-reviewer",
      "name": "Code Reviewer",
      "description": "Specialized agent for code review",
      "type": "subagent",
      "status": "active",
      "availableSkills": ["code-analysis", "read-file", "git-diff"]
    }
  ]
}
```

### 响应字段说明

| 字段 | 类型 | 描述 |
|------|------|------|
| `system.name` | string | 系统名称 |
| `system.version` | string | 系统版本 |
| `system.uptime` | number | 运行时间(秒) |
| `stats.totalSkills` | number | 总技能数 |
| `stats.totalAgents` | number | 总代理数 |
| `stats.totalTasks` | number | 总任务数 |
| `stats.successfulTasks` | number | 成功任务数 |
| `stats.failedTasks` | number | 失败任务数 |
| `stats.activeSessions` | number | 活跃会话数 |
| `skills` | array | 技能列表 |
| `agents` | array | 代理列表 |

### 测试命令

```bash
curl http://localhost:3000/api/system
```

---

## API 快速参考

| 路径 | 方法 | 描述 | 分类 |
|------|------|------|------|
| `/health` | GET | 系统健康检查 | 系统 |
| `/agent/execute` | POST | 执行代理任务 | 任务 |
| `/api/agents` | GET | 获取子代理列表 | 元数据 |
| `/api/skills` | GET | 获取技能列表 | 元数据 |
| `/api/skills/:skillName` | GET | 获取技能详情 | 元数据 |
| `/api/system` | GET | 获取系统概览 | 系统 |

---

## 测试脚本示例

### 健康检查测试

```bash
#!/bin/bash
curl -s http://localhost:3000/health | jq '.status'
# 预期输出: "healthy"
```

### 执行任务测试

```bash
#!/bin/bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "测试任务"}' | jq '.taskId'
```

### 获取所有技能测试

```bash
#!/bin/bash
curl -s http://localhost:3000/api/skills | jq '.count'
```

---

## 注意事项

1. **默认端口**: 开发服务器默认运行在 `3000` 端口
2. **认证**: 当前API未实现认证，生产环境需要添加API密钥
3. **异步执行**: `/agent/execute` 返回的是任务ID，实际执行是异步的
4. **流分配**:
   - `metadata-api` flow: `/api/agents`, `/api/skills`, `/api/skills/:skillName`, `/api/system`
   - `agent-workflow` flow: `/agent/execute`

---

*文档生成者: Claude Code*
