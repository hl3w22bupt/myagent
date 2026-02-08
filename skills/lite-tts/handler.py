"""
Lite TTS Skill - 文本转语音处理器

使用系统内置的 TTS 引擎（pyttsx3）将文本转换为音频文件。
"""

import os
import sys
import time
from pathlib import Path
from typing import Dict, Any

# 添加 lib 目录到路径
lib_dir = Path(__file__).parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

try:
    from pyttsx3_engine import Pyttsx3Engine
    from audio_utils import (
        get_audio_duration,
        ensure_output_directory,
        generate_output_filename,
        get_wav_info,
        get_mime_type
    )
    AUDIO_UTILS_AVAILABLE = True
except ImportError as e:
    AUDIO_UTILS_AVAILABLE = False
    IMPORT_ERROR = str(e)

# 添加父 lib 目录以使用 OutputBuilder
parent_lib_dir = Path(__file__).parent.parent / "lib"
if parent_lib_dir.exists():
    sys.path.insert(0, str(parent_lib_dir))

try:
    from output_builder import OutputBuilder, MediaInfo, get_relative_path, get_file_size
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


def execute_tts(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行 TTS 转换

    Args:
        input_data: 包含以下字段的字典:
            - text (必需): 要转换的文本
            - voice (可选): 声音 ID
            - lang (可选): 语言代码
            - output_file (可选): 输出文件路径
            - speed (可选): 语速倍率 (0.5-2.0, 默认 1.0)
            - volume (可选): 音量 (0.0-1.0, 默认 1.0)

    Returns:
        标准格式的输出字典
    """
    # 检查依赖
    if not AUDIO_UTILS_AVAILABLE:
        return build_dependency_error(IMPORT_ERROR)

    # 智能提取文本内容 - 支持多种字段名
    text = (
        input_data.get('text') or
        input_data.get('task') or
        input_data.get('content') or
        input_data.get('message') or
        input_data.get('description') or
        ''
    ).strip()

    if not text:
        return build_validation_error(
            "文本内容不能为空",
            "请提供 text、task、content、message 或 description 参数"
        )

    # 提取参数
    # 优先级：直接传入 > 环境变量 > metadata.taskId > sessionId > 时间戳
    task_id = (
        input_data.get('task_id') or
        os.getenv('MOTIA_TASK_ID') or  # Sandbox 设置的环境变量
        input_data.get('taskId') or
        input_data.get('metadata', {}).get('taskId') or
        input_data.get('sessionId') or
        f"task_{int(time.time())}"
    )
    voice = input_data.get('voice')
    lang = input_data.get('lang')
    speed = float(input_data.get('speed', 1.0))
    volume = float(input_data.get('volume', 1.0))
    output_file = input_data.get('output_file')

    # 验证参数范围
    if speed < 0.5 or speed > 2.0:
        return build_validation_error(
            "语速超出范围",
            "speed 参数必须在 0.5 到 2.0 之间"
        )

    if volume < 0.0 or volume > 1.0:
        return build_validation_error(
            "音量超出范围",
            "volume 参数必须在 0.0 到 1.0 之间"
        )

    # 确定输出路径
    if output_file:
        # 用户指定的路径
        if os.path.isabs(output_file):
            output_path = output_file
        else:
            # 相对路径，相对于项目根目录
            project_root = Path(__file__).parent.parent.parent
            output_path = str(project_root / output_file)
    else:
        # 默认路径 - 使用 task_id 作为文件名前缀
        output_dir = ensure_output_directory()
        filename = generate_output_filename(task_id, index=1)
        output_path = os.path.join(output_dir, filename)

    # 初始化 TTS 引擎
    try:
        tts_engine = Pyttsx3Engine()
    except ImportError as e:
        return build_dependency_error(str(e))
    except Exception as e:
        return build_execution_error(f"无法初始化 TTS 引擎: {str(e)}")

    # 执行转换
    try:
        result = tts_engine.synthesize_to_file(
            text=text,
            output_path=output_path,
            voice=voice,
            lang=lang,
            speed=speed,
            volume=volume
        )

        # 获取音频信息
        duration = get_audio_duration(output_path)
        file_size = get_file_size(output_path) if OUTPUT_BUILDER_AVAILABLE else result['size']

        # 获取 WAV 详细信息
        wav_info = get_wav_info(output_path)

        # 检测实际音频格式和对应的 MIME 类型
        mime_type = get_mime_type(output_path)

        # 构建输出
        if OUTPUT_BUILDER_AVAILABLE:
            relative_path = get_relative_path(output_path)

            media_info = MediaInfo(
                path=relative_path,
                mime_type=mime_type,
                size=file_size,
                duration=duration,
                sample_rate=wav_info.get('frame_rate')
            )

            output = OutputBuilder() \
                .set_media(media_info) \
                .set_title(f"🔊 TTS: {text[:30]}{'...' if len(text) > 30 else ''}") \
                .add_standard_metadata("voice", voice or "default") \
                .add_standard_metadata("lang", lang or "auto") \
                .add_standard_metadata("speed", speed) \
                .add_standard_metadata("volume", volume) \
                .add_standard_metadata("text_length", len(text)) \
                .add_standard_metadata("engine", "pyttsx3") \
                .add_standard_metadata("channels", wav_info.get('channels')) \
                .add_standard_metadata("sample_rate", wav_info.get('frame_rate')) \
                .add_tag("tts") \
                .add_tag("audio") \
                .build()
        else:
            # 降级输出
            output = {
                "result_type": "audio",
                "success": True,
                "content": {
                    "path": output_path,
                    "mime_type": mime_type,
                    "size": file_size,
                    "duration": duration
                },
                "metadata": {
                    "voice": voice or "default",
                    "lang": lang or "auto",
                    "speed": speed,
                    "volume": volume,
                    "text_length": len(text),
                    "engine": "pyttsx3"
                }
            }

        return output

    except ValueError as e:
        return build_validation_error(str(e))
    except Exception as e:
        return build_execution_error(f"语音合成失败: {str(e)}")
    finally:
        # 清理引擎
        try:
            tts_engine.cleanup()
        except:
            pass


def build_validation_error(message: str, details: str = None) -> Dict[str, Any]:
    """构建验证错误输出"""
    if OUTPUT_BUILDER_AVAILABLE:
        from output_builder import ErrorInfo
        error_info = ErrorInfo(
            type="validation",
            message=message,
            details=details,
            retryable=True,
            suggestions=["检查输入参数格式", "参考文档示例"]
        )
        return OutputBuilder().set_error(error_info).build()
    else:
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
    if OUTPUT_BUILDER_AVAILABLE:
        from output_builder import ErrorInfo
        error_info = ErrorInfo(
            type="execution",
            message=message,
            retryable=True,
            suggestions=["检查系统 TTS 引擎是否可用", "尝试使用不同的声音或语言"]
        )
        return OutputBuilder().set_error(error_info).build()
    else:
        return {
            "result_type": "error",
            "success": False,
            "content": {
                "type": "execution",
                "message": message
            }
        }


def build_dependency_error(message: str) -> Dict[str, Any]:
    """构建依赖错误输出"""
    if OUTPUT_BUILDER_AVAILABLE:
        from output_builder import ErrorInfo
        error_info = ErrorInfo(
            type="dependency",
            message=f"缺少依赖: {message}",
            retryable=False,
            suggestions=["安装 pyttsx3: pip install pyttsx3", "检查 Python 环境"]
        )
        return OutputBuilder().set_error(error_info).build()
    else:
        return {
            "result_type": "error",
            "success": False,
            "content": {
                "type": "dependency",
                "message": f"缺少依赖: {message}"
            }
        }


# 测试代码
if __name__ == "__main__":
    import json

    print("=" * 60)
    print("Lite TTS Skill - 测试")
    print("=" * 60)

    # 测试 1: 基础英文
    print("\n测试 1: 基础英文转换")
    print("-" * 60)
    result = execute_tts({"text": "Hello, world!"})
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # 测试 2: 中文
    print("\n测试 2: 中文转换")
    print("-" * 60)
    result = execute_tts({"text": "你好，这是一个测试。", "lang": "zh"})
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # 测试 3: 调整语速
    print("\n测试 3: 快速语音")
    print("-" * 60)
    result = execute_tts({"text": "This is a fast speech test.", "speed": 1.5})
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # 测试 4: 错误处理 - 空文本
    print("\n测试 4: 错误处理 - 空文本")
    print("-" * 60)
    result = execute_tts({"text": ""})
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # 测试 5: 错误处理 - 超出范围的语速
    print("\n测试 5: 错误处理 - 超出范围的语速")
    print("-" * 60)
    result = execute_tts({"text": "Test", "speed": 5.0})
    print(json.dumps(result, indent=2, ensure_ascii=False))

    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
