# RECOMMENDED 规则 - 最佳实践

这些规则能提升代码质量和用户体验，强烈推荐遵守。

## 1. 使用 spring() 而非 interpolate()

💡 **推荐：**
```typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }  // smooth
});
```

**原因：** `spring()` 基于物理模拟，动画更自然流畅。

**例外情况：** 当需要精确控制值时使用 `interpolate()`。

---

## 2. 使用 Sequence 管理时序

💡 **推荐：**
```typescript
import { Sequence } from 'remotion';

const { fps } = useVideoConfig();

<Sequence from={0} durationInFrames={90}>
  <Scene1 />
</Sequence>
<Sequence from={90} durationInFrames={90}>
  <Scene2 />
</Sequence>
```

**原因：** `Sequence` 提供清晰的时间管理和 `premount` 功能。

---

## 3. 为 Sequence 添加 premount

💡 **推荐：**
```typescript
<Sequence from={0} durationInFrames={90} premountFor={30}>
  <Scene />
</Sequence>
```

**原因：** `premountFor` 提前加载组件，避免出现时的闪烁。

---

## 4. 使用 AbsoluteFill 作为根容器

💡 **推荐：**
```typescript
import { AbsoluteFill } from 'remotion';

export const MyScene = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: 'white' }}>
      {/* 内容 */}
    </AbsoluteFill>
  );
};
```

**原因：** `AbsoluteFill` 自动处理定位和尺寸，减少重复代码。

---

## 5. 缓存昂贵的计算

💡 **推荐：**
```typescript
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { useMemo } from 'react';

export const MyComponent = () => {
  const frame = useCurrentFrame();

  const expensiveValue = useMemo(() => {
    return calculateExpensiveValue(frame);
  }, [frame]);

  return <div>{expensiveValue}</div>;
};
```

**原因：** 避免每帧重新计算复杂逻辑。

---

## 6. 使用 Series 管理连续序列

💡 **推荐：**
```typescript
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
```

**原因：** `Series` 自动处理时序，不需要手动计算 `from` 值。
