import os
import sys
from pathlib import Path
from typing import Dict, Any

# Import LLM client
from core.llm.client import LLMClient

def execute_shell_command(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Execute shell command with LLM-based command generation."""
    task = input_data.get('task', '').strip()
    
    if not task:
        return {"error": "Task is required", "success": False}
    
    # Initialize LLM client
    llm = LLMClient()
    
    # Generate shell command from task
    prompt = f"""Generate a shell command for this task: {task}

Requirements:
- Analyze the task and determine the best shell command
- Common commands: ls, find, grep, cat, head, tail, wc, cd, pwd, mkdir, cp, mv
- Return ONLY the command name (e.g., 'ls', 'find'), not a full command string
- For find/search operations, prefer find over ls + grep

Return format (JSON):
{{
    "command": "command_name",
    "args": ["arg1", "arg2"],
    "reasoning": "Brief explanation of why this command was chosen"
}}

Examples:
- Task: "列出 /tmp 目录的文件" → Command: "ls", args: ["/tmp"]
- Task: "查找当前目录下所有 .py 文件" → Command: "find", args: [".", "-name", "*.py"]
- Task: "查看 package.json 的内容" → Command: "cat", args: ["package.json"]

Now generate the command."""

Return JSON format:
{{"command": "ls", "args": ["/tmp"]}}

Only return the command name and args array, no other text."""
    
    try:
        response = llm.messages_create([{"role": "user", "content": prompt}], {})
        response_text = response.get('content', '').strip()
        
        # Parse JSON response
        import re
        json_match = re.search(r'\{[^}]*\}', response_text)
        if json_match:
            llm_response = json.loads(json_match.group(0))
            command = llm_response.get('command', 'ls')
            args = llm_response.get('args', ['/tmp'])
            
            # Execute using command_executor
            from command_executor import CommandExecutor
            executor = CommandExecutor()
            result = executor.execute(command=command, args=args)
            
            if result.success:
                return {
                    "success": True,
                    "result_type": "text",
                    "content": f"Command: {command}, Args: {args}"
                }
            else:
                return {
                    "error": f"Command failed with exit code {result.exit_code}",
                    "success": False,
                    "result_type": "error"
                }
    except Exception as e:
        return {"error": str(e), "success": False, "result_type": "error"}
