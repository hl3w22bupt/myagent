# Animation Presets - 动画预设库

常用的动画配置预设，可以直接在代码中使用。

## Spring Animations

### Smooth Entrance（平滑进入）
```typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }
});
```

**特点：** 无回弹，平滑过渡
**适用场景：** 标题显示、淡入效果、微妙动画

---

### Snappy UI（快速响应）
```typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 20, stiffness: 200 }
});
```

**特点：** 快速，最小回弹
**适用场景：** UI 元素、按钮、交互反馈

---

### Bouncy Entrance（弹跳进入）
```typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 8 }
});
```

**特点：** 明显的弹跳效果
**适用场景：** 引人注目的进入动画、有趣的内容

---

### Heavy Slow（厚重缓慢）
```typescript
const y = spring({
  frame,
  fps,
  config: { damping: 15, stiffness: 80, mass: 2 }
});
```

**特点：** 慢速，小回弹
**适用场景：** 大元素、戏剧性揭示

---

## Easing Functions

### Ease In Quad（慢入快出）
```typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.in(Easing.quad)
});
```

**适用场景：** 退出动画

---

### Ease Out Quad（快入慢出）
```typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.out(Easing.quad)
});
```

**适用场景：** 进入动画

---

### Ease In Out Quad（两端慢）
```typescript
const value = interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.inOut(Easing.quad)
});
```

**适用场景：** 平滑过渡

---

## Common Patterns

### Fade In
```typescript
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: 'clamp'
});
```

### Slide From Left
```typescript
const x = interpolate(frame, [0, 30], [-500, 0], {
  extrapolateRight: 'clamp'
});
```

### Scale Up
```typescript
const scale = spring({
  frame,
  fps,
  config: { damping: 200 }
});
```
