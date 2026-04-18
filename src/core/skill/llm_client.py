"""
LLM Client for myagent Skills

Provides a unified interface for interacting with LLM APIs (Anthropic Claude)
for content analysis, code generation, and command generation tasks.

Supports both sync and async patterns.
"""

import os
import asyncio
import json
import time
from typing import Optional, Dict, Any, List, Union
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime

try:
    import httpx
except ImportError:
    httpx = None

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    from openai import OpenAI as OpenAISDK
except ImportError:
    OpenAISDK = None

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


# Load environment variables from project root
# Try multiple possible locations for .env file
project_root = Path(__file__).parent.parent.parent
env_paths = [
    project_root / '.env',
    Path.cwd() / '.env',
    Path(os.getcwd()) / '.env',
]

loaded = False
for env_path in env_paths:
    if env_path.exists():
        if load_dotenv:
            load_dotenv(env_path)
        loaded = True
        break

if not loaded and load_dotenv:
    # Fallback to default behavior (searches for .env in current directory)
    load_dotenv()


@dataclass
class LLMResponse:
    """Response from LLM API."""
    content: str
    model: str
    usage: Dict[str, int]  # {input_tokens, output_tokens}
    stop_reason: str


@dataclass
class LLMToolUseResponse:
    """Response from LLM with tool use support."""
    text: str
    tool_calls: List[Dict[str, Any]]
    stop_reason: str
    model: str
    usage: Dict[str, int]


class LLMClient:
    """
    LLM Client supporting both Anthropic and OpenAI-compatible APIs.

    Handles communication with LLM APIs for various tasks.
    Provider is determined by DEFAULT_LLM_PROVIDER env var.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: int = 180,
        # Trace API configuration
        trace_api_url: Optional[str] = None,
        task_id: Optional[str] = None,
        skill_name: str = "unknown-skill"
    ):
        """
        Initialize LLM client.

        Args:
            api_key: API key (defaults to LLM_API_KEY env var, falls back to ANTHROPIC_API_KEY)
            model: Model identifier (defaults to DEFAULT_LLM_MODEL env var or claude-sonnet-4-5)
            timeout: Request timeout in seconds
            trace_api_url: Trace API URL (defaults to MOTIA_TRACE_API_URL env var)
            task_id: Task ID for tracing (defaults to MOTIA_TASK_ID env var)
            skill_name: Skill name for tracing
        """
        self.provider = os.getenv("DEFAULT_LLM_PROVIDER", "anthropic")
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "LLM_API_KEY not found. Please set it in environment "
                "or pass api_key parameter."
            )

        # Use model from param, env var, or fallback to default
        self.model = model or os.getenv("DEFAULT_LLM_MODEL", "claude-sonnet-4-5")
        self.timeout = timeout

        # Trace configuration
        self.trace_api_url = trace_api_url or os.getenv('MOTIA_TRACE_API_URL', 'http://localhost:3000/api/traces/submit')
        self.task_id = task_id or os.getenv('MOTIA_TASK_ID', 'unknown')
        self.skill_name = skill_name

        # HTTP client for async trace sending
        self._http_client: Optional[httpx.AsyncClient] = None

        # Get base URL from environment if available
        base_url = os.getenv("LLM_BASE_URL")

        # Create client based on provider
        if self.provider == "openai-compatible":
            if OpenAISDK is None:
                raise ImportError(
                    "openai package is required for openai-compatible provider. "
                    "Install with: pip install openai"
                )
            client_kwargs = {"api_key": self.api_key}
            if base_url:
                client_kwargs["base_url"] = base_url
            self.client = OpenAISDK(**client_kwargs)
        else:
            if anthropic is None:
                raise ImportError(
                    "anthropic package is required. Install with: pip install anthropic"
                )
            client_kwargs = {"api_key": self.api_key}
            if base_url:
                client_kwargs["base_url"] = base_url
            self.client = anthropic.Anthropic(**client_kwargs)

    def messages_create(
        self,
        messages: List[Dict[str, str]],
        options: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Create a chat completion (sync).

        Args:
            messages: List of message dicts with 'role' and 'content'
            options: Additional options (max_tokens, temperature, etc.)

        Returns:
            Dict with 'content', 'model', 'usage' keys
        """
        if options is None:
            options = {}

        max_tokens = options.get('max_tokens', 2000)
        temperature = options.get('temperature', 0.7)

        try:
            if self.provider == "openai-compatible":
                response = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=messages,
                    extra_body={"thinking": {"type": "disabled"}}
                )
                content = response.choices[0].message.content or ""
                return {
                    'content': content,
                    'model': response.model,
                    'usage': {
                        'prompt_tokens': response.usage.prompt_tokens,
                        'completion_tokens': response.usage.completion_tokens,
                        'total_tokens': response.usage.prompt_tokens + response.usage.completion_tokens,
                    }
                }
            else:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=messages
                )
                content = response.content[0].text if response.content else ""
                return {
                    'content': content,
                    'model': response.model,
                    'usage': {
                        'prompt_tokens': response.usage.input_tokens,
                        'completion_tokens': response.usage.output_tokens,
                        'total_tokens': response.usage.input_tokens + response.usage.output_tokens,
                    }
                }
        except Exception as e:
            raise Exception(f"LLM API error: {str(e)}")

    def generate(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None,
        response_format: str = "text",
        purpose: Optional[str] = None,
        is_retry: bool = False,
        retry_attempt: int = 0
    ) -> LLMResponse:
        """
        Generate content using LLM (sync).

        Args:
            prompt: User prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0-1)
            system_prompt: Optional system prompt
            response_format: Response format ("text" or "json")
            purpose: Purpose description for this LLM call (optional)
            is_retry: Whether this is a retry attempt
            retry_attempt: Which retry attempt (0 = first attempt, 1 = first retry, etc.)

        Returns:
            LLMResponse with content and metadata
        """
        start_time = time.time()

        try:
            if self.provider == "openai-compatible":
                # Build messages for OpenAI format (system in messages)
                openai_messages = []
                if system_prompt:
                    openai_messages.append({"role": "system", "content": system_prompt})
                openai_messages.append({"role": "user", "content": prompt})

                response = self.client.chat.completions.create(
                    model=self.model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    messages=openai_messages,
                    extra_body={"thinking": {"type": "disabled"}}
                )
                content = response.choices[0].message.content or ""
                usage = {
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                }
                stop_reason = response.choices[0].finish_reason or "end_turn"
                if stop_reason == "tool_calls":
                    stop_reason = "tool_use"
                model_name = response.model
            else:
                # Anthropic format
                messages = [{"role": "user", "content": prompt}]
                api_params = {
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages,
                }
                if system_prompt:
                    api_params["system"] = system_prompt

                response = self.client.messages.create(**api_params)
                content = response.content[0].text if response.content else ""
                usage = {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                }
                stop_reason = response.stop_reason
                model_name = response.model

            llm_response = LLMResponse(
                content=content,
                model=model_name,
                usage=usage,
                stop_reason=stop_reason
            )

            # Send trace
            execution_time = time.time() - start_time
            self._send_llm_trace(
                prompt, llm_response, execution_time,
                max_tokens, temperature, purpose,
                is_retry, retry_attempt, system_prompt
            )

            return llm_response

        except Exception as e:
            raise Exception(f"Unexpected error during LLM call: {str(e)}")

    async def _send_trace(self, trace_data: Dict[str, Any]):
        """
        Send trace data to executionTraces stream via API.

        Args:
            trace_data: Trace data matching executionTraceSchema
        """
        if not self.trace_api_url:
            return

        try:
            # Create HTTP client if needed
            if not self._http_client:
                if httpx is None:
                    return
                self._http_client = httpx.AsyncClient(timeout=5.0)

            response = await self._http_client.post(
                self.trace_api_url,
                json=trace_data
            )
            response.raise_for_status()
            print(f"[LLMClient] ✓ LLM trace sent: {trace_data.get('id')} - {trace_data.get('status')}")
        except Exception as e:
            print(f"[LLMClient] ✗ Failed to send LLM trace: {e}")

    def _send_llm_trace(
        self,
        prompt: str,
        response: LLMResponse,
        execution_time: float,
        max_tokens: int,
        temperature: float,
        purpose: Optional[str] = None,
        is_retry: bool = False,
        retry_attempt: int = 0,
        system_prompt: Optional[str] = None
    ):
        """
        Send LLM call trace to executionTraces stream.

        Args:
            prompt: The prompt sent to LLM
            response: The LLMResponse from LLM
            execution_time: Execution time in seconds
            max_tokens: Max tokens requested
            temperature: Temperature used
            purpose: Purpose description for this LLM call (optional)
            is_retry: Whether this is a retry attempt
            retry_attempt: Which retry attempt (0 = first attempt)
            system_prompt: System prompt used (Issue #17 - for unified prompt structure)
        """
        # Get trace context from environment
        session_id = os.getenv('MOTIA_SESSION_ID', 'unknown')

        trace_id = f"llm-skill-{self.skill_name}-{self.task_id}-{int(time.time() * 1000)}"
        timestamp_ms = int(time.time() * 1000)

        # Build messages array for unified trace format (Issue #17)
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        trace_data = {
            "id": trace_id,
            "level": "skill-internal",
            "taskId": self.task_id,
            "agentId": session_id,
            "skillName": self.skill_name,
            "stage": f"llm_call - {purpose}" if purpose else "llm_call",
            "status": "completed",
            "durationMs": int(execution_time * 1000),  # Convert to ms
            "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
            "isRetry": is_retry,
            "retryAttempt": retry_attempt,
            "metadata": {
                "sessionId": session_id,
                "purpose": purpose or self.skill_name,
                "llmProvider": self.provider,
                "llmModel": response.model,
                "llmRequest": {
                    "messages": messages,
                },
                "llmResponse": {
                    "content": response.content[:2000] if response.content else "",  # Longer limit for code
                    "promptTokens": response.usage['input_tokens'],
                    "completionTokens": response.usage['output_tokens'],
                    "totalTokens": response.usage['input_tokens'] + response.usage['output_tokens'],
                }
            }
        }

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
            print(f"[LLMClient] Failed to send trace: {e}")

    def generate_with_retry(
        self,
        prompt: str,
        max_retries: int = 2,
        **kwargs
    ) -> LLMResponse:
        """
        Generate content with automatic retry on failure.

        Args:
            prompt: User prompt
            max_retries: Maximum number of retry attempts
            **kwargs: Additional arguments for generate()

        Returns:
            LLMResponse with content and metadata

        Raises:
            Exception: If all retries fail
        """
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                return self.generate(prompt, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    wait_time = 2 ** attempt
                    print(f"LLM call failed (attempt {attempt + 1}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"LLM call failed after {max_retries + 1} attempts")

        raise Exception(f"All LLM retry attempts failed: {str(last_error)}")

    async def generate_async(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None,
        response_format: str = "text",
        purpose: Optional[str] = None,
        is_retry: bool = False,
        retry_attempt: int = 0
    ) -> LLMResponse:
        """
        Generate content using LLM (async).

        Args:
            prompt: User prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0-1)
            system_prompt: Optional system prompt
            response_format: Response format ("text" or "json")
            purpose: Purpose description for this LLM call (optional)
            is_retry: Whether this is a retry attempt
            retry_attempt: Which retry attempt (0 = first attempt)

        Returns:
            LLMResponse with content and metadata

        Raises:
            asyncio.TimeoutError: If request times out
            Exception: For API errors
        """
        if httpx is None:
            raise ImportError("httpx package is required for async operations. Install with: pip install httpx")

        start_time = time.time()

        try:
            if self.provider == "openai-compatible":
                from openai import AsyncOpenAI
                base_url = os.getenv("LLM_BASE_URL")
                client_kwargs = {"api_key": self.api_key}
                if base_url:
                    client_kwargs["base_url"] = base_url
                async_client = AsyncOpenAI(**client_kwargs)

                openai_messages = []
                if system_prompt:
                    openai_messages.append({"role": "system", "content": system_prompt})
                openai_messages.append({"role": "user", "content": prompt})

                response = await asyncio.wait_for(
                    async_client.chat.completions.create(
                        model=self.model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        messages=openai_messages,
                        extra_body={"thinking": {"type": "disabled"}}
                    ),
                    timeout=self.timeout
                )
                content = response.choices[0].message.content or ""
                usage = {
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                }
                stop_reason = response.choices[0].finish_reason or "end_turn"
                if stop_reason == "tool_calls":
                    stop_reason = "tool_use"
                model_name = response.model
            else:
                base_url = os.getenv("LLM_BASE_URL")
                client_kwargs = {"api_key": self.api_key}
                if base_url:
                    client_kwargs["base_url"] = base_url
                async_client = anthropic.AsyncAnthropic(**client_kwargs)

                messages = [{"role": "user", "content": prompt}]
                api_params = {
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": messages,
                }
                if system_prompt:
                    api_params["system"] = system_prompt

                response = await asyncio.wait_for(
                    async_client.messages.create(**api_params),
                    timeout=self.timeout
                )
                content = response.content[0].text if response.content else ""
                usage = {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                }
                stop_reason = response.stop_reason
                model_name = response.model

            llm_response = LLMResponse(
                content=content,
                model=model_name,
                usage=usage,
                stop_reason=stop_reason
            )

            # Send trace
            execution_time = time.time() - start_time
            trace_data = {
                "id": f"llm-skill-{self.skill_name}-{self.task_id}-{int(time.time() * 1000)}",
                "level": "skill-internal",
                "taskId": self.task_id,
                "agentId": os.getenv('MOTIA_SESSION_ID', 'unknown'),
                "skillName": self.skill_name,
                "stage": f"llm_call - {purpose}" if purpose else "llm_call",
                "status": "completed",
                "durationMs": int(execution_time * 1000),
                "timestamp": datetime.fromtimestamp(int(time.time() * 1000) / 1000).isoformat(),
                "isRetry": is_retry,
                "retryAttempt": retry_attempt,
                "metadata": {
                    "sessionId": os.getenv('MOTIA_SESSION_ID', 'unknown'),
                    "llmProvider": self.provider,
                    "llmModel": model_name,
                    "llmRequest": {
                        "prompt": prompt[:1000],
                        "promptLength": len(prompt),
                        "maxTokens": max_tokens,
                        "temperature": temperature,
                    },
                    "llmResponse": {
                        "content": content[:1000] if content else "",
                        "responseLength": len(content) if content else 0,
                        "promptTokens": usage['input_tokens'],
                        "completionTokens": usage['output_tokens'],
                        "totalTokens": usage['input_tokens'] + usage['output_tokens'],
                    }
                }
            }
            await self._send_trace(trace_data)

            return llm_response

        except asyncio.TimeoutError:
            raise asyncio.TimeoutError(
                f"LLM request timed out after {self.timeout} seconds"
            )
        except Exception as e:
            error_details = {
                "error_type": type(e).__name__,
                "error_message": str(e),
                "model": self.model,
            }
            raise Exception(f"Unexpected error during LLM call: {str(e)}\nDetails: {json.dumps(error_details, ensure_ascii=False)}")

    async def generate_with_retry_async(
        self,
        prompt: str,
        max_retries: int = 2,
        **kwargs
    ) -> LLMResponse:
        """
        Generate content with automatic retry on failure (async).

        Args:
            prompt: User prompt
            max_retries: Maximum number of retry attempts
            **kwargs: Additional arguments for generate_async()

        Returns:
            LLMResponse with content and metadata

        Raises:
            Exception: If all retries fail
        """
        last_error = None

        for attempt in range(max_retries + 1):
            try:
                return await self.generate_async(
                    prompt,
                    is_retry=(attempt > 0),
                    retry_attempt=attempt,
                    **kwargs
                )
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    print(f"LLM async call failed (attempt {attempt + 1}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"LLM async call failed after {max_retries + 1} attempts")

        raise Exception(f"All LLM async retry attempts failed: {str(last_error)}")

    async def batch_generate_async(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[LLMResponse]:
        """
        Generate multiple prompts concurrently.

        Args:
            prompts: List of prompts to process
            **kwargs: Additional arguments for generate_async()

        Returns:
            List of LLMResponse objects
        """
        tasks = [self.generate_async(prompt, **kwargs) for prompt in prompts]
        return await asyncio.gather(*tasks)

    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about current model.

        Returns:
            Dict with model details
        """
        model_info = {
            "model": self.model,
            "timeout": self.timeout,
            "provider": self.provider,
            "capabilities": {
                "max_tokens": 8192 if "sonnet" in self.model else 200000,
                "supports_json": True,
                "supports_system_prompt": True,
            }
        }
        return model_info

    @staticmethod
    def _convert_tools_to_openai(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert Anthropic-format tools to OpenAI format."""
        openai_tools = []
        for tool in tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {}),
                }
            })
        return openai_tools

    @staticmethod
    def _convert_messages_for_openai(messages: List[Dict], system_prompt: Optional[str] = None) -> List[Dict]:
        """Convert Anthropic-format messages to OpenAI format, including system prompt and tool_result blocks."""
        openai_messages = []
        if system_prompt:
            openai_messages.append({"role": "system", "content": system_prompt})

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")

            if role == "user":
                if isinstance(content, list):
                    # Anthropic content blocks - extract text
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict):
                            if block.get("type") == "text":
                                text_parts.append(block["text"])
                            elif block.get("type") == "tool_result":
                                # Convert tool_result to OpenAI tool message
                                tool_result_content = block.get("content", "")
                                if isinstance(tool_result_content, list):
                                    text_parts.extend(
                                        b["text"] for b in tool_result_content
                                        if isinstance(b, dict) and b.get("type") == "text"
                                    )
                                else:
                                    text_parts.append(str(tool_result_content))
                        else:
                            text_parts.append(str(block))
                    openai_messages.append({"role": "user", "content": "\n".join(text_parts)})
                else:
                    openai_messages.append({"role": "user", "content": content})
            elif role == "assistant":
                if isinstance(content, list):
                    # May contain text and tool_use blocks
                    text_parts = []
                    tool_calls = []
                    for block in content:
                        if isinstance(block, dict):
                            if block.get("type") == "text":
                                text_parts.append(block["text"])
                            elif block.get("type") == "tool_use":
                                tool_calls.append({
                                    "id": block["id"],
                                    "type": "function",
                                    "function": {
                                        "name": block["name"],
                                        "arguments": json.dumps(block.get("input", {}), ensure_ascii=False),
                                    }
                                })
                    msg_dict: Dict[str, Any] = {"role": "assistant"}
                    if text_parts:
                        msg_dict["content"] = "\n".join(text_parts)
                    else:
                        msg_dict["content"] = None
                    if tool_calls:
                        msg_dict["tool_calls"] = tool_calls
                    openai_messages.append(msg_dict)
                else:
                    openai_messages.append({"role": "assistant", "content": content})
            else:
                openai_messages.append(msg)

        return openai_messages

    def _call_with_tools(
        self,
        messages: List[Dict],
        tools: List[Dict[str, Any]],
        max_tokens: int = 16384,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None
    ) -> LLMToolUseResponse:
        """
        Internal method: make a tool-use API call, handling both providers.
        """
        if self.provider == "openai-compatible":
            openai_messages = self._convert_messages_for_openai(messages, system_prompt)
            openai_tools = self._convert_tools_to_openai(tools)

            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=openai_messages,
                tools=openai_tools if openai_tools else None,
                extra_body={"thinking": {"type": "disabled"}}
            )

            choice = response.choices[0]
            text_content = [choice.message.content] if choice.message.content else []
            tool_calls = []
            if choice.message.tool_calls:
                for tc in choice.message.tool_calls:
                    tool_calls.append({
                        "id": tc.id,
                        "name": tc.function.name,
                        "input": json.loads(tc.function.arguments) if tc.function.arguments else {}
                    })

            return LLMToolUseResponse(
                text="\n".join(text_content),
                tool_calls=tool_calls,
                stop_reason="tool_use" if choice.finish_reason == "tool_calls" else (choice.finish_reason or "end_turn"),
                model=response.model,
                usage={
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                }
            )
        else:
            api_params: Dict[str, Any] = {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
                "tools": tools,
            }
            if system_prompt:
                api_params["system"] = system_prompt

            response = self.client.messages.create(**api_params)

            tool_calls = []
            text_content = []
            for block in response.content:
                if block.type == "text":
                    text_content.append(block.text)
                elif block.type == "tool_use":
                    tool_calls.append({
                        "id": block.id,
                        "name": block.name,
                        "input": block.input
                    })

            return LLMToolUseResponse(
                text="\n".join(text_content),
                tool_calls=tool_calls,
                stop_reason=response.stop_reason,
                model=response.model,
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                }
            )

    def generate_with_tools(
        self,
        prompt: str,
        tools: List[Dict[str, Any]],
        max_tokens: int = 16384,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None,
        purpose: Optional[str] = None
    ) -> LLMToolUseResponse:
        """
        Generate content with tool use support (Issue #17: with trace support).

        Args:
            prompt: User prompt
            tools: List of tool definitions (Anthropic format)
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            system_prompt: Optional system prompt
            purpose: Purpose description for tracing

        Returns:
            LLMToolUseResponse with tool_calls if LLM wants to use tools
        """
        start_time = time.time()
        messages = [{"role": "user", "content": prompt}]

        result = self._call_with_tools(
            messages, tools, max_tokens, temperature, system_prompt
        )

        # Send trace (Issue #17)
        execution_time = time.time() - start_time
        self._send_llm_trace_with_tools(
            prompt=prompt,
            response=result,
            tools=tools,
            execution_time=execution_time,
            system_prompt=system_prompt,
            purpose=purpose
        )

        return result

    def continue_tool_use(
        self,
        messages: List[Dict],
        tools: List[Dict[str, Any]],
        max_tokens: int = 16384,
        system_prompt: Optional[str] = None
    ) -> LLMToolUseResponse:
        """
        Continue conversation after tool execution (Issue #17: with trace support).

        Args:
            messages: Complete message history including tool results
            tools: Tool definitions
            max_tokens: Maximum tokens
            system_prompt: Optional system prompt

        Returns:
            LLMToolUseResponse with next turn
        """
        start_time = time.time()

        result = self._call_with_tools(
            messages, tools, max_tokens, 0.3, system_prompt
        )

        # Send trace for continuation (Issue #17)
        execution_time = time.time() - start_time
        self._send_llm_trace_with_tools(
            prompt="(continuation after tool use)",
            response=result,
            tools=tools,
            execution_time=execution_time,
            system_prompt=system_prompt,
            purpose="tool_use_continuation",
            messages=messages
        )

        return result

    def _send_llm_trace_with_tools(
        self,
        prompt: str,
        response: LLMToolUseResponse,
        tools: List[Dict[str, Any]],
        execution_time: float,
        system_prompt: Optional[str] = None,
        purpose: Optional[str] = None,
        messages: Optional[List[Dict]] = None
    ):
        """
        Send LLM call trace with tool use info to executionTraces stream (Issue #17).

        Args:
            prompt: The prompt sent to LLM
            response: The LLMToolUseResponse from LLM
            tools: Tools that were available
            execution_time: Execution time in seconds
            system_prompt: System prompt used
            purpose: Purpose description for this LLM call
            messages: Optional complete message history (for debugging tool use loops)
        """
        import httpx

        if not self.trace_api_url:
            return

        session_id = os.getenv('MOTIA_SESSION_ID', 'unknown')

        trace_id = f"llm-skill-{self.skill_name}-{self.task_id}-{int(time.time() * 1000)}"
        timestamp_ms = int(time.time() * 1000)

        # Build messages array for unified trace format (Issue #17)
        # If complete messages are provided, use them; otherwise fallback to old format
        if messages:
            trace_messages = messages
        else:
            trace_messages = []
            if system_prompt:
                trace_messages.append({"role": "system", "content": system_prompt})
            trace_messages.append({"role": "user", "content": prompt})

        trace_data = {
            "id": trace_id,
            "level": "skill-internal",
            "taskId": self.task_id,
            "agentId": session_id,
            "skillName": self.skill_name,
            "stage": f"llm_call - {purpose}" if purpose else "llm_call_with_tools",
            "status": "completed",
            "durationMs": int(execution_time * 1000),  # Convert to ms
            "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
            "isRetry": False,
            "retryAttempt": 0,
            "metadata": {
                "sessionId": session_id,
                "purpose": purpose or f"{self.skill_name}_with_tools",
                "llmProvider": self.provider,
                "llmModel": response.model,
                "llmRequest": {
                    "messages": trace_messages,
                    "tools": tools,
                },
                "llmResponse": {
                    "content": response.text[:2000] if response.text else "",
                    "toolCalls": response.tool_calls,
                    "stopReason": response.stop_reason,
                    "promptTokens": response.usage['input_tokens'],
                    "completionTokens": response.usage['output_tokens'],
                    "totalTokens": response.usage['input_tokens'] + response.usage['output_tokens'],
                }
            }
        }

        # Send trace synchronously using httpx
        try:
            with httpx.Client(timeout=5) as client:
                response_obj = client.post(
                    self.trace_api_url,
                    json=trace_data
                )
                if response_obj.status_code == 200:
                    print(f"[LLMClient] ✓ LLM trace with tools sent: {trace_id}")
                else:
                    print(f"[LLMClient] ✗ Failed to send LLM trace: HTTP {response_obj.status_code}")
        except Exception as e:
            print(f"[LLMClient] ✗ Failed to send LLM trace with tools: {e}")


# Singleton instance for reuse
_llm_client_instance: Optional[LLMClient] = None


def get_llm_client(
    model: Optional[str] = None,
    trace_api_url: Optional[str] = None,
    task_id: Optional[str] = None,
    skill_name: str = "unknown-skill",
    force_new: bool = False
) -> LLMClient:
    """
    Get or create singleton LLM client instance.

    Args:
        model: Optional model override
        trace_api_url: Optional trace API URL override
        task_id: Optional task ID for tracing
        skill_name: Optional skill name for tracing
        force_new: Force creation of new instance instead of using cached one

    Returns:
        LLMClient instance
    """
    global _llm_client_instance

    # Use model from param, env var, or fallback to default
    default_model = os.getenv("DEFAULT_LLM_MODEL", "claude-sonnet-4-5")
    effective_model = model or default_model

    # Create new instance if forced, or if model changed, or if no instance exists,
    # or if skill_name changed (important for trace attribution)
    skill_name_changed = (
        _llm_client_instance is not None and
        _llm_client_instance.skill_name != skill_name
    )

    if _llm_client_instance is None or effective_model != _llm_client_instance.model or force_new or skill_name_changed:
        _llm_client_instance = LLMClient(
            model=effective_model,
            trace_api_url=trace_api_url,
            task_id=task_id,
            skill_name=skill_name
        )

    return _llm_client_instance
