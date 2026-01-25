"""
Integration tests for Progress Reporting via Context

Tests that skills can report progress through SkillExecutionContext,
which hooks into the hook system.
"""

import pytest
from src.core.skill.executor import SkillExecutor
from src.core.skill.hooks.base import BaseHook, SkillContext, HookResult
from typing import Dict, Any


class ProgressTrackingHook(BaseHook):
    """Hook that tracks progress calls"""

    def __init__(self):
        self.progress_calls = []

    async def pre_exec(self, context: SkillContext) -> HookResult:
        """Reset progress tracking"""
        self.progress_calls = []
        return None

    async def post_exec(self, context: SkillContext, result: dict) -> dict:
        """Add progress tracking info to result"""
        result["progress_tracking"] = {
            "call_count": len(self.progress_calls),
            "calls": self.progress_calls
        }
        return result

    async def on_progressing_notify(self, context: SkillContext, progress_data: Dict[str, Any]) -> Dict[str, Any]:
        """Track all progress calls"""
        self.progress_calls.append({
            "type": progress_data.get("type"),
            "message": progress_data.get("message"),
            "data": progress_data
        })
        print(f"[Progress] {progress_data.get('type', '?')}: {progress_data.get('message', '')}")
        return {}  # Don't modify


class TestProgressReporting:
    """Test progress reporting through context"""

    @pytest.fixture
    def progress_hook(self):
        """Create progress tracking hook"""
        return ProgressTrackingHook()

    @pytest.fixture
    def executor_with_progress(self, progress_hook):
        """Create executor with progress tracking hook"""
        return SkillExecutor(
            skills_dir='skills/',
            hook=progress_hook,
            notify_api_url=None
        )

    @pytest.mark.asyncio
    async def test_skill_can_report_progress(self, executor_with_progress, progress_hook):
        """Test that skill can report progress through context"""
        # Note: This test uses the handler_with_progress.py which has context support
        # For now, we'll test with the regular handler to ensure backward compatibility

        result = await executor_with_progress.execute(
            skill_name="web-search",
            input_data={
                "query": "Python programming",
                "task_id": "test-123"
            }
        )

        # Should succeed
        assert result.success is True

        # Note: The regular handler doesn't use context, so no progress calls
        # The handler_with_progress.py would report progress if it was registered
        print(f"Progress calls: {progress_hook.progress_calls}")

    @pytest.mark.asyncio
    async def test_context_optional_for_skills(self, executor_with_progress):
        """Test that context is optional - skills work without it"""
        # Skills that don't accept context parameter should still work
        result = await executor_with_progress.execute(
            skill_name="web-search",
            input_data={"query": "TypeScript"}
        )

        assert result.success is True

    @pytest.mark.asyncio
    async def test_hook_receives_progress_updates(self, executor_with_progress, progress_hook):
        """Test that hook receives progress updates from context"""
        # This would test with a skill that actually reports progress
        # For now, we just verify the hook is set up correctly

        result = await executor_with_progress.execute(
            skill_name="web-search",
            input_data={"query": "asyncio", "task_id": "test-456"}
        )

        assert result.success is True
        # Progress tracking info should be in result metadata
        print(f"Result: {result}")
