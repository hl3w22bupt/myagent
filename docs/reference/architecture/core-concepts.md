# 核心概念

> 理解 MyAgent 的核心概念：Session、Task、Agent、Skill

**阅读时间**: 8 分钟 | **难度**: ⭐ beginner

---

## 🎯 概念概览

MyAgent 有 4 个核心概念，理解它们是使用系统的关键：

| 概念 | 说明 | 类比 |
|------|------|------|
| **Session** | 多轮对话的会话，保持上下文 | 聊天窗口 |
| **Task** | 单次任务执行，继承 Session 上下文 | 一条消息 |
| **Agent** | 任务执行引擎，生成和执行代码 | 智能助手 |
| **Skill** | 可复用的技能组件 | 工具函数 |

---

## 1. Session（会话）

### 什么是 Session？

**Session** 是一个多轮对话的上下文容器，类似于聊天窗口。

### 特性

- **生命周期**: 30 分钟不活跃自动清理
- **上下文保留**: 保留最近 50 条消息（约 25 轮对话）
- **自动压缩**: 超过 20 条消息自动压缩上下文
- **会话隔离**: 不同 Session 之间完全隔离

### 使用示例

```bash
# 第一轮对话
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "我叫张三",
    "sessionId": "user-123"
  }'

# 第二轮对话（Agent 记住了第一轮的内容）
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "我叫什么名字？",
    "sessionId": "user-123"
  }'

# Agent 会回答：你叫张三
```

### Session 状态

```typescript
interface SessionState {
  sessionId: string;          // 会话 ID
  conversationHistory: Message[];  // 对话历史
  executionHistory: TaskResult[];  // 执行历史
  variables: Map<string, any>;     // 会话变量
  createdAt: Date;            // 创建时间
  lastActivityAt: Date;       // 最后活跃时间
}
```

### 什么时候使用 Session？

✅ **需要使用 Session 的场景**：
- 多轮对话
- 需要记住之前的交互
- 需要共享上下文

❌ **不需要 Session 的场景**：
- 独立的一次性任务
- 不需要记住之前的交互

---

## 2. Task（任务）

### 什么是 Task？

**Task** 是单次任务执行，是 Agent 处理的最小单位。

### 特性

- **继承上下文**: 如果提供 sessionId，会继承 Session 的上下文
- **独立执行**: 每个 Task 有独立的生命周期
- **状态跟踪**: pending → running → completed/failed
- **结果持久化**: 执行结果存储在数据库

### Task 结构

```typescript
interface Task {
  taskId: string;           // 任务 ID（自动生成）
  task: string;             // 任务描述
  sessionId?: string;       // 会话 ID（可选）
  status: TaskStatus;       // 任务状态
  result?: any;             // 执行结果
  error?: string;           // 错误信息
  createdAt: Date;          // 创建时间
  completedAt?: Date;       // 完成时间
}
```

### Task 生命周期

```
pending (待处理)
    ↓
running (执行中)
    ↓
  ┌──────────────┐
  │              │
completed    failed
(成功)        (失败)
```

### 使用示例

```bash
# 简单任务（无 Session）
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "分析这段代码的质量"
  }'

# 带上下文的任务（有 Session）
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "用 Python 实现刚才讨论的功能",
    "sessionId": "user-123"
  }'
```

### 查询 Task 状态

```bash
# 查询任务状态
curl http://localhost:3000/api/contexts/{taskId}

# 查询任务输出
curl http://localhost:3000/api/contexts/outputs/{taskId}
```

---

## 3. Agent（代理）

### 什么是 Agent？

**Agent** 是任务执行引擎，负责理解任务、生成代码、执行代码。

### 核心能力

#### 3.1 PTC 代码生成
Agent 自动生成工具调用代码：

```python
# Agent 自动生成的代码示例
def execute_task():
    # 1. 调用代码分析技能
    analysis = code_analysis(
        code=user_code,
        language="python"
    )

    # 2. 根据分析结果生成建议
    suggestions = generate_suggestions(analysis)

    # 3. 返回结果
    return {
        "analysis": analysis,
        "suggestions": suggestions
    }
```

#### 3.2 沙箱执行
在隔离环境中安全执行代码：

```typescript
// Agent 配置
{
  sandbox: {
    adapter: 'local',
    timeout: 30000,
  }
}
```

#### 3.3 技能编排
自动选择和组合技能：

```typescript
// Agent 自动选择技能
const skills = agent.skillDiscovery.matchSkills(task);
// -> [code_analysis, code_fix, test_generator]
```

### Agent 类型

#### Base Agent
基础 Agent，适用于简单任务：

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "分析这段代码"
  }'
```

#### MasterAgent
支持委派模式的 Agent，适用于复杂任务：

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "审查这个项目的代码",
    "useDelegation": true
  }'
```

MasterAgent 会：
1. 分析任务复杂度
2. 分解为子任务
3. 委派给专门的 Subagent（code-reviewer、security-auditor）
4. 整合结果

### Subagent
专门处理特定领域的 Agent：

```typescript
// subagents/code-reviewer/agent.yaml
name: code-reviewer
description: 代码审查专家
skills: [code_analysis, security_check]
```

---

## 4. Skill（技能）

### 什么是 Skill？

**Skill** 是可复用的技能组件，类似于工具函数。

### 技能类型

#### 内置技能
```bash
skills/
├── code-analysis/      # 代码分析
├── postgres-api-schema/# PostgreSQL 查询
├── remotion-generator/ # 视频生成
└── schemas/            # 数据验证
```

#### 自定义技能
```python
# skills/my-custom-skill/skill.py
from motia import skill, Parameter

@skill.metadata(
  name="my_custom_skill",
  description="我的自定义技能",
  parameters=[
    Parameter(name="input", type="string", required=True),
  ]
)
def my_custom_skill(input: str) -> dict:
  # 技能实现
  return {
    "result": f"处理结果: {input}"
  }
```

### 技能发现

Agent 自动发现可用技能：

```typescript
// 技能自动发现
const skills = [
  {
    name: 'code_analysis',
    description: '分析代码质量',
    parameters: ['code', 'language']
  },
  {
    name: 'postgres_api_schema',
    description: 'PostgreSQL API 查询',
    parameters: ['query', 'database']
  },
  // ... 更多技能
];
```

### 技能执行流程

```
用户任务 → Agent 分析需求
         ↓
    匹配相关技能
         ↓
    生成 PTC 代码
         ↓
    调用技能函数
         ↓
    返回技能结果
```

---

## 🔗 概念之间的关系

### 执行流程示例

```
用户发起 Task: "分析这个 Python 文件"
         ↓
Agent 接收任务，查找 Session 上下文
         ↓
Agent 分析任务，匹配相关 Skill
         ↓
PTC 生成：生成调用 code-analysis 技能的代码
         ↓
Sandbox 执行：在隔离环境中执行代码
         ↓
Skill 执行：code-analysis 技能运行
         ↓
结果返回：Agent 返回分析结果
         ↓
Session 更新：保存对话历史
```

### 数据流向

```
User Request (Task)
      ↓
   Agent Manager
      ↓
   Agent (检查 Session)
      ↓
   PTC Generator (生成代码)
      ↓
   Sandbox (执行代码)
      ↓
   Skill (执行技能)
      ↓
   Result (返回结果)
      ↓
   Session (更新上下文)
```

---

## 💡 最佳实践

### Session 管理
- ✅ 同一用户使用同一个 sessionId
- ✅ Session 过期后重新创建
- ❌ 不要滥用 Session（简单任务不需要）

### Task 设计
- ✅ 任务描述清晰明确
- ✅ 提供必要的上下文（environment）
- ❌ 避免过于复杂的单次任务（考虑分解）

### Agent 选择
- ✅ 简单任务用 Base Agent
- ✅ 复杂任务用 MasterAgent + delegation
- ❌ 不要过度使用 delegation（有开销）

### Skill 开发
- ✅ 技能功能单一、专注
- ✅ 提供清晰的参数定义
- ✅ 添加详细的描述文档

---

## 📖 相关文档

- [系统架构](README.md) - 4 层架构设计
- [Agent 系统](agent-system.md) - Agent 工作原理
- [知识库系统](knowledge-base.md) - RAG 检索
- [上下文管理](context-management.md) - 对话管理

---

**版本**: v1.0 | **更新日期**: 2026-03-29
