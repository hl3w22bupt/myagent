"""
Standalone test script for SkillFilter (no dependencies).
"""

import platform


class MockSkillInfo:
    """Mock skill info for testing."""
    def __init__(self, name, tags=None, metadata=None):
        self.name = name
        self.tags = tags or []
        self.metadata = metadata or {}


class SimpleSkillFilter:
    """Simplified version for testing."""

    def __init__(self, filter_config=None):
        self.config = filter_config or {}
        self.allowBundled = self.config.get("allowBundled", None)
        self.entries = self.config.get("entries", {})

    def is_eligible(self, skill_info, level="workspace"):
        """Check if a skill is eligible to be loaded."""
        # Check 1: Is skill explicitly disabled?
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

    def _is_enabled(self, skill_name):
        """Check if a skill is explicitly enabled."""
        skill_config = self.entries.get(skill_name, {})
        enabled = skill_config.get("enabled")
        if enabled == False:
            return False
        return True

    def _check_whitelist(self, skill_name, level):
        """Check if a bundled skill is in the whitelist."""
        if level != "bundled":
            return True
        if self.allowBundled is None:
            return True
        return skill_name in self.allowBundled

    def _check_os_compatibility(self, skill_info):
        """Check if a skill is compatible with the current OS."""
        metadata = getattr(skill_info, 'metadata', {})
        os_requirements = metadata.get("myagent", {}).get("os", [])
        if not os_requirements:
            return True
        current_os = platform.system().lower()
        os_mapping = {
            "darwin": ["darwin", "macos", "mac"],
            "linux": ["linux"],
            "windows": ["windows", "win32"]
        }
        normalized_current = None
        for std_name, variants in os_mapping.items():
            if current_os in variants:
                normalized_current = std_name
                break
        if not normalized_current:
            normalized_current = current_os
        return normalized_current in os_requirements

    def _check_tags(self, skill_info):
        """Check if a skill passes tag-based filtering."""
        tag_rules = self.config.get("tagRules", {})
        if not tag_rules:
            return True
        tags = getattr(skill_info, 'tags', [])

        # Check blocklist first (priority)
        blocked_tags = tag_rules.get("blockedTags", [])
        if blocked_tags:
            if set(tags) & set(blocked_tags):
                return False

        # Check allowlist
        allowed_tags = tag_rules.get("allowedTags", [])
        if allowed_tags:
            return bool(set(tags) & set(allowed_tags))

        return True

    def set_skill_enabled(self, skill_name, enabled):
        """Enable or disable a skill dynamically."""
        if skill_name not in self.entries:
            self.entries[skill_name] = {}
        self.entries[skill_name]["enabled"] = enabled

    def get_skill_status(self, skill_name):
        """Get the status of a skill."""
        return {
            "name": skill_name,
            "enabled": self._is_enabled(skill_name),
            "config": self.entries.get(skill_name, {})
        }

    def list_enabled_skills(self):
        """List all explicitly enabled skills."""
        return [
            name for name, config in self.entries.items()
            if config.get("enabled") is True
        ]

    def list_disabled_skills(self):
        """List all explicitly disabled skills."""
        return [
            name for name, config in self.entries.items()
            if config.get("enabled") is False
        ]


def test_basic_filtering():
    """Test basic filtering operations."""
    print("Testing SkillFilter...\n")

    # Test 1: No filter (all skills allowed)
    print("1. Testing no filter (default behavior)...")
    filter = SimpleSkillFilter({})
    skill = MockSkillInfo("test-skill")
    assert filter.is_eligible(skill) == True
    print(f"   ✅ No filter: test-skill allowed\n")

    # Test 2: Disable a skill
    print("2. Testing skill disable...")
    filter_config = {
        "entries": {
            "test-skill": {
                "enabled": False
            }
        }
    }
    filter = SimpleSkillFilter(filter_config)
    skill = MockSkillInfo("test-skill")
    assert filter.is_eligible(skill) == False
    print(f"   ✅ test-skill disabled\n")

    # Test 3: Whitelist for bundled skills
    print("3. Testing bundled skills whitelist...")
    filter_config = {
        "allowBundled": ["web-search", "code-analysis"]
    }
    filter = SimpleSkillFilter(filter_config)

    # Bundled skill in whitelist
    skill = MockSkillInfo("web-search")
    assert filter.is_eligible(skill, level="bundled") == True
    print(f"   ✅ web-search (in whitelist) allowed")

    # Bundled skill not in whitelist
    skill = MockSkillInfo("video-generator")
    assert filter.is_eligible(skill, level="bundled") == False
    print(f"   ✅ video-generator (not in whitelist) blocked")

    # Workspace skills are not affected
    skill = MockSkillInfo("custom-skill")
    assert filter.is_eligible(skill, level="workspace") == True
    print(f"   ✅ custom-skill (workspace) not affected\n")

    # Test 4: OS compatibility filtering
    print("4. Testing OS compatibility filtering...")
    filter = SimpleSkillFilter({})

    # No OS restrictions
    skill = MockSkillInfo("any-os-skill")
    assert filter.is_eligible(skill) == True
    print(f"   ✅ No OS restrictions: any-os-skill allowed")

    # Current OS only
    metadata = {"myagent": {"os": [platform.system().lower()]}}
    skill = MockSkillInfo(f"{platform.system()}-skill", metadata=metadata)
    assert filter.is_eligible(skill) == True
    print(f"   ✅ {platform.system()}-only skill allowed on {platform.system()}")

    # Different OS
    other_os = "linux" if platform.system() != "Linux" else "darwin"
    metadata = {"myagent": {"os": [other_os]}}
    skill = MockSkillInfo(f"{other_os}-skill", metadata=metadata)
    assert filter.is_eligible(skill) == False
    print(f"   ✅ {other_os}-skill blocked on {platform.system()}\n")

    # Test 5: Tag-based filtering
    print("5. Testing tag-based filtering...")
    filter_config = {
        "tagRules": {
            "allowedTags": ["stable", "production"],
            "blockedTags": ["experimental", "deprecated"]
        }
    }
    filter = SimpleSkillFilter(filter_config)

    # Skill with allowed tag
    skill = MockSkillInfo("stable-skill", tags=["stable"])
    assert filter.is_eligible(skill) == True
    print(f"   ✅ stable-skill (has 'stable' tag) allowed")

    # Skill with blocked tag
    skill = MockSkillInfo("deprecated-skill", tags=["deprecated"])
    assert filter.is_eligible(skill) == False
    print(f"   ✅ deprecated-skill (has 'deprecated' tag) blocked")

    # Skill with multiple tags (one blocked)
    skill = MockSkillInfo("mixed-skill", tags=["stable", "experimental"])
    assert filter.is_eligible(skill) == False
    print(f"   ✅ mixed-skill (has 'experimental' tag) blocked")

    # Skill with no tags (when allowedTags is set, should be blocked)
    skill = MockSkillInfo("untagged-skill", tags=[])
    assert filter.is_eligible(skill) == False
    print(f"   ✅ untagged-skill (no tags, but allowedTags set) blocked")

    # Add a new tag to make it allowed
    skill = MockSkillInfo("tagged-skill", tags=["stable"])
    assert filter.is_eligible(skill) == True
    print(f"   ✅ tagged-skill (has 'stable' tag) allowed\n")

    # Test 6: Dynamic enable/disable
    print("6. Testing dynamic enable/disable...")
    filter_config = {
        "entries": {
            "test-skill": {
                "enabled": False
            }
        }
    }
    filter = SimpleSkillFilter(filter_config)

    # Initially disabled
    skill = MockSkillInfo("test-skill")
    assert filter.is_eligible(skill) == False
    print(f"   ✅ test-skill initially disabled")

    # Enable it
    filter.set_skill_enabled("test-skill", True)
    assert filter.is_eligible(skill) == True
    print(f"   ✅ test-skill enabled dynamically")

    # Disable it again
    filter.set_skill_enabled("test-skill", False)
    assert filter.is_eligible(skill) == False
    print(f"   ✅ test-skill disabled dynamically\n")

    # Test 7: Get skill status
    print("7. Testing get_skill_status...")
    filter_config = {
        "entries": {
            "enabled-skill": {"enabled": True},
            "disabled-skill": {"enabled": False}
        }
    }
    filter = SimpleSkillFilter(filter_config)

    status = filter.get_skill_status("enabled-skill")
    assert status["enabled"] == True
    print(f"   ✅ enabled-skill status: {status['enabled']}")

    status = filter.get_skill_status("disabled-skill")
    assert status["enabled"] == False
    print(f"   ✅ disabled-skill status: {status['enabled']}")

    status = filter.get_skill_status("unknown-skill")
    assert status["enabled"] == True  # Default is enabled
    print(f"   ✅ unknown-skill status: {status['enabled']} (default)\n")

    # Test 8: List enabled/disabled skills
    print("8. Testing list_enabled/disabled skills...")
    assert filter.list_enabled_skills() == ["enabled-skill"]
    print(f"   ✅ Enabled skills: {filter.list_enabled_skills()}")

    assert filter.list_disabled_skills() == ["disabled-skill"]
    print(f"   ✅ Disabled skills: {filter.list_disabled_skills()}\n")

    # Test 9: Real-world scenario - experimental skill control
    print("9. Testing real-world scenario: experimental skill control...")
    filter_config = {
        "allowBundled": ["web-search", "code-analysis"],
        "entries": {
            "experimental-ai": {
                "enabled": False
            },
            "prod-tool": {
                "enabled": True
            }
        },
        "tagRules": {
            "blockedTags": ["experimental"]
        }
    }
    filter = SimpleSkillFilter(filter_config)

    # Experimental skill - disabled
    skill = MockSkillInfo("experimental-ai", tags=["experimental"])
    assert filter.is_eligible(skill) == False
    print(f"   ✅ experimental-ai blocked (disabled + experimental tag)")

    # Production tool - enabled
    skill = MockSkillInfo("prod-tool", tags=["production"])
    assert filter.is_eligible(skill) == True
    print(f"   ✅ prod-tool allowed (enabled)")

    # Bundled skill in whitelist
    skill = MockSkillInfo("web-search")
    assert filter.is_eligible(skill, level="bundled") == True
    print(f"   ✅ web-search allowed (in whitelist)")

    # Bundled skill not in whitelist
    skill = MockSkillInfo("new-feature")
    assert filter.is_eligible(skill, level="bundled") == False
    print(f"   ✅ new-feature blocked (not in whitelist)\n")

    print("=" * 50)
    print("✅ All tests passed!")
    print("=" * 50)


def test_os_compatibility_current_platform():
    """Test OS compatibility on current platform."""
    print("\n" + "=" * 50)
    print(f"Testing OS Compatibility on {platform.system()}")
    print("=" * 50 + "\n")

    filter = SimpleSkillFilter({})

    # Current OS should be allowed
    current_os = platform.system().lower()
    metadata = {"myagent": {"os": [current_os]}}
    skill = MockSkillInfo(f"{current_os}-skill", metadata=metadata)

    assert filter.is_eligible(skill) == True
    print(f"✅ {current_os}-skill allowed on {platform.system()}")

    # Other OS should be blocked
    other_os = "linux" if current_os != "Linux" else "darwin"
    metadata = {"myagent": {"os": [other_os]}}
    skill = MockSkillInfo(f"{other_os}-skill", metadata=metadata)

    assert filter.is_eligible(skill) == False
    print(f"✅ {other_os}-skill blocked on {platform.system()}")

    print("\n" + "=" * 50)
    print("✅ OS compatibility test passed!")
    print("=" * 50)


if __name__ == "__main__":
    test_basic_filtering()
    test_os_compatibility_current_platform()
