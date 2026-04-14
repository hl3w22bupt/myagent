"""
Security Validator for Shell Command Execution

Provides command whitelist validation and dangerous pattern detection.
"""

import os
import re
from typing import List, Set, Optional, Tuple


class SecurityValidator:
    """
    Validates shell commands for security before execution.
    """

    # Default command whitelist
    DEFAULT_WHITELIST: Set[str] = {
        # PostgreSQL tools
        'psql', 'pg_dump', 'pg_restore',

        # Media tools
        'ffmpeg', 'ffprobe',

        # System tools
        'ls', 'cat', 'grep', 'awk', 'sed', 'find', 'head', 'tail',
        'wc', 'sort', 'uniq', 'cut', 'tr', 'dirname', 'basename', 'cd',

        # Network tools
        'curl', 'wget', 'ping', 'ssh', 'scp', 'rsync',

        # Development tools
        'git', 'npm', 'python', 'python3', 'node', 'npm', 'claude',

        # File operations (safe ones)
        'cp', 'mv', 'mkdir', 'touch', 'chmod', 'chown',

        # System information
        'df', 'du', 'free', 'top', 'ps', 'uname', 'date', 'whoami', 'pwd',

        # Compression
        'tar', 'gzip', 'gunzip', 'zip', 'unzip',

        # Other utilities
        'echo', 'printf', 'sleep', 'time', 'which', 'whereis'
    }

    # Dangerous command patterns (regex patterns)
    DANGEROUS_PATTERNS = [
        # File deletion
        r'\brm\s+-rf?\s+\s*/',  # rm -rf /
        r'\bdd\s+if=/dev/zero',  # dd disk wiping

        # Root directory operations
        r'/\s+(>|>>)',  # Writing to root

        # Command injection attempts
        r';\s*(rm|dd|mkfs)',  # Command chaining with dangerous commands
        r'`\s*(rm|dd|mkfs)',  # Backtick injection
        r'\$\([^)]*\)?\s*(rm|dd|mkfs)',  # $() injection

        # Eval/exec
        r'\beval\s+',  # eval command
        r'\bexec\s+',  # exec command

        # Python import injection
        r'__import__',
        r'import\s+os',
        r'import\s+sys',
    ]

    # Maximum limits
    MAX_PIPE_CHAIN = 3  # Maximum number of pipes in command
    MAX_COMMAND_CHAIN = 2  # Maximum number of &&/|| operators

    def __init__(self, whitelist: Optional[Set[str]] = None):
        """
        Initialize security validator.

        Args:
            whitelist: Set of allowed commands (None to use default)
        """
        self.whitelist = whitelist or self.DEFAULT_WHITELIST.copy()

        # Load from environment variable if available
        env_whitelist = os.environ.get('SHELL_ALLOWED_COMMANDS')
        if env_whitelist:
            env_commands = set(cmd.strip() for cmd in env_whitelist.split(','))
            self.whitelist = env_commands

    def validate_command(self, command: str, args: List[str], use_shell: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Validate if command is allowed and safe.

        Args:
            command: Base command name (or full command string if use_shell=True)
            args: Command arguments (ignored if use_shell=True and command contains spaces)
            use_shell: If True, command is a full shell command string

        Returns:
            Tuple of (is_valid, error_message)
        """
        # For shell mode, extract the base command name
        base_command = command
        if use_shell:
            # Extract the first word as the base command
            # Handle quoted commands and special cases
            parts = command.split(None, 1)  # Split on first whitespace
            if parts:
                base_command = parts[0]
                # Remove shell operators from base command
                for op in ['>', '<', '|', '&', ';']:
                    if op in base_command:
                        base_command = base_command.split(op)[0].strip()

        # Check if command is in whitelist
        if base_command not in self.whitelist:
            available = ', '.join(sorted(self.whitelist))
            return False, f"Command '{base_command}' not in whitelist. Available commands: {available}"

        # Build full command string for pattern checking
        if use_shell:
            full_command = command
        else:
            full_command = command + ' ' + ' '.join(args)

        # Check for dangerous patterns
        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, full_command):
                return False, f"Command matches dangerous pattern: {pattern}"

        # Check pipe chain length
        pipe_count = full_command.count('|')
        if pipe_count > self.MAX_PIPE_CHAIN:
            return False, f"Too many pipes in command ({pipe_count} > {self.MAX_PIPE_CHAIN})"

        # Check command chain length (&& and ||)
        chain_count = full_command.count('&&') + full_command.count('||')
        if chain_count > self.MAX_COMMAND_CHAIN:
            return False, f"Too many command chains ({chain_count} > {self.MAX_COMMAND_CHAIN})"

        return True, None

    def validate_arguments(self, args: List[str]) -> Tuple[bool, Optional[str]]:
        """
        Validate command arguments for safety.

        Args:
            args: Command arguments

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check for argument injection attempts
        for arg in args:
            # Check for shell metacharacters that could lead to injection
            dangerous_chars = [';', '`', '$(', '${']
            for char in dangerous_chars:
                if char in arg and not self._is_safe_usage(arg, char):
                    return False, f"Potentially dangerous character '{char}' in argument: {arg}"

        return True, None

    def _is_safe_usage(self, arg: str, char: str) -> bool:
        """
        Check if character usage is safe in context.

        Args:
            arg: Argument string
            char: Character to check

        Returns:
            True if usage is safe
        """
        # Allow $ in environment variable names (${VAR}, $VAR)
        if char == '$':
            return bool(re.match(r'^\$\{?[A-Z_][A-Z0-9_]*\}?$', arg))

        # Allow semicolons in SQL queries
        if char == ';' and arg.endswith(';'):
            return True

        return False

    def is_command_dangerous(self, command: str) -> bool:
        """
        Quick check if a command is inherently dangerous.

        Args:
            command: Command name

        Returns:
            True if command is dangerous
        """
        dangerous_commands = {
            'rm', 'dd', 'mkfs', 'fdisk', 'format',
            'reboot', 'shutdown', 'halt',
            'killall', 'pkill',
            'su', 'sudo',
            'chmod', 'chown'  # Could be dangerous if misused
        }

        # Note: Some of these (like chmod, chown) are in whitelist
        # but should be used with caution
        return command in dangerous_commands

    def sanitize_environment(self, env: dict) -> dict:
        """
        Sanitize environment variables, removing dangerous ones.

        Args:
            env: Environment variables dictionary

        Returns:
            Sanitized environment dictionary
        """
        # Dangerous env variables to remove
        dangerous_keys = {
            'PATH',  # Could be used to execute arbitrary commands
            'LD_LIBRARY_PATH',
            'LD_PRELOAD',
            'IFS',
        }

        # Only allow safe environment variables
        safe_env = {}

        for key, value in env.items():
            # Block dangerous keys
            if key in dangerous_keys:
                continue

            # Block keys with shell metacharacters
            if any(char in key for char in [';', '`', '$', '\n', '\r']):
                continue

            # Sanitize value
            if isinstance(value, str):
                # Check for dangerous patterns in values
                if any(char in value for char in [';', '`', '\n', '\r']):
                    continue

            safe_env[key] = value

        return safe_env
