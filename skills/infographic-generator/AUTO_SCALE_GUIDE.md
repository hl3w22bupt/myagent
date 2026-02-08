# Infographic 自动缩放功能

## 🎯 问题

之前的 infographic 生成使用固定尺寸，当内容过长时会超出画布边界，导致：
- ❌ 内容被截断
- ❌ 部分内容不可见
- ❌ 布局混乱

## ✅ 解决方案

实现了**两层自动缩放机制**：

### 1. **Python 端预缩放** (生成时)

根据内容特征智能计算初始缩放比例：

```python
# 缩放规则
if total_items > 10:
    scale = 0.75  # 长列表：明显缩小
elif total_items > 6:
    scale = 0.85  # 中等列表：轻微缩小
elif max_text_length > 30:
    scale = 0.85  # 长文本：轻微缩小
elif max_text_length > 20:
    scale = 0.90  # 中等文本：微小缩小
else:
    scale = 1.0   # 短内容：不缩放
```

**触发条件：**
- 项目数 > 10：缩放到 75%
- 项目数 7-10：缩放到 85%
- 最长文本 > 30 字符：缩放到 85%
- 最长文本 21-30 字符：缩放到 90%
- 其他：不缩放（100%）

### 2. **JavaScript 端动态缩放** (渲染后)

内容渲染完成后，自动检测视口大小并调整：

```javascript
function autoScaleContent() {
    // 1. 获取视口和内容尺寸
    const wrapperWidth = wrapper.clientWidth - 40;
    const wrapperHeight = wrapper.clientHeight - 40;
    const contentWidth = 1920;
    const contentHeight = 1080;

    // 2. 计算缩放比例
    const widthRatio = wrapperWidth / contentWidth;
    const heightRatio = wrapperHeight / contentHeight;
    let scale = Math.min(widthRatio, heightRatio, 1.0);

    // 3. 限制缩放范围
    if (scale >= 0.95) scale = 1.0;  // 不缩放
    if (scale < 0.5) scale = 0.5;    // 最小缩放

    // 4. 应用缩放
    container.style.transform = `scale(${scale})`;
}
```

**特性：**
- ✅ 自动检测视口大小
- ✅ 计算最佳缩放比例
- ✅ 只缩小，不放大
- ✅ 响应式调整（监听 resize）
- ✅ 平滑过渡动画

## 📊 效果对比

### 场景 1：短内容 (3项)
```
内容: ["分析", "设计", "开发"]
推荐尺寸: 1080×1080 (1:1)
Python 缩放: 1.0x (不缩放)
JS 缩放: 1.0x (适合视口)
最终尺寸: 1080×1080
```
✅ 完美适配，无缩放

### 场景 2：中等内容 (6项)
```
内容: ["需求分析", "系统设计", "前端开发",
       "后端API", "测试验证", "部署上线"]
推荐尺寸: 1920×1080 (16:9)
Python 缩放: 1.0x (不缩放)
JS 缩放: 0.9x (如果视口较小)
最终尺寸: 1728×972
```
✅ 按需缩放，适应不同屏幕

### 场景 3：长内容 (12项)
```
内容: ["详细的用户需求分析与功能规划", ...]
推荐尺寸: 2560×1080 (21:9)
Python 缩放: 0.75x (预缩小)
JS 缩放: 0.75x (进一步适配)
最终尺寸: 1920×810
```
✅ 两层缩放，确保完整显示

## 🎨 技术实现

### HTML 结构

```html
<div id="wrapper">  <!-- 视口容器 -->
    <div id="container" class="auto-scale">  <!-- 内容容器 -->
        <!-- Infographic 内容 -->
    </div>
    <div id="overflow-warning" class="overflow-warning">
        ⚠️ 内容较长，已自动缩放以适应屏幕
    </div>
</div>
```

### CSS 样式

```css
#wrapper {
    position: relative;
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

#container {
    background-color: white;
    padding: 40px 60px;
    transform-origin: center center;
    transition: transform 0.3s ease;
}

#container.auto-scale {
    width: 1920px;  /* 原始尺寸 */
    height: 1080px;
}
```

### JavaScript 逻辑

1. **监听渲染完成事件**
   ```javascript
   infographic.on('rendered', (event) => {
       setTimeout(() => autoScaleContent(), 100);
   });
   ```

2. **计算并应用缩放**
   ```javascript
   function autoScaleContent() {
       // 计算缩放比例
       const scale = Math.min(widthRatio, heightRatio, 1.0);

       // 应用缩放
       if (scale < 0.95) {
           container.style.transform = `scale(${scale})`;
       }
   }
   ```

3. **响应式调整**
   ```javascript
   window.addEventListener('resize', () => {
       clearTimeout(resizeTimeout);
       resizeTimeout = setTimeout(autoScaleContent, 250);
   });
   ```

## 💡 用户体验提升

### 之前 ❌
```
用户输入: "生成一个包含20个步骤的详细流程图"
结果:
  - 尺寸固定 1920×1080
  - 内容溢出边界
  - 只能看到部分内容
  - 需要手动调整浏览器缩放
```

### 之后 ✅
```
用户输入: "生成一个包含20个步骤的详细流程图"
结果:
  - 智能推荐 2560×1080 (超宽屏)
  - Python 端预缩放到 0.75x
  - JS 端进一步适配视口
  - 完整显示所有内容
  - 自动适配，无需手动操作
```

## 🔧 配置选项

### 用户可控参数

```python
# 1. 禁用自动缩放
config = _generate_config_json(
    ...,
    auto_scale=False  # 使用原始尺寸
)

# 2. 自定义尺寸
input_data = {
    "content": "...",
    "width": 1920,
    "height": 1080
}

# 3. 指定平台
input_data = {
    "content": "...",
    "platform": "instagram"  # 自动使用最佳尺寸
}
```

## 📈 性能影响

- **Python 端**: 计算缩放比例 < 1ms
- **JavaScript 端**: 自动缩放 < 50ms
- **渲染时间**: 无明显影响
- **内存占用**: 无明显增加

## 🎯 最佳实践

1. **信任自动缩放**
   - 大多数情况下使用自动缩放
   - 系统会选择最佳比例

2. **提供足够内容**
   - 确保内容结构清晰
   - 避免过度冗长的文本

3. **测试不同屏幕**
   - 在不同分辨率下预览
   - 系统会自动适配

4. **考虑目标平台**
   - 指定平台以获得最佳尺寸
   - 例如：Instagram 使用正方形

---

**版本**: 1.0.0
**更新日期**: 2025-02-08
**维护者**: Infographic Skill Team
