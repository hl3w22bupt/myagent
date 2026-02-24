# Infographic Generator - LLM Content Refinement

## 新增功能

### LLM 内容润色

现在 `infographic-generator` skill 包含了一个基于 LLM 的内容润色器，可以智能地优化用户输入，生成更适合信息图展示的内容结构。

#### 主要能力

1. **智能内容分类**
   - 自动识别内容类型（sequence/list/compare/chart/hierarchy/quadrant/relation）
   - 根据内容类型推荐最合适的模板

2. **标题优化**
   - 移除 "生成"、"创建"、"展示" 等动作动词
   - 提炼核心主题，生成简洁有力的标题

3. **项目结构化**
   - 将原始内容拆分为清晰的、易于浏览的项目
   - 每个项目包含简短标签（最多 20 字符）和可选描述（最多 50 字符）
   - 提取数值数据用于图表展示

4. **智能图标推荐**
   - 从 Material Design Icons 中选择语义相关的图标
   - 根据项目内容自动匹配合适的图标

5. **主题和风格建议**
   - 根据内容主题推荐合适的配色方案
   - 选择与内容气质匹配的视觉风格

#### 使用方式

```python
from skills.infographic_generator import generate_infographic

# 默认启用 LLM 润色
result = await generate_infographic({
    "content": "软件开发流程包括：需求分析、系统设计、编码实现、测试验证、部署上线"
})

# 禁用 LLM 润色（使用规则基础提取）
result = await generate_infographic({
    "content": "简单的列表展示",
    "use_llm_refinement": False
})
```

#### 配置

- **环境变量**: `ANTHROPIC_API_KEY` - LLM API 密钥（未设置时自动降级到规则基础模式）
- **模型选择**: `INFOGRAPHIC_LLM_MODEL` - 指定使用的模型（默认：claude-sonnet-4-5）

#### 降级策略

当 LLM 不可用时（如未设置 API Key），系统会自动降级到规则基础的提取模式，保证功能可用性。

## 文件结构

```
skills/infographic-generator/
├── generators/
│   ├── content_refiner.py      # LLM 内容润色器（新增）
│   ├── content_analyzer.py     # 基础内容分析器
│   ├── dsl_generator.py        # DSL 生成器
│   └── template_matcher.py     # 模板匹配器
├── lib/
│   ├── utils.py                # 工具函数（增强）
│   ├── templates.py            # 模板定义
│   ├── icons.py                # 图标映射
│   ├── palettes.py             # 配色方案
│   └── aspect_ratio.py         # 宽高比计算
├── prompts/
│   └── refine.md               # LLM 润色提示词模板（新增）
├── handler.py                  # 主处理器（已更新）
├── skill.yaml                  # Skill 配置（已更新）
├── SKILL.md                    # 文档（已更新）
└── test_content_refiner.py    # 测试脚本（新增）
```

## 测试

运行测试脚本验证功能：

```bash
python skills/infographic-generator/test_content_refiner.py
```

测试用例包括：
- 简单列表（中文）
- 顺序过程（中文）
- 对比内容（英文）
- 数据统计（含百分比）
- 多行复杂输入
- 时间线路线图

## 示例

### 输入
```
"生成一个信息图展示编程学习路线：1. 基础语法 2. 数据结构 3. 算法 4. 框架学习 5. 项目实战"
```

### LLM 润色后
```json
{
  "title": "编程学习路线",
  "description": "从零基础到实战项目的完整学习路径",
  "content_type": "sequence",
  "recommended_template": "sequence-horizontal-zigzag-underline-text",
  "items": [
    {"label": "基础语法", "description": "掌握语言核心语法", "icon": "mdi/code-tags"},
    {"label": "数据结构", "description": "理解常用数据结构", "icon": "mdi/database"},
    {"label": "算法", "description": "学习基础算法思想", "icon": "mdi-brain"},
    {"label": "框架学习", "description": "掌握主流开发框架", "icon": "mdi-view-dashboard"},
    {"label": "项目实战", "description": "完成真实项目开发", "icon": "mdi-rocket-launch"}
  ],
  "suggested_theme": "tech",
  "suggested_style": "rough"
}
```

## 待优化

1. **Few-Shot 示例**: 在 prompt 中添加更多 Few-Shot 示例提高一致性
2. **模板细化**: 根据更多场景细化模板推荐逻辑
3. **多语言支持**: 增强对多语言输入的处理能力
4. **性能优化**: 缓存常见内容的润色结果
