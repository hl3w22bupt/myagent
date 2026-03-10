"""
Platform validator for skill platform compatibility.

Validates platform requirements:
- Operating system (linux, darwin, windows)
- Architecture (x86_64, arm64)
- Platform-specific software
"""

import platform
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class PlatformRequirements:
    """Platform requirements for skill execution."""
    os: Optional[List[str]] = None        # Allowed operating systems
    arch: Optional[List[str]] = None      # Allowed architectures
    software: Optional[List[str]] = None  # Required platform software

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "os": self.os,
            "arch": self.arch,
            "software": self.software
        }


class PlatformValidator:
    """Validator for platform requirements."""

    # OS name normalization
    OS_ALIASES = {
        "darwin": ["darwin", "macos", "mac"],
        "linux": ["linux"],
        "windows": ["windows", "win32"]
    }

    # Architecture aliases
    ARCH_ALIASES = {
        "x86_64": ["x86_64", "amd64", "x64"],
        "arm64": ["arm64", "aarch64"]
    }

    def validate(self, platform_req: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate platform requirements configuration.

        Args:
            platform_req: Raw platform dict from skill.yaml

        Returns:
            Validation result
        """
        warnings = []
        normalized = {}

        # Validate OS requirements
        if "os" in platform_req:
            os_list = platform_req["os"]
            if not isinstance(os_list, list):
                warnings.append("os must be a list")
            else:
                # Normalize OS names
                normalized_os = []
                for os_name in os_list:
                    normalized_name = self._normalize_os(os_name)
                    if normalized_name:
                        normalized_os.append(normalized_name)
                    else:
                        warnings.append(f"Unknown OS: {os_name}")

                normalized["os"] = normalized_os

        # Validate architecture requirements
        if "arch" in platform_req:
            arch_list = platform_req["arch"]
            if not isinstance(arch_list, list):
                warnings.append("arch must be a list")
            else:
                # Normalize architecture names
                normalized_arch = []
                for arch_name in arch_list:
                    normalized_name = self._normalize_arch(arch_name)
                    if normalized_name:
                        normalized_arch.append(normalized_name)
                    else:
                        warnings.append(f"Unknown architecture: {arch_name}")

                normalized["arch"] = normalized_arch

        # Validate software requirements
        if "software" in platform_req:
            software = platform_req["software"]
            if not isinstance(software, list):
                warnings.append("software must be a list")
            else:
                normalized["software"] = software

        # Create PlatformRequirements object
        requirements = PlatformRequirements(
            os=normalized.get("os"),
            arch=normalized.get("arch"),
            software=normalized.get("software")
        )

        return {
            "valid": True,
            "warnings": warnings,
            "requirements": requirements
        }

    def check_local_capability(self, requirements: PlatformRequirements) -> Dict[str, Any]:
        """
        Check if local platform satisfies requirements.

        Args:
            requirements: PlatformRequirements object

        Returns:
            Capability check result
        """
        missing = []
        warnings = []

        # Check OS
        if requirements.os:
            current_os = platform.system().lower()
            normalized_current = self._normalize_os(current_os)

            if normalized_current not in requirements.os:
                missing.append(f"OS: need one of {requirements.os}, have {normalized_current}")

        # Check architecture
        if requirements.arch:
            current_arch = platform.machine().lower()
            normalized_current = self._normalize_arch(current_arch)

            if normalized_current not in requirements.arch:
                missing.append(f"Architecture: need one of {requirements.arch}, have {normalized_current}")

        # Check platform software
        if requirements.software:
            for software in requirements.software:
                if not self._check_software(software):
                    missing.append(f"Software: {software} not found")

        return {
            "can_run_locally": len(missing) == 0,
            "missing": missing,
            "warnings": warnings,
            "current_platform": {
                "os": self._normalize_os(platform.system().lower()),
                "arch": self._normalize_arch(platform.machine().lower())
            }
        }

    def _normalize_os(self, os_name: str) -> Optional[str]:
        """Normalize OS name to standard form."""
        os_lower = os_name.lower()

        for standard_name, aliases in self.OS_ALIASES.items():
            if os_lower in aliases:
                return standard_name

        return None

    def _normalize_arch(self, arch_name: str) -> Optional[str]:
        """Normalize architecture name to standard form."""
        arch_lower = arch_name.lower()

        for standard_name, aliases in self.ARCH_ALIASES.items():
            if arch_lower in aliases:
                return standard_name

        return None

    def _check_software(self, software: str) -> bool:
        """Check if platform software is available."""
        import subprocess

        # Common software commands
        software_commands = {
            "docker": ["docker", "--version"],
            "cuda": ["nvidia-smi"],
            "ffmpeg": ["ffmpeg", "-version"],
            "xcode": ["xcode-select", "-p"],
            "homebrew": ["brew", "--version"]
        }

        cmd = software_commands.get(software)
        if not cmd:
            # Unknown software, assume available
            return True

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return False
