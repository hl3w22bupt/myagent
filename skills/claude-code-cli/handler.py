"""
Claude Code CLI Handler

Directly executes Claude Code CLI with --print flag for non-interactive output.
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
    Execute Claude Code CLI with --print flag.

    This ensures non-interactive execution and prevents timeouts.
    """
    import time
    start_time = time.time()

    # Get session_id from input metadata
    session_id = input_data.get('metadata', {}).get('sessionId')

    # Extract parameters
    task = input_data.get('task', '').strip()
    model = input_data.get('model', 'claude-sonnet-4-5')
    timeout = input_data.get('timeout', 300)
    working_dir = input_data.get('working_dir', '/tmp')

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

    # Use workspace as default working directory
    workspace_dir = input_data.get('_workspace_dir') or os.getenv('MOTIA_WORKSPACE_DIR')
    if workspace_dir and not working_dir:
        os.makedirs(workspace_dir, exist_ok=True)
        working_dir = workspace_dir

    # Validate working directory
    if working_dir:
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
    else:
        work_path = None

    # Build claude command with --print flag (CRITICAL: prevents interactive mode)
    # Use --output-format json for structured output
    command = "claude"
    args = [
        "--print",  # CRITICAL: Non-interactive mode
        "--dangerously-skip-permissions",  # CRITICAL: Skip approval prompts in sandbox
        "--output-format", "json",  # Structured JSON output
        "--model", model,
        task  # Task as positional argument
    ]

    # Filter out CLAUDECODE environment variables to avoid nested session detection
    filtered_environ = {
        k: v for k, v in os.environ.items()
        if k != 'CLAUDECODE' and not k.startswith('CLAUDE_')
    }

    # Execute command
    try:
        result = subprocess.run(
            [command] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=filtered_environ,
            cwd=work_path,
            timeout=timeout,
            text=True
        )

        stdout = result.stdout or ''
        stderr = result.stderr or ''
        exit_code = result.returncode

        execution_time = int((time.time() - start_time) * 1000)

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

                    # Set content based on output format
                    if isinstance(output_data, dict):
                        # Claude Code CLI JSON output
                        builder.set_result(
                            result_type="code",
                            content=output_data,
                            title="Generated by claude-code-cli"
                        )
                    else:
                        builder.set_text(str(output_data))

                    result = builder.build()
                    write_structured_output(result, session_id)
                    return result
                else:
                    return {
                        "success": True,
                        "result_type": "code",
                        "content": output_data,
                        "metadata": {
                            "execution_time": execution_time,
                            "exit_code": exit_code,
                            "command": f"{command} {' '.join(args)}"
                        }
                    }
            except json.JSONDecodeError:
                # Not JSON, return as text
                if OUTPUT_BUILDER_AVAILABLE:
                    builder = OutputBuilder()
                    builder.add_standard_metadata("task", task)
                    builder.add_standard_metadata("model", model)
                    builder.add_standard_metadata("exit_code", exit_code)
                    builder.add_standard_metadata("execution_time", execution_time)
                    builder.set_text(stdout)

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
                            "exit_code": exit_code
                        }
                    }
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
                    .build()
                write_structured_output(result, session_id)
                return result
            else:
                return {
                    "success": False,
                    "error": error_message,
                    "metadata": {
                        "exit_code": exit_code,
                        "execution_time": execution_time
                    }
                }

    except subprocess.TimeoutExpired:
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
