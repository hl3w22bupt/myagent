"""
Unit tests for SkillHookExecutor
"""
import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from core.skill.hooks.executor import SkillHookExecutor
from core.skill.hooks.base import (
    BaseHook,
    NoOpHook,
    SkillContext,
    HookResult,
    HookResultAction
)


class MockHook(BaseHook):
    """Mock hook for testing."""

    def __init__(self):
        self.pre_exec_called = False
        self.post_exec_called = False
        self.progress_called = False

    async def pre_exec(self, context: SkillContext):
        self.pre_exec_called = True
        return None

    async def post_exec(self, context: SkillContext, result):
        self.post_exec_called = True
        return result

    async def on_progressing_notify(self, context: SkillContext, progress_data):
        self.progress_called = True
        return {}


class TestSkillHookExecutor:
    """Test SkillHookExecutor class."""

    def test_init_with_no_params(self):
        """Test initialization with no parameters."""
        executor = SkillHookExecutor()
        assert isinstance(executor.hook, NoOpHook)
        assert executor.notify_api_url is None
        assert executor._http_client is None

    def test_init_with_hook(self):
        """Test initialization with custom hook."""
        hook = MockHook()
        executor = SkillHookExecutor(hook=hook)
        assert executor.hook == hook
        assert executor.notify_api_url is None

    def test_init_with_notify_url(self):
        """Test initialization with notify API URL."""
        executor = SkillHookExecutor(notify_api_url="http://localhost:3000/api/notify")
        assert executor.notify_api_url == "http://localhost:3000/api/notify"
        assert isinstance(executor.hook, NoOpHook)

    @pytest.mark.asyncio
    async def test_close_without_http_client(self):
        """Test close without HTTP client."""
        executor = SkillHookExecutor()
        await executor.close()
        assert executor._http_client is None

    @pytest.mark.asyncio
    async def test_report_progress_calls_hook(self):
        """Test that report_progress calls hook's on_progressing_notify."""
        hook = MockHook()
        executor = SkillHookExecutor(hook=hook, notify_api_url=None)

        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456"
        )

        await executor.report_progress(context, "step", {"message": "test"})

        assert hook.progress_called

    @pytest.mark.asyncio
    async def test_execute_with_hooks_calls_pre_exec(self):
        """Test that execute_with_hooks calls pre_exec."""
        hook = MockHook()
        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True}

        result = await executor.execute_with_hooks("test", skill_func, {})

        assert hook.pre_exec_called
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_execute_with_hooks_calls_post_exec(self):
        """Test that execute_with_hooks calls post_exec."""
        hook = MockHook()
        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True}

        result = await executor.execute_with_hooks("test", skill_func, {})

        assert hook.post_exec_called
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_execute_with_hooks_stop_on_pre_exec_stop(self):
        """Test that execute_with_hooks stops when pre_exec returns STOP."""
        hook = MockHook()

        async def stop_pre_exec(context: SkillContext):
            hook.pre_exec_called = True
            return HookResult(action=HookResultAction.STOP, reason="Test stop")

        hook.pre_exec = stop_pre_exec

        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True}

        result = await executor.execute_with_hooks("test", skill_func, {})

        assert hook.pre_exec_called is True
        assert result["success"] is False
        assert "Stopped by pre-hook" in result["error"]
        assert result["reason"] == "Test stop"

    @pytest.mark.asyncio
    async def test_execute_with_hooks_uses_modified_input(self):
        """Test that execute_with_hooks uses modified input from pre_exec."""
        hook = MockHook()

        async def modify_pre_exec(context: SkillContext):
            hook.pre_exec_called = True
            return HookResult(modified_input={"query": "modified"})

        hook.pre_exec = modify_pre_exec

        executor = SkillHookExecutor(hook=hook)

        received_input = {}

        async def skill_func(input_data):
            nonlocal received_input
            received_input = input_data
            return {"success": True}

        result = await executor.execute_with_hooks("test", skill_func, {"query": "original"})

        assert received_input["query"] == "modified"

    @pytest.mark.asyncio
    async def test_execute_with_hooks_handles_skill_exception(self):
        """Test that execute_with_hooks handles skill exceptions gracefully."""
        hook = MockHook()
        executor = SkillHookExecutor(hook=hook)

        async def failing_skill(input_data):
            raise ValueError("Skill failed")

        result = await executor.execute_with_hooks("test", failing_skill, {})

        assert result["success"] is False
        assert "Skill failed" in result["error"]
        assert hook.post_exec_called  # post_exec should still be called

    @pytest.mark.asyncio
    async def test_execute_with_hooks_applies_post_exec_modifications(self):
        """Test that execute_with_hooks applies post_exec modifications."""
        hook = MockHook()

        async def modify_post_exec(context, result):
            hook.post_exec_called = True
            result["extra"] = "metadata"
            return result

        hook.post_exec = modify_post_exec

        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True}

        result = await executor.execute_with_hooks("test", skill_func, {})

        assert result["extra"] == "metadata"

    @pytest.mark.asyncio
    async def test_execute_with_hooks_handles_pre_exec_exception(self):
        """Test that execute_with_hooks handles pre_exec exceptions gracefully."""
        hook = MockHook()

        async def failing_pre_exec(context: SkillContext):
            raise RuntimeError("Pre-hook failed")

        hook.pre_exec = failing_pre_exec

        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True}

        # Should continue despite pre_exec exception
        result = await executor.execute_with_hooks("test", skill_func, {})

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_execute_with_hooks_handles_post_exec_exception(self):
        """Test that execute_with_hooks handles post_exec exceptions gracefully."""
        hook = MockHook()

        async def failing_post_exec(context, result):
            raise RuntimeError("Post-hook failed")

        hook.post_exec = failing_post_exec

        executor = SkillHookExecutor(hook=hook)

        async def skill_func(input_data):
            return {"success": True, "data": "test"}

        result = await executor.execute_with_hooks("test", skill_func, {})

        # Should return original result despite post_exec exception
        assert result["success"] is True
        assert result["data"] == "test"
