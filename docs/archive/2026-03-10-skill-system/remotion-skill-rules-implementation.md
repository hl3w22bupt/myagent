# Remotion Generator Skill - Rules 系统实现方案

## 📐 目录结构

```
skills/remotion-generator/
├── skill.yaml                      # 主入口（引用规则）
├── rules/                          # 规则目录（.md 格式）
│   ├── must-rules.md               # 强制性规则
│   ├── forbidden-rules.md          # 禁止规则
│   ├── recommended-rules.md        # 推荐规则
│   ├── animation-presets.md        # 动画预设
│   ├── scene-patterns.md           # 场景模式
│   └── style-guides.md             # 风格指南
├── generators/
│   ├── llm_analyzer.py
│   ├── code_generator.py
│   └── validator.py
├── lib/
│   └── rule_loader.py              # 新增：规则加载工具
└── handler.py
```

---

## 📝 Rules 文件内容

### `rules/must-rules.md`
```markdown
# MUST 规则 - 强制性要求

所有生成的 Remotion 代码**必须**遵守以下规则，违反会导致渲染失败或错误。

## 1. 使用 useCurrentFrame() 驱动所有动画

✅ **正确做法：**
\`\`\`typescript
import { useCurrentFrame, useVideoConfig } from 'remotion';

export const MyComponent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <div style={{ opacity }}>Content</div>;
};
\`\`\`

❌ **错误做法：**
\`\`\`typescript
// 禁止使用 CSS 动画
<div style={{
  transition: 'opacity 1s'  // ❌ 这不会在渲染中工作
}}>
  Content
</div>
\`\`\`

**原因：** Remotion 需要基于帧的确定性动画。CSS transitions/animations 依赖于真实时间，在渲染过程中无法正确工作。

---

## 2. 定义 durationInFrames

✅ **正确做法：**
\`\`\`typescript
<Composition
  id="MyComp"
  component={MyComponent}
  durationInFrames={300}  // ✅ 必须定义
  fps={30}
  width={1920}
  height={1080}
/>
\`\`\`

❌ **错误做法：**
\`\`\`typescript
<Composition
  id="MyComp"
  component={MyComponent}
  // ❌ 缺少 durationInFrames
  fps={30}
  width={1920}
  height={1080}
/>
\`\`\`

---

## 3. 使用 TypeScript 类型定义

✅ **推荐做法：**
\`\`\`typescript
// 使用 type 而非 interface
export type MyProps = {
  title: string;
  items: string[];
};
\`\`\`

**原因：** `type` 与 `defaultProps` 配合更好，类型推断更准确。

---

## 4. 在 Root.tsx 中注册 Composition

✅ **正确做法：**
\`\`\`typescript
// src/Root.tsx
import { Composition } from 'remotion';
import { MyComponent } from './MyComponent';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MyComp"
      component={MyComponent}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
\`\`\`

---

## 5. 静态资源必须使用 staticFile()

✅ **正确做法：**
\`\`\`typescript
import { staticFile } from 'remotion';
import { Img } from '@remotion/img';

<Img src={staticFile("image.png")} />
\`\`\`

❌ **错误做法：**
\`\`\`typescript
// ❌ 不要直接使用相对路径
<img src="/public/image.png" />
\`\`\`
```

---

### `rules/forbidden-rules.md`
```markdown
# FORBIDDEN 规则 - 严禁使用的模式

以下模式和 API **严禁使用**，它们会导致渲染失败、闪烁或不一致。

## 1. CSS Transitions 和 Animations

❌ **禁止：**
\`\`\`typescript
// 所有这些都会导致问题
<div style={{ transition: 'all 1s' }}>Content</div>
<div style={{ animation: 'fadeIn 1s' }}>Content</div>
<div className="transition-all duration-1000">Content</div>  // Tailwind
\`\`\`

**原因：** CSS 动画基于真实时间，Remotion 无法在渲染中正确捕获它们。

**替代方案：** 使用 `interpolate()` 或 `spring()`：
\`\`\`typescript
const opacity = interpolate(frame, [0, 30], [0, 1]);
<div style={{ opacity }}>Content</div>
\`\`\`

---

## 2. Tailwind 动画类

❌ **禁止：**
\`\`\`typescript
// 这些类不会正常工作
<div className="animate-bounce">Content</div>
<div className="animate-pulse">Content</div>
<div className="transition-all">Content</div>
<div className="duration-1000">Content</div>
\`\`\`

**替代方案：** 使用 Remotion 动画系统 + Tailwind 的静态样式。

---

## 3. setTimeout 和 setInterval

❌ **禁止：**
\`\`\`typescript
useEffect(() => {
  setTimeout(() => {
    setState('done');
  }, 1000);  // ❌ 基于时间，不可靠
}, []);
\`\`\`

**原因：** 异步时间操作会导致渲染不一致。

**替代方案：** 使用帧驱动：
\`\`\`typescript
const frame = useCurrentFrame();
const isDone = frame >= 30;  // 在第 30 帧完成
\`\`\`

---

## 4. 异步操作在 useEffect 中

❌ **禁止：**
\`\`\`typescript
useEffect(() => {
  fetch('/api/data').then(data => setData(data));  // ❌
}, []);
\`\`\`

**原因：** 异步副作用在渲染中会导致问题。

**替代方案：**
- 使用 `calculateMetadata` 预加载数据
- 在组件外部准备数据
- 使用 `delayRender()` / `continueRender()`

---

## 5. 修改状态的副作用

❌ **避免：**
\`\`\`typescript
const [value, setValue] = useState(0);

useEffect(() => {
  setValue(frame);  // ❌ 会导致额外渲染
}, [frame]);
\`\`\`

**替代方案：** 直接计算，不使用 state：
\`\`\`typescript
const value = frame;  // ✅ 直接使用 frame
\`\`\`
```

---

### `rules/recommended-rules.md`
```markdown
# RECOMMENDED 规则 - 最佳实践

这些规则能提升代码质量和用户体验，强烈推荐遵守。

## 1. 使用 spring() 而非 interpolate()

💡 **推荐：**
\`\`\`typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }  // smooth
});
\`\`\`

**原因：** `spring()` 基于物理模拟，动画更自然流畅。

**例外情况：** 当需要精确控制值时使用 `interpolate()`。

---

## 2. 使用 Sequence 管理时序

💡 **推荐：**
\`\`\`typescript
import { Sequence } from 'remotion';

const { fps } = useVideoConfig();

<Sequence from={0} durationInFrames={90}>
  <Scene1 />
</Sequence>
<Sequence from={90} durationInFrames={90}>
  <Scene2 />
</Sequence>
\`\`\`

**原因：** `Sequence` 提供清晰的时间管理和 `premount` 功能。

---

## 3. 为 Sequence 添加 premount

💡 **推荐：**
\`\`\`typescript
<Sequence from={0} durationInFrames={90} premountFor={30}>
  <Scene />
</Sequence>
\`\`\`

**原因：** `premountFor` 提前加载组件，避免出现时的闪烁。

---

## 4. 使用 AbsoluteFill 作为根容器

💡 **推荐：**
\`\`\`typescript
import { AbsoluteFill } from 'remotion';

export const MyScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'white' }}>
      {/* 内容 */}
    </AbsoluteFill>
  );
};
\`\`\`

**原因：** `AbsoluteFill` 自动处理定位和尺寸，减少重复代码。

---

## 5. 缓存昂贵的计算

💡 **推荐：**
\`\`\`typescript
import { useCurrentFrame, useVideoConfig } from 'remotion';
import useMemo from 'react';

export const MyComponent = () => {
  const frame = useCurrentFrame();

  const expensiveValue = useMemo(() => {
    return calculateExpensiveValue(frame);
  }, [frame]);

  return <div>{expensiveValue}</div>;
};
\`\`\`

**原因：** 避免每帧重新计算复杂逻辑。

---

## 6. 使用 Series 管理连续序列

💡 **推荐：**
\`\`\`typescript
import { Series } from 'remotion';

<Series>
  <Series.Sequence durationInFrames={60}>
    <Intro />
  </Series.Sequence>
  <Series.Sequence durationInFrames={120}>
    <Main />
  </Series.Sequence>
  <Series.Sequence durationInFrames={30}>
    <Outro />
  </Series.Sequence>
</Series>
\`\`\`

**原因：** `Series` 自动处理时序，不需要手动计算 `from` 值。
```

---

### `rules/animation-presets.md`
```markdown
# Animation Presets - 动画预设库

常用的动画配置预设，可以直接在代码中使用。

## Spring Animations

### Smooth Entrance（平滑进入）
\`\`\`typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }
});
\`\`\`

**特点：** 无回弹，平滑过渡
**适用场景：** 标题显示、淡入效果、微妙动画

---

### Snappy UI（快速响应）
\`\`\`typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 20, stiffness: 200 }
});
\`\`\`

**特点：** 快速，最小回弹
**适用场景：** UI 元素、按钮、交互反馈

---

### Bouncy Entrance（弹跳进入）
\`\`\`typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 8 }
});
\`\`\`

**特点：** 明显的弹跳效果
**适用场景：** 引人注目的进入动画、有趣的内容

---

### Heavy Slow（厚重缓慢）
\`\`\`typescript
const y = spring({
  frame,
  fps,
  config: { damping: 15, stiffness: 80, mass: 2 }
});
\`\`\`

**特点：** 慢速，小回弹
**适用场景：** 大元素、戏剧性揭示

---

## Easing Functions

### Ease In Quad（慢入快出）
\`\`\`typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.in(Easing.quad)
});
\`\`\`

**适用场景：** 退出动画

---

### Ease Out Quad（快入慢出）
\`\`\`typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.out(Easing.quad)
});
\`\`\`

**适用场景：** 进入动画

---

### Ease In Out Quad（两端慢）
\`\`\`typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad)
});
\`\`\`

**适用场景：** 平滑过渡

---

### Custom Bezier（自定义曲线）
\`\`\`typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.bezier(0.8, 0.22, 0.96, 0.65)
});
\`\`\`

**适用场景：** 特殊时序要求

---

## Common Patterns

### Fade In
\`\`\`typescript
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: 'clamp'
});
\`\`\`

### Slide From Left
\`\`\`typescript
const x = interpolate(frame, [0, 30], [-500, 0], {
  extrapolateRight: 'clamp'
});
\`\`\`

### Scale Up
\`\`\`typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }
});
\`\`\`

### Rotate In
\`\`\`typescript
const rotation = interpolate(frame, [0, 30], [-90, 0], {
  extrapolateRight: 'clamp'
});
\`\`\`
```

---

### `rules/scene-patterns.md`
```markdown
# Scene Patterns - 教育视频场景模式

常见教育视频场景的结构和动画模式。

## Formula Reveal（公式逐步展示）

**适用场景：** 数学公式、化学方程式、物理公式

**场景结构：**
1. **标题 (10%)** - 公式名称和概述
2. **公式展示 (60%)** - 逐步展示公式各部分
3. **解释 (20%)** - 解释公式含义
4. **总结 (10%)** - 关键点总结

**动画策略：** typewriter + word highlight

**代码示例：**
\`\`\`typescript
// 逐步展示公式
const chars = formula.split('');
const visibleChars = Math.floor(frame / 2); // 每2帧显示1个字符
const visibleFormula = chars.slice(0, visibleChars).join('');

<AbsoluteFill>
  <div style={{ fontSize: 60, textAlign: 'center' }}>
    {visibleFormula}
  </div>
</AbsoluteFill>
\`\`\`

**参考示例：** `examples/taylor-series/`

---

## Concept Comparison（概念对比）

**适用场景：** 对比两个相关概念（几何 vs 代数、不同方法等）

**场景结构：**
1. **标题 (10%)** - 对比主题
2. **概念A (35%)** - 第一个概念说明
3. **概念B (35%)** - 第二个概念说明
4. **对比分析 (20%)** - 异同点总结

**动画策略：** split-screen + synchronized

**代码示例：**
\`\`\`typescript
<AbsoluteFill style={{ display: 'flex', flexDirection: 'row' }}>
  <div style={{ flex: 1, backgroundColor: '#f0f0f0' }}>
    <ConceptA />
  </div>
  <div style={{ flex: 1, backgroundColor: '#e0e0e0' }}>
    <ConceptB />
  </div>
</AbsoluteFill>
\`\`\`

**参考示例：** `examples/derivative-comparison/`

---

## Step-by-Step Proof（分步推导）

**适用场景：** 数学证明、逻辑推导、解题过程

**场景结构：**
1. **标题 (5%)** - 证明主题
2. **推导步骤 (80%)** - 逐步推导（3-5步）
3. **结论 (15%)** - 最终结论和意义

**动画策略：** sequential + cumulative（累积显示）

**代码示例：**
\`\`\`typescript
const steps = [
  '已知：a² + b² = c²',
  '两边同时求导',
  '得到：2a + 2b = 2c',
  '化简：a + b = c'
];

const currentStep = Math.floor(frame / 30); // 每30帧一步

<Series>
  {steps.map((step, i) => (
    <Series.Sequence key={i} durationInFrames={90}>
      <AbsoluteFill>
        <div style={{ fontSize: 48, textAlign: 'center' }}>
          {step}
        </div>
      </AbsoluteFill>
    </Series.Sequence>
  ))}
</Series>
\`\`\`

**参考示例：** `examples/pythagorean-proof/`

---

## Visual Demonstration（可视化演示）

**适用场景：** 几何原理、物理过程、动态可视化

**场景结构：**
1. **标题 (10%)** - 演示主题
2. **环境设置 (20%)** - 展示演示环境
3. **核心动画 (50%)** - 主要动画演示
4. **原理解释 (20%)** - 解释原理

**动画策略：** spring + interpolate（连续运动）

**代码示例：**
\`\`\`typescript
const pointX = interpolate(frame, [0, 150], [0, 1000], {
  extrapolateRight: 'clamp'
});

const tangentY = derivativeAt(pointX);

<AbsoluteFill>
  <svg>
    <Curve />
    <Point cx={pointX} cy={curveY(pointX)} />
    <TangentLine x={pointX} y={tangentY} />
  </svg>
</AbsoluteFill>
\`\`\`

**参考示例：** `examples/derivative-visualization/`

---

## Data Visualization（数据可视化）

**适用场景：** 统计数据、趋势分析、图表展示

**场景结构：**
1. **标题 (10%)** - 数据主题
2. **图表展示 (70%)** - 逐步展示图表
3. **数据洞察 (20%)** - 关键发现

**动画策略：** staggered + progressive（交错动画）

**代码示例：**
\`\`\`typescript
const STAGGER_DELAY = 5;

{data.map((item, i) => {
  const delay = i * STAGGER_DELAY;
  const height = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 }
  });

  return (
    <div key={i} style={{ height: height * item.value }}>
      {item.label}
    </div>
  );
})}
\`\`\`

**参考示例：** `examples/function-chart/`
```

---

## 🔧 实现：从 prompt_template 引用规则文件

### 方案 1：使用 Jinja2 模板引擎

#### `lib/rule_loader.py`
```python
import os
from pathlib import Path
from jinja2 import Environment, FileSystemLoader

class RuleLoader:
    """加载 rules/ 目录下的 Markdown 规则文件"""

    def __init__(self, rules_dir: str = "rules"):
        self.rules_dir = Path(rules_dir)
        self.env = Environment(loader=FileSystemLoader(str(self.rules_dir)))

    def load_rule(self, rule_name: str) -> str:
        """加载单个规则文件"""
        try:
            template = self.env.get_template(f"{rule_name}.md")
            return template.render()
        except Exception as e:
            return f"# Error loading rule: {rule_name}\n\n{str(e)}"

    def load_rules(self, rule_names: list) -> str:
        """加载多个规则文件并合并"""
        content = []
        for rule_name in rule_names:
            content.append(self.load_rule(rule_name))
        return "\n\n---\n\n".join(content)

    def get_all_rules(self) -> list:
        """获取所有可用的规则文件名"""
        return [
            f.stem for f in self.rules_dir.glob("*.md")
            if not f.name.startswith('.')
        ]
```

#### 修改 `handler.py`
```python
from lib.rule_loader import RuleLoader

# 初始化规则加载器
rule_loader = RuleLoader()

# 加载规则
must_rules = rule_loader.load_rule("must-rules")
forbidden_rules = rule_loader.load_rule("forbidden-rules")
recommended_rules = rule_loader.load_rule("recommended-rules")
animation_presets = rule_loader.load_rule("animation-presets")
scene_patterns = rule_loader.load_rule("scene-patterns")

# 构建完整的 prompt
prompt = f"""
You are a Remotion expert generating educational videos.

{must_rules}

{forbidden_rules}

{recommended_rules}

{animation_presets}

{scene_patterns}

## Task
Create a {duration}s Remotion video about: {description}
...

"""
```

---

### 方案 2：使用 Python f-string 动态插入

#### `lib/rule_loader.py`
```python
import os
from pathlib import Path

class RuleLoader:
    """简单的规则文件加载器"""

    def __init__(self, rules_dir: str = "rules"):
        self.rules_dir = Path(rules_dir)

    def load_rule(self, rule_name: str) -> str:
        """加载单个规则文件内容"""
        rule_path = self.rules_dir / f"{rule_name}.md"
        try:
            with open(rule_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return f"# Rule not found: {rule_name}\n"
        except Exception as e:
            return f"# Error loading rule: {rule_name}\n\n{str(e)}"

    def load_rules(self, rule_names: list) -> str:
        """加载并合并多个规则"""
        rules = []
        for name in rule_names:
            rules.append(self.load_rule(name))
        return "\n\n---\n\n".join(rules)

    # 预定义的规则组合
    def get_core_rules(self) -> str:
        """核心规则（MUST + FORBIDDEN）"""
        return self.load_rules([
            "must-rules",
            "forbidden-rules"
        ])

    def get_all_rules(self) -> str:
        """所有规则"""
        return self.load_rules([
            "must-rules",
            "forbidden-rules",
            "recommended-rules",
            "animation-presets",
            "scene-patterns"
        ])
```

#### 修改 `skill.yaml`
```yaml
prompt_template: |
  You are a Remotion expert generating educational videos.

  {{MUST_RULES}}

  {{FORBIDDEN_RULES}}

  {{RECOMMENDED_RULES}}

  {{ANIMATION_PRESETS}}

  {{SCENE_PATTERNS}}

  ## Task
  Create a {{duration}}s Remotion video about: {{description}}

  Duration: {{duration}}s ({{duration}} * {{fps}} = {{total_frames}} frames)
  FPS: {{fps}}
  Resolution: {{resolution}}
  Style: {{style}}

  Generate the complete Remotion TypeScript code:
```

#### 修改 `handler.py` 或 `generators/llm_analyzer.py`
```python
from lib.rule_loader import RuleLoader

class RemotionVideoGenerator:
    def __init__(self):
        self.rule_loader = RuleLoader()

    def generate_video(self, params: dict):
        # 加载规则
        must_rules = self.rule_loader.load_rule("must-rules")
        forbidden_rules = self.rule_loader.load_rule("forbidden-rules")
        recommended_rules = self.rule_loader.load_rule("recommended-rules")
        animation_presets = self.rule_loader.load_rule("animation-presets")
        scene_patterns = self.rule_loader.load_rule("scene-patterns")

        # 替换 prompt 模板中的占位符
        prompt_template = self._load_prompt_template()

        prompt = prompt_template.replace("{{MUST_RULES}}", must_rules)
        prompt = prompt.replace("{{FORBIDDEN_RULES}}", forbidden_rules)
        prompt = prompt.replace("{{RECOMMENDED_RULES}}", recommended_rules)
        prompt = prompt.replace("{{ANIMATION_PRESETS}}", animation_presets)
        prompt = prompt.replace("{{SCENE_PATTERNS}}", scene_patterns)

        # 替换其他变量
        prompt = prompt.replace("{{description}}", params["description"])
        prompt = prompt.replace("{{duration}}", str(params["duration"]))
        # ...

        # 调用 LLM
        response = self.llm_client.generate(prompt)

    def _load_prompt_template(self) -> str:
        """从 skill.yaml 加载 prompt_template"""
        # 读取 skill.yaml
        with open('skill.yaml', 'r') as f:
            config = yaml.safe_load(f)
        return config['prompt_template']
```

---

### 方案 3：使用 YAML include 语法（如果使用支持 include 的解析器）

#### `skill.yaml`
```yaml
prompt_template: |
  You are a Remotion expert generating educational videos.

  {{INCLUDE:rules/must-rules.md}}

  {{INCLUDE:rules/forbidden-rules.md}}

  {{INCLUDE:rules/recommended-rules.md}}

  ## Task
  ...
```

#### `lib/template_engine.py`
```python
import re
from pathlib import Path

class TemplateEngine:
    """简单的模板引擎，支持 INCLUDE 语法"""

    def __init__(self, base_dir: str = "."):
        self.base_dir = Path(base_dir)

    def render(self, template: str) -> str:
        """渲染模板，处理 INCLUDE 指令"""
        # 匹配 {{INCLUDE:path/to/file.md}}
        pattern = r'\{\{INCLUDE:([^}]+)\}\}'

        def replace_include(match):
            file_path = match.group(1).strip()
            full_path = self.base_dir / file_path

            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    return f.read()
            except Exception as e:
                return f"[Error including {file_path}: {str(e)}]"

        # 递归处理所有 INCLUDE
        while re.search(pattern, template):
            template = re.sub(pattern, replace_include, template)

        return template
```

---

## 🎯 推荐方案

我推荐使用 **方案 2（Python f-string + 简单替换）**，原因：

1. ✅ **简单直观** - 不需要额外的模板引擎依赖
2. ✅ **易于调试** - 可以看到最终生成的 prompt
3. ✅ **灵活性高** - 可以根据参数动态选择加载哪些规则
4. ✅ **向后兼容** - 不需要修改 skill.yaml 的结构

---

## 📋 实施步骤

### Step 1: 创建 rules/ 目录和文件
```bash
cd skills/remotion-generator
mkdir -p rules lib

# 创建规则文件
touch rules/must-rules.md
touch rules/forbidden-rules.md
touch rules/recommended-rules.md
touch rules/animation-presets.md
touch rules/scene-patterns.md
```

### Step 2: 编写规则文件内容
参考上面的 markdown 内容编写各个规则文件。

### Step 3: 创建规则加载器
```bash
touch lib/rule_loader.py
```

### Step 4: 集成到 handler.py 或 generator
在生成代码时加载并插入规则内容。

### Step 5: 测试
```bash
cd skills/remotion-generator
python -m lib.rule_loader  # 测试规则加载
```

---

## 💡 额外优化

### 1. 规则版本控制
在 `rules/` 目录添加 `VERSION.md`：
```markdown
# Rules Version 1.0.0

Last updated: 2026-01-24

## Changes
- Initial version
- Added 5 must rules
- Added 5 forbidden rules
- Added 6 recommended rules
- Added 4 animation presets
- Added 5 scene patterns
```

### 2. 规则测试
创建 `tests/test_rules.py`：
```python
import pytest
from lib.rule_loader import RuleLoader

def test_load_must_rules():
    loader = RuleLoader()
    content = loader.load_rule("must-rules")
    assert "useCurrentFrame" in content
    assert "durationInFrames" in content

def test_load_forbidden_rules():
    loader = RuleLoader()
    content = loader.load_rule("forbidden-rules")
    assert "CSS" in content
    assert "setTimeout" in content
```

### 3. 规则缓存
添加简单的缓存机制：
```python
from functools import lru_cache

class RuleLoader:
    @lru_cache(maxsize=10)
    def load_rule(self, rule_name: str) -> str:
        # ... 加载逻辑
```

---

## 🎉 总结

通过这个设计：

1. ✅ **rules/*.md** - 人类可读的规则文档
2. ✅ **skill.yaml** - 引用规则文件的占位符
3. ✅ **lib/rule_loader.py** - 动态加载规则内容
4. ✅ **灵活性** - 可以轻松添加/修改规则
5. ✅ **可维护性** - 规则和代码分离

这样既保持了规则的可读性（Markdown），又实现了动态加载到 prompt_template 中！
