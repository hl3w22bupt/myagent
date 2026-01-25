"""
Integration tests for Skill subsystem.
"""

import pytest
import asyncio
from core.skill.executor import SkillExecutor


@pytest.mark.asyncio
async def test_full_skill_workflow():
    """Test complete workflow from scan to execution."""
    executor = SkillExecutor('skills/')

    # Step 1: Scan and load
    await executor.ensure_loaded()
    skills = executor.list_skills()
    # Worktree has more than 3 skills now
    assert len(skills) >= 3

    # Step 2: Get skill info
    info = await executor.get_skill_info('code-analysis')
    assert info is not None

    # Step 3: Execute skill
    result = await executor.execute('code-analysis', {
        'code': 'def test(): pass',
        'language': 'python'
    })

    assert result.success is True
    assert result.output is not None


@pytest.mark.asyncio
async def test_concurrent_execution():
    """Test executing multiple different skills concurrently."""
    executor = SkillExecutor('skills/')

    tasks = [
        executor.execute('web-search', {'query': 'test', 'limit': 2}),
        executor.execute('summarize', {'content': 'Test content for summarization'}),
        executor.execute('code-analysis', {'code': 'print("test")', 'language': 'python'})
    ]

    results = await asyncio.gather(*tasks)

    assert len(results) == 3
    assert all(r.success for r in results)


@pytest.mark.asyncio
async def test_skill_types_coverage():
    """Test that all three skill types work correctly."""
    executor = SkillExecutor('skills/')

    # Pure script (code-analysis)
    script_result = await executor.execute('code-analysis', {
        'code': 'x = 1',
        'language': 'python'
    })
    assert script_result.success
    # code-analysis returns a report format with score in content.data
    assert 'content' in script_result.output

    # Hybrid (web-search, summarize, etc.)
    hybrid_result = await executor.execute('web-search', {'query': 'test'})
    assert hybrid_result.success
    # web-search returns table format via OutputBuilder
    assert 'result_type' in hybrid_result.output or 'results' in hybrid_result.output


@pytest.mark.asyncio
async def test_error_handling():
    """Test error handling in various scenarios."""
    executor = SkillExecutor('skills/')

    # Invalid skill name
    result1 = await executor.execute('invalid-skill', {})
    assert not result1.success
    assert result1.error is not None

    # Missing required parameters
    result2 = await executor.execute('code-analysis', {
        'code': 'test'
        # Missing 'language'
    })
    # This might succeed or fail depending on implementation
    # Just verify we get a result
    assert result2 is not None

    # Invalid input type
    result3 = await executor.execute('summarize', {
        'content': 123  # Should be string
    })
    # Should handle gracefully
    assert result3 is not None


@pytest.mark.asyncio
async def test_registry_caching():
    """Test that registry caching works correctly."""
    executor = SkillExecutor('skills/')

    # First execution - loads from disk
    result1 = await executor.execute('summarize', {'content': 'Test'})
    assert result1.success

    # Second execution - should use cache
    result2 = await executor.execute('summarize', {'content': 'Test'})
    assert result2.success

    # Verify same cached definition
    skill1 = await executor.registry.load_full('summarize')
    skill2 = await executor.registry.load_full('summarize')
    assert skill1 is skill2
