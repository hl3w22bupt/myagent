"""
Startup Dependency Scanner

Scans all skills at startup and provides installation suggestions or auto-installs
missing dependencies with safeguards.

This is a Phase 2 component that works across all skill types:
- skills/ (native myagent skills)
- claude_skills/ (via Claude Skills adapter)
- openclaw_skills/ (via OpenClaw Skills adapter)
"""

import os
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from .dependency_checker import DependencyChecker


class StartupDependencyScanner:
    """
    Scan all skills at startup and handle missing dependencies.

    Features:
    - Scan all skill directories
    - Check dependencies using DependencyChecker
    - Provide installation suggestions
    - Auto-install safe dependencies with safeguards
    """

    def __init__(
        self,
        skill_directories: Optional[List[str]] = None,
        auto_install: bool = True,
        config_env: Optional[Dict[str, str]] = None,
        myagent_config: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the Startup Dependency Scanner.

        Args:
            skill_directories: List of skill directories to scan
            auto_install: Whether to auto-install safe dependencies
            config_env: Optional injected environment variables
            myagent_config: MyAgent configuration dictionary
        """
        self.skill_directories = skill_directories or [
            "skills",
            "claude_skills",
            "openclaw_skills"
        ]
        self.auto_install = auto_install
        self.config_env = config_env
        self.myagent_config = myagent_config
        self.dependency_checker = DependencyChecker()

    def scan_all_skills(self) -> Dict[str, Any]:
        """
        Scan all skill directories and check dependencies.

        Returns:
            Scan results with:
            - total_skills: Total number of skills scanned
            - valid_skills: Number of skills with all dependencies satisfied
            - invalid_skills: Number of skills with missing dependencies
            - skill_results: Detailed results per skill
        """
        results = {
            "total_skills": 0,
            "valid_skills": 0,
            "invalid_skills": 0,
            "skill_results": {}
        }

        for skill_dir in self.skill_directories:
            skill_path = Path(skill_dir)
            if not skill_path.exists():
                continue

            # Scan for skills in this directory
            dir_results = self._scan_directory(skill_path)
            results["skill_results"][skill_dir] = dir_results
            results["total_skills"] += len(dir_results)

            # Count valid/invalid
            for skill_name, skill_result in dir_results.items():
                if skill_result.get("valid", False):
                    results["valid_skills"] += 1
                else:
                    results["invalid_skills"] += 1

        return results

    def _scan_directory(self, directory: Path) -> Dict[str, Dict[str, Any]]:
        """
        Scan a single directory for skills and check dependencies.

        Args:
            directory: Directory to scan

        Returns:
            Dict mapping skill names to their validation results
        """
        results = {}

        # Look for skill.yaml files (native myagent skills)
        for skill_yaml in directory.rglob("skill.yaml"):
            skill_dir = skill_yaml.parent
            skill_name = skill_dir.name

            try:
                import yaml
                with open(skill_yaml, 'r') as f:
                    skill_metadata = yaml.safe_load(f)

                validation = self.dependency_checker.validate_skill(
                    skill_metadata,
                    self.config_env,
                    self.myagent_config
                )

                results[skill_name] = {
                    "path": str(skill_dir),
                    "type": "native",
                    **validation
                }

            except Exception as e:
                results[skill_name] = {
                    "path": str(skill_dir),
                    "type": "native",
                    "valid": False,
                    "error": str(e)
                }

        # Look for SKILL.md files (Claude Skills and OpenClaw Skills)
        for skill_md in directory.rglob("SKILL.md"):
            skill_dir = skill_md.parent
            skill_name = skill_dir.name

            # Skip if we already processed this skill (has both skill.yaml and SKILL.md)
            if skill_name in results:
                continue

            try:
                # Try to parse as OpenClaw skill
                from ..adapters.openclaw_skill_scanner import OpenClawSkillFile
                from ..adapters.openclaw_skill_analyzer import OpenClawSkillAnalyzer
                from ..adapters.openclaw_metadata_mapper import OpenClawMetadataMapper

                skill_file = OpenClawSkillFile(
                    path=skill_md,
                    skill_name=skill_name,
                    root_dir=directory
                )

                analyzer = OpenClawSkillAnalyzer()
                info = analyzer.analyze(skill_file)

                mapper = OpenClawMetadataMapper()
                metadata = mapper.map_to_myagent_format(info)

                validation = self.dependency_checker.validate_skill(
                    metadata,
                    self.config_env,
                    self.myagent_config
                )

                results[skill_name] = {
                    "path": str(skill_dir),
                    "type": "openclaw",
                    **validation
                }

            except Exception:
                # Try as Claude skill or skip if parsing fails
                results[skill_name] = {
                    "path": str(skill_dir),
                    "type": "unknown",
                    "valid": True,  # Assume valid if we can't parse
                    "note": "Could not parse skill metadata"
                }

        return results

    def get_installation_commands(self, scan_results: Dict[str, Any]) -> List[str]:
        """
        Generate installation commands for missing dependencies.

        Args:
            scan_results: Results from scan_all_skills()

        Returns:
            List of installation command strings
        """
        commands = []

        for skill_dir, skills in scan_results.get("skill_results", {}).items():
            for skill_name, skill_result in skills.items():
                if not skill_result.get("valid", False):
                    # Get install hints from details
                    details = skill_result.get("details", {})

                    # Check for install hints
                    if "requires" in skill_result:
                        install_hints = skill_result["requires"].get("install", [])
                        commands.extend(install_hints)

                    # Generate commands for missing bins
                    if "bins" in details:
                        for bin_name, present in details["bins"].items():
                            if not present:
                                # Suggest installation based on binary name
                                commands.append(self._suggest_binary_install(bin_name))

                    # Generate commands for missing python packages
                    if "pythonPackages" in details:
                        for pkg, present in details["pythonPackages"].items():
                            if not present:
                                commands.append(f"pip install {pkg}")

        # Deduplicate
        return list(set(commands))

    def auto_install_dependencies(self, scan_results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Auto-install safe dependencies with safeguards.

        Safeguards:
        - Only install Python packages via pip
        - Prompt for system-level changes (bins, env vars)
        - Never modify system configurations automatically

        Args:
            scan_results: Results from scan_all_skills()

        Returns:
            Installation results with:
            - installed: List of successfully installed dependencies
            - failed: List of failed installations
            - manual_required: List of manual installation requirements
        """
        results = {
            "installed": [],
            "failed": [],
            "manual_required": []
        }

        if not self.auto_install:
            # Just return manual requirements
            results["manual_required"] = self.get_installation_commands(scan_results)
            return results

        for skill_dir, skills in scan_results.get("skill_results", {}).items():
            for skill_name, skill_result in skills.items():
                if not skill_result.get("valid", False):
                    details = skill_result.get("details", {})

                    # Auto-install Python packages
                    if "pythonPackages" in details:
                        for pkg, present in details["pythonPackages"].items():
                            if not present:
                                success = self._install_python_package(pkg)
                                if success:
                                    results["installed"].append(f"python:{pkg}")
                                else:
                                    results["failed"].append(f"python:{pkg}")

                    # Mark bins and env vars as manual requirements
                    if "bins" in details:
                        for bin_name, present in details["bins"].items():
                            if not present:
                                install_cmd = self._suggest_binary_install(bin_name)
                                if install_cmd not in results["manual_required"]:
                                    results["manual_required"].append(install_cmd)

                    if "env" in details:
                        for var, present in details["env"].items():
                            if not present:
                                req = f"Set environment variable: {var}"
                                if req not in results["manual_required"]:
                                    results["manual_required"].append(req)

        return results

    def _suggest_binary_install(self, bin_name: str) -> str:
        """
        Suggest an installation command for a binary.

        Args:
            bin_name: Name of the binary

        Returns:
            Installation command string
        """
        # Common binary installation suggestions
        suggestions = {
            "ffmpeg": "brew install ffmpeg" if self._is_macos() else "apt-get install ffmpeg",
            "youtube-dl": "pip install youtube-dl",
            "yt-dlp": "pip install yt-dlp",
            "imagemagick": "brew install imagemagick" if self._is_macos() else "apt-get install imagemagick",
            "node": "brew install node" if self._is_macos() else "apt-get install nodejs",
            "npm": "brew install node" if self._is_macos() else "apt-get install npm",
        }

        return suggestions.get(bin_name, f"# Please install {bin_name} manually")

    def _install_python_package(self, package: str) -> bool:
        """
        Install a Python package via pip.

        Args:
            package: Package name to install

        Returns:
            True if installation succeeded, False otherwise
        """
        try:
            subprocess.run(
                ["pip", "install", package],
                check=True,
                capture_output=True,
                timeout=300  # 5 minute timeout
            )
            return True
        except Exception as e:
            print(f"Failed to install {package}: {e}")
            return False

    def _is_macos(self) -> bool:
        """Check if running on macOS"""
        return os.uname().sysname == "Darwin"


# Convenience function
def scan_and_install_dependencies(
    skill_directories: Optional[List[str]] = None,
    auto_install: bool = True
) -> Dict[str, Any]:
    """
    Convenience function to scan and install dependencies.

    Args:
        skill_directories: Optional list of skill directories
        auto_install: Whether to auto-install safe dependencies

    Returns:
        Combined scan and installation results
    """
    scanner = StartupDependencyScanner(
        skill_directories=skill_directories,
        auto_install=auto_install
    )

    scan_results = scanner.scan_all_skills()
    install_results = scanner.auto_install_dependencies(scan_results)

    return {
        "scan": scan_results,
        "installation": install_results
    }
