"""
Skill Trace Hook.

Captures detailed execution traces at the Skill level.
Records input/output, errors, retries, timing, and metadata for skill execution.
Sends traces to Motia executionTraces stream via API.
"""

import time
from datetime import datetime
from typing import Optional, Dict, Any
import httpx
from .base import BaseHook, SkillContext, HookResult


class SkillTraceHook(BaseHook):
    """
    Skill-level execution tracing hook.

    Sends trace data to Motia executionTraces stream via REST API.
    Similar to ProgressNotificationHook approach.
    """

    def __init__(self, trace_api_url: Optional[str] = None):
        """
        Initialize the skill trace hook.

        Args:
            trace_api_url: Motia Trace Submit API URL (e.g., 'http://localhost:3000/api/traces/submit')
        """
        self.trace_api_url = trace_api_url
        self._http_client: Optional[httpx.AsyncClient] = None
        self.current_traces: Dict[str, Dict[str, Any]] = {}  # skill_name -> {id, start_time}

    async def _send_trace(
        self,
        trace_data: Dict[str, Any],
    ):
        """
        Send trace data to Motia executionTraces stream via API.

        Args:
            trace_data: Trace data matching executionTraceSchema
        """
        if not self.trace_api_url:
            # No API URL configured, skip sending
            return

        # Create HTTP client if needed
        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            # Send to Motia Trace Submit API
            response = await self._http_client.post(
                self.trace_api_url,
                json=trace_data
            )
            response.raise_for_status()

            print(f"[SkillTraceHook] ✓ Trace sent: {trace_data.get('id')} - {trace_data.get('status')}")

        except Exception as e:
            # Silent failure, don't interrupt main flow
            print(f"[SkillTraceHook] ✗ Failed to send trace: {e}")

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """
        Called before skill execution.

        Records the initial skill trace with input data.
        """
        try:
            task_id = context.task_id or "unknown"
            skill_name = context.skill_name
            start_time_ms = int(time.time() * 1000)

            # Generate unique trace ID (with -pre suffix to distinguish from post)
            id = f"{task_id}-{skill_name}-skill-pre"

            # Get agentId if available
            agent_id = getattr(context, 'agent_id', None)

            # Create initial skill trace entry
            trace_data = {
                "id": id,
                "taskId": task_id,
                "level": "skill",
                "stage": "pre_execution",
                "skillName": skill_name,
                "inputData": {
                    "skill_name": skill_name,
                    "input_data": {k: v for k, v in context.input_data.items()
                                   if not k.startswith("_")},
                },
                "status": "running",
                "startedAt": start_time_ms,
                "timestamp": datetime.fromtimestamp(start_time_ms / 1000).isoformat(),
            }

            # Add agentId if available
            if agent_id:
                trace_data["agentId"] = agent_id

            # Send trace to API
            await self._send_trace(trace_data)

            # Store trace info for post-execution
            self.current_traces[skill_name] = {
                "id": id,
                "start_time_ms": start_time_ms,
            }

        except Exception as e:
            print(f"[SkillTraceHook] Failed to record pre-execution trace: {e}")

        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Called after skill execution.

        Records the final skill trace with output, status, and timing.
        """
        try:
            task_id = context.task_id or "unknown"
            skill_name = context.skill_name

            # Get stored trace info
            trace_info = self.current_traces.get(skill_name)
            if not trace_info:
                print(f"[SkillTraceHook] No pre-execution trace found for {skill_name}")
                return result

            # Use the stored start time but generate new id for post-execution
            start_time_ms = trace_info["start_time_ms"]
            completed_at_ms = int(time.time() * 1000)
            duration_ms = completed_at_ms - start_time_ms
            id = f"{task_id}-{skill_name}-skill-post"

            # Determine final status
            success = result.get("success", True)
            status = "completed" if success else "failed"

            # Get agentId if available
            agent_id = getattr(context, 'agent_id', None)

            # Create completion trace entry
            trace_data = {
                "id": id,
                "taskId": task_id,
                "level": "skill",
                "stage": "post_execution",
                "skillName": skill_name,
                "status": status,
                "startedAt": start_time_ms,
                "completedAt": completed_at_ms,
                "durationMs": duration_ms,
                "timestamp": datetime.fromtimestamp(completed_at_ms / 1000).isoformat(),
            }

            # Add agentId if available
            if agent_id:
                trace_data["agentId"] = agent_id

            # Add output data for successful execution
            if success:
                trace_data["outputData"] = {
                    "success": True,
                    "result": {k: v for k, v in result.items()
                              if not k.startswith("_")},
                }
            else:
                # Add error data for failed execution
                trace_data["errorData"] = {
                    "message": result.get("error", "Unknown error"),
                    "stack": result.get("error_stack"),
                }

            # Collect metadata (LLM calls, tokens, etc.)
            metadata = {}
            if hasattr(context, 'llm_calls'):
                metadata["llm_calls"] = context.llm_calls
            if hasattr(context, 'total_tokens'):
                metadata["total_tokens"] = context.total_tokens
            if metadata:
                trace_data["metadata"] = metadata

            # Send trace to API
            await self._send_trace(trace_data)

            # Clear stored trace info
            del self.current_traces[skill_name]

        except Exception as e:
            print(f"[SkillTraceHook] Failed to record post-execution trace: {e}")

        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Called during skill execution for progress notifications.

        Optionally records intermediate progress traces.
        Current implementation: don't send progress traces to avoid noise.
        """
        # Progress traces can be noisy; disabled by default
        # Uncomment below to enable progress tracing:
        #
        # try:
        #     task_id = context.task_id or "unknown"
        #     skill_name = context.skill_name
        #
        #     trace_data = {
        #         "traceId": f"{task_id}-{skill_name}-progress-{int(time.time() * 1000)}",
        #         "taskId": task_id,
        #         "traceType": "skill",
        #         "skillName": skill_name,
        #         "status": "running",
        #         "startedAt": int(time.time() * 1000),
        #         "metadata": {
        #             "progress": progress_data,
        #         },
        #     }
        #
        #     agent_id = getattr(context, 'agent_id', None)
        #     if agent_id:
        #         trace_data["agentId"] = agent_id
        #
        #     await self._send_trace(trace_data)
        # except Exception as e:
        #     print(f"[SkillTraceHook] Failed to record progress trace: {e}")

        return progress_data

    async def close(self):
        """Close HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
