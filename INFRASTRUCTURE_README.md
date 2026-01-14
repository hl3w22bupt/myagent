# Infographic Generator Skill

基于 AntV Infographic 的自动信息图生成技能。

## 功能

- 自动内容分析和类型识别
- 智能模板推荐
- 自动配色和主题生成
- HTML 和 SVG 导出
- 支持7种内容类型：sequence、list、compare、hierarchy、chart、quadrant、relation

## 使用方法

```python
from skills.infographic_generator import generate_infographic

result = await generate_infographic({
    "content": "展示软件开发流程：需求分析 → 设计 → 开发 → 测试 → 部署",
    "theme": "tech",
    "export_format": "both"
})

if result["success"]:
    print(f"HTML: {result['html_path']}")
    print(f"SVG: {result['svg_path']}")
```

## 依赖项

- Playwright (用于 SVG 导出)
- 无需额外依赖，使用纯 Python 实现

## 文件结构

```
skills/infographic-generator/
├── SKILL.md              # 技能定义
├── skill.yaml            # 技能配置
├── handler.py            # 主处理器
├── generators/            # 生成器模块
│   ├── content_analyzer.py
│   ├── dsl_generator.py
│   └── template_matcher.py
├── lib/                 # 工具库
│   ├── palettes.py
│   ├── templates.py
│   ├── icons.py
│   └── utils.py
├── prompts/             # Prompt 模板
│   └── generate.md
└── template/            # 渲染模板
    └── package.json
```

## 测试

```bash
python3 test_infographic.py
```

## 特性

- 支持6种预设主题
- 支持4种视觉风格
- 智能图标选择
- 多语言支持（中文/英文）
- 自动内容类型识别

## 下一步

- 添加 LLM 集成以改进内容分析
- 实现更多模板类型
- 添加自定义模板支持
- 优化 SVG 导出性能
