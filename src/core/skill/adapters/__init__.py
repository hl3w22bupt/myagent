"""
Claude Skills Adapter Layer

This adapter enables Motia to discover, analyze, and execute Claude Skills (SKILL.md files).

The adapter implements a smart strategy that automatically analyzes SKILL.md content to:
- Detect skill type (pure-prompt vs hybrid)
- Extract tags from frontmatter
- Detect output type from "Output Format" section
- Generate execution config for hybrid skills

Components:
- ClaudeSkillScanner: Discover SKILL.md files
- ClaudeSkillAnalyzer: Parse and analyze SKILL.md content
- MotiaSkillGenerator: Generate skill.yaml mappings
- VirtualSkillRegistry: In-memory skill mapping
"""

from .claude_skill_scanner import ClaudeSkillScanner
from .claude_skill_analyzer import ClaudeSkillAnalyzer, ClaudeSkillInfo
from .motia_skill_generator import MotiaSkillGenerator
from .virtual_skill_registry import VirtualSkillRegistry, VirtualSkill

__all__ = [
    'ClaudeSkillScanner',
    'ClaudeSkillAnalyzer',
    'ClaudeSkillInfo',
    'MotiaSkillGenerator',
    'VirtualSkillRegistry',
    'VirtualSkill',
]
