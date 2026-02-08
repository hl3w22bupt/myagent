"""
pyttsx3 TTS 引擎封装
"""

import os
import time
import tempfile
from typing import Optional, Dict, Any, List
from pathlib import Path


class Pyttsx3Engine:
    """
    pyttsx3 TTS 引擎封装类

    使用系统内置的 TTS 引擎，支持多语言和多声音。
    macOS: 使用 NSSpeechSynthesizer
    Windows: 使用 SAPI5
    Linux: 使用 eSpeak-ng
    """

    def __init__(self):
        """初始化 TTS 引擎"""
        try:
            import pyttsx3
            self.engine = pyttsx3.init()
            self.available = True
        except ImportError:
            self.available = False
            raise ImportError(
                "pyttsx3 未安装。请运行: pip install pyttsx3"
            )
        except Exception as e:
            self.available = False
            raise RuntimeError(f"无法初始化 TTS 引擎: {str(e)}")

    def get_available_voices(self) -> List[Dict[str, str]]:
        """
        获取可用的声音列表

        Returns:
            声音信息列表，每个声音包含 id 和 name
        """
        voices = []
        try:
            for voice in self.engine.getProperty('voices'):
                voices.append({
                    'id': voice.id,
                    'name': voice.name,
                    'languages': getattr(voice, 'languages', []),
                    'gender': getattr(voice, 'gender', None)
                })
        except Exception as e:
            # 如果获取失败，返回空列表
            pass
        return voices

    def find_voice_by_language(self, lang_code: str) -> Optional[str]:
        """
        根据语言代码查找声音

        Args:
            lang_code: 语言代码 (zh, en, es, fr, de, ja, ko)

        Returns:
            声音 ID，如果未找到返回 None
        """
        voices = self.get_available_voices()

        # 语言代码映射
        lang_mappings = {
            'zh': ['zh', 'chinese', 'mandarin'],
            'en': ['en', 'english'],
            'es': ['es', 'spanish'],
            'fr': ['fr', 'french'],
            'de': ['de', 'german'],
            'ja': ['ja', 'japanese'],
            'ko': ['ko', 'korean']
        }

        # 获取该语言的关键词
        keywords = lang_mappings.get(lang_code, [lang_code])

        # 搜索匹配的声音
        for voice in voices:
            voice_id = voice['id'].lower()
            voice_name = voice['name'].lower()

            for keyword in keywords:
                if keyword in voice_id or keyword in voice_name:
                    return voice['id']

        return None

    def synthesize_to_file(
        self,
        text: str,
        output_path: str,
        voice: Optional[str] = None,
        lang: Optional[str] = None,
        speed: float = 1.0,
        volume: float = 1.0
    ) -> Dict[str, Any]:
        """
        合成语音并保存到文件

        Args:
            text: 要转换的文本
            output_path: 输出文件路径
            voice: 声音 ID（可选）
            lang: 语言代码（可选，用于筛选声音）
            speed: 语速倍率（0.5-2.0）
            volume: 音量（0.0-1.0）

        Returns:
            包含文件信息和元数据的字典
        """
        if not text or not text.strip():
            raise ValueError("文本内容不能为空")

        # 确保输出目录存在
        output_dir = os.path.dirname(output_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        # 配置引擎
        self._configure_engine(voice, lang, speed, volume)

        # 合成到临时文件
        temp_file = None
        try:
            # pyttsx3 需要临时文件来保存音频
            temp_file = tempfile.NamedTemporaryFile(
                mode='wb',
                suffix='.wav',
                delete=False
            )
            temp_path = temp_file.name
            temp_file.close()

            # 保存音频到临时文件
            self.engine.save_to_file(text, temp_path)
            self.engine.runAndWait()

            # 等待文件生成
            max_wait = 10  # 最多等待10秒
            wait_time = 0
            while not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
                if wait_time >= max_wait:
                    raise TimeoutError("音频文件生成超时")
                time.sleep(0.1)
                wait_time += 0.1

            # 检查文件格式，如果是 AIFF 则转换为 WAV
            import shutil
            file_format = self._detect_audio_format(temp_path)

            if file_format == 'aiff':
                print(f"[Lite TTS] 检测到 AIFF 格式，正在转换为 WAV...")
                wav_path = self._convert_aiff_to_wav(temp_path)
                if wav_path and os.path.exists(wav_path):
                    # 删除临时 AIFF 文件
                    os.unlink(temp_path)
                    temp_path = wav_path
                    print(f"[Lite TTS] ✓ 转换成功: {wav_path}")
                else:
                    print(f"[Lite TTS] ⚠ 转换失败，保留原始 AIFF 文件")

            # 移动到目标位置
            shutil.move(temp_path, output_path)

            # 获取文件信息
            file_size = os.path.getsize(output_path)

            return {
                'path': output_path,
                'size': file_size,
                'success': True
            }

        except Exception as e:
            # 清理临时文件
            if temp_file and os.path.exists(temp_file.name):
                try:
                    os.unlink(temp_file.name)
                except:
                    pass
            raise e

    def _configure_engine(
        self,
        voice: Optional[str],
        lang: Optional[str],
        speed: float,
        volume: float
    ) -> None:
        """配置引擎参数"""
        # 设置语速
        try:
            # 基准语速：150 词/分钟（正常语速）
            # speed=1.0 → 150（正常）
            # speed=0.8 → 120（慢速）
            # speed=1.2 → 180（快速）
            BASE_RATE = 150
            new_rate = int(BASE_RATE * speed)
            self.engine.setProperty('rate', new_rate)
        except Exception:
            pass

        # 设置音量
        try:
            self.engine.setProperty('volume', max(0.0, min(1.0, volume)))
        except Exception:
            pass

        # 设置声音
        try:
            if voice:
                # 直接使用指定的声音
                self.engine.setProperty('voice', voice)
            elif lang:
                # 根据语言查找声音
                voice_id = self.find_voice_by_language(lang)
                if voice_id:
                    self.engine.setProperty('voice', voice_id)
        except Exception:
            # 如果设置失败，使用默认声音
            pass

    def _detect_audio_format(self, file_path: str) -> str:
        """
        检测音频文件格式

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

    def _convert_aiff_to_wav(self, aiff_path: str) -> str:
        """
        将 AIFF 文件转换为 WAV 格式

        Args:
            aiff_path: AIFF 文件路径

        Returns:
            WAV 文件路径，如果转换失败返回 None
        """
        import subprocess

        try:
            # 创建临时 WAV 文件
            wav_file = tempfile.NamedTemporaryFile(
                mode='wb',
                suffix='.wav',
                delete=False
            )
            wav_path = wav_file.name
            wav_file.close()

            # 使用 ffmpeg 转换
            # -y: 覆盖输出文件
            # -loglevel quiet: 减少日志输出
            result = subprocess.run([
                'ffmpeg',
                '-i', aiff_path,
                '-y',
                '-loglevel', 'error',
                wav_path
            ], capture_output=True, timeout=30)

            if result.returncode == 0 and os.path.exists(wav_path) and os.path.getsize(wav_path) > 0:
                return wav_path
            else:
                # ffmpeg 失败，删除临时文件
                if os.path.exists(wav_path):
                    os.unlink(wav_path)
                print(f"[Lite TTS] FFmpeg conversion failed: {result.stderr.decode('utf-8', errors='ignore')}")
                return None

        except subprocess.TimeoutExpired:
            if os.path.exists(wav_path):
                os.unlink(wav_path)
            return None
        except Exception as e:
            # 转换失败
            print(f"[Lite TTS] Conversion error: {str(e)}")
            return None

    def cleanup(self):
        """清理引擎资源"""
        if self.engine:
            try:
                self.engine.stop()
            except:
                pass


def test_engine():
    """测试引擎是否可用"""
    try:
        engine = Pyttsx3Engine()
        voices = engine.get_available_voices()
        print(f"✓ TTS 引擎初始化成功")
        print(f"✓ 可用声音数量: {len(voices)}")

        # 显示前5个声音
        for i, voice in enumerate(voices[:5]):
            print(f"  {i+1}. {voice['name']} ({voice['id']})")

        if len(voices) > 5:
            print(f"  ... 还有 {len(voices) - 5} 个声音")

        return True
    except Exception as e:
        print(f"✗ TTS 引擎测试失败: {str(e)}")
        return False


if __name__ == "__main__":
    test_engine()
