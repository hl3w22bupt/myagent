"""
Retry utilities for PTC Code execution.

Provides retry logic with exponential backoff for skill execution.
Used by auto-generated PTC Code to implement orchestration-layer retry.
"""

import asyncio
import json
from typing import Dict, Any, Callable, Optional, TypeVar
from logging import getLogger

logger = getLogger(__name__)

T = TypeVar('T')


async def execute_with_retry(
    execute_func: Callable,
    skill_name: str,
    input_data: Dict[str, Any],
    max_attempts: int = 3,
    base_delay: float = 1.0,
    exponential_base: float = 2.0
) -> Dict[str, Any]:
    """
    Execute a skill with retry logic.

    This function implements the orchestration-layer retry strategy:
    - Checks skill result.success
    - Checks skill result.content.retryable (if available)
    - Uses exponential backoff: 1s, 2s, 4s, ...
    - Maximum 3 attempts by default

    Args:
        execute_func: Async function that executes the skill
        skill_name: Name of the skill being executed
        input_data: Input data to pass to the skill
        max_attempts: Maximum number of retry attempts (default: 3)
        base_delay: Initial delay in seconds (default: 1.0)
        exponential_base: Multiplier for exponential backoff (default: 2.0)

    Returns:
        Skill execution result in unified format:
        {
            "result_type": str,
            "success": bool,
            "content": any,
            "metadata": dict,
            "attempts": int  # Number of attempts made
        }

    Example:
        ```python
        result = await execute_with_retry(
            execute_func=executor.execute,
            skill_name="web-search",
            input_data={"query": "example"},
            max_attempts=3
        )

        if result["success"]:
            print(f"Success: {result['content']}")
        else:
            print(f"Failed after {result['attempts']} attempts")
            print(f"Error: {result['content'].get('message', 'Unknown error')}")
        ```
    """
    last_error = None
    last_result = None

    for attempt in range(1, max_attempts + 1):
        try:
            logger.info(f"Executing skill '{skill_name}', attempt {attempt}/{max_attempts}")

            # Execute the skill
            result = await execute_func(skill_name, input_data)

            # Handle different result formats
            # Format 1: Unified format with dict-like result
            if isinstance(result, dict):
                success = result.get('success', False)
                content = result.get('content', {})
                output = result.get('output')

                # Check if should retry
                should_retry = False

                if success:
                    # Success - no retry needed
                    logger.info(f"Skill '{skill_name}' succeeded on attempt {attempt}")
                    return {
                        **result,
                        "attempts": attempt
                    }
                else:
                    # Failure - check if retryable
                    # Check content.retryable (if content is a dict)
                    if isinstance(content, dict):
                        retryable = content.get('retryable')
                        if retryable is not None:
                            should_retry = retryable and attempt < max_attempts
                            logger.warning(
                                f"Skill '{skill_name}' failed on attempt {attempt}: "
                                f"{content.get('message', 'Unknown error')}. "
                                f"Retryable: {retryable}, Will retry: {should_retry}"
                            )
                        else:
                            # No retryable field - use default logic
                            should_retry = _is_default_retryable_error(content) and attempt < max_attempts
                    else:
                        # Content is not a dict - use default logic
                        should_retry = _is_default_retryable_error(result) and attempt < max_attempts

                    if should_retry:
                        last_error = content.get('message') if isinstance(content, dict) else str(content)
                    else:
                        # Non-retryable error or max attempts reached
                        logger.error(
                            f"Skill '{skill_name}' failed on attempt {attempt}, "
                            f"will not retry (retryable={should_retry}, max_attempts={max_attempts})"
                        )
                        return {
                            **result,
                            "attempts": attempt
                        }

            # Format 2: Object result with success attribute
            elif hasattr(result, 'success'):
                success = result.success
                content = result.output if success else (result.error or {})
                output = content

                if success:
                    logger.info(f"Skill '{skill_name}' succeeded on attempt {attempt}")
                    return {
                        "result_type": "skill_result",
                        "success": True,
                        "content": content,
                        "metadata": {},
                        "attempts": attempt
                    }
                else:
                    # Check if retryable
                    should_retry = False

                    # Try to parse content as dict to check retryable
                    if isinstance(content, dict):
                        retryable = content.get('retryable')
                        if retryable is not None:
                            should_retry = retryable and attempt < max_attempts
                        else:
                            should_retry = _is_default_retryable_error(content) and attempt < max_attempts
                    else:
                        should_retry = _is_default_retryable_error({'error': str(content)}) and attempt < max_attempts

                    if should_retry:
                        last_error = str(content)
                    else:
                        logger.error(
                            f"Skill '{skill_name}' failed on attempt {attempt}, "
                            f"will not retry"
                        )
                        return {
                            "result_type": "skill_result",
                            "success": False,
                            "content": {"message": str(content), "type": "unknown"},
                            "metadata": {},
                            "attempts": attempt
                        }

            else:
                # Unknown format - treat as failure
                logger.error(f"Unknown result format from skill '{skill_name}': {type(result)}")
                return {
                    "result_type": "error",
                    "success": False,
                    "content": {
                        "type": "unknown_format",
                        "message": f"Unknown result format: {type(result)}"
                    },
                    "metadata": {},
                    "attempts": attempt
                }

        except Exception as e:
            logger.exception(f"Exception executing skill '{skill_name}' on attempt {attempt}")
            last_error = str(e)

            # Check if exception type is retryable
            should_retry = _is_retryable_exception(e) and attempt < max_attempts

            if not should_retry:
                logger.error(
                    f"Non-retryable exception in skill '{skill_name}': {type(e).__name__}: {str(e)}"
                )
                return {
                    "result_type": "error",
                    "success": False,
                    "content": {
                        "type": type(e).__name__,
                        "message": str(e),
                        "retryable": False
                    },
                    "metadata": {},
                    "attempts": attempt
                }

        # Retry with exponential backoff
        if attempt < max_attempts:
            delay = base_delay * (exponential_base ** (attempt - 1))
            logger.info(f"Retrying skill '{skill_name}' in {delay:.1f}s...")
            await asyncio.sleep(delay)

    # All attempts exhausted
    logger.error(f"Skill '{skill_name}' failed after {max_attempts} attempts. Last error: {last_error}")
    return {
        "result_type": "error",
        "success": False,
        "content": {
            "type": "max_attempts_exceeded",
            "message": f"Skill '{skill_name}' failed after {max_attempts} attempts",
            "last_error": last_error,
            "retryable": False
        },
        "metadata": {},
        "attempts": max_attempts
    }


def _is_default_retryable_error(result: Dict[str, Any]) -> bool:
    """
    Check if an error is retryable based on error content.

    Retryable errors: timeout, network, temporary, resource
    Non-retryable errors: validation, permission, not found, syntax, type

    Args:
        result: Result dict to check

    Returns:
        True if error should be retried, False otherwise
    """
    if not isinstance(result, dict):
        return False

    # Check explicit retryable field first
    if 'retryable' in result:
        return bool(result['retryable'])

    # Check error message for retryable patterns
    error_message = ''
    if 'message' in result:
        error_message = str(result['message']).lower()
    elif 'error' in result:
        error_message = str(result['error']).lower()

    # Check error type
    error_type = result.get('type', '').lower()

    # Retryable error types
    retryable_types = ['timeout', 'network', 'temporary', 'resource', 'connection']
    retryable_patterns = ['timeout', 'timed out', 'network', 'connection', 'temporary', 'unavailable']

    # Non-retryable error types
    non_retryable_types = ['validation', 'permission', 'not_found', 'syntax', 'type_error', 'auth']
    non_retryable_patterns = [
        'validation', 'invalid', 'permission', 'unauthorized', 'forbidden',
        'not found', 'no such', 'syntax error', 'type error', 'typeerror',
        'authentication', 'auth'
    ]

    # Check non-retryable patterns first (higher priority)
    for pattern in non_retryable_patterns:
        if pattern in error_message or pattern in error_type:
            return False

    # Check retryable patterns
    for pattern in retryable_patterns:
        if pattern in error_message or pattern in error_type:
            return True

    # Default: non-retryable if unknown
    return False


def _is_retryable_exception(exception: Exception) -> bool:
    """
    Check if an exception type is retryable.

    Args:
        exception: Exception to check

    Returns:
        True if exception should be retried, False otherwise
    """
    # Retryable exception types
    retryable_exceptions = (
        TimeoutError,
        ConnectionError,
        ConnectionRefusedError,
        ConnectionResetError,
        BrokenPipeError,
    )

    # Non-retryable exception types
    non_retryable_exceptions = (
        ValueError,
        TypeError,
        PermissionError,
        FileNotFoundError,
        NotADirectoryError,
        KeyError,
        AttributeError,
        ImportError,
        SyntaxError,
    )

    # Check non-retryable first (higher priority)
    if isinstance(exception, non_retryable_exceptions):
        return False

    # Check retryable
    if isinstance(exception, retryable_exceptions):
        return True

    # Check exception message for retryable patterns
    error_message = str(exception).lower()
    return any(pattern in error_message for pattern in ['timeout', 'network', 'connection', 'temporary'])
