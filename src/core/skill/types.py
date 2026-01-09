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


class SkillResult(BaseModel):
    """Result from executing a Skill."""
    success: bool = Field(description="Whether execution succeeded")
    output: Optional[Any] = Field(None, description="Skill output if successful")
    error: Optional[str] = Field(None, description="Error message if failed")
    execution_time: float = Field(default=0.0, description="Execution time in seconds")


class SkillContext(BaseModel):
    """Execution context passed to Skills."""
    skill_name: str
    input_data: Dict[str, Any]
    trace_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
