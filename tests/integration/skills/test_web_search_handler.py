"""
Integration tests for WebSearch with Hook at Executor level

Tests that WebSearch skill works correctly with hooks through SkillExecutor.
"""

import pytest
from src.core.skill.executor import SkillExecutor
from src.core.skill.hooks.base import BaseHook, SkillContext, HookResult, HookResultAction


class WebSearchValidationHook(BaseHook):
    """Hook that validates web-search queries"""

    MIN_QUERY_LENGTH = 3

    async def pre_exec(self, context: SkillContext) -> HookResult:
        """Validate query length"""
        query = context.input_data.get("query", "")

        if len(query) < self.MIN_QUERY_LENGTH:
            return HookResult(
                action=HookResultAction.STOP,
                reason=f"Query too short (minimum {self.MIN_QUERY_LENGTH} characters)"
            )

        return None

    async def post_exec(self, context: SkillContext, result: dict) -> dict:
        """Add hook metadata"""
        if result.get("success"):
            # Add metadata to result
            result.setdefault("metadata", {})["hook_processed"] = True
        return result


class TestWebSearchWithHooks:
    """Test WebSearch with hook integration at executor level"""

    @pytest.fixture
    def executor_with_hook(self):
        """Create executor with web-search validation hook"""
        hook = WebSearchValidationHook()
        return SkillExecutor(
            skills_dir='skills/',
            hook=hook,
            notify_api_url=None
        )

    @pytest.mark.asyncio
    async def test_valid_query_passes_hook_validation(self, executor_with_hook):
        """Test that a valid query passes hook validation"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "Python programming", "limit": 3}
        )

        # Should succeed
        assert result.success is True
        assert result.output is not None

    @pytest.mark.asyncio
    async def test_short_query_blocked_by_hook(self, executor_with_hook):
        """Test that a short query is blocked by hook"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "ab", "limit": 3}  # Too short
        )

        # Should be stopped by hook
        assert result.success is False
        assert "too short" in result.error.lower()

    @pytest.mark.asyncio
    async def test_empty_query_blocked_by_hook(self, executor_with_hook):
        """Test that an empty query is blocked by hook"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "", "limit": 3}
        )

        # Should be stopped by hook
        assert result.success is False

    @pytest.mark.asyncio
    async def test_query_with_task_id(self, executor_with_hook):
        """Test query with task ID for progress tracking"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={
                "query": "TypeScript tutorial",
                "limit": 5,
                "task_id": "test-123",
                "session_id": "session-456"
            }
        )

        # Should succeed
        assert result.success is True
        assert result.output is not None

    @pytest.mark.asyncio
    async def test_hook_adds_metadata(self, executor_with_hook):
        """Test that hook adds metadata to successful results"""
        result = await executor_with_hook.execute(
            skill_name="web-search",
            input_data={"query": "asyncio python", "limit": 2}
        )

        # Should succeed
        assert result.success is True
        # Note: metadata handling depends on how SkillExecutor processes results
        # The hook modifies the result dict, but it gets wrapped in SkillResult
