"""
Virtual Skill Registry

In-memory registry for Claude Skills adapted to myagent.

This registry provides fast access to adapted Claude Skills without
generating skill.yaml files. It integrates with the existing SkillRegistry.
"""

import asyncio
from typing import Dict, List, Optional, TYPE_CHECKING, Union
from pathlib import Path

from .claude_skill_scanner import ClaudeSkillScanner, ClaudeSkillFile
from .claude_skill_analyzer import ClaudeSkillAnalyzer, ClaudeSkillInfo
from .myagent_skill_generator import MyagentSkillGenerator

from ..types import SkillDefinition, SkillMetadata

# OpenClaw imports
try:
    from .openclaw_skill_scanner import OpenClawSkillScanner, OpenClawSkillFile
    from .openclaw_skill_analyzer import OpenClawSkillAnalyzer, OpenClawSkillInfo
    from .openclaw_metadata_mapper import OpenClawMetadataMapper
    OPENCLAW_AVAILABLE = True
except ImportError:
    OPENCLAW_AVAILABLE = False


class VirtualSkill:
    """
    Represents an adapted Skill (Claude or OpenClaw) for myagent.

    A VirtualSkill wraps an adapted skill with myagent-compatible metadata.
    """

    def __init__(
        self,
        skill_info: Union[ClaudeSkillInfo, OpenClawSkillInfo],
        definition: SkillDefinition,
        skill_type: str = "claude"  # "claude" or "openclaw"
    ):
        """
        Initialize a VirtualSkill.

        Args:
            skill_info: Parsed skill info (ClaudeSkillInfo or OpenClawSkillInfo)
            definition: myagent SkillDefinition
            skill_type: Type of adapted skill ("claude" or "openclaw")
        """
        self.skill_info = skill_info
        self.definition = definition
        self.skill_type = skill_type

    @property
    def name(self) -> str:
        """Get skill name."""
        return self.definition.name

    @property
    def metadata(self) -> SkillMetadata:
        """Get skill metadata."""
        return SkillMetadata(**self.definition.dict())

    def __repr__(self) -> str:
        return f"VirtualSkill(name='{self.name}', type='{self.definition.type}', source='{self.skill_type}')"


class VirtualSkillRegistry:
    """
    In-memory registry for adapted Skills (Claude and OpenClaw).

    This registry scans skills, analyzes them, and creates
    virtual mappings that can be used by the SkillExecutor.

    Phase 2 Enhancement: Now supports both Claude Skills and OpenClaw Skills.
    """

    def __init__(
        self,
        claude_scanner: Optional[ClaudeSkillScanner] = None,
        claude_analyzer: Optional[ClaudeSkillAnalyzer] = None,
        claude_generator: Optional[MyagentSkillGenerator] = None,
        openclaw_scanner: Optional[OpenClawSkillScanner] = None,
        openclaw_analyzer: Optional[OpenClawSkillAnalyzer] = None,
        openclaw_mapper: Optional[OpenClawMetadataMapper] = None
    ):
        """
        Initialize the Virtual Skill Registry.

        Args:
            claude_scanner: Optional ClaudeSkillScanner instance
            claude_analyzer: Optional ClaudeSkillAnalyzer instance
            claude_generator: Optional MyagentSkillGenerator instance
            openclaw_scanner: Optional OpenClawSkillScanner instance
            openclaw_analyzer: Optional OpenClawSkillAnalyzer instance
            openclaw_mapper: Optional OpenClawMetadataMapper instance
        """
        # Claude Skills components
        self.claude_scanner = claude_scanner or ClaudeSkillScanner()
        self.claude_analyzer = claude_analyzer or ClaudeSkillAnalyzer()
        self.claude_generator = claude_generator or MyagentSkillGenerator()

        # OpenClaw Skills components (if available)
        self.openclaw_scanner = openclaw_scanner
        self.openclaw_analyzer = openclaw_analyzer
        self.openclaw_mapper = openclaw_mapper

        if OPENCLAW_AVAILABLE:
            if not self.openclaw_scanner:
                self.openclaw_scanner = OpenClawSkillScanner()
            if not self.openclaw_analyzer:
                self.openclaw_analyzer = OpenClawSkillAnalyzer()
            if not self.openclaw_mapper:
                self.openclaw_mapper = OpenClawMetadataMapper()

        self._virtual_skills: Dict[str, VirtualSkill] = {}
        self._loaded = False

    async def scan(self) -> Dict[str, VirtualSkill]:
        """
        Scan and register all adapted Skills (Claude and OpenClaw).

        This is the main entry point for discovering adapted skills.

        Phase 2 Enhancement: Now scans both Claude Skills and OpenClaw Skills.

        Returns:
            Dictionary mapping skill names to VirtualSkill instances
        """
        # Scan for Claude Skill files
        claude_skill_files = self.claude_scanner.scan()

        # Process Claude Skills
        tasks = [
            self._register_claude_skill(skill_file)
            for skill_file in claude_skill_files
        ]

        # Scan for OpenClaw Skill files (if available)
        if OPENCLAW_AVAILABLE and self.openclaw_scanner:
            openclaw_skill_files = self.openclaw_scanner.scan()
            tasks.extend([
                self._register_openclaw_skill(skill_file)
                for skill_file in openclaw_skill_files
            ])

        # Load all skills in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                print(f"Warning: Failed to load adapted skill: {result}")
                continue
            if isinstance(result, VirtualSkill):
                self._virtual_skills[result.name] = result

        self._loaded = True
        return self._virtual_skills

    async def _register_claude_skill(self, skill_file: ClaudeSkillFile) -> VirtualSkill:
        """
        Analyze and register a single Claude Skill.

        Args:
            skill_file: ClaudeSkillFile to register

        Returns:
            VirtualSkill instance
        """
        # Analyze the skill
        skill_info = self.claude_analyzer.analyze(skill_file)

        # Convert to virtual skill
        virtual_skill = self.claude_generator.to_virtual_skill(skill_info)

        # Add skill type marker
        virtual_skill.skill_type = "claude"

        return virtual_skill

    async def _register_openclaw_skill(self, skill_file: OpenClawSkillFile) -> VirtualSkill:
        """
        Analyze and register a single OpenClaw Skill.

        Args:
            skill_file: OpenClawSkillFile to register

        Returns:
            VirtualSkill instance
        """
        # Analyze the skill
        skill_info = self.openclaw_analyzer.analyze(skill_file)

        # Map to myagent format
        myagent_metadata = self.openclaw_mapper.map_to_myagent_format(skill_info)

        # Create SkillDefinition from metadata
        definition = SkillDefinition(**myagent_metadata)

        # Create virtual skill
        virtual_skill = VirtualSkill(
            skill_info=skill_info,
            definition=definition,
            skill_type="openclaw"
        )

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

    def list(self, tags: Optional[List[str]] = None, source: Optional[str] = None) -> List[SkillMetadata]:
        """
        List available skills, optionally filtered by tags and/or source.

        Args:
            tags: Optional list of tags to filter by
            source: Optional source filter ("claude", "openclaw", or None for both)

        Returns:
            List of SkillMetadata objects
        """
        if not self._loaded:
            # Return empty list if not loaded (sync method)
            return []

        skills = list(self._virtual_skills.values())

        # Filter by source
        if source:
            skills = [s for s in skills if s.skill_type == source]

        # Filter by tags
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
