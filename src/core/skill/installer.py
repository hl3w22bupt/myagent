"""
Skill installer for automatic dependency installation.

Manages automatic installation of skill dependencies:
- Package managers: pip, brew, npm, uv, apt
- OS-specific installation (macOS, Linux)
- Interactive installation flow
- Installation validation and rollback
"""

import subprocess
import platform
import asyncio
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
from enum import Enum


class PackageManager(Enum):
    """Supported package managers."""
    PIP = "pip"
    BREW = "brew"
    NPM = "npm"
    UV = "uv"
    APT = "apt"


class InstallResult(Enum):
    """Installation result status."""
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    PARTIAL = "partial"


class SkillInstaller:
    """
    Skill installer for automatic dependency installation.

    Supports installation via:
    - pip: Python packages
    - brew: Homebrew (macOS/Linux)
    - npm: Node.js packages
    - uv: Fast Python package installer
    - apt: APT (Debian/Ubuntu)
    """

    def __init__(self, auto_confirm: bool = False, verbose: bool = True):
        """
        Initialize the skill installer.

        Args:
            auto_confirm: Auto-confirm installation prompts
            verbose: Show detailed installation output
        """
        self.auto_confirm = auto_confirm
        self.verbose = verbose
        self.current_os = platform.system().lower()
        self._installed_items: List[Dict[str, Any]] = []

    def check_package_manager(self, manager: PackageManager) -> bool:
        """
        Check if a package manager is available.

        Args:
            manager: Package manager to check

        Returns:
            True if package manager is available
        """
        try:
            result = subprocess.run(
                [manager.value, "--version"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False

    def install_skill(
        self,
        skill_name: str,
        install_specs: List[Dict[str, Any]],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Install all dependencies for a skill.

        Args:
            skill_name: Name of the skill
            install_specs: List of install specifications from skill.yaml
            config_env: Optional environment variables from config

        Returns:
            Installation result dict with status, installed, and failed items
        """
        if self.verbose:
            print(f"\n📦 Installing dependencies for '{skill_name}'...")

        installed = []
        failed = []
        skipped = []

        for spec in install_specs:
            result = self._install_spec(spec, config_env)

            if result["status"] == InstallResult.SUCCESS:
                installed.append(result)
            elif result["status"] == InstallResult.FAILED:
                failed.append(result)
            elif result["status"] == InstallResult.SKIPPED:
                skipped.append(result)
            elif result["status"] == InstallResult.PARTIAL:
                # Some packages succeeded, some failed
                installed.extend(result.get("installed", []))
                failed.extend(result.get("failed", []))

        # Determine overall status
        if failed and not installed:
            overall_status = InstallResult.FAILED
        elif failed and installed:
            overall_status = InstallResult.PARTIAL
        else:
            overall_status = InstallResult.SUCCESS

        return {
            "status": overall_status,
            "installed": installed,
            "failed": failed,
            "skipped": skipped,
            "total": len(install_specs)
        }

    def _install_spec(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Install a single install specification.

        Args:
            spec: Install specification dict
            config_env: Optional environment variables

        Returns:
            Installation result dict
        """
        kind = spec.get("kind")

        # Check OS compatibility
        os_requirements = spec.get("os", [])
        if os_requirements:
            normalized_os = self._normalize_os(self.current_os)
            if normalized_os not in os_requirements:
                return {
                    "status": InstallResult.SKIPPED,
                    "reason": f"OS not supported: {self.current_os} not in {os_requirements}",
                    "spec": spec
                }

        # Route to appropriate installer
        if kind == "pip":
            return self._install_pip(spec, config_env)
        elif kind == "uv":
            return self._install_uv(spec, config_env)
        elif kind == "brew":
            return self._install_brew(spec, config_env)
        elif kind == "npm":
            return self._install_npm(spec, config_env)
        elif kind == "apt":
            return self._install_apt(spec, config_env)
        else:
            return {
                "status": InstallResult.FAILED,
                "reason": f"Unknown install kind: {kind}",
                "spec": spec
            }

    def _install_pip(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Install Python packages via pip."""
        packages = spec.get("packages", [])
        if not packages:
            return {
                "status": InstallResult.SKIPPED,
                "reason": "No packages specified"
            }

        if self.verbose:
            print(f"  📚 Installing Python packages: {', '.join(packages)}")

        cmd = ["pip", "install", "--quiet"] + packages

        result = self._run_command(cmd, env=config_env)

        if result["returncode"] == 0:
            # Track installed items for rollback
            self._installed_items.extend([
                {"manager": "pip", "package": pkg}
                for pkg in packages
            ])

            return {
                "status": InstallResult.SUCCESS,
                "packages": packages,
                "output": result["stdout"]
            }
        else:
            return {
                "status": InstallResult.FAILED,
                "packages": packages,
                "error": result["stderr"]
            }

    def _install_uv(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Install Python packages via uv (faster alternative to pip)."""
        if not self.check_package_manager(PackageManager.UV):
            # Fallback to pip if uv is not available
            if self.verbose:
                print("  ⚠️  uv not found, falling back to pip")
            pip_spec = {**spec, "kind": "pip"}
            return self._install_pip(pip_spec, config_env)

        packages = spec.get("packages", [])
        if not packages:
            return {
                "status": InstallResult.SKIPPED,
                "reason": "No packages specified"
            }

        if self.verbose:
            print(f"  ⚡ Installing Python packages via uv: {', '.join(packages)}")

        cmd = ["uv", "pip", "install"] + packages

        result = self._run_command(cmd, env=config_env)

        if result["returncode"] == 0:
            self._installed_items.extend([
                {"manager": "uv", "package": pkg}
                for pkg in packages
            ])

            return {
                "status": InstallResult.SUCCESS,
                "packages": packages,
                "output": result["stdout"]
            }
        else:
            return {
                "status": InstallResult.FAILED,
                "packages": packages,
                "error": result["stderr"]
            }

    def _install_brew(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Install Homebrew formulae."""
        if self.current_os not in ["darwin", "linux"]:
            return {
                "status": InstallResult.SKIPPED,
                "reason": f"Homebrew not supported on {self.current_os}"
            }

        formula = spec.get("formula")
        packages = spec.get("packages")

        if formula:
            packages = [formula]

        if not packages:
            return {
                "status": InstallResult.SKIPPED,
                "reason": "No formula or packages specified"
            }

        if self.verbose:
            print(f"  🍺 Installing Homebrew formulae: {', '.join(packages)}")

        cmd = ["brew", "install", "--quiet"] + packages

        result = self._run_command(cmd, env=config_env)

        if result["returncode"] == 0:
            self._installed_items.extend([
                {"manager": "brew", "package": pkg}
                for pkg in packages
            ])

            return {
                "status": InstallResult.SUCCESS,
                "packages": packages,
                "output": result["stdout"]
            }
        else:
            return {
                "status": InstallResult.FAILED,
                "packages": packages,
                "error": result["stderr"]
            }

    def _install_npm(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Install npm packages."""
        packages = spec.get("packages", [])
        if not packages:
            return {
                "status": InstallResult.SKIPPED,
                "reason": "No packages specified"
            }

        if self.verbose:
            print(f"  📦 Installing npm packages: {', '.join(packages)}")

        cmd = ["npm", "install", "--silent"] + packages

        result = self._run_command(cmd, env=config_env)

        if result["returncode"] == 0:
            self._installed_items.extend([
                {"manager": "npm", "package": pkg}
                for pkg in packages
            ])

            return {
                "status": InstallResult.SUCCESS,
                "packages": packages,
                "output": result["stdout"]
            }
        else:
            return {
                "status": InstallResult.FAILED,
                "packages": packages,
                "error": result["stderr"]
            }

    def _install_apt(
        self,
        spec: Dict[str, Any],
        config_env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """Install APT packages (Debian/Ubuntu)."""
        if self.current_os != "linux":
            return {
                "status": InstallResult.SKIPPED,
                "reason": "APT is only available on Linux"
            }

        packages = spec.get("packages", [])
        if not packages:
            return {
                "status": InstallResult.SKIPPED,
                "reason": "No packages specified"
            }

        if self.verbose:
            print(f"  📦 Installing APT packages: {', '.join(packages)}")

        # Update package list first
        self._run_command(["sudo", "apt-get", "update", "-qq"])

        cmd = ["sudo", "apt-get", "install", "-y", "-qq"] + packages

        result = self._run_command(cmd, env=config_env)

        if result["returncode"] == 0:
            self._installed_items.extend([
                {"manager": "apt", "package": pkg}
                for pkg in packages
            ])

            return {
                "status": InstallResult.SUCCESS,
                "packages": packages,
                "output": result["stdout"]
            }
        else:
            return {
                "status": InstallResult.FAILED,
                "packages": packages,
                "error": result["stderr"]
            }

    def _run_command(
        self,
        cmd: List[str],
        env: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Run a command and return result.

        Args:
            cmd: Command to run
            env: Optional environment variables

        Returns:
            Dict with returncode, stdout, stderr
        """
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout
                env=env
            )

            return {
                "returncode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr
            }
        except subprocess.TimeoutExpired:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": "Command timed out"
            }
        except Exception as e:
            return {
                "returncode": -1,
                "stdout": "",
                "stderr": str(e)
            }

    def verify_installation(self, bins: List[str]) -> Dict[str, bool]:
        """
        Verify that binaries were successfully installed.

        Args:
            bins: List of binary names to check

        Returns:
            Dict mapping binary names to availability status
        """
        result = {}
        for bin_name in bins:
            try:
                subprocess.run(
                    [bin_name, "--version"],
                    capture_output=True,
                    timeout=5
                )
                result[bin_name] = True
            except (FileNotFoundError, subprocess.TimeoutExpired):
                result[bin_name] = False
        return result

    def rollback_installation(self):
        """Rollback all installed items from this session."""
        if not self._installed_items:
            return

        if self.verbose:
            print(f"\n🔄 Rolling back {len(self._installed_items)} installed items...")

        for item in reversed(self._installed_items):
            manager = item["manager"]
            package = item["package"]

            try:
                if manager == "pip":
                    subprocess.run(["pip", "uninstall", "-y", package], capture_output=True)
                elif manager == "uv":
                    subprocess.run(["uv", "pip", "uninstall", "-y", package], capture_output=True)
                elif manager == "brew":
                    subprocess.run(["brew", "uninstall", "--force", package], capture_output=True)
                elif manager == "npm":
                    subprocess.run(["npm", "uninstall", "-g", package], capture_output=True)
                elif manager == "apt":
                    subprocess.run(["sudo", "apt-get", "remove", "-y", package], capture_output=True)
            except Exception as e:
                if self.verbose:
                    print(f"  ⚠️  Failed to rollback {package}: {e}")

        self._installed_items.clear()

    def _normalize_os(self, os_name: str) -> str:
        """
        Normalize OS name to standard form.

        Args:
            os_name: OS name from platform.system()

        Returns:
            Normalized OS name
        """
        os_mapping = {
            "darwin": "darwin",
            "macos": "darwin",
            "mac": "darwin",
            "linux": "linux",
            "windows": "windows",
            "win32": "windows"
        }
        return os_mapping.get(os_name.lower(), os_name.lower())

    def get_installed_items(self) -> List[Dict[str, Any]]:
        """Get list of items installed in this session."""
        return self._installed_items.copy()

    def clear_history(self):
        """Clear installation history."""
        self._installed_items.clear()
