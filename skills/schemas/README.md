# Motia Skill Output Schema

> **版本**: 1.0.0
> **最后更新**: 2025-01-15

统一的 Motia Skill 输出格式规范和验证工具。

---

## 📁 文件结构

```
skills/schemas/
├── result-schema-base.yaml          # 核心 Schema 模板
├── DEVELOPMENT_GUIDE.md             # 开发规范文档
├── types/                           # 类型详细定义
│   ├── text-types.yaml              # 文本类型
│   ├── media-types.yaml             # 媒体类型
│   ├── data-types.yaml              # 数据类型
│   └── special-types.yaml           # 特殊类型（错误、混合）
├── examples/                        # 完整示例
│   ├── infographic-generator-skill.yaml
│   ├── remotion-generator-skill.yaml
│   └── code-analysis-skill.yaml
└── scripts/                         # 工具脚本
    └── validate_skill_output.py     # Schema 验证工具
```

---

## 🚀 快速开始

### 1. 查看开发规范

```bash
# 阅读完整的开发规范文档
cat skills/schemas/DEVELOPMENT_GUIDE.md
```

### 2. 选择合适的 Result Type

参考下表选择：

| 输出内容 | result_type |
|---------|-------------|
| 图片 | `image` |
| 视频 | `video` |
| 信息图 | `infographic` |
| 报告（PDF） | `report` |
| 代码 | `code` |
| 表格数据 | `table` |
| 纯文本 | `text` |
| Markdown | `markdown` |
| 多种内容 | `mixed` |
| 错误 | `error` |

### 3. 在你的 skill.yaml 中引用

```yaml
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
      enum: [image, error]  # 根据你的类型调整

    success:
      type: boolean

    content:
      oneOf:
        - $ref: "skills/schemas/types/media-types.yaml#/image"
        - $ref: "skills/schemas/types/special-types.yaml#/error"

    metadata:
      $ref: "skills/schemas/result-schema-base.yaml#/definitions/metadata"
```

### 4. 验证输出

```bash
# 验证 JSON 输出文件
python skills/schemas/scripts/validate_skill_output.py output.json

# 验证 Skill 的测试输出
python skills/schemas/scripts/validate_skill_output.py skills/infographic-generator/test_output.json
```

---

## 📚 文档索引

### 核心文档

- **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)**
  - 完整的开发规范文档
  - 包含所有 result_type 的详细说明
  - 提供验证清单和常见问题解答

### 类型定义

- **[types/text-types.yaml](./types/text-types.yaml)**
  - `text`: 纯文本
  - `markdown`: Markdown 格式
  - `code`: 代码片段

- **[types/media-types.yaml](./types/media-types.yaml)**
  - `image`: 静态图片
  - `video`: 视频
  - `audio`: 音频
  - `gif`: 动图

- **[types/data-types.yaml](./types/data-types.yaml)**
  - `infographic`: 信息图
  - `report`: 报告
  - `table`: 表格数据
  - `json`: JSON 数据

- **[types/special-types.yaml](./types/special-types.yaml)**
  - `error`: 错误信息
  - `mixed`: 混合内容

### 示例

- **[examples/infographic-generator-skill.yaml](./examples/infographic-generator-skill.yaml)**
  - 完整的 infographic-generator skill 配置
  - 包含详细的 input_schema 和 output_schema
  - 包含成功和失败输出示例

---

## 🛠️ 验证工具

### validate_skill_output.py

验证 Skill 输出是否符合统一格式规范。

#### 使用方法

```bash
# 验证 JSON 文件
python skills/schemas/scripts/validate_skill_output.py <output.json>

# 示例
python skills/schemas/scripts/validate_skill_output.py skills/infographic-generator/test_output.json
```

#### 验证内容

- ✅ 必需字段检查
- ✅ result_type 枚举值验证
- ✅ success 字段验证
- ✅ content 格式验证
- ✅ metadata 格式验证
- ✅ 路径规范验证

#### 输出示例

```
✅ 验证通过！输出格式符合规范。
```

或

```
❌ 发现 2 个错误:

  • result_type
    无效的 result_type: 'invalid_type'
    💡 建议: 必须是以下值之一: code, image, infographic, ...

  • content.path
    路径格式错误: 'outputs/image.png'
    💡 建议: 路径必须相对于 outputs/ 目录，不能包含 'outputs/' 前缀
```

---

## 📋 Result Type 快速参考

### 文本类型

| Type | 描述 | Content 格式 |
|------|------|-------------|
| `text` | 纯文本 | 字符串 |
| `markdown` | Markdown | Markdown 字符串 |
| `code` | 代码片段 | `{code, language, highlight?, ...}` |

### 媒体类型

| Type | 描述 | Content 格式 |
|------|------|-------------|
| `image` | 图片 | `{path, mime_type, size?, width?, height?, thumbnail_path?}` |
| `video` | 视频 | `{path, mime_type, duration, size?, width?, height?, fps?, thumbnail_path?}` |
| `audio` | 音频 | `{path, mime_type, duration, size?, sample_rate?}` |
| `gif` | 动图 | `{path, mime_type, size?, width?, height?, duration?, frame_count?}` |

### 文档类型

| Type | 描述 | Content 格式 |
|------|------|-------------|
| `infographic` | 信息图 | `{path, mime_type, template?, chart_type?, theme?, ...}` |
| `report` | 报告 | `{path, mime_type, page_count?, word_count?, ...}` |
| `table` | 表格 | `{headers, rows, title?, sortable?}` |
| `json` | JSON | 字符串或对象 |

### 特殊类型

| Type | 描述 | Content 格式 |
|------|------|-------------|
| `error` | 错误 | `{type, message, details?, retryable?, suggestions?, code?}` |
| `mixed` | 混合内容 | `[{type, content, title?, description?, order?}, ...]` |

---

## 🔧 在代码中使用

### Python 示例

```python
from skills.lib.output_builder import OutputBuilder, MediaInfo

class MySkill:
    async def execute(self, inputs: dict) -> dict:
        try:
            # 执行技能逻辑
            image_path = await self.generate_image(inputs)

            # 构建标准输出
            output = OutputBuilder() \
                .set_media(MediaInfo(
                    path=image_path.replace('outputs/', ''),
                    mime_type='image/png',
                    size=os.path.getsize(image_path),
                )) \
                .set_title("生成的图片") \
                .add_tag("generated") \
                .build()

            return {'success': True, 'output': output}

        except Exception as e:
            # 错误处理
            error_output = OutputBuilder().set_error(
                e,
                suggestions=["重试操作", "检查输入参数"]
            ).build()

            return {'success': False, 'output': error_output}
```

### TypeScript 示例

```typescript
import { OutputBuilder, MediaInfo } from './output-builder';

const output = new OutputBuilder()
    .setMedia({
        path: 'images/result.png',
        mimeType: 'image/png',
        size: fileStats.size,
    })
    .setTitle('生成的图片')
    .addTag('generated')
    .build();
```

---

## ✅ 验证清单

在提交 Skill 之前，确认以下事项：

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

---

## 🤝 贡献指南

### 添加新的 Result Type

如果需要添加新的 result_type：

1. 在相应的类型文件中添加定义
2. 在 `result-schema-base.yaml` 中添加枚举值
3. 更新 `DEVELOPMENT_GUIDE.md` 文档
4. 提供完整的使用示例

### 报告问题

如果发现问题或有改进建议：

1. 检查现有文档和示例
2. 在 GitHub Issues 中提交
3. 提供详细的复现步骤和期望行为

---

## 📞 获取帮助

- 📖 阅读开发规范: `DEVELOPMENT_GUIDE.md`
- 💻 查看示例: `examples/*.yaml`
- 🔍 使用验证工具: `scripts/validate_skill_output.py`

---

**维护者**: Motia Development Team
**许可证**: MIT
