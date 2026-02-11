"""
Hook Configuration

Configuration file for Skill hook system.
Defines available hooks and their settings.
"""
from typing import List, Optional
from src.core.skill.hooks.base import BaseHook
from src.core.skill.hooks.system.progress_notification_hook import ProgressNotificationHook
from src.core.skill.hooks.trace_hook import SkillTraceHook


# Hook configuration options
HOOK_CONFIG = {
    "enabled": [
        "progress_notification",
        "trace"
    ],
    "settings": {
        "progress_notification": {
            "api_url": "http://localhost:3000/api/notify"
        },
        "trace": {
            "enabled": True,
            "api_url": "http://localhost:3000/api/traces/submit"
        }
    }
}


def get_default_hooks(
    notify_hook_api_url: Optional[str] = None,
    trace_hook_api_url: Optional[str] = None
) -> List[BaseHook]:
    """
    Get default hook configuration.

    Args:
        notify_hook_api_url: Motia Notify API URL (overrides config)
        trace_hook_api_url: Motia Trace Submit API URL (overrides config)

    Returns:
        List of default hook instances
    """
    print(f"[DEBUG] get_default_hooks called with notify_hook_api_url={notify_hook_api_url}")

    hooks = []

    enabled_hooks = HOOK_CONFIG["enabled"]
    print(f"[DEBUG]   enabled_hooks={enabled_hooks}")

    # Progress notification hook
    if "progress_notification" in enabled_hooks:
        print(f"[DEBUG]   Progress notification is enabled")
        if notify_hook_api_url is not None:
            api_url = notify_hook_api_url or HOOK_CONFIG["settings"]["progress_notification"]["api_url"]
            print(f"[DEBUG]   api_url={api_url}")
            if api_url:
                hooks.append(ProgressNotificationHook(api_url))
                print(f"[DEBUG]   Added ProgressNotificationHook")
        else:
            print(f"[DEBUG]   notify_hook_api_url is None, skipping ProgressNotificationHook")

    # Trace hook
    if "trace" in enabled_hooks:
        print(f"[DEBUG]   Trace hook is enabled")
        if HOOK_CONFIG["settings"]["trace"].get("enabled", True):
            api_url = trace_hook_api_url or HOOK_CONFIG["settings"]["trace"]["api_url"]
            hooks.append(SkillTraceHook(api_url))
            print(f"[DEBUG]   Added SkillTraceHook with api_url={api_url}")

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
        elif hook_name == "trace":
            api_url = HOOK_CONFIG["settings"]["trace"]["api_url"]
            hooks.append(SkillTraceHook(api_url))
        # Add more custom hook types here
        # elif hook_name == "logging":
        #     from core.skill.hooks.common.logging_hook import LoggingHook
        #     log_level = HOOK_CONFIG["settings"]["logging"]["level"]
        #     hooks.append(LoggingHook(log_level))

    return hooks
