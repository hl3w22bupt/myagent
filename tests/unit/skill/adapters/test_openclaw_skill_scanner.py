"""
Unit tests for OpenClaw Skill Scanner
"""

import pytest
from pathlib import Path
import sys
import os

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "src"))

from src.core.skill.adapters.openclaw_skill_scanner import (
    OpenClawSkillScanner,
    OpenClawSkillFile,
    scan_openclaw_skills
)


class TestOpenClawSkillScanner:
    """Test suite for OpenClawSkillScanner"""

    @pytest.fixture
    def test_scan_paths(self, tmp_path):
        """Create test scan paths with skills"""
        # Create test skills
        skill1 = tmp_path / "skill1" / "SKILL.md"
        skill2 = tmp_path / "skill2" / "SKILL.md"
        skill3 = tmp_path / "nested" / "skill3" / "SKILL.md"

        skill1.parent.mkdir(parents=True, exist_ok=True)
        skill2.parent.mkdir(parents=True, exist_ok=True)
        skill3.parent.mkdir(parents=True, exist_ok=True)

        skill1.write_text("# Test Skill 1")
        skill2.write_text("# Test Skill 2")
        skill3.write_text("# Test Skill 3")

        return [str(tmp_path)]

    def test_scanner_initialization(self, test_scan_paths):
        """Test scanner initialization with scan paths"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        assert scanner.scan_paths == [Path(p).resolve() for p in test_scan_paths]

    def test_scan_discovers_all_skills(self, test_scan_paths):
        """Test that scan discovers all SKILL.md files"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        skills = scanner.scan()

        assert len(skills) == 3
        skill_names = {s.skill_name for s in skills}
        assert "skill1" in skill_names
        assert "skill2" in skill_names
        assert "skill3" in skill_names

    def test_scan_by_name(self, test_scan_paths):
        """Test scanning for a specific skill by name"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        skill = scanner.scan_by_name("skill1")

        assert skill is not None
        assert skill.skill_name == "skill1"
        assert skill.path.exists()

    def test_scan_by_name_not_found(self, test_scan_paths):
        """Test scanning for non-existent skill"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        skill = scanner.scan_by_name("nonexistent")

        assert skill is None

    def test_list_skill_names(self, test_scan_paths):
        """Test listing all skill names"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        names = scanner.list_skill_names()

        assert len(names) == 3
        assert set(names) == {"skill1", "skill2", "skill3"}

    def test_validate_scan_paths(self, test_scan_paths, tmp_path):
        """Test validation of scan paths"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        validation = scanner.validate_scan_paths()

        assert validation[str(test_scan_paths[0])] == True

        # Test with non-existent path
        non_existent = str(tmp_path / "nonexistent")
        scanner2 = OpenClawSkillScanner(scan_paths=[non_existent])
        validation2 = scanner2.validate_scan_paths()

        assert validation2[non_existent] == False

    def test_skill_file_properties(self, test_scan_paths):
        """Test OpenClawSkillFile properties"""
        scanner = OpenClawSkillScanner(scan_paths=test_scan_paths)
        skill = scanner.scan_by_name("skill1")

        assert skill.path.exists()
        assert skill.directory == skill.path.parent
        assert skill.root_dir == Path(test_scan_paths[0]).resolve()

    def test_has_scripts_dir_property(self, tmp_path):
        """Test has_scripts_dir property"""
        # Create skill with scripts/
        skill_with_scripts = tmp_path / "with_scripts" / "SKILL.md"
        scripts_dir = tmp_path / "with_scripts" / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)
        skill_with_scripts.write_text("# Test")

        # Create skill without scripts/
        skill_without_scripts = tmp_path / "without_scripts" / "SKILL.md"
        skill_without_scripts.parent.mkdir(parents=True, exist_ok=True)
        skill_without_scripts.write_text("# Test")

        scanner = OpenClawSkillScanner(scan_paths=[str(tmp_path)])

        skill1 = scanner.scan_by_name("with_scripts")
        skill2 = scanner.scan_by_name("without_scripts")

        assert skill1.has_scripts_dir == True
        assert skill2.has_scripts_dir == False

    def test_convenience_function(self, test_scan_paths):
        """Test the convenience scan_openclaw_skills function"""
        skills = scan_openclaw_skills(scan_paths=test_scan_paths)

        assert len(skills) == 3
        assert all(isinstance(s, OpenClawSkillFile) for s in skills)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
