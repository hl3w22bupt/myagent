"""
Hook Configuration

Configuration file for Skill hook system.
Defines available hooks and their settings.
"""
import os
from typing import List, Optional
from src.core.skill.hooks.base import BaseHook
from src.core.skill.hooks.system.progress_notification_hook import ProgressNotificationHook
from src.core.skill.hooks.system.claude_skill_hook import ClaudeSkillHook
from src.core.skill.hooks.trace_hook import SkillTraceHook
from src.core.skill.hooks.context_hook import ContextHook


# Hook configuration options
HOOK_CONFIG = {
    "enabled": [
        "progress_notification",
        "claude_skill",
        "trace",
        "context"
    ],
    "settings": {
        "progress_notification": {
            "api_url": "http://localhost:3000/api/notify"
        },
        "claude_skill": {
            "enabled": True
        },
        "trace": {
            "enabled": True,
            "api_url": "http://localhost:3000/api/traces/submit"
        },
        "context": {
            "enabled": True,
            "api_url": "http://localhost:3000/api/context"
        }
    }
}


def get_default_hooks(
    notify_hook_api_url: Optional[str] = None,
    trace_hook_api_url: Optional[str] = None,
    context_hook_api_url: Optional[str] = None
) -> List[BaseHook]:
    """
    Get default hook configuration.

    Args:
        notify_hook_api_url: Motia Notify API URL (overrides config)
        trace_hook_api_url: Motia Trace Submit API URL (overrides config)
        context_hook_api_url: Context Tracking API URL (overrides config)

    Returns:
        List of default hook instances
    """
    hooks = []

    enabled_hooks = HOOK_CONFIG["enabled"]

    # Progress notification hook
    if "progress_notification" in enabled_hooks:
        if notify_hook_api_url is not None:
            api_url = notify_hook_api_url or HOOK_CONFIG["settings"]["progress_notification"]["api_url"]
            if api_url:
                hooks.append(ProgressNotificationHook(api_url))

    # Claude skill hook
    if "claude_skill" in enabled_hooks:
        if HOOK_CONFIG["settings"]["claude_skill"].get("enabled", True):
            hooks.append(ClaudeSkillHook())

    # Trace hook
    if "trace" in enabled_hooks:
        if HOOK_CONFIG["settings"]["trace"].get("enabled", True):
            api_url = trace_hook_api_url or HOOK_CONFIG["settings"]["trace"]["api_url"]
            hooks.append(SkillTraceHook(api_url))

    # Context hook (新增)
    if "context" in enabled_hooks:
        if HOOK_CONFIG["settings"]["context"].get("enabled", True):
            context_hook_api_url = HOOK_CONFIG["settings"]["context"]["api_url"]
            hooks.append(ContextHook(context_hook_api_url))

    print(f"[DEBUG]   Returning {len(hooks)} hooks")
    return hooks


def get_custom_hooks(hook_names: List[str]) -> List[BaseHook]:
    """
    Get custom hook instances by name.

    Args:
        hook_names: List of hook names to instantiate

    Returns:
        List of custom hook instances
    """
    hooks = []

    for hook_name in hook_names:
        if hook_name == "progress_notification":
            api_url = HOOK_CONFIG["settings"]["progress_notification"]["api_url"]
            hooks.append(ProgressNotificationHook(api_url))
        elif hook_name == "claude_skill":
            hooks.append(ClaudeSkillHook())
        elif hook_name == "trace":
            api_url = HOOK_CONFIG["settings"]["trace"]["api_url"]
            hooks.append(SkillTraceHook(api_url))
        elif hook_name == "context":
            # Use provided URL or fall back to config or environment variable
            api_url = context_hook_api_url or os.getenv('MOTIA_CONTEXT_API_URL') or HOOK_CONFIG["settings"]["context"]["api_url"]
            hooks.append(ContextHook(api_url))
        # Add more custom hook types here
        # elif hook_name == "logging":
        #     from core.skill.hooks.common.logging_hook import LoggingHook
        #     log_level = HOOK_CONFIG["settings"]["logging"]["level"]
        #     hooks.append(LoggingHook(log_level))

    return hooks
