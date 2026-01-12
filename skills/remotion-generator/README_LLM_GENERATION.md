# LLM-Driven Remotion Video Generation

## 概述

这是 Remotion Video Generator Skill 的新一代生成系统，使用两阶段 LLM 流程替代硬编码模板，能够理解任意数学/教学主题并生成定制化的教育视频。

## 架构

### 两阶段生成流程

```
用户描述 (自然语言)
    ↓
┌─────────────────────────────────────┐
│  Phase 1: Content Analysis (LLM)    │
│  ─────────────────────────────────  │
│  • 识别主题 (泰勒公式、勾股定理等)    │
│  • 提取关键要素 (公式、可视化)       │
│  • 设计场景结构 (3-5个场景)          │
│  • 规划可视化策略                    │
└──────────────┬──────────────────────┘
               ↓
        结构化分析结果 (JSON)
               ↓
┌─────────────────────────────────────┐
│  Phase 2: Code Generation (LLM)     │
│  ─────────────────────────────────  │
│  • 生成完整 Remotion TypeScript 代码 │
│  • 包含 Composition、组件、动画      │
│  • 优化性能和代码质量                │
└──────────────┬──────────────────────┘
               ↓
        完整的 Remotion 代码
               ↓
┌─────────────────────────────────────┐
│  Phase 3: Validation                │
│  ─────────────────────────────────  │
│  • 语法检查                          │
│  • 结构验证                          │
│  • 失败时自动重试                    │
└──────────────┬──────────────────────┘
               ↓
        最终代码 → 渲染视频
```

### Fallback 策略

系统采用多层 fallback 机制确保可靠性：

1. **LLM 两阶段生成** (首选)
   - 使用 Claude 3.5 Sonnet 进行内容分析和代码生成
   - 自动验证生成的代码质量
   - 失败时自动重试一次

2. **模板匹配** (fallback)
   - 如果 LLM 生成失败，使用预定义模板
   - 支持 minimal, corporate, presentation, animated, cinematic, educational

3. **Minimal 模板** (最终 fallback)
   - 确保至少能生成基础视频

## 核心组件

### 1. LLMClient (`generators/llm_client.py`)

统一的 LLM API 接口，支持 Anthropic Claude。

```python
from generators import get_llm_client

llm = get_llm_client(model="claude-3-5-sonnet-20241022")
response = await llm.generate(
    prompt="Explain quantum computing",
    max_tokens=1000,
    temperature=0.7
)
```

**特性**:
- 自动重试机制（指数退避）
- 超时控制
- Token 使用估算
- 批量生成支持

### 2. ContentAnalyzer (`generators/llm_analyzer.py`)

Phase 1: 分析用户描述，提取结构化信息。

```python
from generators import ContentAnalyzer

analyzer = ContentAnalyzer()
analysis = await analyzer.analyze(
    "生成一个泰勒公式的教学视频，重点讲解它的核心理念"
)

# analysis 包含:
# - topic: 主题信息
# - key_elements: 关键要素（公式、可视化、逻辑步骤）
# - scenes: 场景分解（3-5个场景，带时间分配）
# - visualization: 可视化策略
# - educational: 教学方法
```

**输出示例**:
```json
{
  "topic": {
    "name": "泰勒公式",
    "category": "calculus",
    "difficulty": "intermediate"
  },
  "scenes": [
    {
      "id": "scene_1",
      "title": "Title",
      "duration_percent": 15,
      "content_type": "title",
      "description": "Introduction to Taylor Series"
    },
    ...
  ],
  "visualization": {
    "primary_visual": "curve_comparison",
    "color_scheme": {
      "primary": "#3B82F6",
      "secondary": "#10B981",
      "accent": "#F59E0B"
    }
  }
}
```

### 3. RemotionCodeGenerator (`generators/code_generator.py`)

Phase 2: 基于分析结果生成完整的 Remotion 代码。

```python
from generators import RemotionCodeGenerator

generator = RemotionCodeGenerator()
code = await generator.generate(
    analysis=analysis,
    duration=10,      # 10秒视频
    fps=30,          # 30 FPS
    resolution="1920x1080"
)

# 或者直接从描述生成
code = await generator.generate_from_description(
    description="生成一个勾股定理的教学视频",
    duration=10,
    fps=30,
    resolution="1920x1080"
)
```

**生成的代码包含**:
- ✅ 正确的 TypeScript 接口定义
- ✅ Composition 配置
- ✅ 场景管理逻辑
- ✅ 平滑动画（interpolate, spring）
- ✅ 响应式设计
- ✅ 性能优化

### 4. CodeValidator (`generators/validator.py`)

验证生成的代码质量。

```python
from generators import CodeValidator

validator = CodeValidator()
is_valid, errors, warnings = validator.validate(code)

if not is_valid:
    print("Errors:", errors)
    # 可以用错误反馈进行重试
    error_feedback = validator.generate_error_feedback(errors)
    new_code = await generator.generate(
        analysis,
        error_context=error_feedback
    )
```

**验证项**:
- ✅ 必需的 Remotion imports
- ✅ Composition 正确定义
- ✅ registerRoot 调用
- ✅ TypeScript 接口定义
- ✅ 场景时间合理性
- ✅ 常见反模式检测

## 安装和配置

### 1. 安装依赖

```bash
# 安装 Python 依赖
pip install anthropic==0.40.0

# 或使用 uv
uv pip install anthropic==0.40.0
```

### 2. 设置 API Key

创建 `.env` 文件：

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

或设置环境变量：

```bash
export ANTHROPIC_API_KEY='your-api-key-here'
```

### 3. 验证安装

运行测试脚本：

```bash
cd skills/remotion-generator
python test_llm_integration.py
```

## 使用示例

### 基础使用

```python
from handler import RemotionVideoGenerator

generator = RemotionVideoGenerator()

# 生成视频
result = await generator.generate_video({
    "description": "生成一个泰勒公式的教学视频，重点讲解多项式逼近",
    "duration": 15,
    "fps": 30,
    "resolution": "1920x1080"
})

print(f"Video saved to: {result['video_path']}")
```

### 高级使用：直接使用生成器

```python
from generators import ContentAnalyzer, RemotionCodeGenerator, CodeValidator

# Phase 1: 分析
analyzer = ContentAnalyzer()
analysis = await analyzer.analyze(
    "解释微积分基本定理：导数和积分的关系"
)

# Phase 2: 生成代码
generator = RemotionCodeGenerator()
code = await generator.generate(
    analysis=analysis,
    duration=20,
    fps=30,
    resolution="1920x1080"
)

# Phase 3: 验证
validator = CodeValidator()
is_valid, errors, warnings = validator.validate(code)

if is_valid:
    print("✅ Code is valid!")
else:
    print(f"❌ Errors: {errors}")
```

### 批量生成

```python
from generators import get_llm_client

llm = get_llm_client()

descriptions = [
    "勾股定理教学视频",
    "泰勒公式可视化",
    "导数的几何意义"
]

# 批量分析
from generators import ContentAnalyzer
analyzer = ContentAnalyzer()

analyses = []
for desc in descriptions:
    analysis = await analyzer.analyze(desc)
    analyses.append(analysis)

# 批量生成代码
from generators import RemotionCodeGenerator
generator = RemotionCodeGenerator()

codes = []
for analysis in analyses:
    code = await generator.generate(analysis, duration=10)
    codes.append(code)
```

## 性能优化

### 缓存

ContentAnalyzer 和 RemotionCodeGenerator 自动缓存结果：

```python
from generators import ContentAnalyzer

analyzer = ContentAnalyzer()

# 第一次调用：使用 LLM
analysis1 = await analyzer.analyze("泰勒公式教学")

# 第二次调用相同内容：从缓存返回
analysis2 = await analyzer.analyze("泰勒公式教学")

# 查看缓存统计
print(analyzer.get_stats())
# {'total_generations': 1, 'cache_hits': 1, 'cache_hit_rate': '50.0%'}
```

### 统计信息

```python
# 查看生成器统计
analyzer_stats = analyzer.get_stats()
generator_stats = generator.get_stats()
validator_stats = validator.get_validation_summary()

print("Analyzer:", analyzer_stats)
print("Generator:", generator_stats)
print("Validator:", validator_stats)
```

## 故障排除

### 常见问题

**1. LLM API 错误**

```
Error: ANTHROPIC_API_KEY not found
```

**解决方案**: 设置环境变量或创建 `.env` 文件

**2. 代码验证失败**

```
Validation failed: Missing Composition component
```

**解决方案**: 系统会自动重试。如果持续失败，检查：
- API key 是否有效
- 是否有足够的 API 配额
- 网络连接是否正常

**3. 生成速度慢**

**解决方案**:
- 使用缓存（相同描述第二次会很快）
- 调整 `max_tokens` 参数
- 使用更快的模型（如果可用）

### 调试模式

启用详细日志：

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# 现在运行生成会看到详细日志
generator = RemotionVideoGenerator()
result = await generator.generate_video({...})
```

## 下一步

- [ ] 添加更多可视化组件库（Phase 4）
- [ ] 实现 Python 数学计算辅助生成
- [ ] 添加 Few-Shot 示例库
- [ ] 性能基准测试
- [ ] 添加单元测试覆盖

## 相关文档

- [设计文档](../../docs/design/remotion-llm-generator.md)
- [关键要素分析](../../docs/design/remotion-key-elements-analysis.md)
- [Python vs TypeScript 角色说明](../../docs/design/python-vs-typescript-roles.md)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT
