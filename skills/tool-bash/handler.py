"""
Shell Command Executor Handler with LLM-based command generation.

Main handler for executing shell commands safely with intelligent output parsing.
User provides a task description, LLM generates the appropriate shell command.
"""
import os
import sys
from pathlib import Path
from typing import Dict, Any
import json
import re

# Add src to path for shared utilities (src must be in path for 'from core.skill' to work)
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder, ErrorInfo
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

try:
    from core.skill.llm_client import LLMClient, get_llm_client
    LLM_CLIENT_AVAILABLE = True
except ImportError:
    LLM_CLIENT_AVAILABLE = False


def write_structured_output(result: Dict[str, Any], session_id: str = None) -> None:
    """
    Write structured output to file and print marker for sandbox to detect.

    Args:
        result: The result dict from OutputBuilder
        session_id: Session ID for filename
    """
    import json

    # Create structured output directory
    output_dir = '/tmp/motia-sandbox/structured_outputs'
    os.makedirs(output_dir, exist_ok=True)

    # Use session_id or fallback to 'unknown'
    sid = session_id or 'unknown'
    output_file = os.path.join(output_dir, f'output_{sid}.json')

    # Write structured output to file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # Print marker (only this goes to stdout for sandbox detection)
    print(f"[STRUCTURED_OUTPUT] {output_file}")


def call_llm_for_command(task: str) -> Dict[str, Any]:
    """
    Call LLM to generate shell command from task description.

    Args:
        task: Natural language task description

    Returns:
        Dict with command, args, reasoning
    """
    from core.skill.llm_client import get_llm_client

    try:
        llm = get_llm_client(skill_name="tool-bash")
    except ValueError as e:
        return {
            "error": str(e),
            "command": None,
            "args": []
        }

    prompt = """You are a shell command generator. Generate the appropriate shell command for the given task.

Task: """ + task + """

Requirements:
- Analyze the task and determine the best shell command
- Common commands: ls, find, grep, cat, head, tail, wc, cd, pwd, mkdir, cp, mv, echo, date
- Return ONLY the command name (e.g., 'ls', 'find'), not a full command string
- For find/search operations, prefer find over ls + grep
- Args should be returned as a JSON array of strings

Return format (JSON only, no other text):
{"command": "command_name", "args": ["arg1", "arg2"], "reasoning": "Brief explanation of why this command was chosen"}

Examples:
- Task: "列出 /tmp 目录的文件" -> {"command": "ls", "args": ["/tmp"]}
- Task: "查找当前目录下所有 .py 文件" -> {"command": "find", "args": [".", "-name", "*.py"]}
- Task: "查看 package.json 的内容" -> {"command": "cat", "args": ["package.json"]}
- Task: "列出当前目录文件" -> {"command": "ls", "args": []}

Generate the command now. Return ONLY valid JSON, no markdown, no code blocks."""

    try:
        response = llm.generate(
            prompt=prompt,
            max_tokens=500,
            temperature=0.3
        )

        content = response.content

        # Clean up response - remove markdown code blocks
        content = content.strip()
        if content.startswith("```"):
            # Remove code block markers
            content = re.sub(r'^```[a-zA-Z]*\n?', '', content)
            content = re.sub(r'\n?```$', '', content)
            content = content.strip()

        # Try to parse JSON
        try:
            llm_response = json.loads(content)
            command = llm_response.get("command")
            args = llm_response.get("args", [])
            reasoning = llm_response.get("reasoning", "Command generated from task description")

            if not command:
                return {
                    "error": f"LLM did not return a command. Response: {content}",
                    "command": None,
                    "args": []
                }

            return {
                "command": command,
                "args": args if isinstance(args, list) else [args] if args else [],
                "reasoning": reasoning,
                "raw_response": content
            }
        except json.JSONDecodeError:
            # Try to extract JSON from response
            json_match = re.search(r'\{[^}]*\}', content)
            if json_match:
                try:
                    llm_response = json.loads(json_match.group(0))
                    command = llm_response.get("command")
                    args = llm_response.get("args", [])
                    reasoning = llm_response.get("reasoning", "Command generated from task description")

                    if command:
                        return {
                            "command": command,
                            "args": args if isinstance(args, list) else [args] if args else [],
                            "reasoning": reasoning,
                            "raw_response": content
                        }
                except json.JSONDecodeError:
                    pass

            return {
                "error": f"Failed to parse LLM response as JSON. Response: {content}",
                "command": None,
                "args": []
            }

    except Exception as e:
        return {
            "error": f"LLM API error: {str(e)}",
            "command": None,
            "args": []
        }


def execute_shell_command(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute shell command with intelligent LLM-based command generation.
    User provides a task description, LLM generates the appropriate shell command.
    Returns raw text output and execution metadata.
    """
    start_time = os.times()[4]

    # Get session_id from input metadata for structured output filename
    session_id = input_data.get('metadata', {}).get('sessionId')

    # Extract parameters
    task = input_data.get('task', '').strip()
    env = input_data.get('env')
    working_dir = input_data.get('working_dir')
    timeout = input_data.get('timeout', 30)

    # Check if direct command/args are provided (backward compatibility)
    direct_command = input_data.get('command')
    direct_args = input_data.get('args')

    # Validate task
    if not task and not direct_command:
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation",
                        message="Task or command is required",
                        retryable=False,
                        suggestions=[
                            "Provide 'task' parameter with your requirement",
                            "Provide 'command' parameter for direct execution",
                            "Example: task='List files in /tmp directory'"
                        ]
                    )
                ) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "error": "Task or command is required",
                "suggestions": ["Provide 'task' or 'command' parameter"]
            }

    # If direct command is provided, use it
    if direct_command:
        command = direct_command
        args = direct_args if isinstance(direct_args, list) else []
        reasoning = "Direct command execution"

        # Handle case where direct_command is a full command string (e.g., "ls -lh file.txt")
        # We need to split it into command and args
        if not args and ' ' in command:
            # Use shlex to properly split the command (handles quoted strings)
            import shlex
            try:
                parts = shlex.split(command)
                if len(parts) > 1:
                    command = parts[0]
                    args = parts[1:]
            except Exception as e:
                # If splitting fails, use the original command as-is
                # This will be handled by CommandExecutor with shell=True
                pass
    else:
        # Use LLM to generate command from task
        llm_result = call_llm_for_command(task)

        if llm_result.get("error"):
            if OUTPUT_BUILDER_AVAILABLE:
                result = OutputBuilder() \
                    .set_error(
                        error=ErrorInfo(
                            type="dependency",
                            message=llm_result["error"],
                            retryable=True,
                            suggestions=[
                                "Check if ANTHROPIC_API_KEY is set",
                                "Try using direct 'command' parameter instead",
                                "Check your internet connection"
                            ]
                        )
                    ) \
                    .add_standard_metadata("task", task) \
                    .build()
                write_structured_output(result, session_id)
                return result
            else:
                return {
                    "error": llm_result["error"],
                    "task": task
                }

        command = llm_result["command"]
        args = llm_result.get("args", [])
        reasoning = llm_result.get("reasoning", "Command generated from task description")

    # Import command executor
    try:
        from command_executor import CommandExecutor
    except ImportError:
        # Try local lib
        sys.path.insert(0, str(Path(__file__).parent / "lib"))
        from command_executor import CommandExecutor

    # Create command executor
    executor = CommandExecutor()

    # Execute command
    try:
        result = executor.execute(
            command=command,
            args=args,
            env=env,
            working_dir=working_dir,
            timeout=timeout
        )

        # Handle execution result
        if result.get('success'):
            stdout = result.get('stdout', '')
            stderr = result.get('stderr', '')

            # Build success response with OutputBuilder
            if OUTPUT_BUILDER_AVAILABLE:
                builder = OutputBuilder()

                # Add metadata
                builder.add_standard_metadata("task", task)
                builder.add_standard_metadata("command", command)
                builder.add_standard_metadata("llm_reasoning", reasoning)
                builder.add_standard_metadata("exit_code", result.get('exit_code', 0))
                builder.add_standard_metadata("execution_time", result.get('execution_time', 0))

                # Set raw text output
                builder.set_text(stdout)

                result = builder.build()
                write_structured_output(result, session_id)
                return result
            else:
                # Fallback without OutputBuilder
                return {
                    "success": True,
                    "result_type": "text",
                    "content": stdout,
                    "metadata": {
                        "command": command,
                        "exit_code": result.get('exit_code', 0),
                        "execution_time": result.get('execution_time', 0),
                        "x-llm_reasoning": reasoning
                    }
                }
        else:
            # Command failed
            error_msg = result.get('stderr') or result.get('message') or "Command execution failed"
            exit_code = result.get('exit_code', -1)

            if OUTPUT_BUILDER_AVAILABLE:
                # from output_builder import ErrorInfo

                error_type = "execution"
                if exit_code == -1:
                    error_type = "validation"

                # Build error info
                error_info = ErrorInfo(
                    type=error_type,
                    message=error_msg,
                    details=result.get('stderr', '')[:500] if result.get('stderr') else None
                )

                result = OutputBuilder() \
                    .set_error(error_info) \
                    .add_standard_metadata("task", task) \
                    .add_standard_metadata("command", command) \
                    .add_standard_metadata("exit_code", exit_code) \
                    .build()
                write_structured_output(result, session_id)
                return result
            else:
                return {
                    "success": False,
                    "result_type": "error",
                    "error": error_msg,
                    "exit_code": exit_code,
                    "command": command
                }

    except Exception as e:
        import traceback
        if OUTPUT_BUILDER_AVAILABLE:
            result = OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check if command is in whitelist",
                        "Verify command syntax",
                        "Check system permissions"
                    ]
                ) \
                .add_standard_metadata("task", task) \
                .add_standard_metadata("command", command) \
                .build()
            write_structured_output(result, session_id)
            return result
        else:
            return {
                "error": str(e),
                "result_type": "error",
                "success": False,
                "traceback": traceback.format_exc()
            }


# For testing
if __name__ == "__main__":
    import json

    # Test 1: Direct command execution
    result = execute_shell_command({
        "command": "echo",
        "args": ["Hello from tool-bash!"]
    })
    print("Direct command test:")
    print(json.dumps(result, indent=2))
    print()

    # Test 2: LLM-based command generation (requires ANTHROPIC_API_KEY)
    result = execute_shell_command({
        "task": "列出当前目录的文件"
    })
    print("LLM command generation test:")
    print(json.dumps(result, indent=2))
