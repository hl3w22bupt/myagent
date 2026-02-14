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
if local_lib.exists():
    sys.path.insert(0, str(local_lib))

# Import LLM client for command generation
from core.llm.client import LLMClient

def execute_shell_command(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute shell command with intelligent LLM-based command generation.
    User provides a task description, LLM generates the appropriate shell command.
    """
    # Extract parameters
    task = input_data.get('task', '').strip()
    env = input_data.get('env')
    working_dir = input_data.get('working_dir')
    timeout = input_data.get('timeout', 30)
    output_format = input_data.get('output_format', 'auto')
    parse_options = input_data.get('parse_options')

    # Validate task
    if not task:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ErrorInfo(
                        type="validation",
                        message="Task is required",
                        retryable=False,
                        suggestions=[
                            "Provide 'task' parameter with your requirement",
                            "Example: task='List files in /tmp directory'"
                        ]
                    )
                ) \
                .build()
        else:
            return {
                "error": "Task is required",
                "suggestions": ["Provide 'task' parameter"]
            }

    # Initialize LLM client
    llm = LLMClient()

    # Generate shell command from task description
    prompt = f"""You are a shell command generator. Generate the appropriate shell command for the given task.

Task: {task}

Requirements:
- Analyze the task and determine the best shell command
- Common commands: ls, find, grep, cat, head, tail, wc, cd, pwd, mkdir, cp, mv
- Return ONLY the command name (e.g., 'ls', 'find'), not a full command string
- For find/search operations, prefer find over ls + grep
- Args should be returned as a JSON array of strings

Return format (JSON):
{{
    "command": "command_name",
    "reasoning": "Brief explanation of why this command was chosen"
}}

Examples:
- Task: "列出 /tmp 目录的文件" → {{"command": "ls", "args": ["/tmp"]}
- Task: "查找当前目录下所有 .py 文件" → {{"command": "find", "args": [".", "-name", "*.py"]}
- Task: "查看 package.json 的内容" → {{"command": "cat", "args": ["package.json"]}

Generate the command now."""

    try:
        response = llm.messages_create([
            {"role": "user", "content": prompt}
        ], {})

        # Parse LLM response
        response_text = response.get('content', '').strip()

        if response_text.startswith('```'):
            # Try to extract JSON from code block
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text)
            if json_match:
                json_str = json_match.group(1)
                llm_response = json.loads(json_str)

                command = llm_response.get('command')
                reasoning = llm_response.get('reasoning', 'Command generated from task description')

                # Validate response
                if not command:
                    return {
                        "error": f"LLM failed to generate command. Response: {llm_response}",
                        "suggestions": ["Check LLM response format"]
                    }

                # Validate args format - should be array
                args_from_llm = llm_response.get('args', [])
                if not isinstance(args_from_llm, list):
                    return {
                        "error": f"Invalid args format: {type(args_from_llm)}. Expected list.",
                        "suggestions": ["Args must be a JSON array of strings"]
                    }

                # Execute command
                full_command = command
                full_args = args_from_llm if args_from_llm else []

                # Create command executor
                from command_executor import CommandExecutor
                executor = CommandExecutor()

                # Execute with proper parameters
                result = executor.execute(
                    command=full_command,
                    args=full_args,
                    env=env,
                    cwd=working_dir,
                    timeout=timeout
                )

                # Handle execution result
                if result.success:
                    parsed = result.parsed_output

                    # Build success response with OutputBuilder
                    if OUTPUT_BUILDER_AVAILABLE:
                        builder = OutputBuilder()

                        # Add metadata
                        builder.set_standard_metadata("task", task)
                        builder.set_standard_metadata("command", command)
                        builder.set_standard_metadata("llm_reasoning", reasoning)

                        # Set result type based on parsed output
                        if isinstance(parsed, dict):
                            # Table output
                            if 'headers' in parsed or 'rows' in parsed:
                                builder.set_result_type("table")
                                headers = parsed.get('headers', [])
                                rows = parsed.get('rows', [])
                                title = parsed.get('title', f"Command Output ({len(rows)} rows)")

                                builder.set_table(headers=headers, rows=rows, title=title, sortable=True)
                            else:
                                builder.set_result_type("text")
                        elif isinstance(parsed, list):
                            builder.set_result_type("kv")
                            headers = ['Key', 'Value']
                            rows = [[k, v] for item in parsed]
                            builder.set_key_value(headers=headers, rows=rows, title="Key-Value Pairs")
                        else:
                            builder.set_result_type("text")
                            builder.set_result(str(parsed))

                        # Add execution metadata
                        builder.set_standard_metadata("exit_code", result.exit_code)
                        builder.set_standard_metadata("execution_time", result.execution_time)

                        return builder.build()
                    else:
                        # Command failed
                        error_msg = result.stderr if result.stderr else "Command execution failed"

                        if OUTPUT_BUILDER_AVAILABLE:
                            builder = OutputBuilder()
                            builder.set_result_type("error")
                            builder.set_error(
                                error=ErrorInfo(
                                    type="execution",
                                    message=error_msg,
                                    exit_code=result.exit_code
                                )
                            )
                            builder.add_standard_metadata("exit_code", result.exit_code)
                            return builder.build()
                        else:
                            return {
                                "result_type": "error",
                                "error": error_msg,
                                "exit_code": result.exit_code
                            }

    except Exception as e:
        return {
            "error": str(e),
            "result_type": "error",
            "success": False
        }
