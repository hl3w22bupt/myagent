"""
Tests for DependencyChecker.
"""

import pytest
import os
from src.core.skill.dependency_checker import DependencyChecker


class TestDependencyChecker:
    """Test suite for DependencyChecker."""

    def test_check_bins_with_existing_binaries(self):
        """Test checking binaries that exist."""
        checker = DependencyChecker()
        result = checker.check_bins(["ls", "python3"])

        # ls and python3 should exist on most systems
        assert result["ls"] == True
        assert result["python3"] == True

    def test_check_bins_with_missing_binaries(self):
        """Test checking binaries that don't exist."""
        checker = DependencyChecker()
        result = checker.check_bins(["nonexistent-binary-xyz"])

        assert result["nonexistent-binary-xyz"] == False

    def test_check_any_bins_with_at_least_one(self):
        """Test checking if at least one alternative binary exists."""
        checker = DependencyChecker()

        # At least one of these should exist
        result = checker.check_any_bins(["ls", "nonexistent-binary"])
        assert result == True

    def test_check_any_bins_with_none_existing(self):
        """Test checking alternatives when none exist."""
        checker = DependencyChecker()
        result = checker.check_any_bins(["binary-1", "binary-2", "binary-3"])

        assert result == False

    def test_check_env_with_system_env(self):
        """Test checking system environment variables."""
        checker = DependencyChecker()

        # Set a test environment variable
        os.environ["TEST_VAR_SKILL"] = "test_value"

        result = checker.check_env(["TEST_VAR_SKILL"])

        assert result["TEST_VAR_SKILL"] == True

        # Cleanup
        del os.environ["TEST_VAR_SKILL"]

    def test_check_env_with_config_env(self):
        """Test checking with injected environment variables."""
        checker = DependencyChecker()

        # Inject config env
        config_env = {"INJECTED_VAR": "injected_value"}
        result = checker.check_env(["INJECTED_VAR"], config_env)

        assert result["INJECTED_VAR"] == True

    def test_check_env_with_missing_var(self):
        """Test checking missing environment variable."""
        checker = DependencyChecker()
        result = checker.check_env(["NONEXISTENT_VAR_xyz"])

        assert result["NONEXISTENT_VAR_xyz"] == False

    def test_check_config_with_valid_config(self):
        """Test checking configuration items that exist."""
        checker = DependencyChecker()
        config = {
            "sandbox": {
                "enabled": True
            }
        }

        result = checker.check_config(["sandbox.enabled"], config)

        assert result["sandbox.enabled"] == True

    def test_check_config_with_missing_config(self):
        """Test checking configuration items that don't exist."""
        checker = DependencyChecker()
        config = {
            "sandbox": {
                "enabled": False
            }
        }

        # Check non-existent path
        result = checker.check_config(["sandbox.nonexistent"], config)
        assert result["sandbox.nonexistent"] == False

        # Check path with wrong value
        result = checker.check_config(["sandbox.enabled"], config)
        # enabled is False, so should be False
        assert result["sandbox.enabled"] == False

    def test_check_config_with_no_config(self):
        """Test checking config when no config is provided."""
        checker = DependencyChecker()

        result = checker.check_config(["any.path"], None)

        assert result["any.path"] == False

    def test_check_python_packages_with_installed_packages(self):
        """Test checking installed Python packages."""
        checker = DependencyChecker()

        # pytest and json should be installed
        result = checker.check_python_packages(["pytest", "json"])

        assert result["pytest"] == True
        assert result["json"] == True

    def test_check_python_packages_with_missing_packages(self):
        """Test checking missing Python packages."""
        checker = DependencyChecker()

        result = checker.check_python_packages(["nonexistent-package-xyz"])

        assert result["nonexistent-package-xyz"] == False

    def test_check_python_packages_with_version_specs(self):
        """Test checking packages with version specifications."""
        checker = DependencyChecker()

        # pytest should be installed
        result = checker.check_python_packages(["pytest>=7.0.0"])

        assert result["pytest>=7.0.0"] == True

    def test_validate_skill_with_all_dependencies_met(self):
        """Test validating a skill with all dependencies satisfied."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "bins": ["ls"],
                        "config": ["sandbox.enabled"]
                    }
                }
            }
        }

        myagent_config = {
            "sandbox": {
                "enabled": True
            }
        }

        result = checker.validate_skill(skill_metadata, myagent_config=myagent_config)

        assert result["valid"] == True
        assert result["missing"] == []
        assert result["details"]["bins"]["ls"] == True

    def test_validate_skill_with_missing_bins(self):
        """Test validating a skill with missing binary dependencies."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "bins": ["ls", "nonexistent-bin"]
                    }
                }
            }
        }

        result = checker.validate_skill(skill_metadata)

        assert result["valid"] == False
        assert "nonexistent-bin" in result["missing"]
        assert result["details"]["bins"]["ls"] == True
        assert result["details"]["bins"]["nonexistent-bin"] == False

    def test_validate_skill_with_missing_anyBins(self):
        """Test validating a skill with missing anyBins dependencies."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "anyBins": ["bin-1", "bin-2", "bin-3"]
                    }
                }
            }
        }

        result = checker.validate_skill(skill_metadata)

        assert result["valid"] == False
        assert "any of: ['bin-1', 'bin-2', 'bin-3']" in result["missing"]

    def test_validate_skill_with_missing_env(self):
        """Test validating a skill with missing environment variables."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "env": ["API_KEY_1", "API_KEY_2"]
                    }
                }
            }
        }

        result = checker.validate_skill(skill_metadata)

        assert result["valid"] == False
        assert "API_KEY_1" in result["missing"]
        assert "API_KEY_2" in result["missing"]

    def test_validate_skill_with_config_env_override(self):
        """Test validating skill with injected environment variables."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "env": ["API_KEY"]
                    }
                }
            }
        }

        # Inject env var
        config_env = {"API_KEY": "test-key"}
        result = checker.validate_skill(skill_metadata, config_env=config_env)

        assert result["valid"] == True
        assert result["missing"] == []

    def test_validate_skill_with_no_dependencies(self):
        """Test validating a skill with no dependencies."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {}
            }
        }

        result = checker.validate_skill(skill_metadata)

        assert result["valid"] == True
        assert result["missing"] == []

    def test_validate_skill_with_partial_dependencies(self):
        """Test validating a skill with some dependencies missing."""
        checker = DependencyChecker()

        skill_metadata = {
            "execution": {
                "runtime": {
                    "requires": {
                        "bins": ["ls"],
                        "env": ["MISSING_VAR"],
                        "pythonPackages": ["pytest", "missing-package"]
                    }
                }
            }
        }

        result = checker.validate_skill(skill_metadata)

        assert result["valid"] == False
        assert "MISSING_VAR" in result["missing"]
        assert "missing-package" in result["missing"]
        assert "ls" not in result["missing"]  # ls exists
        assert "pytest" not in result["missing"]  # pytest exists
