# Remotion视频生成技能设计文档

## 📋 概述

本文档详细描述了在Motia Agent系统中实现的Remotion视频生成技能的设计、架构和实现细节。

### 🎯 设计目标

- **符合PTC设计原则**: 优先skill编排，自由发挥作为兜底
- **职责明确**: 专注于"自然语言 → 视频文件"的转换
- **标准化输出**: 返回结构化数据供下游skill使用
- **生产就绪**: 支持多种风格、格式和质量配置

## 🏗️ 系统架构

### 整体工作流

```
用户需求 → PTC规划 → Skill编排 → 视频生成 → 下游处理
```

### PTC设计原则

**优先级顺序**:
1. **Skill编排** (最高优先级) - PTC首先尝试匹配现有skills
2. **Skill链式调用** - 一个skill的输出作为下一个skill的输入  
3. **自由发挥代码** (兜底) - 当没有匹配skills时，LLM直接生成代码

### 典型使用场景

```
用户: "创建产品宣传视频并发布到YouTube"

PTC规划: ["remotion-generator", "youtube-poster"]

PTC生成代码:
video_result = await executor.execute('remotion-generator', {
    'description': '产品宣传视频',
    'duration': 15,
    'style': 'corporate'
})

youtube_result = await executor.execute('youtube-poster', {
    'video_path': video_result['video_path'],
    'title': '产品发布视频'
})
```

## 🎬 Remotion技能设计

### 技能职责边界

**负责**:
- 自然语言描述解析
- Remotion代码生成
- 视频渲染和输出
- 视频元数据提取

**不负责**:
- 视频发布到YouTube等平台
- 社交媒体分享
- 后续处理流程

### 技能配置

#### skill.yaml

```yaml
name: remotion-generator
version: 1.0.0
description: Generate videos using Remotion framework from natural language descriptions
tags: [remotion, video, animation, media-generation]
type: hybrid

input_schema:
  type: object
  properties:
    description:
      type: string
      description: Natural language description of the video to generate
    duration:
      type: number
      default: 10
      description: Video duration in seconds
    fps:
      type: number
      default: 30
      description: Frames per second
    resolution:
      type: string
      default: "1920x1080"
      description: Video resolution as WIDTHxHEIGHT
    style:
      type: string
      default: "minimal"
      enum: [minimal, corporate, animated, cinematic, presentation]
      description: Video style template
    output_format:
      type: string
      default: "mp4"
      enum: [mp4, webm, gif]
      description: Output video format
    quality:
      type: string
      default: "medium"
      enum: [low, medium, high, ultra]
      description: Video quality/encoding preset
  required: [description]

output_schema:
  type: object
  properties:
    success:
      type: boolean
      description: Whether video generation succeeded
    video_path:
      type: string
      description: Local file path to generated video
    video_url:
      type: string
      description: Accessible URL or path to the video file
    thumbnail_path:
      type: string
      description: Local file path to the video thumbnail
    thumbnail_url:
      type: string
      description: Accessible URL or path to the thumbnail
    duration:
      type: number
      description: Actual video duration in seconds
    fps:
      type: number
      description: Actual frames per second
    resolution:
      type: string
      description: Actual video resolution
    file_size:
      type: number
      description: Video file size in bytes
    metadata:
      type: object
      description: Additional video metadata
      properties:
        title:
          type: string
        description:
          type: string
        style:
          type: string
        format:
          type: string
        quality:
          type: string
        generated_at:
          type: string
    error:
      type: string
      description: Error message if generation failed
    error_type:
      type: string
      description: Error type for debugging

prompt_template: |
  You are a Remotion video generation expert. Create a complete Remotion video based on the description.
  
  Video Requirements:
  Description: {{description}}
  Duration: {{duration}} seconds
  FPS: {{fps}}
  Resolution: {{resolution}}
  Style: {{style}}
  Output Format: {{output_format}}
  Quality: {{quality}}
  
  Generate a Remotion React component that:
  - Uses TypeScript with proper types
  - Follows Remotion best practices (deterministic, interpolated animations)
  - Creates a {{style}} style video
  - Renders for exactly {{duration}} seconds at {{fps}} fps
  - Uses {{resolution}} resolution
  - Exports proper Composition with durationInFrames = {{duration}} * {{fps}}
  - Includes professional animations and transitions
  - Is production-ready with error handling
  - Focuses on creating visually appealing content that matches the description
  
  Specific style requirements:
  - minimal: Clean, simple, focused on content
  - corporate: Professional, branded, suitable for business
  - animated: Dynamic, engaging, with motion graphics
  - cinematic: Dramatic, film-like, with lighting effects
  - presentation: Informational, clear, suitable for educational content
  
  Provide the complete Remotion component code below:

execution:
  handler: handler.py
  function: generate_video
  timeout: 180000
```

### 核心实现

#### handler.py 主要功能

```python
class RemotionVideoGenerator:
    """Remotion视频生成器核心类"""
    
    async def generate_video(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成视频的主函数
        
        Args:
            input_data: 包含description, duration, fps等参数
            
        Returns:
            结构化的视频生成结果
        """
```

#### 代码生成策略

**优先级顺序**:
1. **模板匹配** - 预定义风格模板
2. **LLM生成** - 当模板不匹配时调用LLM

**支持的风格模板**:
- `minimal`: 简洁干净，专注内容
- `corporate`: 专业品牌，适合商务
- `presentation`: 信息清晰，适合教育
- `animated`: 动态吸引，有动效
- `cinematic`: 戏剧性，电影感

## 📁 文件结构

```
skills/
└── remotion-generator/
    ├── skill.yaml              # 技能配置
    ├── __init__.py             # 包初始化
    ├── handler.py              # Python执行器
    └── templates/              # 代码模板(内部)
        ├── minimal.py
        ├── corporate.py
        ├── presentation.py
        ├── animated.py
        └── cinematic.py

src/core/agent/
└── agent.ts                   # Agent配置(已添加remotion-generator)

outputs/
└── videos/                    # 视频输出目录
```

## 🔄 PTC集成

### Agent技能注册

在`src/core/agent/agent.ts`中添加:

```typescript
private static skillsRegistry = [
  // ... existing skills
  {
    name: 'remotion-generator',
    description: 'Generate videos using Remotion framework from natural language descriptions',
    tags: ['remotion', 'video', 'animation', 'media-generation'],
  },
];
```

### PTC生成代码示例

```python
# 用户请求: "创建产品宣传视频并发布到YouTube"
# PTC规划: ["remotion-generator", "youtube-poster"]

async def main():
    try:
        # Step 1: 生成视频
        video_result = await executor.execute('remotion-generator', {
            'description': '产品宣传视频',
            'duration': 15,
            'style': 'corporate',
            'resolution': '1920x1080',
            'quality': 'high'
        })
        
        if not video_result.get('success', False):
            print(json.dumps({
                "error": "Video generation failed", 
                "details": video_result.get('error', 'Unknown error')
            }))
            return
            
        # Step 2: 发布到YouTube 
        youtube_result = await executor.execute('youtube-poster', {
            'video_path': video_result['video_path'],
            'title': '产品发布视频',
            'description': '新产品发布宣传视频',
            'tags': ['产品', '发布', '宣传'],
            'visibility': 'public'
        })
        
        if youtube_result.get('success', False):
            print(json.dumps({
                "success": True,
                "message": "视频生成并发布成功",
                "video_url": youtube_result.get('video_url'),
                "youtube_id": youtube_result.get('video_id')
            }))
        else:
            print(json.dumps({
                "success": False,
                "message": "视频生成成功但发布失败",
                "video_path": video_result['video_path'],
                "youtube_error": youtube_result.get('error')
            }))
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }))

asyncio.run(main())
```

## 🎨 风格模板详解

### Minimal风格

**特点**: 简洁干净，专注内容展示
**适用**: 产品介绍、简单通知
**动画**: 淡入淡出，简洁过渡

```typescript
// 核心动画
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateRight: 'clamp',
});
```

### Corporate风格

**特点**: 专业品牌，商务感强
**适用**: 企业宣传、品牌展示
**动画**: Logo入场，渐变背景，专业过渡

```typescript
// Logo动画
const logoScale = spring({
  fps,
  frame: frame - 15,
  config: { damping: 200, stiffness: 100 },
});

// 渐变背景
const gradientOffset = interpolate(frame, [0, totalFrames], [0, 1]);
```

### Presentation风格

**特点**: 信息清晰，教育性强
**适用**: 教学视频、信息展示
**动画**: 逐点显示，清晰排版

```typescript
// 逐点显示动画
bulletPoints.map((point, index) => {
  const pointOpacity = interpolate(frame, [60 + index * 20, 90 + index * 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  // ...
});
```

### Animated风格

**特点**: 动态吸引，动效丰富
**适用**: 社交媒体、娱乐内容
**动画**: 弹跳、旋转、缩放组合

```typescript
// 弹跳动画
const titleScale = spring({
  fps,
  frame: frame - 20,
  config: { damping: 100, stiffness: 200, mass: 1 },
});

// 旋转动画
const rotation = interpolate(frame, [0, totalFrames], [0, 360]);
```

### Cinematic风格

**特点**: 戏剧性，电影感强
**适用**: 品牌故事、高端宣传
**动画**: 暗场渐入，晕影效果，电影感

```typescript
// 晕影效果
const vignetteOpacity = interpolate(frame, [0, 60], [0, 0.7], {
  extrapolateRight: 'clamp',
});

// 缩放效果
const scale = interpolate(frame, [0, totalFrames], [1.1, 1], {
  extrapolateRight: 'clamp',
});
```

## 🔧 技术实现细节

### Remotion项目生成

1. **目录结构创建**
   ```
   remotion-project/
   ├── src/
   │   ├── Root.tsx          # 生成的组件
   │   └── index.ts          # 入口文件
   ├── public/               # 静态资源
   ├── out/                 # 输出目录
   ├── package.json         # 依赖配置
   └── remotion.config.ts   # Remotion配置
   ```

2. **依赖安装**
   ```bash
   npm install remotion react
   ```

3. **视频渲染**
   ```bash
   npx remotion render src/Root.tsx --codec h264 --fps 30 --duration 10
   ```

### 视频处理

#### 缩略图生成

```python
async def _generate_thumbnail(self, video_path: Path) -> Optional[Dict[str, Path]]:
    """使用FFmpeg生成视频缩略图"""
    result = subprocess.run([
        "ffmpeg", "-i", str(video_path),
        "-ss", "00:00:01",
        "-vframes", "1",
        "-vf", "scale=320:240",
        "-y",
        str(thumbnail_path)
    ], capture_output=True, text=True, timeout=30)
```

#### 元数据提取

```python
async def _get_video_duration(self, video_path: Path) -> float:
    """使用FFprobe获取视频时长"""
    result = subprocess.run([
        "ffprobe", "-v", "quiet", "-show_entries",
        "format=duration", "-of", "csv=p=0", str(video_path)
    ], capture_output=True, text=True, timeout=10)
```

### 错误处理

#### 输入验证
```python
if not description:
    raise ValueError("Description is required")
if duration <= 0 or duration > 300:  # Max 5 minutes
    raise ValueError("Duration must be between 1 and 300 seconds")
```

#### 渲染错误处理
```python
if result.returncode != 0:
    raise Exception(f"Remotion render failed: {result.stderr}")
```

#### 超时处理
```python
result = subprocess.run(
    render_args, 
    cwd=self.project_dir, 
    capture_output=True, 
    text=True,
    timeout=600  # 10 minute timeout
)
```

## 📊 输出格式

### 成功响应示例

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
    "title": "产品宣传视频",
    "description": "创建一个10秒的企业风格视频，展示产品特性",
    "style": "corporate",
    "format": "mp4",
    "quality": "medium",
    "generated_at": "2024-01-10 15:30:00"
  }
}
```

### 错误响应示例

```json
{
  "success": false,
  "error": "Remotion render failed: npm install failed",
  "error_type": "Exception",
  "video_path": null,
  "video_url": null,
  "thumbnail_path": null,
  "thumbnail_url": null
}
```

## 🧪 测试策略

### 单元测试

```python
@pytest.mark.asyncio
async def test_minimal_video_generation():
    result = await generate_video({
        'description': 'A simple welcome video',
        'duration': 5,
        'fps': 30,
        'style': 'minimal'
    })
    
    assert result['success'] is True
    assert 'video_url' in result
    assert result['metadata']['style'] == 'minimal'
```

### 集成测试

```typescript
describe('Remotion Video Generation', () => {
  it('should generate video from description', async () => {
    const task = 'Create a 5-second welcome video with minimal style';
    const result = await agent.run(task);
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('video_url');
    expect(result.metadata.skillCalls).toBe(1);
  });
});
```

### 端到端测试

```bash
# 测试完整工作流
curl -X POST http://localhost:3000/agent/run \
  -H "Content-Type: application/json" \
  -d '{"task": "创建产品宣传视频并发布到YouTube"}'
```

## 🚀 使用示例

### 基础使用

```python
# 直接调用技能
result = await executor.execute('remotion-generator', {
    'description': '创建一个10秒的企业风格视频',
    'duration': 10,
    'style': 'corporate',
    'resolution': '1920x1080'
})

print(f"视频已生成: {result['video_url']}")
```

### Agent使用

```typescript
// 通过Agent使用
const task = '创建一个15秒的动画风格视频展示新功能';
const result = await agent.run(task);

console.log('生成结果:', result.output);
```

### Skill链式调用

```python
# 生成视频 -> 添加水印 -> 发布到平台
video_result = await executor.execute('remotion-generator', {
    'description': '产品宣传视频'
})

watermark_result = await executor.execute('watermark-adder', {
    'video_path': video_result['video_path'],
    'logo_path': '/assets/logo.png'
})

publish_result = await executor.execute('social-media-poster', {
    'video_path': watermark_result['video_path'],
    'platform': 'youtube'
})
```

## 🔮 未来扩展

### 计划功能

1. **更多风格模板**
   - 3D动画风格
   - 手绘风格
   - 数据可视化风格

2. **高级功能**
   - 字幕生成
   - 背景音乐添加
   - 多场景组合

3. **性能优化**
   - 并行渲染
   - 缓存机制
   - 增量更新

4. **集成扩展**
   - 更多平台发布
   - 云端渲染
   - 批量处理

### 技术债务

1. **依赖管理**
   - 解决Python环境依赖问题
   - 优化FFmpeg集成
   - 改进错误处理

2. **代码质量**
   - 添加更多单元测试
   - 改进文档
   - 优化性能

## 📝 总结

Remotion视频生成技能成功实现了以下目标:

✅ **符合PTC设计原则**: 优先skill编排，支持链式调用
✅ **职责明确**: 专注于视频生成，输出标准化数据
✅ **生产就绪**: 支持多种风格、格式和质量配置
✅ **易于扩展**: 模板化设计，便于添加新风格
✅ **错误处理**: 完善的异常处理和恢复机制
✅ **文档完整**: 详细的设计文档和使用指南

该技能为Motia Agent系统提供了强大的视频生成能力，可以与其他技能无缝集成，实现复杂的视频处理工作流。
