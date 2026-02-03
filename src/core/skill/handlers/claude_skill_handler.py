"""
Claude Skill Handler

Universal handler for executing Claude Skills (SKILL.md files).

This handler provides a unified execution interface for all Claude Skills,
supporting script discovery and subprocess execution with stdin/stdout JSON.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional


class ClaudeSkillHandler:
    """
    Universal handler for Claude Skill execution.

    Supports:
    - Script discovery (main.py > {skill_name}.py > first .py)
    - Subprocess execution with stdin/stdout JSON
    - Error handling and timeout management
    """

    def __init__(
        self,
        skill_name: str,
        skill_root: Optional[Path] = None,
        timeout: int = 30000
    ):
        """
        Initialize the Claude Skill Handler.

        Args:
            skill_name: Name of the Claude Skill
            skill_root: Root directory containing the skill (default: .claude/skills/{skill_name})
            timeout: Execution timeout in milliseconds
        """
        self.skill_name = skill_name
        self.timeout = timeout / 1000  # Convert to seconds

        # Determine skill root directory
        if skill_root is None:
            # Default to .claude/skills/{skill_name}
            self.skill_root = Path(f".claude/skills/{skill_name}")
        else:
            self.skill_root = Path(skill_root)

        # Discover script
        self.script_path = self._discover_script()

    def _discover_script(self) -> Optional[Path]:
        """
        Discover the Python script for this skill.

        Strategy:
        1. main.py (Claude Code standard)
        2. {skill_name}.py
        3. First .py file found

        Returns:
            Path to script if found, None otherwise
        """
        if not self.skill_root.exists():
            return None

        # Strategy 1: main.py
        main_py = self.skill_root / "main.py"
        if main_py.exists():
            return main_py

        # Strategy 2: {skill_name}.py
        name_py = self.skill_root / f"{self.skill_name}.py"
        if name_py.exists():
            return name_py

        # Strategy 3: First .py file
        py_files = list(self.skill_root.glob("*.py"))
        if py_files:
            # Return the first one (sorted for consistency)
            return sorted(py_files)[0]

        # No script found
        return None

    def execute(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the Claude Skill.

        Args:
            input_data: Input parameters for the skill

        Returns:
            Result dictionary with success/output/error fields

        Raises:
            FileNotFoundError: If script not found
            TimeoutError: If execution times out
            subprocess.CalledProcessError: If script fails
        """
        if self.script_path is None:
            return {
                'success': False,
                'error': f'No Python script found for skill "{self.skill_name}" in {self.skill_root}'
            }

        if not self.script_path.exists():
            return {
                'success': False,
                'error': f'Script not found: {self.script_path}'
            }

        try:
            # Prepare input JSON
            input_json = json.dumps(input_data)

            # Execute script as subprocess
            result = subprocess.run(
                [sys.executable, str(self.script_path)],
                input=input_json,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd=str(self.script_path.parent)
            )

            # Check for errors
            if result.returncode != 0:
                return {
                    'success': False,
                    'error': result.stderr or f'Script failed with code {result.returncode}',
                    'stdout': result.stdout,
                    'stderr': result.stderr
                }

            # Parse output JSON
            try:
                output = json.loads(result.stdout)
                return output
            except json.JSONDecodeError:
                # Script returned non-JSON output
                return {
                    'success': True,
                    'output': result.stdout,
                    'raw': True
                }

        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': f'Script execution timed out after {self.timeout}s'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'{type(e).__name__}: {str(e)}'
            }


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for Motia skill execution.

    This function is called by the SkillExecutor when executing a Claude Skill.

    Expected input_data fields:
        - skill_name: Name of the Claude Skill
        - task: Task description or input
        - context: Optional additional context
        - skill_root: Optional root directory (overrides default)

    Returns:
        Result dictionary with success/output/error fields
    """
    # Extract parameters
    skill_name = input_data.get('skill_name')
    task = input_data.get('task', {})
    context = input_data.get('context', {})
    skill_root = input_data.get('skill_root')
    timeout = input_data.get('timeout', 30000)

    if not skill_name:
        return {
            'success': False,
            'error': 'Missing required field: skill_name'
        }

    # Create handler
    handler = ClaudeSkillHandler(
        skill_name=skill_name,
        skill_root=Path(skill_root) if skill_root else None,
        timeout=timeout
    )

    # Execute skill
    return handler.execute({
        'task': task,
        'context': context
    })


# For testing
if __name__ == "__main__":
    import sys

    # Test execution
    if len(sys.argv) > 1:
        skill_name = sys.argv[1]
        test_input = {
            'skill_name': skill_name,
            'task': 'test task'
        }
    else:
        test_input = {
            'skill_name': 'example-skill',
            'task': 'test task'
        }

    result = execute(test_input)
    print(json.dumps(result, indent=2))
