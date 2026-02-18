"""
Claude Skills Integration

Convenience functions for integrating Claude Skills with the myagent system.

This module provides simple entry points for:
- Creating a SkillExecutor with Claude Skills support
- Initializing the Virtual Skill Registry
- Getting a unified skill interface
"""

from typing import Optional, List
from pathlib import Path
from .executor import SkillExecutor
from .registry import SkillRegistry
from .adapters.virtual_skill_registry import VirtualSkillRegistry
from .adapters.claude_skill_scanner import ClaudeSkillScanner
from .adapters.claude_skill_analyzer import ClaudeSkillAnalyzer
from .adapters.myagent_skill_generator import MyagentSkillGenerator
from .hooks.base import BaseHook


async def create_executor_with_claude_skills(
    skills_dir: str = 'skills/',
    claude_skills_paths: Optional[List[str]] = None,
    hooks: Optional[List[BaseHook]] = None,
    notify_hook_api_url: Optional[str] = None
) -> SkillExecutor:
    """
    Create a SkillExecutor with Claude Skills support.

    This is the recommended way to create an executor that supports both
    native myagent skills and Claude Skills.

    Args:
        skills_dir: Path to native myagent skills directory
        claude_skills_paths: List of paths to scan for Claude Skills (SKILL.md files)
        hooks: Optional list of hook instances
        notify_hook_api_url: Optional URL for progress notifications

    Returns:
        Initialized SkillExecutor with Claude Skills support

    Example:
        >>> executor = await create_executor_with_claude_skills()
        >>> result = await executor.execute('my-claude-skill', {'task': 'do something'})
    """
    # Create virtual registry for Claude Skills
    virtual_registry = None

    if claude_skills_paths is not None:
        # Create scanner with custom paths
        scanner = ClaudeSkillScanner(scan_paths=claude_skills_paths)
    else:
        # Use default paths from config
        scanner = ClaudeSkillScanner()

    # Check if any Claude Skills exist
    skill_files = scanner.scan()

    if skill_files:
        # Create analyzer and generator
        analyzer = ClaudeSkillAnalyzer()
        generator = MyagentSkillGenerator()

        # Create virtual registry
        virtual_registry = VirtualSkillRegistry(
            scanner=scanner,
            analyzer=analyzer,
            generator=generator
        )

        # Scan and register Claude Skills
        await virtual_registry.scan()

        import sys
        print(f"Loaded {len(virtual_registry.get_skill_names())} Claude Skills", file=sys.stderr)

    # Create executor with virtual registry
    executor = SkillExecutor(
        skills_dir=skills_dir,
        hooks=hooks,
        notify_hook_api_url=notify_hook_api_url,
        virtual_registry=virtual_registry
    )

    # Ensure loaded
    await executor.ensure_loaded()

    return executor


async def list_all_skills(
    skills_dir: str = 'skills/',
    claude_skills_paths: Optional[List[str]] = None
) -> dict:
    """
    List all available skills (both native and Claude Skills).

    Args:
        skills_dir: Path to native myagent skills directory
        claude_skills_paths: Optional paths to scan for Claude Skills

    Returns:
        Dictionary with 'native' and 'claude' skill lists

    Example:
        >>> skills = await list_all_skills()
        >>> print(f"Native: {len(skills['native'])}, Claude: {len(skills['claude'])}")
    """
    # List native skills
    native_registry = SkillRegistry(skills_dir)
    await native_registry.scan()
    native_skills = native_registry.list()

    # List Claude Skills
    claude_skills = []
    if claude_skills_paths:
        scanner = ClaudeSkillScanner(scan_paths=claude_skills_paths)
    else:
        scanner = ClaudeSkillScanner()

    skill_files = scanner.scan()

    if skill_files:
        analyzer = ClaudeSkillAnalyzer()
        virtual_registry = VirtualSkillRegistry(scanner=scanner, analyzer=analyzer)
        await virtual_registry.scan()
        claude_skills = virtual_registry.list()

    return {
        'native': native_skills,
        'claude': claude_skills,
        'total': len(native_skills) + len(claude_skills)
    }


def get_claude_skill_paths() -> List[str]:
    """
    Get default Claude Skills scan paths from config.

    Returns:
        List of paths to scan for Claude Skills

    Example:
        >>> paths = get_claude_skill_paths()
        >>> print(f"Scanning: {paths}")
    """
    import yaml
    from pathlib import Path

    config_path = Path("config/claude-skills-adapter.yaml")

    if not config_path.exists():
        return [".claude/skills"]

    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            return config.get('claude_skills', {}).get('scan_paths', ['.claude/skills'])
    except Exception:
        return [".claude/skills"]


async def check_claude_skills_available() -> bool:
    """
    Check if any Claude Skills are available.

    Returns:
        True if Claude Skills were found, False otherwise

    Example:
        >>> if await check_claude_skills_available():
        ...     print("Claude Skills support is available")
    """
    scanner = ClaudeSkillScanner()
    skill_files = scanner.scan()
    return len(skill_files) > 0
