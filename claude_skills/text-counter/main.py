"""
Text Counter Skill - Counts words, characters, and lines in text
"""

import json
import sys


def count_text(text: str, mode: str = "basic") -> dict:
    """
    Count words, characters, and lines in text.

    Args:
        text: The text to analyze
        mode: 'basic' or 'detailed'

    Returns:
        Dictionary with count results
    """
    if not text:
        return {
            "words": 0,
            "characters": 0,
            "lines": 0
        }

    # Count characters
    characters = len(text)

    # Count lines
    lines = text.count('\n') + 1

    # Count words
    words = len(text.split())

    result = {
        "words": words,
        "characters": characters,
        "lines": lines
    }

    # Add detailed analysis if requested
    if mode == "detailed":
        result.update({
            "paragraphs": len([p for p in text.split('\n\n') if p.strip()]),
            "avg_word_length": sum(len(word) for word in text.split()) / max(words, 1),
            "non_whitespace": len(text.replace(' ', '').replace('\n', ''))
        })

    return result


def execute(input_data: dict) -> dict:
    """
    Main execution function.

    Args:
        input_data: Dictionary with 'task' containing text and mode

    Returns:
        Result dictionary
    """
    task = input_data.get('task', {})
    context = input_data.get('context', {})

    # Extract parameters
    text = task.get('text', '')
    mode = task.get('mode', 'basic')

    try:
        # Perform counting
        result = count_text(text, mode)

        return {
            'success': True,
            'output': result
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


if __name__ == "__main__":
    # Read from stdin
    input_data = json.loads(sys.stdin.read())

    # Execute
    result = execute(input_data)

    # Write to stdout
    print(json.dumps(result, indent=2))
