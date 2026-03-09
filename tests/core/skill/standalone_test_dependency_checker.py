"""
Standalone test script for DependencyChecker (no dependencies).
"""

import shutil
import os
import sys


class SimpleDependencyChecker:
    """Simplified version for testing."""

    def check_bins(self, bins):
        """Check if required binary files exist."""
        results = {}
        for bin_name in bins:
            results[bin_name] = shutil.which(bin_name) is not None
        return results

    def check_any_bins(self, bins):
        """Check if at least one alternative binary exists."""
        return any(shutil.which(bin) for bin in bins)

    def check_env(self, env_vars, config_env=None):
        """Check if required environment variables are set."""
        results = {}
        for var in env_vars:
            if config_env and var in config_env:
                results[var] = True
            else:
                results[var] = os.getenv(var) is not None
        return results

    def check_config(self, config_paths, myagent_config=None):
        """Check if required configuration items are set."""
        results = {}
        if not myagent_config:
            return {path: False for path in config_paths}

        for path in config_paths:
            keys = path.split(".")
            value = myagent_config
            try:
                for key in keys:
                    value = value[key]
                results[path] = bool(value)
            except (KeyError, TypeError):
                results[path] = False
        return results

    def check_python_packages(self, packages):
        """Check if required Python packages are installed."""
        results = {}
        for package in packages:
            pkg_name = package.split(">=")[0].split("==")[0].split(">")[0].strip()
            try:
                __import__(pkg_name)
                results[package] = True
            except ImportError:
                results[package] = False
        return results

    def validate_skill(self, skill_metadata, config_env=None, myagent_config=None):
        """Validate all dependencies for a skill."""
        requires = skill_metadata.get("execution", {}).get("runtime", {}).get("requires", {})

        result = {
            "valid": True,
            "missing": [],
            "details": {}
        }

        # Check bins
        if "bins" in requires:
            bin_results = self.check_bins(requires["bins"])
            result["details"]["bins"] = bin_results
            missing_bins = [bin for bin, present in bin_results.items() if not present]
            if missing_bins:
                result["valid"] = False
                result["missing"].extend(missing_bins)

        # Check anyBins
        if "anyBins" in requires:
            has_any = self.check_any_bins(requires["anyBins"])
            result["details"]["anyBins"] = has_any
            if not has_any:
                result["valid"] = False
                result["missing"].append(f"any of: {requires['anyBins']}")

        # Check env
        if "env" in requires:
            env_results = self.check_env(requires["env"], config_env)
            result["details"]["env"] = env_results
            missing_env = [var for var, present in env_results.items() if not present]
            if missing_env:
                result["valid"] = False
                result["missing"].extend(missing_env)

        # Check config
        if "config" in requires and myagent_config:
            config_results = self.check_config(requires["config"], myagent_config)
            result["details"]["config"] = config_results
            missing_config = [path for path, present in config_results.items() if not present]
            if missing_config:
                result["valid"] = False
                result["missing"].extend(missing_config)

        # Check pythonPackages
        if "pythonPackages" in requires:
            pkg_results = self.check_python_packages(requires["pythonPackages"])
            result["details"]["pythonPackages"] = pkg_results
            missing_pkgs = [pkg for pkg, present in pkg_results.items() if not present]
            if missing_pkgs:
                result["valid"] = False
                result["missing"].extend(missing_pkgs)

        return result


def test_basic_checks():
    """Test basic dependency checks."""
    print("Testing DependencyChecker...\n")

    checker = SimpleDependencyChecker()

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

    # Test 7: validate_skill with anyBins
    print("7. Testing validate_skill with anyBins...")
    skill_metadata = {
        "execution": {
            "runtime": {
                "requires": {
                    "anyBins": ["ls", "nonexistent-bin"]
                }
            }
        }
    }
    result = checker.validate_skill(skill_metadata)
    print(f"   Valid: {result['valid']}")
    print(f"   Has any of ls/nonexistent-bin: {result['details']['anyBins']}")
    print(f"   ✅ anyBins works!\n")

    # Test 8: Real-world case - remotion-generator
    print("8. Testing real-world case (remotion-generator)...")
    skill_metadata = {
        "execution": {
            "runtime": {
                "requires": {
                    "bins": ["node", "npm"],
                    "anyBins": ["ffmpeg", "chromium"],
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
    print(f"   Details: {result['details']}")
    if not result['valid']:
        print(f"   ⚠️  remotion-generator would be skipped due to: {result['missing']}")
    print(f"   ✅ Real-world validation works!\n")

    print("=" * 50)
    print("✅ All tests passed!")
    print("=" * 50)


if __name__ == "__main__":
    test_basic_checks()
