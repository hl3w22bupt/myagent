"""
LLM Client for Remotion Code Generation

Provides a unified interface for interacting with LLM APIs (Anthropic Claude)
for content analysis and code generation.
"""

import os
import asyncio
import json
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from pathlib import Path
import anthropic
from dotenv import load_dotenv

# Load environment variables from project root
# Try multiple possible locations for .env file
project_root = Path(__file__).parent.parent.parent.parent
env_paths = [
    project_root / '.env',
    Path.cwd() / '.env',
    Path(os.getcwd()) / '.env',
]

loaded = False
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        loaded = True
        break

if not loaded:
    # Fallback to default behavior (searches for .env in current directory)
    load_dotenv()


@dataclass
class LLMResponse:
    """Response from LLM API."""
    content: str
    model: str
    usage: Dict[str, int]  # {input_tokens, output_tokens}
    stop_reason: str


class LLMClient:
    """
    LLM Client for Anthropic Claude API.

    Handles communication with Anthropic's Claude API for content analysis
    and code generation tasks.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: int = 180
    ):
        """
        Initialize LLM client.

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
            model: Model identifier (defaults to DEFAULT_LLM_MODEL env var or claude-3-5-sonnet-20241022)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY not found. Please set it in environment "
                "or pass api_key parameter."
            )

        # Use model from param, env var, or fallback to default
        self.model = model or os.getenv("DEFAULT_LLM_MODEL", "claude-3-5-sonnet-20241022")
        self.timeout = timeout

        # Get base URL from environment if available
        base_url = os.getenv("LLM_BASE_URL")

        # Create client with optional base_url
        if base_url:
            self.client = anthropic.AsyncAnthropic(
                api_key=self.api_key,
                base_url=base_url
            )
        else:
            self.client = anthropic.AsyncAnthropic(api_key=self.api_key)

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None,
        response_format: str = "text"  # "text" or "json"
    ) -> LLMResponse:
        """
        Generate content using LLM.

        Args:
            prompt: User prompt
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature (0-1)
            system_prompt: Optional system prompt
            response_format: Response format ("text" or "json")

        Returns:
            LLMResponse with content and metadata

        Raises:
            asyncio.TimeoutError: If request times out
            Exception: For API errors
        """
        # Prepare messages
        messages = [{"role": "user", "content": prompt}]

        # Prepare API parameters
        api_params = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }

        # Add system prompt if provided
        if system_prompt:
            api_params["system"] = system_prompt

        # Set response format for JSON if requested
        # Note: Anthropic doesn't have native JSON mode, but we can instruct
        # the model via system prompt to output JSON

        try:
            # Make API call with timeout
            response = await asyncio.wait_for(
                self.client.messages.create(**api_params),
                timeout=self.timeout
            )

            # Extract response data
            content = response.content[0].text
            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            }

            return LLMResponse(
                content=content,
                model=response.model,
                usage=usage,
                stop_reason=response.stop_reason
            )

        except asyncio.TimeoutError:
            raise asyncio.TimeoutError(
                f"LLM request timed out after {self.timeout} seconds"
            )
        except anthropic.APIError as e:
            # 详细的错误信息
            error_details = {
                "error_type": type(e).__name__,
                "error_message": str(e),
                "model": self.model,
                "prompt_length": len(prompt),
                "max_tokens": max_tokens,
            }
            raise Exception(f"Anthropic API error: {str(e)}\nDetails: {json.dumps(error_details, ensure_ascii=False)}")
        except Exception as e:
            error_details = {
                "error_type": type(e).__name__,
                "error_message": str(e),
                "model": self.model,
            }
            raise Exception(f"Unexpected error during LLM call: {str(e)}\nDetails: {json.dumps(error_details, ensure_ascii=False)}")

    async def generate_with_retry(
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
                return await self.generate(prompt, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    print(f"LLM call failed (attempt {attempt + 1}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"LLM call failed after {max_retries + 1} attempts")

        raise Exception(f"All LLM retry attempts failed: {str(last_error)}")

    async def batch_generate(
        self,
        prompts: List[str],
        **kwargs
    ) -> List[LLMResponse]:
        """
        Generate multiple prompts concurrently.

        Args:
            prompts: List of prompts to process
            **kwargs: Additional arguments for generate()

        Returns:
            List of LLMResponse objects
        """
        tasks = [self.generate(prompt, **kwargs) for prompt in prompts]
        return await asyncio.gather(*tasks)

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for text (rough approximation).

        Args:
            text: Text to estimate tokens for

        Returns:
            Estimated token count
        """
        # Rough estimate: ~4 characters per token for English
        return len(text) // 4

    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about current model.

        Returns:
            Dict with model details
        """
        model_info = {
            "model": self.model,
            "timeout": self.timeout,
            "capabilities": {
                "max_tokens": 8192 if "sonnet" in self.model else 200000,
                "supports_json": True,
                "supports_system_prompt": True,
            }
        }
        return model_info


# Singleton instance for reuse
_llm_client_instance: Optional[LLMClient] = None


def get_llm_client(model: Optional[str] = None) -> LLMClient:
    """
    Get or create singleton LLM client instance.

    Args:
        model: Optional model override

    Returns:
        LLMClient instance
    """
    global _llm_client_instance

    # Use model from param, env var, or fallback to default
    default_model = os.getenv("DEFAULT_LLM_MODEL", "claude-3-5-sonnet-20241022")
    effective_model = model or default_model

    if _llm_client_instance is None or effective_model != _llm_client_instance.model:
        _llm_client_instance = LLMClient(model=effective_model)

    return _llm_client_instance
