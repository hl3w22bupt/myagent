"""
Skill filter for controlling which skills are allowed to load.

Provides filtering capabilities:
- Whitelist for bundled skills
- Per-skill enable/disable control
- OS compatibility filtering
- Tag-based filtering
"""

import platform
from typing import Dict, List, Any, Optional


class SkillFilter:
    """
    Skill filter for controlling skill loading.

    Determines which skills are allowed to be loaded based on:
    - Configuration (whitelist, enable/disable)
    - OS compatibility
    - Tag-based rules
    """

    def __init__(self, filter_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the skill filter.

        Args:
            filter_config: Filter configuration dictionary
        """
        self.config = filter_config or {}
        self.allowBundled = self.config.get("allowBundled", None)
        self.entries = self.config.get("entries", {})

    def is_eligible(self, skill_info: Any, level: str = "workspace") -> bool:
        """
        Check if a skill is eligible to be loaded.

        Args:
            skill_info: Skill information object
            level: Skill level (workspace, managed, bundled, extra)

        Returns:
            True if the skill can be loaded, False otherwise
        """
        # Check 1: Is skill explicitly disabled in config?
        if not self._is_enabled(skill_info.name):
            return False

        # Check 2: Is skill in bundled whitelist?
        if not self._check_whitelist(skill_info.name, level):
            return False

        # Check 3: OS compatibility
        if not self._check_os_compatibility(skill_info):
            return False

        # Check 4: Tag-based filtering
        if not self._check_tags(skill_info):
            return False

        return True

    def _is_enabled(self, skill_name: str) -> bool:
        """
        Check if a skill is explicitly enabled in config.

        Args:
            skill_name: Name of the skill

        Returns:
            True if enabled, False if explicitly disabled
        """
        skill_config = self.entries.get(skill_name, {})
        enabled = skill_config.get("enabled")

        # If enabled is explicitly set to False, disable the skill
        if enabled == False:
            return False

        # Default is enabled
        return True

    def _check_whitelist(self, skill_name: str, level: str) -> bool:
        """
        Check if a bundled skill is in the whitelist.

        Args:
            skill_name: Name of the skill
            level: Skill level

        Returns:
            True if allowed, False if not in whitelist
        """
        # Only applies to bundled skills
        if level != "bundled":
            return True

        # If no whitelist configured, all bundled skills are allowed
        if self.allowBundled is None:
            return True

        # Check if skill is in whitelist
        return skill_name in self.allowBundled

    def _check_os_compatibility(self, skill_info: Any) -> bool:
        """
        Check if a skill is compatible with the current OS.

        Args:
            skill_info: Skill information object

        Returns:
            True if compatible, False otherwise
        """
        # Get OS requirements from metadata
        metadata = getattr(skill_info, 'metadata', {})
        os_requirements = metadata.get("myagent", {}).get("os", [])

        if not os_requirements:
            # No OS restrictions
            return True

        # Get current OS
        current_os = platform.system().lower()

        # Map common OS names
        os_mapping = {
            "darwin": ["darwin", "macos", "mac"],
            "linux": ["linux"],
            "windows": ["windows", "win32"]
        }

        # Normalize current OS
        normalized_current = None
        for std_name, variants in os_mapping.items():
            if current_os in variants:
                normalized_current = std_name
                break

        if not normalized_current:
            normalized_current = current_os

        # Check if current OS is in allowed list
        return normalized_current in os_requirements

    def _check_tags(self, skill_info: Any) -> bool:
        """
        Check if a skill passes tag-based filtering rules.

        Priority:
        1. Check blocked tags first (blocklist has priority)
        2. Then check allowed tags (allowlist)

        Args:
            skill_info: Skill information object

        Returns:
            True if passes tag rules, False otherwise
        """
        # Get tag filtering rules from config
        tag_rules = self.config.get("tagRules", {})

        if not tag_rules:
            # No tag filtering
            return True

        # Get skill tags
        tags = getattr(skill_info, 'tags', [])

        # Check blocklist first (priority)
        blocked_tags = tag_rules.get("blockedTags", [])
        if blocked_tags:
            # Skill must not have any blocked tags
            if set(tags) & set(blocked_tags):
                return False

        # Check allowlist
        allowed_tags = tag_rules.get("allowedTags", [])
        if allowed_tags:
            # Skill must have at least one of the allowed tags
            return bool(set(tags) & set(allowed_tags))

        # No restrictions
        return True

    def set_skill_enabled(self, skill_name: str, enabled: bool):
        """
        Enable or disable a skill dynamically.

        Args:
            skill_name: Name of the skill
            enabled: Whether to enable the skill
        """
        if skill_name not in self.entries:
            self.entries[skill_name] = {}

        self.entries[skill_name]["enabled"] = enabled

    def get_skill_status(self, skill_name: str) -> Dict[str, Any]:
        """
        Get the status of a skill.

        Args:
            skill_name: Name of the skill

        Returns:
            Status dictionary with enabled flag and reason
        """
        return {
            "name": skill_name,
            "enabled": self._is_enabled(skill_name),
            "config": self.entries.get(skill_name, {})
        }

    def list_enabled_skills(self) -> List[str]:
        """
        List all explicitly enabled skills.

        Returns:
            List of skill names
        """
        return [
            name for name, config in self.entries.items()
            if config.get("enabled") is True
        ]

    def list_disabled_skills(self) -> List[str]:
        """
        List all explicitly disabled skills.

        Returns:
            List of skill names
        """
        return [
            name for name, config in self.entries.items()
            if config.get("enabled") is False
        ]
