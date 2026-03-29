# Task 和 Skill 输出结构

> 统一输出 Schema：result_type、success、content、metadata

**阅读时间**: 8 分钟 | **难度**: ⭐⭐ intermediate

---

## 🎯 输出结构设计

MyAgent 采用**统一的输出 Schema**，确保所有 Task 和 Skill 的输出格式一致，便于前端解析和展示。

---

## 📋 统一输出 Schema

### 标准结构

```typescript
interface UnifiedOutput {
  // 1. 结果类型（必须）
  result_type: string;

  // 2. 成功标志（必须）
  success: boolean;

  // 3. 内容（必须）
  content: any;

  // 4. 元数据（必须）
  metadata: {
    timestamp: string;
    execution_time?: number;
    [key: string]: any;
  };
}
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `result_type` | string | ✅ | 结果类型（如 `report`, `error`, `chart`） |
| `success` | boolean | ✅ | 执行是否成功 |
| `content` | any | ✅ | 实际输出内容 |
| `metadata` | object | ✅ | 元数据（时间、执行时长等） |

---

## 🎨 常见 result_type

### 1. report（报告）

**用途**: 结构化的分析报告

**示例**: 代码分析结果

```json
{
  "result_type": "report",
  "success": true,
  "content": {
    "type": "code_analysis",
    "title": "代码质量分析",
    "summary": "发现 3 个问题",
    "data": {
      "score": 75,
      "issues": [...],
      "suggestions": [...]
    }
  },
  "metadata": {
    "language": "python",
    "checks_performed": ["quality", "security"],
    "execution_time": 1234
  }
}
```

---

### 2. error（错误）

**用途**: 标准化的错误输出

**示例**: 技能执行失败

```json
{
  "result_type": "error",
  "success": false,
  "content": {
    "error_code": "validation_error",
    "message": "输入参数无效",
    "details": {
      "field": "code",
      "issue": "不能为空"
    },
    "suggestions": [
      "提供有效的代码字符串",
      "检查 code 参数"
    ]
  },
  "metadata": {
    "execution_time": 100
  }
}
```

---

### 3. chart（图表）

**用途**: 可视化数据

**示例**: 数据分析图表

```json
{
  "result_type": "chart",
  "success": true,
  "content": {
    "type": "bar",
    "title": "任务完成情况",
    "data": {
      "labels": ["周一", "周二", "周三"],
      "datasets": [{
        "label": "完成任务数",
        "data": [5, 8, 6]
      }]
    }
  },
  "metadata": {
    "chart_library": "chart.js"
  }
}
```

---

### 4. text（文本）

**用途**: 纯文本输出

**示例**: 生成的文档

```json
{
  "result_type": "text",
  "success": true,
  "content": "这是生成的文档内容...",
  "metadata": {
    "word_count": 500,
    "language": "zh-CN"
  }
}
```

---

## 📝 Skill 输出 Schema 定义

### skill.yaml 中的定义

```yaml
# skills/my-skill/skill.yaml
name: my-skill
version: 1.0.0
description: 我的技能

input_schema:
  type: object
  properties:
    input:
      type: string
  required: [input]

output_schema:
  type: object
  required: [result_type, success, content, metadata]
  properties:
    result_type:
      type: string
      enum: [report, error, chart, text]
    success:
      type: boolean
    content:
      oneOf:
        - type: object  # report
        - type: object  # error
        - type: object  # chart
        - type: string  # text
    metadata:
      type: object
      properties:
        execution_time:
          type: number
```

### 实际示例：code-analysis

```yaml
# skills/code-analysis/skill.yaml
output_schema:
  type: object
  required: [result_type, success, content, metadata]
  properties:
    result_type:
      type: string
      enum: [report, error]

    success:
      type: boolean
      description: 分析是否成功

    content:
      oneOf:
        # 成功：report 格式
        - type: object
          required: [type, title, summary, data]
          properties:
            type:
              type: string
              enum: [code_analysis]
            title:
              type: string
            summary:
              type: string
            data:
              type: object
              required: [score, issues, suggestions, metrics]
              properties:
                score:
                  type: number
                  minimum: 0
                  maximum: 100
                issues:
                  type: array
                  items:
                    type: object
                suggestions:
                  type: array
                  items:
                    type: object
                metrics:
                  type: object

        # 失败：error 格式
        - type: object
          required: [error_code, message]
          properties:
            error_code:
              type: string
              enum: [validation_error, execution_error, timeout_error]
            message:
              type: string
            details:
              type: object
            suggestions:
              type: array
              items:
                type: string

    metadata:
      type: object
      required: [language, checks_performed, execution_time]
      properties:
        language:
          type: string
        checks_performed:
          type: array
          items:
            type: string
        execution_time:
          type: number
```

---

## 🔄 数据流转

```
Skill 执行
    ↓
返回 Python dict
    ↓
Skill Metadata 验证
    ↓
转换为 UnifiedOutput
    ↓
发送到 Stream (/api/notify)
    ↓
前端接收并解析
    ↓
根据 result_type 渲染
```

---

## 💡 设计原则

### 1. 类型明确

```json
{
  "result_type": "report"  // 清晰的类型标识
}
```

### 2. 成功/失败分离

```json
// 成功
{
  "success": true,
  "content": { /* 结果 */ }
}

// 失败
{
  "success": false,
  "content": {
    "error_code": "validation_error",
    "message": "输入无效"
  }
}
```

### 3. 元数据丰富

```json
{
  "metadata": {
    "timestamp": "2026-03-29T10:00:00Z",
    "execution_time": 1234,
    "language": "python",
    "version": "1.0.0"
  }
}
```

---

## ⚙️ 前端渲染

### 根据 result_type 渲染

```typescript
// 前端代码示例
function renderOutput(output: UnifiedOutput) {
  switch (output.result_type) {
    case 'report':
      return <ReportView data={output.content} />;

    case 'error':
      return <ErrorView data={output.content} />;

    case 'chart':
      return <ChartView data={output.content} />;

    case 'text':
      return <TextView data={output.content} />;

    default:
      return <UnknownView data={output} />;
  }
}
```

---

## 🚨 局限性

### 当前局限

1. **缺乏嵌套支持**: content 结构扁平，复杂输出需要多层嵌套
2. **无流式输出**: 大内容一次性返回，无法流式传输
3. **无版本控制**: Schema 变更时可能破坏向后兼容性
4. **缺乏验证**: 前端需要手动验证 content 结构

### 已知问题

#### 问题 1: 错误信息不一致

```json
// Skill A 的错误格式
{
  "error_code": "validation_error",
  "message": "输入无效"
}

// Skill B 的错误格式
{
  "error": "输入无效"  // 不符合规范！
}
```

**解决方案**: 强制所有 Skill 遵循统一 Schema

---

#### 问题 2: 大内容传输

```json
{
  "content": "非常长的文档内容..."  // 可能耗尽前端内存
}
```

**解决方案**:
- 使用分页
- 提供 `content_url` 代替完整内容
- 支持流式传输

---

#### 问题 3: 复杂类型支持不足

```json
{
  "content": {
    "type": "multi-modal",
    "text": "...",
    "images": ["...", "..."],
    "videos": ["..."]
  }
}
```

**解决方案**: 扩展 `result_type` 枚举
- `multi-modal` - 多媒体内容
- `stream` - 流式内容
- `file` - 文件引用

---

## 📈 未来优化方向

### 1. Schema 版本化

```typescript
interface UnifiedOutput {
  version: "1.0";
  result_type: string;
  success: boolean;
  content: any;
  metadata: Metadata;
}
```

### 2. 内容引用

```typescript
// 大内容使用引用
{
  "content": {
    "type": "file-reference",
    "url": "/api/files/doc-123.pdf",
    "size": 1024000
  }
}
```

### 3. 流式输出

```typescript
// 支持流式
{
  "result_type": "stream",
  "stream_url": "/api/streams/stream-456"
}
```

### 4. 验证和类型安全

```typescript
// 使用 Zod 等工具验证
import { z } from 'zod';

const UnifiedOutputSchema = z.object({
  result_type: z.string(),
  success: z.boolean(),
  content: z.any(),
  metadata: z.object({
    timestamp: z.string(),
    execution_time: z.number().optional()
  })
});
```

---

## 📖 相关文档

- [Skill 开发](../api/plugin-api/custom-skill.md) - 开发新 Skill
- [Agent 系统](./agent-system.md) - Agent 输出结构
- [Stream 系统](./stream-system.md) - 实时输出传输

---

**版本**: v1.0 | **更新日期**: 2026-03-29
