"""
Skill Hook Executor

Manages hook execution and progress reporting.
"""
import asyncio
import os
import time
from typing import Callable, Optional, Dict, Any, List
from core.skill.hooks.base import BaseHook, SkillContext, HookResult, NoOpHook
from core.skill.hooks.manager import HookManager
from core.skill.hooks.system.progress_notification_hook import ProgressNotificationHook


class SkillHookExecutor:
    """Executor for Skill with Hook support."""

    def __init__(
        self,
        hooks: Optional[List[BaseHook]] = None,
        notify_hook_api_url: Optional[str] = None
    ):
        """
        Initialize the hook executor.

        Args:
            hooks: List of hook instances to register (should include ProgressNotificationHook via get_default_hooks)
            notify_hook_api_url: Motia Notify API URL (kept for compatibility, but not used here)
        """
        self.hook_manager = HookManager()

        # 注册所有提供的 hook（去重逻辑）
        if hooks:
            for hook in hooks:
                # 检查是否已存在同类型的 hook，避免重复注册
                if not any(isinstance(existing, type(hook)) for existing in self.hook_manager.hooks):
                    self.hook_manager.register(hook)
                    print(f"[SkillHookExecutor] Registered hook: {type(hook).__name__}")
                else:
                    print(f"[SkillHookExecutor] Skipping duplicate hook: {type(hook).__name__}")
        else:
            print(f"[SkillHookExecutor] No hooks provided")

    async def report_progress(
        self,
        context: SkillContext,
        progress_type: str,
        data: Dict[str, Any],
        stage: str = "processing"
    ):
        """
        Report progress from Skill execution.

        Args:
            context: Execution context
            progress_type: Type of progress ('step', 'heartbeat', 'status', 'chat')
            data: Progress data
            stage: Execution stage ('pre', 'processing', 'post')
        """
        # 调用所有注册的 hook 的进度通知方法
        await self.hook_manager.on_progressing_notify(
            context,
            {**data, "type": progress_type, "stage": stage}
        )

    async def execute_with_hooks(
        self,
        skill_name: str,
        skill_func: Callable,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute skill with hook lifecycle.

        Args:
            skill_name: Name of the skill
            skill_func: Main skill function
            input_data: Input data for skill

        Returns:
            Skill execution result
        """
        print(f"[DEBUG] SkillHookExecutor.execute_with_hooks called: skill_name={skill_name}")
        print(f"[DEBUG] Registered hooks: {len(self.hook_manager.hooks)}")
        for i, hook in enumerate(self.hook_manager.hooks):
            print(f"[DEBUG]   hook[{i}]: {type(hook).__name__}")

        # Add skill_name to input_data for internal use
        enhanced_input = {
            "_skill_name": skill_name,
            **input_data
        }

        # Create execution context
        # Try to get task_id and session_id from input_data or environment
        task_id = input_data.get("task_id") or os.getenv("MOTIA_TASK_ID", "")
        session_id = input_data.get("session_id") or os.getenv("MOTIA_SESSION_ID", "")

        context = SkillContext(
            skill_name=skill_name,
            task_id=task_id,
            session_id=session_id,
            input_data=input_data,
            metadata=input_data.get("metadata", {}),
            execution_start_time=asyncio.get_event_loop().time()
        )

        # Pre-exec hook
        try:
            pre_result = await self.hook_manager.pre_exec(context)
            if pre_result.get("action") == "stop":
                return {
                    "success": False,
                    "error": f"Stopped by pre-hook: {pre_result.get('reason')}" if pre_result.get('reason') else "Stopped by pre-hook",
                    "reason": pre_result.get('reason')
                }
            if pre_result.get("modified_input"):
                # Update input_data with modifications
                input_data = pre_result.get("modified_input")
                # Also update enhanced_input
                enhanced_input = {
                    "_skill_name": skill_name,
                    **input_data
                }
        except Exception as e:
            # Hook error should not stop execution
            print(f"Warning: Pre-hook error: {e}")

        # Execute main logic
        try:
            result = await skill_func(enhanced_input)
        except Exception as e:
            result = {"success": False, "error": str(e)}

        # Post-exec hook
        try:
            post_result = await self.hook_manager.post_exec(context, result)
            if post_result:
                result.update(post_result)
        except Exception as e:
            print(f"Warning: Post-hook error: {e}")

        return result

    async def close(self):
        """Close hook resources."""
        # 关闭所有 hook 的资源
        for hook in self.hook_manager.hooks:
            if hasattr(hook, 'close') and callable(getattr(hook, 'close')):
                try:
                    await hook.close()
                except Exception as e:
                    print(f"[SkillHookExecutor] Error closing hook: {e}")
