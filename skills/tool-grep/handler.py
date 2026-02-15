"""
Tool Grep - Content search tool with hybrid input mode.

Supports two input modes:
1. Direct parameters: pattern (direct execution, no internal LLM)
2. Task mode: task (natural language, internal LLM parses to parameters)
"""
import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, Any, List

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
    Execute content search - supports both task and direct parameter modes.

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
    file_pattern = params.get("file_pattern")

    if not pattern:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("pattern is required"),
                suggestions=["Provide 'pattern' parameter (e.g., 'import', 'def\\s+\w+')"]
            ).build()
        else:
            return {"success": False, "error": "pattern is required"}

    try:
        base_path = Path(search_path)
        if not base_path.is_absolute():
            base_path = Path.cwd() / base_path

        # Check if search_path is a file or directory
        if base_path.is_file():
            files_to_search = [base_path]
        else:
            # Get files to search (optionally filtered by file_pattern)
            if file_pattern:
                files_to_search = list(base_path.rglob(file_pattern))
            else:
                # Search all text files (common extensions)
                files_to_search = []
                for ext in ['*.py', '*.js', '*.ts', '*.tsx', '*.jsx', '*.java', '*.go', '*.rs', '*.c', '*.cpp', '*.h', '*.css', '*.html', '*.md', '*.txt', '*.json', '*.yaml', '*.yml', '*.toml', '*.ini', '*.cfg', '*.conf']:
                    files_to_search.extend(base_path.rglob(ext))
            # Filter only files
            files_to_search = [f for f in files_to_search if f.is_file()]

        # Compile regex pattern
        try:
            regex = re.compile(pattern)
        except re.error as e:
            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder().set_error(
                    error=ValueError(f"Invalid regex pattern: {e}"),
                    suggestions=["Check if the regex pattern is valid"]
                ).build()
            else:
                return {"success": False, "error": f"Invalid regex pattern: {e}"}

        # Search in files
        matches = []
        for file_path in files_to_search:
            try:
                content = file_path.read_text(encoding="utf-8", errors="ignore")
                for match in regex.finditer(content):
                    # Get line number
                    line_num = content[:match.start()].count('\n') + 1
                    # Get the matched line
                    lines = content.split('\n')
                    line_text = lines[line_num - 1] if line_num <= len(lines) else ""

                    # Get relative path
                    try:
                        rel_path = file_path.relative_to(Path.cwd())
                    except ValueError:
                        rel_path = file_path

                    matches.append({
                        "file": str(rel_path),
                        "line": line_num,
                        "match": match.group(0),
                        "text": line_text.strip()
                    })
            except Exception:
                # Skip files that can't be read
                continue

        # Format results
        if matches:
            result_text = f"Found {len(matches)} matches for pattern '{pattern}':\n\n"
            for m in matches[:50]:  # Limit to first 50 matches
                result_text += f"{m['file']}:{m['line']}: {m['text']}\n"
            if len(matches) > 50:
                result_text += f"\n... and {len(matches) - 50} more matches"
        else:
            result_text = f"No matches found for pattern '{pattern}'"

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
        # Fallback: extract search term from task
        match = re.search(r'["\']?([\w-]+)["\']?', task)
        if match:
            return {"pattern": match.group(1)}
        raise ValueError("LLM client not available for task mode")

    try:
        llm = get_llm_client(skill_name="tool-grep")
    except ValueError:
        # Fallback to regex
        match = re.search(r'["\']?([\w-]+)["\']?', task)
        if match:
            return {"pattern": match.group(1)}
        raise ValueError("LLM client initialization failed")

    prompt = f"""You are a parameter parser for content search operations.

Task: {task}

Extract the search pattern and optionally the path and file_pattern. Return ONLY valid JSON:
{{"pattern": "...", "path": "...", "file_pattern": "..."}}`

The pattern should be a regex pattern. If path and file_pattern are not specified, they can be omitted.

Examples:
- "搜索所有包含 'import' 的 Python 文件" -> {{"pattern": "import", "file_pattern": "*.py"}}
- "Search for 'TODO' in src directory" -> {{"pattern": "TODO", "path": "src"}}
- "查找所有 def 开头的行" -> {{"pattern": "^def\\s+"}}
- "Find function calls in JavaScript files" -> {{"pattern": "\\w+\\(", "file_pattern": "*.js"}}

Return ONLY JSON, no other text, no markdown, no code blocks."""

    try:
        response = llm.generate(prompt, max_tokens=300, temperature=0.1)
        content = response.content.strip()

        # Clean up response - remove markdown code blocks
        if content.startswith("```"):
            content = re.sub(r'^```[a-zA-Z]*\n?', '', content)
            content = re.sub(r'\n?```$', '', content).strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Fallback: extract search term from task
            match = re.search(r'["\']?([\w-]+)["\']?', task)
            if match:
                return {"pattern": match.group(1)}
            raise ValueError(f"Failed to parse LLM response as JSON: {content}")

    except Exception as e:
        raise ValueError(f"LLM parsing failed: {str(e)}")


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct parameters
    print("Test 1: Direct parameters")
    result = execute({"pattern": "def", "file_pattern": "*.py"})
    print(json.dumps(result, indent=2, ensure_ascii=False))
