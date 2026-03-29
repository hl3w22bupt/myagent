# Hooks 详解

> 所有可用的 Hook 类型、使用场景和最佳实践

**阅读时间**: 8 分钟 | **难度**: ⭐⭐ intermediate

---

## 🎯 Hook 系统概览

MyAgent 提供 **3 种类型的 Hook**，在不同生命周期插入自定义逻辑：

| Hook 类型 | 触发时机 | 使用场景 | 难度 |
|-----------|----------|----------|------|
| **Agent Hook** | Agent 生命周期 | 日志、监控、验证 | ⭐⭐ |
| **Task Hook** | Task 生命周期 | 审批、通知、持久化 | ⭐⭐⭐ |
| **Skill Hook** | Skill 生命周期 | 追踪、进度通知、上下文 | ⭐⭐ |

---

## 🔌 可用的 Hooks

### 1. Agent Hooks

#### AgentTraceHook

**功能**: 追踪 Agent 执行过程

**实现**: `src/core/agent/hooks/trace-hook.ts`

**使用场景**:
- 📊 记录 Agent 执行日志
- 🔍 调试 Agent 行为
- 📈 性能监控

**配置方式**:
```yaml
# hooks/agent/call-chain-tracer.yaml
type: middleware
trigger: preExec
description: "追踪 agent 调用链"
config:
  set:
    metadata.callChain: "{{ callChain }} > {{ agentType }}"
```

---

### 2. Skill Hooks

#### ProgressNotificationHook

**功能**: 发送技能执行进度通知

**实现**: `src/core/skill/hooks/system/progress_notification_hook.py`

**使用场景**:
- 📡 实时进度更新
- 💬 前端展示执行状态
- 🔔 任务完成通知

**触发时机**:
- `pre_exec`: 技能执行前
- `post_exec`: 技能执行后

#### TraceHook

**功能**: 追踪技能执行细节

**实现**: `src/core/skill/hooks/trace_hook.py`

**使用场景**:
- 📊 详细执行日志
- 🔍 问题诊断
- 📈 性能分析

#### ContextHook

**功能**: 管理技能执行上下文

**实现**: `src/core/skill/hooks/context_hook.py`

**使用场景**:
- 📦 上下文传递
- 🔄 状态管理
- 💾 数据持久化

---

### 3. Task Hooks

#### ExternalApprovalHook

**功能**: 外部审批流程（已禁用）

**配置**: `hooks/task/external-approval.yaml.disabled`

**使用场景**:
- ✅ 敏感操作审批
- ✅ 人工确认
- ✅ 多人协作

---

## 🎯 Hook vs 其他扩展方式

### 何时使用 Hook？

✅ **使用 Hook 的场景**:
- **日志记录**: 记录所有 Agent/Skill 执行
- **性能监控**: 追踪执行时间、资源使用
- **进度通知**: 实时向前端推送进度
- **数据验证**: 执行前验证参数
- **安全审计**: 记录敏感操作

❌ **不使用 Hook 的场景**:
- **业务逻辑**: 用 Skill 或 Subagent
- **复杂工作流**: 用 Workflow
- **自定义 AI 行为**: 用 Subagent

### 扩展方式选择指南

```
┌─────────────────────────────────────────────────────────┐
│  需求场景 → 扩展方式                                      │
├─────────────────────────────────────────────────────────┤
│  记录日志、监控性能 → Hook                                │
│  简单的单一功能 → Skill                                 │
│  专门的 AI 行为 → Subagent                              │
│  多步骤复杂流程 → Workflow                               │
│  敏感操作审批 → Task Hook (external-approval)            │
└─────────────────────────────────────────────────────────┘
```

---

## 💡 Hook 使用示例

### 示例 1: 记录 Agent 执行日志

```typescript
// hooks/agent/logging-hook.ts
export class LoggingHook extends BaseAgentHook {
  async onTaskStart(task, taskId, context) {
    console.log(`[Agent] 开始执行: ${task}`);
  }

  async onTaskComplete(result, context) {
    console.log(`[Agent] 执行完成:`, result);
  }

  async onTaskFailure(error, context) {
    console.error(`[Agent] 执行失败:`, error);
  }
}
```

### 示例 2: 发送技能完成通知

```yaml
# hooks/skill/skill-notify.yaml
type: notification
trigger: postExec
description: "技能执行完成时发送通知"
enabled: false  # 需要配置 LARK_SKILL_WEBHOOK
config:
  channel: lark
  webhook: "{{ env.LARK_SKILL_WEBHOOK }}"
  message_template: |
    技能执行完成：{{ skillName }}
    耗时：{{ executionTime }}ms
```

### 示例 3: 验证任务参数

```typescript
// hooks/agent/validation-hook.ts
export class ValidationHook extends BaseAgentHook {
  async onTaskStart(task, taskId, context) {
    if (!isSafe(task)) {
      throw new Error('任务包含不安全内容');
    }
  }
}
```

---

## 🔧 Hook 开发指南

### 创建 Agent Hook

```typescript
// hooks/my-agent-hook.ts
import { BaseAgentHook } from '@/core/agent/hooks/base';

export class MyAgentHook extends BaseAgentHook {
  // Agent 创建时
  async onAgentCreate(config, sessionId) {
    console.log('Agent created:', sessionId);
  }

  // 任务开始前
  async onTaskStart(task, taskId, context) {
    console.log('Task started:', task);
  }

  // 任务完成时
  async onTaskComplete(result, context) {
    console.log('Task completed:', result);
  }

  // 任务失败时
  async onTaskFailure(error, context) {
    console.error('Task failed:', error);
  }
}
```

### 创建 Skill Hook

```python
# hooks/my-skill-hook.py
from motia import BaseHook, SkillContext

class MySkillHook(BaseHook):
    async def pre_exec(self, context: SkillContext):
        """技能执行前"""
        print(f"Skill {context.skill_name} starting...")

    async def post_exec(self, context: SkillContext, result):
        """技能执行后"""
        print(f"Skill {context.skill_name} completed")
```

---

## 📚 Hook 最佳实践

### 1. 保持简单
- Hook 应该轻量、快速
- 避免在 Hook 中执行耗时操作
- 使用异步处理

### 2. 错误处理
- Hook 失败不应影响主流程
- 记录错误但继续执行

```typescript
async onTaskStart(task, taskId, context) {
  try {
    // Hook 逻辑
  } catch (error) {
    console.error('Hook error:', error);
    // 不抛出异常，避免影响主流程
  }
}
```

### 3. 性能考虑
- 避免阻塞主流程
- 使用异步操作
- 批量处理通知

---

## 📖 相关文档

- [Hook 系统](../architecture/hook-system.md) - Hook 原理
- [插件开发](../api/plugin-api/hook-development.md) - 开发教程
- [Subagent](subagents.md) - Subagent 扩展
- [Workflow](workflows.md) - Workflow 扩展

---

**版本**: v1.0 | **更新日期**: 2026-03-29
