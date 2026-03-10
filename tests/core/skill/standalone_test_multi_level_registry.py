"""
Standalone test script for MultiLevelSkillRegistry.
"""

import asyncio
import tempfile
import shutil
from pathlib import Path


class MockSkillMetadata:
    """Mock skill metadata for testing."""
    def __init__(self, name, version="1.0.0", description="Test skill", tags=None):
        self.name = name
        self.version = version
        self.description = description
        self.tags = tags or []
        self.type = "pure-script"


class MockSkillRegistry:
    """Mock registry for testing."""
    def __init__(self, skills_dir=""):
        self.skills_dir = skills_dir
        self._metadata = {}
        self._loaded = False

    async def scan(self):
        """Mock scan - returns predefined metadata."""
        self._loaded = True
        return self._metadata

    def get_skill_names(self):
        """Get skill names."""
        return list(self._metadata.keys())

    def clear_cache(self):
        """Clear cache."""
        pass


class MockMultiLevelSkillRegistry:
    """Simplified multi-level registry for testing."""

    def __init__(self, directories=None):
        self.directories = directories or {
            1: "skills/",
            2: "skills/managed/",
            3: "skills/bundled/",
            4: "skills/extra/"
        }

        self.registries = {}
        for level, dir_path in self.directories.items():
            self.registries[level] = MockSkillRegistry(dir_path)

        self._merged_metadata = {}
        self._skill_levels = {}
        self._loaded = False

    async def scan_all_levels(self):
        """Scan all levels and merge metadata."""
        print("\n🔍 Scanning all skill levels...")

        # Scan levels in reverse priority order (lowest first, highest last)
        # This ensures higher levels override lower levels
        for level in sorted(self.directories.keys(), reverse=True):
            registry = self.registries[level]
            dir_path = self.directories[level]

            print(f"\n📁 Level {level}: {dir_path}")

            # Scan this level
            metadata = await registry.scan()

            print(f"   ✓ Found {len(metadata)} skills")

            # Merge into main metadata
            for skill_name, skill_meta in metadata.items():
                if skill_name in self._merged_metadata:
                    old_level = self._skill_levels[skill_name]
                    print(f"      → '{skill_name}' overridden by level {level} (was {old_level})")
                else:
                    print(f"      → '{skill_name}' added from level {level}")

                self._merged_metadata[skill_name] = skill_meta
                self._skill_levels[skill_name] = level

        self._loaded = True

        print(f"\n✅ Total unique skills: {len(self._merged_metadata)}")
        self._print_summary()

        return self._merged_metadata

    def get_skill_level(self, skill_name):
        """Get skill level."""
        return self._skill_levels.get(skill_name)

    def list_skills_by_level(self, level):
        """List skills by level."""
        return [
            name for name, lvl in self._skill_levels.items()
            if lvl == level
        ]

    def get_level_counts(self):
        """Get level counts."""
        counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for level in self._skill_levels.values():
            counts[level] += 1
        return counts

    def get_skill_names(self):
        """Get all skill names."""
        return list(self._merged_metadata.keys())

    def _print_summary(self):
        """Print summary."""
        counts = self.get_level_counts()

        print("\n📊 Skill Summary:")
        for level in sorted(counts.keys()):
            count = counts[level]
            if count > 0:
                print(f"   Level {level}: {count} skills")

    def get_skill_sources(self, skill_name):
        """Get all levels that have a skill."""
        sources = []
        for level in self.registries.keys():
            if skill_name in self.registries[level].get_skill_names():
                sources.append(level)
        return sources


def test_basic_multi_level_loading():
    """Test basic multi-level loading."""
    print("Testing MultiLevelSkillRegistry...\n")

    # Create registry
    registry = MockMultiLevelSkillRegistry()

    # Setup mock data - Level 1 (workspace)
    registry.registries[1]._metadata = {
        "custom-tool": MockSkillMetadata("custom-tool", tags=["custom"]),
        "web-search": MockSkillMetadata("web-search", version="2.0.0", tags=["search"])
    }

    # Level 2 (managed)
    registry.registries[2]._metadata = {
        "web-search": MockSkillMetadata("web-search", version="1.5.0", tags=["search", "managed"]),
        "code-analysis": MockSkillMetadata("code-analysis", tags=["code"])
    }

    # Level 3 (bundled)
    registry.registries[3]._metadata = {
        "web-search": MockSkillMetadata("web-search", version="1.0.0", tags=["search", "bundled"]),
        "file-reader": MockSkillMetadata("file-reader", tags=["file"])
    }

    # Test 1: Scan all levels
    print("1. Testing scan all levels...")
    metadata = asyncio.run(registry.scan_all_levels())
    print(f"   Total skills: {len(metadata)}")
    assert len(metadata) == 4, "Should have 4 unique skills"
    print(f"   ✅ Scan all levels works!\n")

    # Test 2: Verify priority (workspace overrides bundled)
    print("2. Testing priority override...")
    web_search_level = registry.get_skill_level("web-search")
    print(f"   web-search level: {web_search_level}")
    assert web_search_level == 1, "web-search should be from level 1 (workspace)"
    web_search_meta = metadata["web-search"]
    print(f"   web-search version: {web_search_meta.version}")
    assert web_search_meta.version == "2.0.0", "Should use workspace version"
    print(f"   ✅ Priority override works!\n")

    # Test 3: List skills by level
    print("3. Testing list by level...")
    level1_skills = registry.list_skills_by_level(1)
    level2_skills = registry.list_skills_by_level(2)
    level3_skills = registry.list_skills_by_level(3)

    print(f"   Level 1 (workspace): {level1_skills}")
    print(f"   Level 2 (managed): {level2_skills}")
    print(f"   Level 3 (bundled): {level3_skills}")

    assert "custom-tool" in level1_skills
    assert "web-search" in level1_skills
    assert "code-analysis" in level2_skills
    assert "file-reader" in level3_skills
    print(f"   ✅ List by level works!\n")

    # Test 4: Get level counts
    print("4. Testing level counts...")
    counts = registry.get_level_counts()
    print(f"   Counts: {counts}")
    assert counts[1] == 2, "Level 1 should have 2 skills"
    assert counts[2] == 1, "Level 2 should have 1 skill"
    assert counts[3] == 1, "Level 3 should have 1 skill"
    print(f"   ✅ Level counts work!\n")

    # Test 5: Get skill sources
    print("5. Testing skill sources...")
    web_search_sources = registry.get_skill_sources("web-search")
    print(f"   web-search sources: {web_search_sources}")
    assert len(web_search_sources) == 3, "web-search should be in 3 levels"
    print(f"   ✅ Skill sources work!\n")

    print("=" * 50)
    print("✅ All basic tests passed!")
    print("=" * 50)


def test_override_behavior():
    """Test override behavior in detail."""
    print("\n" + "=" * 50)
    print("Testing Override Behavior")
    print("=" * 50 + "\n")

    registry = MockMultiLevelSkillRegistry()

    # Same skill in all levels
    for level in [1, 2, 3, 4]:
        registry.registries[level]._metadata = {
            "shared-skill": MockSkillMetadata(
                "shared-skill",
                version=f"{level}.0.0",
                description=f"From level {level}"
            )
        }

    print("1. Testing highest level wins...")
    metadata = asyncio.run(registry.scan_all_levels())

    shared_skill = metadata["shared-skill"]
    shared_level = registry.get_skill_level("shared-skill")

    print(f"   shared-skill level: {shared_level}")
    print(f"   shared-skill version: {shared_skill.version}")
    print(f"   shared-skill description: {shared_skill.description}")

    assert shared_level == 1, "Should use level 1"
    assert shared_skill.version == "1.0.0", "Should use level 1 version"
    print(f"   ✅ Highest level wins!\n")

    print("2. Testing all sources tracked...")
    sources = registry.get_skill_sources("shared-skill")
    print(f"   Sources: {sources}")
    assert len(sources) == 4, "Should track all 4 levels"
    print(f"   ✅ All sources tracked!\n")

    print("=" * 50)
    print("✅ Override behavior tests passed!")
    print("=" * 50)


def test_real_world_scenario():
    """Test real-world scenario with skill organization."""
    print("\n" + "=" * 50)
    print("Testing Real-World Scenario")
    print("=" * 50 + "\n")

    registry = MockMultiLevelSkillRegistry()

    # Workspace: User's custom skills
    registry.registries[1]._metadata = {
        "my-web-search": MockSkillMetadata("my-web-search", tags=["custom", "search"]),
        "my-video-editor": MockSkillMetadata("my-video-editor", tags=["custom", "video"])
    }

    # Managed: Team-maintained skills
    registry.registries[2]._metadata = {
        "web-search": MockSkillMetadata("web-search", tags=["managed", "search"]),
        "code-analysis": MockSkillMetadata("code-analysis", tags=["managed", "code"])
    }

    # Bundled: Built-in skills
    registry.registries[3]._metadata = {
        "web-search": MockSkillMetadata("web-search", tags=["bundled", "search"]),
        "file-reader": MockSkillMetadata("file-reader", tags=["bundled", "file"]),
        "log-analyzer": MockSkillMetadata("log-analyzer", tags=["bundled", "log"])
    }

    # Extra: Optional experimental skills
    registry.registries[4]._metadata = {
        "experimental-ai": MockSkillMetadata("experimental-ai", tags=["experimental", "ai"]),
        "beta-tool": MockSkillMetadata("beta-tool", tags=["beta"])
    }

    print("1. Loading all skills...")
    metadata = asyncio.run(registry.scan_all_levels())

    print(f"\n2. Skill organization:")
    print(f"   Total unique skills: {len(metadata)}")

    level1 = registry.list_skills_by_level(1)
    level2 = registry.list_skills_by_level(2)
    level3 = registry.list_skills_by_level(3)
    level4 = registry.list_skills_by_level(4)

    print(f"\n   Workspace (Level 1): {level1}")
    print(f"   Managed (Level 2): {level2}")
    print(f"   Bundled (Level 3): {level3}")
    print(f"   Extra (Level 4): {level4}")

    # Verify override
    web_search_level = registry.get_skill_level("web-search")
    print(f"\n3. Override verification:")
    print(f"   web-search is from level {web_search_level}")
    assert web_search_level == 2, "Should use managed version (level 2)"
    print(f"   ✅ Managed version overrides bundled!")

    # Verify unique skills
    all_names = registry.get_skill_names()
    print(f"\n4. Unique skills: {len(all_names)}")
    print(f"   {all_names}")

    expected_count = 2 + 2 + 2 + 2  # workspace + managed + bundled + extra
    assert len(all_names) == expected_count, f"Should have {expected_count} unique skills"
    print(f"   ✅ All unique skills loaded!\n")

    print("=" * 50)
    print("✅ Real-world scenario test passed!")
    print("=" * 50)


def test_empty_levels():
    """Test behavior with empty levels."""
    print("\n" + "=" * 50)
    print("Testing Empty Levels")
    print("=" * 50 + "\n")

    registry = MockMultiLevelSkillRegistry()

    # Only level 3 has skills
    registry.registries[3]._metadata = {
        "only-skill": MockSkillMetadata("only-skill")
    }

    print("1. Testing with only one level populated...")
    metadata = asyncio.run(registry.scan_all_levels())

    print(f"   Total skills: {len(metadata)}")
    assert len(metadata) == 1, "Should have 1 skill"
    assert "only-skill" in metadata
    print(f"   ✅ Handles empty levels!\n")

    print("=" * 50)
    print("✅ Empty levels test passed!")
    print("=" * 50)


if __name__ == "__main__":
    test_basic_multi_level_loading()
    test_override_behavior()
    test_real_world_scenario()
    test_empty_levels()
