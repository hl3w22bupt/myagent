# Lite TTS Skill

轻量级文本转语音（Text-to-Speech）技能，使用系统内置的 TTS 引擎将文本转换为音频文件。

## 特性

- ✅ **零配置**: 直接使用系统 TTS，无需下载模型
- ✅ **多语言支持**: 支持中文、英文等多种语言
- ✅ **轻量级**: 内存占用 <100MB
- ✅ **可定制**: 支持调整语速、音量、声音
- ✅ **多声音**: macOS 支持 177 种系统声音

## 安装依赖

```bash
pip install pyttsx3
```

## 使用方法

### 基础使用

```python
from skills.tts.handler import execute_tts

# 基础英文
result = execute_tts({"text": "Hello, world!"})

# 中文
result = execute_tts({"text": "你好，世界！", "lang": "zh"})
```

### 高级参数

```python
# 调整语速
result = execute_tts({
    "text": "This is a fast speech.",
    "speed": 1.5  # 1.5 倍速
})

# 调整音量
result = execute_tts({
    "text": "Quiet speech",
    "volume": 0.5  # 50% 音量
})

# 指定输出文件
result = execute_tts({
    "text": "Custom output",
    "output_file": "custom/path/test.wav"
})
```

### 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 要转换的文本内容 |
| `voice` | string | ❌ | 声音 ID（默认使用系统默认） |
| `lang` | string | ❌ | 语言代码: `en`, `zh`, `es`, `fr`, `de`, `ja`, `ko` |
| `speed` | number | ❌ | 语速倍率 (0.5-2.0, 默认 1.0) - 详见下方 |
| `volume` | number | ❌ | 音量 (0.0-1.0, 默认 1.0) |
| `task_id` | string | ❌ | 任务 ID（用于文件命名） |
| `output_file` | string | ❌ | 输出文件路径（默认: `outputs/audios/{task_id}_audio_1_{timestamp}.wav`） |

### 语速参数详解

**基准语速**: 150 词/分钟（正常语速）

| speed 值 | 实际语速 | 适用场景 |
|----------|----------|----------|
| 0.8 | 120 词/分钟 | 教程、重要通知 |
| **1.0** | **150 词/分钟** | **正常（默认，适合大多数场景）** |
| 1.2 | 180 词/分钟 | 新闻、快速浏览 |
| 1.5 | 225 词/分钟 | 快速信息摘要 |

> 💡 **提示**: 中文建议使用 0.9-1.1，英文可以使用 1.0-1.3

## 输出格式

### 成功输出

```json
{
  "result_type": "audio",
  "success": true,
  "content": {
    "path": "audios/task-1234567890-1_audio_1_1770563482.wav",
    "mime_type": "audio/wav",
    "size": 123456,
    "duration": 2.5,
    "sample_rate": 22050
  },
  "metadata": {
    "voice": "default",
    "lang": "en",
    "speed": 1.0,
    "volume": 1.0,
    "text_length": 13,
    "engine": "pyttsx3",
    "execution_time": 1250
  }
}
```

### 错误输出

```json
{
  "result_type": "error",
  "success": false,
  "content": {
    "type": "validation",
    "message": "文本内容不能为空",
    "retryable": true,
    "suggestions": ["请提供有效的 text 参数"]
  }
}
```

## 测试

```bash
# 运行测试
python skills/tts/handler.py

# 测试引擎可用性
python skills/tts/lib/pyttsx3_engine.py
```

## 支持的平台

- **macOS**: 使用 NSSpeechSynthesizer，支持 177 种声音
- **Windows**: 使用 SAPI5
- **Linux**: 使用 eSpeak-ng

## 查看可用声音

```python
from skills.tts.lib.pyttsx3_engine import Pyttsx3Engine

engine = Pyttsx3Engine()
voices = engine.get_available_voices()

for voice in voices[:10]:
    print(f"{voice['name']} - {voice['id']}")
```

## 技术细节

- **引擎**: pyttsx3 (系统 TTS 封装)
- **音频格式**: WAV
- **采样率**: 22050 Hz (系统默认)
- **声道**: 单声道/立体声 (取决于系统声音)

## 故障排除

### macOS: 无声音输出

检查系统声音设置:
```bash
# 列出所有声音
say -v '?'

# 测试系统 TTS
say "Hello, world"
```

### Linux: 缺少 eSpeak-ng

```bash
# Ubuntu/Debian
sudo apt-get install espeak-ng

# Fedora
sudo dnf install espeak-ng
```

### Windows: 声音质量问题

确保系统已安装高质量 TTS 语音包:
1. 设置 → 时间和语言 → 语音
2. 管理 → 语音管理 → 下载语音包

## 性能

- **内存占用**: ~55MB
- **转换速度**: ~100 词/秒
- **最大文本长度**: 无限制 (建议 < 1000 字)

## 后续扩展

- [ ] 添加 Kokoro-82M 高质量 backend
- [ ] 支持流式输出
- [ ] 批量处理长文本
- [ ] SSML 标记支持
- [ ] 声音克隆
