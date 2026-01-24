# Remotion Generator 规则系统

这个规则系统为 LLM 生成 Remotion 代码提供结构化的最佳实践指导。

## 📁 目录结构

```
skills/remotion-generator/
├── rules/                      # 规则目录（Markdown 格式）
│   ├── must-rules.md           # 强制性规则
│   ├── forbidden-rules.md      # 禁止规则
│   ├── recommended-rules.md    # 推荐规则
│   ├── animation-presets.md    # 动画预设
│   ├── scene-patterns.md       # 场景模式
│   └── README.md               # 本文件
├── lib/                        # 工具库
│   ├── __init__.py
│   ├── rule_loader.py          # 规则加载器
│   └── prompt_builder.py       # Prompt 构建器
└── skill.yaml                  # 主配置（包含规则占位符）
```

---

## 🎯 规则文件说明

### 1. must-rules.md - 强制性规则
所有生成的代码**必须**遵守这些规则，违反会导致渲染失败。

**核心规则：**
- ✅ 必须使用 `useCurrentFrame()` 驱动所有动画
- ✅ 必须定义 `durationInFrames`
- ✅ 必须使用 TypeScript 类型定义
- ✅ 必须在 Root.tsx 中注册 Composition
- ✅ 静态资源必须使用 `staticFile()`

---

### 2. forbidden-rules.md - 禁止规则
严禁使用的模式和 API，会导致渲染失败或不一致。

**禁止内容：**
- ❌ CSS transitions/animations
- ❌ Tailwind 动画类（animate-, transition-）
- ❌ setTimeout/setInterval
- ❌ useEffect 中的异步操作
- ❌ 基于状态的副作用

---

### 3. recommended-rules.md - 推荐规则
最佳实践，能提升代码质量。

**推荐做法：**
- 💡 使用 `spring()` 而非 `interpolate()`
- 💡 使用 `Sequence` 管理时序
- 💡 为 `Sequence` 添加 `premount`
- 💡 使用 `AbsoluteFill` 作为根容器
- 💡 缓存昂贵的计算
- 💡 使用 `Series` 管理连续序列

---

### 4. animation-presets.md - 动画预设
常用的动画配置预设。

**Spring 预设：**
- `smooth_entrance` - 平滑进入（damping: 200）
- `snappy_ui` - 快速响应（damping: 20, stiffness: 200）
- `bouncy_playful` - 弹跳进入（damping: 8）
- `heavy_slow` - 厚重缓慢（damping: 15, stiffness: 80, mass: 2）

**Easing 函数：**
- Ease In/Out/InOut Quad
- Custom Bezier

---

### 5. scene-patterns.md - 场景模式
教育视频常用场景结构。

**场景类型：**
- Formula Reveal（公式逐步展示）
- Concept Comparison（概念对比）
- Step-by-Step Proof（分步推导）
- Visual Demonstration（可视化演示）
- Data Visualization（数据可视化）

---

## 🔧 使用方法

### 方法 1: 在 handler.py 中集成

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

# 从 skill.yaml 加载 prompt_template
import yaml
with open('skill.yaml', 'r') as f:
    config = yaml.safe_load(f)
    prompt_template = config['prompt_template']

# 替换占位符
prompt = prompt_template
prompt = prompt.replace("{{MUST_RULES}}", must_rules)
prompt = prompt.replace("{{FORBIDDEN_RULES}}", forbidden_rules)
prompt = prompt.replace("{{RECOMMENDED_RULES}}", recommended_rules)
prompt = prompt.replace("{{ANIMATION_PRESETS}}", animation_presets)
prompt = prompt.replace("{{SCENE_PATTERNS}}", scene_patterns)

# 替换其他参数
prompt = prompt.replace("{{description}}", params["description"])
prompt = prompt.replace("{{duration}}", str(params["duration"]))
# ...

# 调用 LLM
response = llm_client.generate(prompt)
```

---

### 方法 2: 使用 PromptBuilder（推荐）

```python
from lib.prompt_builder import PromptBuilder

# 初始化
builder = PromptBuilder()

# 构建 prompt
prompt = builder.build_prompt({
    "description": "生成一个泰勒公式的教学视频",
    "duration": 15,
    "fps": 30,
    "resolution": "1920x1080",
    "style": "presentation"
})

# 调用 LLM
response = llm_client.generate(prompt)
```

或者使用关键字参数：

```python
prompt = builder.build_prompt_from_params(
    description="生成一个泰勒公式的教学视频",
    duration=15,
    fps=30,
    style="presentation"
)
```

---

## 📝 添加新规则

### 1. 创建新的规则文件

```bash
cd skills/remotion-generator/rules
touch my-new-rules.md
```

### 2. 编写规则内容（Markdown 格式）

```markdown
# My New Rules

## 规则 1

描述...

✅ **正确做法：**
\`\`\`typescript
// 代码示例
\`\`\`

❌ **错误做法：**
\`\`\`typescript
// 错误示例
\`\`\`
```

### 3. 在 skill.yaml 中添加占位符

```yaml
prompt_template: |
  {{MUST_RULES}}
  {{MY_NEW_RULES}}  # 添加这里
  ...
```

### 4. 在代码中加载新规则

```python
my_rules = rule_loader.load_rule("my-new-rules")
prompt = prompt.replace("{{MY_NEW_RULES}}", my_rules)
```

---

## 🧪 测试

### 测试规则加载器

```bash
cd skills/remotion-generator
python -m lib.rule_loader
```

预期输出：
```
=== Rule Loader Test ===

Rules directory: /path/to/rules
Available rules: ['must-rules', 'forbidden-rules', ...]
Total rules: 5

=== Testing load_rule ===
Must rules loaded: 1797 characters
...
```

### 测试 Prompt 构建器

```bash
# 需要先安装 pyyaml
pip install pyyaml

python -m lib.prompt_builder
```

---

## 🔍 规则文件模板

创建新规则时，使用以下模板：

```markdown
# 规则类别 - 简短描述

规则的总体说明。

## 规则名称

✅ **正确做法：**
\`\`\`typescript
// 正确的代码示例
import { useCurrentFrame } from 'remotion';

const frame = useCurrentFrame();
// ...
\`\`\`

❌ **错误做法：**
\`\`\`typescript
// 错误的代码示例
// ...
\`\`\`

**原因：** 解释为什么必须这样做。

**替代方案：** 如果是 forbidden 规则，提供正确的替代方案。
```

---

## 📚 相关文档

- [Remotion 官方文档](https://www.remotion.dev/docs)
- [技能设计文档](../../../docs/design/remotion-skill-rules-implementation.md)
- [改进方案](../../../docs/design/remotion-skill-improvement-plan.md)

---

## 🚀 未来改进

- [ ] 添加规则验证测试
- [ ] 规则版本管理
- [ ] 规则搜索和过滤
- [ ] 规则依赖管理
- [ ] 规则性能分析

---

**版本:** 1.0.0
**最后更新:** 2026-01-24
