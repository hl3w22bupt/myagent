"""
Multi-level skill registry for hierarchical skill loading.

Supports 4-level priority system:
- Level 1 (highest): workspace/ - User's custom skills
- Level 2: managed/ - Managed skill libraries
- Level 3: bundled/ - Built-in skills
- Level 4 (lowest): extra/ - Optional extra skills

Higher levels override lower levels (workspace overrides managed, etc.)
"""

import os
import yaml
import asyncio
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum

from .registry import SkillRegistry
from .types import SkillMetadata


class SkillLevel(Enum):
    """Skill loading levels with priority."""
    WORKSPACE = 1  # Highest priority (workspace/)
    MANAGED = 2    # Managed libraries (managed/)
    BUNDLED = 3    # Built-in skills (bundled/)
    EXTRA = 4      # Optional extras (extra/)


class MultiLevelSkillRegistry:
    """
    Multi-level skill registry with hierarchical loading.

    Implements priority-based skill override:
    - Higher levels override lower levels
    - Skills with same name: highest level wins
    - Metadata is merged from all available levels
    """

    # Default directories for each level
    DEFAULT_DIRECTORIES = {
        SkillLevel.WORKSPACE: "skills/",
        SkillLevel.MANAGED: "skills/managed/",
        SkillLevel.BUNDLED: "skills/bundled/",
        SkillLevel.EXTRA: "skills/extra/"
    }

    def __init__(
        self,
        base_dir: str = ".",
        directories: Optional[Dict[SkillLevel, str]] = None,
        virtual_registry: Optional[Any] = None,
        filter_config: Optional[Dict[str, Any]] = None,
        myagent_config: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the multi-level skill registry.

        Args:
            base_dir: Base directory for relative paths
            directories: Custom directories for each level
            virtual_registry: Optional VirtualSkillRegistry for Claude Skills
            filter_config: Optional skill filter configuration
            myagent_config: Optional myagent config for dependency checking
        """
        self.base_dir = Path(base_dir)

        # Use custom directories or defaults
        self.directories = {
            level: self.base_dir / (directories or self.DEFAULT_DIRECTORIES)[level]
            for level in SkillLevel
        }

        # Create registries for each level
        self.registries: Dict[SkillLevel, SkillRegistry] = {}

        for level, dir_path in self.directories.items():
            self.registries[level] = SkillRegistry(
                skills_dir=str(dir_path),
                virtual_registry=virtual_registry,
                filter_config=filter_config,
                myagent_config=myagent_config
            )

        # Store configs
        self._virtual_registry = virtual_registry
        self._filter_config = filter_config
        self._myagent_config = myagent_config

        # Merged metadata (highest level wins)
        self._merged_metadata: Dict[str, SkillMetadata] = {}
        self._skill_levels: Dict[str, SkillLevel] = {}
        self._loaded = False

    async def scan_all_levels(self) -> Dict[str, SkillMetadata]:
        """
        Scan all levels and merge metadata.

        Scans levels in reverse priority order (lowest to highest).
        This ensures higher levels override lower levels.

        Returns:
            Merged metadata dictionary
        """
        print("\n🔍 Scanning all skill levels...")

        # Scan levels in reverse priority order (lowest first, highest last)
        for level in sorted(SkillLevel, key=lambda x: x.value, reverse=True):
            registry = self.registries[level]
            dir_path = self.directories[level]

            print(f"\n📁 Level {level.value}: {level.name} ({dir_path})")

            # Check if directory exists
            if not dir_path.exists():
                print(f"   ⚠️  Directory not found, skipping")
                continue

            try:
                # Scan this level
                metadata = await registry.scan()

                print(f"   ✓ Found {len(metadata)} skills")

                # Merge into main metadata (higher levels override)
                for skill_name, skill_meta in metadata.items():
                    if skill_name in self._merged_metadata:
                        old_level = self._skill_levels[skill_name]
                        print(f"      → '{skill_name}' overridden by {level.name} (was {old_level.name})")
                    else:
                        print(f"      → '{skill_name}' added from {level.name}")

                    self._merged_metadata[skill_name] = skill_meta
                    self._skill_levels[skill_name] = level

            except Exception as e:
                print(f"   ❌ Error scanning {level.name}: {e}")

        self._loaded = True

        print(f"\n✅ Total unique skills: {len(self._merged_metadata)}")
        self._print_summary()

        return self._merged_metadata

    async def scan_workspace(self) -> Dict[str, SkillMetadata]:
        """Scan only workspace level."""
        return await self.registries[SkillLevel.WORKSPACE].scan()

    async def scan_managed(self) -> Dict[str, SkillMetadata]:
        """Scan only managed level."""
        return await self.registries[SkillLevel.MANAGED].scan()

    async def scan_bundled(self) -> Dict[str, SkillMetadata]:
        """Scan only bundled level."""
        return await self.registries[SkillLevel.BUNDLED].scan()

    async def scan_extra(self) -> Dict[str, SkillMetadata]:
        """Scan only extra level."""
        return await self.registries[SkillLevel.EXTRA].scan()

    async def load_full(self, skill_name: str) -> Any:
        """
        Load full skill definition from appropriate level.

        Args:
            skill_name: Name of the skill to load

        Returns:
            SkillDefinition from the highest level that has it
        """
        if not self._loaded:
            await self.scan_all_levels()

        # Find which level has this skill
        level = self._skill_levels.get(skill_name)
        if not level:
            available = list(self._merged_metadata.keys())
            raise ValueError(
                f"Skill '{skill_name}' not found. "
                f"Available skills: {available}"
            )

        # Load from that level's registry
        return await self.registries[level].load_full(skill_name)

    def get_skill_level(self, skill_name: str) -> Optional[SkillLevel]:
        """
        Get the level of a skill.

        Args:
            skill_name: Name of the skill

        Returns:
            SkillLevel or None if not found
        """
        return self._skill_levels.get(skill_name)

    def list_skills_by_level(self, level: SkillLevel) -> List[str]:
        """
        List skills from a specific level.

        Args:
            level: Skill level to list

        Returns:
            List of skill names from that level
        """
        return [
            name for name, lvl in self._skill_levels.items()
            if lvl == level
        ]

    def get_level_counts(self) -> Dict[SkillLevel, int]:
        """
        Get count of skills per level.

        Returns:
            Dict mapping level to count
        """
        counts = {level: 0 for level in SkillLevel}

        for level in self._skill_levels.values():
            counts[level] += 1

        return counts

    def list(self, tags: Optional[List[str]] = None) -> List[SkillMetadata]:
        """
        List all merged skills, optionally filtered by tags.

        Args:
            tags: Optional list of tags to filter by

        Returns:
            List of SkillMetadata objects
        """
        skills = list(self._merged_metadata.values())

        if tags:
            skills = [
                s for s in skills
                if any(tag in s.tags for tag in tags)
            ]

        return skills

    def get_skill_names(self) -> List[str]:
        """Get list of all merged skill names."""
        return list(self._merged_metadata.keys())

    def is_loaded(self) -> bool:
        """Check if registry has been scanned."""
        return self._loaded

    def clear_cache(self):
        """Clear cached full definitions from all level registries."""
        for registry in self.registries.values():
            registry.clear_cache()

    def _print_summary(self):
        """Print summary of scanned skills."""
        counts = self.get_level_counts()

        print("\n📊 Skill Summary:")
        for level in SkillLevel:
            count = counts[level]
            if count > 0:
                print(f"   {level.name}: {count} skills")

        # Show overridden skills
        overridden = self._get_overridden_skills()
        if overridden:
            print(f"\n⚠️  Overridden skills: {len(overridden)}")
            for skill_name, levels in overridden.items():
                print(f"   - {skill_name}: {', '.join(levels)}")

    def _get_overridden_skills(self) -> Dict[str, List[str]]:
        """
        Get skills that exist in multiple levels.

        Returns:
            Dict mapping skill name to list of levels it appears in
        """
        # Track all occurrences
        all_occurrences: Dict[str, List[SkillLevel]] = {}

        for level in SkillLevel:
            registry = self.registries[level]
            for skill_name in registry.get_skill_names():
                if skill_name not in all_occurrences:
                    all_occurrences[skill_name] = []
                all_occurrences[skill_name].append(level)

        # Filter to only overridden (appears in >1 level)
        return {
            name: [level.name for level in levels]
            for name, levels in all_occurrences.items()
            if len(levels) > 1
        }

    def get_skill_sources(self, skill_name: str) -> List[SkillLevel]:
        """
        Get all levels that contain a specific skill.

        Args:
            skill_name: Name of the skill

        Returns:
            List of levels that have this skill
        """
        sources = []
        for level in SkillLevel:
            if skill_name in self.registries[level].get_skill_names():
                sources.append(level)
        return sources

    async def reload_level(self, level: SkillLevel) -> Dict[str, SkillMetadata]:
        """
        Reload a specific level and re-merge metadata.

        Args:
            level: Skill level to reload

        Returns:
            Updated merged metadata
        """
        print(f"\n🔄 Reloading {level.name} level...")

        # Clear existing metadata from this level
        registry = self.registries[level]

        # Remove skills from this level from merged data
        skills_to_remove = [
            name for name, lvl in self._skill_levels.items()
            if lvl == level
        ]

        for skill_name in skills_to_remove:
            # Check if skill exists in other levels
            other_sources = [
                l for l in self.get_skill_sources(skill_name)
                if l != level
            ]

            if other_sources:
                # Use next highest level
                new_level = min(other_sources, key=lambda x: x.value)
                self._skill_levels[skill_name] = new_level
                self._merged_metadata[skill_name] = self.registries[new_level]._metadata[skill_name]
            else:
                # Remove completely
                del self._merged_metadata[skill_name]
                del self._skill_levels[skill_name]

        # Rescan the level
        metadata = await registry.scan()

        # Merge new metadata
        for skill_name, skill_meta in metadata.items():
            if skill_name not in self._merged_metadata:
                # New skill
                self._merged_metadata[skill_name] = skill_meta
                self._skill_levels[skill_name] = level
            else:
                # Check if this level should override
                current_level = self._skill_levels[skill_name]
                if level.value < current_level.value:
                    # This level has higher priority
                    self._merged_metadata[skill_name] = skill_meta
                    self._skill_levels[skill_name] = level
                    print(f"   → '{skill_name}' overridden by {level.name}")

        return self._merged_metadata
