"""
Claude Code CLI Handler

Directly executes Claude Code CLI with stdin input (non-interactive mode).
"""
import os
import sys
import subprocess
import json
from pathlib import Path
from typing import Dict, Any

# Add src to path for shared utilities
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder, ErrorInfo
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


def scan_workspace_artifacts(workspace_dir: str) -> Dict[str, Any]:
    """Scan workspace directory for created artifacts/files."""
    artifacts = {
        "directory": workspace_dir,
        "exists": False,
        "files": [],
        "total_size_bytes": 0,
        "file_count": 0
    }

    try:
        work_path = Path(workspace_dir).expanduser().resolve()
        if not work_path.exists():
            return artifacts

        artifacts["exists"] = True

        # Get all files recursively
        files = []
        total_size = 0

        for file_path in work_path.rglob('*'):
            if file_path.is_file():
                try:
                    stat = file_path.stat()
                    file_info = {
                        "path": str(file_path.relative_to(work_path)),
                        "absolute_path": str(file_path),
                        "size_bytes": stat.st_size,
                        "modified_time": stat.st_mtime,
                        "extension": file_path.suffix or 'no_extension'
                    }
                    files.append(file_info)
                    total_size += stat.st_size
                except Exception:
                    # Skip files that can't be accessed
                    continue

        # Sort files by path
        files.sort(key=lambda x: x["path"])

        artifacts["files"] = files
        artifacts["total_size_bytes"] = total_size
        artifacts["file_count"] = len(files)

        # Group by extension
        extensions = {}
        for f in files:
            ext = f["extension"]
            extensions[ext] = extensions.get(ext, 0) + 1
        artifacts["files_by_extension"] = extensions

    except Exception as e:
        artifacts["error"] = str(e)

    return artifacts


def write_structured_output(result: Dict[str, Any], session_id: str = None) -> None:
    """Write structured output to file."""
    output_dir = '/tmp/motia-sandbox/structured_outputs'
    os.makedirs(output_dir, exist_ok=True)

    sid = session_id or 'unknown'
    output_file = os.path.join(output_dir, f'output_{sid}.json')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[STRUCTURED_OUTPUT] {output_file}")


def execute_claude_code_cli(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute Claude Code CLI with stdin input.

    Workspace constraint: All files created in tmp-workspace/{task_id}/claude-code-skill/
    """
    import time
    start_time = time.time()

    # Get session_id from input metadata for structured output filename
    session_id = input_data.get('metadata', {}).get('sessionId')

    # Get task_id for workspace directory
    task_id = input_data.get('metadata', {}).get('taskId')
    if not task_id:
        # Try to get from environment
        task_id = os.getenv('MOTIA_TASK_ID', 'unknown-task')

    # Extract parameters
    task = input_data.get('task', '').strip()
    model = input_data.get('model', 'claude-sonnet-4-5')
    timeout = input_data.get('timeout', 300)

    # Set up workspace directory: tmp-workspace/{task_id}/claude-code-skill/
    workspace_root = input_data.get('_workspace_dir') or os.getenv('MOTIA_WORKSPACE_DIR', '/tmp/motia-sandbox')
    workspace_dir = os.path.join(workspace_root, f'tmp-workspace', task_id, 'claude-code-skill')

    # Create workspace directory
    os.makedirs(workspace_dir, exist_ok=True)

    # Convert to absolute path to avoid any confusion
    working_dir = os.path.abspath(workspace_dir)

    # Validate task
    if not task:
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation",
                        message="Task parameter is required",
                        retryable=False,
                        suggestions=["Provide 'task' parameter with your coding requirement"]
                    )
                ) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "success": False,
                "error": "Task parameter is required"
            }

    # Update task to include workspace context
    # Tell Claude CLI it's already in the correct working directory
    task_with_context = f"{task}\n\nYou are currently in the working directory where files should be created. Please create all files in the current directory (do not use absolute paths)."

    # Validate working directory exists
    work_path = Path(working_dir).expanduser().resolve()
    if not work_path.exists():
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="resource",
                        message=f'Working directory does not exist: {working_dir}',
                        retryable=False
                    )
                ) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "success": False,
                "error": f'Working directory does not exist: {working_dir}'
            }

    # Build claude command WITHOUT --print flag (it has known hang bugs)
    # Instead, use stdin to provide input - this is the reliable method
    command = "claude"
    args = [
        "--dangerously-skip-permissions",  # CRITICAL: Skip approval prompts in sandbox
        "--output-format", "json",  # Structured JSON output
        "--model", model,
    ]

    # Filter out CLAUDECODE environment variables to avoid nested session detection
    filtered_environ = {
        k: v for k, v in os.environ.items()
        if k != 'CLAUDECODE' and not k.startswith('CLAUDE_')
    }

    # Execute command using stdin input (NOT --print mode which has bugs)
    try:
        proc = subprocess.Popen(
            [command] + args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=filtered_environ,
            cwd=work_path,
            text=True
        )

        # Send task via stdin and close it
        stdout, stderr = proc.communicate(input=task_with_context, timeout=timeout)

        stdout = stdout or ''
        stderr = stderr or ''
        exit_code = proc.returncode

        execution_time = int((time.time() - start_time) * 1000)

        # Scan workspace directory for created artifacts
        workspace_artifacts = scan_workspace_artifacts(working_dir)

        # Log for debugging
        if workspace_artifacts["exists"]:
            print(f"[WORKSPACE] Directory: {workspace_artifacts['directory']}")
            print(f"[WORKSPACE] Files created: {workspace_artifacts['file_count']}")
            print(f"[WORKSPACE] Total size: {workspace_artifacts['total_size_bytes']} bytes")
            for file_info in workspace_artifacts["files"]:
                print(f"[WORKSPACE]   - {file_info['path']} ({file_info['size_bytes']} bytes)")
        else:
            print(f"[WORKSPACE] Directory does not exist: {workspace_artifacts['directory']}")

        # Convert workspace_artifacts to output_files format for task-result-handler
        output_files = []
        if workspace_artifacts["exists"] and workspace_artifacts["files"]:
            for file_info in workspace_artifacts["files"]:
                # Determine file type from extension
                ext = file_info["extension"]
                type_map = {
                    ".py": "code",
                    ".js": "code",
                    ".ts": "code",
                    ".tsx": "code",
                    ".jsx": "code",
                    ".java": "code",
                    ".cpp": "code",
                    ".c": "code",
                    ".go": "code",
                    ".rs": "code",
                    ".rb": "code",
                    ".php": "code",
                    ".html": "html",
                    ".css": "code",
                    ".json": "json",
                    ".md": "markdown",
                    ".txt": "text",
                }
                file_type = type_map.get(ext, "file")

                output_files.append({
                    "path": file_info["absolute_path"],
                    "type": file_type,
                    "file-type": ext.replace(".", ""),
                    "size": file_info["size_bytes"]
                })

        # Check if command succeeded
        if exit_code == 0:
            # Try to parse JSON output
            try:
                output_data = json.loads(stdout)

                if OUTPUT_BUILDER_AVAILABLE:
                    builder = OutputBuilder()

                    # Add metadata
                    builder.add_standard_metadata("task", task)
                    builder.add_standard_metadata("model", model)
                    builder.add_standard_metadata("exit_code", exit_code)
                    builder.add_standard_metadata("execution_time", execution_time)
                    builder.add_standard_metadata("working_dir", working_dir)
                    builder.add_standard_metadata("workspace_artifacts", workspace_artifacts)

                    # If workspace has files, use text type with output_files
                    # task-result-handler only processes output_files when result_type === 'text'
                    if output_files:
                        # Build text content with Claude CLI output
                        if isinstance(output_data, dict):
                            text_content = json.dumps(output_data, ensure_ascii=False, indent=2)
                        elif isinstance(output_data, str):
                            text_content = output_data
                        else:
                            text_content = str(output_data)

                        builder.set_text(text_content)
                        builder.set_title(f"Generated {len(output_files)} file(s)")

                        result = builder.build()
                        # Add output_files at top level for task-result-handler
                        result['output_files'] = output_files
                        write_structured_output(result, session_id)
                        return result

                    # Set content based on output format (no files case)
                    if isinstance(output_data, dict):
                        # Claude Code CLI JSON output - extract code if present
                        # Check if it's a code result
                        if 'code' in output_data:
                            builder.set_code(
                                code=output_data.get('code', str(output_data)),
                                language=output_data.get('language', 'python'),
                                filename=output_data.get('filename', 'output.py')
                            )
                        else:
                            # General JSON output
                            builder.set_json(output_data)

                        builder.set_title("Generated by claude-code-cli")
                    else:
                        builder.set_text(str(output_data))

                    # Set content based on output format
                    if isinstance(output_data, dict):
                        # Claude Code CLI JSON output - extract code if present
                        # Check if it's a code result
                        if 'code' in output_data:
                            builder.set_code(
                                code=output_data.get('code', str(output_data)),
                                language=output_data.get('language', 'python'),
                                filename=output_data.get('filename', 'output.py')
                            )
                        else:
                            # General JSON output
                            builder.set_json(output_data)

                        builder.set_title("Generated by claude-code-cli")
                    else:
                        builder.set_text(str(output_data))

                    result = builder.build()
                    write_structured_output(result, session_id)
                    return result
                else:
                    # If workspace has files, use text type with output_files
                    if output_files:
                        if isinstance(output_data, dict):
                            content = json.dumps(output_data, ensure_ascii=False, indent=2)
                        else:
                            content = str(output_data)

                        result_data = {
                            "success": True,
                            "result_type": "text",
                            "content": content,
                            "metadata": {
                                "execution_time": execution_time,
                                "exit_code": exit_code,
                                "working_dir": working_dir,
                                "workspace_artifacts": workspace_artifacts
                            },
                            "output_files": output_files
                        }
                        return result_data

                    # No files case
                    result_data = {
                        "success": True,
                        "result_type": "code",
                        "content": output_data,
                        "metadata": {
                            "execution_time": execution_time,
                            "exit_code": exit_code,
                            "working_dir": working_dir,
                            "workspace_artifacts": workspace_artifacts
                        }
                    }
                    return result_data
            except json.JSONDecodeError:
                # Not JSON, return as text
                if OUTPUT_BUILDER_AVAILABLE:
                    builder = OutputBuilder()
                    builder.add_standard_metadata("task", task)
                    builder.add_standard_metadata("model", model)
                    builder.add_standard_metadata("exit_code", exit_code)
                    builder.add_standard_metadata("execution_time", execution_time)
                    builder.add_standard_metadata("working_dir", working_dir)
                    builder.add_standard_metadata("workspace_artifacts", workspace_artifacts)

                    # If workspace has files, add output_files and use text type
                    if output_files:
                        builder.set_text(stdout)
                        result = builder.build()
                        result['output_files'] = output_files
                        write_structured_output(result, session_id)
                        return result

                    builder.set_text(stdout)

                    result = builder.build()
                    write_structured_output(result, session_id)
                    return result
                else:
                    result_data = {
                        "success": True,
                        "result_type": "text",
                        "content": stdout,
                        "metadata": {
                            "execution_time": execution_time,
                            "exit_code": exit_code,
                            "working_dir": working_dir,
                            "workspace_artifacts": workspace_artifacts
                        }
                    }
                    if output_files:
                        result_data["metadata"]["output_files"] = output_files
                    return result_data
        else:
            # Command failed
            error_message = stderr or stdout or "Command failed with no output"

            if OUTPUT_BUILDER_AVAILABLE:
                result = OutputBuilder() \
                    .set_error(
                        error=ErrorInfo(
                            type="execution",
                            message=f"Claude CLI execution failed: {error_message}",
                            retryable=True,
                            details=f"Exit code: {exit_code}"
                        )
                    ) \
                    .add_standard_metadata("task", task) \
                    .add_standard_metadata("model", model) \
                    .add_standard_metadata("exit_code", exit_code) \
                    .add_standard_metadata("execution_time", execution_time) \
                    .add_standard_metadata("working_dir", working_dir) \
                    .add_standard_metadata("workspace_artifacts", workspace_artifacts) \
                    .build()
                write_structured_output(result, session_id)
                return result
            else:
                return {
                    "success": False,
                    "error": error_message,
                    "metadata": {
                        "exit_code": exit_code,
                        "execution_time": execution_time,
                        "working_dir": working_dir,
                        "workspace_artifacts": workspace_artifacts
                    }
                }

    except subprocess.TimeoutExpired:
        # Kill the process on timeout
        proc.kill()
        stdout, stderr = proc.communicate()  # Get any remaining output
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="timeout",
                        message=f"Claude CLI execution timed out after {timeout} seconds",
                        retryable=True,
                        suggestions=[
                            "Try breaking down the task into smaller parts",
                            "Increase timeout parameter",
                            "Check if the task is too complex"
                        ]
                    )
                ) \
                .add_standard_metadata("task", task) \
                .add_standard_metadata("model", model) \
                .add_standard_metadata("working_dir", working_dir) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "success": False,
                "error": f"Execution timed out after {timeout} seconds"
            }

    except FileNotFoundError:
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="dependency",
                        message="Claude CLI not found. Please install Claude Code CLI.",
                        retryable=False,
                        suggestions=[
                            "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code",
                            "Check if 'claude' command is in PATH"
                        ]
                    )
                ) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "success": False,
                "error": "Claude CLI not found. Please install Claude Code CLI."
            }

    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="unknown",
                        message=f"Unexpected error: {str(e)}",
                        retryable=False
                    )
                ) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "success": False,
                "error": str(e)
            }
