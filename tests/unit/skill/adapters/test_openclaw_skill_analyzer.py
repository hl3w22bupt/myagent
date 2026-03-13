"""
Unit tests for OpenClaw Skill Analyzer
"""

import pytest
from pathlib import Path
import sys
import os
import tempfile

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from src.core.skill.adapters.openclaw_skill_scanner import OpenClawSkillFile
from src.core.skill.adapters.openclaw_skill_analyzer import (
    OpenClawSkillAnalyzer,
    OpenClawSkillInfo,
    analyze_openclaw_skill
)


class TestOpenClawSkillAnalyzer:
    """Test suite for OpenClawSkillAnalyzer"""

    @pytest.fixture
    def test_skill_dir(self, tmp_path):
        """Create test skill directory"""
        skill_dir = tmp_path / "test_skill"
        skill_dir.mkdir()
        return skill_dir

    @pytest.fixture
    def pure_prompt_skill(self, test_skill_dir):
        """Create a pure-prompt skill"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: pure-prompt-test
description: A pure prompt test skill
tags:
  - test
metadata:
  openclaw:
    requires:
      bins: []
      env: []
---
# Pure Prompt Skill

This is a test skill.
""")
        return OpenClawSkillFile(
            path=skill_md,
            skill_name="pure-prompt-test",
            root_dir=test_skill_dir
        )

    @pytest.fixture
    def hybrid_skill(self, test_skill_dir):
        """Create a hybrid skill with scripts/"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: hybrid-test
description: A hybrid test skill
---
# Hybrid Skill

Run {baseDir}/scripts/test.sh
""")

        # Create scripts/ directory
        scripts_dir = test_skill_dir / "scripts"
        scripts_dir.mkdir()

        return OpenClawSkillFile(
            path=skill_md,
            skill_name="hybrid-test",
            root_dir=test_skill_dir
        )

    @pytest.fixture
    def command_dispatch_skill(self, test_skill_dir):
        """Create a command-dispatch skill"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: dispatch-test
description: A command dispatch test skill
command-dispatch: tool
command-tool: tool-bash
---
# Command Dispatch Skill
""")
        return OpenClawSkillFile(
            path=skill_md,
            skill_name="dispatch-test",
            root_dir=test_skill_dir
        )

    def test_analyze_pure_prompt_skill(self, pure_prompt_skill):
        """Test analyzing a pure-prompt skill"""
        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(pure_prompt_skill)

        assert info.name == "pure-prompt-test"
        assert info.description == "A pure prompt test skill"
        assert info.type == "pure-prompt"
        assert info.is_pure_prompt == True
        assert info.is_hybrid == False
        assert info.is_command_dispatch == False

    def test_analyze_hybrid_skill(self, hybrid_skill):
        """Test analyzing a hybrid skill"""
        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(hybrid_skill)

        assert info.name == "hybrid-test"
        assert info.type == "hybrid"
        assert info.is_hybrid == True
        assert info.is_pure_prompt == False
        assert info.has_scripts_dir == True

    def test_analyze_command_dispatch_skill(self, command_dispatch_skill):
        """Test analyzing a command-dispatch skill"""
        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(command_dispatch_skill)

        assert info.name == "dispatch-test"
        assert info.type == "command-dispatch"
        assert info.is_command_dispatch == True
        assert info.command_dispatch == "tool"
        assert info.command_tool == "tool-bash"

    def test_basedir_replacement(self, test_skill_dir):
        """Test {baseDir} placeholder replacement"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: basedir-test
description: Test baseDir replacement
---
# Test

Run {baseDir}/scripts/test.sh
""")

        skill_file = OpenClawSkillFile(
            path=skill_md,
            skill_name="basedir-test",
            root_dir=test_skill_dir
        )

        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(skill_file)

        # Check that {baseDir} was replaced
        assert "{baseDir}" not in info.prompt_template
        assert str(test_skill_dir) in info.prompt_template

    def test_extract_dependencies(self, test_skill_dir):
        """Test dependency extraction"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: deps-test
description: Test dependency extraction
metadata:
  openclaw:
    requires:
      bins:
        - ffmpeg
        - python
      env:
        - API_KEY
      config:
        - some.config
    install:
      - brew install ffmpeg
---
# Test
""")

        skill_file = OpenClawSkillFile(
            path=skill_md,
            skill_name="deps-test",
            root_dir=test_skill_dir
        )

        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(skill_file)

        assert info.dependencies["bins"] == ["ffmpeg", "python"]
        assert info.dependencies["env"] == ["API_KEY"]
        assert info.dependencies["config"] == ["some.config"]
        assert info.install_hints == ["brew install ffmpeg"]

    def test_extract_install_hints(self, test_skill_dir):
        """Test install hints extraction"""
        skill_md = test_skill_dir / "SKILL.md"
        skill_md.write_text("""---
name: install-test
description: Test install hints
metadata:
  openclaw:
    install:
      - brew install ffmpeg
      - pip install requests
---
# Test
""")

        skill_file = OpenClawSkillFile(
            path=skill_md,
            skill_name="install-test",
            root_dir=test_skill_dir
        )

        analyzer = OpenClawSkillAnalyzer()
        info = analyzer.analyze(skill_file)

        assert len(info.install_hints) == 2
        assert "brew install ffmpeg" in info.install_hints
        assert "pip install requests" in info.install_hints

    def test_convenience_function(self, pure_prompt_skill):
        """Test the convenience analyze_openclaw_skill function"""
        info = analyze_openclaw_skill(pure_prompt_skill)

        assert info.name == "pure-prompt-test"
        assert info.type == "pure-prompt"

    def test_skill_file_not_found(self, test_skill_dir):
        """Test error handling when SKILL.md doesn't exist"""
        non_existent = test_skill_dir / "nonexistent" / "SKILL.md"
        skill_file = OpenClawSkillFile(
            path=non_existent,
            skill_name="nonexistent",
            root_dir=test_skill_dir
        )

        analyzer = OpenClawSkillAnalyzer()

        with pytest.raises(FileNotFoundError):
            analyzer.analyze(skill_file)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
