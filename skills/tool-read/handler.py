"""
Tool Read - File reading tool with hybrid input mode.

Supports two input modes:
1. Direct parameters: file_path (direct execution, no internal LLM)
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
    Execute file read - supports both task and direct parameter modes.

    Priority:
    1. Direct parameters (file_path) - direct execution
    2. Task mode - internal LLM parses to parameters
    """
    # Mode 1: Direct parameters (priority)
    if "file_path" in input_data:
        return _execute_direct(input_data)

    # Mode 2: Task mode
    task = input_data.get("task")
    if task:
        params = _call_llm_for_params(task)
        return _execute_direct(params)

    # Neither mode provided
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder().set_error(
            error=ValueError("Either 'task' or 'file_path' parameter is required"),
            suggestions=["Provide 'file_path' for direct execution or 'task' for natural language"]
        ).build()
    else:
        return {
            "success": False,
            "error": "Either 'task' or 'file_path' parameter is required"
        }


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """Direct execution with parsed parameters."""
    file_path = params.get("file_path")
    encoding = params.get("encoding", "utf-8")

    if not file_path:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("file_path is required"),
                suggestions=["Provide 'file_path' parameter"]
            ).build()
        else:
            return {"success": False, "error": "file_path is required"}

    try:
        content = Path(file_path).read_text(encoding=encoding)

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_text(content).build()
        else:
            return {
                "success": True,
                "result_type": "text",
                "content": content
            }
    except FileNotFoundError:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=FileNotFoundError(f"File not found: {file_path}"),
                suggestions=[f"Check if the file exists: {file_path}"]
            ).build()
        else:
            return {"success": False, "error": f"File not found: {file_path}"}
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
        # Fallback: extract file path from task using regex
        match = re.search(r'["\']?([\w./\\-]+)["\']?', task)
        if match:
            return {"file_path": match.group(1)}
        raise ValueError("LLM client not available and couldn't parse file path from task")

    try:
        llm = get_llm_client(skill_name="tool-read")
    except ValueError:
        # Fallback to regex
        match = re.search(r'["\']?([\w./\\-]+)["\']?', task)
        if match:
            return {"file_path": match.group(1)}
        raise ValueError("LLM client initialization failed")

    prompt = f"""You are a parameter parser for file reading operations.

Task: {task}

Extract the file_path from the task. Return ONLY valid JSON:
{{"file_path": "...", "encoding": "utf-8"}}

Examples:
- "读取 package.json" -> {{"file_path": "package.json"}}
- "Read /etc/hosts file" -> {{"file_path": "/etc/hosts"}}
- "查看 src/main.py 的内容" -> {{"file_path": "src/main.py"}}
- "Read .env file" -> {{"file_path": ".env"}}

Return ONLY JSON, no other text, no markdown, no code blocks."""

    try:
        response = llm.generate(prompt, max_tokens=200, temperature=0.1)
        content = response.content.strip()

        # Clean up response - remove markdown code blocks
        if content.startswith("```"):
            content = re.sub(r'^```[a-zA-Z]*\n?', '', content)
            content = re.sub(r'\n?```$', '', content).strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Fallback: try to extract file path from task
            match = re.search(r'["\']?([\w./\\-]+)["\']?', task)
            if match:
                return {"file_path": match.group(1)}
            raise ValueError(f"Failed to parse LLM response as JSON: {content}")

    except Exception as e:
        # Fallback: extract file path from task using regex
        match = re.search(r'["\']?([\w./\\-]+)["\']?', task)
        if match:
            return {"file_path": match.group(1)}
        raise ValueError(f"LLM parsing failed: {str(e)}")


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct file_path
    print("Test 1: Direct file_path")
    result = execute({"file_path": "skill.yaml"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print()

    # Test 2: Task mode
    print("Test 2: Task mode")
    result = execute({"task": "读取 skill.yaml 的内容"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
