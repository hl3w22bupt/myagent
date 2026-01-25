"""
Composite Hook - Chain multiple hooks together

Executes multiple hooks in sequence, allowing all hooks to process
the skill execution lifecycle.
"""

import time
from typing import List, Optional, Dict, Any
from .base import BaseHook, SkillContext, HookResult, HookResultAction


class CompositeHook(BaseHook):
    """
    Composite Hook that chains multiple hooks together.

    All hooks are executed in order. For pre_exec:
    - If any hook returns STOP, execution is blocked
    - If any hook returns modified_input, the last one wins
    - All hooks see the original input (or previous modifications)

    For post_exec:
    - All hooks see and can modify the result
    - Hooks are executed in order, so later hooks see earlier hooks' modifications
    """

    def __init__(self, hooks: List[BaseHook]):
        """
        Initialize composite hook with a list of hooks.

        Args:
            hooks: List of hooks to execute in order
        """
        self.hooks = hooks

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """
        Execute all hooks' pre_exec in order.

        Returns:
            HookResult from the first hook that returns STOP,
            or the last modified_input result, or None
        """
        final_result = None

        for hook in self.hooks:
            try:
                result = await hook.pre_exec(context)

                # If any hook says STOP, immediately return
                if result and result.action == HookResultAction.STOP:
                    return result

                # Keep track of the last modified_input
                if result and result.modified_input:
                    final_result = result

            except Exception as e:
                # Log but don't stop other hooks
                print(f"[CompositeHook] Error in pre_exec: {e}")

        return final_result

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Execute all hooks' post_exec in order.

        Each hook sees the result (and potentially earlier hooks' modifications).
        """
        for hook in self.hooks:
            try:
                hook_result = await hook.post_exec(context, result)
                if hook_result:
                    result.update(hook_result)
            except Exception as e:
                # Log but don't stop other hooks
                print(f"[CompositeHook] Error in post_exec: {e}")

        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute all hooks' on_progressing_notify in order.

        Each hook can modify the progress data.
        """
        for hook in self.hooks:
            try:
                hook_result = await hook.on_progressing_notify(context, progress_data)
                if hook_result:
                    progress_data.update(hook_result)
            except Exception as e:
                # Log but don't stop other hooks
                print(f"[CompositeHook] Error in on_progressing_notify: {e}")

        return progress_data
