# Prompt 最佳实践指南

## 概述

本文档定义了项目中构建 LLM prompts 的最佳实践和统一标准。

## 核心原则

### 1. 消息角色分离

**最重要的规则**：始终将系统指令与用户内容分离。

```typescript
// ✅ 正确：使用 role: 'system' 传递系统指令
const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'User task or context...' }
];

// ❌ 错误：将系统指令和用户内容混合在 role: 'user' 中
const messages = [
  { role: 'user', content: 'You are a helpful assistant.\n\nUser task...' }
];
```

### 2. System 消息的内容

System 消息应包含：
- 角色定义
- 任务描述
- 输出格式要求
- 约束和规则

System 消息**不应**包含：
- 用户特定上下文
- 任务特定数据
- 对话历史

### 3. User 消息的内容

User 消息应包含：
- 实际任务/请求
- 上下文（对话历史、变量等）
- 示例（few-shot）
- 需要处理的数据

## Prompt 结构

### 标准模板

```typescript
// System 消息 - 简洁的指令
const systemPrompt = `You are a task analyzer.`;

// User 消息 - 包含上下文和任务
const userPrompt = `
<context>
${contextSection}
</context>

<task>
${task}
</task>

${examples}
`;
```

### 上下文放置顺序

上下文信息应按照以下顺序排列：

1. **original_task**（如果存在）- 用户原始请求
2. **conversation_history** - 对话历史（限制数量）
3. **context_summary** - 当前会话摘要
4. **available_variables** - 可用变量
5. **previous_error**（如果是重试）- 之前的错误

## Token 效率优化

### 1. 避免冗余

```typescript
// ❌ 冗余：重复信息
const prompt = `
You are a helpful assistant.
Please help the user with their task.
The user wants to: ${task}
Please help the user with: ${task}
`;

// ✅ 简洁：去除重复
const systemPrompt = `You are a helpful assistant.`;
const userPrompt = `<task>${task}</task>`;
```

### 2. 使用结构化标签

使用 XML 标签提高可读性和 LLM 理解：

```
<context>
${context}
</context>

<task>
${task}
</task>

<skills>
${skills}
</skills>
```

### 3. 限制历史消息数量

```typescript
// ❌ 不好：发送全部历史
const messages = conversationHistory.map(msg => ({
  role: msg.role,
  content: msg.content
}));

// ✅ 好：限制最近 N 条消息
const MAX_HISTORY = 10;
const recentHistory = conversationHistory.slice(-MAX_HISTORY);
```

## Prompt 工程

### Few-shot 示例

在 User 消息中提供示例：

```typescript
const userPrompt = `
${task}

Examples:
- Input: "简短描述" → Output: "扩展后的完整描述"
- Input: "模糊指令" → Output: "具体可执行的指令"

Process the input according to these examples.`;
```

### Chain-of-Thought

引导 LLM 进行推理：

```typescript
const systemPrompt = `
Analyze the task step-by-step:
1. First, identify the core requirement
2. Then, break it down into sub-tasks
3. Finally, generate the solution

Output your reasoning before the final answer.`;
```

### 输出格式约束

明确期望的输出格式：

```typescript
const userPrompt = `
${task}

CRITICAL: Output MUST be valid JSON with the following format:
{
  "result": "outcome",
  "confidence": 0.0-1.0
}

Do NOT include any text outside the JSON structure.`;
```

## 实现指南

### 使用 PromptBuilder

项目中提供了统一的 `PromptBuilder` 工具类（位于 `src/core/prompt/`）。

```typescript
import { PromptBuilder } from './prompt';

// 示例 1: 简单的 system + user
const { messages } = PromptBuilder.fromSystemAndUser(
  'You are a data analyzer.',
  'Please analyze: ' + data
);

// 示例 2: 使用预定义模板
import { PromptBuilder } from './prompt';
const { messages } = PromptBuilder.forRequestRewrite(
  currentRequest,
  conversationHistory,
  contextSummary
);

// 示例 3: 自定义构建
const builder = PromptBuilder.create()
  .addSystem('You are a specialist in X.')
  .addUser(`<context>${context}</context><task>${task}</task>`)
  .addHistory(conversationHistory, 10);
const { messages } = builder.build();
```

### LLM 调用模式

使用 `messagesCreate` 方法时：

```typescript
// ✅ 正确：传递消息数组
const response = await llm.messagesCreate(messages, options, purpose);

// ❌ 错误：传递单个混合消息
const response = await llm.messagesCreate([
  { role: 'user', content: system + user }
], options, purpose);
```

## 特定场景指南

### Request Rewriting

```typescript
// System: 重写指令
// User: 历史记录 + 当前请求

const { messages } = PromptBuilder.forRequestRewrite(
  currentRequest,
  conversationHistory,
  contextSummary
);
```

### Skill Selection

```typescript
// System: 选择指令
// User: 可用技能 + 任务 + 上下文

const { messages } = PromptBuilder.forSkillSelection(
  task,
  availableSkills,
  { conversationHistory, contextSummary, variables, originalTask }
);
```

### Code Generation

```typescript
// System: 代码生成指令
// User: 任务 + 技能详情 + 上下文

const { messages } = PromptBuilder.forPTCCodeGeneration(
  task,
  selectedSkills,
  { conversationHistory, variables, originalTask, previousError }
);
```

## 常见问题

### 问题：LLM 返回格式不一致

**解决方案**：使用明确的输出格式约束和示例

```typescript
const systemPrompt = `
Output format:
<result>
{
  "field1": "value1",
  "field2": ["value2a", "value2b"]
}
</result>

CRITICAL: Output MUST follow this exact format.
- All strings in double quotes
- Arrays with square brackets
- No text outside the <result> tags
`;
```

### 问题：Token 使用过多

**解决方案**：摘要和限制

```typescript
// 1. 摘要长历史
const MAX_HISTORY = 5;
const recentHistory = conversationHistory.slice(-MAX_HISTORY);

// 2. 检查 token 估计
const builder = PromptBuilder.create()
  .addHistory(recentHistory)
  .addUser(task);

if (builder.exceedsLimit(32000)) {
  // 减少历史或简化上下文
}
```

### 问题：上下文混淆

**解决方案**：清晰的结构化标签

```typescript
// ✅ 好：清晰分离
const userPrompt = `
<original_task>${originalTask}</original_task>

<conversation_history>
${history}
</conversation_history>

<current_request>${currentRequest}</current_request>
`;
```

## 测试 Checklist

在修改或创建 prompt 时，检查：

- [ ] System 指令在 `role: 'system'` 消息中
- [ ] User 内容在 `role: 'user'` 消息中
- [ ] 没有冗余或重复文本
- [ ] 上下文按正确顺序排列
- [ ] 输出格式约束清晰
- [ ] 使用结构化标签（XML）提高可读性
- [ ] 限制历史消息数量
- [ ] Token 估算在合理范围内

## 参考资源

- [Anthropic Message API 文档](https://docs.anthropic.com/en/api/messages)
- [Prompt Engineering Guide](https://docs.anthropic.com/en/docs/prompt-engineering)
- 项目内部：`src/core/prompt/` 模块
