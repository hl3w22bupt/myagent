"""
Lite TTS Skill 使用示例
"""

import json
from handler import execute_tts


def example_basic():
    """基础示例：英文文本转语音"""
    print("=" * 60)
    print("示例 1: 基础英文转换")
    print("=" * 60)

    result = execute_tts({"text": "Hello, world!"})

    if result["success"]:
        print(f"✓ 成功生成音频文件")
        print(f"  文件: {result['content']['path']}")
        print(f"  大小: {result['content']['size']} 字节")
        print(f"  时长: {result['content'].get('duration', 'N/A')} 秒")
    else:
        print(f"✗ 转换失败: {result['content']['message']}")

    print()


def example_chinese():
    """示例：中文文本转语音"""
    print("=" * 60)
    print("示例 2: 中文转换")
    print("=" * 60)

    result = execute_tts({
        "text": "你好，这是一个文本转语音测试。",
        "lang": "zh"
    })

    if result["success"]:
        print(f"✓ 成功生成中文音频")
        print(f"  文件: {result['content']['path']}")
        print(f"  引擎: {result['metadata']['engine']}")
    else:
        print(f"✗ 转换失败")

    print()


def example_speed_control():
    """示例：调整语速"""
    print("=" * 60)
    print("示例 3: 语速控制")
    print("=" * 60)

    speeds = [0.5, 1.0, 1.5, 2.0]
    text = "This is a speed control test."

    for speed in speeds:
        result = execute_tts({
            "text": text,
            "speed": speed
        })

        if result["success"]:
            actual_speed = result['metadata']['speed']
            print(f"✓ {actual_speed}x 语速: {result['content']['path']}")

    print()


def example_custom_output():
    """示例：指定输出路径"""
    print("=" * 60)
    print("示例 4: 自定义输出路径")
    print("=" * 60)

    result = execute_tts({
        "text": "This will be saved to a custom location.",
        "output_file": "custom/path/my_audio.wav"
    })

    if result["success"]:
        print(f"✓ 文件已保存到: {result['content']['path']}")
    else:
        print(f"✗ 保存失败")

    print()


def example_error_handling():
    """示例：错误处理"""
    print("=" * 60)
    print("示例 5: 错误处理")
    print("=" * 60)

    # 空文本
    print("测试 1: 空文本")
    result = execute_tts({"text": ""})
    print(f"  错误类型: {result['content']['type']}")
    print(f"  错误消息: {result['content']['message']}")
    print()

    # 超出范围的语速
    print("测试 2: 超出范围的语速")
    result = execute_tts({"text": "Test", "speed": 5.0})
    print(f"  错误类型: {result['content']['type']}")
    print(f"  错误消息: {result['content']['message']}")
    print()


def example_long_text():
    """示例：长文本处理"""
    print("=" * 60)
    print("示例 6: 长文本处理")
    print("=" * 60)

    long_text = """
    文本转语音技术是将文字信息转化为语音信息的技术。
    该技术涉及声学、语言学、数字信号处理、人工智能等多种学科。
    随着深度学习技术的发展，现代 TTS 系统已经可以生成非常自然的语音。
    """

    result = execute_tts({
        "text": long_text.strip(),
        "lang": "zh"
    })

    if result["success"]:
        print(f"✓ 长文本转换成功")
        print(f"  文本长度: {result['metadata']['text_length']} 字符")
        print(f"  文件大小: {result['content']['size']} 字节")
    else:
        print(f"✗ 转换失败")

    print()


def main():
    """运行所有示例"""
    print("\n" + "=" * 60)
    print("Lite TTS Skill - 使用示例")
    print("=" * 60 + "\n")

    example_basic()
    example_chinese()
    example_speed_control()
    example_custom_output()
    example_error_handling()
    example_long_text()

    print("=" * 60)
    print("所有示例运行完成")
    print("=" * 60)


if __name__ == "__main__":
    main()
