"""
Logging Hook for Skill execution

Provides comprehensive logging for skill execution, including:
- Pre-execution logging (input validation)
- Post-execution logging (output summary)
- Progress logging (execution steps)
"""

import time
import json
from typing import Dict, Any, Optional
from ..base import BaseHook, SkillContext


class LoggingHook(BaseHook):
    """
    Logging Hook that records all skill execution events.

    Logs pre-execution inputs, post-execution outputs, and progress updates.
    Useful for debugging and auditing.
    """

    def __init__(self, log_level: str = "INFO"):
        """
        Initialize the logging hook.

        Args:
            log_level: Logging level (DEBUG, INFO, WARNING, ERROR)
        """
        self.log_level = log_level
        self.execution_count = 0

    def _log(self, level: str, message: str, **extra):
        """Internal logging method"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_msg = f"[{timestamp}] [{level}] {message}"

        if extra:
            log_msg += f" | {json.dumps(extra, default=str)}"

        print(log_msg)

    async def pre_exec(self, context: SkillContext) -> Optional[Dict[str, Any]]:
        """Log skill execution start"""
        self._log(
            self.log_level,
            f"Skill execution started: {context.skill_name}",
            task_id=context.task_id,
            session_id=context.session_id,
            input_data=context.input_data,
            metadata=context.metadata
        )

        self.execution_count += 1
        return None  # Don't modify behavior

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Log skill execution result"""
        success = result.get("success", False)

        if success:
            self._log(
                self.log_level,
                f"Skill execution succeeded: {context.skill_name}",
                execution_time=result.get("execution_time", 0),
                output_type=type(result.get("output")).__name__
            )
        else:
            self._log(
                "ERROR",
                f"Skill execution failed: {context.skill_name}",
                error=result.get("error"),
                execution_time=result.get("execution_time", 0)
            )

        # Add logging metadata
        result.setdefault("metadata", {})["logged_by"] = "LoggingHook"
        result["metadata"]["execution_count"] = self.execution_count

        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Log progress updates"""
        progress_type = progress_data.get("type", "unknown")
        message = progress_data.get("message", "")

        self._log(
            "DEBUG" if self.log_level == "INFO" else self.log_level,
            f"Skill progress: {context.skill_name}",
            progress_type=progress_type,
            message=message,
            data=progress_data
        )

        return progress_data  # Don't modify
