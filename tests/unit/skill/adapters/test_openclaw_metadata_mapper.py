"""
Unit tests for OpenClaw Metadata Mapper
"""

import pytest
from pathlib import Path
import sys

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from src.core.skill.adapters.openclaw_skill_analyzer import OpenClawSkillInfo
from src.core.skill.adapters.openclaw_metadata_mapper import (
    OpenClawMetadataMapper,
    map_openclaw_to_myagent
)


class TestOpenClawMetadataMapper:
    """Test suite for OpenClawMetadataMapper"""

    @pytest.fixture
    def pure_prompt_info(self):
        """Create a pure-prompt skill info"""
        return OpenClawSkillInfo(
            name="test-prompt",
            description="A test pure prompt skill",
            type="pure-prompt",
            dependencies={"bins": ["ffmpeg"], "env": ["API_KEY"], "config": [], "anyBins": []},
            install_hints=["brew install ffmpeg"],
            prompt_template="Test prompt",
            frontmatter={"name": "test-prompt"}
        )

    @pytest.fixture
    def hybrid_info(self):
        """Create a hybrid skill info"""
        return OpenClawSkillInfo(
            name="test-hybrid",
            description="A test hybrid skill",
            type="hybrid",
            has_scripts_dir=True,
            dependencies={"bins": [], "env": [], "config": [], "anyBins": []},
            install_hints=[],
            prompt_template="Test prompt with scripts",
            frontmatter={"name": "test-hybrid"}
        )

    @pytest.fixture
    def command_dispatch_info(self):
        """Create a command-dispatch skill info"""
        return OpenClawSkillInfo(
            name="test-dispatch",
            description="A test command dispatch skill",
            type="command-dispatch",
            command_dispatch="tool",
            command_tool="tool-bash",
            dependencies={"bins": [], "env": [], "config": [], "anyBins": []},
            install_hints=[],
            prompt_template="Test dispatch",
            frontmatter={"name": "test-dispatch", "command-dispatch": "tool", "command-tool": "tool-bash"}
        )

    def test_map_pure_prompt_skill(self, pure_prompt_info):
        """Test mapping a pure-prompt skill"""
        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(pure_prompt_info)

        assert metadata["name"] == "test-prompt"
        assert metadata["description"] == "A test pure prompt skill"
        assert metadata["type"] == "pure-prompt"
        assert "claude_skill_handler" in metadata["handler"]
        assert "requires" in metadata
        assert metadata["requires"]["bins"] == ["ffmpeg"]
        assert metadata["requires"]["env"] == ["API_KEY"]
        assert metadata["requires"]["install"] == ["brew install ffmpeg"]
        assert "execution" not in metadata  # Pure-prompt doesn't need execution section

    def test_map_hybrid_skill(self, hybrid_info):
        """Test mapping a hybrid skill"""
        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(hybrid_info)

        assert metadata["name"] == "test-hybrid"
        assert metadata["type"] == "hybrid"
        assert "openclaw_scripts_handler" in metadata["handler"]
        assert "execution" in metadata  # Hybrid skills have execution section
        assert "tags" in metadata
        assert "hybrid" in metadata["tags"]

    def test_map_command_dispatch_skill(self, command_dispatch_info):
        """Test mapping a command-dispatch skill"""
        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(command_dispatch_info)

        assert metadata["name"] == "test-dispatch"
        assert metadata["type"] == "pure-script"  # Command-dispatch maps to pure-script
        assert "openclaw_command_dispatch_handler" in metadata["handler"]
        assert metadata["execution"]["command_tool"] == "tool-bash"
        assert "command-dispatch" in metadata["tags"]

    def test_top_level_requires(self, pure_prompt_info):
        """Test that dependencies are at top level (Phase 2 improvement)"""
        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(pure_prompt_info)

        # Check that requires is at top level
        assert "requires" in metadata
        assert metadata["requires"]["bins"] == ["ffmpeg"]
        assert metadata["requires"]["env"] == ["API_KEY"]

    def test_tags_generation(self, pure_prompt_info, hybrid_info, command_dispatch_info):
        """Test tag generation for different skill types"""
        mapper = OpenClawMetadataMapper()

        pure_metadata = mapper.map_to_myagent_format(pure_prompt_info)
        hybrid_metadata = mapper.map_to_myagent_format(hybrid_info)
        dispatch_metadata = mapper.map_to_myagent_format(command_dispatch_info)

        # All should have openclaw-skill and adapted tags
        assert "openclaw-skill" in pure_metadata["tags"]
        assert "adapted" in pure_metadata["tags"]

        # Type-specific tags
        assert "pure-prompt" in pure_metadata["tags"]
        assert "hybrid" in hybrid_metadata["tags"]
        assert "command-dispatch" in dispatch_metadata["tags"]

    def test_preserves_frontmatter(self, pure_prompt_info):
        """Test that original frontmatter is preserved"""
        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(pure_prompt_info)

        assert "openclaw_frontmatter" in metadata
        assert metadata["openclaw_frontmatter"]["name"] == "test-prompt"

    def test_empty_dependencies(self):
        """Test mapping with no dependencies"""
        info = OpenClawSkillInfo(
            name="no-deps",
            description="Skill with no dependencies",
            type="pure-prompt",
            dependencies={"bins": [], "env": [], "config": [], "anyBins": []},
            install_hints=[],
            prompt_template="Test",
            frontmatter={}
        )

        mapper = OpenClawMetadataMapper()
        metadata = mapper.map_to_myagent_format(info)

        # Should still have requires dict, but empty
        assert "requires" in metadata
        assert metadata["requires"] == {}

    def test_convenience_function(self, pure_prompt_info):
        """Test the convenience map_openclaw_to_myagent function"""
        metadata = map_openclaw_to_myagent(pure_prompt_info)

        assert metadata["name"] == "test-prompt"
        assert metadata["type"] == "pure-prompt"

    def test_custom_handler_path(self, pure_prompt_info):
        """Test mapping with custom handler path"""
        mapper = OpenClawMetadataMapper()
        custom_handler = "custom/handler.py"
        metadata = mapper.map_to_myagent_format(pure_prompt_info, handler_path=custom_handler)

        assert metadata["handler"] == custom_handler


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
