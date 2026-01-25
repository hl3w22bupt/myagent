"""
Hook Manager for Skill execution

Manages multiple hooks and executes them in sequence.
Provides a centralized point for hook lifecycle management.
"""

import asyncio
from typing import List, Dict, Any, Optional
from .base import BaseHook, SkillContext


class HookManager:
    """
    Manager for multiple hooks.

    Executes all registered hooks in sequence during skill execution.
    """

    def __init__(self, hooks: Optional[List[BaseHook]] = None):
        """
        Initialize the hook manager.

        Args:
            hooks: List of hooks to register (optional)
        """
        self.hooks: List[BaseHook] = hooks or []

    def register(self, hook: BaseHook) -> None:
        """
        Register a new hook.

        Args:
            hook: Hook instance to register
        """
        self.hooks.append(hook)

    def unregister(self, hook: BaseHook) -> None:
        """
        Unregister a hook.

        Args:
            hook: Hook instance to unregister
        """
        if hook in self.hooks:
            self.hooks.remove(hook)

    async def pre_exec(self, context: SkillContext) -> Dict[str, Any]:
        """
        Execute all pre-exec hooks.

        Args:
            context: Execution context

        Returns:
            Combined results from all hooks
        """
        combined_result: Dict[str, Any] = {}

        for hook in self.hooks:
            try:
                result = await hook.pre_exec(context)
                if result:
                    # Merge results
                    if result.action:
                        combined_result['action'] = result.action
                    if result.reason:
                        combined_result['reason'] = result.reason
                    if result.modified_input:
                        combined_result['modified_input'] = result.modified_input

                    # Stop if any hook requests stop
                    if result and result.action == 'stop':
                        break
            except Exception as e:
                # Log but don't fail the entire execution
                print(f"[HookManager] Pre-exec hook error: {e}")

        return combined_result

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute all post-exec hooks.

        Args:
            context: Execution context
            result: Execution result

        Returns:
            Combined results from all hooks
        """
        combined_result: Dict[str, Any] = {}

        for hook in self.hooks:
            try:
                hook_result = await hook.post_exec(context, result)
                if hook_result:
                    combined_result.update(hook_result)
            except Exception as e:
                # Log but don't fail the entire execution
                print(f"[HookManager] Post-exec hook error: {e}")

        return combined_result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute all progress notification hooks.

        Args:
            context: Execution context
            progress_data: Progress data

        Returns:
            Combined modifications to progress data
        """
        combined_mods: Dict[str, Any] = {}

        for hook in self.hooks:
            try:
                mods = await hook.on_progressing_notify(context, progress_data)
                if mods:
                    combined_mods.update(mods)
            except Exception as e:
                # Log but don't fail the entire execution
                print(f"[HookManager] Progress hook error: {e}")

        return combined_mods
