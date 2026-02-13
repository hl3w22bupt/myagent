# Prompt 工程最佳实践

## 概述

本文档定义了项目中使用 LLM（大语言模型）时的 Prompt 工程最佳实践。遵循这些实践可以提高 Prompt 质量、减少 Token 消耗、并提升系统稳定性。

**适用范围**:
- 所有使用 LLM 的代码（如 `request-rewriter.ts`、`ptc-generator.ts` 等）
- 所有新的 LLM 集成开发

## 1. System Prompt 规范化

### 1.1 使用独立的 `role: 'system'` 传递系统指令

**正确做法**:
```typescript
const response = await this.llm.messagesCreate(
  [
    {
      role: 'system',
      content: 'You are a conversation context analyzer. Your task is to...'
    },
    {
      role: 'user',
      content: 'User data here'
    }
  ],
  {},
  'request rewriting'
);
```

**错误做法** - 将 System Prompt 放在 User Message 中：
```typescript
// ❌ 错误：将系统指令和用户数据混在一起
const response = await this.llm.messagesCreate([{
  role: 'user',
  content: `You are an analyzer...

<data>
...
</data>

<task>
...
</task>`
}], {}, 'task name');
```

### 1.2 System Prompt 应包含的内容

- **角色定义**（Role Definition）：LLM 扮担什么角色
- **任务描述**（Task Description）：需要完成什么任务
- **约束条件**（Constraints）：输出格式、长度限制等
- **输出格式要求**（Output Format Requirements）：JSON、代码块等

### 1.3 User Message 应包含的内容

- **上下文数据**（Context Data）：历史记录、摘要等
- **当前任务/输入**（Current Task/Input）：用户的具体请求或待处理数据

## 2. Prompt 模板标准结构

```
[System]
Role definition and task description
Constraints and output requirements
Output format specification

[User]
<context>
  Context information (history, summary, artifacts)
</context>

<task>
  Current task or input
</task>

Additional instructions or examples
```

### 2.1 XML Tags 使用规范

使用 XML tags 包裹结构化数据：

```xml
<context>
  <conversation_history>
    ...
  </conversation_history>

  <context_summary>
    ...
  </context_summary>
</context>

<task>
  用户的具体请求
</task>
```

**优势**：
- 清晰分隔不同类型的数据
- 便于 LLM 理解数据结构
- 支持 Few-Shot 示例的清晰展示

## 3. Token 效率优化

### 3.1 使用 XML Tags 减少 Token

- **正确**：使用 `<context>...</context>` 而非 JSON keys
  - 避免重复键名和引号消耗 Token

```typescript
// ✅ 使用 XML tags
const prompt = `<context>${context}</context><task>${task}</task>`;

// ❌ 使用 JSON 对象（消耗更多 Token）
const prompt = `{"context": ${JSON.stringify(context)}, "task": "${task}"}`;
```

### 3.2 避免冗余信息

- 移除不必要的说明文字
- 使用简洁的指令
- 避免重复相同信息多次出现

### 3.3 Few-Shot 示例优化

- **只在必要时使用**：Few-Shot 示例消耗大量 Token
- **使用描述性示例**：用文字描述期望输出，而非完整示例
- **限制示例数量**：1-2 个示例足够

## 4. 多语言（中英文）混合处理

### 4.1 语言选择原则

| 内容类型 | 推荐语言 | 原因 |
|-----------|-----------|------|
| System 指令 | 英文 | LLM 对英文指令理解更准确 |
| 用户任务 | 原始语言 | 保持用户原始语言以理解意图 |
| 示例 | 与用户任务语言一致 | 帮助 LLM 生成期望语言的输出 |

### 4.2 代码示例

```typescript
// ✅ 正确做法
const response = await this.llm.messagesCreate([
  {
    role: 'system',
    content: 'You are a code generator...'  // 英文
  },
  {
    role: 'user',
    content: `<task>${userTask}</task>`  // 保持用户原始语言（可能是中文）
  }
]);

// ❌ 错误做法
const response = await this.llm.messagesCreate([
  { role: 'user', content: `You are a code generator... \n\n <task>${userTask}</task>` }  // 不必要地翻译用户输入
]);
```

## 5. 代码示例

### 5.1 Request Rewriter（已完成）

```typescript
// src/core/agent/request-rewriter.ts
const response = await this.llm.messagesCreate(
  [
    {
      role: 'system',
      content: 'You are a conversation context analyzer...'
    },
    {
      role: 'user',
      content: prompt  // 包含 context 数据
    }
  ],
  {},
  'request rewriting'
);
```

### 5.2 PTC Generator - planSkills（已完成）

```typescript
// src/core/agent/ptc-generator.ts - planSkills 方法
const response = await this.llm.messagesCreate(
  [
    {
      role: 'system',
      content: 'You are an agent that plans task execution...'
    },
    {
      role: 'user',
      content: `${contextSection}<available_skills>...</available_skills><task>...</task>${skillRequirement}`
    }
  ],
  {},
  'skill selection'
);
```

### 5.3 PTC Generator - generateCode（本任务完成）

```typescript
// src/core/agent/ptc-generator.ts - generateCode 方法（修复前）
const response = await this.llm.messagesCreate([{ role: 'user', content: prompt }], {}, 'ptc codegen');

// 修复后 - 将 Prompt 拆分为 system 和 user 两部分
const systemPrompt = `You are a Python code generator for a skill-based AI agent system.
**Your Role**:
Generate executable Python code...
`;

const userPrompt = `<context>...</context><task>...</task>...`;

const response = await this.llm.messagesCreate(
  [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  {},
  'ptc codegen'
);
```

## 6. 检查清单

在提交代码前，请确认：

- [ ] System Prompt 使用了独立的 `role: 'system'`
- [ ] User Message 只包含上下文数据和任务
- [ ] XML Tags 用于结构化数据
- [ ] 避免在 User Message 中包含系统指令
- [ ] 多语言处理正确（System 英文，User 保持原语言）

## 7. 相关文档

- `docs/design/code-generator-prompt-fix-report.md` - Code Generator v2.0 Prompt 修复报告
- `docs/design/prompt-analysis-v1.md` - Content Analyzer Prompt 分析
- `.cursor/rules/motia/` - Motia 框架相关规则

---

**文档版本**: v1.0
**创建时间**: 2025-01-12
**作者**: Claude (Anthropic)
**状态**: ✅ 已完成
