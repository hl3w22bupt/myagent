"""
Unit tests for Skill Hook Base Classes
"""
import pytest
import asyncio
from core.skill.hooks.base import (
    BaseHook,
    NoOpHook,
    HookResult,
    HookResultAction,
    SkillContext
)


class TestNoOpHook:
    """Test NoOpHook implementation."""

    @pytest.mark.asyncio
    async def test_pre_exec_returns_none(self):
        """Test that pre_exec returns None."""
        hook = NoOpHook()
        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456"
        )

        result = await hook.pre_exec(context)
        assert result is None

    @pytest.mark.asyncio
    async def test_post_exec_returns_result_unchanged(self):
        """Test that post_exec returns result unchanged."""
        hook = NoOpHook()
        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456"
        )
        result = {"success": True, "data": "test"}

        returned = await hook.post_exec(context, result)
        assert returned == result

    @pytest.mark.asyncio
    async def test_on_progressing_notify_returns_empty_dict(self):
        """Test that on_progressing_notify returns empty dict."""
        hook = NoOpHook()
        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456"
        )
        progress_data = {"message": "test"}

        result = await hook.on_progressing_notify(context, progress_data)
        assert result == {}


class TestHookResult:
    """Test HookResult dataclass."""

    def test_default_action_is_continue(self):
        """Test that default action is CONTINUE."""
        result = HookResult()
        assert result.action == HookResultAction.CONTINUE

    def test_stop_action(self):
        """Test creating STOP action result."""
        result = HookResult(action=HookResultAction.STOP, reason="Test reason")
        assert result.action == HookResultAction.STOP
        assert result.reason == "Test reason"

    def test_modified_input(self):
        """Test creating result with modified input."""
        modified = {"query": "modified"}
        result = HookResult(modified_input=modified)
        assert result.modified_input == modified

    def test_modified_output(self):
        """Test creating result with modified output."""
        modified = {"output": "modified"}
        result = HookResult(modified_output=modified)
        assert result.modified_output == modified


class TestSkillContext:
    """Test SkillContext dataclass."""

    def test_create_minimal_context(self):
        """Test creating context with required fields only."""
        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456"
        )
        assert context.skill_name == "test"
        assert context.task_id == "123"
        assert context.session_id == "456"
        assert context.input_data == {}
        assert context.metadata == {}
        assert context.execution_start_time == 0.0

    def test_create_full_context(self):
        """Test creating context with all fields."""
        input_data = {"query": "test"}
        metadata = {"key": "value"}
        context = SkillContext(
            skill_name="test",
            task_id="123",
            session_id="456",
            input_data=input_data,
            metadata=metadata,
            execution_start_time=123.456
        )
        assert context.input_data == input_data
        assert context.metadata == metadata
        assert context.execution_start_time == 123.456


class TestHookResultAction:
    """Test HookResultAction enum."""

    def test_continue_value(self):
        """Test CONTINUE enum value."""
        assert HookResultAction.CONTINUE == "continue"

    def test_stop_value(self):
        """Test STOP enum value."""
        assert HookResultAction.STOP == "stop"


class CustomHook(BaseHook):
    """Custom hook for testing abstract methods."""

    async def pre_exec(self, context: SkillContext):
        return None

    async def post_exec(self, context: SkillContext, result):
        return result


class TestBaseHook:
    """Test BaseHook abstract class."""

    @pytest.mark.asyncio
    async def test_custom_hook_can_be_instantiated(self):
        """Test that custom hook can be instantiated."""
        hook = CustomHook()
        assert isinstance(hook, BaseHook)

    @pytest.mark.asyncio
    async def test_base_hook_cannot_be_instantiated(self):
        """Test that BaseHook cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseHook()
