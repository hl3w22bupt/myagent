# Remotion 教育视频生成 - 改进文档

## 问题分析

### 原始问题
用户反馈生成的勾股定理教学视频存在以下问题：
1. ❌ 所有帧看起来都一样 - 只有简单的淡入动画，之后完全静止
2. ❌ 显示错误的文本 - 显示英文描述而非中文标题"勾股定理"
3. ❌ 缺少教学内容 - 没有三角形、公式等教学元素
4. ❌ 动画效果单一 - 对于15秒视频，大部分时间画面静止

### 根本原因
1. **内容解析问题** - 模板直接使用用户的完整描述作为标题，没有提取关键信息
2. **模板设计缺陷** - minimal 模板只有简单的淡入效果（前30帧），之后完全静止
3. **缺少专用模板** - 没有针对数学/教学内容的专用模板

---

## 解决方案

### 1. 智能内容解析 (`_parse_educational_content`)

#### 功能
- 使用关键词识别教学内容类型
- 提取标题（支持引号提取和关键词匹配）
- 识别视觉元素（三角形、公式等）
- 判断内容复杂度

#### 支持的关键词
```python
edu_keywords = [
    '教学', '教育', 'tutorial', 'educational', 'lesson',
    '定理', '公式', 'formula', 'theorem', '勾股定理',
    'pythagorean', 'math', '数学', 'triangle', '三角形'
]
```

#### 示例
```python
输入: "生成一个勾股定理教学视频，开篇显示文字'勾股定理'，时长15秒左右"

输出: {
    'is_educational': True,
    'title': '勾股定理',
    'content_type': 'simple',
    'visual_elements': ['triangle', 'formula'],
    'description': '...'
}
```

### 2. 教育视频专用模板 (`_template_educational`)

#### 特性
- **多场景架构** - 4个动态场景，平滑过渡
- **专业动画** - 使用 spring 和 interpolate 实现流畅动画
- **SVG 绘图** - 动态绘制直角三角形
- **公式展示** - 数学公式动画效果
- **渐变背景** - 紫色渐变，专业视觉效果

#### 场景时间轴（15秒视频 @ 30fps = 450帧）
| 场景 | 帧范围 | 时间占比 | 内容 |
|------|--------|----------|------|
| 标题 | 0-112 | 0-25% | 大标题显示"勾股定理" |
| 三角形 | 112-270 | 25-60% | 动态绘制直角三角形 |
| 公式 | 270-382 | 60-85% | 显示 a² + b² = c² |
| 总结 | 382-450 | 85-100% | 文字总结说明 |

#### 动画效果

**1. 标题场景**
```typescript
const titleOpacity = interpolate(frame, [0, 30], [0, 1]);
const titleScale = spring({ frame, fps: 30, config: { damping: 10 } });
```

**2. 三角形场景**
```typescript
// 逐步绘制三条边
const lineProgress = Math.min(progress * 1.5, 1);

// 边1: 垂直边 (0-0.33)
// 边2: 水平边 (0.33-0.66)
// 边3: 斜边 (0.66-1.0)
// 直角标记: 完成后显示
```

**3. 公式场景**
```typescript
const opacity = Math.min(progress * 2, 1);
const scale = spring({ frame: progress * 60, fps: 30 });

// 显示: a² + b² = c²
// 颜色: a,b 为蓝色 (#4F46E5)，c 为粉色 (#EC4899)
```

**4. 总结场景**
```typescript
// 标题: 勾股定理
// 说明: 直角三角形两直角边的平方和等于斜边的平方
// 淡入效果
```

### 3. 动态 Composition ID 识别

#### 问题
旧代码硬编码 `MinimalVideo`，导致无法渲染其他模板。

#### 解决方案
```python
def _extract_composition_id(self, code: str) -> str:
    """从生成的代码中提取 Composition ID"""
    import re
    match = re.search(r'id="([^"]+)"', code)
    if match:
        return match.group(1)
    return "MinimalVideo"
```

#### 工作流程
1. 生成 Remotion 代码
2. 正则提取 `id="CompositionName"`
3. 渲染时使用动态 ID
4. 支持任意模板切换

---

## 代码结构

### 新增/修改的文件

```
skills/remotion-generator/
├── handler.py                          # 主要修改
│   ├── _parse_educational_content()   # 新增：内容解析
│   ├── _extract_composition_id()      # 新增：ID提取
│   ├── _template_educational()        # 新增：教育模板
│   └── _generate_remotion_code()      # 修改：添加教育检测
├── skill.yaml                          # 未修改
└── template/                           # 未修改
```

### 核心方法调用流程

```
generate_video()
    ↓
_generate_remotion_code()
    ↓
_parse_educational_content()  # 检测是否为教学内容
    ↓
_template_educational()        # 生成教育视频代码
    ↓
_extract_composition_id()     # 提取 Composition ID
    ↓
_render_with_remotion()        # 使用动态 ID 渲染
```

---

## 使用示例

### Python 脚本调用

```python
import asyncio
from handler import generate_video

async def create_pythagorean_video():
    input_data = {
        "description": "生成一个勾股定理教学视频，开篇显示文字'勾股定理'，时长15秒左右",
        "duration": 15,
        "fps": 30,
        "resolution": "1920x1080",
        "style": "educational",  # 或留空自动检测
        "output_format": "mp4",
        "quality": "medium"
    }

    result = await generate_video(input_data)

    if result["success"]:
        print(f"视频已生成: {result['video_path']}")
    else:
        print(f"生成失败: {result['error']}")

asyncio.run(create_pythagorean_video())
```

### 测试脚本

运行预配置的测试脚本：

```bash
python3 scripts/test-educational-video.py
```

生成的视频位于：
```
outputs/videos/test_pythagorean_001_video_1.mp4
```

预览页面：
```
outputs/preview-educational-video.html
```

---

## 对比：改进前 vs 改进后

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| **标题显示** | ❌ 英文描述 | ✅ "勾股定理" |
| **动画内容** | ❌ 仅前1秒淡入 | ✅ 4个场景持续动画 |
| **视觉元素** | ❌ 纯文本 | ✅ 三角形、公式、标注 |
| **场景数量** | ❌ 1个静态场景 | ✅ 4个动态场景 |
| **时长利用** | ❌ 93% 时间静止 | ✅ 100% 时间有内容 |
| **模板类型** | ❌ 通用 minimal | ✅ 专用 educational |
| **Composition ID** | ❌ 硬编码 | ✅ 动态提取 |

---

## 技术亮点

### 1. TypeScript/React 代码生成
- 完整的类型定义
- React Hooks 使用
- SVG 绘图
- Spring 动画

### 2. Python 智能解析
- 关键词匹配
- 正则表达式提取
- 中文支持

### 3. Remotion 最佳实践
- 确定性动画
- 插值平滑
- FPS 独立
- Composition 复用

---

## 扩展建议

### 短期改进
1. **更多教学内容**
   - 几何图形（圆、矩形）
   - 物理公式
   - 化学方程式

2. **动画增强**
   - 音频同步
   - 粒子效果
   - 3D 变换

### 长期改进
1. **LLM 集成**
   - 使用 GPT 解析复杂请求
   - 自动生成脚本
   - 智能场景规划

2. **模板库**
   - 预设多种教学模板
   - 用户自定义模板
   - 模板市场

3. **交互式编辑**
   - 实时预览
   - 场景调整
   - 参数微调

---

## 文件清单

### 生成的文件
- `/outputs/videos/test_pythagorean_001_video_1.mp4` - 视频文件
- `/outputs/preview-educational-video.html` - 预览页面

### 测试文件
- `/scripts/test-educational-video.py` - 测试脚本

### 文档文件
- `/docs/REMOTION_EDUCATIONAL_VIDEO_IMPROVEMENTS.md` - 本文档

---

## 总结

### 核心改进
1. ✅ **智能内容解析** - 自动识别教学内容并提取标题
2. ✅ **多场景动画** - 4个动态场景，充分利用视频时长
3. ✅ **专业视觉效果** - SVG 绘图、渐变背景、流畅动画
4. ✅ **动态模板支持** - 自动识别并适配不同模板类型

### 技术特点
- 🎯 零配置智能检测
- 🎨 专业级动画效果
- 📐 精确的数学图形绘制
- 🔄 动态 Composition ID 管理

### 用户价值
- 一句话生成专业教学视频
- 自动化内容提取和场景规划
- 高质量的视觉呈现
- 易于扩展和定制

---

**生成日期**: 2026-01-11
**版本**: 1.0.0
**状态**: ✅ 完成并测试通过
