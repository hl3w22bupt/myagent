"""
Skill Hook System

Provides hook-based execution model for Skills.
"""
from .base import (
    BaseHook,
    NoOpHook,
    HookResult,
    HookResultAction,
    SkillContext
)
from .executor import SkillHookExecutor
from .trace_hook import SkillTraceHook

__all__ = [
    'BaseHook',
    'NoOpHook',
    'HookResult',
    'HookResultAction',
    'SkillContext',
    'SkillHookExecutor',
    'SkillTraceHook',
]
