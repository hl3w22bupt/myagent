"""
OpenClaw Scripts Handler

Handles OpenClaw skills that have a scripts/ directory.

These skills work by:
1. Reading the SKILL.md to understand the task
2. Using LLM to generate or select appropriate script commands
3. Executing scripts via tool-bash
4. Returning results with full trace support
"""

import os
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional

# Import OutputBuilder
try:
    from ..output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    try:
        from src.core.skill.output_builder import OutputBuilder
        OUTPUT_BUILDER_AVAILABLE = True
    except ImportError:
        OUTPUT_BUILDER_AVAILABLE = False

# Import LLM client for OpenAI calls
try:
    from ..llm_client import LLMClient
    LLM_CLIENT_AVAILABLE = True
except ImportError:
    try:
        from src.core.skill.llm_client import LLMClient
        LLM_CLIENT_AVAILABLE = True
    except ImportError:
        LLM_CLIENT_AVAILABLE = False


class OpenClawScriptsHandler:
    """
    Handler for OpenClaw skills with scripts/ directory.

    Execution flow:
    1. Read SKILL.md to understand intent
    2. Call LLM with prompt to generate/select script commands
    3. Execute script via tool-bash (or subprocess directly)
    4. Return results with trace support
    """

    def __init__(
        self,
        skill_name: str,
        skill_root: Path,
        scripts_dir: Optional[Path] = None,
        timeout: int = 30000,
        trace_api_url: Optional[str] = None
    ):
        """
        Initialize the handler.

        Args:
            skill_name: Name of the skill
            skill_root: Root directory of the skill
            scripts_dir: Scripts directory (defaults to skill_root/scripts)
            timeout: Execution timeout in milliseconds
            trace_api_url: Optional Trace API URL for sending traces
        """
        self.skill_name = skill_name
        self.skill_root = Path(skill_root)
        self.scripts_dir = scripts_dir or (self.skill_root / "scripts")
        self.timeout = timeout
        self.trace_api_url = trace_api_url

        # Initialize LLM client
        self.llm_client = None
        if LLM_CLIENT_AVAILABLE:
            self.llm_client = LLMClient()

    def execute(
        self,
        prompt_template: str,
        user_input: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute the OpenClaw script skill.

        Args:
            prompt_template: The prompt template from SKILL.md
            user_input: User's input/question
            context: Optional execution context

        Returns:
            Execution result with output, traces, and artifacts
        """
        start_time = time.time()

        result = {
            "success": False,
            "output": None,
            "error": None,
            "traces": [],
            "artifacts": []
        }

        try:
            # Step 1: Generate script command using LLM
            llm_result = self._generate_script_command(prompt_template, user_input, context)

            if not llm_result.get("success"):
                result["error"] = llm_result.get("error", "Failed to generate script command")
                return result

            script_command = llm_result.get("output", "")

            # Add LLM trace to result
            if "trace" in llm_result:
                result["traces"].append(llm_result["trace"])

            # Step 2: Execute the script command
            exec_result = self._execute_script(script_command)

            if exec_result.get("success"):
                result["success"] = True
                result["output"] = exec_result.get("output")
                result["artifacts"] = exec_result.get("artifacts", [])
            else:
                result["error"] = exec_result.get("error", "Script execution failed")

        except Exception as e:
            result["error"] = f"Execution error: {str(e)}"

        # Calculate execution time
        execution_time = (time.time() - start_time) * 1000  # Convert to ms
        result["execution_time"] = execution_time

        return result

    def _generate_script_command(
        self,
        prompt_template: str,
        user_input: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Use LLM to generate the appropriate script command.

        Args:
            prompt_template: Prompt template from SKILL.md
            user_input: User's input
            context: Optional context

        Returns:
            Dict with success, output (command), and trace
        """
        if not self.llm_client:
            return {
                "success": False,
                "error": "LLM client not available"
            }

        # Build the full prompt
        full_prompt = f"""{prompt_template}

User Request: {user_input}

Available scripts directory: {self.scripts_dir}

Based on the user's request and the available scripts, generate the appropriate command to run.
Return only the command, nothing else."""

        try:
            # Call LLM
            response = self.llm_client.call(
                prompt=full_prompt,
                max_tokens=500
            )

            # Extract command from response
            command = response.strip()

            # Build trace if trace API URL is available
            trace = None
            if self.trace_api_url:
                trace = {
                    "type": "llm",
                    "prompt": full_prompt,
                    "response": command,
                    "timestamp": time.time(),
                    "model": "unknown"
                }

            return {
                "success": True,
                "output": command,
                "trace": trace
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"LLM call failed: {str(e)}"
            }

    def _execute_script(self, command: str) -> Dict[str, Any]:
        """
        Execute a script command.

        Args:
            command: The command to execute

        Returns:
            Dict with success, output, and artifacts
        """
        import subprocess

        try:
            # Execute the command
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=self.timeout / 1000,  # Convert ms to seconds
                cwd=self.skill_root
            )

            success = result.returncode == 0

            output = result.stdout
            if result.stderr:
                output += "\n" + result.stderr

            return {
                "success": success,
                "output": output.strip(),
                "returncode": result.returncode,
                "artifacts": []  # Could be enhanced to detect output files
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Script execution timed out after {self.timeout}ms"
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Script execution failed: {str(e)}"
            }


# Convenience function
def execute_openclaw_script_skill(
    skill_name: str,
    skill_root: Path,
    prompt_template: str,
    user_input: str,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Convenience function to execute an OpenClaw script skill.

    Args:
        skill_name: Name of the skill
        skill_root: Root directory of the skill
        prompt_template: Prompt template from SKILL.md
        user_input: User's input
        context: Optional execution context

    Returns:
        Execution result dictionary
    """
    handler = OpenClawScriptsHandler(skill_name, skill_root)
    return handler.execute(prompt_template, user_input, context)
