"""
Skills Adapter Layer

This adapter enables myagent to discover, analyze, and execute skills from different sources:
- Claude Skills (SKILL.md files)
- OpenClaw Skills (SKILL.md files with OpenClaw-specific frontmatter)

The adapter implements a smart strategy that automatically analyzes SKILL.md content to:
- Detect skill type (pure-prompt, hybrid, command-dispatch)
- Extract tags from frontmatter
- Detect output type from "Output Format" section
- Generate execution config for different skill types
- Replace {baseDir} placeholders (OpenClaw)

Components:
Claude Skills:
- ClaudeSkillScanner: Discover Claude SKILL.md files
- ClaudeSkillAnalyzer: Parse and analyze Claude SKILL.md content
- MyagentSkillGenerator: Generate skill.yaml mappings
- VirtualSkillRegistry: In-memory skill mapping

OpenClaw Skills:
- OpenClawSkillScanner: Discover OpenClaw SKILL.md files
- OpenClawSkillAnalyzer: Parse and analyze OpenClaw SKILL.md content
- OpenClawMetadataMapper: Map OpenClaw metadata to myagent format
"""

# Claude Skills imports
from .claude_skill_scanner import ClaudeSkillScanner
from .claude_skill_analyzer import ClaudeSkillAnalyzer, ClaudeSkillInfo
from .myagent_skill_generator import MyagentSkillGenerator
from .virtual_skill_registry import VirtualSkillRegistry, VirtualSkill

# OpenClaw Skills imports
from .openclaw_skill_scanner import OpenClawSkillScanner, OpenClawSkillFile
from .openclaw_skill_analyzer import OpenClawSkillAnalyzer, OpenClawSkillInfo
from .openclaw_metadata_mapper import OpenClawMetadataMapper

__all__ = [
    # Claude Skills
    'ClaudeSkillScanner',
    'ClaudeSkillAnalyzer',
    'ClaudeSkillInfo',
    'MyagentSkillGenerator',
    'VirtualSkillRegistry',
    'VirtualSkill',
    # OpenClaw Skills
    'OpenClawSkillScanner',
    'OpenClawSkillFile',
    'OpenClawSkillAnalyzer',
    'OpenClawSkillInfo',
    'OpenClawMetadataMapper',
]
