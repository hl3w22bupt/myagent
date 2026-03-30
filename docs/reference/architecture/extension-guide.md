# 扩展方式选择指南

> Hook、Skill、Subagent、Workflow：如何选择？

**阅读时间**: 6 分钟 | **难度**: ⭐⭐ intermediate

---

## 🎯 扩展方式对比

MyAgent 提供 **4 种主要扩展方式**，每种适用不同场景：

| 扩展方式 | 用途 | 难度 | 生命周期 | 示例 |
|---------|------|------|----------|------|
| **Hook** | 生命周期插入 | ⭐⭐ | 每次执行触发 | 日志、监控 |
| **Skill** | 单一功能组件 | ⭐⭐ | 按需调用 | 代码分析 |
| **Subagent** | 专门 AI 行为 | ⭐⭐⭐ | 持久化 | 代码审查专家 |
| **Workflow** | 复杂流程编排 | ⭐⭐⭐ | 持久化 | CI/CD 流水线 |

---

## 📊 决策树

```
你的需求是什么？
│
├─ 记录日志、监控性能？
│  └─→ 使用 Hook
│
├─ 添加单一功能？
│  ├─ 简单操作（查询、计算）？
│  │  └─→ 使用 Skill
│  │
│  └─ 需要 AI 智能判断？
│     └─→ 使用 Subagent
│
├─ 多步骤复杂流程？
│  └─→ 使用 Workflow
│
└─ 需要主动行动？
   └─→ 使用 SoulAgent（Autonomous Agent）
```

---

## 1. Hook

### 何时使用？

✅ **适合场景**:
- 📊 记录执行日志
- 🔍 性能监控
- 💬 实时进度通知
- ✅ 参数验证
- 🔐 安全审计

❌ **不适合场景**:
- ❌ 业务逻辑实现
- ❌ 复杂的数据处理
- ❌ AI 智能判断

### 示例

```typescript
// 记录 Agent 执行日志
export class LoggingHook {
  async onTaskStart(task, taskId) {
    logger.info(`Task ${taskId} started: ${task}`);
  }
}
```

**文档**: [Hooks 详解](./hooks-guide.md)

---

## 2. Skill

### 何时使用？

✅ **适合场景**:
- 🔧 单一、明确的功能
- ⚡ 可复用的工具函数
- 📦 数据处理、转换
- 🔌 外部 API 调用

❌ **不适合场景**:
- ❌ 需要多步骤协作
- ❌ 需要 AI 规划和决策
- ❌ 复杂的业务逻辑

### 示例

```python
# 单一功能：代码分析
@skill.metadata(
  name="code_analysis",
  description="分析代码质量",
  parameters=[
    Parameter(name="code", type="string")
  ]
)
def code_analysis(code: str) -> dict:
  # 分析逻辑
  return {"issues": [...]}
```

**对比**:
- **Hook**: 每次执行都触发（如记录所有调用）
- **Skill**: 按需调用（如需要分析时才调用）

**文档**: [自定义 Skill](../api/plugin-api/custom-skill.md)

---

## 3. Subagent

### 何时使用？

✅ **适合场景**:
- 🤖 需要专门的 AI 行为
- 🎯 特定领域专业知识
- 🧠 需要智能规划和决策
- 👥 团队协作场景

❌ **不适合场景**:
- ❌ 简单的单一功能
- ❌ 不需要 AI 判断的操作

### 示例

```yaml
# subagents/code-reviewer/agent.yaml
name: code-reviewer
description: 代码审查专家

systemPrompt: |
  你是一个资深的代码审查专家，擅长发现代码问题。

skills:
  - code_analysis
  - security_check
  - test_coverage

config:
  temperature: 0.3  # 更精确
```

**对比**:
- **Skill**: 工具函数（如 code_analysis 函数）
- **Subagent**: 使用工具的专家（如 code-reviewer 专家）

**文档**: [自定义 Subagent](../api/plugin-api/custom-subagent.md)

---

## 4. Workflow

### 何时使用？

✅ **适合场景**:
- 🔀 多步骤的固定流程
- 🔄 需要条件分支
- 📋 需要并行执行
- 🎬 CI/CD 流水线

❌ **不适合场景**:
- ❌ 单一步骤的任务
- ❌ 需要动态规划的场景

### 示例

```yaml
# workflows/code-review-pipeline.yaml
name: Code Review Pipeline

steps:
  - name: analyze
    agent: code-reviewer
  - name: security-check
    agent: security-auditor
  - name: test
    agent: test-runner
```

**对比**:
- **Subagent**: 单个专门 Agent
- **Workflow**: 多个 Agent 协作流程

**文档**: [自定义 Workflow](../api/plugin-api/custom-workflow.md)

---

## 🎯 组合使用

### 实战案例：代码审查系统

```
Workflow（流程编排）
  ├─ Subagent: code-reviewer（代码审查）
  │   └─ Skill: code_analysis（代码分析）
  │   └─ Skill: security_check（安全检查）
  │
  ├─ Subagent: security-auditor（安全审计）
  │   └─ Skill: vulnerability_scan（漏洞扫描）
  │
  └─ Hook: LoggingHook（记录审查日志）
```

**职责分工**:
- **Workflow**: 定义审查流程（分析 → 审计 → 报告）
- **Subagent**: 专门的审查专家
- **Skill**: 具体的检查工具
- **Hook**: 记录审查日志

---

## 💡 选择建议

### 简单优先

从简单开始，渐进增强：

```
1. 先用 Skill 实现功能
2. 如果需要 AI 判断 → 升级为 Subagent
3. 如果需要多步协作 → 编排为 Workflow
4. 如果需要记录/监控 → 添加 Hook
```

### 性能考虑

- **Hook**: 轻量、快速（每次执行都触发）
- **Skill**: 按需调用（性能开销小）
- **Subagent**: 有初始化开销（适合复杂任务）
- **Workflow**: 协调开销（适合多步骤流程）

### 可维护性

- **Skill**: 最易维护（单一职责）
- **Subagent**: 中等（需要维护 prompt）
- **Workflow**: 较复杂（需要维护流程定义）
- **Hook**: 简单（但影响面广）

---

## 📖 相关文档

- [Hooks 详解](./hooks-guide.md) - Hook 完整指南
- [Agent 系统](./agent-system.md) - Agent 和 Subagent
- [Autonomous Agent](./autonomous-agent.md) - SoulAgent 详解

---

**版本**: v1.0 | **更新日期**: 2026-03-29
