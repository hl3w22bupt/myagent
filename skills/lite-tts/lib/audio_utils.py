"""
音频工具函数
"""

import os
import wave
from pathlib import Path
from typing import Optional


def get_audio_duration(file_path: str) -> Optional[float]:
    """
    获取 WAV 音频文件时长

    Args:
        file_path: WAV 文件路径

    Returns:
        时长（秒），如果无法获取返回 None
    """
    try:
        with wave.open(file_path, 'r') as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            duration = frames / float(rate)
            return duration
    except Exception:
        return None


def ensure_output_directory(base_path: str = "outputs/audios") -> str:
    """
    确保输出目录存在

    Args:
        base_path: 基础路径（相对于项目根目录）

    Returns:
        绝对路径
    """
    # 获取项目根目录
    current_file = Path(__file__)
    project_root = current_file.parent.parent.parent.parent
    output_dir = project_root / base_path

    # 创建目录
    output_dir.mkdir(parents=True, exist_ok=True)

    return str(output_dir)


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
    import time

    timestamp = int(time.time())

    # 与 video/image 保持一致的命名格式
    filename = f"{task_id}_audio_{index}_{timestamp}.{extension}"
    return filename


def get_wav_info(file_path: str) -> dict:
    """
    获取 WAV 文件信息

    Args:
        file_path: WAV 文件路径

    Returns:
        包含音频信息的字典
    """
    try:
        with wave.open(file_path, 'r') as wav_file:
            return {
                'channels': wav_file.getnchannels(),
                'sample_width': wav_file.getsampwidth(),
                'frame_rate': wav_file.getframerate(),
                'n_frames': wav_file.getnframes(),
                'duration': wav_file.getnframes() / wav_file.getframerate(),
                'compression_type': wav_file.getcomptype()
            }
    except Exception as e:
        return {'error': str(e)}


def detect_audio_format(file_path: str) -> str:
    """
    检测音频文件的实际格式

    Args:
        file_path: 音频文件路径

    Returns:
        文件格式 ('wav', 'aiff', 'unknown')
    """
    try:
        # 读取文件头判断格式
        with open(file_path, 'rb') as f:
            header = f.read(12)

            # RIFF header (WAV)
            if header[:4] == b'RIFF' and header[8:12] == b'WAVE':
                return 'wav'

            # FORM header (AIFF)
            if header[:4] == b'FORM' and header[8:12] in [b'AIFF', b'AIFC']:
                return 'aiff'

        return 'unknown'
    except Exception:
        return 'unknown'


def get_mime_type(file_path: str) -> str:
    """
    根据文件格式获取正确的 MIME 类型

    Args:
        file_path: 音频文件路径

    Returns:
        MIME 类型字符串
    """
    format_type = detect_audio_format(file_path)

    mime_types = {
        'wav': 'audio/wav',
        'aiff': 'audio/aiff',
        'aifc': 'audio/aiff'
    }

    return mime_types.get(format_type, 'audio/wav')  # 默认返回 audio/wav
