# Phase 2: Skill 重构指南

> **创建日期**: 2025-01-15
> **状态**: 🚧 进行中

---

## 📋 概述

本指南详细说明如何将现有的 skill 重构为使用统一的输出格式 schema。

### 重构目标

将所有 skill 的输出从自定义格式统一为标准格式:

```json
{
  "result_type": "infographic|video|image|...",
  "success": true|false,
  "content": {...},
  "title": "...",
  "description": "...",
  "metadata": {
    "execution_time": 12345,
    "skills_used": ["skill-name"],
    "tags": ["tag1"],
    "x-custom-field": "value"
  }
}
```

### 待重构的 Skill

1. ✅ **OutputBuilder 工具类** - 已完成
2. 🚧 **infographic-generator** - 进行中
3. ⏳ **remotion-generator** - 待处理
4. ⏳ **code-analysis** - 待处理
5. ⏳ **web-search** - 待处理

---

## 🛠️ 通用重构步骤

### 步骤 1: 更新 skill.yaml

**目的**: 更新 output_schema 定义

**操作**:
1. 备份原文件: `cp skills/xxx/skill.yaml skills/xxx/skill.yaml.bak`
2. 修改 `output_schema` 部分,使用标准格式
3. 使用 `oneOf` 支持成功和失败两种情况

**示例** (infographic-generator):

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
      enum: [infographic, error]
      description: "结果类型"

    success:
      type: boolean
      description: "是否成功"

    content:
      oneOf:
        # 成功情况 - infographic 内容
        - type: object
          required: [path, mime_type]
          properties:
            path:
              type: string
              description: "相对于 outputs/ 的路径"
            mime_type:
              type: string
              enum: ["image/svg+xml", "image/png"]
            size:
              type: integer
            width:
              type: integer
            height:
              type: integer
            thumbnail_path:
              type: string
            template:
              type: string
            chart_type:
              type: string
            theme:
              type: string
            style:
              type: string

        # 失败情况 - error 内容
        - type: object
          required: [type, message]
          properties:
            type:
              type: string
              enum: [validation, execution, timeout, network, resource, permission, dependency, unknown]
            message:
              type: string
            details:
              type: string
            retryable:
              type: boolean
            suggestions:
              type: array
              items:
                type: string

    title:
      type: string
      description: "输出标题"

    description:
      type: string
      description: "输出描述"

    metadata:
      type: object
      required: [execution_time, skills_used]
      properties:
        execution_time:
          type: integer
          description: "执行时间(毫秒)"
        skills_used:
          type: array
          items:
            type: string
        tags:
          type: array
          items:
            type: string
```

### 步骤 2: 更新 handler.py

**目的**: 使用 OutputBuilder 构建标准化输出

**操作**:
1. 导入 OutputBuilder: `from skills.lib.output_builder import OutputBuilder, MediaInfo, ErrorInfo`
2. 找到返回语句
3. 使用 OutputBuilder 重新构建返回值
4. 处理错误情况

**示例** (infographic-generator):

**原代码**:
```python
result = {
    "success": True,
    "html_path": str(html_path),
    "svg_path": svg_path,
    "png_path": png_path,
    "html_url": f"/outputs/infographics/{html_filename}",
    "svg_url": export_url if svg_path else None,
    "png_url": export_url if png_path else None,
    "metadata": {
        "title": title,
        "template": template,
        "content_type": content_type,
        "theme": palette,
        "style": style,
        "dimensions": {"width": width, "height": height},
        "generated_at": format_timestamp(),
    },
}

return result
```

**新代码**:
```python
from skills.lib.output_builder import OutputBuilder, get_relative_path, get_file_size

# ... 生成逻辑 ...

# 确定实际输出的文件(优先使用 PNG)
if png_path and png_path.exists():
    output_path = png_path
    mime_type = "image/png"
elif svg_path and svg_path.exists():
    output_path = svg_path
    mime_type = "image/svg+xml"
else:
    output_path = html_path
    mime_type = "text/html"

# 获取文件信息
relative_path = get_relative_path(output_path)
file_size = get_file_size(output_path)

# 使用 OutputBuilder 构建输出
output = OutputBuilder() \
    .set_infographic(
        path=relative_path,
        mime_type=mime_type,
        size=file_size,
        width=width,
        height=height,
        template=template,
        chart_type=content_type,
        theme=theme_input if theme_input != "auto" else None,
        style=style
    ) \
    .set_title(title) \
    .add_skill("infographic-generator") \
    .add_standard_metadata("template", template) \
    .add_standard_metadata("content_type", content_type) \
    .add_standard_metadata("theme", palette) \
    .add_standard_metadata("style", style) \
    .add_standard_metadata("dimensions", {"width": width, "height": height}) \
    .build()

return output
```

**错误处理示例**:

**原代码**:
```python
except Exception as e:
    import traceback
    traceback.print_exc()
    return {"success": False, "error": str(e), "error_type": type(e).__name__}
```

**新代码**:
```python
from skills.lib.output_builder import OutputBuilder, ErrorInfo

except Exception as e:
    import traceback
    traceback.print_exc()

    # 使用 OutputBuilder 构建错误输出
    error_output = OutputBuilder() \
        .set_error(
            error=e,
            suggestions=[
                "检查输入内容格式",
                "尝试简化内容描述",
                "如果问题持续,请检查日志"
            ]
        ) \
        .add_skill("infographic-generator") \
        .build()

    return error_output
```

### 步骤 3: 验证输出

**目的**: 确保输出符合 schema 规范

**操作**:
1. 运行 skill 测试
2. 保存输出到 JSON 文件
3. 使用验证工具检查

```bash
# 运行 skill 测试
cd skills/infographic-generator
python handler.py

# 保存输出后,使用验证工具
python skills/schemas/scripts/validate_skill_output.py test_output.json
```

**期望输出**:
```
✅ 验证通过!输出格式符合规范。
```

---

## 📊 Skill 特定重构指南

### 1. infographic-generator

**当前状态**:
- ✅ 已读取 skill.yaml 和 handler.py
- ⏳ 待重构

**关键变更**:
- 输出类型: `infographic`
- 内容格式: MediaInfo + Infographic 特定字段
- 路径规范: 相对于 outputs/infographics/
- 错误处理: 标准化为 ErrorInfo

**测试要点**:
- [ ] SVG 生成成功
- [ ] PNG 降级成功
- [ ] 路径正确(不包含 outputs/ 前缀)
- [ ] metadata 包含 template, theme, style
- [ ] 错误处理正确

**测试命令**:
```python
# 测试用例
test_input = {
    "content": "创建一个展示 Q4 销售数据的柱状图",
    "language": "zh",
    "theme": "business",
    "style": "rough"
}

result = await generate_infographic(test_input)
print(json.dumps(result, indent=2, ensure_ascii=False))
```

### 2. remotion-generator

**当前状态**:
- ✅ 已读取 skill.yaml 和 handler.py
- ⏳ 待重构

**关键变更**:
- 输出类型: `video`
- 内容格式: MediaInfo (video 类型)
- 路径规范: 相对于 outputs/videos/
- 缩略图: 可选,但推荐

**原返回格式** (handler.py:175-193):
```python
return {
    "success": True,
    "video_path": str(video_info['video_path']),
    "video_url": str(video_info['video_path']),
    "thumbnail_path": str(thumbnail_info['thumbnail_path']) if thumbnail_info else None,
    "thumbnail_url": str(thumbnail_info['thumbnail_path']) if thumbnail_info else None,
    "duration": video_info['actual_duration'],
    "fps": video_info['actual_fps'],
    "resolution": video_info['actual_resolution'],
    "file_size": file_size,
    "metadata": {
        "title": self._extract_title(description),
        "description": description[:200],
        "style": style,
        "format": output_format,
        "quality": quality,
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
}
```

**新返回格式示例**:
```python
from skills.lib.output_builder import OutputBuilder, get_relative_path, get_file_size

# 获取文件信息
relative_video_path = get_relative_path(video_info['video_path'])
video_size = get_file_size(video_info['video_path'])
width, height = self._extract_resolution(video_info['actual_resolution'])

# 构建缩略图信息
thumbnail_relative = None
if thumbnail_info and thumbnail_info['thumbnail_path']:
    thumbnail_relative = get_relative_path(thumbnail_info['thumbnail_path'])

output = OutputBuilder() \
    .set_media(MediaInfo(
        path=relative_video_path,
        mime_type=f"video/{output_format}",
        size=video_size,
        width=width,
        height=height,
        duration=video_info['actual_duration'],
        fps=video_info['actual_fps'],
        thumbnail_path=thumbnail_relative
    )) \
    .set_title(self._extract_title(description)) \
    .set_description(description[:200]) \
    .add_skill("remotion-generator") \
    .add_standard_metadata("style", style) \
    .add_standard_metadata("format", output_format) \
    .add_standard_metadata("quality", quality) \
    .build()

return output
```

**错误处理示例**:
```python
except Exception as e:
    error_output = OutputBuilder() \
        .set_error(
            error=e,
            suggestions=[
                "检查视频描述是否清晰",
                "尝试降低视频质量或缩短时长",
                "查看详细错误日志"
            ]
        ) \
        .add_skill("remotion-generator") \
        .build()

    return error_output
```

**测试要点**:
- [ ] MP4 生成成功
- [ ] 缩略图生成成功
- [ ] 路径正确(不包含 outputs/ 前缀)
- [ ] metadata 包含 duration, fps, resolution
- [ ] 错误处理正确

### 3. code-analysis

**当前状态**:
- ✅ 已读取 skill.yaml 和 analyzer.py
- ⏳ 待重构

**关键变更**:
- 输出类型: `report` 或 `table`
- 内容格式: 分析报告或表格数据
- 建议: 使用 `report` 类型,生成 Markdown 报告

**分析**:
当前 code-analysis 返回:
- `score`: 质量分数
- `issues`: 问题列表
- `suggestions`: 改进建议
- `metrics`: 代码指标

**推荐方案**:
将这些内容格式化为 Markdown 报告,然后保存为文件。

**新返回格式示例**:
```python
from skills.lib.output_builder import OutputBuilder, get_relative_path
import time

# 1. 生成 Markdown 报告
report_content = f"""# 代码质量分析报告

## 总体评分

{score}/100

## 发现的问题

"""

for issue in issues:
    report_content += f"### {issue['severity']}: {issue['message']}\n"
    report_content += f"- 位置: 第 {issue.get('line', '?')} 行\n"
    report_content += f"- 建议: {issue.get('suggestion', '无')}\n\n"

report_content += "## 改进建议\n\n"
for suggestion in suggestions:
    report_content += f"- {suggestion}\n"

report_content += "\n## 代码指标\n\n"
for key, value in metrics.items():
    report_content += f"- **{key}**: {value}\n"

# 2. 保存报告到文件
from pathlib import Path
output_dir = Path(__file__).parent.parent.parent / "outputs" / "reports"
output_dir.mkdir(parents=True, exist_ok=True)

report_filename = f"analysis_{int(time.time())}.md"
report_path = output_dir / report_filename

with open(report_path, 'w', encoding='utf-8') as f:
    f.write(report_content)

# 3. 使用 OutputBuilder 构建输出
output = OutputBuilder() \
    .set_report(
        path=get_relative_path(report_path),
        mime_type="text/markdown",
        title=f"代码质量分析报告 - {language}"
    ) \
    .set_title("代码质量分析完成") \
    .set_description(f"分析完成,评分: {score}/100") \
    .add_skill("code-analysis") \
    .add_standard_metadata("score", score) \
    .add_standard_metadata("language", language) \
    .add_standard_metadata("issues_count", len(issues)) \
    .build()

return output
```

**备选方案 - 使用 table 类型**:
如果不希望生成文件,可以直接返回 table 格式:

```python
from skills.lib.output_builder import OutputBuilder

# 构建 table headers
headers = ["严重级别", "类别", "消息", "位置", "建议"]

# 构建 table rows
rows = []
for issue in issues:
    rows.append([
        issue.get('severity', 'info'),
        issue.get('category', '-'),
        issue.get('message', '-'),
        f"第 {issue.get('line', '?')} 行",
        issue.get('suggestion', '-')
    ])

output = OutputBuilder() \
    .set_table(
        headers=headers,
        rows=rows,
        title=f"代码分析结果 - {score}/100",
        sortable=True
    ) \
    .set_title("代码质量分析完成") \
    .add_skill("code-analysis") \
    .add_standard_metadata("score", score) \
    .add_standard_metadata("language", language) \
    .build()

return output
```

**测试要点**:
- [ ] 分析功能正常
- [ ] 输出格式符合规范
- [ ] table/report 格式正确
- [ ] 错误处理正确

### 4. web-search

**当前状态**:
- ✅ 已读取 skill.yaml 和 handler.py
- ⏳ 待重构

**关键变更**:
- 输出类型: `mixed` (文本 + 链接)
- 内容格式: 混合内容数组
- 路径: 无需生成文件

**分析**:
当前 web-search 返回:
- `results`: 搜索结果数组
- `total`: 结果总数
- `query`: 搜索查询

**推荐方案**:
使用 `mixed` 类型,每个搜索结果作为一个混合内容项。

**新返回格式示例**:
```python
from skills.lib.output_builder import OutputBuilder

# 构建混合内容
mixed_items = []

# 添加摘要文本
mixed_items.append({
    "type": "text",
    "content": f"找到 {len(mock_results)} 个关于 '{query}' 的搜索结果:",
    "title": "搜索结果摘要"
})

# 添加每个搜索结果
for idx, result in enumerate(mock_results, 1):
    mixed_items.append({
        "type": "markdown",
        "content": f"""### {idx}. {result['title']}

{result['snippet']}

**来源**: {result['source']}
**链接**: {result['url']}
""",
        "title": result['title'],
        "order": idx
    })

output = OutputBuilder() \
    .set_mixed(mixed_items) \
    .set_title(f"搜索结果: {query}") \
    .set_description(f"找到 {len(mock_results)} 个结果") \
    .add_skill("web-search") \
    .add_standard_metadata("query", query) \
    .add_standard_metadata("total_results", len(mock_results)) \
    .build()

return output
```

**备选方案 - 使用 markdown 类型**:
如果希望更简单,可以合并为一个 markdown 文档:

```python
from skills.lib.output_builder import OutputBuilder

# 构建 Markdown 内容
markdown_content = f"""# 搜索结果: {query}

找到 {len(mock_results)} 个结果:

"""

for idx, result in enumerate(mock_results, 1):
    markdown_content += f"""## {idx}. {result['title']}

{result['snippet']}

- **来源**: {result['source']}
- **链接**: {result['url']}

---

"""

output = OutputBuilder() \
    .set_markdown(markdown_content) \
    .set_title(f"搜索结果: {query}") \
    .add_skill("web-search") \
    .add_standard_metadata("query", query) \
    .add_standard_metadata("total_results", len(mock_results)) \
    .build()

return output
```

**测试要点**:
- [ ] 搜索功能正常
- [ ] 输出格式符合规范
- [ ] mixed/markdown 格式正确
- [ ] 元数据包含查询信息

---

## ✅ 验证清单

### 通用检查

- [ ] `output_schema` 已更新为标准格式
- [ ] handler.py 使用 OutputBuilder
- [ ] 所有文件路径相对于 outputs/ 目录
- [ ] 路径不包含 `outputs/` 前缀
- [ ] `result_type` 使用预定义枚举值
- [ ] `success` 字段正确设置
- [ ] `content` 格式与 `result_type` 匹配
- [ ] `metadata` 包含 `execution_time` 和 `skills_used`
- [ ] 错误处理使用 ErrorInfo 格式
- [ ] 通过验证工具检查

### 验证工具使用

```bash
# 保存测试输出
python skills/xxx/handler.py > test_output.json 2>&1

# 验证输出
python skills/schemas/scripts/validate_skill_output.py test_output.json

# 期望输出: ✅ 验证通过!输出格式符合规范。
```

---

## 🐛 常见问题和解决方案

### 问题 1: 路径包含 `outputs/` 前缀

**错误示例**:
```json
{
  "content": {
    "path": "outputs/infographics/q4.svg"
  }
}
```

**解决方案**:
使用 `get_relative_path()` 函数:
```python
from skills.lib.output_builder import get_relative_path

relative_path = get_relative_path(full_path)
# "infographics/q4.svg"
```

### 问题 2: 缺少必需字段

**错误示例**:
```json
{
  "result_type": "infographic",
  "success": true,
  "content": {...}
  // 缺少 metadata
}
```

**解决方案**:
确保使用 OutputBuilder.build(),它会自动添加 metadata:
```python
output = OutputBuilder() \
    .set_infographic(...) \
    .add_skill("skill-name") \  # 这会添加到 skills_used
    .build()  # 自动添加 execution_time
```

### 问题 3: result_type 不匹配

**错误示例**:
```json
{
  "result_type": "image",  // 应该是 infographic
  "success": true,
  "content": {
    "template": "column-chart",  // infographic 特有字段
    ...
  }
}
```

**解决方案**:
使用正确的 setter 方法:
```python
# 错误
OutputBuilder().set_media(MediaInfo(..., template="..."))

# 正确
OutputBuilder().set_infographic(..., template="...")
```

### 问题 4: 错误处理不符合规范

**错误示例**:
```json
{
  "success": false,
  "error": "Something went wrong"  // 应该是 content
}
```

**解决方案**:
使用 `set_error()` 方法:
```python
OutputBuilder().set_error(
    error=e,
    suggestions=["建议1", "建议2"]
).build()
```

---

## 📝 重构进度跟踪

### infographic-generator

- [ ] 备份原文件
- [ ] 更新 skill.yaml
- [ ] 更新 handler.py
- [ ] 运行测试
- [ ] 验证输出
- [ ] 提交更改

### remotion-generator

- [ ] 备份原文件
- [ ] 更新 skill.yaml
- [ ] 更新 handler.py
- [ ] 运行测试
- [ ] 验证输出
- [ ] 提交更改

### code-analysis

- [ ] 备份原文件
- [ ] 更新 skill.yaml
- [ ] 更新 analyzer.py
- [ ] 运行测试
- [ ] 验证输出
- [ ] 提交更改

### web-search

- [ ] 备份原文件
- [ ] 更新 skill.yaml
- [ ] 更新 handler.py
- [ ] 运行测试
- [ ] 验证输出
- [ ] 提交更改

---

## 🎯 下一步

完成所有 skill 重构后:

1. **运行完整测试套件**
   ```bash
   # 测试所有 skill
   npm run test:skills
   ```

2. **验证所有输出**
   ```bash
   # 批量验证
   for skill in infographic-generator remotion-generator code-analysis web-search; do
       python skills/schemas/scripts/validate_skill_output.py \
           skills/$skill/test_output.json
   done
   ```

3. **更新文档**
   - 更新 PHASE2_SUMMARY.md
   - 记录遇到的问题和解决方案

4. **进入 Phase 3**
   - 开始前端开发
   - 实现 Next.js 项目

---

**维护者**: Motia Development Team
**最后更新**: 2025-01-15
