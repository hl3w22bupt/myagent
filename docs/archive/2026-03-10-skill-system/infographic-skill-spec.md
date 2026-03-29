# Infographic Skill - 实现规范文档

## 📋 项目概述

**目标**：实现一个基于 AntV Infographic 的自动生成 skill，能够将文本内容转换为美观的信息图并直接导出 SVG。

**参考架构**：Remotion Generator Skill + AntV Infographic 官方 Skills

---

## 🎯 核心需求

### 功能需求
1. **全场景支持**：数据可视化、流程展示、对比分析、层级结构
2. **自动生成**：完全自动化，无需用户干预
3. **直接导出**：生成 HTML 文件的同时直接输出 SVG 文件
4. **智能推荐**：基于内容自动选择模板、配色和布局

### 非功能需求
1. **可靠性**：两阶段生成确保准确性
2. **可扩展性**：模块化设计，易于添加新模板和功能
3. **性能**：优化生成速度，支持缓存

---

## 🏗️ 架构设计

### 总体架构

```
用户输入
    ↓
[阶段 1: 内容分析]
    ├── LLM 分析内容结构
    ├── 提取关键信息（标题、数据项、关系）
    ├── 智能选择模板类型
    └── 生成数据结构 JSON
    ↓
[阶段 2: 生成执行]
    ├── 根据数据结构生成 Infographic DSL
    ├── 自动选择主题和配色
    ├── 生成完整 HTML 文件
    └── 服务端渲染并导出 SVG
    ↓
[输出]
    ├── HTML 文件（可预览）
    └── SVG 文件（可直接使用）
```

### 核心组件

#### 1. Content Analyzer Step（内容分析器）
**职责**：
- 解析用户输入的文本内容
- 识别内容类型（sequence、list、compare、hierarchy、chart、quadrant、relation）
- 提取结构化数据
- 推荐最佳模板

**输入**：
```typescript
interface AnalyzerInput {
  content: string; // 用户的文本描述
  language: string; // 内容语言（中文/英文）
  context?: {
    preferredTemplate?: string; // 可选：用户指定的模板
    theme?: string; // 可选：主题偏好
  };
}
```

**输出**：
```typescript
interface AnalyzerOutput {
  contentType: 'sequence' | 'list' | 'compare' | 'hierarchy' | 'chart' | 'quadrant' | 'relation';
  recommendedTemplate: string;
  dataStructure: {
    title?: string;
    desc?: string;
    items: Array<{
      label?: string;
      value?: number;
      desc?: string;
      icon?: string;
      illus?: string;
      children?: any[];
    }>;
  };
  themeRecommendation: {
    palette: string[];
    style?: 'rough' | 'pattern' | 'linear-gradient' | 'radial-gradient';
    fontFamily?: string;
  };
  confidence: number; // 分析置信度 0-1
}
```

**核心逻辑**：
```typescript
// 示例：内容类型识别
function identifyContentType(content: string): ContentType {
  const keywords = {
    sequence: ['步骤', '流程', '阶段', 'step', 'process', 'phase', 'timeline', '时间线'],
    list: ['要点', '列表', '特性', 'features', 'list', 'points'],
    compare: ['对比', '比较', '优缺点', 'vs', 'compare', 'pros and cons'],
    hierarchy: ['结构', '架构', '层级', 'organization', 'structure', 'hierarchy'],
    chart: ['数据', '统计', '占比', 'data', 'statistics', 'chart'],
    quadrant: ['矩阵', '象限', 'quadrant', 'matrix'],
    relation: ['关系', '关联', 'relation', 'connection']
  };

  // 基于 LLM 的语义分析
  // 返回最匹配的内容类型
}
```

#### 2. Template Recommender（模板推荐器）
**职责**：
- 根据内容类型和数据结构推荐最合适的模板
- 提供多个备选方案（主推荐 + 2个备选）

**推荐规则**：
```typescript
const templateRules = {
  sequence: {
    strictOrder: ['sequence-zigzag-steps-underline-text', 'sequence-horizontal-zigzag-simple'],
    timeline: ['sequence-timeline-simple', 'sequence-timeline-rounded-rect-node'],
    roadmap: ['sequence-roadmap-vertical-simple', 'sequence-snake-steps-underline-text'],
    ascending: ['sequence-ascending-steps', 'sequence-stairs-front-compact-card']
  },
  list: {
    horizontal: ['list-row-horizontal-icon-arrow', 'list-row-simple-illus'],
    vertical: ['list-column-vertical-icon-arrow', 'list-column-done-list'],
    grid: ['list-grid-badge-card', 'list-grid-candy-card-lite']
  },
  compare: {
    binary: ['compare-binary-horizontal-simple-fold', 'compare-binary-horizontal-badge-card-arrow'],
    swot: ['compare-swot']
  },
  hierarchy: {
    tree: ['hierarchy-tree-tech-style-capsule-item', 'hierarchy-tree-curved-line-rounded-rect-node'],
    structure: ['hierarchy-structure']
  },
  chart: {
    column: ['chart-column-simple'],
    bar: ['chart-bar-plain-text'],
    pie: ['chart-pie-donut-pill-badge', 'chart-pie-plain-text'],
    line: ['chart-line-plain-text']
  },
  quadrant: {
    simple: ['quadrant-quarter-simple-card'],
    circular: ['quadrant-quarter-circular']
  },
  relation: {
    circle: ['relation-circle-icon-badge', 'relation-circle-circular-progress']
  }
};
```

#### 3. Theme Generator（主题生成器）
**职责**：
- 基于内容语义自动生成配色方案
- 支持多种视觉风格（rough、pattern、gradient）

**配色算法**：
```typescript
interface ThemeConfig {
  palette: string[]; // 3-5 个颜色
  style?: 'rough' | 'pattern' | 'linear-gradient' | 'radial-gradient';
  fontFamily?: string;
}

// 预设配色方案库
const colorPalettes = {
  business: ['#3b82f6', '#8b5cf6', '#f97316', '#10b981'], // 商务
  tech: ['#06b6d4', '#8b5cf6', '#ec4899', '#6366f1'], // 科技
  nature: ['#22c55e', '#84cc16', '#14b8a6', '#0ea5e9'], // 自然
  warm: ['#f97316', '#ef4444', '#eab308', '#f59e0b'], // 温暖
  cool: ['#3b82f6', '#0ea5e9', '#06b6d4', '#6366f1'], // 冷静
  monochrome: ['#1f2937', '#4b5563', '#9ca3af', '#d1d5db'] // 单色
};

// 基于内容关键词推荐配色
function recommendPalette(content: string): string[] {
  const keywords = {
    business: ['商业', '业务', '企业', 'business', 'corporate'],
    tech: ['技术', '科技', 'AI', 'tech', 'technology'],
    nature: ['环保', '自然', '绿色', 'eco', 'nature'],
    // ...
  };

  // 分析并返回最合适的配色
}
```

#### 4. DSL Generator（DSL 生成器）
**职责**：
- 将数据结构转换为 AntV Infographic DSL 语法
- 确保语法正确性和完整性

**示例输出**：
```plain
infographic list-row-horizontal-icon-arrow
data
title 互联网技术演进
desc 从 Web 1.0 到 AI 时代的关键里程碑
items
- time 1991
label Web 1.0
desc Tim Berners-Lee 发布第一个网站
icon mdi/web
- time 2004
label Web 2.0
desc 社交媒体和用户生成内容成为主流
icon mdi/account-multiple
theme
palette #3b82f6 #8b5cf6 #f97316
```

#### 5. HTML Renderer & SVG Exporter（HTML 渲染器与 SVG 导出器）
**职责**：
- 生成完整的 HTML 文件
- 使用 Puppeteer/Playwright 在服务端渲染
- 直接导出 SVG 文件

**技术方案**：
```typescript
// 方案 A：使用 Puppeteer（推荐）
import puppeteer from 'puppeteer';

async function exportToSVG(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  // 等待 Infographic 渲染完成
  await page.waitForSelector('#container canvas');

  // 提取 SVG 数据
  const svgData = await page.evaluate(() => {
    const infographic = (window as any).infographic;
    return infographic.toDataURL({ type: 'svg' });
  });

  // 保存 SVG 文件
  const base64Data = svgData.replace(/^data:image\/svg\+xml;base64,/, '');
  await fs.writeFile(outputPath, base64Data, 'base64');

  await browser.close();
}

// 方案 B：使用 @antv/infographic 的 Node.js API（如果支持）
import { Infographic } from '@antv/infographic';

async function generateSVG(dsl: string, outputPath: string): Promise<void> {
  const infographic = new Infographic({
    container: { width: 1920, height: 1080 },
    dsl: dsl
  });

  await infographic.render();
  const svg = await infographic.toSVG();
  await fs.writeFile(outputPath, svg);
}
```

---

## 📁 文件结构

```
.claude/
└── skills/
    └── infographic-generator/
        ├── SKILL.md                    # Skill 定义
        └── templates/
            ├── prompt-template.md      # 主 prompt 模板
            ├── analysis-template.md    # 分析阶段 prompt
            └── generation-template.md  # 生成阶段 prompt

src/
└── skills/
    └── infographic-generator/
        ├── index.ts                    # Skill 入口
        ├── steps/
        │   ├── content-analyzer.step.ts      # 内容分析步骤
        │   ├── template-recommender.step.ts  # 模板推荐步骤
        │   ├── theme-generator.step.ts       # 主题生成步骤
        │   ├── dsl-generator.step.ts         # DSL 生成步骤
        │   └── renderer.step.ts              # 渲染和导出步骤
        ├── lib/
        │   ├── templates.ts                 # 模板定义库
        │   ├── palettes.ts                  # 配色方案库
        │   ├── icons.ts                     # Icon 映射
        │   ├── utils.ts                     # 工具函数
        │   └── validator.ts                 # DSL 验证器
        ├── prompts/
        │   ├── analyze.ts                   # 分析阶段 prompt
        │   └── generate.ts                  # 生成阶段 prompt
        └── types/
            └── index.ts                     # TypeScript 类型定义
```

---

## 🔄 工作流程

### 完整流程

```typescript
// 用户输入
const userInput = "创建一个展示软件开发流程的信息图，包括需求分析、设计、开发、测试、部署这5个阶段";

// 1. 内容分析阶段
const analysis = await analyzeContent(userInput);
/*
输出：
{
  contentType: 'sequence',
  recommendedTemplate: 'sequence-timeline-simple',
  dataStructure: {
    title: '软件开发流程',
    desc: '从需求到部署的完整流程',
    items: [
      { label: '需求分析', icon: 'mdi/clipboard-text' },
      { label: '设计', icon: 'mdi/pencil-ruler' },
      { label: '开发', icon: 'mdi/code-tags' },
      { label: '测试', icon: 'mdi/test-tube' },
      { label: '部署', icon: 'mdi/rocket-launch' }
    ]
  },
  themeRecommendation: {
    palette: ['#3b82f6', '#8b5cf6', '#10b981', '#f97316'],
    style: 'rough'
  }
}
*/

// 2. DSL 生成阶段
const dsl = await generateDSL(analysis);
/*
输出：
infographic sequence-timeline-simple
theme
stylize rough
palette
- #3b82f6
- #8b5cf6
- #10b981
- #f97316
data
title 软件开发流程
desc 从需求到部署的完整流程
items
- label 需求分析
icon mdi/clipboard-text
- label 设计
icon mdi/pencil-ruler
- label 开发
icon mdi/code-tags
- label 测试
icon mdi/test-tube
- label 部署
icon mdi/rocket-launch
*/

// 3. 渲染和导出阶段
const { htmlPath, svgPath } = await renderAndExport(dsl, analysis.dataStructure.title);
/*
输出：
{
  htmlPath: '/output/software-development-process.html',
  svgPath: '/output/software-development-process.svg'
}
*/
```

### 错误处理和 Fallback

```typescript
// Fallback 策略
const fallbackStrategy = {
  lowConfidence: async (analysis: AnalyzerOutput) => {
    // 置信度 < 0.7 时，询问用户确认
    return await askUserConfirmation(analysis);
  },
  renderError: async (error: Error, dsl: string) => {
    // 渲染失败时，提供简化的 HTML 模板
    return generateSimpleHTML(dsl);
  },
  noMatchTemplate: async (contentType: string) => {
    // 没有匹配模板时，使用默认模板
    return getDefaultTemplate(contentType);
  }
};
```

---

## 🎨 Prompt 设计

### 分析阶段 Prompt

```markdown
# Role
你是一个信息图内容分析专家，擅长理解文本内容并提取结构化数据。

# Task
分析用户输入的内容，提取关键信息并推荐最合适的信息图模板。

# Input Content
{{content}}

# Analysis Steps

1. **识别内容类型**
   从以下类型中选择最匹配的一个：
   - sequence: 严格的顺序、步骤、时间线、发展历程
   - list: 观点列表、要点、特性集合
   - compare: 对比两个方案、优缺点分析、SWOT分析
   - hierarchy: 树形结构、组织架构、分类体系
   - chart: 数据统计、占比、趋势图
   - quadrant: 矩阵分析、象限图
   - relation: 关系展示、关联图

2. **提取数据结构**
   - title: 简洁的标题（不超过20字）
   - desc: 简短描述（不超过50字）
   - items: 数据项数组
     * label: 标签/名称
     * value: 数值（仅 chart 类型需要）
     * desc: 说明文字
     * icon: 推荐的 icon（从 Iconify 选择）
     * children: 子项（仅 hierarchy 类型需要）

3. **推荐模板**
   基于内容类型和数据特征，推荐最合适的模板：
   - strict sequence → sequence-timeline-simple, sequence-zigzag-steps-underline-text
   - timeline → sequence-timeline-simple, sequence-timeline-rounded-rect-node
   - comparison → compare-binary-horizontal-simple-fold, compare-swot
   - hierarchy → hierarchy-tree-tech-style-capsule-item, hierarchy-structure
   - data chart → chart-pie-donut-pill-badge, chart-column-simple

4. **推荐配色方案**
   基于内容语义选择配色：
   - 商务/企业 → business palette
   - 技术/AI → tech palette
   - 环保/自然 → nature palette
   - 其他 → cool palette

# Output Format
返回 JSON 格式：
```json
{
  "contentType": "sequence|list|compare|hierarchy|chart|quadrant|relation",
  "recommendedTemplate": "template-name",
  "alternativeTemplates": ["template-1", "template-2"],
  "dataStructure": {
    "title": "标题",
    "desc": "描述",
    "items": [...]
  },
  "themeRecommendation": {
    "palette": ["#color1", "#color2", "#color3"],
    "style": "rough|pattern|linear-gradient",
    "fontFamily": "851tegakizatsu|null"
  },
  "confidence": 0.9,
  "reasoning": "推荐理由"
}
```

# Important Notes
- 必须保持用户输入的语言（中文/英文）
- icon 选择要符合语义，使用 "mdi/collection-name" 格式
- 置信度低于 0.7 时，在 reasoning 中说明不确定性
```

### 生成阶段 Prompt

```markdown
# Role
你是一个 AntV Infographic DSL 生成专家，擅长将结构化数据转换为 Infographic 语法。

# Task
基于分析结果，生成符合 AntV Infographic 规范的 DSL 语法。

# Analysis Result
{{analysisResult}}

# DSL Generation Rules

1. **基本结构**
   - 第一行：`infographic {template-name}`
   - 数据块：使用 `data` 关键字，2空格缩进
   - 主题块：使用 `theme` 关键字，2空格缩进

2. **数据块格式**
   ```
   data
   title {title}
   desc {desc}
   items
   - label {label}
   desc {desc}
   icon {icon}
   value {value}  # 仅 chart 类型
   ```

3. **主题块格式**
   ```
   theme
   palette
   - {color1}
   - {color2}
   stylize {style}
   ```

4. **特殊类型规则**
   - compare: 必须有2个根节点，所有对比项作为 children
   - hierarchy: items 从上到下渲染，最多3层
   - chart: 必须包含 value 字段

# Output Format
直接输出 DSL 语法，不要代码块标记：

```
infographic {template-name}
data
title {title}
desc {desc}
items
- label {label}
...
theme
palette
- {color1}
- {color2}
```

# Examples

输入：流程图数据
输出：
```
infographic sequence-timeline-simple
theme
stylize rough
palette
- #3b82f6
- #8b5cf6
data
title 软件开发流程
desc 从需求到部署的完整流程
items
- label 需求分析
icon mdi/clipboard-text
- label 设计
icon mdi/pencil-ruler
- label 开发
icon mdi/code-tags
```
```

---

## 🧪 测试策略

### 测试用例

```typescript
const testCases = [
  {
    name: 'Sequence - 流程图',
    input: '展示用户注册流程：填写信息 → 邮箱验证 → 完成注册',
    expected: {
      contentType: 'sequence',
      template: 'sequence-horizontal-zigzag-simple',
      itemsCount: 3
    }
  },
  {
    name: 'Compare - 优缺点对比',
    input: '对比 React 和 Vue 的优缺点',
    expected: {
      contentType: 'compare',
      template: 'compare-binary-horizontal-simple-fold',
      itemsCount: 2
    }
  },
  {
    name: 'Chart - 饼图',
    input: '展示市场份额：Apple 30%, Samsung 25%, Xiaomi 20%, Others 25%',
    expected: {
      contentType: 'chart',
      template: 'chart-pie-plain-text',
      hasValues: true
    }
  },
  {
    name: 'Hierarchy - 组织架构',
    input: '公司组织架构：CEO → 技术/市场/财务部门',
    expected: {
      contentType: 'hierarchy',
      template: 'hierarchy-tree-tech-style-capsule-item',
      maxDepth: 2
    }
  }
];
```

---

## 📦 依赖项

```json
{
  "dependencies": {
    "@antv/infographic": "latest",
    "puppeteer": "^21.0.0",
    "cheerio": "^1.0.0-rc.12"
  },
  "devDependencies": {
    "@types/puppeteer": "^21.0.0"
  }
}
```

---

## 🚀 实现优先级

### Phase 1: 核心功能（MVP）
- [x] Content Analyzer - 内容分析和结构提取
- [x] DSL Generator - 基础 DSL 生成
- [x] HTML Renderer - 生成 HTML 文件
- [ ] SVG Exporter - 服务端导出 SVG

### Phase 2: 智能增强
- [ ] Template Recommender - 智能模板推荐
- [ ] Theme Generator - 自动主题生成
- [ ] Icon Mapper - 智能 icon 匹配

### Phase 3: 高级功能
- [ ] Multi-language Support - 多语言支持
- [ ] Custom Templates - 自定义模板
- [ ] Batch Generation - 批量生成
- [ ] API Integration - 对外 API

---

## 📊 性能指标

- **分析准确率**：> 90%（内容类型识别准确率）
- **渲染成功率**：> 95%（HTML 和 SVG 导出成功率）
- **响应时间**：
  - 分析阶段：< 3s
  - 生成阶段：< 5s
  - 渲染导出：< 10s
- **并发支持**：支持 10+ 并发请求

---

## 🔐 安全考虑

1. **输入验证**：限制输入内容长度（< 5000 字符）
2. **资源控制**：限制渲染超时（30s）
3. **文件安全**：生成的文件存储在隔离目录
4. **XSS 防护**：输出的 HTML 进行转义处理

---

## 📚 参考资料

- [AntV Infographic 官方文档](https://infographic.antv.vision/)
- [AntV Infographic GitHub](https://github.com/antvis/Infographic)
- [Remotion Generator Skill](../../docs/design/remotion-llm-generator.md)
- [Iconify Icon Sets](https://icon-sets.iconify.design/)
- [unDraw Illustrations](https://undraw.co/illustrations)

---

## ✅ 验收标准

1. **功能完整性**：支持所有内容类型（sequence、list、compare、hierarchy、chart、quadrant、relation）
2. **自动化程度**：完全自动化，无需用户手动指定模板
3. **输出质量**：生成的 HTML 可直接在浏览器中打开，SVG 可直接使用
4. **易用性**：提供清晰的使用文档和示例
5. **稳定性**：错误处理完善，失败率 < 5%

---

**文档版本**：v1.0
**最后更新**：2025-01-12
**作者**：Claude Code + SuperClaude Brainstorm
