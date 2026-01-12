# Infographic Generator Skill

Generate beautiful infographics using AntV Infographic from natural language descriptions.

## Usage

### Basic Example

```python
from skills.infographic_generator import generate_infographic

result = await generate_infographic({
    "content": "展示软件开发流程：需求分析 → 设计 → 开发 → 测试 → 部署"
})
```

### With Custom Options

```python
result = await generate_infographic({
    "content": "对比 React 和 Vue 的优缺点",
    "theme": "tech",
    "style": "rough",
    "width": 1920,
    "height": 1080,
    "export_format": "svg"
})
```

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|-------|----------|----------|-------------|
| `content` | string | ✅ | - | Natural language description of the infographic |
| `language` | string | ❌ | `auto` | Content language (auto, zh, en) |
| `preferred_template` | string | ❌ | - | Specific template to use |
| `theme` | string | ❌ | `auto` | Color palette theme |
| `style` | string | ❌ | `auto` | Visual style |
| `width` | number | ❌ | `1920` | Canvas width in pixels |
| `height` | number | ❌ | `1080` | Canvas height in pixels |
| `export_format` | string | ❌ | `both` | Output format (html, svg, both) |

## Output

```python
{
    "success": True,
    "html_path": "/path/to/infographic.html",
    "svg_path": "/path/to/infographic.svg",
    "html_url": "http://localhost:3000/outputs/infographics/infographic.html",
    "svg_url": "http://localhost:3000/outputs/infographics/infographic.svg",
    "metadata": {
        "title": "软件开发流程",
        "template": "sequence-timeline-simple",
        "content_type": "sequence",
        "theme": ["#3b82f6", "#8b5cf6", "#10b981"],
        "style": "rough",
        "dimensions": {"width": 1920, "height": 1080},
        "generated_at": "2026-01-12T10:30:00Z"
    }
}
```

## Supported Content Types

- **sequence**: Steps, processes, timelines, flows
- **list**: Feature lists, key points, collections
- **compare**: Comparisons, pros/cons, SWOT analysis
- **hierarchy**: Tree structures, organization charts
- **chart**: Data visualization, statistics, percentages
- **quadrant**: Matrix analysis, quadrants
- **relation**: Relationship maps, connections

## Available Themes

- `business`: Professional blue/purple colors
- `tech`: Cyan/purple/pink technology colors
- `nature`: Green/teal environmentally-friendly colors
- `warm`: Orange/red/yellow energetic colors
- `cool`: Blue/cyan calm colors
- `monochrome`: Gray scale professional colors

## Available Styles

- `rough`: Hand-drawn sketch style
- `pattern`: Pattern-based design
- `linear-gradient`: Smooth gradient backgrounds
- `radial-gradient`: Radial gradient effects

## Setup

### Install Dependencies

```bash
cd skills/infographic-generator
npm install
```

This will install:
- `@antv/infographic` - Core infographic library
- `puppeteer` - Headless browser for SVG export

### Verify Installation

```bash
python -c "from skills.infographic_generator import generate_infographic; print('OK')"
```

## Templates

The skill automatically selects the best template based on content type. Common templates include:

**Sequence/Flow:**
- `sequence-timeline-simple`
- `sequence-zigzag-steps-underline-text`
- `sequence-horizontal-zigzag-simple`

**List/Collection:**
- `list-row-horizontal-icon-arrow`
- `list-column-vertical-icon-arrow`
- `list-grid-badge-card`

**Compare:**
- `compare-binary-horizontal-simple-fold`
- `compare-swot`

**Hierarchy:**
- `hierarchy-tree-tech-style-capsule-item`
- `hierarchy-tree-curved-line-rounded-rect-node`

**Chart:**
- `chart-pie-donut-pill-badge`
- `chart-column-simple`
- `chart-bar-plain-text`

## Error Handling

The skill provides detailed error messages:

```python
{
    "success": False,
    "error": "Content analysis failed: confidence too low",
    "error_type": "AnalysisError"
}
```

## Performance

- **Analysis**: < 3s
- **Generation**: < 5s
- **Rendering**: < 10s
- **Total**: < 20s (typical)

## License

MIT
