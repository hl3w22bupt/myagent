# ValidationHook 实际应用示例

**创建时间**: 2026-04-03
**目的**: 展示如何在现有 Subagent 中应用 ValidationHook

## 示例 1: Code Reviewer Agent

### 场景描述

Code Reviewer Agent 需要返回结构化的代码审查报告，包含问题列表、建议和总体评分。

### 配置

```yaml
# subagents/code-reviewer/agent.yaml

name: code reviewer
description: 代码审查专家

agent:
  system_prompt: |
    你是一个代码审查专家，负责分析代码质量并提供改进建议。

    你的职责：
    - 分析代码质量和安全性
    - 识别代码异味和反模式
    - 提供具体的改进建议

  available_skills:
    - tool-read
    - code-analysis

  # ⭐ 新增：ValidationHook 配置
  validation:
    strategy: strict

    # Schema 验证：确保输出结构正确
    schema:
      reviewSummary:
        type: string
        minLength: 50

      issues:
        type: array
        items:
          type: object
          required: [severity, line, description]
          properties:
            severity:
              type: string
              enum: [critical, high, medium, low]
            line:
              type: number
              min: 1
            description:
              type: string
              minLength: 10
            suggestion:
              type: string
              minLength: 10

      overallScore:
        type: number
        min: 0
        max: 100

      recommendations:
        type: array
        minItems: 1
        items:
          type: string
          minLength: 20

    # Completeness 验证：确保必填字段存在
    required:
      - reviewSummary
      - issues
      - overallScore
      - recommendations

    # Format 验证：确保格式符合要求
    formats:
      - field: reviewSummary
        pattern: "^(代码审查|Code Review|总体评价)"
        message: "审查摘要应以明确的标题开头"

      - field: issues[].severity
        pattern: "^(critical|high|medium|low)$"
        message: "严重程度必须是: critical, high, medium, low 之一"
```

### 预期输出

```json
{
  "reviewSummary": "代码审查：发现 3 个需要改进的问题",
  "issues": [
    {
      "severity": "high",
      "line": 42,
      "description": "缺少输入验证可能导致安全漏洞",
      "suggestion": "添加输入参数验证"
    },
    {
      "severity": "medium",
      "line": 87,
      "description": "函数名不够清晰",
      "suggestion": "重命名为 validateUserInput"
    }
  ],
  "overallScore": 75,
  "recommendations": [
    "建议添加单元测试覆盖边界情况",
    "建议使用 TypeScript 替代 JavaScript"
  ]
}
```

## 示例 2: Product Manager Agent

### 场景描述

Product Manager Agent 需要生成产品需求文档，包含用户故事、验收标准和优先级。

### 配置

```yaml
# subagents/product-manager/agent.yaml

name: product manager
description: 产品需求分析 Agent

agent:
  system_prompt: |
    你是一个产品经理专家，负责分析用户需求并生成产品需求文档。

  available_skills:
    - tool-read
    - code-analysis

  # ⭐ 新增：ValidationHook 配置
  validation:
    strategy: strict

    schema:
      productName:
        type: string
        minLength: 5
        maxLength: 100

      userStories:
        type: array
        minItems: 1
        items:
          type: object
          required: [id, title, description, acceptanceCriteria, priority]
          properties:
            id:
              type: string
              pattern: "^[US]{2}-\\d+$"
            title:
              type: string
              minLength: 20
            description:
              type: string
              minLength: 50
            acceptanceCriteria:
              type: array
              minItems: 2
              items:
                type: string
                minLength: 10
            priority:
              type: string
              enum: [P0, P1, P2, P3]
            storyPoints:
              type: number
              min: 1
              max: 13

      personas:
        type: array
        items:
          type: object
          required: [name, role, goals]
          properties:
            name:
              type: string
              minLength: 2
            role:
              type: string
              minLength: 5
            goals:
              type: array
              minItems: 1

    required:
      - productName
      - userStories
      - personas

    formats:
      - field: userStories[].id
        pattern: "^[US]{2}-\\d+$"
        message: "用户故事 ID 必须匹配格式: US-123"
```

### 预期输出

```json
{
  "productName": "智能客服系统",
  "userStories": [
    {
      "id": "US-001",
      "title": "作为用户，我想要通过自然语言查询订单状态",
      "description": "用户希望能够用自然语言输入查询订单...",
      "acceptanceCriteria": [
        "系统支持自然语言查询",
        "查询响应时间 < 2秒",
        "支持模糊匹配"
      ],
      "priority": "P0",
      "storyPoints": 8
    }
  ],
  "personas": [
    {
      "name": "张三",
      "role": "电商运营",
      "goals": ["提高订单处理效率", "减少客户投诉"]
    }
  ]
}
```

## 示例 3: Data Analyst Agent（Fallback 模式）

### 场景描述

Data Analyst Agent 分析数据并生成洞察报告，使用 fallback 模式以避免因格式问题导致整个分析失败。

### 配置

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

  # ⭐ 新增：ValidationHook 配置（Fallback 模式）
  validation:
    strategy: fallback  # 使用降级模式

    schema:
      summary:
        type: string
        minLength: 100

      insights:
        type: array
        minItems: 1
        items:
          type: object
          required: [category, finding, recommendation]
          properties:
            category:
              type: string
              enum: [trend, anomaly, pattern, opportunity]
            finding:
              type: string
              minLength: 20
            recommendation:
              type: string
              minLength: 20

      metadata:
        type: object
        required: [dataSource, analysisDate]
        properties:
          dataSource:
            type: string
          analysisDate:
            type: string
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"

    required:
      - summary
      - insights

    formats:
      - field: summary
        pattern: "^(基于|根据|通过分析)"
        message: "摘要应以分析性词汇开头"
```

### 行为说明

在 fallback 模式下：
- 如果验证失败，不会抛出错误
- 会记录警告日志并清理输出
- Agent 仍然返回结果，但输出可能不完整

**适用场景**：
- 开发和测试阶段
- 非关键业务流程
- 数据探索性任务

## 示例 4: Developer Engineer Agent（组合验证）

### 场景描述

Developer Engineer Agent 生成代码实现，需要同时验证代码结构和关键字段。

### 配置

```yaml
# subagents/developer-engineer/agent.yaml

name: developer engineer
description: 代码实现 Agent

agent:
  system_prompt: |
    你是一个资深工程师，负责根据需求实现高质量代码。

  available_skills:
    - tool-read
    - code-analysis

  # ⭐ 新增：ValidationHook 配置（组合验证）
  validation:
    strategy: strict

    # Schema 验证
    schema:
      implementation:
        type: object
        required: [language, files, dependencies]
        properties:
          language:
            type: string
            enum: [typescript, python, java, go]
          files:
            type: array
            minItems: 1
            items:
              type: object
              required: [path, content]
              properties:
                path:
                  type: string
                  pattern: "^[a-zA-Z0-9_/\\-]+\\.(ts|py|java|go)$"
                content:
                  type: string
                  minLength: 50
          dependencies:
            type: array
            items:
              type: string
              pattern: "^[a-z0-9\\-@]+$"

      explanation:
        type: string
        minLength: 100

      testing:
        type: object
        required: [unitTests, integrationTests]
        properties:
          unitTests:
            type: array
            minItems: 1
          integrationTests:
            type: array
            minItems: 0

    # Completeness 验证
    required:
      - implementation
      - explanation

    # Format 验证
    formats:
      - field: implementation.files[].path
        pattern: "^(src/|lib/|tests/)"
        message: "文件路径必须以 src/, lib/ 或 tests/ 开头"

      - field: explanation
        pattern: "^(实现|功能|代码)"
        message: "说明应以实现相关词汇开头"
```

### 预期输出

```json
{
  "implementation": {
    "language": "typescript",
    "files": [
      {
        "path": "src/services/user-service.ts",
        "content": "export class UserService { ... }"
      }
    ],
    "dependencies": ["@types/node", "express"]
  },
  "explanation": "实现用户服务模块，包含用户 CRUD 操作...",
  "testing": {
    "unitTests": ["user-service.test.ts"],
    "integrationTests": []
  }
}
```

## 验证策略选择指南

### 何时使用 Strict 模式

- ✅ 关键业务流程（支付、安全相关）
- ✅ 需要精确输出的场景（代码生成、配置文件）
- ✅ 生产环境
- ✅ API 响应格式

### 何时使用 Fallback 模式

- ✅ 开发和测试阶段
- ✅ 数据探索性任务
- ✅ 非关键业务流程
- ✅ AI 创意生成任务

## 测试验证

### 本地测试

```bash
# 1. 启动服务
npm run start

# 2. 测试 Agent（带验证）
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "审查以下代码的质量",
    "subagent": "code-reviewer",
    "environment": {
      "code": "function add(a, b) { return a + b; }"
    }
  }'

# 3. 检查输出是否符合验证规则
# 如果不符合，将返回 error 字段
```

### 查看验证日志

```bash
# Strict 模式：查看错误
tail -f .motia/logs/motia.log | grep "Output validation failed"

# Fallback 模式：查看警告
tail -f .motia/logs/motia.log | grep "sanitizing output"
```

## 常见问题

### Q1: 如何调试验证规则？

**A**: 先使用 fallback 模式，查看实际输出，然后调整规则：

```bash
# 1. 使用 fallback 模式
validation:
  strategy: fallback

# 2. 查看实际输出
curl ... | jq .

# 3. 根据输出调整规则
# 4. 切换到 strict 模式
validation:
  strategy: strict
```

### Q2: 如何验证嵌套字段？

**A**: 使用点号分隔路径：

```yaml
required:
  - implementation.files[0].path
  - metadata.author.name

formats:
  - field: implementation.files[].content
    pattern: "^export class"
```

### Q3: 如何验证数组中的每个元素？

**A**: 使用 `[]` 语法：

```yaml
formats:
  - field: userStories[].id  # 验证所有用户故事的 id
    pattern: "^[US]{2}-\\d+$"

  - field: files[].content   # 验证所有文件的内容
    pattern: "^import"
```

## 相关文档

- [使用指南](./03-usage-guide.md)
- [设计文档](./01-design.md)
- [实施清单](./02-implementation.md)
