"""
Text Interpreter for Lite TTS Skill

使用 LLM 智能理解用户输入的意图：
1. 判断用户是想要生成内容（如 "解释傅里叶变换"）还是直接转换文本
2. 如果需要生成内容，则 LLM 生成相应的内容文本
3. 如果是直接转换，则原样返回文本
"""

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Any, Optional

# 添加 src 目录到路径以导入 LLMClient
src_dir = Path(__file__).parent.parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.llm_client import get_llm_client
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False

logger = logging.getLogger(__name__)


class InterpretResult:
    """文本解释结果"""
    def __init__(
        self,
        text: str,
        intent: str,
        was_generated: bool = False,
        original_input: str = ""
    ):
        self.text = text
        self.intent = intent  # "direct" 或 "generate"
        self.was_generated = was_generated
        self.original_input = original_input

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "intent": self.intent,
            "was_generated": self.was_generated,
            "original_input": self.original_input
        }


class TextInterpreter:
    """
    文本解释器 - 使用 LLM 理解用户意图并生成相应的文本
    """

    # 判断意图的系统提示词
    INTENT_SYSTEM_PROMPT = """你是一个智能文本意图识别助手。你的任务是判断用户输入的意图：

**两种可能的意图：**

1. **direct (直接转换)**: 用户提供的文本就是他们想要转换为语音的内容
   - 例如: "你好，欢迎使用语音合成系统"
   - 例如: "Hello, this is a test"
   - 例如: "今天天气真不错"

2. **generate (生成内容)**: 用户想要你生成/创作内容，然后转换为语音
   - 例如: "Generate audio narration explaining Fourier Transform concepts"
   - 例如: "解释量子力学的基本原理"
   - 例如: "Create a story about a brave knight"

**判断规则：**
- 如果文本包含指令性动词（generate, create, explain, 解释, 创作, 生成等）+ 主题描述，则是 "generate"
- 如果文本看起来像是一段完整的句子或段落，没有明显的生成指令，则是 "direct"
- 简短的主题描述（如 "傅里叶变换"）偏向 "generate" —— 生成关于该主题的介绍
- 带有时长要求的（如 "approx. 12 seconds"）通常是 "generate"

**输出格式：**
仅输出 JSON，格式如下：
```json
{
  "intent": "direct" 或 "generate",
  "reasoning": "简短解释判断理由",
  "topic": "如果是 generate，提取的主题；否则为 null"
}
```
"""

    # 生成内容的系统提示词
    GENERATE_SYSTEM_PROMPT = """你是一个专业的内容创作者，擅长生成适合语音播报的文本内容。

**任务要求：**
1. 根据用户的主题要求，生成自然、流畅的口语化内容
2. 内容应该适合朗读，避免过于复杂的句子结构
3. 控制长度：一般 50-200 字为宜（除非用户指定了时长要求）
4. 语言应该生动有趣，易于理解

**风格指南：**
- 使用自然口语，像是在对话或讲解
- 适当使用停顿符号（逗号、句号）帮助节奏
- 避免过于学术化或生硬的表达
- 如果是知识科普，要深入浅出

**输出要求：**
仅输出要转换为语音的文本内容，不要包含任何额外的说明或标记。
"""

    def __init__(self, skill_name: str = "lite-tts"):
        """
        初始化文本解释器

        Args:
            skill_name: Skill 名称，用于追踪
        """
        self.skill_name = skill_name
        self.llm = None

        if LLM_AVAILABLE:
            try:
                self.llm = get_llm_client(skill_name=skill_name)
                logger.info(f"TextInterpreter: LLM client initialized for {skill_name}")
            except Exception as e:
                logger.warning(f"TextInterpreter: Failed to initialize LLM client: {e}")

    async def interpret_async(
        self,
        text: str,
        task_id: Optional[str] = None
    ) -> InterpretResult:
        """
        异步解释文本意图

        Args:
            text: 用户输入的文本
            task_id: 任务 ID，用于追踪

        Returns:
            InterpretResult: 解释结果
        """
        if not text or not text.strip():
            return InterpretResult(
                text="",
                intent="direct",
                was_generated=False,
                original_input=text
            )

        # 如果 LLM 不可用，直接返回原文本
        if not self.llm:
            logger.warning("LLM not available, returning original text")
            return InterpretResult(
                text=text,
                intent="direct",
                was_generated=False,
                original_input=text
            )

        try:
            # 步骤 1: 判断意图
            intent_result = await self._detect_intent(text)
            intent = intent_result.get("intent", "direct")
            topic = intent_result.get("topic")

            logger.info(f"Intent detected: {intent}, topic: {topic}")

            # 步骤 2: 根据意图处理
            if intent == "generate" and topic:
                # 生成内容
                generated_text = await self._generate_content(text, topic)
                return InterpretResult(
                    text=generated_text,
                    intent=intent,
                    was_generated=True,
                    original_input=text
                )
            else:
                # 直接使用原文本
                return InterpretResult(
                    text=text,
                    intent=intent,
                    was_generated=False,
                    original_input=text
                )

        except Exception as e:
            logger.error(f"Error during interpretation: {e}")
            # 出错时降级为直接转换
            return InterpretResult(
                text=text,
                intent="direct",
                was_generated=False,
                original_input=text
            )

    def interpret(
        self,
        text: str,
        task_id: Optional[str] = None
    ) -> InterpretResult:
        """
        同步解释文本意图

        Args:
            text: 用户输入的文本
            task_id: 任务 ID，用于追踪

        Returns:
            InterpretResult: 解释结果
        """
        # 简化版同步方法：直接进行关键词检测
        # 对于复杂场景，建议使用 interpret_async
        try:
            return self._interpret_sync(text, task_id)
        except Exception as e:
            logger.error(f"Sync interpretation failed: {e}")
            return InterpretResult(
                text=text,
                intent="direct",
                was_generated=False,
                original_input=text
            )

    def _interpret_sync(
        self,
        text: str,
        task_id: Optional[str] = None
    ) -> InterpretResult:
        """
        同步版本的文本解释（使用关键词检测 + 同步 LLM 调用）

        Args:
            text: 用户输入的文本
            task_id: 任务 ID

        Returns:
            InterpretResult: 解释结果
        """
        if not text or not text.strip():
            return InterpretResult(
                text="",
                intent="direct",
                was_generated=False,
                original_input=text
            )

        # 如果 LLM 不可用，使用基于关键词的简单判断
        if not self.llm:
            return self._keyword_based_interpretation(text)

        # 首先使用快速关键词检测
        quick_result = self._keyword_based_interpretation(text)

        # 如果是 direct 意图，直接返回（无需 LLM 调用）
        if quick_result.intent == "direct" and not quick_result.was_generated:
            return quick_result

        # 如果检测到 generate 意图，使用 LLM 生成内容
        try:
            # 使用同步 LLM 调用
            prompt = f"""请根据以下要求生成适合语音播报的内容：

原始要求: {text}
主题: {quick_result.intent}

请生成自然、流畅的口语化内容。"""

            response = self.llm.generate(
                prompt=prompt,
                system_prompt=self.GENERATE_SYSTEM_PROMPT,
                max_tokens=800,
                temperature=0.7,
                purpose="content_generation"
            )

            generated_text = response.content.strip()

            # 清理可能的引号
            if generated_text.startswith('"') and generated_text.endswith('"'):
                generated_text = generated_text[1:-1]
            if generated_text.startswith("'") and generated_text.endswith("'"):
                generated_text = generated_text[1:-1]

            return InterpretResult(
                text=generated_text,
                intent="generate",
                was_generated=True,
                original_input=text
            )

        except Exception as e:
            logger.error(f"LLM content generation failed: {e}")
            # 降级到关键词检测结果
            return quick_result

    def _keyword_based_interpretation(self, text: str) -> InterpretResult:
        """
        基于关键词的快速意图检测（无需 LLM）

        Args:
            text: 用户输入的文本

        Returns:
            InterpretResult: 解释结果
        """
        text_lower = text.lower()

        # 生成指令关键词
        generate_keywords = [
            "generate", "create", "explain", "narration", "explaining",
            "解释", "生成", "创作", "介绍", "讲解", "描述", "describe",
            "tell me", "what is", "how does", "story about"
        ]

        # 检查是否包含生成指令
        has_generate_keyword = any(kw in text_lower for kw in generate_keywords)

        # 检查是否是纯文本（包含完整句子）
        # 如果文本较长且包含句子结构，倾向于 direct
        if len(text) > 50 and not has_generate_keyword:
            return InterpretResult(
                text=text,
                intent="direct",
                was_generated=False,
                original_input=text
            )

        # 如果有生成关键词，判断为 generate
        if has_generate_keyword:
            return InterpretResult(
                text=text,  # 需要进一步处理
                intent="generate",
                was_generated=False,
                original_input=text
            )

        # 默认为 direct
        return InterpretResult(
            text=text,
            intent="direct",
            was_generated=False,
            original_input=text
        )

    async def _detect_intent(self, text: str) -> Dict[str, Any]:
        """
        检测用户意图

        Args:
            text: 用户输入的文本

        Returns:
            Dict: 包含 intent, reasoning, topic 的字典
        """
        prompt = f"""请判断以下用户输入的意图：

用户输入: "{text}"

请输出 JSON 格式的判断结果。"""

        try:
            response = await self.llm.generate_async(
                prompt=prompt,
                system_prompt=self.INTENT_SYSTEM_PROMPT,
                max_tokens=500,
                temperature=0.3,
                purpose="intent_detection"
            )

            # 解析 JSON 响应
            import json
            result = self._extract_json(response.content)

            # 验证 intent 值
            if result.get("intent") not in ["direct", "generate"]:
                result["intent"] = "direct"

            return result

        except Exception as e:
            logger.error(f"Intent detection failed: {e}")
            return {"intent": "direct", "reasoning": "Detection failed", "topic": None}

    async def _generate_content(self, original_input: str, topic: str) -> str:
        """
        根据主题生成内容

        Args:
            original_input: 用户原始输入
            topic: 提取的主题

        Returns:
            str: 生成的内容文本
        """
        # 构建生成提示词
        prompt = f"""请根据以下要求生成适合语音播报的内容：

原始要求: {original_input}
主题: {topic}

请生成自然、流畅的口语化内容。"""

        try:
            response = await self.llm.generate_async(
                prompt=prompt,
                system_prompt=self.GENERATE_SYSTEM_PROMPT,
                max_tokens=800,
                temperature=0.7,
                purpose="content_generation"
            )

            generated_text = response.content.strip()

            # 清理可能的引号
            if generated_text.startswith('"') and generated_text.endswith('"'):
                generated_text = generated_text[1:-1]
            if generated_text.startswith("'") and generated_text.endswith("'"):
                generated_text = generated_text[1:-1]

            return generated_text

        except Exception as e:
            logger.error(f"Content generation failed: {e}")
            # 降级：返回原输入
            return original_input

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """
        从响应中提取 JSON

        Args:
            text: 可能包含 JSON 的文本

        Returns:
            Dict: 解析后的 JSON
        """
        import json

        # 尝试直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 尝试从 markdown 代码块中提取
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end != -1:
                try:
                    return json.loads(text[start:end].strip())
                except json.JSONDecodeError:
                    pass

        if "```" in text:
            start = text.find("```") + 3
            end = text.find("\n", start)
            if end != -1:
                start = end + 1
                end = text.find("```", start)
                if end != -1:
                    try:
                        return json.loads(text[start:end].strip())
                    except json.JSONDecodeError:
                        pass

        # 默认返回
        return {"intent": "direct", "reasoning": "Parse failed", "topic": None}


# 便捷函数
async def interpret_text_async(
    text: str,
    skill_name: str = "lite-tts",
    task_id: Optional[str] = None
) -> InterpretResult:
    """
    异步解释文本的便捷函数

    Args:
        text: 要解释的文本
        skill_name: Skill 名称
        task_id: 任务 ID

    Returns:
        InterpretResult: 解释结果
    """
    interpreter = TextInterpreter(skill_name=skill_name)
    return await interpreter.interpret_async(text, task_id)


def interpret_text(
    text: str,
    skill_name: str = "lite-tts",
    task_id: Optional[str] = None
) -> InterpretResult:
    """
    同步解释文本的便捷函数

    Args:
        text: 要解释的文本
        skill_name: Skill 名称
        task_id: 任务 ID

    Returns:
        InterpretResult: 解释结果
    """
    interpreter = TextInterpreter(skill_name=skill_name)
    return interpreter.interpret(text, task_id)


# 测试代码
if __name__ == "__main__":
    import json
    from pathlib import Path

    print("=" * 60)
    print("Text Interpreter - 测试")
    print("=" * 60)

    # 测试用例
    test_cases = [
        ("你好，欢迎使用语音合成系统", "direct"),
        ("Generate audio narration explaining Fourier Transform concepts", "generate"),
        ("解释量子力学的基本原理", "generate"),
        ("Hello, this is a test of the TTS system", "direct"),
        ("Create a short story about a brave knight", "generate"),
        ("今天天气真不错", "direct"),
    ]

    interpreter = TextInterpreter()

    for test_input, expected_intent in test_cases:
        print(f"\n测试输入: {test_input}")
        print(f"期望意图: {expected_intent}")
        print("-" * 40)

        result = interpreter.interpret(test_input)

        print(f"检测意图: {result.intent}")
        print(f"是否生成: {result.was_generated}")

        # 对于 generate 意图，显示生成的文本（如果有的话）
        if result.was_generated:
            print(f"生成内容: {result.text[:150]}{'...' if len(result.text) > 150 else ''}")
        else:
            print(f"处理结果: {result.text[:100]}{'...' if len(result.text) > 100 else ''}")

        # 验证结果（关键词检测模式下，generate 检测是重点）
        if result.intent == expected_intent:
            print("✅ 测试通过")
        else:
            print(f"❌ 测试失败: 期望 {expected_intent}, 得到 {result.intent}")

    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
