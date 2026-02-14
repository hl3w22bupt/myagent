"""
Base Generator Module

Defines the abstract interface and common functionality for all generators.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import json
import logging
import sys
from pathlib import Path

# Add src to path for core.skill.llm_client import
src_dir = Path(__file__).parent.parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

from core.skill.llm_client import LLMClient, get_llm_client

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class GenerationResult:
    """Result from code generation."""
    code: str
    metadata: Dict[str, Any]
    success: bool
    errors: Optional[List[str]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "code": self.code,
            "metadata": self.metadata,
            "success": self.success,
            "errors": self.errors or []
        }


class BaseGenerator(ABC):
    """
    Abstract base class for all generators.

    Provides common functionality for LLM-based code generation including
    caching, error handling, and logging.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None):
        """
        Initialize base generator.

        Args:
            llm_client: Optional LLM client (uses singleton if not provided)
        """
        self.llm = llm_client or get_llm_client(skill_name="remotion-generator")
        self.cache: Dict[str, Any] = {}
        self.stats = {
            "total_generations": 0,
            "cache_hits": 0,
            "failures": 0
        }

    @abstractmethod
    async def generate(self, **kwargs) -> GenerationResult:
        """
        Generate code or content.

        Must be implemented by subclasses.

        Args:
            **kwargs: Generation-specific parameters

        Returns:
            GenerationResult with generated content
        """
        pass

    def _make_cache_key(self, *args, **kwargs) -> str:
        """
        Create cache key from arguments.

        Args:
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Cache key string
        """
        # Create deterministic key from sorted kwargs
        key_parts = [str(arg) for arg in args]
        key_parts.extend([
            f"{k}={v}" for k, v in sorted(kwargs.items())
        ])
        return ":".join(key_parts)

    def _get_from_cache(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None
        """
        if key in self.cache:
            self.stats["cache_hits"] += 1
            logger.debug(f"Cache hit for key: {key[:50]}...")
            return self.cache[key]
        return None

    def _set_cache(self, key: str, value: Any):
        """
        Set value in cache.

        Args:
            key: Cache key
            value: Value to cache
        """
        self.cache[key] = value

    async def _llm_call_with_fallback(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        fallback_value: Optional[str] = None,
        retry_attempt: int = 0,
        **llm_kwargs
    ) -> str:
        """
        Call LLM with fallback handling.

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            fallback_value: Fallback value if LLM fails
            retry_attempt: Which retry attempt (0 = first attempt)
            **llm_kwargs: Additional LLM parameters

        Returns:
            Generated text or fallback value
        """
        logger.info(f"[DEBUG] _llm_call_with_fallback: kwargs keys: {list(llm_kwargs.keys())}")
        try:
            # Extract retry_attempt from llm_kwargs if present (it might be passed there)
            # Otherwise use the parameter
            final_retry_attempt = llm_kwargs.pop('retry_attempt', retry_attempt)

            # Use generate_async for async LLM calls
            # Remove purpose from llm_kwargs to avoid conflict with generate_async's purpose parameter
            llm_kwargs_purpose = llm_kwargs.pop('purpose', None)
            response = await self.llm.generate_async(
                prompt=prompt,
                system_prompt=system_prompt,
                purpose=llm_kwargs_purpose,
                is_retry=(final_retry_attempt > 0),
                retry_attempt=final_retry_attempt,
                **llm_kwargs
            )
            return response.content
        except Exception as e:
            logger.error(f"LLM call failed: {str(e)}")
            self.stats["failures"] += 1

            if fallback_value is not None:
                logger.warning("Using fallback value")
                return fallback_value

            raise

    def _extract_json_from_response(self, response: str) -> Dict[str, Any]:
        """
        Extract JSON from LLM response.

        Handles cases where LLM wraps JSON in markdown code blocks.

        Args:
            response: LLM response text

        Returns:
            Parsed JSON dict

        Raises:
            ValueError: If JSON parsing fails
        """
        # Try direct parsing
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code blocks
        if "```json" in response:
            # Extract JSON from markdown code block
            start = response.find("```json") + 7
            end = response.find("```", start)
            if end != -1:
                json_str = response[start:end].strip()
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    pass

        # Try extracting from any code block
        if "```" in response:
            start = response.find("```") + 3
            # Find end of first line (language identifier)
            newline = response.find("\n", start)
            if newline != -1:
                start = newline + 1
                end = response.find("```", start)
                if end != -1:
                    json_str = response[start:end].strip()
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass

        raise ValueError(
            f"Failed to extract JSON from response. "
            f"Response length: {len(response)}"
        )

    def _extract_code_from_response(
        self,
        response: str,
        language: str = "typescript"
    ) -> str:
        """
        Extract code from LLM response.

        Handles cases where LLM wraps code in markdown code blocks.

        Args:
            response: LLM response text
            language: Expected code language (for code block marker)

        Returns:
            Extracted code string

        Raises:
            ValueError: If code extraction fails
        """
        import logging
        logger = logging.getLogger(__name__)

        # Clean response - remove leading/trailing whitespace
        response = response.strip()

        # Debug: Print response for debugging
        logger.debug(f"Raw response received for code extraction: {response[:200]}...")

        # Look for ```typescript or ```tsx code blocks
        code_block_marker = f"```{language}"

        if code_block_marker in response:
            start = response.find(code_block_marker) + len(code_block_marker)
            end = response.find("```", start)
            if end != -1:
                extracted = response[start:end].strip()
                logger.info(f"✅ Extracted code using {code_block_marker} marker")
                return extracted

        # Try generic ``` code block
        if "```" in response:
            # Find first ``` marker
            first_marker = response.find("```")
            if first_marker != -1:
                # Find end of first line (language identifier or just ```)
                newline = response.find("\n", first_marker)
                if newline != -1:
                    start = newline + 1
                    # Find closing ```
                    end = response.find("```", start)
                    if end != -1:
                        extracted = response[start:end].strip()
                        logger.info(f"✅ Extracted code using generic ``` block")
                        return extracted
                else:
                    # If there's no newline after ```, treat the rest of the response as code
                    start = first_marker + 3
                    extracted = response[start:].strip()
                    logger.warning(f"⚠️  No newline after code block marker, extracting rest of response")
                    return extracted

        # No code block markers found, check if response starts with ```
        # This handles malformed responses where the response IS the code block
        if response.startswith("```"):
            logger.warning(f"⚠️  Response starts with ``` but no end marker found")
            # Debug: Print full response
            logger.debug(f"Full response: {response}")
            # Try to extract anyway by skipping first line and taking everything
            lines = response.split('\n')
            if len(lines) > 1:
                # Skip first line (```typescript or ```)
                # and take everything until we find a line that's just ```
                code_lines = []
                for line in lines[1:]:
                    if line.strip() == '```':
                        break
                    code_lines.append(line)
                if code_lines:
                    extracted = '\n'.join(code_lines).strip()
                    logger.info(f"✅ Extracted code by skipping first line")
                    return extracted
            else:
                # If there's only one line, just strip the leading ```
                extracted = response[3:].strip()
                logger.warning(f"⚠️  Single-line code block, stripping leading ```")
                return extracted

        # No code block found, return response as-is
        logger.warning(f"⚠️  No code block markers found, returning response as-is")
        logger.debug(f"Returning response as-is: {response[:200]}...")
        return response.strip()

    def get_stats(self) -> Dict[str, Any]:
        """
        Get generator statistics.

        Returns:
            Dict with statistics
        """
        cache_hit_rate = (
            self.stats["cache_hits"] / max(self.stats["total_generations"], 1) * 100
        )

        return {
            **self.stats,
            "cache_hit_rate": f"{cache_hit_rate:.1f}%",
            "cache_size": len(self.cache)
        }

    def reset_cache(self):
        """Clear cache and reset statistics."""
        self.cache.clear()
        self.stats = {
            "total_generations": 0,
            "cache_hits": 0,
            "failures": 0
        }
        logger.info("Generator cache and stats reset")
