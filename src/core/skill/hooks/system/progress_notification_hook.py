"""
Progress Notification Hook

System built-in hook that sends progress updates to Motia Stream.
This is the core hook that enables real-time progress tracking.
"""

import time
from typing import Dict, Any, Optional
import httpx
from ..base import BaseHook, SkillContext


class ProgressNotificationHook(BaseHook):
    """
    System built-in hook for progress notifications.

    Sends skill execution progress to Motia Stream API,
    which forwards to frontend for real-time updates.
    """

    def __init__(self, notify_api_url: Optional[str] = None):
        """
        Initialize the progress notification hook.

        Args:
            notify_api_url: Motia Notify API URL (e.g., 'http://localhost:3000/api/notify')
        """
        self.notify_api_url = notify_api_url
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _send_notification(
        self,
        context: SkillContext,
        notification_type: str,
        data: Dict[str, Any],
        stage: str = "processing"
    ):
        """
        Send notification to Motia Stream API.

        Args:
            context: Execution context
            notification_type: Type of notification ('step', 'heartbeat', 'status', 'chat')
            data: Notification data
            stage: Execution stage ('pre', 'processing', 'post')
        """
        if not self.notify_api_url:
            # No API URL configured, skip notification
            return

        # Create HTTP client if needed
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            payload = {
                "taskId": context.task_id,
                "type": notification_type,
                "timestamp": time.time(),  # Unix timestamp in seconds
                "stage": stage,
                "skill": context.skill_name,
                "message": data.get("message", f"{context.skill_name}: {notification_type}"),
                "data": data
            }

            # Send to Motia Notify API
            response = await self._http_client.post(
                self.notify_api_url,
                json=payload
            )
            response.raise_for_status()

            print(f"[ProgressNotificationHook] ✓ Notification sent: {notification_type} @ {stage}")

        except Exception as e:
            # Silent failure, don't interrupt main flow
            print(f"[ProgressNotificationHook] ✗ Failed to send notification: {e}")

    async def pre_exec(self, context: SkillContext) -> None:
        """Notify pre-execution start"""
        await self._send_notification(
            context,
            "step",
            {"message": f"Starting {context.skill_name}..."},
            stage="pre"
        )
        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Notify execution completion"""
        success = result.get("success", False)
        message = f"{context.skill_name} {'succeeded' if success else 'failed'}"

        await self._send_notification(
            context,
            "status",
            {"message": message, "success": success},
            stage="post"
        )

        # Add notification metadata to result
        result.setdefault("metadata", {})["progress_notified"] = True
        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Forward progress updates to Motia Stream.

        This method is called by SkillHookExecutor.report_progress()
        to send intermediate progress updates.
        """
        # Extract stage from progress data
        stage = progress_data.get("stage", "processing")

        # Send notification
        await self._send_notification(
            context,
            progress_data.get("type", "step"),
            progress_data,
            stage=stage
        )

        # Don't modify progress data
        return {}

    async def close(self):
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
