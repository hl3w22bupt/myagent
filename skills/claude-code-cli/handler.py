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


def copy_files_to_outputs(workspace_artifacts: Dict[str, Any], task_id: str) -> list:
    """
    Copy workspace files to persistent outputs/ directory.

    Returns list of copied file info with output paths.
    """
    import shutil

    copied_files = []

    if not workspace_artifacts.get("exists") or not workspace_artifacts.get("files"):
        return copied_files

    # Create outputs/codes directory
    project_root = os.getcwd()
    outputs_dir = os.path.join(project_root, 'outputs', 'codes')
    os.makedirs(outputs_dir, exist_ok=True)

    for file_info in workspace_artifacts["files"]:
        src_path = file_info["absolute_path"]
        filename = file_info["path"]
        extension = file_info["extension"]

        # Generate output filename: {task_id}_skill_{filename}
        # Use task_id without the full prefix for shorter names
        short_task_id = task_id.split('-')[-1] if '-' in task_id else task_id
        output_filename = f"{task_id}_claude-code-cli_{filename}"
        output_path = os.path.join(outputs_dir, output_filename)

        try:
            shutil.copy2(src_path, output_path)

            # Get file stats
            stat = os.stat(output_path)

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

            copied_files.append({
                "path": f"outputs/codes/{output_filename}",  # Relative path for artifact
                "absolute_path": output_path,
                "type": file_type,
                "file-type": extension.replace(".", "") if extension else "unknown",
                "size": stat.st_size,
                "original_filename": filename
            })

            print(f"[COPY] {filename} -> outputs/codes/{output_filename}")
        except Exception as e:
            print(f"[ERROR] Failed to copy {filename}: {e}")

    return copied_files


def execute_claude_code_cli(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute Claude Code CLI with environment-aware workspace management.

    Supports two workspace modes:
    1. Persistent project directory (when environment.project_dir is provided)
    2. Temporary workspace (default, for backward compatibility)
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

    # ========== Extract parameters ==========
    task = input_data.get('task', '').strip()

    # ========== Extract environment parameters ==========
    environment = input_data.get('environment', {})

    # Workspace related
    project_dir = environment.get('project_dir') or environment.get('workspace')

    # Tech stack related
    # 优先级: 1) environment.language > 2) LLM 推理 > 3) 默认 None（让 Claude CLI 自己决定）
    language = environment.get('language')
    language_inferred = False  # 标记是否为推理值

    if not language:
        # 使用公共 LLMClient 推理最合适的编程语言
        try:
            from core.skill.llm_client import get_llm_client

            # 获取 LLM client（使用 Haiku 快速模型）
            # ⭐ skill_name 使用主 skill 名字，让 trace 聚合在一起
            llm_client = get_llm_client(
                model="claude-haiku-4-20250514",  # 快速且便宜
                task_id=task_id,
                skill_name="claude-code-cli"  # ⭐ 使用主 skill 名字
            )

            # 轻量级 LLM 调用：只推理语言
            response = llm_client.generate(
                prompt=f"""根据以下任务描述，判断最合适的编程语言。

任务：{task}

请只返回语言名称（如：html, python, javascript, java, node, typescript, go, rust 等）。如果无法确定，返回空字符串。

只返回语言名称，不要其他内容。""",
                max_tokens=50,
                temperature=0,
                purpose="language_detection"  # 用于区分不同用途的 LLM 调用
            )

            inferred_language = response.content.strip().lower()
            # 过滤掉无效结果
            valid_languages = {'html', 'python', 'javascript', 'typescript', 'java', 'node', 'go', 'rust', 'c++', 'c', 'php', 'ruby', 'swift', 'kotlin'}
            if inferred_language in valid_languages:
                language = inferred_language
                language_inferred = True
                print(f"[CLAUDE-CODE-CLI] ✓ LLM inferred language: {language} (tokens: {response.usage['input_tokens']} in, {response.usage['output_tokens']} out)")
            else:
                print(f"[CLAUDE-CODE-CLI] LLM returned invalid language: '{inferred_language}', using auto-detect")
                language = None
        except Exception as e:
            print(f"[CLAUDE-CODE-CLI] LLM language inference failed: {e}, using auto-detect")
            language = None

    framework = environment.get('framework')
    runtime = environment.get('runtime')

    # Git related
    git_url = environment.get('git_url')
    branch = environment.get('branch', 'main')
    commit = environment.get('commit')

    # Config related
    database = environment.get('database')
    api_version = environment.get('api_version')

    # Claude CLI related (with fallback to direct parameters for backward compatibility)
    model = (
        input_data.get('model') or                      # Direct parameter (deprecated)
        environment.get('model') or                     # environment.model
        'claude-sonnet-4-5'                             # Default value
    )

    timeout = (
        input_data.get('timeout') or                    # Direct parameter (deprecated)
        environment.get('timeout', 300)                 # environment.timeout or default
    )

    # ========== Log environment parameters ==========
    print(f"[CLAUDE-CODE-CLI] Environment parameters:")
    if project_dir:
        print(f"  project_dir: {project_dir} (PERSISTENT WORKSPACE)")
    else:
        print(f"  project_dir: not specified (using temporary workspace)")
    if language:
        print(f"  language: {language} {'(inferred from task)' if language_inferred else '(from environment)'}")
    else:
        print(f"  language: not specified (Claude CLI will auto-detect)")
    if framework:
        print(f"  framework: {framework}")
    if git_url:
        print(f"  git_url: {git_url}")
    if branch:
        print(f"  branch: {branch}")
    print(f"  model: {model}")
    print(f"  timeout: {timeout}s")

    # ========== Workspace Decision ==========
    if project_dir:
        # Use persistent project directory
        working_dir = os.path.abspath(project_dir)
        is_persistent = True
        print(f"[CLAUDE-CODE-CLI] ✓ Using persistent workspace: {working_dir}")
    else:
        # Check if WorkspaceManager already provided a workspace directory
        if '_workspace_dir' in input_data:
            # Use the workspace directory provided by WorkspaceManager
            working_dir = os.path.abspath(input_data['_workspace_dir'])
            is_persistent = False
            print(f"[CLAUDE-CODE-CLI] ✓ Using workspace from WorkspaceManager: {working_dir}")
        else:
            # Use default tmp-workspace (fallback)
            workspace_root = os.getenv('MOTIA_WORKSPACE_DIR', '/tmp/motia-sandbox')
            workspace_dir = os.path.join(workspace_root, f'tmp-workspace', task_id, 'claude-code-skill')
            working_dir = os.path.abspath(workspace_dir)
            is_persistent = False
            print(f"[CLAUDE-CODE-CLI] ✓ Using temporary workspace: {working_dir}")

    # Create workspace directory
    os.makedirs(working_dir, exist_ok=True)

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

    # ========== Build enhanced task description ==========
    task_parts = [task]

    # Add tech stack context
    if language:
        task_parts.append(f"Language: {language}")
    if framework:
        task_parts.append(f"Framework: {framework}")
    if runtime:
        task_parts.append(f"Runtime: {runtime}")

    # Add git context
    if git_url:
        task_parts.append(f"Git Repository: {git_url}")
    if branch:
        task_parts.append(f"Branch: {branch}")
    if commit:
        task_parts.append(f"Commit: {commit}")

    # Add workspace context
    if is_persistent:
        task_parts.append(f"Working in project directory: {working_dir}")
    else:
        task_parts.append(f"Working in temporary workspace")

    task_parts.append("Create all files in the current directory (do not use absolute paths).")

    task_with_context = "\n".join(task_parts)

    # Validate working directory exists
    work_path = Path(working_dir).expanduser().resolve()
    if not work_path.exists():
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="resource",
                        message=f'Working directory does not exist: {working_dir}',
                        retryable=False,
                        suggestions=[f"Create the directory first: mkdir -p {working_dir}"]
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

        # ========== Result handling based on workspace mode ==========

        if is_persistent:
            # ========== PERSISTENT WORKSPACE MODE ==========
            # Files are in the project directory, don't copy to outputs/
            # Return text type with file list in metadata

            print(f"[PERSISTENT MODE] Files remain in project directory: {working_dir}")

            if exit_code == 0:
                try:
                    output_data = json.loads(stdout) if stdout else {}

                    if OUTPUT_BUILDER_AVAILABLE:
                        builder = OutputBuilder()

                        # Add metadata
                        builder.add_standard_metadata("task", task)
                        builder.add_standard_metadata("model", model)
                        builder.add_standard_metadata("exit_code", exit_code)
                        builder.add_standard_metadata("execution_time", execution_time)
                        builder.add_standard_metadata("working_dir", working_dir)
                        builder.add_standard_metadata("is_persistent", True)

                        # Add environment parameters to metadata
                        builder.add_standard_metadata("environment", {
                            "project_dir": project_dir,
                            "language": language,
                            "framework": framework,
                            "git_url": git_url,
                            "branch": branch,
                            "commit": commit,
                            "database": database,
                            "api_version": api_version
                        })

                        # Add workspace artifacts
                        builder.add_standard_metadata("workspace_artifacts", workspace_artifacts)

                        # Build file list for metadata
                        files_created = [
                            {
                                "path": f["path"],
                                "absolute_path": os.path.join(working_dir, f["path"]),
                                "size": f["size_bytes"],
                                "extension": f["extension"]
                            }
                            for f in workspace_artifacts.get("files", [])
                        ]

                        builder.add_standard_metadata("files_created", files_created)

                        # Build text summary
                        file_list = "\n".join([
                            f"  - {f['path']} ({f['size_bytes']} bytes)"
                            for f in workspace_artifacts.get("files", [])
                        ]) if workspace_artifacts.get("files") else "  (no files created)"

                        summary_text = f"""Generated {len(workspace_artifacts.get('files', []))} file(s) in {working_dir}:

{file_list}

Project directory: {working_dir}
Files remain in the project directory.
"""

                        # Add Claude CLI output if available
                        if isinstance(output_data, dict):
                            if output_data:
                                summary_text += f"\n\nClaude CLI Output:\n{json.dumps(output_data, ensure_ascii=False, indent=2)}"
                        elif stdout.strip():
                            summary_text += f"\n\nClaude CLI Output:\n{stdout}"

                        builder.set_text(summary_text)
                        builder.set_title(f"Generated {len(workspace_artifacts.get('files', []))} file(s)")

                        result = builder.build()
                        write_structured_output(result, session_id)
                        return result
                    else:
                        # Fallback without OutputBuilder
                        file_list = "\n".join([
                            f"  - {f['path']}"
                            for f in workspace_artifacts.get("files", [])
                        ])

                        content = f"""Generated {len(workspace_artifacts.get('files', []))} file(s) in {working_dir}:

{file_list}

"""
                        if stdout.strip():
                            content += f"\n\nClaude CLI Output:\n{stdout}"

                        return {
                            "success": True,
                            "result_type": "text",
                            "content": content,
                            "metadata": {
                                "execution_time": execution_time,
                                "working_dir": working_dir,
                                "is_persistent": True,
                                "files_created": files_created,
                                "environment": {
                                    "project_dir": project_dir,
                                    "language": language,
                                    "framework": framework
                                }
                            }
                        }
                except json.JSONDecodeError:
                    # Not JSON output
                    if OUTPUT_BUILDER_AVAILABLE:
                        builder = OutputBuilder()
                        builder.add_standard_metadata("task", task)
                        builder.add_standard_metadata("working_dir", working_dir)
                        builder.add_standard_metadata("is_persistent", True)

                        file_list = "\n".join([
                            f"  - {f['path']}"
                            for f in workspace_artifacts.get("files", [])
                        ])

                        summary_text = f"""Generated {len(workspace_artifacts.get('files', []))} file(s) in {working_dir}:

{file_list}

"""
                        if stdout.strip():
                            summary_text += f"\n\nClaude CLI Output:\n{stdout}"

                        builder.set_text(summary_text)
                        result = builder.build()
                        write_structured_output(result, session_id)
                        return result
                    else:
                        return {
                            "success": True,
                            "result_type": "text",
                            "content": stdout,
                            "metadata": {
                                "execution_time": execution_time,
                                "working_dir": working_dir,
                                "is_persistent": True
                            }
                        }
        else:
            # ========== TEMPORARY WORKSPACE MODE (Legacy Behavior) ==========
            # Copy files to outputs/codes/ directory
            output_files = copy_files_to_outputs(workspace_artifacts, task_id)
            print(f"[TEMPORARY MODE] Copied {len(output_files)} files to outputs/codes/")

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
