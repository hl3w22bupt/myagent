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

    # ⭐ 兼容 dict 格式的 file_path（PTC 生成代码可能传入完整的 file 对象）
    if isinstance(file_path, dict):
        file_path = file_path.get("path") or file_path.get("name", "")
    elif not isinstance(file_path, str):
        file_path = str(file_path)

    # ⭐ Get task workspace from environment variable
    workspace = os.getenv("MOTIA_TASK_WORKSPACE")
    if workspace:
        workspace = os.path.expanduser(workspace)

    if not file_path:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("file_path is required"),
                suggestions=["Provide 'file_path' parameter"]
            ).build()
        else:
            return {"success": False, "error": "file_path is required"}

    # ⭐ Build full path (handle both absolute and relative paths)
    if os.path.isabs(file_path):
        # 绝对路径，直接使用
        full_path = file_path
    elif workspace:
        # 相对路径 + workspace
        full_path = os.path.join(workspace, file_path)
    else:
        # 回退到当前目录
        full_path = file_path

    # ⭐ Expand tilde (~) to home directory
    # Python's Path/os.path.join do NOT expand ~
    full_path = os.path.expanduser(full_path)

    try:
        content = Path(full_path).read_text(encoding=encoding)

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
                error=FileNotFoundError(f"File not found: {full_path}"),
                suggestions=[
                    f"Check if the file exists: {full_path}",
                    f"Workspace: {workspace or 'not set'}",
                    f"Original path: {file_path}"
                ]
            ).build()
        else:
            return {
                "success": False,
                "error": f"File not found: {full_path}",
                "workspace": workspace,
                "original_path": file_path
            }
    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(e).build()
        else:
            return {"success": False, "error": str(e)}


def _extract_file_path_regex(task: str) -> str | None:
    """
    Extract file path from task using regex patterns.

    Tries multiple patterns to handle different task formats:
    1. Quoted paths: "file" or 'file'
    2. Relative paths: ./path, ../path
    3. Absolute paths: /path/to/file
    4. File paths with extensions: package.json, src/main.py, .env
    5. Simple filenames without extensions: README, Makefile

    Returns:
        File path if found, None otherwise
    """
    # Common English verbs to skip in file path matching
    common_verbs = {'read', 'show', 'view', 'get', 'open', 'load', 'check', 'cat', 'display', 'list', 'print', 'write', 'create', 'show', 'me', 'the', 'of', 'contents'}

    # Pattern 1: Match paths in quotes
    quote_match = re.search(r'["\']([\w./\\-]+)["\']', task, re.ASCII)
    if quote_match:
        return quote_match.group(1)

    # Pattern 2: Match relative paths (starting with ./ or ../)
    # This must come before absolute paths to avoid matching ./path as /path
    rel_match = re.search(r'((?:\.\./|./)[\w./\\-]*)', task, re.ASCII)
    if rel_match:
        return rel_match.group(1)

    # Pattern 3: Match absolute paths (starting with /)
    # But only if they're long enough (avoid matching single words like "file /path")
    abs_match = re.search(r'(/[a-zA-Z0-9_./\\-]+)', task, re.ASCII)
    if abs_match:
        return abs_match.group(1)

    # Pattern 4: Match file paths with extensions (like package.json, src/main.py, .env, .gitignore)
    # This pattern matches: word.word, word/word.word, .word
    ext_match = re.search(r'([\w/\\\-]*\.[a-zA-Z0-9]+)', task, re.ASCII)
    if ext_match:
        path = ext_match.group(1)
        # Skip if it's a common verb or short word
        if path.lower() not in common_verbs and len(path) > 3:
            return path

    # Pattern 5: Match simple filenames without extensions (like README, Makefile)
    # Only match all-caps or specific patterns
    simple_match = re.search(r'\b([A-Z][A-Z0-9_]+|Makefile|Gemfile|Rakefile)\b', task, re.ASCII)
    if simple_match:
        return simple_match.group(1)

    return None


def _call_llm_for_params(task: str) -> Dict[str, Any]:
    """
    Use internal LLM to parse task into parameters.

    Only called when in task mode (no direct parameters provided).

    Priority:
    1. Try to use LLM to extract file path
    2. If LLM fails, use regex fallback
    """
    # Try to use LLM first
    try:
        llm = get_llm_client(skill_name="tool-read")
    except ValueError:
        # LLM not available, use regex fallback
        file_path = _extract_file_path_regex(task)
        if file_path:
            return {"file_path": file_path}
        raise ValueError("LLM client not available and couldn't parse file path from task")

    # LLM is available, use it to parse the task
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
        except json.JSONDecodeError as je:
            # Fallback: try to extract file path from task using regex
            file_path = _extract_file_path_regex(task)
            if file_path:
                return {"file_path": file_path}
            raise ValueError(f"Failed to parse LLM response as JSON: {content}. Error: {je}")

    except Exception as e:
        # Fallback: extract file path from task using regex
        file_path = _extract_file_path_regex(task)
        if file_path:
            return {"file_path": file_path}
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
