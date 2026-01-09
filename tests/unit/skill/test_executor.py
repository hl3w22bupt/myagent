"""
Unit tests for Skill Executor.
"""

import pytest
import asyncio
from core.skill.executor import SkillExecutor
from core.skill.types import SkillType


@pytest.mark.asyncio
async def test_executor_initialization():
    """Test executor initialization."""
    executor = SkillExecutor('skills/')

    assert executor.registry is not None
    assert not executor._loaded


@pytest.mark.asyncio
async def test_execute_pure_prompt_skill():
    """Test executing a pure-prompt skill."""
    executor = SkillExecutor('skills/')

    result = await executor.execute('summarize', {
        'content': 'This is a test document for summarization.',
        'max_length': 50
    })

    assert result.success is True
    assert result.output is not None
    assert result.output['type'] == 'prompt'
    assert 'content' in result.output


@pytest.mark.asyncio
async def test_execute_pure_script_skill():
    """Test executing a pure-script skill."""
    executor = SkillExecutor('skills/')

    result = await executor.execute('code-analysis', {
        'code': 'def hello():\n    print("Hello, World!")',
        'language': 'python'
    })

    assert result.success is True
    assert result.output is not None
    assert 'score' in result.output
    assert 0 <= result.output['score'] <= 100


@pytest.mark.asyncio
async def test_execute_hybrid_skill():
    """Test executing a hybrid skill."""
    executor = SkillExecutor('skills/')

    result = await executor.execute('web-search', {
        'query': 'Python programming',
        'limit': 3
    })

    assert result.success is True
    assert result.output is not None
    assert 'results' in result.output
    assert len(result.output['results']) == 3


@pytest.mark.asyncio
async def test_execute_batch():
    """Test executing multiple skills in parallel."""
    executor = SkillExecutor('skills/')

    executions = [
        {'skill_name': 'summarize', 'input_data': {'content': 'Test content 1'}},
        {'skill_name': 'summarize', 'input_data': {'content': 'Test content 2'}},
        {'skill_name': 'code-analysis', 'input_data': {'code': 'print("test")', 'language': 'python'}}
    ]

    results = await executor.execute_batch(executions)

    assert len(results) == 3
    assert all(r.success for r in results)


@pytest.mark.asyncio
async def test_skill_not_found():
    """Test executing non-existent skill."""
    executor = SkillExecutor('skills/')

    result = await executor.execute('non-existent-skill', {})

    assert result.success is False
    assert result.error is not None
    assert 'not found' in result.error.lower()


@pytest.mark.asyncio
async def test_list_skills():
    """Test listing available skills."""
    executor = SkillExecutor('skills/')
    await executor.ensure_loaded()

    skills = executor.list_skills()

    assert len(skills) == 3
    skill_names = [s['name'] for s in skills]
    assert 'web-search' in skill_names
    assert 'summarize' in skill_names
    assert 'code-analysis' in skill_names


@pytest.mark.asyncio
async def test_get_skill_info():
    """Test getting detailed skill information."""
    executor = SkillExecutor('skills/')

    info = await executor.get_skill_info('web-search')

    assert info['name'] == 'web-search'
    assert info['type'] == 'hybrid'
    assert 'input_schema' in info
    assert 'output_schema' in info
    assert info['has_execution'] is True


@pytest.mark.asyncio
async def test_execution_time_tracking():
    """Test that execution time is tracked."""
    executor = SkillExecutor('skills/')

    result = await executor.execute('summarize', {'content': 'Test'})

    assert result.execution_time > 0
    assert result.execution_time < 1.0  # Should be fast
