"""
Remotion Code Generators

This package contains LLM-driven code generation modules for creating
Remotion video components from natural language descriptions.
"""

import sys
from pathlib import Path
import asyncio
from typing import Optional

# Add src to path for shared utilities (src must be in path for 'from core.skill' to work)
src_dir = Path(__file__).parent.parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

from core.skill import llm_client as core_llm_client_module

from .base_generator import BaseGenerator, GenerationResult
from .llm_analyzer import ContentAnalyzer
from .code_generator import RemotionCodeGenerator
from .validator import CodeValidator

class LLMClient(core_llm_client_module.LLMClient):
    """
    Wrapper around core.skill.llm_client.LLMClient for remotion-generator.

    Uses 'remotion-generator' as the default skill_name.
    Exposes async methods that remotion-generator needs.
    """
    def __init__(self, *args, skill_name: str = "remotion-generator", **kwargs):
        # Override skill_name with remotion-generator default
        kwargs['skill_name'] = skill_name
        super().__init__(*args, **kwargs)

    async def generate_async(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        system_prompt: Optional[str] = None,
        response_format: str = "text",
        purpose: Optional[str] = None,
        is_retry: bool = False,
        retry_attempt: int = 0,
        **kwargs
    ) -> core_llm_client_module.LLMResponse:
        """
        Async wrapper for generate_async from parent class.

        All parameters are passed through to the parent class's generate_async method.
        """
        return await super().generate_async(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=system_prompt,
            response_format=response_format,
            purpose=purpose,
            is_retry=is_retry,
            retry_attempt=retry_attempt,
            **kwargs
        )

def get_llm_client(*args, skill_name: str = "remotion-generator", **kwargs) -> LLMClient:
    """
    Get or create singleton LLM client instance for remotion-generator.

    Args:
        skill_name: Skill name for tracing (defaults to 'remotion-generator')
        **kwargs: Additional arguments for LLMClient

    Returns:
        LLMClient instance (always creates a new instance to ensure latest code)
    """
    # Always force a new instance to ensure we get the latest code with generate_async
    return core_llm_client_module.get_llm_client(skill_name=skill_name, force_new=True, *args, **kwargs)

__all__ = [
    'LLMClient',
    'get_llm_client',
    'BaseGenerator',
    'GenerationResult',
    'ContentAnalyzer',
    'RemotionCodeGenerator',
    'CodeValidator',
]
