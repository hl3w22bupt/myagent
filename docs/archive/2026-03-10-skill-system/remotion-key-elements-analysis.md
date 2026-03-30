# Remotion视频生成关键要素与LLM生成能力分析

## 📋 文档信息

- **版本**: v1.0
- **创建日期**: 2025-01-12
- **目的**: 分析Remotion视频的关键要素，评估LLM生成能力

---

## 1. Remotion视频关键要素完整清单

### 1.1 核心结构要素

```typescript
// Remotion视频的骨架结构
import {
  Composition,        // 必需：定义视频组成
  AbsoluteFill,       // 常用：全屏容器
  registerRoot        // 必需：注册根组件
} from 'remotion';

// 基本结构
export const Root: React.FC = () => {
  return (
    <Composition
      id="VideoId"              // ✅ 关键要素 #1: Composition ID
      component={MyComponent}   // ✅ 关键要素 #2: 主组件
      durationInFrames={300}    // ✅ 关键要素 #3: 总帧数
      fps={30}                  // ✅ 关键要素 #4: 帧率
      width={1920}              // ✅ 关键要素 #5: 宽度
      height={1080}             // ✅ 关键要素 #6: 高度
      defaultProps={{           // ✅ 关键要素 #7: 默认属性
        title: "Hello"
      }}
    />
  );
};

registerRoot(Root);  // ✅ 关键要素 #8: 注册根组件
```

### 1.2 时间控制要素

```typescript
import {
  useCurrentFrame,      // ✅ 关键要素 #9: 当前帧
  useVideoConfig,       // ✅ 关键要素 #10: 视频配置
  interpolate,          // ✅ 关键要素 #11: 线性插值
  spring,               // ✅ 关键要素 #12: 弹性动画
  AoConfig,             // ✅ 关键要素 #13: 音频配置
  continueRender        // ✅ 关键要素 #14: 渲染控制
} from 'remotion';

// 时间管理示例
const MyComponent: React.FC<Props> = ({ title }) => {
  const frame = useCurrentFrame();              // 当前帧号
  const { durationInFrames, fps } = useVideoConfig(); // 视频配置

  // 动画计算
  const opacity = interpolate(
    frame,                    // 输入：当前帧
    [0, 30],                  // 输入范围
    [0, 1],                   // 输出范围
    { extrapolateRight: 'clamp' }  // 配置
  );

  return <div style={{ opacity }}>{title}</div>;
};
```

### 1.3 视觉呈现要素

```typescript
// ✅ 关键要素 #15: 样式系统
const styles = {
  // 布局
  layout: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute' as const,
  },

  // 排版
  typography: {
    fontSize: 64,
    fontWeight: 'bold',
    fontFamily: 'Arial, sans-serif',
    lineHeight: 1.2,
  },

  // 颜色
  colors: {
    background: '#ffffff',
    text: '#333333',
    accent: '#3B82F6',
  },

  // 动画
  animation: {
    transform: `scale(${scale})`,
    opacity,
  },
};

// ✅ 关键要素 #16: SVG图形
<svg width={400} height={400}>
  <circle
    cx={200}
    cy={200}
    r={radius}  // 动态属性
    fill="#3B82F6"
  />
</svg>

// ✅ 关键要素 #17: 数学公式渲染
const Formula: React.FC = () => {
  return (
    <div style={{ fontSize: 48 }}>
      <span>a</span><sup>2</sup>
      {' + '}
      <span>b</span><sup>2</sup>
      {' = '}
      <span>c</span><sup>2</sup>
    </div>
  );
};
```

### 1.4 场景序列要素

```typescript
// ✅ 关键要素 #18: 场景管理
const EducationalVideo: React.FC<Props> = ({ title }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 定义场景时间点
  const titleSceneEnd = Math.floor(durationInFrames * 0.2);      // 0-20%
  const contentSceneEnd = Math.floor(durationInFrames * 0.7);    // 20-70%
  const summarySceneEnd = durationInFrames;                       // 70-100%

  // 确定当前场景
  const currentScene =
    frame < titleSceneEnd ? 'title' :
    frame < contentSceneEnd ? 'content' :
    'summary';

  // 场景切换逻辑
  const renderScene = () => {
    switch (currentScene) {
      case 'title':
        return <TitleScene {...{title}} />;
      case 'content':
        return <ContentScene />;
      case 'summary':
        return <SummaryScene />;
    }
  };

  return (
    <AbsoluteFill>
      {renderScene()}
    </AbsoluteFill>
  );
};
```

### 1.5 动画曲线要素

```typescript
// ✅ 关键要素 #19: 动画缓动函数
import {
  interpolate,
  spring,
  TimingConfig,
  SpringConfig
} from 'remotion';

// 线性插值（用于透明度、位置等）
const fadeIn = interpolate(
  frame,
  [0, 30],
  [0, 1],
  {
    extrapolateRight: 'clamp'  // 限制范围
  }
);

// 弹性动画（用于缩放、旋转等）
const bounce = spring({
  frame: frame - 10,
  fps: 30,
  config: {
    damping: 15,      // 阻尼（越小越弹）
    stiffness: 200,   // 刚度（越大越快）
    mass: 1,          // 质量（影响惯性）
  }
});

// ✅ 关键要素 #20: 自定义缓动函数
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
```

---

## 2. LLM生成能力评估矩阵

### 2.1 完整评估表

| 要素类别 | 具体要素 | LLM生成能力 | 可靠性 | 挑战 | 解决方案 |
|---------|---------|------------|--------|------|---------|
| **结构定义** | Composition配置 | ✅ 优秀 | 高 | 低 | 明确指定参数 |
| | 组件层次结构 | ✅ 优秀 | 高 | 中 | 提供结构模板 |
| | Props接口定义 | ✅ 良好 | 中 | 高 | TypeScript类型错误 |
| | registerRoot调用 | ✅ 优秀 | 高 | 低 | 固定模式 |
| **时间控制** | 帧数计算 | ✅ 优秀 | 高 | 低 | 简单数学 |
| | 场景分割逻辑 | ✅ 良好 | 中 | 中 | 百分比转换 |
| | interpolate调用 | ✅ 优秀 | 高 | 低 | 标准API |
| | spring配置 | ⚠️ 中等 | 低 | 高 | 参数调优困难 |
| **视觉呈现** | 颜色选择 | ⚠️ 中等 | 中 | 中 | 可能不协调 |
| | 字体排版 | ✅ 良好 | 中 | 低 | 基础样式 |
| | SVG图形绘制 | ⚠️ 困难 | 低 | **高** | 复杂几何计算 |
| | 数学公式渲染 | ❌ 困难 | 低 | **高** | Unicode/HTML实体 |
| **内容逻辑** | 教学流程设计 | ✅ 优秀 | 高 | 中 | LLM擅长逻辑 |
| | 概念解释准确性 | ✅ 优秀 | 高 | 低 | LLM擅长知识 |
| | 关键点提取 | ✅ 优秀 | 高 | 低 | 文本分析强 |
| | 多场景协调 | ✅ 良好 | 中 | 中 | 场景切换逻辑 |
| **动画效果** | 淡入淡出 | ✅ 优秀 | 高 | 低 | 简单插值 |
| | 滑动进入 | ✅ 优秀 | 高 | 低 | 线性插值 |
| | 缩放动画 | ✅ 良好 | 中 | 低 | spring配置 |
| | 路径动画 | ❌ 困难 | 低 | **高** | SVG路径计算 |
| **性能优化** | useMemo使用 | ⚠️ 中等 | 低 | 中 | 可能遗漏优化 |
| | 避免重复计算 | ⚠️ 中等 | 低 | 中 | 性能意识弱 |
| | 条件渲染优化 | ⚠️ 中等 | 低 | 低 | 简单场景OK |
| **类型安全** | TypeScript类型 | ⚠️ 良好 | 中 | 中 | 可能有类型错误 |
| | Props验证 | ✅ 良好 | 中 | 低 | 接口定义清晰 |
| | 泛型使用 | ⚠️ 中等 | 低 | 高 | 复杂类型困难 |

### 2.2 能力等级说明

- ✅ **优秀**: LLM可以可靠生成，无需人工干预
- ✅ **良好**: 大部分情况正确，偶尔需要调整
- ⚠️ **中等**: 能生成基本版本，需要优化
- ⚠️ **困难**: 能生成，但质量不稳定，需要大量调整
- ❌ **不适合**: 不建议LLM生成，应使用其他方案

---

## 3. 深度分析：高挑战要素

### 3.1 SVG图形绘制 ⚠️⚠️⚠️

**挑战等级**: 🔴 高

**为什么困难**:
```typescript
// LLM需要精确计算SVG坐标和路径
<svg viewBox="0 0 400 400">
  {/* 泰勒级数可视化：需要精确的曲线路径 */}
  <path
    d={`M ${startX} ${startY}
             Q ${controlX} ${controlY}
               ${endX} ${endY}`}
    stroke="#3B82F6"
    strokeWidth="3"
  />

  {/* 复杂的数学曲线：贝塞尔曲线点计算 */}
  {/* LLM难以理解：如何控制点决定曲线形状 */}
</svg>
```

**问题**:
1. 几何计算复杂（三角函数、导数等）
2. SVG路径语法不直观
3. 坐标系转换容易出错

**解决方案**:

#### 方案A: 预定义图形库（推荐）

```python
# generators/visualizations.py
VISUALIZATION_LIBRARY = {
    "taylor_series": {
        "type": "animated_curves",
        "svg_template": '''
<svg viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="curveGradient" ...>
    <clipPath id="curveClip" ...>
  </defs>

  {/* Grid background */}
  {grid_background}

  {/* Original function curve */}
  <path
    d="{original_curve_path}"
    stroke="{original_color}"
    strokeWidth="{stroke_width}"
    fill="none"
  />

  {/* Taylor approximation curves */}
  {approximation_curves}

  {/* Error area */}
  <path
    d="{error_area_path}"
    fill="{error_color}"
    opacity="0.3"
  />
</svg>
''',
        "params": {
            "original_curve_path": "computed_from_formula",
            "approximation_curves": "dynamic_generation",
            "error_area_path": "calculated_dynamically"
        }
    }
    ,
    "pythagorean_triangle": {
        "type": "static_geometry",
        "svg_template": '''...''',
        # 预定义好的三角形SVG
    },
    "derivative_tangent": {
        "type": "animated_line",
        "svg_template": '''...''',
    }
}
```

**优势**:
- ✅ 几何计算准确
- ✅ 视觉效果一致
- ✅ 易于维护

#### 方案B: LLM生成配置 + Python计算

```python
class HybridGenerator:
    """LLM生成意图，Python执行计算"""

    async def generate_visualization(self, analysis: Dict):
        # 1. LLM决定需要什么可视化
        viz_type = analysis["visualization"]["primary_visual"]

        # 2. LLM生成参数配置
        config = await self._llm_generate_config(analysis, viz_type)
        # config = {
        #     "num_points": 100,
        #     "x_range": [-2, 2],
        #     "function": "sin(x)",
        #     "show_tangent": True,
        #     "animation_frames": 60
        # }

        # 3. Python执行实际计算
        svg_code = self._compute_svg(config)

        return svg_code

    def _compute_svg(self, config: Dict) -> str:
        """使用Python数学库计算SVG路径"""
        import numpy as np

        x = np.linspace(config["x_range"][0],
                      config["x_range"][1],
                      config["num_points"])

        if config["function"] == "sin(x)":
            y = np.sin(x)
        elif config["function"] == "taylor_series":
            # 泰勒级数计算
            y = self._taylor_approximation(x, config["order"])

        # 生成SVG路径
        path_data = self._points_to_path(x, y)
        return f'<path d="{path_data}" ... />'
```

#### 方案C: 使用Remotion可视化库

```typescript
// 使用现成的可视化库
import {
  Line,
  Area,
  CartesianGrid
} from '@remotion/shapes';

// 或者专门的数学可视化库
import {
  FunctionGraph,
  TaylorSeriesVisualization
} from '@your-math-viz-lib';
```

### 3.2 数学公式渲染 ❌⚠️

**挑战等级**: 🔴 高

**为什么困难**:
```typescript
// LLM需要生成正确的HTML/Unicode
<div>
  {/* 泰勒公式 */}
  f(x) = f(a) + f'(a)(x-a) + f''(a)(x-a)²/2! + ...

  {/* LLM生成时可能出现的问题 */}
  ❌ f''(a)        // 缺少转义
  ❌ (x-a)²        // 应该是 <sup>2</sup>
  ❌ ∑             // 应该是 &sum; 或 Unicode
  ❌ ∫             // 应该是 &int; 或 Unicode
</div>
```

**解决方案**:

#### 方案A: 使用LaTeX渲染（推荐）

```python
# generators/formula_renderer.py
class FormulaRenderer:
    """将LaTeX转换为可渲染的SVG"""

    def render(self, latex: str) -> str:
        # 使用MathJax或KaTeX渲染
        import mathjax

        svg = mathjax.render_latex(latex, format="svg")
        return svg

# 使用示例
formula_renderer = FormulaRenderer()

# LLM只需要生成LaTeX（它擅长这个）
latex = r"f(x) = \sum_{n=0}^{\infty} \frac{f^{(n)}(a)}{n!} (x-a)^n"

# Python负责渲染
svg_formula = formula_renderer.render(latex)

# 嵌入到Remotion代码
remotion_code = f'''
const Formula = () => (
  <div dangerouslySetInnerHTML={{{{
    __html: `{svg_formula}`
  }}}} />
);
'''
```

**优势**:
- ✅ LLM擅长LaTeX（训练数据多）
- ✅ 渲染质量高
- ✅ 支持复杂公式

#### 方案B: 预定义公式组件

```typescript
// formulas/TaylorFormula.tsx
export const TaylorFormula: React.FC<{
  order?: number;
  showSummation?: boolean;
}> = ({ order = 3, showSummation = true }) => {
  return (
    <div style={{ fontSize: 48, fontFamily: 'Georgia, serif' }}>
      {showSummation && (
        <>
          f(x) = <Sum />
        </>
      )}
      <Term n={0} />
      {' + '}
      <Term n={1} />
      {' + '}
      <Term n={2} />
      {' + ...'}
    </div>
  );
};

// LLM只需要配置参数
const formulaConfig = {
  type: "taylor_series",
  order: 3,
  showSummation: true,
  highlightTerms: [0, 1, 2]
};
```

### 3.3 动画参数调优 ⚠️

**挑战等级**: 🟡 中

**问题**:
```typescript
// Spring参数需要经验
const bounce = spring({
  frame: frame - 10,
  fps: 30,
  config: {
    damping: 15,      // LLM难以选择合适的值
    stiffness: 200,
    mass: 1
  }
});

// 不合适的参数会导致：
# - 太弹：damping < 10
# - 太慢：stiffness < 100
# - 不自然：组合不当
```

**解决方案**:

#### 方案A: 预设动画库

```python
# generators/animation_presets.py
ANIMATION_PRESETS = {
    "fade_in": {
        "type": "interpolate",
        "config": {
            "range": [0, 30],
            "output": [0, 1],
            "extrapolate": "clamp"
        }
    },
    "bounce_in": {
        "type": "spring",
        "config": {
            "damping": 12,
            "stiffness": 200,
            "mass": 1
        }
    },
    "smooth_slide": {
        "type": "spring",
        "config": {
            "damping": 20,
            "stiffness": 100,
            "mass": 1
        }
    },
    "elastic_zoom": {
        "type": "spring",
        "config": {
            "damping": 8,
            "stiffness": 300,
            "mass": 0.5
        }
    }
}

# LLM只需要选择动画类型
animation = ANIMATION_PRESETS["bounce_in"]
```

#### 方案B: 语义化配置

```python
# LLM生成语义化描述，转换为技术参数
SEMANTIC_TO_TECHNICAL = {
    "gentle": {"damping": 25, "stiffness": 100},
    "bouncy": {"damping": 10, "stiffness": 200},
    "quick": {"damping": 15, "stiffness": 300},
    "smooth": {"damping": 20, "stiffness": 150},
}

# LLM输出
llm_output = {
    "animation": "gentle fade-in for title"
}

# 转换
animation_type = "fade_in"
feel = "gentle"
params = SEMANTIC_TO_TECHNICAL[feel]
```

---

## 4. 推荐的LLM生成策略

### 4.1 三层生成架构

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: LLM (高层决策)                                      │
│ • 内容分析（主题、结构、关键点）                              │
│ • 教学流程设计（场景序列、时间分配）                          │
│ • 可视化策略（图形类型、动画类型）                            │
│ • 文本内容（标题、解释、总结）                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: 规则引擎（中层转换）                                │
│ • LLM输出 → 技术配置                                          │
│ • 动画预设选择                                                │
│ • 颜色方案生成                                                │
│ • 参数映射（百分比 → 帧数）                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: 代码生成（底层实现）                                │
│ • 组装Remotion代码                                           │
│ • 插入预计算的可视化（SVG、公式）                             │
│ • 应用动画参数                                                │
│ • 类型检查和验证                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 LLM的能力边界

| 能力 | 边界 | 示例 |
|------|------|------|
| ✅ **擅长** | 文本生成、逻辑推理、结构设计 | 教学流程、场景划分、解释文本 |
| ⚠️ **中等** | 参数选择、颜色搭配 | 动画参数、配色方案 |
| ❌ **不擅长** | 几何计算、精确坐标、复杂动画 | SVG路径、贝塞尔曲线、三角函数 |

### 4.3 实际生成流程

```python
class SmartRemotionGenerator:
    """智能Remotion代码生成器"""

    async def generate(self, description: str) -> str:
        # Phase 1: LLM分析（高层决策）
        analysis = await self._llm_analyze(description)
        # analysis = {
        #     "topic": "泰勒公式",
        #     "scenes": [
        #         {"type": "title", "duration": "15%", "content": "..."},
        #         {"type": "concept", "duration": "30%", "content": "..."},
        #         {"type": "demonstration", "duration": "40%", "content": "..."},
        #         {"type": "summary", "duration": "15%", "content": "..."}
        #     ],
        #     "visualizations": ["curve_comparison", "formula_display", "error_graph"],
        #     "animations": ["fade_in", "slide_up", "smooth_zoom"]
        # }

        # Phase 2: 规则转换（中层转换）
        config = self._convert_to_config(analysis)
        # config = {
        #     "scenes": [
        #         {"startFrame": 0, "endFrame": 45, "component": "TitleScene", ...},
        #         {"startFrame": 45, "endFrame": 135, "component": "ConceptScene", ...},
        #         ...
        #     ],
        #     "visualizations": {
        #         "curve_comparison": self._get_curve_viz_code(),
        #         "formula_display": self._get_formula_viz_code(),
        #         "error_graph": self._get_error_viz_code()
        #     },
        #     "animations": {
        #         "fade_in": {"type": "interpolate", "range": [0, 30], ...},
        #         "slide_up": {"type": "spring", "config": {...}},
        #         "smooth_zoom": {"type": "spring", "config": {...}}
        #     }
        # }

        # Phase 3: 代码组装（底层实现）
        code = await self._assemble_code(config)

        return code

    def _get_curve_viz_code(self) -> str:
        """返回预计算的曲线可视化组件"""
        return '''
const CurveComparison: React.FC<{ progress: number }> = ({ progress }) => {
  // 预计算的SVG路径（Python生成）
  const originalPath = "M 0,200 Q 100,100 200,150 T 400,100";
  const taylorPath2 = "M 0,200 Q 100,180 200,170 T 400,150";
  const taylorPath3 = "M 0,200 Q 100,190 200,180 T 400,120";

  return (
    <svg viewBox="0 0 400 250">
      <path d={originalPath} stroke="#3B82F6" strokeWidth="3" fill="none"/>
      <path d={taylorPath2} stroke="#10B981" strokeWidth="3" fill="none"
            strokeDasharray={progress * 1000} strokeDashoffset={1000 * (1-progress)}/>
      <path d={taylorPath3} stroke="#F59E0B" strokeWidth="3" fill="none"
            strokeDasharray={progress * 1000} strokeDashoffset={1000 * (1-progress)}/>
    </svg>
  );
};
'''

    def _get_formula_viz_code(self) -> str:
        """返回预渲染的公式组件"""
        return '''
const TaylorFormula: React.FC = () => {
  return (
    <div style={{ fontSize: 56, fontFamily: 'Georgia, serif', color: '#1F2937' }}>
      <span>f(x)</span>
      <span style={{ margin: '0 16px' }}>=</span>
      <span>f(a)</span>
      <span> + </span>
      <span>f'(a)</span>
      <span>(x-a)</span>
      <span> + </span>
      <span>f''(a)</span>
      <span>(x-a)²/2!</span>
      <span> + ...</span>
    </div>
  );
};
'''
```

---

## 5. 具体实施建议

### 5.1 分阶段实施

#### Phase 1: 基础能力（Week 1）
**目标**: LLM生成基础结构

✅ LLM负责:
- Composition配置
- 场景划分逻辑
- 基础文本内容
- 简单的fade/slide动画

❌ 预定义组件:
- 标题组件
- 文本展示组件
- 基础背景

#### Phase 2: 智能增强（Week 2-3）
**目标**: 引入规则引擎

✅ LLM负责:
- 教学内容分析
- 可视化类型选择
- 动画效果选择

✅ 规则引擎负责:
- 动画参数映射
- 颜色方案生成
- 帧数计算

❌ 预定义组件:
- 通用公式展示器
- 基础图形容器

#### Phase 3: 高级可视化（Week 4-5）
**目标**: 复杂可视化支持

✅ LLM负责:
- 可视化意图描述
- 参数配置

✅ 规则引擎负责:
- Python数学计算
- SVG路径生成
- 公式LaTeX渲染

❌ 预定义组件:
- 泰勒级数可视化
- 导数切线动画
- 误差面积图

### 5.2 技术栈建议

```python
# 推荐技术栈
dependencies = {
    "LLM": "Anthropic Claude 3.5 Sonnet",  # 优秀的代码生成
    "数学计算": ["numpy", "scipy", "sympy"],  # 符号计算
    "公式渲染": ["katex", "mathjax"],  # LaTeX → SVG
    "可视化": ["d3.js", "victory"],  # 可选：高级图表
}

# 开发工具
dev_tools = {
    "TypeScript": "类型检查",
    "ESLint": "代码质量",
    "Prettier": "代码格式化",
}
```

---

## 6. 总结：关键要素生成策略

### 6.1 LLM生成的黄金法则

| 要素类型 | 生成策略 | 成功率 |
|---------|---------|--------|
| **结构性代码** | 直接LLM生成 | 95% |
| **业务逻辑** | 直接LLM生成 | 90% |
| **文本内容** | 直接LLM生成 | 98% |
| **简单动画** | LLM + 预设库 | 85% |
| **颜色方案** | LLM + 规则引擎 | 80% |
| **复杂动画** | 预设库 + 参数化 | 90% |
| **SVG图形** | 预计算 + Python生成 | 95% |
| **数学公式** | LaTeX + 渲染器 | 98% |
| **几何计算** | Python数学库 | 100% |

### 6.2 最佳实践

✅ **DO**:
1. 让LLM专注于它擅长的（逻辑、结构、文本）
2. 对精确计算使用Python/数学库
3. 为复杂可视化提供预定义模板
4. 使用规则引擎桥接LLM输出和技术实现
5. 建立组件库，LLM只需要组合

❌ **DON'T**:
1. 不要让LLM生成复杂的几何计算
2. 不要让LLM直接生成SVG路径数据
3. 不要期望LLM一次生成完美的动画参数
4. 不要让LLM处理Unicode转义等细节

### 6.3 架构原则

```
LLM (决策层) → 规则引擎 (转换层) → 预定义资源 (执行层)
     ↑               ↑                  ↑
  擅长逻辑        参数映射            准确计算
  文本生成        类型转换            视觉质量
  结构设计        标准化              可维护性
```

---

## 7. 附录：快速参考

### 7.1 Remotion关键要素清单

```
必需要素 (8个):
1. Composition id
2. component
3. durationInFrames
4. fps
5. width
6. height
7. defaultProps
8. registerRoot

时间控制 (6个):
9. useCurrentFrame
10. useVideoConfig
11. interpolate
12. spring
13. AoConfig
14. continueRender

视觉呈现 (3个):
15. 样式系统
16. SVG图形
17. 数学公式

场景序列 (1个):
18. 场景管理

动画曲线 (1个):
19. 缓动函数
```

### 7.2 LLM能力速查表

```
✅ LLM直接生成:
- Remotion结构 (Composition, 组件)
- 场景划分逻辑
- 教学文本内容
- 基础样式
- 简单动画

⚠️ LLM + 辅助:
- 动画参数 (使用预设库)
- 颜色方案 (使用规则引擎)
- 复杂样式 (使用设计系统)

❌ LLM不生成:
- SVG路径数据 (Python计算)
- 数学公式 (LaTeX渲染)
- 几何计算 (数学库)
```

---

**文档版本**: v1.0
**最后更新**: 2025-01-12
**作者**: Claude (System Design)
