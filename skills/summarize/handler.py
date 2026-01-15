"""
Summarize Skill Handler

Handles text summarization with unified output format.
"""

import sys
import time
from pathlib import Path
from typing import Dict, Any

# Add parent lib for OutputBuilder (absolute path to skills/lib)
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute text summarization.

    Args:
        input_data: Dictionary containing:
            - content: Text content to summarize
            - max_length: Maximum summary length in words (default: 100)
            - style: Summary style (default: concise)

    Returns:
        Dictionary with summary in unified output format
    """
    start_time = time.time()

    content = input_data.get('content', '')
    max_length = input_data.get('max_length', 100)
    style = input_data.get('style', 'concise')

    # Input validation
    if not content or not content.strip():
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ValueError("Content is required for summarization"),
                    suggestions=[
                        "Provide text content to summarize",
                        "Ensure content field is not empty"
                    ]
                ) \
                .build()
        else:
            return {"error": "Content is required"}

    try:
        # Simulate summarization (in production, this would call an LLM)
        # For now, create a simple summary by truncation
        words = content.split()

        if len(words) <= max_length:
            summary_text = content
        else:
            if style == 'concise':
                # Simple truncate
                summary_text = ' '.join(words[:max_length]) + '...'
            elif style == 'detailed':
                # Take first and last parts
                first_part = ' '.join(words[:max_length//2])
                last_part = ' '.join(words[-(max_length//2):])
                summary_text = f"{first_part} ... {last_part}"
            elif style == 'bullet-points':
                # Create bullet points from sentences
                sentences = content.split('. ')
                bullet_summary = '\n'.join(f'• {s.strip()}' for s in sentences[:5] if s.strip())
                summary_text = bullet_summary
            else:
                summary_text = ' '.join(words[:max_length]) + '...'

        # Calculate statistics
        original_length = len(words)
        summary_words = len(summary_text.split())
        compression_ratio = summary_words / original_length if original_length > 0 else 0

        # Use OutputBuilder if available
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_text(text=summary_text) \
                .add_standard_metadata("original_length", original_length) \
                .add_standard_metadata("summary_length", summary_words) \
                .add_standard_metadata("compression_ratio", round(compression_ratio, 2)) \
                .add_standard_metadata("style", style) \
                .build()
        else:
            # Fallback to old format
            return {
                "summary": summary_text,
                "original_length": original_length,
                "summary_length": summary_words
            }

    except Exception as e:
        # Error handling with OutputBuilder
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check if the content is valid text",
                        "Try a shorter content",
                        "Verify the style parameter is supported"
                    ]
                ) \
                .build()
        else:
            return {"error": str(e)}


# For testing purposes
if __name__ == "__main__":
    import asyncio
    import json

    async def test():
        test_content = """
        This is a long text that needs to be summarized. It contains multiple sentences
        and paragraphs that convey important information. The summarization process
        should extract the key points and present them in a concise format while
        maintaining the essential meaning of the original content.
        """

        result = await execute({
            "content": test_content,
            "max_length": 20,
            "style": "concise"
        })
        print(json.dumps(result, indent=2))

    asyncio.run(test())
