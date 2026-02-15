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
                # 发送 trace
                self._send_llm_trace(prompt, response, time.time() - start_time, client_type='llm_client', purpose=purpose)
                return response

            # Fallback: 直接使用 Anthropic API
            response = self._call_anthropic_api(prompt)
            # 发送 trace
            self._send_llm_trace(prompt, response, time.time() - start_time, client_type='anthropic_api', purpose=purpose)
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
        purpose: Optional[str] = None
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
        """
        import asyncio

        # Get trace context from environment or input
        task_id = os.getenv('MOTIA_TASK_ID', 'unknown')
        session_id = os.getenv('MOTIA_SESSION_ID', 'unknown')

        id = f"llm-skill-{self.skill_name}-{task_id}-{int(time.time() * 1000)}"
        timestamp_ms = int(time.time() * 1000)

        trace_data = {
            "id": id,
            "level": "skill-internal",
            "taskId": task_id,
            "agentId": session_id,
            "skillName": self.skill_name,
            "stage": f"llm_call - {purpose}",
            "status": "completed",
            "executionTime": int(execution_time * 1000),  # Convert to ms
            "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
            "metadata": {
                "sessionId": session_id,
                "llmProvider": "anthropic" if client_type == "anthropic_api" else "unknown",
                "llmModel": llm_model or os.getenv('DEFAULT_LLM_MODEL', 'unknown'),
                "llmRequest": {
                    "prompt": prompt,
                    "promptLength": len(prompt),
                },
                "llmResponse": {
                    "content": response,
                    "responseLength": len(response),
                },
                "data": {
                    "clientType": client_type,
                    "totalTokens": usage.get('total_tokens', 0) if usage else 0,
                }
            }
        }

        # Add usage info if available
        if usage:
            trace_data["metadata"]["llmResponse"]["promptTokens"] = usage.get('prompt_tokens', 0)
            trace_data["metadata"]["llmResponse"]["completionTokens"] = usage.get('completion_tokens', 0)
            trace_data["metadata"]["llmResponse"]["totalTokens"] = usage.get('total_tokens', 0)

        # Send trace asynchronously
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If there's already a running loop, create a task
                asyncio.ensure_future(self._send_trace(trace_data))
            else:
                # If no loop is running, run in a new loop
                loop.run_until_complete(self._send_trace(trace_data))
        except Exception as e:
            print(f"[ClaudeSkillHandler] Failed to send trace: {e}")

    def _call_llm_with_client(self, prompt: str, purpose: Optional[str] = None) -> str:
        """使用 LLMClient 调用"""
        try:
            # 检查是否有 messagesCreate 方法（Anthropic 客户端）
            if hasattr(self._llm_client, 'messagesCreate'):
                # Anthropic 客户端 - 同步调用
                # 传递 purpose 参数（如果支持）
                import inspect
                sig = inspect.signature(self._llm_client.messagesCreate)
                if 'purpose' in sig.parameters:
                    message = self._llm_client.messagesCreate([
                        {"role": "user", "content": prompt}
                    ], purpose=purpose or self.skill_name)
                else:
                    # 不支持 purpose 参数，使用旧调用方式
                    message = self._llm_client.messagesCreate([
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
        """检测是否是 Markdown"""
        markdown_indicators = ['#', '```', '*', '-', '>']
        return any(text.strip().startswith(indicator) for indicator in markdown_indicators)

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

    def _execute_tool_call(self, tool_name: str, tool_input: dict, tool_def: dict) -> str:
        """
        执行工具调用 - 直接 import handler

        Args:
            tool_name: Tool name (e.g., "tool-read")
            tool_input: Input parameters from LLM
            tool_def: Tool definition with _skill_path, _handler, _function

        Returns:
            Result string to return to LLM
        """
        skill_path = tool_def.get("_skill_path")
        handler_file = tool_def.get("_handler", "handler.py")
        function_name = tool_def.get("_function", "execute")

        if not skill_path:
            return f"Error: Tool {tool_name} has no path"

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
            result = execute_func(tool_input)

            # 转换为字符串返回给 LLM
            if result.get('success'):
                content = result.get('content')
                if isinstance(content, str):
                    return content
                elif isinstance(content, dict):
                    # 提取主要内容
                    if 'text' in content:
                        return content['text']
                    elif 'code' in content:
                        return content['code']
                    else:
                        import json
                        return json.dumps(content, ensure_ascii=False)
                else:
                    return str(content)
            else:
                error = result.get('content', {})
                if isinstance(error, dict):
                    return f"Error: {error.get('message', 'Unknown error')}"
                return f"Error: {error}"

        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"

    def _call_llm_with_tools(
        self,
        prompt: str,
        purpose: Optional[str] = None
    ) -> str:
        """
        调用 LLM，支持 tool use 的多轮对话

        只处理对 tool-* skills 的调用
        """
        if not self._llm_client:
            # Fallback 到简单调用
            return self._call_anthropic_api(prompt)

        # 获取可用的 tool skills
        tools = self._discover_tool_skills()

        if not tools:
            return self._call_anthropic_api(prompt)

        # 创建 tool name 到 tool def 的映射
        tools_map = {t["name"]: t for t in tools}

        max_iterations = 5
        messages = [{"role": "user", "content": prompt}]

        for iteration in range(max_iterations):
            # 调用 LLM（带 tools）
            response = self._llm_client.generate_with_tools(
                prompt=prompt,
                tools=tools,
                purpose=purpose
            )

            # 保存 assistant 响应（包含 tool_use blocks）
            assistant_content = [{"type": "text", "text": response.text}]
            for tc in response.tool_calls:
                assistant_content.append({
                    "type": "tool_use",
                    "id": tc["id"],
                    "name": tc["name"],
                    "input": tc["input"]
                })
            messages.append({"role": "assistant", "content": assistant_content})

            # 检查是否有工具调用
            if response.stop_reason == "tool_use" and response.tool_calls:
                # 执行所有工具调用
                for tool_call in response.tool_calls:
                    tool_name = tool_call["name"]
                    tool_input = tool_call["input"]

                    # 只处理 tool-* skills
                    if not tool_name.startswith("tool-"):
                        result_text = f"Error: Only tool-* skills can be called, got {tool_name}"
                    else:
                        tool_def = tools_map.get(tool_name)
                        if not tool_def:
                            result_text = f"Error: Unknown tool {tool_name}"
                        else:
                            result_text = self._execute_tool_call(
                                tool_name,
                                tool_input,
                                tool_def
                            )

                    # 添加工具结果到消息
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_call["id"],
                            "content": result_text
                        }]
                    })

                # 继续对话
                response = self._llm_client.continue_tool_use(
                    messages=messages,
                    tools=tools
                )

                # 如果还有更多工具调用，继续循环
                if response.stop_reason == "tool_use":
                    continue
                else:
                    return response.text
            else:
                return response.text

        return "Error: Maximum tool use iterations exceeded"

    # ============ End Tool Use Support =============

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
