"""
Skill Hook Base Classes and Types

Provides the base interface for all Skill Hooks.
Hooks allow custom logic injection before/after/during Skill execution.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class HookResultAction(str, Enum):
    """Action to take after hook execution."""
    CONTINUE = "continue"  # Normal execution flow
    STOP = "stop"  # Stop execution


@dataclass
class HookResult:
    """Result returned from hook methods."""
    action: HookResultAction = HookResultAction.CONTINUE
    modified_input: Optional[Dict[str, Any]] = None
    modified_output: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None


@dataclass
class SkillContext:
    """Skill execution context passed to all hooks."""
    skill_name: str
    task_id: str
    session_id: str
    input_data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    execution_start_time: float = 0.0


class BaseHook(ABC):
    """Base class for all Skill Hooks."""

    @abstractmethod
    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """
        Called before Skill execution.

        Args:
            context: Skill execution context

        Returns:
            Optional HookResult with action and modifications
            - None or HookResult(action=CONTINUE): Continue execution
            - HookResult(action=STOP): Stop execution with optional reason
            - HookResult(modified_input={...}): Modify input data
        """
        pass

    @abstractmethod
    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Called after Skill execution.

        Args:
            context: Skill execution context
            result: Skill execution result

        Returns:
            Optional dict with modifications to result
        """
        pass

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Called during Skill execution for progress notifications.

        Args:
            context: Skill execution context
            progress_data: Progress data from Skill

        Returns:
            Dict with modifications to progress data
        """
        return {}


class NoOpHook(BaseHook):
    """A no-op hook that does nothing."""

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        return None

    async def post_exec(self, context: SkillContext, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return result
