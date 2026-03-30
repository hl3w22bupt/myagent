# Remotion视频生成技能使用指南

## 🚀 快速开始

### 安装依赖

```bash
# 确保Python环境已安装必要依赖
pip install pyyaml pydantic
```

### 验证安装

```bash
# 运行验证脚本
python3 test_remotion_simple.py
```

## 📋 技能概述

### 功能描述

Remotion视频生成技能可以将自然语言描述转换为专业的Remotion视频项目并渲染输出。

### 核心特性

- ✅ **5种风格模板**: minimal, corporate, presentation, animated, cinematic
- ✅ **完整参数配置**: duration, fps, resolution, quality, output_format
- ✅ **PTC集成**: 自动被PTC识别和编排
- ✅ **标准化输出**: 13个字段供下游skill使用
- ✅ **生产就绪**: 完善的错误处理和资源清理

### 技能位置

- **技能路径**: `skills/remotion-generator/`
- **配置文件**: `skill.yaml`
- **执行器**: `handler.py`
- **文档**: `docs/REMOTION_SKILL_DESIGN.md`

## 🎯 使用方式

### 方式1: 直接调用技能

```python
from core.skill.executor import SkillExecutor
import asyncio

async def main():
    executor = SkillExecutor()
    
    # 调用remotion-generator技能
    result = await executor.execute('remotion-generator', {
        'description': '创建一个10秒的企业风格视频展示产品特性',
        'duration': 10,
        'style': 'corporate',
        'resolution': '1920x1080',
        'quality': 'high'
    })
    
    if result['success']:
        print(f"✅ 视频生成成功！")
        print(f"🎬 视频路径: {result['video_url']}")
        print(f"📐 时长: {result['duration']}秒")
        print(f"🎨 风格: {result['metadata']['style']}")
    else:
        print(f"❌ 视频生成失败: {result['error']}")

asyncio.run(main())
```

### 方式2: 通过Agent使用

```typescript
// 直接向Agent发送任务请求
import { Agent } from './core/agent/agent'

const agent = new Agent({
  systemPrompt: '你是一个视频生成助手',
  availableSkills: ['remotion-generator'],
}, 'session-id')

const task = '创建一个15秒的cinematic风格产品宣传视频'

const result = await agent.run(task)

console.log('生成结果:', result.output)
```

## 🎨 风格说明

### 1. Minimal风格

**特点**: 简洁干净，专注内容展示
**适用场景**: 产品介绍、简单通知、标题动画

**参数示例**:
```python
{
    'description': '产品功能介绍视频',
    'duration': 10,
    'style': 'minimal',
    'resolution': '1920x1080'
}
```

**动画效果**:
- 标题淡入效果 (0-30帧)
- 副标题淡入延迟 (60-90帧)
- 简洁的排版

### 2. Corporate风格

**特点**: 专业品牌，商务感强
**适用场景**: 企业宣传、品牌展示、商务演示

**参数示例**:
```python
{
    'description': '公司品牌宣传视频',
    'duration': 15,
    'style': 'corporate',
    'quality': 'high',
    'resolution': '1920x1080'
}
```

**动画效果**:
- Logo缩放弹入动画
- 标题淡入动画
- 背景渐变动画
- 专业过渡效果

### 3. Presentation风格

**特点**: 信息清晰，教育性强
**适用场景**: 教学视频、信息展示、教程演示

**参数示例**:
```python
{
    'description': '产品功能教程视频',
    'duration': 20,
    'style': 'presentation',
    'fps': 30,
    'resolution': '1920x1080'
}
```

**动画效果**:
- 逐点显示动画
- 有序的内容呈现
- 清晰的层级结构

### 4. Animated风格

**特点**: 动态吸引，动效丰富
**适用场景**: 社交媒体、娱乐内容、动态展示

**参数示例**:
```python
{
    'description': '社交媒体宣传视频',
    'duration': 8,
    'style': 'animated',
    'quality': 'medium'
}
```

**动画效果**:
- 弹跳缩放动画
- 旋转动画
- 缩放组合动画
- 丰富的动效

### 5. Cinematic风格

**特点**: 电影质感，戏剧性强
**适用场景**: 品牌故事、高端宣传、电影感视频

**参数示例**:
```python
{
    'description': '高端品牌宣传片',
    'duration': 12,
    'style': 'cinematic',
    'quality': 'ultra',
    'resolution': '1920x1080'
}
```

**动画效果**:
- 暗场渐入效果
- 文字阴影效果
- 镜头缩放效果
- 晕影叠加效果

## 📊 输出格式

### 成功响应

```json
{
  "success": true,
  "video_path": "/tmp/remotion_xxx/out/video.mp4",
  "video_url": "/outputs/videos/video_xxx.mp4",
  "thumbnail_path": "/tmp/remotion_xxx/out/thumbnail.jpg",
  "thumbnail_url": "/outputs/videos/thumbnail_xxx.jpg",
  "duration": 10.0,
  "fps": 30,
  "resolution": "1920x1080",
  "file_size": 2048576,
  "metadata": {
    "title": "生成的视频标题",
    "description": "视频描述",
    "style": "minimal",
    "format": "mp4",
    "quality": "medium",
    "generated_at": "2024-01-11 12:00:00"
  }
}
```

### 关键字段说明

- **video_path**: 本地文件路径（供下游skill使用）
- **video_url**: 可访问的URL或路径
- **thumbnail_path**: 缩略图本地路径
- **thumbnail_url**: 缩略图URL或路径
- **duration**: 实际视频时长（秒）
- **fps**: 实际帧率
- **resolution**: 实际分辨率
- **file_size**: 视频文件大小（字节）
- **metadata**: 包含title, description, style, format, quality等元数据

### 错误响应

```json
{
  "success": false,
  "error": "错误描述信息",
  "error_type": "错误类型（如ValueError, Exception）",
  "video_path": null,
  "video_url": null,
  "thumbnail_path": null,
  "thumbnail_url": null
}
```

## 🔧 参数详解

### 输入参数

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|---------|------|
| description | string | 必需 | 视频的自然语言描述 |
| duration | number | 10 | 视频时长（秒）范围：1-300 |
| fps | number | 30 | 帧率（范围：15-60） |
| resolution | string | "1920x1080" | 分辨率（WIDTHxHEIGHT格式） |
| style | string | "minimal" | 风格模板（见上方） |
| output_format | string | "mp4" | 输出格式（mp4, webm, gif） |
| quality | string | "medium" | 质量/编码预设（low, medium, high, ultra） |

### quality参数说明

- **low**: 快速渲染，文件较小
- **medium**: 平衡质量和文件大小
- **high**: 高质量，文件较大
- **ultra**: 最高质量，文件最大

## 🎬 完整使用流程

### 从需求到视频的完整流程

```
用户需求
    ↓
PTC规划
    ├─ 分析任务
    ├─ 选择skills: [remotion-generator]
    └─ 生成编排代码
    ↓
Remotion Skill执行
    ├─ 接收用户描述
    ├─ 选择风格模板
    ├─ 生成Remotion代码
    ├─ 创建Remotion项目
    ├─ 安装依赖
    ├─ 渲染视频
    ├─ 生成缩略图
    ├─ 提取视频信息
    └─ 返回标准化结果
    ↓
下游Skill（可选）
    └─ 例如youtube-poster处理video_path
```

## 🧪 测试

### 运行验证测试

```bash
# 运行简化的结构验证
python3 test_remotion_simple.py
```

预期输出：
```
🧪 Testing Remotion Generator Skill
============================================================

📁 Test 1: File Structure
------------------------------------------------------------
✅ skill.yaml: Present and valid
✅ __init__.py: Present and valid
✅ handler.py: Present and valid

⚙️ Test 2: Skill Configuration
------------------------------------------------------------
✅ name
✅ version
✅ description
✅ type: hybrid
✅ input_schema
✅ output_schema
✅ prompt_template
✅ execution

...（更多测试项）

============================================================
✅ All core files are present
✅ Skill structure is correct
✅ Agent integration is complete
✅ Ready for testing with PTC system

============================================================
🎬 Remotion Video Generation Skill Test Complete!
============================================================
```

## 📚 文档

### 设计文档
- **位置**: `docs/REMOTION_SKILL_DESIGN.md`
- **内容**: 完整的设计说明、架构、实现细节

### 测试总结
- **位置**: `TEST_SUMMARY.md`
- **内容**: 测试结果统计、覆盖率分析

### 使用指南
- **位置**: `REMOTION_SKILL_README.md`（本文件）
- **内容**: 快速开始、使用方式、参数说明、完整流程

## 🚀 常见问题

### Q: 如何切换视频风格？

A: 在调用时设置不同的`style`参数：
```python
result = await executor.execute('remotion-generator', {
    'style': 'cinematic'  # minimal, corporate, presentation, animated
})
```

### Q: 如何调整视频质量？

A: 使用`quality`参数：
```python
result = await executor.execute('remotion-generator', {
    'quality': 'high'  # low, medium, high, ultra
})
```

### Q: 如何输出不同格式？

A: 使用`output_format`参数：
```python
result = await executor.execute('remotion-generator', {
    'output_format': 'webm'  # mp4, webm, gif
})
```

### Q: 如何与其他skills链式调用？

A: Remotion技能的输出包含`video_path`字段，可以直接传递给下游skill：
```python
# 生成视频
video_result = await executor.execute('remotion-generator', {...})

# 发布到YouTube
youtube_result = await executor.execute('youtube-poster', {
    'video_path': video_result['video_path'],
    'title': '视频标题'
})
```

### Q: 视频保存在哪里？

A: 默认保存在`outputs/videos/`目录下
- 返回的`video_url`是该目录的相对路径
- 可以通过HTTP服务对外提供访问

## 🎯 开始使用

### 第一步：验证安装

```bash
python3 test_remotion_simple.py
```

### 第二步：测试技能

```python
from core.skill.executor import SkillExecutor
import asyncio

async def test():
    executor = SkillExecutor()
    
    result = await executor.execute('remotion-generator', {
        'description': '测试视频生成',
        'duration': 5,
        'style': 'minimal'
    })
    
    print("生成结果:", result)

asyncio.run(test())
```

### 第三步：集成到工作流

通过Agent或PTC系统使用该技能，实现复杂的视频生成和处理工作流。

---

**Remotion视频生成技能已准备就绪！**
