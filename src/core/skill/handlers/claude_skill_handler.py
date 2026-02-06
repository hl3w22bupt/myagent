"""
Claude Skill Handler - 统一的 Prompt-based Skill 执行器

支持两种模式：
1. Claude Code Skills: prompt 来自 SKILL.md 文件
2. Native Pure-Prompt Skills: prompt 来自 prompt_template 字段
"""

import os
import re
import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional

# OutputBuilder 支持
lib_path = Path(__file__).parent.parent.parent.parent.parent / "skills" / "lib"
if lib_path.exists():
    sys.path.insert(0, str(lib_path))

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


class ClaudeSkillHandler:
    """
    统一的 Prompt-based Skill 执行器

    处理所有需要调用 LLM 的 skills：
    - Claude Code Skills (从 SKILL.md 读取 prompt)
    - Native Pure-Prompt Skills (从 prompt_template 读取)
    """

    MODE_FILE = 'file'        # Claude Code Skills: 从 SKILL.md
    MODE_TEMPLATE = 'template' # Native Pure-Prompt: 从 prompt_template

    def __init__(
        self,
        skill_name: str,
        # Claude Code Skills 参数
        skill_root: Optional[Path] = None,
        # Native Pure-Prompt Skills 参数
        prompt_template: Optional[str] = None,
        # 通用参数
        mode: str = MODE_FILE,
        timeout: int = 30000
    ):
        """
        初始化 Handler

        Args:
            skill_name: Skill 名称
            skill_root: SKILL.md 所在目录（Claude Code Skills）
            prompt_template: Prompt 模板字符串（Native Pure-Prompt）
            mode: 模式 ('file' 或 'template')
            timeout: 超时时间（毫秒）
        """
        self.skill_name = skill_name
        self.skill_root = Path(skill_root) if skill_root else None
        self.prompt_template = prompt_template
        self.mode = mode
        self.timeout = timeout / 1000  # 转换为秒

        # 初始化 LLM Client
        self._llm_client = self._create_llm_client()

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行 Skill（统一入口）

        Args:
            input_data: {
                'task': '用户任务描述',
                'context': {...},  # 可选
                ...其他变量
            }

        Returns:
            OutputBuilder 格式的输出
        """
        try:
            # 1. 构建 prompt（根据模式选择来源）
            prompt = self._build_prompt(input_data)

            # 2. 调用 LLM
            llm_response = self._call_llm(prompt)

            # 3. 转换为 OutputBuilder 格式
            return self._convert_to_output_builder(llm_response)

        except Exception as e:
            # 错误处理
            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder() \
                    .set_error(
                        error=e,
                        suggestions=[
                            f"Check if {self.skill_name} skill is properly configured",
                            "Verify LLM API keys are set (ANTHROPIC_API_KEY)",
                            "Check the prompt template format"
                        ]
                    ) \
                    .build()
            else:
                return {
                    'success': False,
                    'error': str(e)
                }

    def _build_prompt(self, input_data: Dict[str, Any]) -> str:
        """
        构建 Prompt（根据模式路由）
        """
        print(f"[DEBUG] _build_prompt called with mode={self.mode}, MODE_FILE={self.MODE_FILE}, MODE_TEMPLATE={self.MODE_TEMPLATE}")

        if self.mode == self.MODE_FILE:
            return self._build_from_file(input_data)
        elif self.mode == self.MODE_TEMPLATE:
            return self._build_from_template(input_data)
        else:
            raise ValueError(f"Unknown mode: {self.mode}")

    def _build_from_file(self, input_data: Dict[str, Any]) -> str:
        """
        Claude Code Skills: 从 SKILL.md 构建 Prompt

        SKILL.md 格式：
        ---
        name: frontend-design
        description: ...
        ---
        # Design Thinking
        ...

        User Request 部分会在运行时添加
        """
        if not self.skill_root:
            raise ValueError(f"skill_root is required for mode='file'")

        # 1. 读取 SKILL.md
        skill_md_path = self.skill_root / "SKILL.md"
        if not skill_md_path.exists():
            raise FileNotFoundError(f"SKILL.md not found: {skill_md_path}")

        skill_content = skill_md_path.read_text(encoding='utf-8')

        # 2. 解析 frontmatter 和 body
        frontmatter, body = self._parse_frontmatter(skill_content)

        # 3. 提取用户任务
        user_task = input_data.get('task', '')
        if not user_task:
            # 尝试从其他字段获取
            user_task = input_data.get('description', '')
            user_task = user_task or str(input_data.get('text', ''))

        # 4. 构建完整 prompt
        prompt = f"{body}\n"
        prompt += f"\n## User Request\n{user_task}"

        # 5. 添加 context（如果有）
        context = input_data.get('context')
        if context:
            prompt += f"\n## Context\n{json.dumps(context, indent=2, ensure_ascii=False)}"

        # 6. 添加其他变量（如果有）
        extra_vars = {k: v for k, v in input_data.items() if k not in ['task', 'context', 'description', 'skill_name']}
        if extra_vars:
            prompt += f"\n## Additional Input\n{json.dumps(extra_vars, indent=2, ensure_ascii=False)}"

        return prompt

    def _build_from_template(self, input_data: Dict[str, Any]) -> str:
        """
        Native Pure-Prompt Skills: 从模板构建 Prompt

        prompt_template 格式：
        "Analyze the following text: {text}\n\nMode: {mode}"
        """
        if not self.prompt_template:
            raise ValueError("prompt_template is required for mode='template'")

        # 渲染变量
        template = self.prompt_template

        # 支持多种占位符语法：{{key}}, {key}, ${key}
        for key, value in input_data.items():
            # {{key}} 语法
            template = template.replace(f"{{{{{key}}}}}", str(value))
            # {key} 语法
            template = template.replace(f"{{{key}}}", str(value))
            # ${key} 语法（可选）
            template = template.replace(f"${{{key}}}", str(value))

        return template

    def _parse_frontmatter(self, content: str) -> tuple[Dict[str, Any], str]:
        """
        解析 YAML frontmatter

        Returns:
            (frontmatter_dict, body_string)
        """
        # Frontmatter pattern: ---\nkey: value\n---\nbody
        pattern = re.compile(r'^---\s*\n(.*?)\n---\s*\n(.*)$', re.DOTALL)
        match = pattern.match(content)

        if match:
            frontmatter_text, body = match.groups()
            try:
                import yaml
                frontmatter = yaml.safe_load(frontmatter_text) or {}
            except Exception as e:
                print(f"Warning: Failed to parse frontmatter: {e}")
                frontmatter = {}
            return frontmatter, body.strip()

        # No frontmatter found
        return {}, content

    def _call_llm(self, prompt: str) -> str:
        """
        调用 LLM（统一入口）

        Args:
            prompt: 完整的 prompt

        Returns:
            LLM 响应文本
        """
        try:
            # 优先使用 LLMClient（如果有）
            if self._llm_client:
                return self._call_llm_with_client(prompt)

            # Fallback: 直接使用 Anthropic API
            return self._call_anthropic_api(prompt)

        except Exception as e:
            raise Exception(f"LLM call failed: {str(e)}")

    def _call_llm_with_client(self, prompt: str) -> str:
        """使用 LLMClient 调用"""
        try:
            # 检查是否有 messagesCreate 方法（Anthropic 客户端）
            if hasattr(self._llm_client, 'messagesCreate'):
                # Anthropic 客户端 - 同步调用
                message = self._llm_client.messagesCreate([
                    {"role": "user", "content": prompt}
                ])
                return message.content[0].text
            elif hasattr(self._llm_client, 'generate'):
                # LLMClient 有 generate 方法，但可能是协程
                # 降级到直接使用 Anthropic API
                print(f"[DEBUG] LLMClient.generate() found, falling back to Anthropic API")
                return self._call_anthropic_api(prompt)
            else:
                raise AttributeError("LLMClient has no compatible method")
        except Exception as e:
            raise Exception(f"LLMClient failed: {e}")

    def _call_anthropic_api(self, prompt: str) -> str:
        """使用 Anthropic API 直接调用"""
        import anthropic

        # 支持多种环境变量名
        api_key = os.getenv('ANTHROPIC_API_KEY') or os.getenv('ANTHROPIC_AUTH_TOKEN')
        if not api_key:
            raise ValueError('ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN not found in environment')

        client = anthropic.Anthropic(
            api_key=api_key,
            base_url=os.getenv('ANTHROPIC_BASE_URL')  # 支持代理服务器
        )

        # 使用正确的模型名称（支持多种命名方式）
        model = os.getenv('DEFAULT_LLM_MODEL', 'claude-3-5-sonnet-20241022')

        message = client.messages.create(
            model=model,
            max_tokens=8192,
            temperature=0.7,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text

    def _convert_to_output_builder(self, llm_response: str) -> Dict[str, Any]:
        """
        将 LLM 响应转换为 OutputBuilder 格式（统一）

        智能检测：
        - 代码块 → set_code()
        - JSON → set_json()
        - Markdown/HTML → set_markdown() 或 set_text()
        """
        if not OUTPUT_BUILDER_AVAILABLE:
            # Fallback
            return {
                'success': True,
                'output': llm_response
            }

        # 1. 尝试提取代码块
        code_block = self._extract_code_block(llm_response)
        if code_block:
            return OutputBuilder() \
                .set_code(
                    code=code_block['code'],
                    language=code_block['language'],
                    filename=f"{self.skill_name}_output.{code_block['language']}"
                ) \
                .set_title(f"Generated by {self.skill_name}") \
                .add_tag("claude-skill") \
                .add_tag(self.skill_name) \
                .build()

        # 2. 尝试解析 JSON
        if self._is_json(llm_response):
            try:
                data = json.loads(llm_response)
                return OutputBuilder() \
                    .set_json(data) \
                    .set_title(f"{self.skill_name} Results") \
                    .add_tag("claude-skill") \
                    .add_tag(self.skill_name) \
                    .build()
            except json.JSONDecodeError:
                pass  # 不是有效 JSON，继续

        # 3. 检测是否是 Markdown/HTML
        if self._is_markdown(llm_response):
            return OutputBuilder() \
                .set_markdown(llm_response) \
                .set_title(f"Output from {self.skill_name}") \
                .add_tag("claude-skill") \
                .add_tag(self.skill_name) \
                .build()

        # 4. 默认作为文本
        return OutputBuilder() \
            .set_text(llm_response) \
            .set_title(f"Output from {self.skill_name}") \
            .add_tag("claude-skill") \
            .add_tag(self.skill_name) \
            .build()

    def _extract_code_block(self, text: str) -> Optional[Dict[str, str]]:
        """
        提取代码块

        支持：```python\n...\n```, ```html\n...\n```, 等
        """
        match = re.search(r'```(\w*)\n(.*?)```', text, re.DOTALL)
        if match:
            language = match.group(1) or 'text'
            code = match.group(2).strip()
            return {'code': code, 'language': language}
        return None

    def _is_json(self, text: str) -> bool:
        """检测是否是 JSON"""
        text = text.strip()
        return text.startswith('{') or text.startswith('[')

    def _is_markdown(self, text: str) -> bool:
        """检测是否是 Markdown"""
        markdown_indicators = ['#', '```', '*', '-', '>']
        return any(text.strip().startswith(indicator) for indicator in markdown_indicators)

    def _create_llm_client(self) -> Any:
        """创建 LLM Client（可选）"""
        try:
            # 尝试从 remotion-generator 导入
            remotion_path = Path(__file__).parent.parent.parent.parent.parent / "skills" / "remotion-generator"
            if remotion_path.exists():
                sys.path.insert(0, str(remotion_path))
                from generators.llm_client import LLMClient
                return LLMClient()
        except ImportError:
            pass

        return None


# ============ Motia 执行入口（保持兼容）============

def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Motia Skill 执行入口（向后兼容）

    这个函数会被 executor.py 调用

    Expected input_data:
        {
            'skill_name': 'frontend-design',
            'task': '创建登录页面',
            'context': {...},
            ...
        }
    """
    skill_name = input_data.get('skill_name')
    if not skill_name:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ValueError('Missing skill_name'),
                    suggestions=['Please provide skill_name parameter']
                ) \
                .build()
        else:
            return {'success': False, 'error': 'Missing skill_name'}

    # 创建 handler（默认为 file 模式）
    handler = ClaudeSkillHandler(
        skill_name=skill_name,
        mode=ClaudeSkillHandler.MODE_FILE
    )

    return handler.execute(input_data)


# For testing
if __name__ == "__main__":
    import sys

    # Test execution
    if len(sys.argv) > 1:
        skill_name = sys.argv[1]
        test_input = {
            'skill_name': skill_name,
            'task': 'test task'
        }
    else:
        test_input = {
            'skill_name': 'frontend-design',
            'task': 'Create a simple login page'
        }

    result = execute(test_input)
    print(json.dumps(result, indent=2, ensure_ascii=False))
