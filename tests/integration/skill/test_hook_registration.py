"""
Skill Hook Registration Tests

Tests for the skill hook system integration.
"""
import pytest
import asyncio
from core.skill.executor import SkillExecutor
from core.skill.hooks.system.progress_notification_hook import ProgressNotificationHook


class HookExecutionTracker:
    """Tracker to verify hook execution."""

    def __init__(self):
        self.pre_exec_called = False
        self.post_exec_called = False
        self.progress_notify_called = False

    async def pre_exec(self, context):
        self.pre_exec_called = True
        return {}

    async def post_exec(self, context, result):
        self.post_exec_called = True
        return {}

    async def on_progressing_notify(self, context, progress_data):
        self.progress_notify_called = True
        return {}


class MyCustomHook(HookExecutionTracker):
    """Custom hook implementation for testing."""

    def __init__(self):
        super().__init__()


@pytest.mark.asyncio
async def test_default_hooks_are_registered():
    """Test that default hooks are automatically registered."""
    executor = SkillExecutor(notify_hook_api_url="http://localhost:3000/api/notify")

    # Check if ProgressNotificationHook is registered
    progress_hooks = [h for h in executor.hook_executor.hook_manager.hooks
                     if isinstance(h, ProgressNotificationHook)]
    assert len(progress_hooks) == 1


@pytest.mark.asyncio
async def test_custom_hooks_are_registered():
    """Test that custom hooks are properly registered."""
    custom_hook = MyCustomHook()
    executor = SkillExecutor(hooks=[custom_hook])

    assert any(isinstance(h, MyCustomHook) for h in executor.hook_executor.hook_manager.hooks)


@pytest.mark.asyncio
async def test_duplicate_hooks_are_deduplicated():
    """Test that duplicate hooks are deduplicated."""
    # Create two identical hooks
    hook1 = ProgressNotificationHook("http://localhost:3000/api/notify")
    hook2 = ProgressNotificationHook("http://localhost:3000/api/notify")

    executor = SkillExecutor(
        notify_hook_api_url="http://localhost:3000/api/notify",
        hooks=[hook1, hook2]
    )

    # Should only have one ProgressNotificationHook instance
    progress_hooks = [h for h in executor.hook_executor.hook_manager.hooks
                     if isinstance(h, ProgressNotificationHook)]
    assert len(progress_hooks) == 1


@pytest.mark.asyncio
async def test_all_hooks_are_executed():
    """Test that all registered hooks are executed."""
    tracker = HookExecutionTracker()
    executor = SkillExecutor(
        notify_hook_api_url="http://localhost:3000/api/notify",
        hooks=[tracker]
    )

    # Execute a skill (we'll use a mock skill for testing)
    # For this test, we need to ensure the registry is properly initialized
    await executor.ensure_loaded()

    # Check if any skills are available
    skills = executor.list_skills()
    if skills:
        # Execute the first available skill with dummy input
        result = await executor.execute(skills[0]['name'], {"query": "test"})
        assert result.success is True

    assert tracker.pre_exec_called
    assert tracker.post_exec_called
    assert tracker.progress_notify_called


if __name__ == "__main__":
    # Run tests if this file is executed directly
    asyncio.run(test_default_hooks_are_registered())
    print("✓ test_default_hooks_are_registered passed")

    asyncio.run(test_custom_hooks_are_registered())
    print("✓ test_custom_hooks_are_registered passed")

    asyncio.run(test_duplicate_hooks_are_deduplicated())
    print("✓ test_duplicate_hooks_are_deduplicated passed")

    print("All tests passed!")
