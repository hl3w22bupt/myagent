"""
Skill Execution Context

Provides context and utilities for skill execution, including progress reporting.
"""

from typing import Callable, Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class SkillExecutionContext:
    """
    Context object passed to skill handlers.

    Provides utilities like progress reporting without coupling skills
    to the hook system directly.
    """

    skill_name: str
    task_id: str
    session_id: str

    # Progress reporter function (optional)
    report_progress: Optional[Callable[[str, Dict[str, Any]], Any]] = None

    # Additional metadata
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}

    async def report_step(self, message: str, **extra_data):
        """
        Report a step progress.

        Args:
            message: Progress message
            **extra_data: Additional data to include
        """
        if self.report_progress:
            await self.report_progress("step", {
                "message": message,
                **extra_data
            })

    async def report_heartbeat(self, **data):
        """Report a heartbeat (liveness signal)."""
        if self.report_progress:
            await self.report_progress("heartbeat", data)

    async def report_status(self, status: str, **data):
        """Report a status update."""
        if self.report_progress:
            await self.report_progress("status", {
                "status": status,
                **data
            })

    async def report_chat(self, message: str, **data):
        """Report a chat message."""
        if self.report_progress:
            await self.report_progress("chat", {
                "message": message,
                **data
            })
