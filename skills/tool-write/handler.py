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


def _infer_file_type(file_path: str) -> tuple:
    """
    根据文件扩展名推断 MIME 类型和 result_type。

    Returns:
        (mime_type, result_type, output_builder_method_name)
    """
    ext = Path(file_path).suffix.lower()

    # 扩展名映射到 (mime_type, result_type)
    type_mapping = {
        # 图片
        '.png': ('image/png', 'image'),
        '.jpg': ('image/jpeg', 'image'),
        '.jpeg': ('image/jpeg', 'image'),
        '.gif': ('image/gif', 'gif'),
        '.svg': ('image/svg+xml', 'image'),
        '.webp': ('image/webp', 'image'),
        '.ico': ('image/x-icon', 'image'),
        '.bmp': ('image/bmp', 'image'),

        # 视频
        '.mp4': ('video/mp4', 'video'),
        '.mov': ('video/quicktime', 'video'),
        '.avi': ('video/x-msvideo', 'video'),
        '.mkv': ('video/x-matroska', 'video'),
        '.webm': ('video/webm', 'video'),
        '.flv': ('video/x-flv', 'video'),

        # 音频
        '.mp3': ('audio/mpeg', 'audio'),
        '.wav': ('audio/wav', 'audio'),
        '.ogg': ('audio/ogg', 'audio'),
        '.flac': ('audio/flac', 'audio'),
        '.aac': ('audio/aac', 'audio'),
        '.m4a': ('audio/mp4', 'audio'),

        # 文档
        '.pdf': ('application/pdf', 'report'),

        # 代码
        '.js': ('text/javascript', 'code'),
        '.jsx': ('text/javascript', 'code'),
        '.ts': ('text/typescript', 'code'),
        '.tsx': ('text/typescript', 'code'),
        '.py': ('text/x-python', 'code'),
        '.java': ('text/x-java-source', 'code'),
        '.c': ('text/x-c', 'code'),
        '.cpp': ('text/x-c++', 'code'),
        '.h': ('text/x-c', 'code'),
        '.hpp': ('text/x-c++', 'code'),
        '.cs': ('text/x-csharp', 'code'),
        '.php': ('text/x-php', 'code'),
        '.rb': ('text/x-ruby', 'code'),
        '.go': ('text/x-go', 'code'),
        '.rs': ('text/x-rust', 'code'),
        '.kt': ('text/x-kotlin', 'code'),
        '.swift': ('text/x-swift', 'code'),
        '.sh': ('text/x-shellscript', 'code'),
        '.bash': ('text/x-shellscript', 'code'),
        '.zsh': ('text/x-shellscript', 'code'),
        '.fish': ('text/x-fish', 'code'),
        '.ps1': ('text/x-powershell', 'code'),
        '.sql': ('text/x-sql', 'code'),
        '.css': ('text/css', 'code'),
        '.scss': ('text/x-scss', 'code'),
        '.less': ('text/x-less', 'code'),
        '.xml': ('text/xml', 'code'),
        '.yaml': ('text/x-yaml', 'code'),
        '.yml': ('text/x-yaml', 'code'),
        '.toml': ('text/x-toml', 'code'),
        '.ini': ('text/x-ini', 'code'),
        '.conf': ('text/x-ini', 'code'),
        '.vim': ('text/x-vim', 'code'),
        '.lua': ('text/x-lua', 'code'),
        '.r': ('text/x-r', 'code'),
        '.m': ('text/x-objective-c', 'code'),
        '.mm': ('text/x-objective-c++', 'code'),
        '.dart': ('text/x-dart', 'code'),
        '.ex': ('text/x-elixir', 'code'),
        '.exs': ('text/x-elixir', 'code'),
        '.erl': ('text/x-erlang', 'code'),
        '.hs': ('text/x-haskell', 'code'),
        '.lhs': ('text/x-literate-haskell', 'code'),
        '.lisp': ('text/x-lisp', 'code'),
        '.lsp': ('text/x-lisp', 'code'),
        '.scm': ('text/x-scheme', 'code'),
        '.scala': ('text/x-scala', 'code'),
        '.kt': ('text/x-kotlin', 'code'),
        '.kts': ('text/x-kotlin', 'code'),
        '.pl': ('text/x-perl', 'code'),
        '.pm': ('text/x-perl', 'code'),
        '.t': ('text/x-perl', 'code'),
        '.vb': ('text/x-vb', 'code'),
        '.vbs': ('text/x-vbscript', 'code'),

        # Markdown
        '.md': ('text/markdown', 'markdown'),
        '.markdown': ('text/markdown', 'markdown'),

        # HTML
        '.html': ('text/html', 'html'),
        '.htm': ('text/html', 'html'),
        '.xhtml': ('application/xhtml+xml', 'html'),

        # JSON
        '.json': ('application/json', 'json'),
        '.jsonc': ('application/json', 'json'),

        # 数据
        '.csv': ('text/csv', 'table'),
        '.tsv': ('text/tab-separated-values', 'table'),

        # 默认文本
    }

    return type_mapping.get(ext, ('text/plain', 'text'))


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """Direct execution with parsed parameters."""
    file_path = params.get("file_path")
    content = params.get("content", "")

    # ⭐ 兼容 dict 格式的 file_path（PTC 生成代码可能传入完整的 file 对象）
    if isinstance(file_path, dict):
        file_path = file_path.get("path") or file_path.get("name", "")
    elif not isinstance(file_path, str):
        file_path = str(file_path)

    # ⭐ Get task workspace from environment variable
    workspace = os.getenv("MOTIA_TASK_WORKSPACE")

    if not file_path:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("file_path is required"),
                suggestions=["Provide 'file_path' parameter"]
            ).build()
        else:
            return {"success": False, "error": "file_path is required"}

    # ⭐ Build full path (handle both absolute and relative paths)
    original_file_path = file_path
    if os.path.isabs(file_path):
        # 绝对路径，直接使用
        full_path = file_path
    elif workspace:
        # 相对路径 + workspace
        full_path = os.path.join(workspace, file_path)
    else:
        # 回退到 current directory
        full_path = file_path

    try:
        # Create parent directories if they don't exist
        Path(full_path).parent.mkdir(parents=True, exist_ok=True)

        # Write content to file
        Path(full_path).write_text(content, encoding="utf-8")

        # 推断文件类型
        mime_type, result_type = _infer_file_type(full_path)[:2]
        file_size = len(content.encode('utf-8'))

        if OUTPUT_BUILDER_AVAILABLE:
            output = OutputBuilder()

            # 根据文件类型使用不同的构建方法
            # 对于代码类文件（code, json, markdown, html），使用 set_code 以便 task-result-handler 正确处理
            if result_type in ('code', 'json', 'markdown', 'html'):
                # 提取语言名称（去掉 text/x- 前缀）
                language = mime_type.replace('text/x-', '').replace('text/', '')
                if result_type == 'markdown':
                    language = 'markdown'
                elif result_type == 'html':
                    language = 'html'
                elif result_type == 'json':
                    language = 'json'
                output.set_code(content, language, Path(full_path).name)
            elif result_type in ('image', 'video', 'audio', 'gif'):
                # 对于媒体文件，使用 set_media
                from core.skill.output_builder import MediaInfo
                media_info = MediaInfo(
                    path=full_path,
                    mime_type=mime_type,
                    size=file_size
                )
                output.set_media(media_info)
            elif result_type == 'report':
                # PDF 等文档
                from core.skill.output_builder import MediaInfo
                media_info = MediaInfo(
                    path=full_path,
                    mime_type=mime_type,
                    size=file_size
                )
                output.set_media(media_info)
                output.set_result_type('report')
            else:
                # 默认文本
                output.set_text(f"Successfully wrote {len(content)} characters to {original_file_path}")

            # ⭐ 添加 output_files 元数据（使用绝对路径）
            output.set_metadata("output_files", [{
                "type": "file",
                "path": full_path,  # ⭐ 绝对路径
                "name": Path(full_path).name,
            }])
            return output.build()
        else:
            return {
                "success": True,
                "result_type": result_type,
                "content": f"Successfully wrote {len(content)} characters to {original_file_path}",
                "output_files": [{
                    "type": "file",
                    "path": full_path,  # ⭐ 绝对路径
                    "name": Path(full_path).name,
                }]
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
