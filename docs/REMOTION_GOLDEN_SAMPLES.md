# Remotion Skill - 黄金样本 (Golden Samples)

## 🎯 完整能力展示样本

### 样本 1: 勾股定理完整教学（推荐）

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

**这个样本会触发：**
- ✅ 中文标题识别和提取
- ✅ 教育内容自动检测
- ✅ 4个动态场景
- ✅ SVG 三角形动态绘制
- ✅ 数学公式展示（带上标）
- ✅ 多颜色标注（蓝色 vs 粉色）
- ✅ 渐变背景效果
- ✅ 淡入淡出过渡
- ✅ 弹簧动画效果

---

### 样本 2: 更复杂的版本（带更多细节）

```json
{
  "description": "制作一个关于勾股定理的精美教学动画，时长20秒。要求：1）开头3秒显示紫色渐变背景上的大标题'勾股定理'，使用缩放动画；2）接下来的8秒逐步绘制一个直角三角形，先画垂直边a（蓝色），再画水平边b（蓝色），最后画斜边c（粉色），并添加直角标记；3）然后6秒展示勾股定理公式a²+b²=c²，公式要从中心放大出现；4）最后3秒用白色文字总结：'直角三角形两直角边的平方和等于斜边的平方'",
  "duration": 20,
  "fps": 30,
  "resolution": "1920x1080",
  "style": "educational",
  "output_format": "mp4",
  "quality": "high"
}
```

**额外展示：**
- ✅ 更长的时长（20秒 = 600帧）
- ✅ 更高质量设置
- ✅ 详细的多阶段要求
- ✅ 颜色规范（蓝色/粉色/白色）
- ✅ 具体动画类型（缩放、逐步绘制）

---

### 样本 3: 英文版本（国际展示）

```json
{
  "description": "Create a 15-second educational video about the Pythagorean theorem. Start with the title 'Pythagorean Theorem', then animate a right triangle with sides labeled a, b, and c. Draw the triangle progressively: first the vertical side, then the horizontal side, then the hypotenuse. Add a right angle marker. Finally, display the formula a²+b²=c² with scaling animation, and conclude with text: 'The square of the hypotenuse equals the sum of squares of the other two sides'",
  "duration": 15,
  "fps": 30,
  "resolution": "1920x1080",
  "style": "educational",
  "output_format": "mp4",
  "quality": "high"
}
```

---

## 🎬 快速测试脚本

### 方法 1: 使用 Python 脚本

```python
import asyncio
from skills.remotion_generator.handler import generate_video

async def test_golden_sample():
    # 黄金样本
    golden_sample = {
        "description": "生成一个15秒的勾股定理数学教学视频，开篇显示大标题'勾股定理'，然后动态绘制一个直角三角形，标注三条边a、b、c，最后展示公式a²+b²=c²，并用文字总结：直角三角形两直角边的平方和等于斜边的平方",
        "duration": 15,
        "fps": 30,
        "resolution": "1920x1080",
        "style": "educational",
        "output_format": "mp4",
        "quality": "medium",
        "task_id": "golden_sample_pythagorean"
    }

    print("=" * 60)
    print("🎬 Remotion 黄金样本测试")
    print("=" * 60)
    print("\n生成内容：勾股定理完整教学视频")
    print("\n参数：")
    for key, value in golden_sample.items():
        if key != 'description':
            print(f"  {key}: {value}")
    print(f"\n  description: {golden_sample['description'][:80]}...")

    print("\n开始生成...")
    result = await generate_video(golden_sample)

    print("\n" + "=" * 60)
    print("生成结果：")
    print("=" * 60)

    if result.get("success"):
        print(f"✅ 成功！")
        print(f"\n视频文件：{result['video_path']}")
        print(f"时长：{result['duration']} 秒")
        print(f"分辨率：{result['resolution']}")
        print(f"文件大小：{result['file_size'] / 1024:.1f} KB")
        print(f"\n📺 播放视频：")
        print(f"   open {result['video_path']}")
    else:
        print(f"❌ 失败：{result['error']}")

    print("=" * 60)

asyncio.run(test_golden_sample())
```

保存为 `test_golden_sample.py` 并运行。

---

### 方法 2: 直接命令行

```bash
# 使用现有测试脚本，已经配置好黄金样本
python3 scripts/test-educational-video.py
```

---

## 🎨 视频效果预览

### 场景时间轴（15秒视频）

```
┌─────────────────────────────────────────────────────┐
│ 场景 1: 标题 (0-3.75秒, 25%)                        │
│ ┌─────────────────────────────────────────────┐    │
│ │              勾股定理                        │    │
│ │         (弹簧缩放 + 淡入)                    │    │
│ └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ 场景 2: 三角形绘制 (3.75-9秒, 35%)                  │
│ ┌─────────────────────────────────────────────┐    │
│ │        C●                                    │    │
│ │        ││                                    │    │
│ │        ││╲  ← 逐步绘制                       │    │
│ │      a ││ ╲c                                 │    │
│ │        ││  ╲                                 │    │
│ │   A ●─┴─●──● B                               │    │
│ │          b                                   │    │
│ └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ 场景 3: 公式展示 (9-12.75秒, 25%)                  │
│ ┌─────────────────────────────────────────────┐    │
│ │        a² + b² = c²                         │    │
│ │     (蓝色  粉色)                            │    │
│ │     + 完整三角形背景                         │    │
│ └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ 场景 4: 总结 (12.75-15秒, 15%)                     │
│ ┌─────────────────────────────────────────────┐    │
│ │           勾股定理                          │    │
│ │  直角三角形两直角边的平方和                  │    │
│ │       等于斜边的平方                        │    │
│ └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 高级特性展示

### 1. 智能内容解析
```
输入: "生成一个勾股定理教学视频，开篇显示文字'勾股定理'"
      ↓
自动提取:
  - 标题: "勾股定理" (从引号中提取)
  - 类型: 教育视频
  - 视觉元素: ['triangle', 'formula']
  - 内容类型: 数学/几何
```

### 2. 动态 Composition ID
```
代码生成: id="EducationalVideo"
      ↓
自动提取: EducationalVideo
      ↓
渲染命令: remotion render ... EducationalVideo ...
      ↓
✅ 正确渲染
```

### 3. 场景自适应
```
duration = 15秒, fps = 30
total_frames = 450

场景划分:
  - 标题: 0-112帧 (25%)
  - 三角形: 112-270帧 (35%)
  - 公式: 270-382帧 (25%)
  - 总结: 382-450帧 (15%)
```

### 4. 颜色编码
```
三角形边:
  - a (垂直边): #4F46E5 (靛蓝)
  - b (水平边): #4F46E5 (靛蓝)
  - c (斜边):   #EC4899 (粉色)
  - 直角标记:   #EC4899 (粉色)

公式:
  - a, b: #4F46E5 (靛蓝)
  - c:   #EC4899 (粉色)

背景:
  - 渐变: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
```

---

## 📊 能力检查清单

使用黄金样本可以验证以下能力：

### 基础能力 ✅
- [x] 视频生成成功
- [x] 时长准确（15秒 = 450帧）
- [x] 分辨率正确（1920×1080）
- [x] 帧率正确（30 FPS）
- [x] 文件格式正确（MP4）

### 智能解析 ✅
- [x] 中文标题识别
- [x] 教育内容检测
- [x] 视觉元素提取
- [x] 引号内容提取

### 动画效果 ✅
- [x] 标题淡入
- [x] 弹簧缩放
- [x] 三角形逐步绘制
- [x] 公式缩放动画
- [x] 场景淡入淡出

### 视觉效果 ✅
- [x] 渐变背景
- [x] SVG 绘图
- [x] 颜色编码
- [x] 数学公式（上标）
- [x] 文字排版

### 技术特性 ✅
- [x] TypeScript 类型安全
- [x] React Hooks
- [x] Remotion 最佳实践
- [x] 确定性动画
- [x] 性能优化

---

## 🎯 使用建议

### 展示给用户时
1. **先展示简短版本**（10秒）
2. **再展示完整版本**（15秒）
3. **最后展示高质量版本**（20秒 + high quality）

### 演示脚本
```bash
# 1. 生成标准版
python3 scripts/test-educational-video.py

# 2. 播放视频
open outputs/videos/test_pythagorean_001_video_1.mp4

# 3. 展示测试页面
open outputs/video-test.html

# 4. 说明技术特性
cat docs/REMOTION_EDUCATIONAL_VIDEO_IMPROVEMENTS.md
```

---

## 💡 其他样本主题

### 几何类
```json
{"description": "生成一个关于圆的教学视频，展示圆的半径、直径和圆周率π"}
```

### 物理类
```json
{"description": "制作一个关于牛顿第二定律F=ma的物理教学视频"}
```

### 化学类
```json
{"description": "生成水的化学式H₂O的教学动画，展示氢原子和氧原子的结合"}
```

---

## 🔗 相关文档

- [完整改进文档](./REMOTION_EDUCATIONAL_VIDEO_IMPROVEMENTS.md)
- [快速使用指南](./REMOTION_EDUCATIONAL_QUICKSTART.md)
- [空白帧修复报告](./REMOTION_BLANK_FRAME_FIX.md)

---

**推荐使用样本 1** 作为标准黄金样本，它简洁明了，能够展示所有核心能力！🎬
