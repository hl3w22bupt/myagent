# Remotion教育视频LLM生成系统设计文档

## 📋 文档信息

- **版本**: v1.0
- **创建日期**: 2025-01-12
- **设计者**: Claude (System Design)
- **状态**: Design Phase

---

## 1. 问题分析

### 1.1 当前问题

**硬编码的教育模板**：
- `_template_educational` 完全硬编码为勾股定理内容
- 无法适配其他数学概念（泰勒公式、微积分等）
- 标题提取逻辑有限，无法正确识别所有主题

**用户需求 vs 实际输出**：
```
输入: "生成一个泰勒公式的教学视频"
期望: 泰勒公式可视化、多项式逼近动画、误差分析
实际: 勾股定理（a² + b² = c²）
```

### 1.2 根本原因

当前实现采用**模板匹配**而非**内容生成**：
- ❌ 使用预定义模板 + 简单关键词匹配
- ❌ 无法理解用户的具体教学需求
- ❌ 无法生成定制化的可视化内容

### 1.3 目标

实现真正的**自然语言理解 → 个性化视频生成**：
- ✅ 理解用户描述的教学主题
- ✅ 生成主题相关的可视化代码
- ✅ 遵循教学逻辑（引入 → 展开 → 总结）
- ✅ 保持代码质量和可维护性

---

## 2. 整体架构设计

### 2.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户请求                                  │
│  "生成一个泰勒公式的教学视频，重点讲解它的核心理念和本质"              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Remotion Video Generator (Python)                   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Phase 1: Content Analysis (LLM)                          │   │
│  │  ───────────────────────────────────────────────────────  │   │
│  │  • 识别教学主题（数学概念、定理、公式）                      │   │
│  │  • 提取关键要素（定义、公式、几何意义）                      │   │
│  │  • 确定教学结构（场景序列、时间分配）                        │   │
│  │  • 设计可视化策略（图形、动画、颜色）                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Phase 2: Code Generation (LLM)                           │   │
│  │  ───────────────────────────────────────────────────────  │   │
│  │  • 生成完整的Remotion React/TypeScript代码                 │   │
│  │  • 包含Composition定义、组件、动画                          │   │
│  │  • 优化性能（interpolate, spring）                         │   │
│  │  • 确保代码正确性（类型检查、语法）                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Phase 3: Validation & Fallback                           │   │
│  │  ───────────────────────────────────────────────────────  │   │
│  │  • 代码验证（语法检查、结构验证）                           │   │
│  │  • 失败时回退到通用模板                                     │   │
│  │  • 记录生成日志和失败案例                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Phase 4: Rendering (Remotion CLI)                        │   │
│  │  ───────────────────────────────────────────────────────  │   │
│  │  • 创建临时项目                                            │   │
│  │  • 执行remotion render                                    │   │
│  │  • 返回视频文件                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 模块划分

```python
remotion-generator/
├── handler.py                    # 主入口（现有）
├── generators/
│   ├── __init__.py
│   ├── base_generator.py         # 基础生成器接口
│   ├── llm_analyzer.py           # Phase 1: 内容分析
│   ├── code_generator.py         # Phase 2: 代码生成
│   └── validator.py              # Phase 3: 代码验证
├── prompts/
│   ├── __init__.py
│   ├── analysis_prompt.py        # 分析阶段Prompt模板
│   └── code_prompt.py            # 生成阶段Prompt模板
└── templates/
    ├── fallback.tsx              # 回退模板
    └── snippets/                 # 代码片段库
        ├── animations.py         # 常用动画片段
        ├── visualizations.py     # 可视化组件片段
        └── formulas.py           # 数学公式片段
```

### 2.3 数据流

```
User Input (description)
    │
    ▼
Content Analysis (LLM)
    │
    ├─→ Topic: "泰勒公式"
    ├─→ Key Elements: [多项式逼近, 导数匹配, 误差分析]
    ├─→ Scene Structure: [标题(2s) → 引入(3s) → 展开(4s) → 总结(1s)]
    └─→ Visual Style: [曲线动画, 公式展示, 对比图]
    │
    ▼
Code Generation (LLM)
    │
    ├─→ Composition: "TaylorSeriesVideo"
    ├─→ Components: [TitleScene, IntroScene, TaylorExpansion, ErrorAnalysis]
    ├─→ Animations: [interpolate, spring for smooth transitions]
    └─→ Visuals: [SVG paths for curves, math formulas]
    │
    ▼
Validation
    │
    ├─→ TypeScript syntax check ✓
    ├─→ Component structure check ✓
    └─→ Remotion API validation ✓
    │
    ▼
Remotion Rendering
    │
    └─→ Output: taylor_series_video.mp4
```

---

## 3. LLM Prompt工程策略

### 3.1 两阶段生成策略

借鉴PTC Generator的成功经验，采用**两阶段生成**：

#### Phase 1: Content Analysis（内容分析）

**目标**: 理解用户意图，提取结构化信息

**Prompt设计**:
```python
ANALYSIS_PROMPT = """
You are an educational video content analyzer specializing in mathematics and science.

## Task
Analyze the user's video description and extract structured information for code generation.

## User Description
{description}

## Your Analysis Should Include:

1. **Topic Identification**
   - Primary subject (e.g., "Taylor Series", "Pythagorean Theorem")
   - Category (calculus, geometry, algebra, etc.)
   - Difficulty level (introductory, intermediate, advanced)

2. **Key Mathematical Elements**
   - Formulas involved
   - Visual representations needed (graphs, diagrams, animations)
   - Step-by-step logic to explain

3. **Scene Structure**
   Break down into 3-5 scenes:
   - Scene 1: Title/Introduction (15-20% of duration)
   - Scene 2: Concept Introduction (25-30%)
   - Scene 3: Main Content/Demonstration (30-40%)
   - Scene 4: Examples/Applications (15-20%)
   - Scene 5: Summary (10-15%)

4. **Visualization Strategy**
   - Type of visual (SVG graph, formula animation, diagram)
   - Color scheme (suggest 2-3 primary colors)
   - Animation style (fade, slide, spring, interpolate)

5. **Educational Approach**
   - Key points to emphasize
   - Common misconceptions to address
   - Memory aids or visual hooks

## Output Format (JSON):
```json
{{
  "topic": {{
    "name": "string",
    "category": "string",
    "difficulty": "introductory|intermediate|advanced"
  }},
  "key_elements": {{
    "formulas": ["string"],
    "visuals": ["string"],
    "logic_steps": ["string"]
  }},
  "scenes": [
    {{
      "id": "scene_1",
      "title": "string",
      "duration_percent": 15,
      "content_type": "title|introduction|demonstration|example|summary",
      "description": "string",
      "visual_elements": ["string"]
    }}
  ],
  "visualization": {{
    "primary_visual": "string",
    "color_scheme": {{
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex"
    }},
    "animation_style": "string"
  }},
  "educational": {{
    "key_points": ["string"],
    "emphasis": "string"
  }}
}}
```

**Important**:
- Be specific about the mathematical topic
- Suggest appropriate visualizations for the concept
- Ensure scene timing adds up to 100%
- Output ONLY the JSON, no additional text
"""
```

#### Phase 2: Code Generation（代码生成）

**目标**: 基于分析结果生成完整的Remotion代码

**Prompt设计**:
```python
CODE_GENERATION_PROMPT = """
You are an expert Remotion/React developer specializing in educational math videos.

## Task
Generate complete Remotion TypeScript/React code based on the educational content analysis.

## Content Analysis
{analysis_json}

## Video Parameters
- Duration: {duration} seconds
- FPS: {fps}
- Resolution: {resolution}
- Total Frames: {total_frames}

## Code Requirements

### 1. **Structure**
```typescript
import {{ Composition, AbsoluteFill, useCurrentFrame, useVideoConfig,
         interpolate, spring, registerRoot }} from 'remotion';
import React from 'react';

// Component interfaces
interface Props {{
  // ...
}}

// Scene components
const Scene1: React.FC<Props> = ({{ ... }}) => {{ ... }};
const Scene2: React.FC<Props> = ({{ ... }}) => {{ ... }};

// Main composition
const EducationalVideo: React.FC<Props> = ({{ title, ... }}) => {{
  // Scene timing logic
  // Render current scene
}};

export const Root: React.FC = () => {{
  return (
    <Composition
      id="{composition_id}"
      component={EducationalVideo}
      durationInFrames={total_frames}
      width={width}
      height={height}
      fps={fps}
      defaultProps={{{ ... }}}
    />
  );
}};

registerRoot(Root);
```

### 2. **Scene Management**
- Use `frame` and `durationInFrames` to determine current scene
- Implement smooth transitions between scenes
- Each scene should have clear visual purpose

### 3. **Animations**
- Use `interpolate()` for linear animations (opacity, position)
- Use `spring()` for organic animations (scale, rotation)
- Ensure animations complete before scene transitions

### 4. **Visualization Components**
Create specialized components for:
- **Math Formulas**: Use proper formatting (superscripts, subscripts, Greek letters)
- **Graphs/Plots**: Use SVG for precise control
- **Diagrams**: Clear, labeled visual elements
- **Text**: Readable fonts (Georgia for formulas, sans-serif for text)

### 5. **Color & Style**
- Use the suggested color scheme from analysis
- Ensure text contrast (WCAG AA minimum)
- Professional, educational aesthetic

### 6. **Performance**
- Avoid complex calculations in render
- Use `useMemo` for expensive computations
- Pre-calculate values where possible

## Topic-Specific Guidelines

### For Calculus (Derivatives, Integrals, Taylor Series):
- Show curves with SVG paths
- Animate point movement along curves
- Use color coding (original vs. approximation)
- Show error reduction visually

### For Geometry (Triangles, Circles):
- Clear, labeled diagrams
- Animated construction steps
- Right angle markers, dimension lines

### For Algebra (Equations, Functions):
- Step-by-step equation solving
- Highlight transformations
- Use color to track variables

## Code Quality Checklist
- [ ] Valid TypeScript syntax
- [ ] No `any` types without justification
- [ ] Proper prop interfaces
- [ ] Accessible colors and font sizes
- [ ] Responsive to frame count
- [ ] No hardcoded duration values (use percentages of total_frames)

## Output
Output ONLY the complete TypeScript code, wrapped in \`\`\`typescript code blocks.
No explanations, no markdown outside the code block.
"""
```

### 3.2 Prompt优化策略

**Few-Shot Learning**:
```python
# 在prompt中包含成功示例
EXAMPLES = """
## Example 1: Pythagorean Theorem (Good)
Input: "生成勾股定理教学视频"
Analysis: {{ ... }}
Code: [完整的勾股定理Remotion代码]

## Example 2: Taylor Series (Good)
Input: "Explain Taylor series approximation"
Analysis: {{ ... }}
Code: [完整的泰勒公式Remotion代码]
"""
```

**Chain-of-Thought**:
```python
# 引导LLM逐步思考
STEP_BY_STEP = """
Think step-by-step:
1. What is the core mathematical concept?
2. What visual elements best represent it?
3. How should scenes flow to teach it effectively?
4. What animations enhance understanding?
5. What code structure implements this?
"""
```

**Self-Correction**:
```python
VALIDATION_PROMPT = """
Review your generated code:
- Are all imports correct?
- Is the composition ID properly set?
- Do all components have proper TypeScript interfaces?
- Will animations complete within scene boundaries?
- Is the total frame count correct?

Fix any issues before outputting.
"""
```

---

## 4. 代码生成流程

### 4.1 完整流程图

```
┌──────────────────────────────────────────────────────────────┐
│  1. generate_video(input_data)                               │
│     └─→ Extract: description, duration, fps, resolution      │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  2. _analyze_content(description)                            │
│     ┌─→ LLM Call: Analysis Prompt                           │
│     └─→ Return: Structured analysis (JSON)                  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  3. _generate_remotion_code(analysis, params)                │
│     ┌─→ LLM Call: Code Generation Prompt                    │
│     ├─→ Include: analysis, examples, best practices         │
│     └─→ Return: Complete TypeScript code                    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  4. _validate_code(generated_code)                           │
│     ├─→ Syntax check (basic parsing)                         │
│     ├─→ Structure check (Composition, components)            │
│     ├─→ API check (Remotion imports)                         │
│     └─→ Return: valid=True/False + errors                   │
└──────────────────────┬───────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
      Valid=True            Valid=False
            │                     │
            ▼                     ▼
┌───────────────────┐   ┌──────────────────────┐
│ 5. Use Generated  │   │ Fallback:            │
│    Code           │   │ _template_minimal()  │
└─────────┬─────────┘   └──────────┬───────────┘
          │                         │
          └───────────┬─────────────┘
                      ▼
          ┌───────────────────────┐
          │ 6. Render Video        │
          │    (Existing logic)    │
          └───────────────────────┘
```

### 4.2 核心实现伪代码

```python
class LLMRemotionGenerator:
    def __init__(self, llm_client: LLMClient):
        self.llm = llm_client
        self.cache = ContentCache()  # 缓存相似请求

    async def generate_video(self, input_data: Dict) -> Dict:
        # 1. Extract parameters
        description = input_data['description']
        duration = input_data.get('duration', 10)
        fps = input_data.get('fps', 30)
        resolution = input_data.get('resolution', '1920x1080')

        # 2. Check cache
        cache_key = self._cache_key(description, duration, resolution)
        cached_code = self.cache.get(cache_key)
        if cached_code:
            logger.info("Using cached generated code")
            remotion_code = cached_code
        else:
            # 3. Analyze content
            analysis = await self._analyze_content(description)
            logger.info(f"Content analysis: {analysis['topic']['name']}")

            # 4. Generate code
            remotion_code = await self._generate_code(
                analysis, duration, fps, resolution
            )

            # 5. Validate
            is_valid, errors = self._validate_code(remotion_code)

            if not is_valid:
                logger.warning(f"Generated code validation failed: {errors}")
                # Retry once with error feedback
                remotion_code = await self._generate_code(
                    analysis, duration, fps, resolution,
                    error_context=errors
                )

            # 6. Cache valid code
            if is_valid:
                self.cache.set(cache_key, remotion_code)

        # 7. Render (existing logic)
        video_info = await self._render_video(
            remotion_code, duration, fps, resolution, ...
        )

        return video_info

    async def _analyze_content(self, description: str) -> Dict:
        """Phase 1: Analyze user description"""
        prompt = self._build_analysis_prompt(description)

        response = await self.llm.generate(
            prompt=prompt,
            max_tokens=2000,
            temperature=0.3,  # Low temperature for consistent analysis
            response_format="json"
        )

        # Parse and validate JSON
        try:
            analysis = json.loads(response.content)
            return self._normalize_analysis(analysis)
        except json.JSONDecodeError:
            logger.error("Failed to parse analysis JSON")
            return self._get_default_analysis(description)

    async def _generate_code(
        self,
        analysis: Dict,
        duration: int,
        fps: int,
        resolution: str,
        error_context: Optional[str] = None
    ) -> str:
        """Phase 2: Generate Remotion code"""
        prompt = self._build_code_prompt(
            analysis, duration, fps, resolution, error_context
        )

        response = await self.llm.generate(
            prompt=prompt,
            max_tokens=4000,  # Longer for code
            temperature=0.2,  # Lower for consistent code
            response_format="text"
        )

        # Extract code from markdown
        code = self._extract_code_block(response.content, "typescript")

        return code

    def _validate_code(self, code: str) -> Tuple[bool, List[str]]:
        """Phase 3: Validate generated code"""
        errors = []

        # Check 1: Basic structure
        if 'import' not in code or 'Composition' not in code:
            errors.append("Missing required Remotion imports")

        # Check 2: Composition definition
        if 'export const Root' not in code and 'export default' not in code:
            errors.append("Missing Root component export")

        # Check 3: registerRoot call
        if 'registerRoot' not in code:
            errors.append("Missing registerRoot() call")

        # Check 4: TypeScript interfaces
        if 'interface' not in code:
            warnings.append("No TypeScript interfaces defined (recommended)")

        return len(errors) == 0, errors

    def _get_default_analysis(self, description: str) -> Dict:
        """Fallback analysis when LLM fails"""
        return {
            "topic": {
                "name": self._extract_title(description),
                "category": "general",
                "difficulty": "introductory"
            },
            "key_elements": {
                "formulas": [],
                "visuals": ["text"],
                "logic_steps": []
            },
            "scenes": [
                {
                    "id": "scene_1",
                    "title": "Title",
                    "duration_percent": 100,
                    "content_type": "title",
                    "description": description,
                    "visual_elements": ["text"]
                }
            ],
            "visualization": {
                "primary_visual": "text",
                "color_scheme": {
                    "primary": "#3B82F6",
                    "secondary": "#10B981",
                    "accent": "#F59E0B"
                },
                "animation_style": "fade"
            }
        }
```

---

## 5. 错误处理和Fallback机制

### 5.1 多层Fallback策略

```
LLM Generation
    │
    ├─→ Attempt 1: Normal generation
    │   └─→ Success? ─Yes─→ Use code
    │       │
    │       └No
    │           │
    │           ▼
    ├─→ Attempt 2: Retry with error feedback
    │   └─→ Success? ─Yes─→ Use code
    │       │
    │       └No
    │           │
    │           ▼
    ├─→ Attempt 3: Simplified prompt (fewer requirements)
    │   └─→ Success? ─Yes─→ Use code
    │       │
    │       └No
    │           │
    │           ▼
    └─→ Fallback: Use predefined template
        └─→ Minimal or educational template
```

### 5.2 错误分类和处理

| 错误类型 | 检测方法 | 处理策略 | 日志级别 |
|---------|---------|---------|---------|
| **LLM API错误** | try/except LLM调用 | 使用缓存或模板 | ERROR |
| **JSON解析失败** | json.loads() try/except | 使用默认分析 | WARN |
| **代码生成失败** | 提取code_block为空 | 重试或fallback | WARN |
| **验证失败** | 结构检查 | 重试1次，然后fallback | WARN |
| **渲染失败** | subprocess返回非0 | 降级分辨率/时长 | ERROR |
| **超时** | 计时器 | 使用快速模板 | ERROR |

### 5.3 Fallback实现

```python
async def _generate_with_fallback(
    self,
    description: str,
    params: Dict
) -> str:
    """Generate code with multiple fallback strategies"""

    # Strategy 1: Normal LLM generation
    try:
        code = await self._llm_generate(description, params)
        is_valid, _ = self._validate_code(code)
        if is_valid:
            return code
    except Exception as e:
        logger.warning(f"Strategy 1 failed: {e}")

    # Strategy 2: Retry with simplified prompt
    try:
        code = await self._llm_generate_simplified(description, params)
        is_valid, _ = self._validate_code(code)
        if is_valid:
            return code
    except Exception as e:
        logger.warning(f"Strategy 2 failed: {e}")

    # Strategy 3: Use enhanced template (not hardcoded)
    try:
        topic = self._extract_topic(description)
        code = self._template_enhanced(topic, params)
        return code
    except Exception as e:
        logger.error(f"Strategy 3 failed: {e}")

    # Strategy 4: Final fallback to minimal template
    logger.error("All strategies failed, using minimal template")
    return self._template_minimal(description, params)
```

---

## 6. 性能优化考虑

### 6.1 LLM调用优化

**缓存策略**:
```python
class ContentCache:
    """Cache for similar content requests"""

    def __init__(self, max_size: int = 100):
        self.cache = {}
        self.max_size = max_size

    def _cache_key(self, description: str, params: Dict) -> str:
        # Normalize description (remove punctuation, lowercase)
        normalized = re.sub(r'[^\w\s]', '', description.lower())
        # Create hash of params
        params_hash = hash(json.dumps(params, sort_keys=True))
        return f"{normalized[:50]}_{params_hash}"

    def get(self, key: str) -> Optional[str]:
        return self.cache.get(key)

    def set(self, key: str, code: str, ttl: int = 3600):
        # Evict oldest if cache is full
        if len(self.cache) >= self.max_size:
            oldest = min(self.cache.items(), key=lambda x: x[1].timestamp)
            del self.cache[oldest[0]]

        self.cache[key] = {
            'code': code,
            'timestamp': time.time(),
            'ttl': ttl
        }
```

**批量处理**:
```python
# 如果有多个相似请求，批量分析
async def analyze_batch(self, descriptions: List[str]) -> List[Dict]:
    prompt = self._build_batch_prompt(descriptions)
    response = await self.llm.generate(prompt)
    return self._parse_batch_response(response)
```

### 6.2 Token优化

**Prompt压缩**:
```python
# 只包含必要的示例
EXAMPLES_BY_CATEGORY = {
    "calculus": CALCULUS_EXAMPLE,
    "geometry": GEOMETRY_EXAMPLE,
    "algebra": ALGEBRA_EXAMPLE
}

def build_prompt(self, category: str) -> str:
    # 只包含相关类别的示例
    example = EXAMPLES_BY_CATEGORY.get(category, GENERAL_EXAMPLE)
    return BASE_PROMPT + example
```

**分阶段生成**:
```python
# Phase 1: 分析（低max_tokens）
analysis = await llm.generate(prompt, max_tokens=1000)

# Phase 2: 代码（仅包含分析结果，不包含原始prompt）
code_prompt = build_code_prompt(analysis)  # 更短
code = await llm.generate(code_prompt, max_tokens=3000)

# 总token: 1000 + 3000 = 4000
# vs 单次生成: 5000+
```

### 6.3 并行化

```python
# 分析和验证可以并行
async def generate_parallel(self, description: str):
    # 同时运行分析和模板准备
    analysis_task = self._analyze_content(description)
    template_task = self._prepare_template_assets()

    analysis, template = await asyncio.gather(
        analysis_task,
        template_task
    )

    # 现在可以快速生成代码
    return await self._generate_code(analysis, template)
```

### 6.4 渲染优化

**预渲染缓存**:
```python
# 对于相同参数，复用Remotion项目结构
class ProjectCache:
    def __init__(self):
        self.projects = {}

    def get_or_create(self, params_hash: str) -> Path:
        if params_hash not in self.projects:
            project_dir = self._create_remotion_project()
            self.projects[params_hash] = project_dir
        return self.projects[params_hash]
```

**增量渲染**:
```python
# 只重新渲染变化的composition
async def render_incremental(self, code: str, composition_id: str):
    # 检查是否已有项目
    if self.project_exists(composition_id):
        # 只更新index.tsx
        await self._update_code_only(code)
    else:
        # 完整创建
        await self._create_full_project(code)
```

---

## 7. 实施路线图

### Phase 1: 基础设施（1-2天）
- [ ] 创建LLM client集成
- [ ] 实现两阶段生成框架
- [ ] 添加Prompt模板系统
- [ ] 实现基础验证器

### Phase 2: Prompt工程（2-3天）
- [ ] 设计分析阶段Prompt
- [ ] 设计代码生成Prompt
- [ ] 添加Few-Shot示例
- [ ] 优化Token使用

### Phase 3: 缓存和性能（1-2天）
- [ ] 实现内容缓存
- [ ] 添加批量处理
- [ ] 优化渲染流程
- [ ] 性能测试和调优

### Phase 4: 测试和优化（2-3天）
- [ ] 单元测试（生成器、验证器）
- [ ] 集成测试（完整流程）
- [ ] 边缘案例测试
- [ ] 性能基准测试

### Phase 5: 部署和监控（1天）
- [ ] 添加详细日志
- [ ] 实现监控指标
- [ ] 错误追踪
- [ ] 文档更新

**总计**: 7-11天

---

## 8. 监控和度量

### 8.1 关键指标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| **生成成功率** | >95% | 成功/总请求数 |
| **代码质量** | 验证通过率>90% | 验证检查 |
| **生成时间** | <10秒 | 端到端计时 |
| **缓存命中率** | >30% | 缓存统计 |
| **用户满意度** | >4.0/5.0 | 反馈评分 |

### 8.2 日志策略

```python
logger.info("Generation started", extra={
    "description_length": len(description),
    "duration": duration,
    "resolution": resolution
})

logger.info("Analysis completed", extra={
    "topic": analysis["topic"]["name"],
    "num_scenes": len(analysis["scenes"]),
    "llm_tokens": response.usage
})

logger.warning("Validation failed", extra={
    "errors": errors,
    "will_retry": True
})

logger.error("All strategies failed, using fallback", extra={
    "original_error": str(e),
    "fallback_used": "minimal_template"
})
```

---

## 9. 风险和缓解

### 9.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| LLM生成代码质量不稳定 | 高 | 中 | 多层验证 + Fallback |
| LLM API限流/失败 | 高 | 低 | 缓存 + 重试机制 |
| Token成本过高 | 中 | 中 | Prompt优化 + 缓存 |
| 生成时间过长 | 中 | 低 | 并行化 + 批处理 |

### 9.2 缓解措施

**代码质量不稳定**:
- 实施严格的多阶段验证
- 收集失败案例用于改进Prompt
- 提供用户反馈机制

**API限流**:
- 实现指数退避重试
- 使用缓存减少API调用
- 监控使用量，设置告警

**成本控制**:
- 优化Prompt长度
- 使用缓存复用结果
- 仅在必要时使用高成本模型

---

## 10. 附录

### 10.1 完整Prompt模板

参见 `prompts/analysis_prompt.py` 和 `prompts/code_prompt.py`

### 10.2 示例分析输出

参见 `examples/analysis_outputs/`

### 10.3 生成的代码示例

参见 `examples/generated_codes/`

---

## 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|---------|------|
| v1.0 | 2025-01-12 | 初始设计 | Claude |

---

## 审批和签字

- [ ] 技术负责人审批
- [ ] 安全审查
- [ ] 性能评估
- [ ] 产品确认
