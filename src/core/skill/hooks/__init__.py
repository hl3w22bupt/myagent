"""
Skill Hook System

Provides hook-based execution model for Skills.
"""
from core.skill.hooks.base import (
    BaseHook,
    NoOpHook,
    HookResult,
    HookResultAction,
    SkillContext
)
from core.skill.hooks.executor import SkillHookExecutor

__all__ = [
    'BaseHook',
    'NoOpHook',
    'HookResult',
    'HookResultAction',
    'SkillContext',
    'SkillHookExecutor',
]
