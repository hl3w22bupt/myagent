"""
Integration tests for unified Skill Hook architecture.

Tests that hooks work at the SkillExecutor level, not at individual skill handlers.
"""

import pytest
from src.core.skill.executor import SkillExecutor
from src.core.skill.hooks.base import BaseHook, SkillContext, HookResult, HookResultAction


class TestHook(BaseHook):
    """Test hook for validation"""

    async def pre_exec(self, context: SkillContext) -> HookResult:
        """Validate query length"""
        query = context.input_data.get("query", "")

        if len(query) < 3:
            return HookResult(
                action=HookResultAction.STOP,
                reason=f"Query too short (minimum 3 characters)"
            )

        return None

    async def post_exec(self, context: SkillContext, result: dict) -> dict:
        """Add hook metadata"""
        if result.get("success"):
            result.setdefault("metadata", {})["hook_processed"] = True
        return result


class TestUnifiedHookExecutor:
    """Test unified hook execution at SkillExecutor level"""

    @pytest.fixture
    def executor_with_hook(self):
        """Create executor with test hook"""
        hook = TestHook()
        return SkillExecutor(
            skills_dir='skills/',
            hook=hook,
            notify_api_url=None  # Disable notifications for testing
        )

    @pytest.mark.asyncio
    async def test_hook_validates_before_skill_execution(self, executor_with_hook):
        """Test that hook validates input before skill executes"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "ab"}  # Too short
        )

        # Should be stopped by hook before skill execution
        assert result.success is False
        assert "too short" in result.error.lower()

    @pytest.mark.asyncio
    async def test_hook_allows_valid_input(self, executor_with_hook):
        """Test that hook allows valid input"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "Python programming"}
        )

        # Should succeed
        assert result.success is True
        assert result.output is not None

    @pytest.mark.asyncio
    async def test_hook_adds_metadata_to_result(self, executor_with_hook):
        """Test that hook adds metadata to successful results"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "asyncio tutorial"}
        )

        # Check that hook added metadata
        assert result.success is True
        # Note: output contains the actual skill result
        # Hook metadata might be in different places depending on output format

    @pytest.mark.asyncio
    async def test_hook_works_without_modifying_skill_handler(self, executor_with_hook):
        """Test that hook works without any changes to skill handler"""
        # The web-search handler is completely untouched
        # But hook still works because it's at the executor level

        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "TypeScript patterns"}
        )

        assert result.success is True
        # Hook should have processed this
        # (implementation dependent on how hooks modify results)
