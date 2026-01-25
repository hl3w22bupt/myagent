# Remotion Generator Skill 改进方案

## 📐 基于技能.yaml 的结构化设计

### 当前架构
```
skills/remotion-generator/
├── skill.yaml              # 主入口（结构化配置）
├── handler.py              # 执行入口
├── generators/             # 生成器模块
│   ├── llm_analyzer.py
│   ├── code_generator.py
│   └── validator.py
└── template/               # Remotion 模板
```

---

## 🎯 从官方 Skill 借鉴的改进方向

### 1️⃣ **扩展 skill.yaml 的元数据** ⭐⭐⭐⭐⭐

#### 当前 skill.yaml
```yaml
name: remotion-generator
version: 1.0.0
description: Generate videos using Remotion framework
tags: [remotion, video, animation, media-generation]
type: hybrid
```

#### 建议扩展为
```yaml
name: remotion-generator
version: 2.0.0
description: LLM-driven Remotion video generation for educational content
tags:
  - remotion
  - video
  - llm
  - education
  - automation
type: hybrid

# 新增：能力声明
capabilities:
  phases:
    - name: content-analysis
      description: "Analyze educational topic and extract key elements"
      handler: generators/llm_analyzer.py
      class: ContentAnalyzer
    - name: code-generation
      description: "Generate complete Remotion TypeScript code"
      handler: generators/code_generator.py
      class: RemotionCodeGenerator
    - name: validation
      description: "Validate generated code quality"
      handler: generators/validator.py
      class: CodeValidator

# 新增：支持的领域
domains:
  - mathematics
  - physics
  - programming
  - general-education

# 新增：视频风格
styles:
  minimal:
    description: "Clean, simple, focused on content"
    animation_level: low
    color_palette: monochrome
  corporate:
    description: "Professional, branded"
    animation_level: medium
    color_palette: business
  animated:
    description: "Dynamic, engaging"
    animation_level: high
    color_palette: vibrant
  cinematic:
    description: "Dramatic, film-like"
    animation_level: high
    color_palette: dramatic
  presentation:
    description: "Informational, educational"
    animation_level: medium
    color_palette: educational
```

**优点**：
- ✅ 结构化的能力声明
- ✅ 便于系统自动发现和调用
- ✅ 支持未来的扩展（如动态加载 phases）

---

### 2️⃣ **建立结构化规则系统** ⭐⭐⭐⭐⭐

#### 创建 `rules/` 目录（YAML 格式）

```
skills/remotion-generator/
├── rules/                  # 新增：规则目录
│   ├── must-rules.yaml     # 强制性规则
│   ├── forbidden-rules.yaml # 禁止规则
│   ├── recommended-rules.yaml # 推荐规则
│   ├── animation-presets.yaml  # 动画预设
│   └── scene-patterns.yaml    # 场景模式
├── skill.yaml
└── generators/
```

#### `rules/must-rules.yaml`
```yaml
version: 1.0.0
description: "MUST 规则 - 所有生成的 Remotion 代码必须遵守"
rules:
  - id: MUST_USE_CURRENT_FRAME
    category: animation
    severity: error
    description: "所有动画必须使用 useCurrentFrame() 驱动"
    check: |
      检查代码中是否包含 useCurrentFrame() 或 useVideoConfig()
    error_message: "动画未使用 useCurrentFrame()，会导致渲染问题"
    fix_suggestion: "使用 const frame = useCurrentFrame(); 驱动所有动画"

  - id: MUST_DEFINE_DURATION
    category: composition
    severity: error
    description: "Composition 必须定义 durationInFrames"
    check: "durationInFrames in composition_props"
    error_message: "缺少 durationInFrames 定义"
    fix_suggestion: "添加 durationInFrames={duration * fps}"

  - id: MUST_USE_TYPESCRIPT
    category: types
    severity: error
    description: "必须使用 TypeScript 接口定义 props"
    check: "interface定义存在"
    error_message: "缺少 TypeScript 接口定义"
    fix_suggestion: "定义 interface MyCompProps { ... }"

  - id: MUST_REGISTER_COMPOSITION
    category: structure
    severity: error
    description: "必须在 Root.tsx 中注册 Composition"
    check: "registerRoot or <Composition>存在"
    error_message: "未注册 Composition"
    fix_suggestion: "在 Root.tsx 中添加 <Composition ... />"
```

#### `rules/forbidden-rules.yaml`
```yaml
version: 1.0.0
description: "FORBIDDEN 规则 - 严禁使用的模式和 API"
rules:
  - id: FORBID_CSS_TRANSITIONS
    category: animation
    severity: critical
    description: "禁止使用 CSS transitions 或 animations"
    pattern: "transition|animation:"
    error_message: "CSS transitions/animations 无法在 Remotion 渲染中正确工作"
    fix_suggestion: "使用 Remotion 的 interpolate() 或 spring() 驱动动画"

  - id: FORBID_TAILWIND_ANIMATIONS
    category: styling
    severity: critical
    description: "禁止使用 Tailwind animation class names"
    pattern: "animate-|transition-"
    error_message: "Tailwind 动画类无法在 Remotion 渲染中正确工作"
    fix_suggestion: "使用 Remotion 的动画系统"

  - id: FORBID_SET_TIMEOUT
    category: timing
    severity: error
    description: "禁止使用 setTimeout/setInterval"
    pattern: "setTimeout|setInterval"
    error_message: "基于时间的异步操作会导致渲染不一致"
    fix_suggestion: "使用 useCurrentFrame() 和 Sequence 控制时序"

  - id: FORBID_ASYNC_USE_EFFECT
    category: react
    severity: error
    description: "禁止在 useEffect 中使用异步操作"
    pattern: "useEffect.*async"
    error_message: "异步副作用会导致渲染问题"
    fix_suggestion: "使用 calculateMetadata 或预加载数据"
```

#### `rules/recommended-rules.yaml`
```yaml
version: 1.0.0
description: "RECOMMENDED 规则 - 推荐的最佳实践"
rules:
  - id: RECOMMEND_SPRING_OVER_INTERPOLATE
    category: animation
    description: "推荐使用 spring() 获得更自然的动画"
    reason: "spring() 基于物理模拟，动画更自然"
    example: |
      // 推荐
      const scale = spring({frame, fps, config: {damping: 200}});

      // 不推荐（除非需要精确控制）
      const scale = interpolate(frame, [0, 30], [0, 1]);

  - id: RECOMMEND_SEQUENCE_FOR_TIMING
    category: timing
    description: "推荐使用 Sequence 进行时间管理"
    reason: "Sequence 更清晰地组织时间线"
    example: |
      <Sequence from={0} durationInFrames={90}>
        <Scene />
      </Sequence>

  - id: RECOMMEND_PREMOUNT_FOR_SEQUENCE
    category: performance
    description: "推荐为 Sequence 添加 premount"
    reason: "提前加载组件避免闪烁"
    example: |
      <Sequence premountFor={1 * fps}>
        <Scene />
      </Sequence>

  - id: RECOMMEND_TYPE_OVER_INTERFACE
    category: typescript
    description: "推荐使用 type 而非 interface 定义 props"
    reason: "type 与 defaultProps 配合更好"
    example: |
      // 推荐
      export type MyProps = {
        title: string;
      };

      // 不推荐
      export interface MyProps {
        title: string;
      }
```

---

### 3️⃣ **创建动画预设库** ⭐⭐⭐⭐⭐

#### `rules/animation-presets.yaml`
```yaml
version: 1.0.0
description: "Remotion 动画预设库"

springs:
  smooth_entrance:
    config:
      damping: 200
    description: "Smooth entrance without bounce"
    use_case: "Title reveals, subtle fade-ins"
    example: |
      const opacity = spring({
        frame,
        fps,
        config: {damping: 200}
      });

  snappy_ui:
    config:
      damping: 20
      stiffness: 200
    description: "Quick and responsive"
    use_case: "UI elements, buttons, interactions"
    example: |
      const scale = spring({
        frame,
        fps,
        config: {damping: 20, stiffness: 200}
      });

  bouncy_playful:
    config:
      damping: 8
    description: "Playful bounce effect"
    use_case: "Engaging content, playful animations"
    example: |
      const scale = spring({
        frame,
        fps,
        config: {damping: 8}
      });

  heavy_slow:
    config:
      damping: 15
      stiffness: 80
      mass: 2
    description: "Heavy, slow with small bounce"
    use_case: "Large elements, dramatic reveals"
    example: |
      const y = spring({
        frame,
        fps,
        config: {damping: 15, stiffness: 80, mass: 2}
      });

easings:
  ease_in_quad:
    function: "Easing.in(Easing.quad)"
    description: "Start slow, accelerate"
    use_case: "Exit animations"

  ease_out_quad:
    function: "Easing.out(Easing.quad)"
    description: "Start fast, slow down"
    use_case: "Entrance animations"

  ease_in_out_quad:
    function: "Easing.inOut(Easing.quad)"
    description: "Slow start and end"
    use_case: "Smooth transitions"

  custom_bezier:
    function: "Easing.bezier(0.8, 0.22, 0.96, 0.65)"
    description: "Custom cubic bezier curve"
    use_case: "Specific timing requirements"
```

**在 Python 代码中使用**：
```python
# generators/code_generator.py
import yaml

class AnimationPresets:
    def __init__(self):
        with open('rules/animation-presets.yaml') as f:
            self.presets = yaml.safe_load(f)

    def get_spring_preset(self, name: str) -> dict:
        """获取 spring 预设配置"""
        return self.presets['springs'][name]['config']

    def format_spring_preset(self, name: str) -> str:
        """格式化为 TypeScript 代码"""
        preset = self.get_spring_preset(name)
        config_str = ', '.join(f'{k}: {v}' for k, v in preset.items())
        return f'{{ {config_str} }}'
```

---

### 4️⃣ **建立教育视频场景模式库** ⭐⭐⭐⭐⭐

#### `rules/scene-patterns.yaml`
```yaml
version: 1.0.0
description: "教育视频场景模式库"

patterns:
  formula_reveal:
    name: "公式逐步展示"
    description: "逐步展示数学公式，每个步骤高亮当前部分"
    animation_strategy: "typewriter + word highlight"
    scene_structure:
      - phase: title
        duration_percent: 10
        content: "公式名称和概述"
      - phase: formula_reveal
        duration_percent: 60
        content: "逐步展示公式各部分"
      - phase: explanation
        duration_percent: 20
        content: "解释公式含义"
      - phase: summary
        duration_percent: 10
        content: "总结关键点"
    visualization:
      type: "text"
      animation: "typewriter"
      highlight: "current_word"
    example_topic: "taylor_series"
    example_code: "examples/taylor-series/composition.tsx"

  concept_comparison:
    name: "概念对比"
    description: "并排对比两个相关概念"
    animation_strategy: "split-screen + synchronized"
    scene_structure:
      - phase: title
        duration_percent: 10
      - phase: concept_a
        duration_percent: 35
        content: "概念 A 的说明"
      - phase: concept_b
        duration_percent: 35
        content: "概念 B 的说明"
      - phase: comparison
        duration_percent: 20
        content: "对比分析"
    visualization:
      type: "split_screen"
      animation: "synchronized_appear"
    example_topic: "derivative_geometric_vs_algebraic"
    example_code: "examples/derivative-comparison/composition.tsx"

  step_by_step_proof:
    name: "分步推导"
    description: "逐步推导证明过程，每步累积显示"
    animation_strategy: "sequential + cumulative"
    scene_structure:
      - phase: title
        duration_percent: 5
      - phase: steps
        duration_percent: 80
        content: "逐步推导（3-5 步）"
      - phase: conclusion
        duration_percent: 15
        content: "结论和意义"
    visualization:
      type: "text"
      animation: "cumulative_reveal"
      timing: "staggered"
    example_topic: "pythagorean_proof"
    example_code: "examples/pythagorean-proof/composition.tsx"

  visual_demonstration:
    name: "可视化演示"
    description: "通过动画可视化演示原理"
    animation_strategy: "spring + interpolate"
    scene_structure:
      - phase: title
        duration_percent: 10
      - phase: setup
        duration_percent: 20
        content: "设置演示环境"
      - phase: animation
        duration_percent: 50
        content: "核心动画演示"
      - phase: explanation
        duration_percent: 20
        content: "原理解释"
    visualization:
      type: "geometric"
      animation: "continuous_motion"
      timing: "smooth_spring"
    example_topic: "derivative_visualization"
    example_code: "examples/derivative-visualization/composition.tsx"

  data_visualization:
    name: "数据可视化"
    description: "图表展示数据趋势和关系"
    animation_strategy: "staggered + progressive"
    scene_structure:
      - phase: title
        duration_percent: 10
      - phase: chart_reveal
        duration_percent: 70
        content: "逐步展示图表"
      - phase: insights
        duration_percent: 20
        content: "数据洞察"
    visualization:
      type: "chart"
      animation: "staggered_bars"
      timing: "delayed"
    example_topic: "function_comparison"
    example_code: "examples/function-chart/composition.tsx"
```

**在代码中使用**：
```python
# generators/llm_analyzer.py
import yaml

class ScenePatternLibrary:
    def __init__(self):
        with open('rules/scene-patterns.yaml') as f:
            self.patterns = yaml.safe_load(f)

    def suggest_pattern(self, topic: str, content_type: str) -> dict:
        """根据主题建议合适的模式"""
        if 'formula' in topic.lower():
            return self.patterns['patterns']['formula_reveal']
        elif 'comparison' in topic.lower() or 'vs' in topic.lower():
            return self.patterns['patterns']['concept_comparison']
        elif 'proof' in topic.lower() or 'prove' in topic.lower():
            return self.patterns['patterns']['step_by_step_proof']
        elif 'visualiz' in topic.lower():
            return self.patterns['patterns']['visual_demonstration']
        else:
            return self.patterns['patterns']['formula_reveal']  # 默认
```

---

### 5️⃣ **强化 prompt_template 中的规则强调** ⭐⭐⭐⭐⭐

#### 修改 `skill.yaml` 中的 `prompt_template`

```yaml
prompt_template: |
  You are a Remotion expert generating educational videos.

  ## CRITICAL RULES

  ### MUST DO (违反会导致渲染失败)
  ✅ MUST use `useCurrentFrame()` for ALL animations
  ✅ MUST define `durationInFrames` in Composition
  ✅ MUST use TypeScript with proper `type` definitions
  ✅ MUST register Composition in Root.tsx

  ### FORBIDDEN (严禁使用)
  ❌ FORBIDDEN: CSS transitions/animations
  ❌ FORBIDDEN: Tailwind animation classes (animate-, transition-)
  ❌ FORBIDDEN: setTimeout/setInterval
  ❌ FORBIDDEN: Async operations in useEffect

  ### RECOMMENDED (最佳实践)
  💡 Use `spring()` instead of `interpolate()` for natural motion
  💡 Use `Sequence` for timing management
  💡 Use `premountFor` with Sequence to avoid flicker
  💡 Use `type` not `interface` for props

  ## Animation Presets

  Use these spring configurations for consistent results:
  - Smooth entrance: `spring({frame, fps, config: {damping: 200}})`
  - Snappy UI: `spring({frame, fps, config: {damping: 20, stiffness: 200}})`
  - Bouncy entrance: `spring({frame, fps, config: {damping: 8}})`

  Easing functions:
  - Start slow, accelerate: `Easing.in(Easing.quad)`
  - Start fast, slow down: `Easing.out(Easing.quad)`
  - Slow both ends: `Easing.inOut(Easing.quad)`

  ## Task
  Create a {{duration}}s Remotion video about: {{description}}

  ## Structure
  Duration: {{duration}}s ({{duration}} * {{fps}} = {{total_frames}} frames)
  FPS: {{fps}}
  Resolution: {{resolution}} ({{width}}x{{height}})
  Style: {{style}}

  ## Output Format
  Return ONLY valid TypeScript code with:

  ```typescript
  // 1. Props definition (use type, not interface)
  export type MyCompProps = {
    title: string;
    // ...
  };

  // 2. Composition component
  export const MyComposition: React.FC<MyCompProps> = ({ title }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Use frame for ALL animations
    const opacity = interpolate(frame, [0, 30], [0, 1]);

    return (
      <AbsoluteFill style={{ opacity }}>
        {/* Content */}
      </AbsoluteFill>
    );
  };

  // 3. Register in Root.tsx
  export const RemotionRoot = () => {
    return (
      <Composition
        id="MyComposition"
        component={MyComposition}
        durationInFrames={{total_frames}}
        fps={{fps}}
        width={{width}}
        height={{height}}
      />
    );
  };
  ```

  ## Style Guidelines: {{style}}

  {{#if style_minimal}}
  - Clean, simple, focused on content
  - Use minimal animations (smooth_entrance preset)
  - Color palette: monochrome or low contrast
  {{/if}}

  {{#if style_corporate}}
  - Professional, branded
  - Use moderate animations (snappy_ui preset)
  - Color palette: business colors (blue, gray)
  {{/if}}

  {{#if style_animated}}
  - Dynamic, engaging
  - Use extensive animations (bouncy_playful preset)
  - Color palette: vibrant, high contrast
  {{/if}}

  {{#if style_cinematic}}
  - Dramatic, film-like
  - Use slow, heavy animations (heavy_slow preset)
  - Color palette: dramatic, high contrast
  {{/if}}

  {{#if style_presentation}}
  - Informational, educational
  - Use moderate animations (smooth_entrance preset)
  - Color palette: educational (clear, readable)
  {{/if}}

  Generate the complete Remotion TypeScript code:
```

---

### 6️⃣ **创建示例库目录结构** ⭐⭐⭐⭐

```
skills/remotion-generator/
├── examples/                    # 新增：示例库
│   ├── taylor-series/
│   │   ├── composition.tsx      # 完整 Remotion 代码
│   │   ├── analysis.json        # ContentAnalyzer 输出
│   │   ├── metadata.yaml        # 元数据
│   │   ├── preview.png          # 预览图
│   │   └── README.md            # 说明文档
│   ├── pythagorean-theorem/
│   └── derivative-visualization/
├── rules/                       # 新增：规则目录
│   ├── must-rules.yaml
│   ├── forbidden-rules.yaml
│   ├── recommended-rules.yaml
│   ├── animation-presets.yaml
│   └── scene-patterns.yaml
├── skill.yaml
└── generators/
```

#### `examples/taylor-series/metadata.yaml`
```yaml
name: "Taylor Series Visualization"
topic: "calculus/taylor-series"
difficulty: "intermediate"
duration: 15
fps: 30
resolution: "1920x1080"
pattern: "formula_reveal"
animation_style: "smooth_entrance"
tech_stack:
  - remotion
  - typescript
  - react
key_features:
  - "Progressive formula reveal"
  - "Curve comparison animation"
  - "Interactive spring animations"
tags:
  - mathematics
  - calculus
  - formula
  - visualization
related_patterns:
  - step_by_step_proof
  - visual_demonstration
```

---

### 7️⃣ **在 Validator 中集成规则检查** ⭐⭐⭐⭐⭐

#### 修改 `generators/validator.py`

```python
import yaml
import re
from typing import List, Tuple, Dict

class CodeValidator:
    def __init__(self):
        # 加载规则
        with open('rules/must-rules.yaml') as f:
            self.must_rules = yaml.safe_load(f)['rules']
        with open('rules/forbidden-rules.yaml') as f:
            self.forbidden_rules = yaml.safe_load(f)['rules']
        with open('rules/recommended-rules.yaml') as f:
            self.recommended_rules = yaml.safe_load(f)['rules']

    def validate(self, code: str) -> Tuple[bool, List[str], List[str]]:
        """验证代码，返回 (is_valid, errors, warnings)"""
        errors = []
        warnings = []

        # 检查 MUST 规则
        for rule in self.must_rules:
            if not self._check_rule(code, rule):
                errors.append(f"[{rule['id']}] {rule['error_message']}")
                errors.append(f"  建议: {rule['fix_suggestion']}")

        # 检查 FORBIDDEN 规则
        for rule in self.forbidden_rules:
            if self._detect_forbidden_pattern(code, rule):
                severity = rule.get('severity', 'error')
                if severity == 'critical':
                    errors.append(f"[{rule['id']}] {rule['error_message']}")
                    errors.append(f"  建议: {rule['fix_suggestion']}")
                else:
                    warnings.append(f"[{rule['id']}] {rule['error_message']}")
                    warnings.append(f"  建议: {rule['fix_suggestion']}")

        # 检查 RECOMMENDED 规则
        for rule in self.recommended_rules:
            if not self._follows_recommendation(code, rule):
                warnings.append(f"[{rule['id']}] {rule['description']}")
                warnings.append(f"  原因: {rule['reason']}")

        return len(errors) == 0, errors, warnings

    def _check_rule(self, code: str, rule: dict) -> bool:
        """检查单个规则"""
        rule_id = rule['id']

        if rule_id == 'MUST_USE_CURRENT_FRAME':
            return 'useCurrentFrame' in code or 'useVideoConfig' in code

        elif rule_id == 'MUST_DEFINE_DURATION':
            return 'durationInFrames' in code

        elif rule_id == 'MUST_USE_TYPESCRIPT':
            return 'type ' in code or 'interface ' in code

        elif rule_id == 'MUST_REGISTER_COMPOSITION':
            return '<Composition' in code or 'registerRoot' in code

        return False

    def _detect_forbidden_pattern(self, code: str, rule: dict) -> bool:
        """检测禁止的模式"""
        pattern = rule.get('pattern')
        if pattern:
            return bool(re.search(pattern, code))
        return False

    def _follows_recommendation(self, code: str, rule: dict) -> bool:
        """检查是否遵循推荐"""
        rule_id = rule['id']

        if rule_id == 'RECOMMEND_SPRING_OVER_INTERPOLATE':
            # 如果使用了 interpolate 且可以用 spring，返回 False
            return 'spring(' in code or 'interpolate(' not in code

        elif rule_id == 'RECOMMEND_SEQUENCE_FOR_TIMING':
            return '<Sequence' in code

        elif rule_id == 'RECOMMEND_PREMOUNT_FOR_SEQUENCE':
            return 'premountFor' in code

        elif rule_id == 'RECOMMEND_TYPE_OVER_INTERFACE':
            return 'type ' in code

        return True

    def generate_error_feedback(self, errors: List[str]) -> str:
        """生成错误反馈用于重试"""
        feedback = "代码验证失败，请修复以下问题：\n\n"
        for error in errors:
            feedback += f"- {error}\n"
        return feedback
```

---

## 📊 改进效果对比

### 改进前
- ❌ 规则散落在代码和文档中
- ❌ 没有结构化的规则声明
- ❌ 难以扩展和维护
- ❌ Prompt 缺乏规则强调

### 改进后
- ✅ 规则集中管理在 YAML 文件中
- ✅ 结构化、可扩展的规则系统
- ✅ 自动化规则检查
- ✅ Prompt 明确强调 MUST/FORBIDDEN
- ✅ 丰富的预设库供 LLM 使用

---

## 🚀 实施步骤

### 第一阶段：规则系统（1-2天）
1. 创建 `rules/` 目录
2. 编写 `must-rules.yaml`
3. 编写 `forbidden-rules.yaml`
4. 编写 `recommended-rules.yaml`
5. 在 `validator.py` 中集成规则检查

### 第二阶段：预设库（2-3天）
1. 编写 `animation-presets.yaml`
2. 编写 `scene-patterns.yaml`
3. 在 `llm_analyzer.py` 中集成模式选择
4. 在 `code_generator.py` 中集成动画预设

### 第三阶段：Prompt 优化（1天）
1. 重写 `skill.yaml` 中的 `prompt_template`
2. 添加规则强调
3. 添加预设使用说明
4. 添加风格指南

### 第四阶段：示例库（可选，3-5天）
1. 创建 `examples/` 目录结构
2. 生成 3-5 个完整示例
3. 为每个示例添加元数据和说明

---

## 🎯 总结

通过以上改进，你的 remotion-generator skill 将：

1. **保持结构化** ✅
   - skill.yaml 仍是主入口
   - 所有规则使用 YAML 格式
   - 便于机器解析和扩展

2. **借鉴官方优点** ✅
   - MUST/FORBIDDEN/RECOMMENDED 规则体系
   - 动画预设库
   - 场景模式库
   - 清晰的代码示例

3. **增强可维护性** ✅
   - 规则集中管理
   - 易于添加新规则
   - 易于更新和测试

4. **提升 LLM 生成质量** ✅
   - Prompt 中明确规则
   - 丰富的预设供参考
   - 场景模式引导生成

这样既保持了你们系统的结构化设计，又充分借鉴了官方 skill 的优秀实践！
