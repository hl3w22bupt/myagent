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
            'version': skill_info.frontmatter.get('version', '1.0.0'),  # Required field
            'description': skill_info.description,
            'type': self._map_type(skill_info),
            'handler': handler_path,
        }

        # Add required schemas
        metadata['input_schema'] = self._build_input_schema(skill_info)
        metadata['output_schema'] = self._build_output_schema(skill_info)

        # Add prompt_template for pure-prompt skills
        if skill_info.is_pure_prompt and skill_info.prompt_template:
            metadata['prompt_template'] = skill_info.prompt_template

        # Add top-level requires (Phase 2 key improvement)
        # This works for ALL skill types, including pure-prompt
        requires = self._build_requires(skill_info)
        if requires:
            metadata['requires'] = requires

        # Add execution section for non-pure-prompt skills
        if not skill_info.is_pure_prompt:
            metadata['execution'] = self._build_execution(skill_info, handler_path)

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

    def _build_execution(self, skill_info: OpenClawSkillInfo, handler_path: str) -> Dict[str, Any]:
        """
        Build execution section for non-pure-prompt skills.

        Args:
            skill_info: Parsed OpenClawSkillInfo
            handler_path: Handler path for the skill

        Returns:
            Execution configuration dictionary
        """
        execution = {
            'handler': handler_path,
            'function': 'execute',
            'timeout': 30000,
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

    def _build_input_schema(self, skill_info: OpenClawSkillInfo) -> Dict[str, Any]:
        """
        Build input schema for the skill.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            Input schema dictionary
        """
        # Default input schema - accepts any object
        schema = {
            'type': 'object',
            'properties': {},
            'required': []
        }

        # Try to extract input schema from frontmatter if present
        frontmatter = skill_info.frontmatter
        if 'input_schema' in frontmatter:
            schema.update(frontmatter['input_schema'])

        return schema

    def _build_output_schema(self, skill_info: OpenClawSkillInfo) -> Dict[str, Any]:
        """
        Build output schema for the skill.

        Args:
            skill_info: Parsed OpenClawSkillInfo

        Returns:
            Output schema dictionary
        """
        # Default output schema - returns text result
        schema = {
            'type': 'object',
            'properties': {
                'result': {
                    'type': 'string',
                    'description': 'Skill execution result'
                },
                'result_type': {
                    'type': 'string',
                    'enum': ['text', 'error'],
                    'description': 'Type of result'
                }
            }
        }

        # Try to extract output schema from frontmatter if present
        frontmatter = skill_info.frontmatter
        if 'output_schema' in frontmatter:
            schema.update(frontmatter['output_schema'])

        return schema


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
