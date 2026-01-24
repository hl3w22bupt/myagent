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
```typescript
// 逐步展示公式
const chars = formula.split('');
const visibleChars = Math.floor(frame / 2); // 每2帧显示1个字符
const visibleFormula = chars.slice(0, visibleChars).join('');

<AbsoluteFill>
  <div style={{ fontSize: 60, textAlign: 'center' }}>
    {visibleFormula}
  </div>
</AbsoluteFill>
```

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
```typescript
<AbsoluteFill style={{ display: 'flex', flexDirection: 'row' }}>
  <div style={{ flex: 1, backgroundColor: '#f0f0f0' }}>
    <ConceptA />
  </div>
  <div style={{ flex: 1, backgroundColor: '#e0e0e0' }}>
    <ConceptB />
  </div>
</AbsoluteFill>
```

---

## Step-by-Step Proof（分步推导）

**适用场景：** 数学证明、逻辑推导、解题过程

**场景结构：**
1. **标题 (5%)** - 证明主题
2. **推导步骤 (80%)** - 逐步推导（3-5步）
3. **结论 (15%)** - 最终结论和意义

**动画策略：** sequential + cumulative（累积显示）

**代码示例：**
```typescript
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
```

---

## Visual Demonstration（可视化演示）

**适用场景：** 几何原理、物理过程、动态可视化

**场景结构：**
1. **标题 (10%)** - 演示主题
2. **环境设置 (20%)** - 展示演示环境
3. **核心动画 (50%)** - 主要动画演示
4. **原理解释 (20%)** - 解释原理

**动画策略：** spring + interpolate（连续运动）

---

## Data Visualization（数据可视化）

**适用场景：** 统计数据、趋势分析、图表展示

**场景结构：**
1. **标题 (10%)** - 数据主题
2. **图表展示 (70%)** - 逐步展示图表
3. **数据洞察 (20%)** - 关键发现

**动画策略：** staggered + progressive（交错动画）

**代码示例：**
```typescript
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
```
