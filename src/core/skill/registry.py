"""
Skill Registry for automatic discovery and lazy loading of Skills.

The Registry implements a two-level loading strategy:
- Level 1 (Metadata): Scan all skills at startup, load only metadata
- Level 2 (Full Definition): Load complete Skill definition on demand
"""

import os
import yaml
import asyncio
from pathlib import Path
from typing import Dict, List, Optional
from .types import SkillMetadata, SkillDefinition, SkillType


class SkillRegistry:
    """
    Registry for managing Skill discovery and loading.

    Implements automatic discovery from a directory structure
    and lazy loading of Skill definitions.
    """

    def __init__(self, skills_dir: str = 'skills/'):
        """
        Initialize the Skill Registry.

        Args:
            skills_dir: Path to the skills directory
        """
        self.skills_dir = Path(skills_dir)
        self._metadata: Dict[str, SkillMetadata] = {}
        self._full_definitions: Dict[str, SkillDefinition] = {}
        self._loaded = False

    async def scan(self) -> Dict[str, SkillMetadata]:
        """
        Scan skills directory and load metadata (Level 1).

        This is called at startup to quickly discover all available skills
        without loading their full definitions.

        Returns:
            Dictionary mapping skill names to their metadata
        """
        if not self.skills_dir.exists():
            raise FileNotFoundError(f"Skills directory not found: {self.skills_dir}")

        tasks = []
        for skill_path in self.skills_dir.iterdir():
            if skill_path.is_dir() and (skill_path / 'skill.yaml').exists():
                tasks.append(self._load_metadata(skill_path))

        # Load all metadata in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                print(f"Warning: Failed to load skill metadata: {result}")
                continue
            if isinstance(result, SkillMetadata):
                self._metadata[result.name] = result

        self._loaded = True
        return self._metadata

    async def _load_metadata(self, skill_path: Path) -> SkillMetadata:
        """
        Load only metadata from skill.yaml (Level 1).

        Args:
            skill_path: Path to the skill directory

        Returns:
            SkillMetadata object
        """
        config_file = skill_path / 'skill.yaml'

        if not config_file.exists():
            raise FileNotFoundError(f"skill.yaml not found in {skill_path}")

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        # Validate required fields
        if 'name' not in config:
            raise ValueError(f"Skill missing 'name' field: {skill_path}")
        if 'version' not in config:
            raise ValueError(f"Skill missing 'version' field: {skill_path}")
        if 'description' not in config:
            raise ValueError(f"Skill missing 'description' field: {skill_path}")

        return SkillMetadata(
            name=config['name'],
            version=config['version'],
            description=config['description'],
            tags=config.get('tags', []),
            type=SkillType(config.get('type', 'pure-script'))
        )

    async def load_full(self, skill_name: str) -> SkillDefinition:
        """
        Load full skill definition (Level 2).

        This is called on-demand when a Skill needs to be executed.
        Loads schemas, prompts, and execution configuration.

        Args:
            skill_name: Name of the skill to load

        Returns:
            Complete SkillDefinition

        Raises:
            ValueError: If skill not found in registry
        """
        # Return cached definition if available
        if skill_name in self._full_definitions:
            return self._full_definitions[skill_name]

        # Ensure skill exists in metadata
        if skill_name not in self._metadata:
            raise ValueError(
                f"Skill '{skill_name}' not found in registry. "
                f"Available skills: {list(self._metadata.keys())}"
            )

        # Load full definition from YAML
        skill_path = self.skills_dir / skill_name
        config_file = skill_path / 'skill.yaml'

        if not config_file.exists():
            raise FileNotFoundError(f"skill.yaml not found for '{skill_name}'")

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        # Build full definition
        definition = SkillDefinition(
            **self._metadata[skill_name].dict(),
            input_schema=config.get('input_schema', {}),
            output_schema=config.get('output_schema', {}),
            prompt_template=config.get('prompt_template'),
            execution=self._load_execution_config(config.get('execution'))
                if 'execution' in config else None
        )

        # Cache the full definition
        self._full_definitions[skill_name] = definition

        return definition

    def _load_execution_config(self, exec_config: dict) -> dict:
        """Load and validate execution configuration."""
        if exec_config is None:
            return None

        return {
            'handler': exec_config.get('handler', 'handler.py'),
            'function': exec_config.get('function', 'execute'),
            'timeout': exec_config.get('timeout', 30000)
        }

    def list(self, tags: Optional[List[str]] = None) -> List[SkillMetadata]:
        """
        List available skills, optionally filtered by tags.

        Args:
            tags: Optional list of tags to filter by

        Returns:
            List of SkillMetadata objects
        """
        skills = list(self._metadata.values())

        if tags:
            skills = [
                s for s in skills
                if any(tag in s.tags for tag in tags)
            ]

        return skills

    def get_full(self, skill_name: str) -> Optional[SkillDefinition]:
        """
        Get full definition if already loaded.

        Args:
            skill_name: Name of the skill

        Returns:
            SkillDefinition if loaded, None otherwise
        """
        return self._full_definitions.get(skill_name)

    def is_loaded(self) -> bool:
        """Check if registry has been scanned."""
        return self._loaded

    def get_skill_names(self) -> List[str]:
        """Get list of all registered skill names."""
        return list(self._metadata.keys())

    def clear_cache(self):
        """Clear cached full definitions to free memory."""
        self._full_definitions.clear()
