"""
OpenClaw Skill Analyzer

Parses and analyzes OpenClaw Skills (SKILL.md files) to extract metadata.

The analyzer implements smart detection:
- Skill type (pure-prompt, hybrid, command-dispatch)
- Dependencies from metadata.openclaw.requires
- Command dispatch information
- {baseDir} placeholder replacement
"""

import re
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

# Try to import yaml, make it optional
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

# Handle relative import for different contexts
try:
    from .openclaw_skill_scanner import OpenClawSkillFile
except ImportError:
    # Fallback for standalone testing
    try:
        from openclaw_skill_scanner import OpenClawSkillFile
    except ImportError:
        # Last resort - define a placeholder
        class OpenClawSkillFile:
            pass


@dataclass
class OpenClawSkillInfo:
    """
    Parsed information from an OpenClaw Skill (SKILL.md).

    Attributes:
        name: Skill name (derived from directory name)
        description: Skill description from frontmatter
        type: Detected skill type (pure-prompt, hybrid, command-dispatch)
        has_scripts_dir: Whether the skill has a scripts/ directory
        command_dispatch: Command-dispatch type (tool) or None
        command_tool: Tool name for command-dispatch skills
        dependencies: Dependencies from metadata.openclaw.requires
        install_hints: Installation hints from metadata.openclaw.install
        prompt_template: The full prompt template from SKILL.md body (with {baseDir} replaced)
        frontmatter: Raw frontmatter data
    """
    name: str
    description: str
    type: str  # 'pure-prompt', 'hybrid', 'command-dispatch'
    has_scripts_dir: bool = False
    command_dispatch: Optional[str] = None  # 'tool' or None
    command_tool: Optional[str] = None
    dependencies: Dict[str, Any] = field(default_factory=dict)
    install_hints: List[str] = field(default_factory=list)
    prompt_template: str = ""
    frontmatter: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_pure_prompt(self) -> bool:
        """Check if this is a pure-prompt skill."""
        return self.type == 'pure-prompt'

    @property
    def is_hybrid(self) -> bool:
        """Check if this is a hybrid skill (has scripts/)."""
        return self.type == 'hybrid'

    @property
    def is_command_dispatch(self) -> bool:
        """Check if this is a command-dispatch skill."""
        return self.type == 'command-dispatch'


class OpenClawSkillAnalyzer:
    """
    Analyzer for OpenClaw Skills (SKILL.md files).

    Implements smart analysis to automatically detect skill properties
    from the SKILL.md content.
    """

    # Frontmatter pattern: ---\nkey: value\n---
    FRONTMATTER_PATTERN = re.compile(r'^---\s*\n(.*?)\n---\s*\n(.*)$', re.DOTALL)

    def __init__(self):
        """Initialize the OpenClaw Skill Analyzer."""
        pass

    def analyze(self, skill_file: OpenClawSkillFile) -> OpenClawSkillInfo:
        """
        Analyze an OpenClaw Skill file.

        Args:
            skill_file: OpenClawSkillFile to analyze

        Returns:
            OpenClawSkillInfo with parsed metadata

        Raises:
            FileNotFoundError: If SKILL.md file doesn't exist
            ValueError: If SKILL.md content is invalid
        """
        if not skill_file.path.exists():
            raise FileNotFoundError(f"SKILL.md not found: {skill_file.path}")

        # Read the SKILL.md content
        content = skill_file.path.read_text(encoding='utf-8')

        # Parse frontmatter and body
        frontmatter, body = self._parse_frontmatter(content)

        # Extract description
        description = frontmatter.get('description', '')

        # Replace {baseDir} placeholders in body
        body = self._replace_base_dir(body, skill_file.directory)

        # Detect skill type
        skill_type, command_dispatch, command_tool = self._detect_skill_type(
            skill_file, frontmatter
        )

        # Extract dependencies
        dependencies = self._extract_dependencies(frontmatter)

        # Extract install hints
        install_hints = self._extract_install_hints(frontmatter)

        return OpenClawSkillInfo(
            name=skill_file.skill_name,
            description=description,
            type=skill_type,
            has_scripts_dir=skill_file.has_scripts_dir,
            command_dispatch=command_dispatch,
            command_tool=command_tool,
            dependencies=dependencies,
            install_hints=install_hints,
            prompt_template=body.strip(),
            frontmatter=frontmatter
        )

    def _parse_frontmatter(self, content: str) -> tuple[Dict[str, Any], str]:
        """
        Parse YAML frontmatter from SKILL.md content.

        Args:
            content: Full content of SKILL.md

        Returns:
            Tuple of (frontmatter dict, body string)
        """
        match = self.FRONTMATTER_PATTERN.match(content)

        if match:
            frontmatter_text, body = match.groups()

            # Parse YAML frontmatter
            if YAML_AVAILABLE:
                try:
                    frontmatter = yaml.safe_load(frontmatter_text) or {}
                except Exception as e:
                    print(f"Warning: Failed to parse frontmatter YAML: {e}")
                    frontmatter = {}
            else:
                # YAML not available, return empty frontmatter
                print("Warning: YAML module not available, cannot parse frontmatter")
                frontmatter = {}

            return frontmatter, body

        # No frontmatter found
        return {}, content

    def _replace_base_dir(self, content: str, skill_dir: Path) -> str:
        """
        Replace {baseDir} placeholders with actual skill directory path.

        Args:
            content: SKILL.md content
            skill_dir: Absolute path to skill directory

        Returns:
            Content with {baseDir} replaced
        """
        return content.replace("{baseDir}", str(skill_dir))

    def _detect_skill_type(
        self,
        skill_file: OpenClawSkillFile,
        frontmatter: Dict[str, Any]
    ) -> tuple[str, Optional[str], Optional[str]]:
        """
        Detect skill type and command-dispatch information.

        Detection Rules (from design doc):
        1. command-dispatch: tool → command-dispatch type
        2. has scripts/ directory → hybrid type
        3. Default → pure-prompt

        Args:
            skill_file: OpenClawSkillFile being analyzed
            frontmatter: Parsed frontmatter dict

        Returns:
            Tuple of (skill_type, command_dispatch, command_tool)
        """
        # Rule 1: Check for command-dispatch
        command_dispatch = frontmatter.get('command-dispatch')
        if command_dispatch == 'tool':
            command_tool = frontmatter.get('command-tool')
            return 'command-dispatch', 'tool', command_tool

        # Rule 2: Check for scripts/ directory
        if skill_file.has_scripts_dir:
            return 'hybrid', None, None

        # Rule 3: Default to pure-prompt
        return 'pure-prompt', None, None

    def _extract_dependencies(self, frontmatter: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract dependencies from metadata.openclaw.requires.

        Args:
            frontmatter: Parsed frontmatter dict

        Returns:
            Dependencies dict with bins, env, config, anyBins
        """
        metadata = frontmatter.get('metadata', {})
        openclaw_meta = metadata.get('openclaw', {})
        requires = openclaw_meta.get('requires', {})

        return {
            'bins': requires.get('bins', []),
            'anyBins': requires.get('anyBins', []),
            'env': requires.get('env', []),
            'config': requires.get('config', []),
        }

    def _extract_install_hints(self, frontmatter: Dict[str, Any]) -> List[str]:
        """
        Extract installation hints from metadata.openclaw.install.

        Args:
            frontmatter: Parsed frontmatter dict

        Returns:
            List of installation hint strings
        """
        metadata = frontmatter.get('metadata', {})
        openclaw_meta = metadata.get('openclaw', {})
        install = openclaw_meta.get('install', [])

        # Ensure it's a list
        if isinstance(install, str):
            return [install]
        elif not isinstance(install, list):
            return []

        return install


# Convenience function for quick analysis
def analyze_openclaw_skill(
    skill_file: OpenClawSkillFile
) -> OpenClawSkillInfo:
    """
    Convenience function to analyze an OpenClaw Skill.

    Args:
        skill_file: OpenClawSkillFile to analyze

    Returns:
        OpenClawSkillInfo with parsed metadata
    """
    analyzer = OpenClawSkillAnalyzer()
    return analyzer.analyze(skill_file)
