# ValidationHook 使用指南

**创建时间**: 2026-04-03
**状态**: ✅ 已实现

## 概述

ValidationHook 是一个用于验证 Agent 输出的 Hook 机制。它可以在 Agent 执行完成后自动验证输出是否符合预定义的规则，确保输出质量和一致性。

## 快速开始

### 1. 基本配置

在 subagent 的 `agent.yaml` 中添加 validation 配置：

```yaml
agent:
  system_prompt: "..."
  available_skills: [...]

  validation:
    strategy: strict  # strict | fallback

    schema:
      output:
        type: string
        minLength: 10
```

### 2. 验证类型

#### 2.1 Schema 验证（结构验证）

验证输出结构和类型：

```yaml
validation:
  strategy: strict
  schema:
    userStories:
      type: array
      items:
        type: object
        required: [id, title, priority]
        properties:
          id:
            type: string
            pattern: "^[A-Z]{2}-\\d+$"
          title:
            type: string
            minLength: 10
          priority:
            type: string
            enum: [P0, P1, P2, P3]
    requirements:
      type: array
      minItems: 1
```

#### 2.2 Completeness 验证（必填字段）

检查必填字段是否存在：

```yaml
validation:
  strategy: strict
  required:
    - userStories
    - personas
    - requirements
    - data.user.name  # 支持嵌套路径（点号分隔）
```

#### 2.3 Format 验证（格式验证）

使用正则表达式验证字段格式：

```yaml
validation:
  strategy: strict
  formats:
    - field: userStories[].id
      pattern: "^[A-Z]{2}-\\d+$"
      message: "用户故事 ID 必须匹配格式: XX-123"

    - field: userStories[].title
      pattern: "^[A-Z].*\\.$"
      message: "标题必须以大写字母开头并以句号结尾"

    - field: output
      pattern: "^[A-Z]{2}-\\d+$"
      message: "输出必须匹配 ID 格式"
```

### 3. 验证策略

#### 3.1 Strict 模式（默认）

验证失败时抛出错误，中断执行：

```yaml
validation:
  strategy: strict
  schema:
    output:
      type: string
      minLength: 100
```

**行为**: 当输出不符合要求时，Agent 返回失败结果并包含错误信息。

#### 3.2 Fallback 模式（降级模式）

验证失败时清理输出并继续执行：

```yaml
validation:
  strategy: fallback
  schema:
    output:
      type: string
      minLength: 100
```

**行为**: 当输出不符合要求时，记录警告日志，清理输出（移除 null/undefined 字段），然后返回结果。

## 完整示例

### 示例 1: 产品经理 Agent

```yaml
# subagents/product-manager/agent.yaml

name: product manager
description: 产品需求分析 Agent

agent:
  system_prompt: |
    你是一个产品经理专家，负责分析用户需求并生成产品需求文档。

    你的职责：
    - 分析用户需求
    - 编写用户故事
    - 定义验收标准

  available_skills:
    - tool-read
    - code-analysis

  validation:
    strategy: strict

    schema:
      userStories:
        type: array
        minItems: 1
        items:
          type: object
          required: [id, title, priority, acceptanceCriteria]
          properties:
            id:
              type: string
              pattern: "^[US]{2}-\\d+$"
            title:
              type: string
              minLength: 20
            priority:
              type: string
              enum: [P0, P1, P2, P3]
            acceptanceCriteria:
              type: array
              minItems: 1

      requirements:
        type: array
        minItems: 1

      metadata:
        type: object
        required: [version, author]
        properties:
          version:
            type: string
            pattern: "^\\d+\\.\\d+\\.\\d+$"
          author:
            type: string
            minLength: 2

    required:
      - userStories
      - requirements

    formats:
      - field: userStories[].id
        pattern: "^[US]{2}-\\d+$"
        message: "用户故事 ID 必须匹配格式: US-123"

      - field: metadata.version
        pattern: "^\\d+\\.\\d+\\.\\d+$"
        message: "版本号必须匹配格式: 1.0.0"
```

### 示例 2: 数据分析 Agent（Fallback 模式）

```yaml
# subagents/data-analyst/agent.yaml

name: data analyst
description: 数据分析 Agent

agent:
  system_prompt: |
    你是一个数据分析专家，负责分析数据并提供洞察。

  available_skills:
    - tool-read
    - code-analysis

  validation:
    strategy: fallback  # 使用降级模式

    schema:
      summary:
        type: string
        minLength: 50

      insights:
        type: array
        minItems: 1

    formats:
      - field: summary
        pattern: "^(总而言之|综上所述|根据分析)"
        message: "摘要应以总结性词汇开头"
```

## API 参考

### ValidationConfig

```typescript
interface ValidationConfig {
  strategy?: 'strict' | 'fallback';  // 默认: 'strict'
  schema?: Record<string, any>;       // Schema 验证规则
  required?: string[];                // 必填字段列表（支持点号分隔的嵌套路径）
  formats?: FormatRule[];             // 格式验证规则
}
```

### FormatRule

```typescript
interface FormatRule {
  field: string;              // 字段路径（支持点号分隔和数组索引）
  pattern: string | RegExp;   // 正则表达式
  message?: string;           // 自定义错误消息
}
```

### Schema 支持的类型

#### String

```yaml
fieldName:
  type: string
  minLength?: number
  maxLength?: number
  pattern?: string
```

#### Number

```yaml
fieldName:
  type: number
  min?: number
  max?: number
```

#### Array

```yaml
fieldName:
  type: array
  items?: SchemaDefinition
  minItems?: number
  maxItems?: number
```

#### Object

```yaml
fieldName:
  type: object
  properties?: Record<string, SchemaDefinition>
  required?: string[]
```

## 错误处理

### Strict 模式错误

当验证失败时，Agent 返回：

```typescript
{
  success: false,
  error: "Output validation failed for task {taskId}",
  steps: [
    {
      type: "error",
      content: "Output validation failed for task {taskId}",
      metadata: {
        stack: "ValidationError: ..."
      }
    }
  ]
}
```

### Fallback 模式警告

当验证失败时，控制台输出：

```
[ValidationHook] Output validation failed for task {taskId}, sanitizing output
{ errors: [...], warnings: [...] }
```

## 最佳实践

### 1. 分层验证

```yaml
validation:
  # 第一层：基本结构验证
  schema:
    output:
      type: object
      required: [data, metadata]

  # 第二层：必填字段验证
  required:
    - data.summary
    - data.insights
    - metadata.timestamp

  # 第三层：格式验证
  formats:
    - field: metadata.timestamp
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"
```

### 2. 渐进式采用

**阶段 1**: 仅使用 required 验证
```yaml
validation:
  required: [userStories, requirements]
```

**阶段 2**: 添加 schema 验证
```yaml
validation:
  strategy: strict
  required: [userStories, requirements]
  schema:
    userStories:
      type: array
      minItems: 1
```

**阶段 3**: 添加 format 验证
```yaml
validation:
  strategy: strict
  required: [userStories, requirements]
  schema:
    userStories:
      type: array
      minItems: 1
  formats:
    - field: userStories[].id
      pattern: "^[US]{2}-\\d+$"
```

### 3. 测试策略

使用 fallback 模式进行开发：
```yaml
validation:
  strategy: fallback  # 开发时使用 fallback
  # ... validation rules
```

生产环境切换到 strict 模式：
```yaml
validation:
  strategy: strict  # 生产时使用 strict
  # ... validation rules
```

## 故障排查

### 问题 1: 验证不生效

**原因**: validation 配置位置错误

**解决**: 确保 validation 在 `agent` 下，而不是根级别：
```yaml
# ✅ 正确
agent:
  validation:
    strategy: strict

# ❌ 错误
validation:
  strategy: strict
```

### 问题 2: Schema 验证总是失败

**原因**: Schema 定义与实际输出结构不匹配

**解决**: 使用 Agent 的实际输出测试 Schema：
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "测试任务", "subagent": "your-agent"}'
```

### 问题 3: 嵌套字段验证失败

**原因**: 字段路径格式错误

**解决**: 使用点号分隔嵌套字段：
```yaml
required:
  - data.user.name      # ✅ 正确
  - data/user/name      # ❌ 错误
```

## 相关文档

- [设计文档](./01-design.md)
- [实施清单](./02-implementation.md)
- [API 文档](../../reference/api.md)
