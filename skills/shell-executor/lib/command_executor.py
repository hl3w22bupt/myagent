"""
Command Executor

Executes shell commands safely with timeout and resource limits.
"""

import os
import subprocess
import signal
import time
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

try:
    from .security_validator import SecurityValidator
except ImportError:
    from security_validator import SecurityValidator


class CommandExecutor:
    """
    Execute shell commands with safety controls.
    """

    # Maximum output size (10 MB default)
    MAX_OUTPUT_SIZE = int(os.environ.get('SHELL_MAX_OUTPUT_SIZE', 10485760))

    def __init__(self, whitelist: Optional[set] = None):
        """
        Initialize command executor.

        Args:
            whitelist: Set of allowed commands (None for default)
        """
        self.validator = SecurityValidator(whitelist)

    def execute(
        self,
        command: str,
        args: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        working_dir: Optional[str] = None,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Execute a shell command.

        Args:
            command: Command to execute
            args: Command arguments
            env: Environment variables
            working_dir: Working directory
            timeout: Timeout in seconds

        Returns:
            Dictionary with execution results (stdout, stderr, exit_code, etc.)
        """
        start_time = time.time()
        args = args or []

        # Validate command
        is_valid, error_msg = self.validator.validate_command(command, args)
        if not is_valid:
            return {
                'success': False,
                'error': 'permission',
                'message': error_msg,
                'exit_code': -1
            }

        # Validate arguments
        is_valid, error_msg = self.validator.validate_arguments(args)
        if not is_valid:
            return {
                'success': False,
                'error': 'validation',
                'message': error_msg,
                'exit_code': -1
            }

        # Sanitize environment
        safe_env = self.validator.sanitize_environment(env or {})

        # Merge with current environment (but don't override)
        full_env = {**os.environ, **safe_env}

        # Validate working directory
        if working_dir:
            work_path = Path(working_dir).expanduser().resolve()
            if not work_path.exists():
                return {
                    'success': False,
                    'error': 'resource',
                    'message': f'Working directory does not exist: {working_dir}',
                    'exit_code': -1
                }
        else:
            work_path = None

        # Build command list
        cmd_list = [command] + args

        # Execute command
        try:
            result = subprocess.run(
                cmd_list,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=full_env,
                cwd=work_path,
                timeout=timeout,
                text=True
            )

            stdout = result.stdout or ''
            stderr = result.stderr or ''
            exit_code = result.returncode

            # Check output size
            output_size = len(stdout.encode('utf-8')) + len(stderr.encode('utf-8'))
            truncated = output_size > self.MAX_OUTPUT_SIZE

            if truncated:
                stdout = stdout[:self.MAX_OUTPUT_SIZE]
                stderr = stderr[:self.MAX_OUTPUT_SIZE]

            execution_time = int((time.time() - start_time) * 1000)

            return {
                'success': exit_code == 0,
                'exit_code': exit_code,
                'stdout': stdout,
                'stderr': stderr,
                'execution_time': execution_time,
                'output_size': output_size,
                'truncated': truncated,
                'stdout_lines': len(stdout.split('\n')) if stdout else 0,
                'stderr_lines': len(stderr.split('\n')) if stderr else 0
            }

        except subprocess.TimeoutExpired as e:
            # Get partial output
            stdout = e.stdout.decode('utf-8') if e.stdout else ''
            stderr = e.stderr.decode('utf-8') if e.stderr else ''

            execution_time = int((time.time() - start_time) * 1000)

            return {
                'success': False,
                'error': 'timeout',
                'message': f'Command timeout after {timeout} seconds',
                'exit_code': -1,
                'stdout': stdout,
                'stderr': stderr,
                'execution_time': execution_time,
                'stdout_lines': len(stdout.split('\n')) if stdout else 0,
                'stderr_lines': len(stderr.split('\n')) if stderr else 0
            }

        except FileNotFoundError:
            return {
                'success': False,
                'error': 'dependency',
                'message': f'Command not found: {command}',
                'exit_code': -1,
                'suggestions': [
                    f'Install {command}',
                    'Check if command is in PATH',
                    'Verify command is in whitelist'
                ]
            }

        except PermissionError:
            return {
                'success': False,
                'error': 'permission',
                'message': f'Permission denied executing: {command}',
                'exit_code': -1,
                'suggestions': [
                    'Check file permissions',
                    'Verify user has execute permission'
                ]
            }

        except Exception as e:
            execution_time = int((time.time() - start_time) * 1000)

            return {
                'success': False,
                'error': 'unknown',
                'message': str(e),
                'exit_code': -1,
                'execution_time': execution_time
            }
