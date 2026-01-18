# Motia Skill Output Schema 开发规范

> **版本**: 1.0.0
> **最后更新**: 2025-01-15
> **状态**: 正式发布

---

## 📋 目录

1. [概述](#概述)
2. [核心原则](#核心原则)
3. [输出格式结构](#输出格式结构)
4. [Result Type 详解](#result-type-详解)
5. [编写指南](#编写指南)
6. [示例参考](#示例参考)
7. [验证清单](#验证清单)
8. [常见问题](#常见问题)

---

## 概述

本文档定义了所有 Motia Skill 必须遵循的统一输出格式规范。通过标准化的输出格式，我们可以：

- ✅ **前端自适应渲染**：根据 `result_type` 自动选择渲染器
- ✅ **统一的错误处理**：所有错误都遵循相同格式
- ✅ **丰富的元数据**：便于统计、分析和调试
- ✅ **良好的扩展性**：支持自定义字段
- ✅ **向后兼容性**：可以逐步迁移到新格式

---

## 核心原则

### 1. 必需字段

所有 Skill 输出**必须**包含以下字段：

```yaml
required:
  - result_type    # 结果类型标识
  - success        # 成功标志
  - content        # 具体内容
  - metadata       # 元数据
```

### 2. result_type 枚举值

`result_type` 必须使用以下预定义的值之一：

```yaml
# 文本类型
- text              # 纯文本
- markdown          # Markdown 格式
- code              # 代码片段

# 媒体类型
- image             # 静态图片
- video             # 视频
- audio             # 音频
- gif               # 动图

# 文档类型
- infographic       # 信息图 (SVG/HTML)
- report            # 报告 (PDF/DOCX)
- spreadsheet       # 表格 (CSV/XLSX)
- presentation     # 演示文稿 (PPTX)

# 数据类型
- table             # 表格数据
- json              # JSON 数据
- chart             # 图表配置

# 特殊类型
- error             # 错误信息
- mixed             # 混合内容
- unknown           # 未知类型
```

### 3. 路径规范

所有文件路径**必须**相对于 `outputs/` 目录，**不包含** `outputs/` 前缀：

```yaml
# ✅ 正确
path: "infographics/task_123.svg"
path: "videos/task_456.mp4"

# ❌ 错误
path: "outputs/infographics/task_123.svg"
path: "/absolute/path/to/file.svg"
```

### 4. 错误处理

所有 Skill 失败时，必须返回标准化的错误格式：

```yaml
result_type: error
success: false
content:
  type: <error_type>
  message: <user_friendly_message>
  suggestions: [<solutions>]
```

---

## 输出格式结构

### 标准模板

```yaml
output_schema:
  type: object
  required:
    - result_type
    - success
    - content
    - metadata
  properties:
    # 核心字段
    result_type:
      type: string
      enum: [<YOUR_TYPE>, error]

    success:
      type: boolean

    content:
      oneOf:
        - $ref: "#/definitions/SUCCESS_CONTENT"
        - $ref: "#/definitions/ERROR_CONTENT"

    # 可选字段
    title:
      type: string

    description:
      type: string

    metadata:
      $ref: "#/definitions/METADATA"
```

### 元数据结构

```yaml
metadata:
  type: object
  required:
    - execution_time    # 执行时长（毫秒）
    - skills_used       # 使用的技能列表
  properties:
    execution_time:
      type: integer
      minimum: 0

    skills_used:
      type: array
      items:
        type: string

    tokens:              # 可选：Token 统计
      type: object
      properties:
        input:
          type: integer
        output:
          type: integer
        total:
          type: integer

    tags:                # 可选：自定义标签
      type: array
      items:
        type: string

    notes:               # 可选：用户备注
      type: string

    # 自定义扩展字段（使用 x- 前缀）
    "^x-":
      type: any
```

---

## Result Type 详解

### 文本类型

#### 1. text（纯文本）

**适用场景**：简单文本响应、日志信息、状态更新

```yaml
result_type: text
success: true
content: "任务执行成功，已生成 3 个图表。"
metadata:
  execution_time: 2000
  skills_used: ["task-processor"]
```

#### 2. markdown（Markdown格式）

**适用场景**：格式化报告、文档生成、结构化信息

```yaml
result_type: markdown
success: true
title: "代码分析报告"
content: |
  # 分析结果

  ## 总体评分: 85/100

  ### 发现的问题
  - [中等] 函数复杂度过高
  - [低] 缺少类型提示

  ### 改进建议
  1. 拆分大函数
  2. 添加类型注解
metadata:
  execution_time: 5000
  skills_used: ["code-analyzer"]
```

#### 3. code（代码片段）

**适用场景**：代码生成、代码优化、代码转换

```yaml
result_type: code
success: true
content:
  code: |
    async function fetchData(url: string): Promise<Data> {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    }
  language: typescript
  highlight: true
  line_numbers: true
metadata:
  execution_time: 3000
  skills_used: ["code-generator"]
```

### 媒体类型

#### 4. image（图片）

**适用场景**：图片生成、图表渲染、截图

```yaml
result_type: image
success: true
content:
  path: "images/product_promo.png"
  mime_type: "image/png"
  size: 2456780
  width: 1920
  height: 1080
  thumbnail_path: "thumbnails/images/product_promo.jpg"
metadata:
  execution_time: 8000
  skills_used: ["image-generator"]
  x-format: "PNG"
```

#### 5. video（视频）

**适用场景**：视频生成、动画渲染、视频编辑

```yaml
result_type: video
success: true
content:
  path: "videos/product_demo.mp4"
  mime_type: "video/mp4"
  size: 15728640
  width: 1920
  height: 1080
  duration: 10.5
  fps: 30
  resolution: "1920x1080"
  quality: "medium"
  thumbnail_path: "thumbnails/videos/product_demo.jpg"
metadata:
  execution_time: 120000
  skills_used: ["remotion-generator"]
  x-style: "minimal"
```

### 文档类型

#### 6. infographic（信息图）

**适用场景**：数据可视化、信息图表、营销图表

```yaml
result_type: infographic
success: true
content:
  path: "infographics/q4_sales.svg"
  mime_type: "image/svg+xml"
  size: 245678
  width: 1920
  height: 1080
  thumbnail_path: "thumbnails/infographics/q4_sales.jpg"
  template: "column-chart"
  chart_type: "column-chart"
  theme: "business"
  data_points: 12
metadata:
  execution_time: 45000
  skills_used: ["infographic-generator"]
  x-template: "column-chart"
```

### 数据类型

#### 7. table（表格数据）

**适用场景**：数据展示、分析结果、对比数据

```yaml
result_type: table
success: true
content:
  headers: ["配置", "响应时间(ms)", "吞吐量(req/s)", "错误率(%)"]
  rows:
    - ["配置A", "120", "850", "0.1"]
    - ["配置B", "95", "1100", "0.05"]
    - ["配置C", "85", "1250", "0.02"]
  title: "性能测试结果"
  sortable: true
metadata:
  execution_time: 8000
  skills_used: ["performance-tester"]
```

### 特殊类型

#### 8. error（错误信息）

**适用场景**：所有执行失败的情况

```yaml
result_type: error
success: false
content:
  type: "timeout"
  message: "视频生成超时（超过 10 分钟）"
  details: |
    TimeoutError: Task execution exceeded 600000ms
      at VideoRenderer.render (renderer.py:234)
  retryable: true
  suggestions:
    - "尝试减少视频时长"
    - "降低质量设置"
  code: "TIMEOUT_ERROR"
metadata:
  execution_time: 600000
  skills_used: ["remotion-generator"]
```

#### 9. mixed（混合内容）

**适用场景**：多步骤任务、综合报告

```yaml
result_type: mixed
success: true
content:
  - type: "text"
    title: "概述"
    content: "本报告包含数据可视化和详细分析。"
    order: 0

  - type: "infographic"
    title: "销售数据图表"
    content:
      path: "infographics/sales.svg"
      mime_type: "image/svg+xml"
    order: 1

  - type: "markdown"
    title: "详细分析"
    content: |
      ## 分析结果
      主要发现如下...
    order: 2
metadata:
  execution_time: 30000
  skills_used: ["data-analyzer", "infographic-generator"]
```

---

## 编写指南

### Step 1: 选择合适的 result_type

根据你的 Skill 输出内容，选择最合适的类型：

| 输出内容 | 推荐的 result_type |
|---------|-------------------|
| 生成图片 | `image` |
| 生成视频 | `video` |
| 生成 SVG 信息图 | `infographic` |
| 生成报告（PDF） | `report` |
| 代码分析结果 | `table` 或 `json` |
| 代码片段 | `code` |
| 文本响应 | `text` 或 `markdown` |
| 多种内容混合 | `mixed` |
| 执行失败 | `error` |

### Step 2: 编写 output_schema

在你的 `skill.yaml` 文件中：

```yaml
name: my-skill
version: 1.0.0
description: My custom skill

output_schema:
  type: object
  required:
    - result_type
    - success
    - content
    - metadata
  properties:
    result_type:
      type: string
      enum: [image, error]

    success:
      type: boolean

    content:
      oneOf:
        # 成功时的内容
        - type: object
          required:
            - path
            - mime_type
          properties:
            path:
              type: string
              pattern: "^[^.]"
            mime_type:
              type: string
              enum: ["image/png", "image/jpeg"]
            size:
              type: integer
            width:
              type: integer
            height:
              type: integer
            thumbnail_path:
              type: string

        # 失败时的错误
        - $ref: "#/definitions/error"

    metadata:
      $ref: "#/definitions/metadata"
```

### Step 3: 在 Skill 代码中返回标准格式

**Python 示例**：

```python
from skills.lib.output_builder import OutputBuilder, MediaInfo

class MySkill:
    async def execute(self, inputs: dict) -> dict:
        try:
            # 执行技能逻辑
            result_path = await self.generate_image(inputs)
            thumbnail_path = await self.generate_thumbnail(result_path)

            # 使用 OutputBuilder 构建标准输出
            output = OutputBuilder() \
                .set_media(MediaInfo(
                    path=result_path.replace('outputs/', ''),
                    mime_type='image/png',
                    size=os.path.getsize(result_path),
                    thumbnail_path=thumbnail_path.replace('outputs/', ''),
                )) \
                .set_title("生成的图片") \
                .set_description("基于输入生成的图片") \
                .add_tag("generated") \
                .set_metadata('execution_time', self.execution_time) \
                .build()

            return {
                'success': True,
                'output': output
            }

        except Exception as e:
            # 错误处理
            error_output = OutputBuilder().set_error(
                e,
                suggestions=[
                    "检查输入参数",
                    "重试操作"
                ]
            ).build()

            return {
                'success': False,
                'output': error_output
            }
```

### Step 4: 验证输出格式

使用验证工具（见下文）检查你的输出是否符合规范。

---

## 示例参考

### 完整的 skill.yaml 示例

参见以下文件：
- `skills/schemas/examples/infographic-generator-skill.yaml`
- `skills/schemas/examples/remotion-generator-skill.yaml`
- `skills/schemas/examples/code-analysis-skill.yaml`

### 各种 result_type 的完整示例

参见：
- `skills/schemas/types/text-types.yaml`
- `skills/schemas/types/media-types.yaml`
- `skills/schemas/types/data-types.yaml`
- `skills/schemas/types/special-types.yaml`

---

## 验证清单

在提交 Skill 之前，请确认以下事项：

### 基础检查

- [ ] `output_schema` 包含所有必需字段
- [ ] `result_type` 使用预定义的枚举值
- [ ] `content` 格式与 `result_type` 匹配
- [ ] 所有文件路径相对于 `outputs/` 目录
- [ ] 不包含 `outputs/` 前缀

### 元数据检查

- [ ] `execution_time` 以毫秒为单位
- [ ] `skills_used` 是数组格式
- [ ] 自定义字段使用 `x-` 前缀
- [ ] 提供了合理的 `tags`

### 错误处理检查

- [ ] 失败时返回 `result_type: error`
- [ ] 错误消息用户友好
- [ ] 提供了 `suggestions`
- [ ] 正确设置 `retryable` 标志

### 文档检查

- [ ] 更新了 `SKILL.md` 文档
- [ ] 提供了输入/输出示例
- [ ] 说明了各配置参数的作用

---

## 常见问题

### Q1: 如何选择合适的 result_type？

**A**: 参考下表：

| 你的输出 | 推荐 type |
|---------|----------|
| 图片文件 | `image` |
| 视频文件 | `video` |
| SVG 信息图 | `infographic` |
| PDF 报告 | `report` |
| 纯文本 | `text` |
| 格式化文本 | `markdown` |
| 代码片段 | `code` |
| 表格数据 | `table` |
| JSON 数据 | `json` |
| 多种内容 | `mixed` |

### Q2: 缩略图是必需的吗？

**A**: 对于媒体类型（image, video, infographic），强烈建议提供缩略图以优化前端加载性能。

### Q3: 如何添加自定义元数据？

**A**: 使用 `x-` 前缀：

```yaml
metadata:
  execution_time: 45000
  skills_used: ["my-skill"]
  x-custom-field: "value"
  x-another-field: 123
```

### Q4: content 可以同时支持多种格式吗？

**A**: 可以，使用 `oneOf`：

```yaml
content:
  oneOf:
    - type: string     # 文本格式
    - type: object     # 对象格式
```

### Q5: 如何处理部分成功的情况？

**A**: 使用 `mixed` 类型，包含成功和失败的部分：

```yaml
result_type: mixed
content:
  - type: "image"
    content: {...}
  - type: "error"
    content: {...}
```

### Q6: metadata 中的 tokens 字段是必需的吗？

**A**: 不是必需的，但如果你的 Skill 使用了 LLM，建议提供。

---

## 附录

### A. 错误类型详细说明

| 错误类型 | 说明 | 是否可重试 |
|---------|-----|-----------|
| `validation` | 输入验证失败 | ❌ 否（需修正输入） |
| `execution` | 执行过程错误 | ✅ 是 |
| `timeout` | 执行超时 | ✅ 是 |
| `network` | 网络错误 | ✅ 是 |
| `resource` | 资源不足 | ❌ 否（需增加资源） |
| `permission` | 权限不足 | ❌ 否（需授权） |
| `dependency` | 依赖缺失 | ❌ 否（需安装依赖） |
| `unknown` | 未知错误 | ✅ 是 |

### B. MIME 类型参考

| 文件类型 | MIME 类型 |
|---------|----------|
| PNG | `image/png` |
| JPEG | `image/jpeg` |
| SVG | `image/svg+xml` |
| MP4 | `video/mp4` |
| WebM | `video/webm` |
| PDF | `application/pdf` |
| JSON | `application/json` |

### C. 文件大小参考

| 内容类型 | 典型大小 |
|---------|---------|
| SVG 信息图 | 100KB - 1MB |
| PNG 图片 | 1MB - 10MB |
| MP4 视频 (10s) | 5MB - 50MB |
| PDF 报告 | 100KB - 5MB |

---

## 相关资源

- **Schema 定义**: `skills/schemas/result-schema-base.yaml`
- **类型详解**: `skills/schemas/types/*.yaml`
- **示例**: `skills/schemas/examples/*.yaml`
- **验证工具**: `scripts/validate-skill-output.py`

---

## 更新日志

| 版本 | 日期 | 变更说明 |
|-----|------|---------|
| 1.0.0 | 2025-01-15 | 初始版本 |
