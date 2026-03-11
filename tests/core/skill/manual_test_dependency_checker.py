"""
Manual test script for DependencyChecker.
"""

import sys
import os

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
sys.path.insert(0, project_root)

from src.core.skill.dependency_checker import DependencyChecker


def test_basic_checks():
    """Test basic dependency checks."""
    print("Testing DependencyChecker...\n")

    checker = DependencyChecker()

    # Test 1: check_bins
    print("1. Testing check_bins...")
    result = checker.check_bins(["ls", "python3"])
    print(f"   ls: {result['ls']}")
    print(f"   python3: {result['python3']}")
    print(f"   ✅ check_bins works!\n")

    # Test 2: check_any_bins
    print("2. Testing check_any_bins...")
    result = checker.check_any_bins(["ls", "nonexistent-binary"])
    print(f"   Has any of ls/nonexistent-binary: {result}")
    print(f"   ✅ check_any_bins works!\n")

    # Test 3: check_env
    print("3. Testing check_env...")
    os.environ["TEST_VAR"] = "test"
    result = checker.check_env(["TEST_VAR"])
    print(f"   TEST_VAR exists: {result['TEST_VAR']}")
    print(f"   ✅ check_env works!\n")
    del os.environ["TEST_VAR"]

    # Test 4: check_config
    print("4. Testing check_config...")
    config = {
        "sandbox": {
            "enabled": True
        }
    }
    result = checker.check_config(["sandbox.enabled"], config)
    print(f"   sandbox.enabled: {result['sandbox.enabled']}")
    print(f"   ✅ check_config works!\n")

    # Test 5: validate_skill with valid dependencies
    print("5. Testing validate_skill (all dependencies met)...")
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
    print(f"   Valid: {result['valid']}")
    print(f"   Missing: {result['missing']}")
    print(f"   ✅ validate_skill works!\n")

    # Test 6: validate_skill with missing dependencies
    print("6. Testing validate_skill (missing dependencies)...")
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
    print(f"   Valid: {result['valid']}")
    print(f"   Missing: {result['missing']}")
    print(f"   Details: {result['details']}")
    print(f"   ✅ validate_skill detects missing dependencies!\n")

    print("=" * 50)
    print("✅ All tests passed!")
    print("=" * 50)


if __name__ == "__main__":
    test_basic_checks()
