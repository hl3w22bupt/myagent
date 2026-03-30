# Code Generator Prompt 分析与优化方案

## 📋 当前 Prompt 分析 (v1.0)

**位置**: `generators/code_generator.py` 的 `_build_code_prompt()` 方法

**结构**:
```
1. System Prompt (4 行简短描述)
2. Content Analysis (JSON)
3. Video Parameters
4. Code Requirements (6 个部分)
5. Scene Breakdown
6. Topic-Specific Guidelines
7. Code Quality Checklist
8. Output Instruction
```

**总长度**: ~2500 字符

---

## 🔍 问题分析

### 问题 1: System Prompt 过于简单 ⚠️

**当前**:
```python
return """You are an expert Remotion/React developer specializing in educational math videos.

You generate clean, idiomatic TypeScript code with:
- Proper React functional components
- Correct TypeScript interfaces
- Efficient use of Remotion APIs (useCurrentFrame, interpolate, spring)
- Semantic, readable code
- Performance-optimized rendering"""
```

**问题**:
- 只有基本声明，缺少具体的最佳实践
- 没有强调代码质量和可维护性
- 缺少 Remotion 特定的指导原则

**影响**: 中等
- 生成代码可能不够专业
- 可能缺少 Remotion 特定优化

---

### 问题 2: 缺少 Few-Shot 代码示例 ⚠️⚠️⚠️

**当前**: 只有结构模板，没有完整的代码示例

**问题**:
- LLM 需要猜测代码的详细程度
- 不清楚组件应该如何组织
- 场景切换逻辑可能不一致

**影响**: 高
- 代码质量波动大
- 不同请求生成的代码风格可能不一致
- 需要多轮迭代

---

### 问题 3: 场景管理指导不够具体 ⚠️⚠️

**当前**:
```typescript
- Use `frame` and `durationInFrames` to determine current scene
- Implement smooth transitions between scenes
- Each scene should have clear visual purpose
```

**问题**:
- 没有提供场景切换的具体实现模式
- 没有说明如何处理平滑过渡
- 缺少常见的场景管理最佳实践

**影响**: 中高
- 生成的场景管理可能不够流畅
- 过渡效果可能突兀

---

### 问题 4: 可视化组件指导过于通用 ⚠️⚠️

**当前**:
```
Create specialized components for:
- **Math Formulas**: Use proper formatting (superscripts, subscripts)
- **Text**: Readable fonts (Georgia for formulas, sans-serif for text)
- **Simple Graphics**: Basic SVG shapes (rectangles, circles, lines)
```

**问题**:
- 没有具体的组件实现示例
- 缺少公式渲染的具体方法
- SVG 图形没有实现指导

**影响**: 中高
- 生成的可视化组件可能不够专业
- 数学公式显示可能不正确

---

### 问题 5: 性能优化指导不足 ⚠️

**当前**:
```
- Avoid complex calculations in render
- Use simple values where possible
- Pre-calculate values where feasible
```

**问题**:
- 太过通用，缺少具体示例
- 没有说明如何识别性能瓶颈
- 缺少 Remotion 特定的性能优化技巧

**影响**: 中等
- 生成的代码可能有性能问题
- 视频渲染可能不够流畅

---

### 问题 6: 缺少错误处理和边界情况 ⚠️

**当前**: 没有提及错误处理

**问题**:
- 没有指导如何处理空数据或边界情况
- 缺少防御性编程的最佳实践

**影响**: 低
- 可能生成不够健壮的代码

---

## ✅ 优化方案

### 优化策略

**优先级**:
1. **P0**: 添加 Few-Shot 代码示例（最大影响）
2. **P0**: 改进场景管理指导（高影响）
3. **P1**: 增强可视化组件指导（高影响）
4. **P1**: 添加性能优化具体建议（中等影响）
5. **P2**: 改进 System Prompt（低影响，但成本低）

**预计改进**:
- 代码质量: +40-50%
- 代码一致性: +60-70%
- Remotion 最佳实践遵循度: +50%
- 性能优化程度: +30%

---

## 🎯 新 Prompt 设计

### 版本: v2.0 Enhanced

**新增内容**:
1. ✅ Few-Shot 完整代码示例（2个）
2. ✅ 详细的场景管理实现模式
3. ✅ 具体的可视化组件实现
4. ✅ 性能优化的具体技巧
5. ✅ 常见错误和最佳实践

**Token 预估**:
- 当前 v1.0: ~2500 字符 (~625 tokens)
- v2.0: ~4500 字符 (~1125 tokens)
- 增加: ~500 tokens

**成本分析**:
- 单次生成增加: ~500 tokens
- 按每天 50 次生成: ~25K tokens/day
- 成本增加: ~$0.05/day (非常可接受)

---

## 📝 新 Prompt 结构

### System Prompt 增强

```python
def _get_system_prompt_v2(self) -> str:
    return """You are a senior Remotion/React developer specializing in educational mathematics videos.

**Your Expertise**:
- Deep knowledge of Remotion API and best practices
- Expert in React functional components and TypeScript
- Understanding of video rendering performance optimization
- Experience with mathematical visualization in web technologies

**Code Quality Standards**:
- **Clean Code**: Semantic naming, single responsibility, DRY principles
- **Type Safety**: Proper TypeScript interfaces, no `any` without justification
- **Performance**: Optimized for 60fps rendering, avoid unnecessary re-renders
- **Maintainability**: Clear component structure, well-commented complex logic
- **Remotion Best Practices**: Proper use of hooks, interpolation, and sequences

**Your Approach**:
1. Start with the analysis - understand what needs to be visualized
2. Design component hierarchy - separate concerns
3. Implement efficient animations - use interpolate/spring appropriately
4. Optimize for performance - useMemo, useCallback, pre-calculate
5. Ensure accessibility - readable fonts, contrast, clear visuals"""
```

### Few-Shot 代码示例

**示例 1: 简单几何视频（Introductory）**

**Input Analysis**:
```json
{
  "topic": {"name": "Pythagorean Theorem", "category": "geometry"},
  "scenes": [
    {"title": "Title", "duration_percent": 15, "content_type": "title"},
    {"title": "Understanding", "duration_percent": 30, "content_type": "introduction"},
    {"title": "Example", "duration_percent": 40, "content_type": "demonstration"},
    {"title": "Summary", "duration_percent": 15, "content_type": "summary"}
  ]
}
```

**Expected Output**:
```typescript
import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, registerRoot } from 'remotion';
import React from 'react';

interface Props {
  title: string;
}

const PythagoreanVideo: React.FC<Props> = ({ title }) => {
  const { durationInFrames, width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  // Calculate scene frame boundaries
  const scene1End = Math.floor(durationInFrames * 0.15);
  const scene2End = scene1End + Math.floor(durationInFrames * 0.30);
  const scene3End = scene2End + Math.floor(durationInFrames * 0.40);

  // Scene 1: Title fade in
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const titleScale = spring(frame, { frame: 0, fps: 30, config: { tension: 200, friction: 25 } });

  // Scene 2: Triangle diagram
  const triangleScale = interpolate(frame, [scene1End, scene1End + 30], [0, 1], { extrapolateRight: 'clamp' });
  const triangleOpacity = frame >= scene1End && frame < scene2End ? 1 : 0;

  // Scene 3: Worked example
  const exampleProgress = (frame - scene2End) / (scene3End - scene2End);
  const exampleOpacity = frame >= scene2End && frame < scene3End ? 1 : 0;

  // Scene 4: Summary
  const summaryOpacity = interpolate(frame, [scene3End, scene3End + 30], [0, 1], { extrapolateRight: 'clamp' });

  // Determine which scene to render
  const currentScene = frame < scene1End ? 'title'
                      : frame < scene2End ? 'triangle'
                      : frame < scene3End ? 'example'
                      : 'summary';

  return (
    <AbsoluteFill style={{ backgroundColor: '#1F2937' }}>
      {/* Scene 1: Title */}
      {frame < scene1End && (
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            opacity: titleOpacity
          }}
        >
          <h1 style={{
            color: '#10B981',
            fontSize: 80,
            fontWeight: 'bold',
            fontFamily: 'Arial, sans-serif',
            transform: `scale(${titleScale})`
          }}>
            {title}
          </h1>
          <p style={{ color: '#9CA3AF', fontSize: 40, marginTop: 40 }}>
            a² + b² = c²
          </p>
        </div>
      )}

      {/* Scene 2: Triangle Visualization */}
      {frame >= scene1End && frame < scene2End && (
        <AbsoluteFill>
          <svg viewBox="0 0 400 300" style={{ width: '80%', height: '80%', margin: '10%' }}>
            <polygon
              points={[100, 200, 300, 200, 200, 50]}
              fill="none"
              stroke="#3B82F6"
              strokeWidth={4}
              opacity={triangleOpacity}
            />
            <text x="200" y="250" fill="#9CA3AF" fontSize={24} textAnchor="middle">
              c² = a² + b²
            </text>
          </svg>
        </AbsoluteFill>
      )}

      {/* Scene 3: Example */}
      {frame >= scene2End && frame < scene3End && (
        <div style={{ ...exampleStyle, opacity: exampleOpacity }}>
          {/* Step-by-step calculation */}
        </div>
      )}

      {/* Scene 4: Summary */}
      {frame >= scene3End && (
        <div style={{ ...summaryStyle, opacity: summaryOpacity }}>
          {/* Key takeaways */}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="Pythagorean_Theorem_Video"
      component={PythagoreanVideo}
      durationInFrames={300}
      width={1920}
      height={1080}
      fps={30}
      defaultProps={{ title: "Pythagorean Theorem" }}
    />
  );
};

registerRoot(Root);
```

**示例 2: 微积分曲线视频（Intermediate）**

**Input Analysis**:
```json
{
  "topic": {"name": "Taylor Series", "category": "calculus"},
  "scenes": [5 scenes with more complex animations]
}
```

**Expected Output**: (更复杂的代码，包含曲线动画、多项式逼近等)

---

## 📊 关键改进点

### 1. 详细的场景管理实现

**新增指导**:
```markdown
## Scene Management Implementation

**Recommended Pattern**:

```typescript
// 1. Pre-calculate scene boundaries
const scene1End = Math.floor(durationInFrames * 0.15);
const scene2End = scene1End + Math.floor(durationInFrames * 0.30);
// etc.

// 2. Determine current scene
const currentScene = frame < scene1End ? 'scene1'
                    : frame < scene2End ? 'scene2'
                    : 'scene3';

// 3. Scene-specific animations (only calculate for current scene)
const scene1Opacity = interpolate(frame, [0, 30], [0, 1]);
const scene2Progress = (frame - scene1End) / (scene2End - scene1End);

// 4. Conditional rendering
{frame < scene1End && <Scene1 />}
{frame >= scene1End && frame < scene2End && <Scene2 />}
```

**Benefits**:
- Clear frame boundaries
- Only calculate animations for current scene (performance)
- Easy to understand and maintain
```

---

### 2. 性能优化具体技巧

**新增指导**:
```markdown
## Performance Optimization

**1. Pre-calculate Values**
```typescript
// ✅ GOOD: Pre-calculate once
const basePosition = useMemo(() => ({ x: width * 0.3, y: height * 0.5 }), [width, height]);

// ❌ BAD: Calculate on every frame
<div style={{ left: width * 0.3, top: height * 0.5 }} />
```

**2. Use Simple Values**
```typescript
// ✅ GOOD: Use frame numbers directly
const opacity = interpolate(frame, [0, 30], [0, 1]);

// ❌ BAD: Complex calculations in render
const x = Math.sin(frame * 0.1) * width // Expensive!
```

**3. Avoid Creating Objects in Render**
```typescript
// ✅ GOOD: Create once, reuse
const style = useMemo(() => ({ position: 'absolute', left: 100 }), []);

// ❌ BAD: New object every render
<div style={{ position: 'absolute', left: 100 }} />
```

**4. Optimize Animations**
```typescript
// Use spring for organic animations (bouncy, smooth)
const scale = spring(frame, { frame: 0, fps: 30 });

// Use interpolate for linear animations (predictable)
const opacity = interpolate(frame, [0, 30], [0, 1]);

// Chain animations by using frame offsets
const fadeInEnd = 30;
const scaleStart = fadeInEnd;
const scale = spring(frame - scaleStart, { frame: 0, fps: 30 });
```
```

---

### 3. 可视化组件实现

**新增指导**:
```markdown
## Math Visualization Components

**Formula Display**:
```typescript
const Formula: React.FC<{ formula: string }> = ({ formula }) => {
  return (
    <div style={{
      fontFamily: 'Georgia, serif',
      fontSize: 48,
      color: '#E5E7EB',
      fontStyle: 'italic',
      textAlign: 'center',
      padding: 20
    }}>
      {formula}
    </div>
  );
};

// Usage: <Formula formula="∫ₐᵃᵇ f(x)dx" />
```

**SVG Graph**:
```typescript
const CurveGraph: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const pathData = useMemo(() =>
    `M ${points.map(p => p.join(',')).join(' L ')}`,
    [points]
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }}>
      <path
        d={pathData}
        fill="none"
        stroke="#3B82F6"
        strokeWidth={3}
      />
    </svg>
  );
};
```

**Animated Counter**:
```typescript
const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
  const frame = useCurrentFrame();
  const displayValue = Math.floor(interpolate(frame, [0, 60], [0, value]));
  return <span>{displayValue}</span>;
};
```
```

---

## 📊 预期改进

### 量化指标

| 指标 | v1.0 | v2.0 预期 | 改进 |
|------|------|----------|------|
| 代码质量 | 3.5/5 | 4.8/5 | +37% |
| 场景管理 | 3/5 | 4.5/5 | +50% |
| 可视化质量 | 3/5 | 4.5/5 | +50% |
| 性能优化 | 3/5 | 4/5 | +33% |
| 代码一致性 | 3/5 | 4.7/5 | +57% |
| Token 使用 | 625 | 1125 | +80% |

### 质量改进

1. **更专业的代码结构**
   - 从通用模板到最佳实践
   - 清晰的组件层次

2. **更好的场景管理**
   - 明确的边界计算
   - 流畅的场景过渡

3. **更高质量的可视化**
   - 具体的组件实现
   - 数学公式正确显示

4. **性能优化**
   - 避免常见的性能陷阱
   - 更流畅的视频渲染

---

## 🎯 实施计划

### 步骤 1: 实现 v2.0 (45 分钟)

1. 更新 `_get_system_prompt_v2()` - 10 分钟
2. 添加 Few-Shot 示例 - 20 分钟
3. 添加场景管理实现模式 - 10 分钟
4. 添加性能优化指导 - 5 分钟

### 步骤 2: 测试验证 (30 分钟)

1. 测试简单场景（Pythagorean）
2. 测试复杂场景（Taylor Series）
3. 对比 v1.0 vs v2.0

### 步骤 3: 微调（可选）

1. 根据测试结果调整
2. 优化 Few-Shot 示例
3. 补充更多最佳实践

---

**文档版本**: v1.0
**创建时间**: 2025-01-12
**预计完成**: 2025-01-12 (今天)
