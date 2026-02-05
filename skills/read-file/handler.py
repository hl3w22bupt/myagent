"""
Read File Skill - Read file contents from the filesystem

This skill reads files from the project directory and returns their contents.
"""

import os
import time
from pathlib import Path
from typing import Dict, Any

# Add parent lib for OutputBuilder
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    import sys
    sys.path.insert(0, str(lib_dir))

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Read file contents.

    Args:
        input_data: Dictionary containing:
            - filepath: Path to the file to read (preferred)
            - path: Alternative path field
            - filename: Name of the file (will be searched in current directory)
            - task: Task description mentioning a file (fallback)

    Returns:
        Dictionary with file contents
    """
    start_time = time.time()

    # Try multiple field names for file path
    filepath = (
        input_data.get('filepath') or
        input_data.get('path') or
        input_data.get('filename') or
        input_data.get('task', '')
    )

    # If filepath is empty, try to extract from task
    if not filepath and input_data.get('task'):
        import re
        # Look for common file patterns in task
        file_match = re.search(r'[\w-]+\.(md|txt|py|ts|js|json|yaml|yml)', input_data.get('task'))
        if file_match:
            filepath = file_match.group(0)

    # Default to README.md if no file specified
    if not filepath or filepath.strip() == '':
        filepath = 'README.md'

    # Resolve path relative to current working directory
    # In sandbox, this is typically the project root
    cwd = os.getcwd()
    full_path = os.path.join(cwd, filepath)

    # Check if file exists
    if not os.path.exists(full_path):
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=FileNotFoundError(f"File not found: {filepath}"),
                    suggestions=[
                        f"Check if '{filepath}' exists in the project",
                        "Try using an absolute path or a path relative to project root",
                        "Common files: README.md, CONTRIBUTING.md, package.json"
                    ]
                ) \
                .build()
        else:
            return {
                "error": f"File not found: {filepath}",
                "searched_path": full_path
            }

    # Read file content
    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Truncate if too large (max 10000 chars)
        max_length = 10000
        truncated = False
        if len(content) > max_length:
            content = content[:max_length] + '\n\n... (content truncated)'
            truncated = True

        # Get file stats
        file_stats = os.stat(full_path)
        file_size = file_stats.st_size

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_text(content) \
                .set_title(f"📄 {filepath}") \
                .add_standard_metadata("filepath", filepath) \
                .add_standard_metadata("size_bytes", file_size) \
                .add_standard_metadata("truncated", truncated) \
                .build()
        else:
            return {
                "content": content,
                "filepath": filepath,
                "size": file_size,
                "truncated": truncated
            }

    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check file permissions",
                        "Ensure the file is readable",
                        "Verify the file encoding is UTF-8"
                    ]
                ) \
                .add_standard_metadata("filepath", filepath) \
                .build()
        else:
            return {
                "error": str(e),
                "filepath": filepath
            }


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Read README.md
    result = execute({"filepath": "README.md"})
    print(json.dumps(result, indent=2))

    # Test 2: Read non-existent file
    result = execute({"filepath": "nonexistent.txt"})
    print("\n" + "="*50 + "\n")
    print(json.dumps(result, indent=2))
