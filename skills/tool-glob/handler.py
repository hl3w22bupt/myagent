"""
Tool Glob - File finding tool with hybrid input mode.

Supports two input modes:
1. Direct parameters: pattern (direct execution, no internal LLM)
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
    Execute file glob - supports both task and direct parameter modes.

    Priority:
    1. Direct parameters (pattern) - direct execution
    2. Task mode - internal LLM parses to parameters
    """
    # Mode 1: Direct parameters (priority)
    if "pattern" in input_data:
        return _execute_direct(input_data)

    # Mode 2: Task mode
    task = input_data.get("task")
    if task:
        params = _call_llm_for_params(task)
        return _execute_direct(params)

    # Neither mode provided
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder().set_error(
            error=ValueError("Either 'task' or 'pattern' parameter is required"),
            suggestions=["Provide 'pattern' for direct execution or 'task' for natural language"]
        ).build()
    else:
        return {
            "success": False,
            "error": "Either 'task' or 'pattern' parameter is required"
        }


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """Direct execution with parsed parameters."""
    pattern = params.get("pattern")
    search_path = params.get("path", ".")

    if not pattern:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("pattern is required"),
                suggestions=["Provide 'pattern' parameter (e.g., '**/*.py')"]
            ).build()
        else:
            return {"success": False, "error": "pattern is required"}

    try:
        base_path = Path(search_path)
        if not base_path.is_absolute():
            base_path = Path.cwd() / base_path

        # Use glob to find files
        matched_files = list(base_path.glob(pattern))

        # Convert to relative paths for cleaner output
        relative_files = []
        for f in matched_files:
            if f.is_file():
                try:
                    rel_path = f.relative_to(Path.cwd())
                    relative_files.append(str(rel_path))
                except ValueError:
                    # File is outside cwd, use absolute path
                    relative_files.append(str(f))

        # Sort results
        relative_files.sort()

        result_text = f"Found {len(relative_files)} files matching '{pattern}':\n"
        if relative_files:
            result_text += "\n".join(f"  - {f}" for f in relative_files)
        else:
            result_text += "\n  (No matches found)"

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_text(result_text).build()
        else:
            return {
                "success": True,
                "result_type": "text",
                "content": result_text
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
        # Fallback: extract pattern from task
        match = re.search(r'[*][*]/[*]|[\w]*\.\w+', task)
        if match:
            return {"pattern": match.group(0)}
        raise ValueError("LLM client not available for task mode")

    try:
        llm = get_llm_client(skill_name="tool-glob")
    except ValueError:
        # Fallback to regex
        match = re.search(r'[*][*]/[*]|[\w]*\.\w+', task)
        if match:
            return {"pattern": match.group(0)}
        raise ValueError("LLM client initialization failed")

    prompt = f"""You are a parameter parser for file glob operations.

Task: {task}

Extract the glob pattern and optionally the search path. Return ONLY valid JSON:
{{"pattern": "...", "path": "..."}}`

If path is not specified, it can be omitted or set to ".".

Examples:
- "查找所有 Python 文件" -> {{"pattern": "**/*.py"}}
- "Find all TypeScript files in src" -> {{"pattern": "**/*.ts", "path": "src"}}
- "列出当前目录的 json 文件" -> {{"pattern": "*.json"}}
- "查找所有的 test 文件" -> {{"pattern": "**/*test*"}}

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
            # Fallback: extract pattern from task
            if ".py" in task or "python" in task.lower():
                return {"pattern": "**/*.py"}
            elif ".ts" in task or "typescript" in task.lower() or "ts" in task:
                return {"pattern": "**/*.ts"}
            elif ".js" in task or "javascript" in task.lower():
                return {"pattern": "**/*.js"}
            else:
                raise ValueError(f"Failed to parse LLM response as JSON: {content}")

    except Exception as e:
        raise ValueError(f"LLM parsing failed: {str(e)}")


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct parameters
    print("Test 1: Direct parameters")
    result = execute({"pattern": "*.md", "path": "."})
    print(json.dumps(result, indent=2, ensure_ascii=False))
