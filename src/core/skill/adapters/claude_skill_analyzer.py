"""
Claude Skill Analyzer

Parses and analyzes Claude Skills (SKILL.md files) to extract metadata.

The analyzer implements a smart strategy that automatically detects:
- Skill type (pure-prompt vs hybrid)
- Tags from frontmatter
- Output type from "Output Format" section
- Script presence for hybrid skills
"""

import re
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

from .claude_skill_scanner import ClaudeSkillFile


@dataclass
class ClaudeSkillInfo:
    """
    Parsed information from a Claude Skill (SKILL.md).

    Attributes:
        name: Skill name (derived from directory name)
        description: Skill description from frontmatter
        tags: Tags from frontmatter (plus default tags)
        type: Detected skill type (pure-prompt or hybrid)
        output_type: Detected output type (text or json)
        artifact_type: Detected artifact type (video, image, audio, code, html, markdown, json, text)
        has_script: Whether the skill has a Python script
        script_path: Path to the script file (if found)
        prompt_template: The full prompt template from SKILL.md body
        frontmatter: Raw frontmatter data
    """
    name: str
    description: str
    tags: List[str]
    type: str  # 'pure-prompt' or 'hybrid'
    output_type: str  # 'text' or 'json'
    artifact_type: str = "text"  # Default artifact type
    has_script: bool = False
    script_path: Optional[Path] = None
    prompt_template: str = ""
    frontmatter: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_hybrid(self) -> bool:
        """Check if this is a hybrid skill."""
        return self.type == 'hybrid'

    @property
    def is_pure_prompt(self) -> bool:
        """Check if this is a pure-prompt skill."""
        return self.type == 'pure-prompt'


class ClaudeSkillAnalyzer:
    """
    Analyzer for Claude Skills (SKILL.md files).

    Implements smart analysis to automatically detect skill properties
    from the SKILL.md content.
    """

    # Default tags for all adapted Claude Skills
    DEFAULT_TAGS = ['claude-skill', 'adapted']

    # Frontmatter pattern: ---\nkey: value\n---
    FRONTMATTER_PATTERN = re.compile(r'^---\s*\n(.*?)\n---\s*\n(.*)$', re.DOTALL)

    # Output format patterns
    OUTPUT_JSON_PATTERN = re.compile(r'output.*format.*json', re.IGNORECASE)
    OUTPUT_TEXT_PATTERN = re.compile(r'output.*format.*text', re.IGNORECASE)

    # Tags to artifact_type mapping
    # Note: More specific tags should be checked first in iteration order
    TAG_TO_ARTIFACT_TYPE = {
        # Video types
        'video': 'video', 'remotion': 'video', 'animation': 'video',

        # Image types
        'image': 'image', 'infographic': 'image', 'svg': 'image',
        'visualization': 'image', 'visual': 'image',

        # Code types
        'code': 'code', 'programming': 'code',
        'frontend': 'code', 'ui': 'code', 'design': 'code',

        # Markdown types
        'markdown': 'markdown', 'documentation': 'markdown', 'docs': 'markdown',

        # HTML types
        'html': 'html', 'web': 'html',

        # JSON types
        'json': 'json', 'data': 'json', 'api': 'json',

        # Audio types
        'audio': 'audio', 'music': 'audio', 'sound': 'audio',
    }

    # Description keyword patterns for artifact_type inference
    DESCRIPTION_PATTERNS = [
        (r'\bvideo\b', 'video'),
        (r'\bimage\b', 'image'),
        (r'\bcode\b', 'code'),
        (r'\bmarkdown\b', 'markdown'),
        (r'\bhtml\b', 'html'),
        (r'\bjson\b', 'json'),
        (r'\baudio\b', 'audio'),
    ]

    def __init__(
        self,
        default_tags: Optional[List[str]] = None,
        default_output_type: str = 'auto'
    ):
        """
        Initialize the Claude Skill Analyzer.

        Args:
            default_tags: Default tags to add to all skills
            default_output_type: Default output type ('text', 'json', or 'auto')
        """
        self.default_tags = default_tags or self.DEFAULT_TAGS
        self.default_output_type = default_output_type

    def analyze(self, skill_file: ClaudeSkillFile) -> ClaudeSkillInfo:
        """
        Analyze a Claude Skill file.

        Args:
            skill_file: ClaudeSkillFile to analyze

        Returns:
            ClaudeSkillInfo with parsed metadata

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

        # Extract tags
        tags = self._extract_tags(frontmatter)

        # Detect skill type
        skill_type = self._detect_skill_type(skill_file, body)

        # Detect output type
        output_type = self._detect_output_type(body)

        # Infer artifact_type
        artifact_type = self._infer_artifact_type(
            tags=tags,
            description=description,
            frontmatter=frontmatter
        )

        # Check for script
        script_path = self._find_script(skill_file)
        has_script = script_path is not None

        # Build prompt template (the body is the template)
        prompt_template = body.strip()

        return ClaudeSkillInfo(
            name=skill_file.skill_name,
            description=description,
            tags=tags,
            type=skill_type,
            output_type=output_type,
            artifact_type=artifact_type,
            has_script=has_script,
            script_path=script_path,
            prompt_template=prompt_template,
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
            try:
                import yaml
                frontmatter = yaml.safe_load(frontmatter_text) or {}
            except Exception as e:
                print(f"Warning: Failed to parse frontmatter YAML: {e}")
                frontmatter = {}

            return frontmatter, body

        # No frontmatter found
        return {}, content

    def _extract_tags(self, frontmatter: Dict[str, Any]) -> List[str]:
        """
        Extract tags from frontmatter.

        Args:
            frontmatter: Parsed frontmatter dict

        Returns:
            List of tags (frontmatter tags + default tags)
        """
        # Get tags from frontmatter
        frontmatter_tags = frontmatter.get('tags', [])

        # Normalize to list
        if isinstance(frontmatter_tags, str):
            frontmatter_tags = [frontmatter_tags]
        elif not isinstance(frontmatter_tags, list):
            frontmatter_tags = []

        # Add default tags
        all_tags = frontmatter_tags + self.default_tags

        # Deduplicate while preserving order
        seen = set()
        unique_tags = []
        for tag in all_tags:
            if tag not in seen:
                seen.add(tag)
                unique_tags.append(tag)

        return unique_tags

    def _detect_skill_type(self, skill_file: ClaudeSkillFile, body: str) -> str:
        """
        Detect skill type (pure-prompt vs hybrid).

        Strategy:
        - Look for Python scripts in the skill directory
        - If script found, it's hybrid
        - Otherwise, it's pure-prompt

        Args:
            skill_file: ClaudeSkillFile being analyzed
            body: Body content of SKILL.md

        Returns:
            'pure-prompt' or 'hybrid'
        """
        # Check for Python scripts
        script_path = self._find_script(skill_file)

        if script_path:
            return 'hybrid'

        # No script found, must be pure-prompt
        return 'pure-prompt'

    def _detect_output_type(self, body: str) -> str:
        """
        Detect output type from SKILL.md content.

        Looks for "Output Format" section and analyzes it.

        Args:
            body: Body content of SKILL.md

        Returns:
            'text' or 'json'
        """
        # Normalize for searching
        body_lower = body.lower()

        # Look for "Output Format" section
        output_section_match = re.search(
            r'output\s+format\s*:\s*(.*?)(?=\n\n|\n#|$)',
            body_lower,
            re.DOTALL
        )

        if output_section_match:
            output_format = output_section_match.group(1).strip()

            # Check for JSON
            if self.OUTPUT_JSON_PATTERN.search(output_format):
                return 'json'

            # Check for text
            if self.OUTPUT_TEXT_PATTERN.search(output_format):
                return 'text'

        # Default based on configuration
        if self.default_output_type == 'auto':
            return 'text'  # Default to text if auto-detection fails

        return self.default_output_type

    def _find_script(self, skill_file: ClaudeSkillFile) -> Optional[Path]:
        """
        Find Python script for this skill.

        Search strategy:
        1. main.py (Claude Code standard)
        2. {skill_name}.py
        3. First .py file found

        Args:
            skill_file: ClaudeSkillFile being analyzed

        Returns:
            Path to script if found, None otherwise
        """
        skill_dir = skill_file.directory

        # Strategy 1: main.py
        main_py = skill_dir / "main.py"
        if main_py.exists():
            return main_py

        # Strategy 2: {skill_name}.py
        name_py = skill_dir / f"{skill_file.skill_name}.py"
        if name_py.exists():
            return name_py

        # Strategy 3: First .py file
        py_files = list(skill_dir.glob("*.py"))
        if py_files:
            # Return the first one (sorted for consistency)
            return sorted(py_files)[0]

        # No script found
        return None

    def _infer_artifact_type(
        self,
        tags: List[str],
        description: str,
        frontmatter: Dict[str, Any]
    ) -> str:
        """
        推断 artifact_type

        优先级:
        1. Frontmatter 中的 artifact_type 字段（最高优先级）
        2. Tags 映射（按优先级顺序检查）
        3. Description 关键词检测
        4. 默认 'text'
        """
        # 1. 检查手动声明
        if 'artifact_type' in frontmatter:
            return frontmatter['artifact_type']

        # 2. 从 tags 映射（按优先级顺序，更具体的标签优先）
        # 定义标签优先级（从高到低）
        tag_priority = [
            'infographic', 'visualization', 'visual',  # 最具体的可视化类型
            'video', 'remotion', 'animation',
            'code', 'programming', 'frontend', 'ui', 'design',
            'image', 'svg',
            'markdown', 'documentation', 'docs',
            'html', 'web',
            'audio', 'music', 'sound',
            'json', 'data', 'api',
        ]

        # 先检查优先级标签
        for tag in tag_priority:
            if tag in [t.lower() for t in tags]:
                return self.TAG_TO_ARTIFACT_TYPE[tag]

        # 再检查剩余标签
        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower in self.TAG_TO_ARTIFACT_TYPE:
                return self.TAG_TO_ARTIFACT_TYPE[tag_lower]

        # 3. 从 description 关键词检测
        if description:
            desc_lower = description.lower()
            for pattern, art_type in self.DESCRIPTION_PATTERNS:
                if re.search(pattern, desc_lower):
                    return art_type

        # 4. 默认值
        return 'text'


# Convenience function for quick analysis
def analyze_claude_skill(
    skill_file: ClaudeSkillFile,
    default_tags: Optional[List[str]] = None
) -> ClaudeSkillInfo:
    """
    Convenience function to analyze a Claude Skill.

    Args:
        skill_file: ClaudeSkillFile to analyze
        default_tags: Optional default tags

    Returns:
        ClaudeSkillInfo with parsed metadata
    """
    analyzer = ClaudeSkillAnalyzer(default_tags=default_tags)
    return analyzer.analyze(skill_file)
