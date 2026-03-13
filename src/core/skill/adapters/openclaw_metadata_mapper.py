"""
OpenClaw Metadata Mapper

Converts OpenClaw skill metadata to myagent skill format.

This mapper implements the mapping rules defined in the design document:
- Map OpenClaw frontmatter fields to myagent skill.yaml format
- Promote dependencies to top-level requires (Phase 2 key improvement)
- Handle command-dispatch routing
- Preserve installation hints
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass

# Handle relative import for different contexts
try:
    from .openclaw_skill_analyzer import OpenClawSkillInfo
except ImportError:
    try:
        from openclaw_skill_analyzer import OpenClawSkillInfo
    except ImportError:
        # Last resort - define a placeholder
        class OpenClawSkillInfo:
            pass


class OpenClawMetadataMapper:
    """
    Mapper for converting OpenClaw skill metadata to myagent format.

    This mapper follows the design document's mapping rules to ensure
    compatibility with the existing myagent skill system.
    """

    def map_to_myagent_format(
        self,
        skill_info: OpenClawSkillInfo,
        handler_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Convert OpenClaw skill metadata to myagent skill.yaml format.

        Args:
            skill_info: Parsed OpenClawSkillInfo
            handler_path: Optional handler path (auto-detected if not provided)

        Returns:
            myagent-compatible skill metadata dictionary

        Mapping Rules (from design doc):
        - name → name (direct)
        - description → description (direct)
        - metadata.openclaw.requires.bins → requires.bins (top-level)
        - metadata.openclaw.requires.env → requires.env (top-level)
        - metadata.openclaw.install → requires.install
        - command-dispatch: tool → Special handler routing
        - Ignore: slug, version, homepage, emoji, etc.
        """
        # Determine handler based on skill type
        if handler_path is None:
            handler_path = self._determine_handler(skill_info)

        # Build base metadata
        metadata = {
            'name': skill_info.name,
            'description': skill_info.description,
            'type': self._map_type(skill_info),
            'handler': handler_path,
        }

        # Add top-level requires (Phase 2 key improvement)
        # This works for ALL skill types, including pure-prompt
        requires = self._build_requires(skill_info)
        if requires:
            metadata['requires'] = requires

        # Add execution section for non-pure-prompt skills
        if not skill_info.is_pure_prompt:
            metadata['execution'] = self._build_execution(skill_info)

        # Add tags
        metadata['tags'] = self._build_tags(skill_info)

        # Store original OpenClaw frontmatter for reference
        metadata['openclaw_frontmatter'] = skill_info.frontmatter

        return metadata

    def _determine_handler(self, skill_info: OpenClawSkillInfo) -> str:
        """
        Determine the appropriate handler for this skill type.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            Handler module path
        """
        if skill_info.is_command_dispatch:
            return 'src/core/skill/handlers/openclaw_command_dispatch_handler.py'
        elif skill_info.is_hybrid:
            return 'src/core/skill/handlers/openclaw_scripts_handler.py'
        else:
            # Pure-prompt skills use existing claude_skill_handler
            return 'src/core/skill/handlers/claude_skill_handler.py'

    def _map_type(self, skill_info: OpenClawSkillInfo) -> str:
        """
        Map OpenClaw skill type to myagent skill type.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            myagent skill type string
        """
        # OpenClaw types map directly to myagent types
        type_mapping = {
            'pure-prompt': 'pure-prompt',
            'hybrid': 'hybrid',
            'command-dispatch': 'pure-script',  # Command-dispatch is a type of script
        }
        return type_mapping.get(skill_info.type, 'pure-prompt')

    def _build_requires(self, skill_info: OpenClawSkillInfo) -> Dict[str, Any]:
        """
        Build top-level requires section from OpenClaw dependencies.

        This is the Phase 2 key improvement - top-level requires works for ALL skill types.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            Requires dictionary
        """
        requires = {}

        # Map dependencies
        deps = skill_info.dependencies

        if deps.get('bins'):
            requires['bins'] = deps['bins']

        if deps.get('anyBins'):
            requires['anyBins'] = deps['anyBins']

        if deps.get('env'):
            requires['env'] = deps['env']

        if deps.get('config'):
            requires['config'] = deps['config']

        # Add install hints
        if skill_info.install_hints:
            requires['install'] = skill_info.install_hints

        return requires

    def _build_execution(self, skill_info: OpenClawSkillInfo) -> Dict[str, Any]:
        """
        Build execution section for non-pure-prompt skills.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            Execution configuration dictionary
        """
        execution = {
            'runtime': {
                'resources': {},
                'platform': {}
            }
        }

        # Add command-tool for command-dispatch skills
        if skill_info.is_command_dispatch and skill_info.command_tool:
            execution['command_tool'] = skill_info.command_tool

        return execution

    def _build_tags(self, skill_info: OpenClawSkillInfo) -> List[str]:
        """
        Build tags list for the skill.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            List of tag strings
        """
        tags = ['openclaw-skill', 'adapted']

        # Add type-specific tags
        if skill_info.is_command_dispatch:
            tags.append('command-dispatch')
        elif skill_info.is_hybrid:
            tags.append('hybrid')
        else:
            tags.append('pure-prompt')

        return tags


# Convenience function for quick mapping
def map_openclaw_to_myagent(
    skill_info: OpenClawSkillInfo,
    handler_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convenience function to map OpenClaw metadata to myagent format.

    Args:
        skill_info: Parsed OpenClawSkillInfo
        handler_path: Optional handler path

    Returns:
        myagent-compatible skill metadata dictionary
    """
    mapper = OpenClawMetadataMapper()
    return mapper.map_to_myagent_format(skill_info, handler_path)
