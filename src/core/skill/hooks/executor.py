"""
Skill Hook Executor

Manages hook execution and progress reporting.
"""
import asyncio
import httpx
import os
import time
from typing import Callable, Optional, Dict, Any
from core.skill.hooks.base import BaseHook, SkillContext, HookResult, NoOpHook


class SkillHookExecutor:
    """Executor for Skill with Hook support."""

    def __init__(
        self,
        hook: Optional[BaseHook] = None,
        notify_api_url: Optional[str] = None
    ):
        """
        Initialize the hook executor.

        Args:
            hook: Optional hook instance
            notify_api_url: Motia Notify API URL
        """
        self.hook = hook or NoOpHook()
        self.notify_api_url = notify_api_url
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _notify_progress(
        self,
        task_id: str,
        progress_type: str,
        data: Dict[str, Any],
        stage: str = "processing"
    ):
        """
        Send progress notification to Motia.

        Args:
            task_id: Task ID
            progress_type: Type of progress ('step', 'heartbeat', 'status', 'chat')
            data: Progress data
            stage: Execution stage ('pre', 'processing', 'post')
        """
        if not self.notify_api_url:
            print(f"[DEBUG] _notify_progress skipped: no notify_api_url")
            return

        print(f"[DEBUG] _notify_progress called: task_id={task_id}, type={progress_type}, stage={stage}")

        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            payload = {
                "taskId": task_id,
                "type": progress_type,
                "timestamp": time.time(),  # Unix timestamp in seconds
                "stage": stage,
                **data
            }
            print(f"[DEBUG] Sending POST to {self.notify_api_url}")
            print(f"[DEBUG] Payload: {payload}")

            response = await self._http_client.post(
                self.notify_api_url,
                json=payload
            )
            response.raise_for_status()
            print(f"[DEBUG] Notification sent successfully: {response.status_code}")
        except Exception as e:
            # Silent failure, don't interrupt main flow
            print(f"[DEBUG] Failed to send progress notification: {e}")

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
        print(f"[DEBUG] report_progress called: task_id={context.task_id}, type={progress_type}, stage={stage}")

        # Call hook's progress callback
        progress_mods = await self.hook.on_progressing_notify(context, data)
        if progress_mods:
            data.update(progress_mods)

        # Send to Motia Notify API
        await self._notify_progress(context.task_id, progress_type, data, stage)

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
        print(f"[DEBUG] execute_with_hooks called: skill_name={skill_name}")

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
            # Report pre-exec stage
            await self.report_progress(context, "step", {"message": "Pre-execution hook started"}, stage="pre")

            pre_result = await self.hook.pre_exec(context)
            if pre_result and pre_result.action == "stop":
                return {
                    "success": False,
                    "error": f"Stopped by pre-hook: {pre_result.reason}" if pre_result.reason else "Stopped by pre-hook",
                    "reason": pre_result.reason
                }
            if pre_result and pre_result.modified_input:
                # Update input_data with modifications
                input_data = pre_result.modified_input
                # Also update enhanced_input
                enhanced_input = {
                    "_skill_name": skill_name,
                    **input_data
                }

            # Report pre-exec completed
            await self.report_progress(context, "step", {"message": "Pre-execution hook completed"}, stage="pre")
        except Exception as e:
            # Hook error should not stop execution
            print(f"Warning: Pre-hook error: {e}")

        # Execute main logic
        try:
            # Report processing started
            await self.report_progress(context, "step", {"message": f"Starting skill execution: {skill_name}"}, stage="processing")

            result = await skill_func(enhanced_input)

            # Report processing completed
            await self.report_progress(context, "step", {"message": f"Skill execution completed: {skill_name}"}, stage="processing")
        except Exception as e:
            result = {"success": False, "error": str(e)}

        # Post-exec hook
        try:
            # Report post-exec stage
            await self.report_progress(context, "step", {"message": "Post-execution hook started"}, stage="post")

            post_result = await self.hook.post_exec(context, result)
            if post_result:
                result.update(post_result)

            # Report post-exec completed
            await self.report_progress(context, "step", {"message": "Post-execution hook completed"}, stage="post")
        except Exception as e:
            print(f"Warning: Post-hook error: {e}")

        return result

    async def close(self):
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
