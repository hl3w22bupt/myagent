# FORBIDDEN 规则 - 严禁使用的模式

以下模式和 API **严禁使用**，它们会导致渲染失败、闪烁或不一致。

## 1. CSS Transitions 和 Animations

❌ **禁止：**
```typescript
// 所有这些都会导致问题
<div style={{ transition: 'all 1s' }}>Content</div>
<div style={{ animation: 'fadeIn 1s' }}>Content</div>
<div className="transition-all duration-1000">Content</div>  // Tailwind
```

**原因：** CSS 动画基于真实时间，Remotion 无法在渲染中正确捕获它们。

**替代方案：** 使用 `interpolate()` 或 `spring()`：
```typescript
const opacity = interpolate(frame, [0, 30], [0, 1]);
<div style={{ opacity }}>Content</div>
```

---

## 2. Tailwind 动画类

❌ **禁止：**
```typescript
// 这些类不会正常工作
<div className="animate-bounce">Content</div>
<div className="animate-pulse">Content</div>
<div className="transition-all">Content</div>
<div className="duration-1000">Content</div>
```

**替代方案：** 使用 Remotion 动画系统 + Tailwind 的静态样式。

---

## 3. setTimeout 和 setInterval

❌ **禁止：**
```typescript
useEffect(() => {
  setTimeout(() => {
    setState('done');
  }, 1000);  // ❌ 基于时间，不可靠
}, []);
```

**原因：** 异步时间操作会导致渲染不一致。

**替代方案：** 使用帧驱动：
```typescript
const frame = useCurrentFrame();
const isDone = frame >= 30;  // 在第 30 帧完成
```

---

## 4. 异步操作在 useEffect 中

❌ **禁止：**
```typescript
useEffect(() => {
  fetch('/api/data').then(data => setData(data));  // ❌
}, []);
```

**原因：** 异步副作用在渲染中会导致问题。

**替代方案：**
- 使用 `calculateMetadata` 预加载数据
- 在组件外部准备数据
- 使用 `delayRender()` / `continueRender()`

---

## 5. 修改状态的副作用

❌ **避免：**
```typescript
const [value, setValue] = useState(0);

useEffect(() => {
  setValue(frame);  // ❌ 会导致额外渲染
}, [frame]);
```

**替代方案：** 直接计算，不使用 state：
```typescript
const value = frame;  // ✅ 直接使用 frame
```
