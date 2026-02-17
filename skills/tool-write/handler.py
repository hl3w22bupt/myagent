"""
Tool Write - File writing tool with hybrid input mode.

Supports two input modes:
1. Direct parameters: file_path + content (direct execution, no internal LLM)
2. Task mode: task (natural language, internal LLM parses to parameters)
"""
import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, Any

# Add src to path for shared utilities
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

try:
    from core.skill.llm_client import get_llm_client
    LLM_CLIENT_AVAILABLE = True
except ImportError:
    LLM_CLIENT_AVAILABLE = False


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute file write - supports both task and direct parameter modes.

    Priority:
    1. Direct parameters (file_path + content) - direct execution
    2. Task mode - internal LLM parses to parameters
    """
    # Mode 1: Direct parameters (priority)
    if "file_path" in input_data and "content" in input_data:
        return _execute_direct(input_data)

    # Mode 2: Task mode
    task = input_data.get("task")
    if task:
        params = _call_llm_for_params(task)
        return _execute_direct(params)

    # Neither mode provided
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder().set_error(
            error=ValueError("Either 'task' or both 'file_path' and 'content' parameters are required"),
            suggestions=["Provide 'file_path' and 'content' for direct execution or 'task' for natural language"]
        ).build()
    else:
        return {
            "success": False,
            "error": "Either 'task' or both 'file_path' and 'content' parameters are required"
        }


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """Direct execution with parsed parameters."""
    file_path = params.get("file_path")
    content = params.get("content", "")

    if not file_path:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("file_path is required"),
                suggestions=["Provide 'file_path' parameter"]
            ).build()
        else:
            return {"success": False, "error": "file_path is required"}

    try:
        # Create parent directories if they don't exist
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)

        # Write content to file
        Path(file_path).write_text(content, encoding="utf-8")

        if OUTPUT_BUILDER_AVAILABLE:
            output = OutputBuilder() \
                .set_text(f"Successfully wrote {len(content)} characters to {file_path}")
            # Add output_files metadata for tracking (use set_metadata to avoid x- prefix)
            output.set_metadata("output_files", [file_path])
            return output.build()
        else:
            return {
                "success": True,
                "result_type": "text",
                "content": f"Successfully wrote {len(content)} characters to {file_path}",
                "output_files": [file_path]
            }
    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(e).build()
        else:
            return {"success": False, "error": str(e)}


def _call_llm_for_params(task: str) -> Dict[str, Any]:
    """
    Use internal LLM to parse task into parameters.

    Only called when in task mode (no direct parameters provided).
    """
    if not LLM_CLIENT_AVAILABLE:
        raise ValueError("LLM client not available for task mode")

    try:
        llm = get_llm_client(skill_name="tool-write")
    except ValueError:
        raise ValueError("LLM client initialization failed")

    prompt = f"""You are a parameter parser for file writing operations.

Task: {task}

Extract the file_path and content from the task. Return ONLY valid JSON:
{{"file_path": "...", "content": "..."}}

If the content is not specified in the task, use a reasonable default or empty string.

Examples:
- "Write 'Hello World' to test.txt" -> {{"file_path": "test.txt", "content": "Hello World"}}
- "创建 config.json，内容为 {{\"debug\": true}}" -> {{"file_path": "config.json", "content": "{{\\"debug\\": true}}"}}
- "创建一个 README.md" -> {{"file_path": "README.md", "content": "# README\\n\\nProject description."}}

Return ONLY JSON, no other text, no markdown, no code blocks."""

    try:
        response = llm.generate(prompt, max_tokens=500, temperature=0.1)
        content = response.content.strip()

        # Clean up response - remove markdown code blocks
        if content.startswith("```"):
            content = re.sub(r'^```[a-zA-Z]*\n?', '', content)
            content = re.sub(r'\n?```$', '', content).strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Try to extract file path at minimum
            match = re.search(r'["\']?([\w./\\-]+)["\']?', task)
            if match:
                return {"file_path": match.group(1), "content": ""}
            raise ValueError(f"Failed to parse LLM response as JSON: {content}")

    except Exception as e:
        raise ValueError(f"LLM parsing failed: {str(e)}")


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct parameters
    print("Test 1: Direct parameters")
    result = execute({"file_path": "/tmp/test-tool-write.txt", "content": "Hello from tool-write!"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print()

    # Test 2: Task mode (requires LLM)
    print("Test 2: Task mode")
    result = execute({"task": "Write 'Hello from task mode' to /tmp/test-task.txt"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
