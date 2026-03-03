"""
Tool Edit - File editing tool with hybrid input mode.

Supports two input modes:
1. Direct parameters: file_path + old_string + new_string (direct execution)
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
    Execute file edit - supports both task and direct parameter modes.

    Priority:
    1. Direct parameters (file_path + old_string + new_string) - direct execution
    2. Task mode - internal LLM parses to parameters
    """
    # Mode 1: Direct parameters (priority)
    if all(k in input_data for k in ["file_path", "old_string", "new_string"]):
        return _execute_direct(input_data)

    # Mode 2: Task mode
    task = input_data.get("task")
    if task:
        params = _call_llm_for_params(task)
        return _execute_direct(params)

    # Neither mode provided
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder().set_error(
            error=ValueError("Either 'task' or all 'file_path', 'old_string', 'new_string' parameters are required"),
            suggestions=["Provide 'file_path', 'old_string', 'new_string' for direct execution or 'task' for natural language"]
        ).build()
    else:
        return {
            "success": False,
            "error": "Either 'task' or all 'file_path', 'old_string', 'new_string' parameters are required"
        }


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """Direct execution with parsed parameters."""
    file_path = params.get("file_path")
    old_string = params.get("old_string")
    new_string = params.get("new_string")

    # Get workspace directory
    workspace_dir = params.get("_workspace_dir") or os.getenv("MOTIA_WORKSPACE_DIR")

    if not all([file_path, old_string]):
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("file_path and old_string are required"),
                suggestions=["Provide 'file_path' and 'old_string' parameters"]
            ).build()
        else:
            return {"success": False, "error": "file_path and old_string are required"}

    # Use workspace for relative paths
    if workspace_dir and not os.path.isabs(file_path):
        file_path = os.path.join(workspace_dir, file_path)

    try:
        # Read file content
        path = Path(file_path)
        if not path.exists():
            # If file not found in current skill workspace, search in task-level workspace
            # This supports multi-skill workflows where upstream skills create files
            if workspace_dir:
                # Get task-level workspace (one level up from skill workspace)
                task_workspace = os.path.dirname(workspace_dir)
                if os.path.exists(task_workspace):
                    # Search in all skill subdirectories
                    found = False
                    for skill_dir in os.listdir(task_workspace):
                        skill_path = os.path.join(task_workspace, skill_dir)
                        if os.path.isdir(skill_path):
                            search_path = os.path.join(skill_path, os.path.basename(file_path))
                            if os.path.exists(search_path):
                                file_path = search_path
                                path = Path(file_path)
                                found = True
                                break

                    if not found:
                        raise FileNotFoundError(f"File not found: {file_path} (searched in {task_workspace})")
            else:
                raise FileNotFoundError(f"File not found: {file_path}")

        content = path.read_text(encoding="utf-8")

        # Check if old_string exists
        if old_string not in content:
            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder().set_error(
                    error=ValueError(f"Old string not found in file: {file_path}"),
                    suggestions=[f"Check if the old string exactly exists in {file_path}"]
                ).build()
            else:
                return {"success": False, "error": f"Old string not found in file: {file_path}"}

        # Replace old_string with new_string
        new_content = content.replace(old_string, new_string, 1)  # Replace only first occurrence

        # Write back
        path.write_text(new_content, encoding="utf-8")

        if OUTPUT_BUILDER_AVAILABLE:
            output = OutputBuilder() \
                .set_text(f"Successfully edited {file_path}: replaced 1 occurrence")
            # Add output_files metadata for tracking (use set_metadata to avoid x- prefix)
            output.set_metadata("output_files", [file_path])
            return output.build()
        else:
            return {
                "success": True,
                "result_type": "text",
                "content": f"Successfully edited {file_path}: replaced 1 occurrence",
                "output_files": [file_path]
            }
    except FileNotFoundError as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(e).build()
        else:
            return {"success": False, "error": str(e)}
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
        llm = get_llm_client(skill_name="tool-edit")
    except ValueError:
        raise ValueError("LLM client initialization failed")

    json_example = '{"file_path": "...", "old_string": "...", "new_string": "..."}'
    prompt = f"""You are a parameter parser for file editing operations.

Task: {task}

Extract the file_path, old_string, and new_string from the task. Return ONLY valid JSON in this format: {json_example}

The old_string must be an EXACT match from the file, including spacing and case.

Examples:
- "Replace 'Hello' with 'Hi' in greeting.txt" -> file_path=greeting.txt, old_string=Hello, new_string=Hi
- "把 config.json 中的 debug: false 改成 debug: true" -> file_path=config.json, old_string=debug: false, new_string=debug: true

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
            raise ValueError(f"Failed to parse LLM response as JSON: {content}")

    except Exception as e:
        raise ValueError(f"LLM parsing failed: {str(e)}")


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct parameters
    print("Test 1: Direct parameters")
    result = execute({
        "file_path": "/tmp/test-tool-edit.txt",
        "old_string": "Hello",
        "new_string": "Hi"
    })
    print(json.dumps(result, indent=2, ensure_ascii=False))
