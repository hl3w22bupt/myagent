"""
Skill type definitions for the Motia Agent System.

This module defines the core data models for Skills using Pydantic.
Skills are reusable capability units that can be executed by Agents.
"""

from typing import Dict, Any, Optional, List
from enum import Enum
from pydantic import BaseModel, Field


class SkillType(str, Enum):
    """Types of Skills based on their implementation."""
    PURE_PROMPT = "pure-prompt"
    PURE_SCRIPT = "pure-script"
    HYBRID = "hybrid"


class InputSchema(BaseModel):
    """Input schema for a Skill."""
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)
    required: List[str] = Field(default_factory=list)


class OutputSchema(BaseModel):
    """Output schema for a Skill."""
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)


class ExecutionConfig(BaseModel):
    """Execution configuration for script-based Skills."""
    handler: str = Field(description="Python module or script file")
    function: str = Field(default="execute", description="Function name to call")
    timeout: int = Field(default=30000, description="Timeout in milliseconds")
    script_path: Optional[str] = Field(None, description="Absolute path to script file (for Claude Skills)")
    skill_name: Optional[str] = Field(None, description="Skill name (for Claude Skills)")


class HookConfig(BaseModel):
    """Hook configuration for Skills."""
    handler: str = Field(description="Hook Python module file")
    class_name: str = Field(alias="class", description="Hook class name")
    enabled: bool = Field(default=True, description="Whether hook is enabled")


class SkillMetadata(BaseModel):
    """
    Level 1: Lightweight metadata loaded at startup.

    This contains only the essential information about a Skill
    to enable fast startup and memory-efficient browsing.
    """
    name: str = Field(description="Unique skill identifier")
    version: str = Field(description="Semantic version")
    description: str = Field(description="Human-readable description")
    tags: List[str] = Field(default_factory=list, description="Searchable tags")
    type: SkillType = Field(description="Skill type")
    artifact_type: Optional[str] = Field(None, description="Artifact output type (optional manual declaration)")


class SkillDefinition(SkillMetadata):
    """
    Level 2: Full definition loaded on demand.

    This contains the complete Skill definition including
    schemas, prompts, and execution configuration.
    """
    input_schema: InputSchema = Field(description="Expected input structure")
    output_schema: OutputSchema = Field(description="Output structure")
    prompt_template: Optional[str] = Field(
        None,
        description="Prompt template for pure-prompt and hybrid skills"
    )
    execution: Optional[ExecutionConfig] = Field(
        None,
        description="Execution config for pure-script and hybrid skills"
    )

    def get_artifact_type(self) -> str:
        """
        获取 skill 的 artifact_type

        优先级:
        1. 手动声明的 artifact_type 字段（顶层）
        2. 从 output_schema.result_type 推断
        3. 从 tags 推断
        4. 默认 'text'
        """
        # 1. 检查手动声明
        if self.artifact_type:
            return self.artifact_type

        # 2. 从 output_schema.result_type 推断
        if self.output_schema and self.output_schema.properties:
            result_type = self.output_schema.properties.get('result_type', {})
            # Handle both dict and object with enum attribute
            enum_values = None
            if isinstance(result_type, dict):
                enum_values = result_type.get('enum', [])
            elif hasattr(result_type, 'enum'):
                enum_values = result_type.enum

            if enum_values:
                for t in enum_values:
                    if t != 'error':
                        return self._normalize_result_type(t)

        # 3. 从 tags 推断（基本映射）
        tag_mapping = {
            'video': 'video', 'remotion': 'video', 'animation': 'video',
            'image': 'image', 'infographic': 'image', 'svg': 'image',
            'code': 'code', 'programming': 'code',
            'markdown': 'markdown', 'documentation': 'markdown',
            'html': 'html',
            'json': 'json', 'data': 'json',
            'audio': 'audio', 'music': 'audio', 'sound': 'audio',
        }
        for tag in self.tags:
            tag_lower = tag.lower()
            if tag_lower in tag_mapping:
                return tag_mapping[tag_lower]

        # 4. 默认值
        return 'text'

    def _normalize_result_type(self, result_type: str) -> str:
        """标准化 result_type 到 artifact_type"""
        mapping = {
            'infographic': 'image',
            'video': 'video',
            'table': 'json',
        }
        return mapping.get(result_type, result_type)


class SkillResult(BaseModel):
    """Result from executing a Skill."""
    success: bool = Field(description="Whether execution succeeded")
    output: Optional[Any] = Field(None, description="Skill output if successful")
    error: Optional[str] = Field(None, description="Error message if failed")
    execution_time: float = Field(default=0.0, description="Execution time in seconds")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    @property
    def artifact_type(self) -> str:
        """获取 artifact_type（从 metadata 或推断）"""
        return self.metadata.get('artifact_type', 'text')


class SkillContext(BaseModel):
    """Execution context passed to Skills."""
    skill_name: str
    input_data: Dict[str, Any]
    trace_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
