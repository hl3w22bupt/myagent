"""
OpenClaw Skill Scanner

Discovers OpenClaw Skills (SKILL.md files) from configured directories.

The scanner recursively searches for SKILL.md files in the configured scan paths.
Each SKILL.md file represents an OpenClaw Skill that can be adapted for Motia.
"""

import os
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

# Try to import yaml, make it optional
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False


@dataclass
class OpenClawSkillFile:
    """
    Represents a discovered OpenClaw Skill file.

    Attributes:
        path: Absolute path to the SKILL.md file
        skill_name: Derived skill name (directory name)
        root_dir: Root directory where this skill was found
    """
    path: Path
    skill_name: str
    root_dir: Path

    @property
    def directory(self) -> Path:
        """Get the directory containing this skill."""
        return self.path.parent

    @property
    def has_scripts_dir(self) -> bool:
        """Check if this skill has a scripts/ directory."""
        scripts_dir = self.directory / "scripts"
        return scripts_dir.exists() and scripts_dir.is_dir()

    def __repr__(self) -> str:
        return f"OpenClawSkillFile(name='{self.skill_name}', path='{self.path}')"


class OpenClawSkillScanner:
    """
    Scanner for discovering OpenClaw Skills (SKILL.md files).

    The scanner searches configured directories for SKILL.md files,
    which define OpenClaw Skills that can be adapted to Motia.
    """

    def __init__(
        self,
        scan_paths: Optional[List[str]] = None,
        skill_file_pattern: str = "SKILL.md"
    ):
        """
        Initialize the OpenClaw Skill Scanner.

        Args:
            scan_paths: List of root directories to scan for SKILL.md files.
                       If None, will try to load from config file.
            skill_file_pattern: File name pattern to match (default: "SKILL.md")
        """
        if scan_paths is None:
            # Try to load from config file
            scan_paths = self._load_scan_paths_from_config()

        self.scan_paths = [Path(p).resolve() for p in scan_paths]
        self.skill_file_pattern = skill_file_pattern

    def _load_scan_paths_from_config(self) -> List[str]:
        """Load scan paths from config file."""
        config_path = Path("config/openclaw-skills-adapter.yaml")

        if not config_path.exists():
            # Default to openclaw_skills
            return ["openclaw_skills"]

        if not YAML_AVAILABLE:
            # YAML not available, return default
            print("Warning: YAML module not available, using default scan paths")
            return ["openclaw_skills"]

        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                return config.get('openclaw_skills', {}).get('scan_paths', ['openclaw_skills'])
        except Exception as e:
            print(f"Warning: Failed to load config from {config_path}: {e}")
            return ["openclaw_skills"]

    def scan(self) -> List[OpenClawSkillFile]:
        """
        Scan all configured directories for OpenClaw Skills.

        Returns:
            List of discovered OpenClawSkillFile objects

        Raises:
            FileNotFoundError: If scan paths don't exist
        """
        all_skills = []

        for scan_path in self.scan_paths:
            if not scan_path.exists():
                print(f"Warning: Scan path does not exist: {scan_path}")
                continue

            skills = self._scan_directory(scan_path)
            all_skills.extend(skills)

        return all_skills

    def _scan_directory(self, root_dir: Path) -> List[OpenClawSkillFile]:
        """
        Recursively scan a directory for SKILL.md files.

        Args:
            root_dir: Root directory to scan

        Returns:
            List of OpenClawSkillFile objects found in this directory
        """
        skills = []

        # Walk through all subdirectories
        for item in root_dir.rglob(self.skill_file_pattern):
            if item.is_file():
                # Derive skill name from parent directory
                skill_dir = item.parent
                skill_name = skill_dir.name

                skill_file = OpenClawSkillFile(
                    path=item.resolve(),
                    skill_name=skill_name,
                    root_dir=root_dir.resolve()
                )
                skills.append(skill_file)

        return skills

    def scan_by_name(self, skill_name: str) -> Optional[OpenClawSkillFile]:
        """
        Scan for a specific OpenClaw Skill by name.

        Args:
            skill_name: Name of the skill to find

        Returns:
            OpenClawSkillFile if found, None otherwise
        """
        all_skills = self.scan()

        for skill in all_skills:
            if skill.skill_name == skill_name:
                return skill

        return None

    def list_skill_names(self) -> List[str]:
        """
        Get list of all discovered skill names.

        Returns:
            List of skill names
        """
        skills = self.scan()
        return [s.skill_name for s in skills]

    def validate_scan_paths(self) -> Dict[str, bool]:
        """
        Validate that all configured scan paths exist.

        Returns:
            Dictionary mapping scan paths to existence status
        """
        return {
            str(path): path.exists()
            for path in self.scan_paths
        }


# Convenience function for quick scanning
def scan_openclaw_skills(
    scan_paths: Optional[List[str]] = None
) -> List[OpenClawSkillFile]:
    """
    Convenience function to scan for OpenClaw Skills.

    Args:
        scan_paths: Optional list of paths to scan

    Returns:
        List of discovered OpenClawSkillFile objects
    """
    scanner = OpenClawSkillScanner(scan_paths)
    return scanner.scan()
