# 插件开发指南

> 扩展 MyAgent：自定义 Agent、Skill、Subagent

**阅读时间**: 8 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🔌 插件类型

MyAgent 支持多种扩展方式：

| 插件类型 | 说明 | 难度 |
|---------|------|------|
| **Custom Skill** | 自定义技能 | ⭐⭐ |
| **Custom Agent** | 自定义 Agent | ⭐⭐⭐ |
| **Custom Subagent** | 自定义 Subagent | ⭐⭐⭐ |
| **Hook** | 生命周期扩展 | ⭐⭐⭐ |

---

## 1. 自定义 Skill

### 创建 Skill

```python
# skills/my-skill/skill.py
from motia import skill, Parameter

@skill.metadata(
  name="my_skill",
  description="我的自定义技能",
  parameters=[
    Parameter(name="input", type="string", required=True)
  ]
)
def my_skill(input: str) -> dict:
  # 技能实现
  result = process(input)
  return {"result": result}
```

### 使用 Skill

```bash
# Skill 会自动被发现，无需额外配置
curl -X POST http://localhost:3000/agent/execute \
  -d '{"task": "使用 my_skill 处理 XXX"}'
```

---

## 2. 自定义 Agent

### 创建 Agent

```typescript
// src/core/agent/my-agent.ts
import { Agent } from './agent';

export class MyAgent extends Agent {
  constructor(config: AgentConfig) {
    super(config);
    // 自定义初始化
  }

  // 重写执行逻辑
  async execute(task: string): Promise<AgentResult> {
    // 自定义实现
    return result;
  }
}
```

### 注册 Agent

```typescript
// config/agents.config.ts
export const agents = [
  {
    name: 'my-agent',
    class: MyAgent,
    config: { /* ... */ }
  }
];
```

---

## 3. 自定义 Subagent

### 创建 Subagent

```yaml
# subagents/my-subagent/agent.yaml
name: my-subagent
description: 我的自定义 Subagent
version: 1.0.0

systemPrompt: |
  你是一个专门处理 XXX 的专家

skills:
  - skill1
  - skill2

config:
  temperature: 0.7
  maxTokens: 2000
```

### 使用 Subagent

```bash
curl -X POST http://localhost:3000/agent/execute \
  -d '{
    "task": "复杂任务",
    "delegateTo": ["my-subagent"]
  }'
```

---

## 4. Hook 开发

### 创建 Hook

```typescript
// hooks/my-hook.ts
export const myHook: AgentHook = {
  async beforeExecute(task) {
    console.log(`开始执行: ${task}`);
  },
  async afterExecute(result) {
    console.log(`执行完成:`, result);
  },
};
```

### 注册 Hook

```typescript
// config/hooks.config.ts
export const hooks = [
  { type: 'agent', hook: myHook }
];
```

---

## 📖 相关文档

- [Agent 系统](../../architecture/agent-system.md) - Agent 原理
- [Hook 系统](../../architecture/hook-system.md) - Hook 详解

---

**版本**: v1.0 | **更新日期**: 2026-03-29
