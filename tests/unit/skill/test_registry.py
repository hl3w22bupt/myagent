"""
Unit tests for Skill Registry.
"""

import pytest
import asyncio
from core.skill.registry import SkillRegistry
from core.skill.types import SkillType


@pytest.mark.asyncio
async def test_registry_scan():
    """Test that registry can scan and discover skills."""
    registry = SkillRegistry('skills/')

    metadata = await registry.scan()

    assert len(metadata) > 0
    assert 'web-search' in metadata
    assert 'summarize' in metadata
    assert 'code-analysis' in metadata

    # Check metadata structure
    web_search = metadata['web-search']
    assert web_search.name == 'web-search'
    assert web_search.type == SkillType.HYBRID
    assert len(web_search.tags) > 0


@pytest.mark.asyncio
async def test_registry_load_full():
    """Test loading full skill definitions."""
    registry = SkillRegistry('skills/')
    await registry.scan()

    # Load full definition
    skill = await registry.load_full('summarize')

    assert skill.name == 'summarize'
    assert skill.type == SkillType.PURE_PROMPT
    assert skill.prompt_template is not None
    assert skill.input_schema is not None
    assert skill.output_schema is not None


@pytest.mark.asyncio
async def test_registry_list_with_tags():
    """Test filtering skills by tags."""
    registry = SkillRegistry('skills/')
    await registry.scan()

    # List all skills
    all_skills = registry.list()
    assert len(all_skills) == 3

    # Filter by tag
    search_skills = registry.list(tags=['search'])
    assert len(search_skills) == 1
    assert search_skills[0].name == 'web-search'


@pytest.mark.asyncio
async def test_cache_full_definitions():
    """Test that full definitions are cached."""
    registry = SkillRegistry('skills/')
    await registry.scan()

    # First load
    skill1 = await registry.load_full('code-analysis')
    assert skill1 is not None

    # Second load should return cached version
    skill2 = await registry.load_full('code-analysis')
    assert skill2 is skill1


def test_skill_types():
    """Test SkillType enum."""
    assert SkillType.PURE_PROMPT == "pure-prompt"
    assert SkillType.PURE_SCRIPT == "pure-script"
    assert SkillType.HYBRID == "hybrid"
