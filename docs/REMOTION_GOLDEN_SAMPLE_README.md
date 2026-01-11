# 🎬 Remotion Skill - 黄金样本 (Golden Sample)

## ⭐ 推荐的黄金样本

### 一句话版本

```json
{
  "description": "生成一个15秒的勾股定理数学教学视频，开篇显示大标题'勾股定理'，然后动态绘制一个直角三角形，标注三条边a、b、c，最后展示公式a²+b²=c²，并用文字总结：直角三角形两直角边的平方和等于斜边的平方",
  "duration": 15,
  "fps": 30,
  "resolution": "1920x1080",
  "style": "educational",
  "output_format": "mp4",
  "quality": "medium"
}
```

---

## 🚀 快速使用

### 方法 1: 运行测试脚本（推荐）

```bash
python3 scripts/test-golden-sample.py
```

**输出：**
- 完整的测试报告
- 能力验证清单
- 视频文件路径
- 播放提示

### 方法 2: Python 代码

```python
import asyncio
from skills.remotion_generator.handler import generate_video

async def main():
    result = await generate_video({
        "description": "生成一个15秒的勾股定理数学教学视频，开篇显示大标题'勾股定理'，然后动态绘制一个直角三角形，标注三条边a、b、c，最后展示公式a²+b²=c²",
        "duration": 15,
        "fps": 30,
        "resolution": "1920x1080",
        "style": "educational"
    })

    if result["success"]:
        print(f"✅ 成功: {result['video_path']}")
    else:
        print(f"❌ 失败: {result['error']}")

asyncio.run(main())
```

---

## ✨ 展示的能力

### 1. 智能解析
- ✅ 自动识别教学内容
- ✅ 提取中文标题"勾股定理"
- ✅ 识别视觉元素（三角形、公式）

### 2. 动态场景（4个）
- ✅ **场景 1** (0-3.75秒): 标题展示
- ✅ **场景 2** (3.75-9秒): 三角形绘制
- ✅ **场景 3** (9-12.75秒): 公式展示
- ✅ **场景 4** (12.75-15秒): 总结说明

### 3. 专业动画
- ✅ 弹簧缩放效果
- ✅ SVG 逐步绘制
- ✅ 淡入淡出过渡
- ✅ 数学公式动画

### 4. 视觉效果
- ✅ 渐变背景（紫色）
- ✅ 颜色编码（蓝色/粉色）
- ✅ 数学公式（上标）
- ✅ 直角标记

---

## 📊 视频输出

```
文件: outputs/videos/golden_sample_pythagorean_video_1.mp4
时长: 15 秒（450帧 @ 30fps）
分辨率: 1920×1080
格式: MP4 (H.264)
大小: ~750 KB
```

---

## 🎯 为什么这个样本最好？

### 1. **一句话描述完整**
包含了所有关键元素：标题、时长、内容、目标

### 2. **中文自然语言**
展示了中文处理能力

### 3. **引号内容提取**
`'勾股定理'` 会被自动提取为标题

### 4. **多场景覆盖**
涵盖了教学视频的所有典型场景

### 5. **视觉元素丰富**
三角形、公式、颜色、动画

### 6. **15秒黄金时长**
不太短（能看到完整动画）
不太长（快速生成和预览）

---

## 📈 测试结果示例

```
✅ 视频生成成功！

📁 视频信息：
   文件路径: outputs/videos/golden_sample_pythagorean_video_1.mp4
   时长: 15 秒
   分辨率: 1920×1080
   文件大小: 764.3 KB

✅ 能力验证清单：
   ✓ 视频生成成功
   ✓ 中文标题正确显示
   ✓ 4个场景完整
   ✓ 三角形动态绘制
   ✓ 公式展示正确
   ✓ 颜色标注准确
   ✓ 场景平滑过渡
   ✓ 无空白帧
```

---

## 🎥 查看视频

```bash
# 方法 1: 直接播放
open outputs/videos/golden_sample_pythagorean_video_1.mp4

# 方法 2: 浏览器预览
open outputs/video-test.html
```

---

## 🔧 自定义参数

### 调整时长
```python
"duration": 10  # 10秒（快速预览）
"duration": 20  # 20秒（更详细）
"duration": 30  # 30秒（完整版）
```

### 调整质量
```python
"quality": "low"     # 快速生成
"quality": "medium"  # 平衡（推荐）
"quality": "high"    # 高质量
"quality": "ultra"   # 最高质量
```

### 调整分辨率
```python
"resolution": "1280x720"   # HD
"resolution": "1920x1080"  # Full HD（推荐）
"resolution": "3840x2160"  # 4K
```

---

## 📝 其他样本主题

### 几何类
```
"生成一个关于圆的教学视频，展示圆的半径r、直径d和圆周率π"
```

### 物理类
```
"制作一个关于牛顿第二定律F=ma的物理教学视频，展示力、质量和加速度的关系"
```

### 代数类
```
"生成一个关于一元二次方程求根公式的教学视频"
```

---

## 💡 使用建议

### 演示时
1. 先用黄金样本生成视频
2. 展示测试脚本的详细输出
3. 播放生成的视频
4. 解释各个场景的技术实现

### 开发时
1. 使用黄金样本作为回归测试
2. 每次修改后重新运行
3. 对比输出确保功能正常

### 文档时
1. 引用黄金样本作为标准示例
2. 展示预期的输入输出
3. 说明技术特性

---

## 🔗 相关文档

- [完整样本文档](./REMOTION_GOLDEN_SAMPLES.md)
- [快速使用指南](./REMOTION_EDUCATIONAL_QUICKSTART.md)
- [改进说明文档](./REMOTION_EDUCATIONAL_VIDEO_IMPROVEMENTS.md)

---

**推荐：** 使用黄金样本作为 Remotion skill 的标准测试用例！🎬
