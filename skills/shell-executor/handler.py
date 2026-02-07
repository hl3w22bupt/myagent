"""
Shell Command Executor Handler

Main handler for executing shell commands safely with intelligent output parsing.
"""

import os
import sys
from pathlib import Path
from typing import Dict, Any

# Add parent lib for OutputBuilder
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

try:
    from output_builder import OutputBuilder, ErrorInfo
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

# Add local lib
local_lib = Path(__file__).parent / "lib"
sys.path.insert(0, str(local_lib))

from command_executor import CommandExecutor


def execute_shell_command(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute shell command with intelligent output parsing.

    Args:
        input_data: Dictionary containing:
            - command: Command to execute (required)
            - args: Command arguments (optional)
            - env: Environment variables (optional)
            - working_dir: Working directory (optional)
            - timeout: Timeout in seconds (default: 30)
            - output_format: Output parsing format (default: auto)
            - parse_options: Options for parser (optional)

    Returns:
        Dictionary with execution results in unified format
    """
    # Extract parameters
    command = input_data.get('command', '').strip()
    args = input_data.get('args', [])
    env = input_data.get('env')
    working_dir = input_data.get('working_dir')
    timeout = input_data.get('timeout', 30)
    output_format = input_data.get('output_format', 'auto')
    parse_options = input_data.get('parse_options')

    # Validate command
    if not command:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation",
                        message="Command is required",
                        retryable=False,
                        suggestions=[
                            "Provide 'command' parameter",
                            "Example: command='ls', args=['-la']"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": "Command is required",
                "suggestions": ["Provide 'command' parameter"]
            }

    # Validate timeout
    if timeout <= 0 or timeout > 300:  # Max 5 minutes
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation",
                        message=f"Invalid timeout: {timeout}. Must be between 1 and 300 seconds",
                        retryable=False
                    )
                ) \
                .build()
        else:
            return {
                "error": f"Invalid timeout: {timeout}",
                "suggestions": ["Timeout must be between 1 and 300 seconds"]
            }

    # Create executor
    executor = CommandExecutor()

    # Build full command string for display
    full_command = command
    if args:
        full_command += ' ' + ' '.join(args)

    # Execute command
    try:
        result = executor.execute(
            command=command,
            args=args,
            env=env,
            working_dir=working_dir,
            timeout=timeout,
            output_format=output_format,
            parse_options=parse_options
        )

        # Handle errors
        if not result.get('success'):
            error_type = result.get('error', 'execution')
            error_message = result.get('message', f'Command failed with exit code {result.get("exit_code", -1)}')
            suggestions = result.get('suggestions')

            if OUTPUT_BUILDER_AVAILABLE:
                error_details = result.get('stderr', '')
                if error_details:
                    error_details = f"STDERR:\n{error_details}"

                return OutputBuilder() \
                    .set_error(
                        error=ErrorInfo(
                            type=error_type,
                            message=error_message,
                            details=error_details or None,
                            retryable=error_type in ['timeout', 'network', 'execution'],
                            suggestions=suggestions or [
                                "Check command syntax",
                                "Verify all parameters are correct",
                                "Review error details above"
                            ]
                        )
                    ) \
                    .add_standard_metadata("command", full_command) \
                    .add_standard_metadata("exit_code", result.get('exit_code', -1)) \
                    .add_standard_metadata("execution_time", result.get('execution_time', 0)) \
                    .build()
            else:
                return {
                    "error": error_message,
                    "error_type": error_type,
                    "exit_code": result.get('exit_code'),
                    "stderr": result.get('stderr')
                }

        # Handle success
        parsed = result.get('parsed_output', {})
        parsed_type = parsed.get('type', 'raw')

        if OUTPUT_BUILDER_AVAILABLE:
            # Build output based on parsed type
            if parsed_type == 'table':
                # Table output
                headers = parsed.get('headers', [])
                rows = parsed.get('rows', [])

                # Create title
                title = f"Command Output ({len(rows)} rows)"
                if result.get('truncated'):
                    title += " [truncated]"

                return OutputBuilder() \
                    .set_result_type("table") \
                    .set_table(
                        headers=headers,
                        rows=rows,
                        title=title,
                        sortable=True
                    ) \
                    .add_standard_metadata("command", full_command) \
                    .add_standard_metadata("exit_code", result.get('exit_code', 0)) \
                    .add_standard_metadata("stdout_lines", result.get('stdout_lines', 0)) \
                    .add_standard_metadata("stderr_lines", result.get('stderr_lines', 0)) \
                    .add_standard_metadata("output_size", result.get('output_size', 0)) \
                    .add_standard_metadata("truncated", result.get('truncated', False)) \
                    .build()

            elif parsed_type == 'json':
                # JSON output
                return OutputBuilder() \
                    .set_result_type("json") \
                    .set_json(parsed.get('content', {})) \
                    .add_standard_metadata("command", full_command) \
                    .add_standard_metadata("exit_code", result.get('exit_code', 0)) \
                    .add_standard_metadata("output_size", result.get('output_size', 0)) \
                    .build()

            elif parsed_type == 'kv':
                # Key-value output - convert to table
                kv_data = parsed.get('content', {})
                headers = ['Key', 'Value']
                rows = [[k, v] for k, v in kv_data.items()]

                return OutputBuilder() \
                    .set_result_type("table") \
                    .set_table(
                        headers=headers,
                        rows=rows,
                        title="Key-Value Pairs",
                        sortable=True
                    ) \
                    .add_standard_metadata("command", full_command) \
                    .add_standard_metadata("exit_code", result.get('exit_code', 0)) \
                    .build()

            else:
                # Raw text output
                stdout = result.get('stdout', '')

                # Add stderr to output if present
                stderr = result.get('stderr', '')
                if stderr:
                    stdout += f"\n[STDERR]\n{stderr}"

                return OutputBuilder() \
                    .set_result_type("text") \
                    .set_text(stdout) \
                    .add_standard_metadata("command", full_command) \
                    .add_standard_metadata("exit_code", result.get('exit_code', 0)) \
                    .add_standard_metadata("stdout_lines", result.get('stdout_lines', 0)) \
                    .add_standard_metadata("stderr_lines", result.get('stderr_lines', 0)) \
                    .build()

        else:
            # Fallback without OutputBuilder
            return {
                "success": True,
                "command": full_command,
                "exit_code": result.get('exit_code', 0),
                "stdout": result.get('stdout', ''),
                "stderr": result.get('stderr', ''),
                "parsed_output": parsed
            }

    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check command syntax",
                        "Verify all parameters are valid",
                        "Review stack trace for details"
                    ]
                ) \
                .build()
        else:
            return {
                "error": str(e),
                "error_type": "unknown"
            }


# For testing
if __name__ == "__main__":
    import json

    print("Testing shell-executor...")

    # Test 1: Simple ls command
    print("\n=== Test 1: ls command ===")
    result = execute_shell_command({
        "command": "ls",
        "args": ["-la", "/tmp"],
        "output_format": "table"
    })
    print(json.dumps(result, indent=2))

    # Test 2: Echo command
    print("\n=== Test 2: echo command ===")
    result = execute_shell_command({
        "command": "echo",
        "args": ["Hello, World!"]
    })
    print(json.dumps(result, indent=2))

    # Test 3: Error case - command not in whitelist
    print("\n=== Test 3: Invalid command ===")
    result = execute_shell_command({
        "command": "rm",
        "args": ["-rf", "/tmp/test"]
    })
    print(json.dumps(result, indent=2))

    print("\nTests completed!")
