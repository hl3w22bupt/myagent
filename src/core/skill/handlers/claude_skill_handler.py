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
import time
import httpx
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

# OutputBuilder 支持
# OutputBuilder 在 src/core/skill/output_builder.py（当前目录的父目录）
try:
    from ..output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    # 备选：尝试绝对导入
    try:
        from src.core.skill.output_builder import OutputBuilder
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
        timeout: int = 30000,
        # Trace API 配置
        trace_api_url: Optional[str] = None
    ):
        """
        初始化 Handler

        Args:
            skill_name: Skill 名称
            skill_root: SKILL.md 所在目录（Claude Code Skills）
            prompt_template: Prompt 模板字符串（Native Pure-Prompt）
            mode: 模式 ('file' 或 'template')
            timeout: 超时时间（毫秒）
            trace_api_url: Trace API URL (e.g., 'http://localhost:3000/api/traces/submit')
        """
        self.skill_name = skill_name
        self.skill_root = Path(skill_root) if skill_root else None
        self.prompt_template = prompt_template
        self.mode = mode
        self.timeout = timeout / 1000  # 转换为秒
        self.trace_api_url = trace_api_url or os.getenv('MOTIA_TRACE_API_URL', 'http://localhost:3000/api/traces/submit')
        self._http_client: Optional[httpx.AsyncClient] = None

        # 初始化 LLM Client
        self._llm_client = self._create_llm_client()

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行 Skill（统一入口）

        Args:
            input_data: {
                'task': '用户任务描述',
                'context': {...},  # 可选
                'purpose': 'LLM 调用目的描述',  # 可选
                ...其他变量
            }

        Returns:
            OutputBuilder 格式的输出
        """
        try:
            # 1. 构建 prompt（根据模式选择来源）
            prompt = self._build_prompt(input_data)

            # 2. 提取 purpose（如果没有提供，使用 skill_name 作为默认值）
            purpose = input_data.get('purpose') or input_data.get('llm_purpose') or f"execute skill prompt"

            # 3. 调用 LLM（支持 tool use）
            llm_response = self._call_llm_with_tools(prompt, purpose)

            # 4. 转换为 OutputBuilder 格式
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
                # Fallback - 返回符合 OutputBuilder 格式的错误
                return {
                    'result_type': 'error',
                    'success': False,
                    'content': {
                        'type': 'unknown',
                        'message': str(e)
                    },
                    'metadata': {
                        'execution_time': 0,
                        'skills_used': [],
                        'fallback': True
                    }
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

    def _call_llm(self, prompt: str, purpose: Optional[str] = None) -> str:
        """
        调用 LLM（统一入口）

        Args:
            prompt: 完整的 prompt
            purpose: LLM 调用的目的描述（可选）

        Returns:
            LLM 响应文本
        """
        start_time = time.time()

        try:
            # 优先使用 LLMClient（如果有）
            if self._llm_client:
                response = self._call_llm_with_client(prompt, purpose)
                # 发送 trace with system prompt (Issue #17)
                system_prompt = f"You are {self.skill_name}, a specialized skill handler. Your role is to execute tasks according to this skill's capabilities."
                self._send_llm_trace(prompt, response, time.time() - start_time, client_type='llm_client', purpose=purpose, system_prompt=system_prompt)
                return response

            # Fallback: 直接使用 Anthropic API
            response = self._call_anthropic_api(prompt)
            # 发送 trace with system prompt (Issue #17)
            system_prompt = f"You are {self.skill_name}, a specialized AI assistant designed to execute tasks according to this skill's capabilities."
            self._send_llm_trace(prompt, response, time.time() - start_time, client_type='anthropic_api', purpose=purpose, system_prompt=system_prompt)
            return response

        except Exception as e:
            raise Exception(f"LLM call failed: {str(e)}")

    async def _send_trace(self, trace_data: Dict[str, Any]):
        """
        Send trace data to Motia executionTraces stream via API.

        Args:
            trace_data: Trace data matching executionTraceSchema
        """
        if not self.trace_api_url:
            return

        # Create HTTP client if needed
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            response = await self._http_client.post(
                self.trace_api_url,
                json=trace_data
            )
            response.raise_for_status()
            print(f"[ClaudeSkillHandler] ✓ LLM trace sent: {trace_data.get('id')} - {trace_data.get('status')}")
        except Exception as e:
            print(f"[ClaudeSkillHandler] ✗ Failed to send LLM trace: {e}")

    def _send_llm_trace(
        self,
        prompt: str,
        response: str,
        execution_time: float,
        client_type: str = 'unknown',
        llm_model: Optional[str] = None,
        usage: Optional[Dict[str, int]] = None,
        purpose: Optional[str] = None,
        system_prompt: Optional[str] = None
    ):
        """
        Send LLM call trace to executionTraces stream.

        Args:
            prompt: The prompt sent to LLM
            response: The response from LLM
            execution_time: Execution time in seconds
            client_type: Type of LLM client ('llm_client' or 'anthropic_api')
            llm_model: Model name (optional)
            usage: Token usage info (optional)
            purpose: Purpose description for this LLM call (e.g., "code generation", "analysis")
            system_prompt: System prompt used (optional, for Issue #17 unified prompt structure)
        """
        import asyncio

        # Get trace context from environment or input
        task_id = os.getenv('MOTIA_TASK_ID', 'unknown')
        session_id = os.getenv('MOTIA_SESSION_ID', 'unknown')

        id = f"llm-skill-{self.skill_name}-{task_id}-{int(time.time() * 1000)}"
        timestamp_ms = int(time.time() * 1000)

        # Build messages array for unified trace format (Issue #17)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        trace_data = {
            "id": id,
            "level": "skill-internal",
            "taskId": task_id,
            "agentId": session_id,
            "skillName": self.skill_name,
            "stage": f"llm_call - {purpose}" if purpose else "llm_call",
            "status": "completed",
            "durationMs": int(execution_time * 1000),  # Convert to ms
            "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
            "metadata": {
                "sessionId": session_id,
                "purpose": purpose or self.skill_name,
                "llmProvider": "anthropic" if client_type == "anthropic_api" else "unknown",
                "llmModel": llm_model or os.getenv('DEFAULT_LLM_MODEL', 'unknown'),
                "llmRequest": {
                    "messages": messages,
                },
                "llmResponse": {
                    "content": response,
                },
            }
        }

        # Add usage info if available
        if usage:
            trace_data["metadata"]["llmResponse"]["promptTokens"] = usage.get('prompt_tokens', 0)
            trace_data["metadata"]["llmResponse"]["completionTokens"] = usage.get('completion_tokens', 0)
            trace_data["metadata"]["llmResponse"]["totalTokens"] = usage.get('total_tokens', 0)

        # Send trace - try sync first for reliability, fall back to async
        print(f"[ClaudeSkillHandler] _send_llm_trace called: skill={self.skill_name}, trace_api_url={self.trace_api_url}")
        try:
            # Try synchronous send first (more reliable in sandbox)
            self._send_trace_sync(trace_data)
        except Exception as e:
            # Fallback to async if sync fails
            print(f"[ClaudeSkillHandler] Sync trace failed, trying async: {e}")
            try:
                import asyncio
                asyncio.run(self._send_trace(trace_data))
            except Exception as e2:
                print(f"[ClaudeSkillHandler] Failed to send trace: {e2}")

    def _send_trace_sync(self, trace_data: Dict[str, Any]):
        """Send trace data synchronously using httpx."""
        if not self.trace_api_url:
            return

        try:
            import httpx
            with httpx.Client(timeout=2) as client:
                response = client.post(self.trace_api_url, json=trace_data)
                response.raise_for_status()
                print(f"[ClaudeSkillHandler] ✓ LLM trace sent: {trace_data.get('id')} - {trace_data.get('status')}")
        except Exception as e:
            print(f"[ClaudeSkillHandler] ✗ Failed to send LLM trace (sync): {e}")
            raise

    def _send_tool_skill_trace(
        self,
        tool_name: str,
        tool_input: dict,
        result: dict,
        execution_time: float
    ):
        """
        Send tool skill execution trace to executionTraces stream.

        注意：此方法只用于 LLM tool call 场景（_execute_tool_call 中调用）。
        显式直接调用 tool-* skill 会通过 executor.execute() 走 hook 链路，
        由 SkillTraceHook 记录 level="skill" 的 trace。

        Args:
            tool_name: Name of the tool skill (e.g., "tool-write", "tool-read")
            tool_input: Input parameters passed to the tool
            result: Result returned by the tool
            execution_time: Execution time in seconds
        """
        if not self.trace_api_url:
            return

        task_id = os.getenv('MOTIA_TASK_ID', 'unknown')
        session_id = os.getenv('MOTIA_SESSION_ID', 'unknown')

        # 此方法仅用于 LLM tool call 场景，使用 "tool-call" level
        trace_level = "tool-call"
        trace_id = f"tool-call-{tool_name}-{task_id}-{int(time.time() * 1000)}"
        timestamp_ms = int(time.time() * 1000)

        # 构建简短的 result preview (避免 trace 过大)
        result_preview = result.get('content', '')
        if isinstance(result_preview, str):
            result_preview = result_preview[:500]  # 限制长度
        elif isinstance(result_preview, dict):
            result_preview = str(result_preview)[:500]

        trace_data = {
            "id": trace_id,
            "level": trace_level,
            "taskId": task_id,
            "agentId": session_id,
            "skillName": tool_name,
            "stage": "processing",  # LLM tool call 没有 pre/post，使用 processing
            "status": "completed" if result.get('success') else "failed",
            "durationMs": int(execution_time * 1000),  # Convert to ms
            "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
            "metadata": {
                "sessionId": session_id,
                "parentSkill": self.skill_name,  # 调用此 tool 的父 skill
                "callType": "llm_tool_call",  # 标识为 LLM tool call
                "toolInput": tool_input,
                "toolResult": {
                    "success": result.get('success', False),
                    "resultType": result.get('result_type', 'unknown'),
                    "preview": result_preview,
                },
                "outputFiles": result.get('output_files', []),
            }
        }

        # 如果有错误，添加错误信息
        if not result.get('success'):
            trace_data["metadata"]["error"] = result.get('content', 'Unknown error')

        # Send trace synchronously
        try:
            import httpx
            with httpx.Client(timeout=2) as client:
                response = client.post(self.trace_api_url, json=trace_data)
                response.raise_for_status()
                print(f"[ClaudeSkillHandler] ✓ Tool skill trace sent: {tool_name} - level={trace_level} - {trace_data.get('status')}")
        except Exception as e:
            print(f"[ClaudeSkillHandler] ✗ Failed to send tool skill trace: {e}")

    def _call_llm_with_client(self, prompt: str, purpose: Optional[str] = None) -> str:
        """使用 LLMClient 调用"""
        try:
            # 检查是否有 messagesCreate 方法（Anthropic 客户端）
            if hasattr(self._llm_client, 'messagesCreate'):
                # Anthropic 客户端 - 同步调用
                # Build system prompt for skill execution
                system_prompt = f"You are {self.skill_name}, a specialized skill handler. Your role is to execute tasks according to this skill's capabilities."

                # 传递 purpose 参数（如果支持）
                import inspect
                sig = inspect.signature(self._llm_client.messagesCreate)
                if 'purpose' in sig.parameters:
                    message = self._llm_client.messagesCreate([
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ], purpose=purpose or self.skill_name)
                else:
                    # 不支持 purpose 参数，使用旧调用方式
                    message = self._llm_client.messagesCreate([
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ])
                # 返回文本内容（兼容现有代码）
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

        # Build system prompt for skill execution
        system_prompt = f"You are {self.skill_name}, a specialized AI assistant designed to execute tasks according to this skill's capabilities."

        # Use messages array with system role for unified structure (Issue #17)
        message = client.messages.create(
            model=model,
            max_tokens=16384,
            temperature=0.7,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
        )

        return message.content[0].text

    def _convert_to_output_builder(self, llm_response: str) -> Dict[str, Any]:
        """
        将 LLM 响应转换为 OutputBuilder 格式（统一）

        智能检测：
        - 代码块 → set_code()
        - JSON → set_json()
        - Markdown/HTML → set_markdown() 或 set_text()

        注意：Tool Use 产生的文件由 _format_files_output 处理，不再需要 regex 解析
        """
        import re

        if not OUTPUT_BUILDER_AVAILABLE:
            # Fallback - 返回符合 OutputBuilder 格式的字典
            # 检测响应类型以设置适当的 result_type
            if self._is_markdown(llm_response):
                result_type = "markdown"
            elif self._is_json(llm_response):
                result_type = "json"
            elif self._extract_code_block(llm_response):
                result_type = "code"
            else:
                result_type = "text"

            return {
                'result_type': result_type,
                'success': True,
                'content': llm_response,
                'metadata': {
                    'execution_time': 0,
                    'skills_used': [],
                    'fallback': True  # 标记这是 fallback 格式
                }
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
        """
        检测是否是 Markdown

        更智能的检测，避免误判：
        - 不是简单检测开头是否为 #
        - 检查是否包含典型的 markdown 结构（多个标题、代码块等）
        - 排除看起来像是命令执行说明的文本
        """
        if not text:
            return False

        text_stripped = text.strip()

        # 快速检测：如果文本很短且只有一个 # 开头的行，可能是说明而非真正的 markdown
        lines = text_stripped.split('\n')

        # 如果文本只有 1-2 行且以 # 开头，可能是简单的说明文字
        if len(lines) <= 2 and text_stripped.startswith('#'):
            # 检查是否包含命令执行模式的关键词（ffmpeg、output、file 等）
            command_keywords = ['ffmpeg', 'output file', 'created', 'generated', 'render']
            if any(keyword in text_stripped.lower() for keyword in command_keywords):
                return False  # 这是命令执行说明，不是真正的 markdown

        # 检测 markdown 特征
        markdown_indicators = ['#', '```', '*', '-', '>']

        # 计算有多少行以 markdown 符号开头
        markdown_line_count = 0
        for line in lines[:10]:  # 只检查前 10 行
            line_stripped = line.strip()
            for indicator in markdown_indicators:
                if line_stripped.startswith(indicator):
                    markdown_line_count += 1
                    break

        # 如果至少有 2 行看起来像 markdown，才认为是 markdown
        return markdown_line_count >= 2 or (
            markdown_line_count >= 1 and len(lines) > 3
        )

    # ============ Tool Use Support =============

    def _discover_tool_skills(self) -> list:
        """
        动态发现所有 tool-* skills

        从 skill.yaml 直接读取 input_schema（已兼容 Anthropic 格式）
        """
        tools = []
        skills_dir = Path(__file__).parent.parent.parent.parent.parent / "skills"

        for skill_path in skills_dir.glob("tool-*"):
            yaml_path = skill_path / "skill.yaml"
            if not yaml_path.exists():
                continue

            try:
                import yaml
                config = yaml.safe_load(yaml_path.read_text())

                # 直接使用 skill.yaml 的 input_schema（已兼容 Anthropic 格式）
                tool_def = {
                    "name": config["name"],
                    "description": config.get("description", ""),
                    "input_schema": config.get("input_schema", {
                        "type": "object",
                        "properties": {},
                        "required": []
                    })
                }

                # 缓存调用信息
                tool_def["_skill_path"] = str(skill_path)
                tool_def["_handler"] = config.get("execution", {}).get("handler", "handler.py")
                tool_def["_function"] = config.get("execution", {}).get("function", "execute")

                tools.append(tool_def)

            except Exception as e:
                print(f"Warning: Failed to load tool skill {skill_path.name}: {e}")

        return tools

    def _execute_tool_call(self, tool_name: str, tool_input: dict, tool_def: dict) -> tuple:
        """
        执行工具调用 - 直接 import handler

        Args:
            tool_name: Tool name (e.g., "tool-read")
            tool_input: Input parameters from LLM
            tool_def: Tool definition with _skill_path, _handler, _function

        Returns:
            Tuple (result_text, output_files) where:
            - result_text: Result string to return to LLM
            - output_files: List of file paths written by the tool
        """
        import time
        start_time = time.time()

        print(f"[DEBUG TOOL EXEC] ===== {tool_name} =====")
        print(f"[DEBUG TOOL EXEC] input: {tool_input}")

        skill_path = tool_def.get("_skill_path")
        print(f"[DEBUG TOOL EXEC] skill_path from tool_def: {skill_path}")
        handler_file = tool_def.get("_handler", "handler.py")
        function_name = tool_def.get("_function", "execute")

        print(f"[DEBUG TOOL EXEC] tool_name={tool_name}, skill_path={skill_path}, handler={handler_file}, function={function_name}")

        if not skill_path:
            return (f"Error: Tool {tool_name} has no path", [])

        try:
            # 动态导入 handler
            import importlib.util
            handler_path = Path(skill_path) / handler_file
            spec = importlib.util.spec_from_file_location(
                f"{tool_name}.handler",
                handler_path
            )
            module = importlib.util.module_from_spec(spec)

            # 设置 sys.path 确保 OutputBuilder 可用
            src_path = Path(skill_path).parent.parent / "src"
            if src_path.exists() and str(src_path) not in sys.path:
                sys.path.insert(0, str(src_path))

            spec.loader.exec_module(module)

            # 调用 execute 函数
            execute_func = getattr(module, function_name)
            print(f"[DEBUG TOOL EXEC] Found function: {function_name} in module {module}")
            result = execute_func(tool_input)
            print(f"[DEBUG TOOL EXEC] Function returned result type: {type(result)}")

            # 提取 output_files (用于追踪写入的文件)
            output_files = result.get('output_files', [])
            # 也检查 metadata 中的 output_files
            if not output_files and 'metadata' in result:
                metadata = result.get('metadata', {})
                output_files = metadata.get('x-output_files', [])

            # 发送 tool skill 执行 trace
            execution_time = time.time() - start_time
            self._send_tool_skill_trace(
                tool_name=tool_name,
                tool_input=tool_input,
                result=result,
                execution_time=execution_time
            )

            # 调试日志：输出结果摘要
            print(f"[DEBUG TOOL EXEC] result_success: {result.get('success')}")
            result_content = result.get('content')
            if isinstance(result_content, str):
                print(f"[DEBUG TOOL EXEC] result_length: {len(result_content)}")
                print(f"[DEBUG TOOL EXEC] result_preview: {result_content[:300]}")
            elif isinstance(result_content, dict):
                print(f"[DEBUG TOOL EXEC] result_type: dict")
                print(f"[DEBUG TOOL EXEC] result_keys: {list(result_content.keys())}")
            print(f"[DEBUG TOOL EXEC] output_files: {output_files}")
            print(f"[DEBUG TOOL EXEC] execution_time: {execution_time:.3f}s")

            # 转换为字符串返回给 LLM
            if result.get('success'):
                content = result.get('content')
                if isinstance(content, str):
                    return (content, output_files)
                elif isinstance(content, dict):
                    # 提取主要内容
                    if 'text' in content:
                        return (content['text'], output_files)
                    elif 'code' in content:
                        return (content['code'], output_files)
                    else:
                        import json
                        return (json.dumps(content, ensure_ascii=False), output_files)
                else:
                    return (str(content), output_files)
            else:
                error = result.get('content', {})
                if isinstance(error, dict):
                    return (f"Error: {error.get('message', 'Unknown error')}", output_files)
                return (f"Error: {error}", output_files)

        except Exception as e:
            execution_time = time.time() - start_time
            # 发送错误 trace
            self._send_tool_skill_trace(
                tool_name=tool_name,
                tool_input=tool_input,
                result={'success': False, 'error': str(e)},
                execution_time=execution_time
            )
            print(f"[DEBUG TOOL EXEC] ERROR: {e}")
            return (f"Error executing {tool_name}: {str(e)}", [])

    def _format_files_output(self, file_paths: list) -> str:
        """
        Format file contents for output.

        Reads each file and formats its content in a code block.

        Args:
            file_paths: List of file paths to read and format

        Returns:
            Formatted string with file contents in code blocks
        """
        from pathlib import Path

        if not file_paths:
            return ""

        outputs = []
        for file_path in file_paths:
            try:
                path = Path(file_path)
                if not path.exists():
                    outputs.append(f"# File not found: {file_path}")
                    continue

                content = path.read_text(encoding='utf-8')
                ext = path.suffix.lstrip('.')
                # 确定语言用于代码高亮
                language_map = {
                    'html': 'html',
                    'htm': 'html',
                    'css': 'css',
                    'js': 'javascript',
                    'jsx': 'jsx',
                    'ts': 'typescript',
                    'tsx': 'tsx',
                    'vue': 'vue',
                    'py': 'python',
                    'rb': 'ruby',
                    'go': 'go',
                    'rs': 'rust',
                    'java': 'java',
                    'cpp': 'cpp',
                    'c': 'c',
                    'cs': 'csharp',
                    'php': 'php',
                    'swift': 'swift',
                    'kt': 'kotlin',
                    'scala': 'scala',
                    'sh': 'bash',
                    'bash': 'bash',
                    'zsh': 'bash',
                    'fish': 'fish',
                    'json': 'json',
                    'yaml': 'yaml',
                    'yml': 'yaml',
                    'xml': 'xml',
                    'sql': 'sql',
                    'md': 'markdown',
                    'markdown': 'markdown',
                    'txt': 'text',
                }
                language = language_map.get(ext.lower(), 'text')

                # 格式化为代码块
                outputs.append(f"```{language}\n{content}\n```")
            except Exception as e:
                outputs.append(f"# Error reading file {file_path}: {str(e)}")

        return "\n\n".join(outputs)

    def _call_llm_with_tools(
        self,
        prompt: str,
        purpose: Optional[str] = None
    ) -> str:
        """
        调用 LLM，支持 tool use 的多轮对话

        只处理对 tool-* skills 的调用

        Returns:
            LLM response text, or file contents if tools wrote files
        """
        start_time = time.time()
        system_prompt = f"You are {self.skill_name}, a specialized skill handler. Your role is to execute tasks according to this skill's capabilities."

        if not self._llm_client:
            # Fallback 到简单调用
            response = self._call_anthropic_api(prompt)
            # Send trace (Issue #17)
            self._send_llm_trace(prompt, response, time.time() - start_time, client_type='anthropic_api', purpose=purpose, system_prompt=system_prompt)
            return response

        # 获取可用的 tool skills
        tools = self._discover_tool_skills()

        if not tools:
            response = self._call_anthropic_api(prompt)
            # Send trace (Issue #17)
            self._send_llm_trace(prompt, response, time.time() - start_time, client_type='anthropic_api', purpose=purpose, system_prompt=system_prompt)
            return response

        # 创建 tool name 到 tool def 的映射
        tools_map = {t["name"]: t for t in tools}

        max_iterations = 10
        messages = [{"role": "user", "content": prompt}]

        # 收集所有输出文件
        all_output_files = []

        for iteration in range(max_iterations):
            print(f"[DEBUG TOOL USE] ===== Iteration {iteration} =====")

            # 第一次调用使用 generate_with_tools，后续使用 continue_tool_use
            if iteration == 0:
                response = self._llm_client.generate_with_tools(
                    prompt=prompt,
                    tools=tools,
                    max_tokens=16384,
                    system_prompt=system_prompt,  # 传递 system_prompt
                    purpose=purpose
                )
                print(f"[DEBUG TOOL USE] First call:")
                print(f"  stop_reason: {response.stop_reason}")
                print(f"  text: {response.text[:100] if response.text else '(empty)'}")
                print(f"  tool_calls: {[tc.get('name') for tc in response.tool_calls]}")
                for tc in response.tool_calls:
                    print(f"    - {tc.get('name')}: {tc.get('input')}")
            else:
                print(f"[DEBUG TOOL USE] Before continue_tool_use: {len(messages)} messages")
                # 打印 messages 摘要
                for i, msg in enumerate(messages):
                    role = msg.get('role')
                    content = msg.get('content', [])
                    if isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict):
                                if block.get('type') == 'tool_result':
                                    result_preview = str(block.get('content', ''))[:200]
                                    print(f"[DEBUG TOOL USE]   msg[{i}] {role}: tool_result (len={len(result_preview)})")
                                    if len(result_preview) < 200:
                                        print(f"[DEBUG TOOL USE]     content: {result_preview}")
                                elif block.get('type') == 'tool_use':
                                    print(f"[DEBUG TOOL USE]   msg[{i}] {role}: tool_use - {block.get('name')}")
                                elif block.get('type') == 'text':
                                    text_preview = str(block.get('text', ''))[:100]
                                    print(f"[DEBUG TOOL USE]   msg[{i}] {role}: text (len={len(block.get('text', ''))})")
                                    print(f"[DEBUG TOOL USE]     content: {text_preview}...")
                            else:
                                print(f"[DEBUG TOOL USE]   msg[{i}] {role}: {type(block).__name__}")
                    else:
                        content_preview = str(content)[:100]
                        print(f"[DEBUG TOOL USE]   msg[{i}] {role}: {content_preview}...")

                response = self._llm_client.continue_tool_use(
                    messages=messages,
                    tools=tools,
                    max_tokens=16384,
                    system_prompt=system_prompt  # 传递 system_prompt
                )
                print(f"[DEBUG TOOL USE] Continuation call:")
                print(f"  stop_reason: {response.stop_reason}")
                print(f"  text: {response.text[:100] if response.text else '(empty)'}")
                print(f"  tool_calls: {[tc.get('name') for tc in response.tool_calls]}")
                for tc in response.tool_calls:
                    print(f"    - {tc.get('name')}: {tc.get('input')}")

            # 如果没有工具调用，直接返回
            if response.stop_reason != "tool_use" or not response.tool_calls:
                # 注意：不需要发送 trace，因为 LLMClient.continue_tool_use 已经发送了
                # 如果有输出文件，返回文件内容而不是 LLM 响应
                if all_output_files:
                    return self._format_files_output(all_output_files)
                return response.text

            # 有工具调用，保存 assistant 响应
            assistant_content = [{"type": "text", "text": response.text}]
            for tc in response.tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["input"]
                })
            messages.append({"role": "assistant", "content": assistant_content})

            # 执行所有工具调用
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_input = tool_call["input"]

                # 只处理 tool-* skills
                if not tool_name.startswith("tool-"):
                    result_text = f"Error: Only tool-* skills can be called, got {tool_name}"
                    output_files = []
                else:
                    tool_def = tools_map.get(tool_name)
                    if not tool_def:
                        result_text = f"Error: Unknown tool {tool_name}"
                        output_files = []
                    else:
                        result_text, output_files = self._execute_tool_call(
                            tool_name,
                            tool_input,
                            tool_def
                        )
                        # 收集输出文件
                        all_output_files.extend(output_files)

                # 添加工具结果到消息
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_call["id"],
                        "content": result_text
                    }]
                })

            # 优化：如果有输出文件，直接返回文件内容，不再调用 LLM
            # 因为文件已经是最终产物，不需要 LLM 再总结
            if all_output_files:
                return self._format_files_output(all_output_files)

            # 没有输出文件，继续循环让 LLM 完成对话

        # 超过最大迭代次数
        if all_output_files:
            return self._format_files_output(all_output_files)
        return "Error: Maximum tool use iterations exceeded"

    # ============ End Tool Use Support =============

    def _create_llm_client(self) -> Any:
        """创建 LLM Client（可选）"""
        try:
            from ..llm_client import LLMClient
            return LLMClient(
                trace_api_url=self.trace_api_url,
                skill_name=self.skill_name,
                task_id=os.getenv('MOTIA_TASK_ID', 'unknown')
            )
        except ImportError:
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
