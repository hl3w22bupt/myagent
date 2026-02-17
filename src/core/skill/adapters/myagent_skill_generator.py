"""
myagent Skill Generator

Generates myagent skill.yaml mappings from Claude Skill metadata.

This component converts ClaudeSkillInfo into myagent-compatible skill definitions.
It can either generate skill.yaml files or create virtual skill mappings.
"""

import yaml
from pathlib import Path
from typing import Dict, Any, Optional, TYPE_CHECKING

from .claude_skill_analyzer import ClaudeSkillInfo

# Avoid circular imports
if TYPE_CHECKING:
    from .virtual_skill_registry import VirtualSkill


class MyagentSkillGenerator:
    """
    Generator for myagent skill definitions from Claude Skills.

    Converts ClaudeSkillInfo into myagent-compatible skill.yaml format.
    Can generate files or create virtual mappings.
    """

    def __init__(
        self,
        handler_path: str = "src/core/skill/handlers/claude_skill_handler.py",
        default_timeout: int = 30000
    ):
        """
        Initialize the myagent Skill Generator.

        Args:
            handler_path: Path to the Claude skill handler
            default_timeout: Default timeout for script execution (ms)
        """
        self.handler_path = handler_path
        self.default_timeout = default_timeout

    def generate_yaml(self, skill_info: ClaudeSkillInfo) -> Dict[str, Any]:
        """
        Generate a myagent skill.yaml definition from Claude Skill info.

        Args:
            skill_info: Parsed ClaudeSkillInfo

        Returns:
            Dictionary representing the skill.yaml content
        """
        # Base definition
        definition = {
            'name': skill_info.name,
            'description': skill_info.description,
            'version': '1.0.0',  # Default version for Claude Skills
            'type': skill_info.type,
            'tags': skill_info.tags,
        }

        # Add input schema (generic for Claude Skills)
        definition['input_schema'] = self._generate_input_schema(skill_info)

        # Add output schema
        definition['output_schema'] = self._generate_output_schema(skill_info)

        # Add prompt template for pure-prompt and hybrid skills
        if skill_info.type in ['pure-prompt', 'hybrid']:
            definition['prompt_template'] = skill_info.prompt_template

        # Add execution config for hybrid skills
        if skill_info.type == 'hybrid' and skill_info.has_script:
            definition['execution'] = self._generate_execution_config(skill_info)

        return definition

    def _generate_input_schema(self, skill_info: ClaudeSkillInfo) -> Dict[str, Any]:
        """
        Generate input schema for the skill.

        Claude Skills have generic input schema that accepts any data.

        Args:
            skill_info: ClaudeSkillInfo

        Returns:
            Input schema dictionary
        """
        return {
            'type': 'object',
            'properties': {
                'task': {
                    'type': 'string',
                    'description': 'Task description or input for the skill'
                },
                'context': {
                    'type': 'object',
                    'description': 'Additional context for execution'
                }
            }
        }

    def _generate_output_schema(self, skill_info: ClaudeSkillInfo) -> Dict[str, Any]:
        """
        Generate output schema based on detected output type.

        Args:
            skill_info: ClaudeSkillInfo

        Returns:
            Output schema dictionary
        """
        if skill_info.output_type == 'json':
            return {
                'type': 'object',
                'properties': {
                    'result': {
                        'type': 'object',
                        'description': 'Structured JSON result'
                    }
                }
            }
        else:
            return {
                'type': 'object',
                'properties': {
                    'content': {
                        'type': 'string',
                        'description': 'Text output from the skill'
                    }
                }
            }

    def _generate_execution_config(self, skill_info: ClaudeSkillInfo) -> Dict[str, Any]:
        """
        Generate execution configuration for hybrid skills.

        Args:
            skill_info: ClaudeSkillInfo

        Returns:
            Execution configuration dictionary
        """
        return {
            'handler': self.handler_path,
            'function': 'execute',
            'timeout': self.default_timeout,
            'skill_type': 'claude',  # Mark as Claude Skill
            'script_path': str(skill_info.script_path) if skill_info.script_path else None,
            'skill_name': skill_info.name
        }

    def generate_yaml_string(self, skill_info: ClaudeSkillInfo) -> str:
        """
        Generate skill.yaml as a formatted string.

        Args:
            skill_info: ClaudeSkillInfo

        Returns:
            YAML string
        """
        definition = self.generate_yaml(skill_info)
        return yaml.dump(definition, default_flow_style=False, sort_keys=False)

    def write_yaml_file(
        self,
        skill_info: ClaudeSkillInfo,
        output_path: Path
    ) -> None:
        """
        Write skill.yaml to a file.

        Args:
            skill_info: ClaudeSkillInfo
            output_path: Path to write the skill.yaml file
        """
        yaml_content = self.generate_yaml_string(skill_info)

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(yaml_content, encoding='utf-8')

    def to_virtual_skill(self, skill_info: ClaudeSkillInfo) -> 'VirtualSkill':
        """
        Convert ClaudeSkillInfo to a VirtualSkill.

        This creates an in-memory skill mapping without generating files.

        Args:
            skill_info: ClaudeSkillInfo

        Returns:
            VirtualSkill instance
        """
        from ..types import SkillMetadata, SkillDefinition, InputSchema, OutputSchema, ExecutionConfig, SkillType
        from .virtual_skill_registry import VirtualSkill

        # Create metadata
        metadata = SkillMetadata(
            name=skill_info.name,
            version='1.0.0',
            description=skill_info.description,
            tags=skill_info.tags,
            type=SkillType(skill_info.type)
        )

        # Create schemas
        input_schema = InputSchema(**self._generate_input_schema(skill_info))
        output_schema = OutputSchema(**self._generate_output_schema(skill_info))

        # Create execution config for hybrid skills
        execution_config = None
        if skill_info.type == 'hybrid' and skill_info.has_script:
            exec_dict = self._generate_execution_config(skill_info)
            execution_config = ExecutionConfig(
                handler=exec_dict['handler'],
                function=exec_dict['function'],
                timeout=exec_dict['timeout'],
                script_path=exec_dict.get('script_path'),
                skill_name=exec_dict.get('skill_name')
            )

        # Create full definition
        definition = SkillDefinition(
            **metadata.dict(),
            input_schema=input_schema,
            output_schema=output_schema,
            prompt_template=skill_info.prompt_template if skill_info.type in ['pure-prompt', 'hybrid'] else None,
            execution=execution_config
        )

        # Create virtual skill
        return VirtualSkill(
            skill_info=skill_info,
            definition=definition
        )


# Convenience function for quick generation
def generate_myagent_skill(skill_info: ClaudeSkillInfo) -> Dict[str, Any]:
    """
    Convenience function to generate myagent skill definition.

    Args:
        skill_info: ClaudeSkillInfo

    Returns:
        Skill definition dictionary
    """
    generator = MyagentSkillGenerator()
    return generator.generate_yaml(skill_info)
