"""
Skill dependency checker.

Validates skill dependencies before loading:
- Binary files (bins, anyBins)
- Environment variables (env)
- Configuration items (config)
- Python packages (pythonPackages)
"""

import shutil
import os
from typing import Dict, List, Any, Optional
from pathlib import Path


class DependencyChecker:
    """
    Skill dependency checker.

    Checks if a skill's dependencies are satisfied before loading.
    """

    def check_bins(self, bins: List[str]) -> Dict[str, bool]:
        """
        Check if required binary files exist.

        Args:
            bins: List of binary names to check

        Returns:
            Dictionary mapping binary names to availability status
        """
        results = {}
        for bin_name in bins:
            results[bin_name] = shutil.which(bin_name) is not None
        return results

    def check_any_bins(self, bins: List[str]) -> bool:
        """
        Check if at least one of the alternative binaries exists.

        Args:
            bins: List of binary names (any one is sufficient)

        Returns:
            True if at least one binary is available
        """
        return any(shutil.which(bin) for bin in bins)

    def check_env(self, env_vars: List[str],
                  config_env: Optional[Dict[str, str]] = None) -> Dict[str, bool]:
        """
        Check if required environment variables are set.

        Args:
            env_vars: List of environment variable names
            config_env: Optional injected environment variables from config

        Returns:
            Dictionary mapping env var names to availability status
        """
        results = {}
        for var in env_vars:
            # Check config_env first (injected variables)
            if config_env and var in config_env:
                results[var] = True
            else:
                # Check system environment
                results[var] = os.getenv(var) is not None
        return results

    def check_config(self, config_paths: List[str],
                     myagent_config: Optional[Dict[str, Any]] = None) -> Dict[str, bool]:
        """
        Check if required configuration items are set.

        Args:
            config_paths: List of dot-notation config paths (e.g., "sandbox.enabled")
            myagent_config: MyAgent configuration dictionary

        Returns:
            Dictionary mapping config paths to availability status
        """
        results = {}

        if not myagent_config:
            # All configs missing if no config provided
            return {path: False for path in config_paths}

        for path in config_paths:
            # Navigate through config using dot notation
            keys = path.split(".")
            value = myagent_config
            try:
                for key in keys:
                    value = value[key]
                # If we get here, the path exists and value is truthy
                results[path] = bool(value)
            except (KeyError, TypeError):
                # Path doesn't exist or value is None
                results[path] = False

        return results

    def check_python_packages(self, packages: List[str]) -> Dict[str, bool]:
        """
        Check if required Python packages are installed.

        Args:
            packages: List of package names (can include version specs like "package>=1.0.0")

        Returns:
            Dictionary mapping package names to availability status
        """
        results = {}
        for package in packages:
            # Extract package name from version spec
            # e.g., "httpx>=0.24.0" -> "httpx"
            pkg_name = package.split(">=")[0].split("==")[0].split(">")[0].strip()

            try:
                __import__(pkg_name)
                results[package] = True
            except ImportError:
                results[package] = False

        return results

    def validate_skill(self, skill_metadata: Dict[str, Any],
                       config_env: Optional[Dict[str, str]] = None,
                       myagent_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Validate all dependencies for a skill.

        Args:
            skill_metadata: Skill metadata dictionary (from skill.yaml)
            config_env: Optional injected environment variables
            myagent_config: MyAgent configuration dictionary

        Returns:
            Validation result with:
            - valid: bool - Whether all dependencies are satisfied
            - missing: List[str] - List of missing dependencies
            - details: Dict - Detailed check results
        """
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
