"""
Virtual Skill Registry

In-memory registry for Claude Skills adapted to myagent.

This registry provides fast access to adapted Claude Skills without
generating skill.yaml files. It integrates with the existing SkillRegistry.
"""

import asyncio
from typing import Dict, List, Optional, TYPE_CHECKING
from pathlib import Path

from .claude_skill_scanner import ClaudeSkillScanner, ClaudeSkillFile
from .claude_skill_analyzer import ClaudeSkillAnalyzer, ClaudeSkillInfo
from .myagent_skill_generator import MyagentSkillGenerator

from ..types import SkillDefinition, SkillMetadata


class VirtualSkill:
    """
    Represents a Claude Skill adapted for myagent.

    A VirtualSkill wraps a Claude Skill with myagent-compatible metadata.
    """

    def __init__(
        self,
        skill_info: ClaudeSkillInfo,
        definition: SkillDefinition
    ):
        """
        Initialize a VirtualSkill.

        Args:
            skill_info: Parsed ClaudeSkillInfo
            definition: myagent SkillDefinition
        """
        self.skill_info = skill_info
        self.definition = definition

    @property
    def name(self) -> str:
        """Get skill name."""
        return self.definition.name

    @property
    def metadata(self) -> SkillMetadata:
        """Get skill metadata."""
        return SkillMetadata(**self.definition.dict())

    def __repr__(self) -> str:
        return f"VirtualSkill(name='{self.name}', type='{self.definition.type}')"


class VirtualSkillRegistry:
    """
    In-memory registry for Claude Skills adapted to myagent.

    This registry scans Claude Skills, analyzes them, and creates
    virtual mappings that can be used by the SkillExecutor.
    """

    def __init__(
        self,
        scanner: Optional[ClaudeSkillScanner] = None,
        analyzer: Optional[ClaudeSkillAnalyzer] = None,
        generator: Optional[MyagentSkillGenerator] = None
    ):
        """
        Initialize the Virtual Skill Registry.

        Args:
            scanner: Optional ClaudeSkillScanner instance
            analyzer: Optional ClaudeSkillAnalyzer instance
            generator: Optional MyagentSkillGenerator instance
        """
        self.scanner = scanner or ClaudeSkillScanner()
        self.analyzer = analyzer or ClaudeSkillAnalyzer()
        self.generator = generator or MyagentSkillGenerator()

        self._virtual_skills: Dict[str, VirtualSkill] = {}
        self._loaded = False

    async def scan(self) -> Dict[str, VirtualSkill]:
        """
        Scan and register all Claude Skills.

        This is the main entry point for discovering Claude Skills.

        Returns:
            Dictionary mapping skill names to VirtualSkill instances
        """
        # Scan for Claude Skill files
        skill_files = self.scanner.scan()

        # Process each skill file
        tasks = [
            self._register_skill(skill_file)
            for skill_file in skill_files
        ]

        # Load all skills in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                print(f"Warning: Failed to load Claude Skill: {result}")
                continue
            if isinstance(result, VirtualSkill):
                self._virtual_skills[result.name] = result

        self._loaded = True
        return self._virtual_skills

    async def _register_skill(self, skill_file: ClaudeSkillFile) -> VirtualSkill:
        """
        Analyze and register a single Claude Skill.

        Args:
            skill_file: ClaudeSkillFile to register

        Returns:
            VirtualSkill instance
        """
        # Analyze the skill
        skill_info = self.analyzer.analyze(skill_file)

        # Convert to virtual skill
        virtual_skill = self.generator.to_virtual_skill(skill_info)

        return virtual_skill

    async def load_full(self, skill_name: str) -> SkillDefinition:
        """
        Load full skill definition by name.

        This method is compatible with the SkillRegistry interface.

        Args:
            skill_name: Name of the skill to load

        Returns:
            SkillDefinition

        Raises:
            ValueError: If skill not found
        """
        if not self._loaded:
            await self.scan()

        if skill_name not in self._virtual_skills:
            raise ValueError(
                f"Claude Skill '{skill_name}' not found in registry. "
                f"Available skills: {list(self._virtual_skills.keys())}"
            )

        return self._virtual_skills[skill_name].definition

    async def get_metadata(self, skill_name: str) -> SkillMetadata:
        """
        Get skill metadata without loading full definition.

        Args:
            skill_name: Name of the skill

        Returns:
            SkillMetadata

        Raises:
            ValueError: If skill not found
        """
        if not self._loaded:
            await self.scan()

        if skill_name not in self._virtual_skills:
            raise ValueError(f"Claude Skill '{skill_name}' not found")

        return self._virtual_skills[skill_name].metadata

    def list(self, tags: Optional[List[str]] = None) -> List[SkillMetadata]:
        """
        List available skills, optionally filtered by tags.

        Args:
            tags: Optional list of tags to filter by

        Returns:
            List of SkillMetadata objects
        """
        if not self._loaded:
            # Return empty list if not loaded (sync method)
            return []

        skills = list(self._virtual_skills.values())

        if tags:
            skills = [
                s for s in skills
                if any(tag in s.definition.tags for tag in tags)
            ]

        return [s.metadata for s in skills]

    def get_skill_names(self) -> List[str]:
        """
        Get list of all registered skill names.

        Returns:
            List of skill names
        """
        return list(self._virtual_skills.keys())

    def is_loaded(self) -> bool:
        """Check if registry has been scanned."""
        return self._loaded

    def clear(self):
        """Clear all registered skills."""
        self._virtual_skills.clear()
        self._loaded = False

    def get_virtual_skill(self, skill_name: str) -> Optional[VirtualSkill]:
        """
        Get VirtualSkill by name.

        Args:
            skill_name: Name of the skill

        Returns:
            VirtualSkill if found, None otherwise
        """
        return self._virtual_skills.get(skill_name)

    def has_skill(self, skill_name: str) -> bool:
        """
        Check if a skill is registered.

        Args:
            skill_name: Name of the skill

        Returns:
            True if skill exists, False otherwise
        """
        return skill_name in self._virtual_skills


# Convenience function for quick registry access
async def create_virtual_registry() -> VirtualSkillRegistry:
    """
    Create and initialize a Virtual Skill Registry.

    Returns:
        Initialized VirtualSkillRegistry instance
    """
    registry = VirtualSkillRegistry()
    await registry.scan()
    return registry
