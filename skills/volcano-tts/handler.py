"""
Volcano TTS Skill - 火山引擎语音合成处理器

使用火山引擎 API 将文本转换为语音音频。

环境变量配置:
- VOLCANO_TTS_API_URL: 火山引擎 TTS API 地址 (默认: https://openspeech.bytedance.com/api/v1/tts)
- VOLCANO_TTS_APP_ID: 应用 ID
- VOLCANO_TTS_ACCESS_TOKEN: 访问令牌 (Access Token)
"""

import os
import time
import hashlib
import json
import struct
from pathlib import Path
from typing import Dict, Any
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# 火山引擎 TTS API 配置
VOLCANO_API_URL = os.getenv('VOLCANO_TTS_API_URL', 'https://openspeech.bytedance.com/api/v1/tts')
VOLCANO_APP_ID = os.getenv('VOLCANO_TTS_APP_ID', '')
# Support both ACCESS_TOKEN and ACCESS_KEY for flexibility
VOLCANO_ACCESS_TOKEN = os.getenv('VOLCANO_TTS_ACCESS_TOKEN') or os.getenv('VOLCANO_TTS_ACCESS_KEY', '')

# 默认 TTS 配置（可通过环境变量覆盖）
DEFAULT_TTS_VOICE_TYPE = os.getenv('DEFAULT_TTS_VOICE_TYPE', 'BV001_streaming')
DEFAULT_TTS_SPEED = float(os.getenv('DEFAULT_TTS_SPEED', '1.3'))  # 提高默认语速，更自然
DEFAULT_TTS_VOLUME = float(os.getenv('DEFAULT_TTS_VOLUME', '1.0'))

# 火山引擎 TTS 文本长度限制
MAX_TEXT_LENGTH = 200  # 单次请求最大字符数（火山引擎 API 实际限制）

# 输出目录（与 lite-tts 保持一致）
OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "audios"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def split_text_for_tts(text: str, max_length: int = MAX_TEXT_LENGTH) -> list[str]:
    """将长文本分割成适合 TTS 的片段

    Args:
        text: 要分割的文本
        max_length: 每段最大长度

    Returns:
        文本片段列表
    """
    if len(text) <= max_length:
        return [text]

    chunks = []
    current_chunk = ""

    # 按句子分割（保留分隔符）
    import re
    sentences = re.split(r'([。！？.!?;；\n]+)', text)

    for i in range(0, len(sentences), 2):
        sentence = sentences[i]
        delimiter = sentences[i + 1] if i + 1 < len(sentences) else ""

        combined = sentence + delimiter

        if len(current_chunk) + len(combined) <= max_length:
            current_chunk += combined
        else:
            if current_chunk:
                chunks.append(current_chunk)
            # 如果单个句子超过限制，强制分割
            if len(combined) > max_length:
                for j in range(0, len(combined), max_length):
                    chunks.append(combined[j:j + max_length])
                current_chunk = ""
            else:
                current_chunk = combined

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def merge_wav_files(wav_files: list[str], output_path: str) -> None:
    """合并多个 WAV 文件

    Args:
        wav_files: WAV 文件路径列表
        output_path: 输出文件路径
    """
    import wave

    # 读取所有文件
    audio_data = []
    params = None

    for wav_file in wav_files:
        with wave.open(wav_file, 'rb') as wf:
            if params is None:
                params = wf.getparams()
            audio_data.append(wf.readframes(wf.getnframes()))

    # 写入合并后的文件
    with wave.open(output_path, 'wb') as wf:
        wf.setparams(params)
        for data in audio_data:
            wf.writeframes(data)


def generate_output_filename(task_id: str, index: int = 1, extension: str = "wav") -> str:
    """
    生成输出文件名（与其他 media 类型保持一致的命名规范）

    Args:
        task_id: 任务 ID
        index: 文件索引（同一任务生成多个文件时使用）
        extension: 文件扩展名

    Returns:
        文件名（不包含路径）

    命名格式: {task_id}_audio_{index}_{timestamp}.{extension}
    示例: task-1234567890-1_audio_1_1770563482.wav
    """
    timestamp = int(time.time())
    filename = f"{task_id}_audio_{index}_{timestamp}.{extension}"
    return filename


def pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """
    将原始 PCM 数据转换为 WAV 格式

    Args:
        pcm_data: 原始 PCM 音频数据 (16-bit signed little-endian)
        sample_rate: 采样率 (默认 16000Hz)
        channels: 声道数 (默认 1 = 单声道)
        bits_per_sample: 位深 (默认 16-bit)

    Returns:
        WAV 格式的音频数据（包含 WAV 文件头）
    """
    num_samples = len(pcm_data) // 2  # 16-bit = 2 bytes per sample
    data_size = len(pcm_data)
    file_size = 36 + data_size  # WAV header size (36) + data size

    # 构建 WAV 文件头
    wav_header = struct.pack('<4sI4s', b'RIFF', file_size, b'WAVE')
    fmt_chunk = struct.pack('<4sIHHIIHH',
                           b'fmt ',  # chunk ID
                           16,       # chunk size (for PCM)
                           1,        # audio format (1 = PCM)
                           channels, # num channels
                           sample_rate,  # sample rate
                           sample_rate * channels * bits_per_sample // 8,  # byte rate
                           channels * bits_per_sample // 8,  # block align
                           bits_per_sample)  # bits per sample
    data_chunk_header = struct.pack('<4sI', b'data', data_size)

    return wav_header + fmt_chunk + data_chunk_header + pcm_data


def build_success_output(
    audio_path: str,
    audio_url: str,
    duration: float,
    size: int,
    voice_type: str,
    emotion: str,
    text_length: int,
    execution_time: int
) -> Dict[str, Any]:
    """构建成功输出"""
    return {
        "result_type": "audio",
        "success": True,
        "content": {
            "path": audio_path,
            "url": audio_url,
            "mime_type": "audio/wav",
            "duration": duration,
            "size": size
        },
        "metadata": {
            "execution_time": execution_time,
            "voice_type": voice_type,
            "emotion": emotion,
            "text_length": text_length,
            "engine": "volcano"
        }
    }


def build_validation_error(message: str, details: str = None) -> Dict[str, Any]:
    """构建验证错误输出"""
    return {
        "result_type": "error",
        "success": False,
        "content": {
            "type": "validation",
            "message": message,
            "details": details
        }
    }


def build_execution_error(message: str) -> Dict[str, Any]:
    """构建执行错误输出"""
    return {
        "result_type": "error",
        "success": False,
        "content": {
            "type": "execution",
            "message": message
        }
    }


def call_volcano_tts_api(
    text: str,
    voice_type: str,
    emotion: str,
    speed: float,
    volume: float,
    pitch: float,
    output_format: str,
    sample_rate: int,
    task_id: str
) -> Dict[str, Any]:
    """调用火山引擎 TTS API

    Args:
        task_id: 任务 ID，用于生成文件名
    """

    # 检查配置
    if not all([VOLCANO_APP_ID, VOLCANO_ACCESS_TOKEN]):
        return build_execution_error(
            "火山引擎 TTS 配置不完整，请设置环境变量: "
            "VOLCANO_TTS_APP_ID, VOLCANO_TTS_ACCESS_TOKEN"
        )

    import base64

    # 构造请求参数
    params = {
        "app": {
            "appid": VOLCANO_APP_ID,
            "token": VOLCANO_ACCESS_TOKEN,
            "cluster": "volcano_tts"
        },
        "user": {
            "uid": "default_user"
        },
        "audio": {
            "voice_type": voice_type,
            "speed_ratio": speed,
            "volume_ratio": volume,
            "pitch_ratio": pitch,
            # 添加 style 参数控制情感风格
            "style": emotion if emotion in ["happy", "sad", "angry", "fear", "surprise", "joyful", "tender", "excited"] else "neutral",
        },
        "request": {
            "reqid": f"req_{int(time.time() * 1000)}",
            "text": text,
            "text_type": "plain",
            "operation": "query"
        }
    }

    # 使用正确的认证格式: Bearer;{token}
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer;{VOLCANO_ACCESS_TOKEN}",
        "X-Api-App-Key": VOLCANO_APP_ID,
        "X-Api-Access-Key": VOLCANO_ACCESS_TOKEN,
        "X-Api-Resource-Id": "volc.service_type.10029",
    }

    try:
        data = json.dumps(params, ensure_ascii=False).encode('utf-8')
        req = Request(VOLCANO_API_URL, data=data, headers=headers, method='POST')

        with urlopen(req, timeout=60) as response:
            response_data = response.read().decode('utf-8')
            result = json.loads(response_data)

            # code 3000 (Success) 或 0 表示成功
            if result.get("code") in [0, 3000] and result.get("message") == "Success":
                # 音频数据在 data 字段中（base64 编码）
                audio_base64 = result.get("data", "")
                if not audio_base64:
                    return build_execution_error("API 返回成功但无音频数据")

                # 解码 base64 音频（API 返回的是原始 PCM 数据）
                pcm_data = base64.b64decode(audio_base64)

                # 将 PCM 转换为 WAV 格式（添加 WAV 文件头）
                wav_data = pcm_to_wav(pcm_data, sample_rate=sample_rate)

                # 生成输出文件路径（使用统一的命名规范）
                filename = generate_output_filename(task_id, index=1, extension="wav")
                output_path = OUTPUT_DIR / filename

                # 保存音频文件
                with open(output_path, 'wb') as f:
                    f.write(wav_data)

                # 计算音频时长
                duration = len(pcm_data) / 2 / sample_rate  # 16-bit = 2 bytes per sample

                return {
                    "success": True,
                    "audio_url": f"file://{output_path}",
                    "duration": duration,
                    "format": "wav",
                    "size": len(wav_data)
                }
            else:
                return build_execution_error(
                    f"火山引擎 API 错误 (code: {result.get('code')}): {result.get('message', 'Unknown error')}"
                )

    except HTTPError as e:
        try:
            error_body = e.read().decode('utf-8')
            error_result = json.loads(error_body)
            return build_execution_error(
                f"HTTP {e.code}: {error_result.get('message', e.reason)}"
            )
        except:
            return build_execution_error(f"HTTP {e.code}: {e.reason}")
    except URLError as e:
        return build_execution_error(f"网络错误: {e.reason}")
    except TimeoutError:
        return build_execution_error("请求超时")
    except Exception as e:
        return build_execution_error(f"API 调用失败: {str(e)}")


def download_audio(url: str, output_path: str) -> tuple:
    """下载音频文件 (已废弃，直接在 API 调用中保存)"""
    try:
        req = Request(url)
        with urlopen(req, timeout=30) as response:
            data = response.read()
            with open(output_path, 'wb') as f:
                f.write(data)
            size = len(data)
            # 简单估算时长（实际应该解析音频头）
            duration = size / 32000  # 假设 32kbps 平均码率
            return True, size, duration
    except Exception as e:
        print(f"Download failed: {e}")
        return False, 0, 0


def execute_volcano_tts(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行火山引擎 TTS 转换

    Args:
        input_data: 包含以下字段的字典:
            - text (必需): 要转换的文本
            - voice_type (可选): 声音类型
            - emotion (可选): 情感风格
            - speed (可选): 语速倍率
            - volume (可选): 音量
            - output_format (可选): 输出格式
            - sample_rate (可选): 采样率
            - task_id (可选): 任务 ID

    Returns:
        标准格式的输出字典
    """
    start_time = time.time()

    # 提取 task_id（优先级: input_data > 环境变量 > 时间戳）
    task_id = (
        input_data.get('task_id') or
        os.getenv('MOTIA_TASK_ID') or  # Sandbox 设置的环境变量
        input_data.get('taskId') or
        input_data.get('metadata', {}).get('taskId') or
        input_data.get('sessionId') or
        f"tts_{int(time.time())}"
    )

    # 提取参数（优先级: input_data > 环境变量 > 默认值）
    text = input_data.get('text', '').strip()
    voice_type = input_data.get('voice_type') or DEFAULT_TTS_VOICE_TYPE
    emotion = input_data.get('emotion', 'neutral')
    speed = float(input_data.get('speed', DEFAULT_TTS_SPEED))
    volume = float(input_data.get('volume', DEFAULT_TTS_VOLUME))
    pitch = float(input_data.get('pitch', 1.0))  # 默认音调为 1.0
    output_format = input_data.get('output_format', 'wav')  # API 返回 PCM，我们转换为 WAV
    sample_rate = int(input_data.get('sample_rate', 24000))  # 火山引擎 API 返回 24kHz PCM

    # 校验 voice_type，只接受已知的 API voice_type（PTC 可能 hallucinate 无效值）
    VALID_VOICE_TYPES = {'BV001_streaming', 'BV002_streaming', 'BV003_streaming', 'BV004_streaming'}
    if voice_type not in VALID_VOICE_TYPES:
        print(f"[volcano-tts] ⚠️ Invalid voice_type '{voice_type}', falling back to {DEFAULT_TTS_VOICE_TYPE}")
        voice_type = DEFAULT_TTS_VOICE_TYPE

    # 校验 output_format（API 返回 PCM，只支持 wav 输出）
    if output_format != 'wav':
        print(f"[volcano-tts] ⚠️ Unsupported output_format '{output_format}', falling back to wav")
        output_format = 'wav'

    # 验证参数
    if not text:
        return build_validation_error("文本内容不能为空")

    if speed < 0.5 or speed > 2.0:
        return build_validation_error("语速必须在 0.5 到 2.0 之间")

    if volume < 0.0 or volume > 1.0:
        return build_validation_error("音量必须在 0.0 到 1.0 之间")

    if pitch < 0.5 or pitch > 2.0:
        return build_validation_error("音调必须在 0.5 到 2.0 之间")

    # 文本长度检查与分段处理
    text_chunks = split_text_for_tts(text, MAX_TEXT_LENGTH)

    if len(text_chunks) > 1:
        print(f"[volcano-tts] 文本长度 {len(text)} 超过限制 {MAX_TEXT_LENGTH}，分为 {len(text_chunks)} 段处理")

    # 处理每一段文本
    chunk_files = []
    total_duration = 0.0
    total_size = 0

    for index, chunk in enumerate(text_chunks, start=1):
        chunk_task_id = f"{task_id}_chunk{index}"

        api_result = call_volcano_tts_api(
            text=chunk,
            voice_type=voice_type,
            emotion=emotion,
            speed=speed,
            volume=volume,
            pitch=pitch,
            output_format=output_format,
            sample_rate=sample_rate,
            task_id=chunk_task_id
        )

        if not api_result.get("success"):
            # 返回具体的错误信息
            return build_execution_error(
                f"第 {index}/{len(text_chunks)} 段转换失败: {api_result.get('content', {}).get('message', 'Unknown error')}"
            )

        # 记录音频文件
        chunk_filename = generate_output_filename(chunk_task_id, index=1, extension="wav")
        chunk_path = OUTPUT_DIR / chunk_filename
        chunk_files.append(str(chunk_path))

        total_duration += api_result["duration"]
        total_size += api_result["size"]

    # 合并音频文件（如果有多段）
    if len(text_chunks) > 1:
        filename = generate_output_filename(task_id, index=1, extension="wav")
        output_path = OUTPUT_DIR / filename

        try:
            merge_wav_files(chunk_files, str(output_path))

            # 删除临时文件
            for f in chunk_files:
                Path(f).unlink(missing_ok=True)
        except Exception as e:
            return build_execution_error(f"音频合并失败: {str(e)}")
    else:
        output_path = chunk_files[0]

    execution_time = int((time.time() - start_time) * 1000)

    return build_success_output(
        audio_path=str(output_path),
        audio_url=f"file://{output_path}",
        duration=total_duration,
        size=total_size,
        voice_type=voice_type,
        emotion=emotion,
        text_length=len(text),
        execution_time=execution_time
    )


# 测试代码
if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("Volcano TTS Skill - 测试")
    print("=" * 60)

    # 测试基础转换
    print("\n测试: 基础转换")
    print("-" * 60)
    result = execute_volcano_tts({
        "text": "你好，这是一个测试。",
        "voice_type": "zh_female_xiaoyi",
        "emotion": "neutral",
        "task_id": "test_001"
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))
