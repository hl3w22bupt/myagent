# Core Skill Module

# Export main components
from .registry import SkillRegistry
from .executor import SkillExecutor
from .types import (
    SkillType,
    SkillMetadata,
    SkillDefinition,
    SkillResult,
    SkillContext,
    InputSchema,
    OutputSchema,
    ExecutionConfig
)

# Export Claude Skills adapter components
from .adapters import (
    ClaudeSkillScanner,
    ClaudeSkillAnalyzer,
    ClaudeSkillInfo,
    MyagentSkillGenerator,
    VirtualSkillRegistry,
    VirtualSkill,
)

# Export Claude Skills integration helpers
from .claude_integration import (
    create_executor_with_claude_skills,
    list_all_skills,
    get_claude_skill_paths,
    check_claude_skills_available,
)

# Export shared utilities from skills/lib
from .output_builder import (
    OutputBuilder,
    MediaInfo,
    ErrorInfo,
    get_relative_path,
    get_file_size,
    get_image_dimensions,
    get_video_dimensions,
    build_media_output,
    build_error_output
)

# Export LLM Client
try:
    from .llm_client import LLMClient, get_llm_client
    _llm_available = True
except ImportError:
    _llm_available = False

__all__ = [
    # Main components
    'SkillRegistry',
    'SkillExecutor',
    'SkillType',
    'SkillMetadata',
    'SkillDefinition',
    'SkillResult',
    'SkillContext',
    'InputSchema',
    'OutputSchema',
    'ExecutionConfig',

    # Claude Skills adapter
    'ClaudeSkillScanner',
    'ClaudeSkillAnalyzer',
    'ClaudeSkillInfo',
    'MyagentSkillGenerator',
    'VirtualSkillRegistry',
    'VirtualSkill',

    # Integration helpers
    'create_executor_with_claude_skills',
    'list_all_skills',
    'get_claude_skill_paths',
    'check_claude_skills_available',

    # Shared utilities
    'OutputBuilder',
    'MediaInfo',
    'ErrorInfo',
    'get_relative_path',
    'get_file_size',
    'get_image_dimensions',
    'get_video_dimensions',
    'build_media_output',
    'build_error_output',

    # LLM Client
    'LLMClient',
    'get_llm_client',
]
