# MUST 规则 - 强制性要求

所有生成的 Remotion 代码**必须**遵守以下规则，违反会导致渲染失败或错误。

## 1. 使用 useCurrentFrame() 驱动所有动画

✅ **正确做法：**
```typescript
import { useCurrentFrame, useVideoConfig } from 'remotion';

export const MyComponent = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1]);
  return <div style={{ opacity }}>Content</div>;
};
```

❌ **错误做法：**
```typescript
// 禁止使用 CSS 动画
<div style={{
  transition: 'opacity 1s'  // ❌ 这不会在渲染中工作
}}>
  Content
</div>
```

**原因：** Remotion 需要基于帧的确定性动画。CSS transitions/animations 依赖于真实时间，在渲染过程中无法正确工作。

---

## 2. 定义 durationInFrames

✅ **正确做法：**
```typescript
<Composition
  id="MyComp"
  component={MyComponent}
  durationInFrames={300}  // ✅ 必须定义
  fps={30}
  width={1920}
  height={1080}
/>
```

❌ **错误做法：**
```typescript
<Composition
  id="MyComp"
  component={MyComponent}
  // ❌ 缺少 durationInFrames
  fps={30}
  width={1920}
  height={1080}
/>
```

---

## 3. 使用 TypeScript 类型定义

✅ **推荐做法：**
```typescript
// 使用 type 而非 interface
export type MyProps = {
  title: string;
  items: string[];
};
```

**原因：** `type` 与 `defaultProps` 配合更好，类型推断更准确。

---

## 4. 在 Root.tsx 中注册 Composition

✅ **正确做法：**
```typescript
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
```

---

## 5. 静态资源必须使用 staticFile()

✅ **正确做法：**
```typescript
import { staticFile } from 'remotion';
import { Img } from '@remotion/img';

<Img src={staticFile("image.png")} />
```

❌ **错误做法：**
```typescript
// ❌ 不要直接使用相对路径
<img src="/public/image.png" />
```
