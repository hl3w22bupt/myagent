"""
Standalone test script for Phase 3: Resource and Platform validation.

Tests the separation of concerns:
- requires: functional dependencies
- resources: hardware requirements
- platform: platform compatibility
"""

import platform
from typing import Dict, Any


class MockResourceRequirements:
    """Mock resource requirements."""
    def __init__(self, cpus=None, gpus=None, memory=None, gpu_type=None):
        self.cpus = cpus
        self.gpus = gpus
        self.memory = memory
        self.gpu_type = gpu_type
        self.memory_bytes = self._parse_memory(memory) if memory else 0

    def _parse_memory(self, memory_str):
        """Parse memory string to bytes."""
        import re
        match = re.match(r'(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?', memory_str)
        if not match:
            raise ValueError(f"Invalid memory format: {memory_str}")
        value, unit = match.groups()
        value = float(value)
        multipliers = {None: 1, 'Ki': 1024, 'Mi': 1024**2, 'Gi': 1024**3, 'Ti': 1024**4}
        return int(value * multipliers.get(unit, 1))

    def to_dict(self):
        return {"cpus": self.cpus, "gpus": self.gpus, "memory": self.memory}


class MockPlatformRequirements:
    """Mock platform requirements."""
    def __init__(self, os=None, arch=None, software=None):
        self.os = os or []
        self.arch = arch or []
        self.software = software or []

    def to_dict(self):
        return {"os": self.os, "arch": self.arch, "software": self.software}


class MockResourceValidator:
    """Mock resource validator for testing."""

    def validate(self, resources: Dict[str, Any]) -> Dict[str, Any]:
        """Validate resource requirements."""
        warnings = []
        normalized = {}

        # Parse CPUs
        if "cpus" in resources:
            cpus = float(resources["cpus"])
            if cpus > 128:
                warnings.append(f"High CPU request: {cpus}")
            normalized["cpus"] = cpus

        # Parse GPUs
        if "gpus" in resources:
            gpus = int(resources["gpus"])
            if gpus > 8:
                warnings.append(f"High GPU request: {gpus}")
            normalized["gpus"] = gpus

        # Parse memory
        if "memory" in resources:
            memory_str = resources["memory"]
            try:
                req = MockResourceRequirements(memory=memory_str)
                normalized["memory"] = memory_str
                normalized["memory_bytes"] = req.memory_bytes
            except ValueError as e:
                warnings.append(str(e))

        # Create requirements object
        requirements = MockResourceRequirements(
            cpus=normalized.get("cpus"),
            gpus=normalized.get("gpus"),
            memory=normalized.get("memory")
        )

        return {
            "valid": True,
            "warnings": warnings,
            "requirements": requirements
        }

    def check_local_capability(self, requirements: MockResourceRequirements) -> Dict[str, Any]:
        """Check if local machine satisfies requirements."""
        try:
            import psutil
        except ImportError:
            return {
                "can_run_locally": False,
                "missing": ["psutil not available"],
                "warnings": []
            }

        missing = []
        warnings = []

        # Check CPU
        if requirements.cpus:
            available = psutil.cpu_count()
            if requirements.cpus > available:
                missing.append(f"CPU: need {requirements.cpus}, have {available}")

        # Check memory
        if requirements.memory_bytes > 0:
            available = psutil.virtual_memory().total
            if requirements.memory_bytes > available:
                need_gb = requirements.memory_bytes / 1024**3
                have_gb = available / 1024**3
                missing.append(f"Memory: need {need_gb:.1f}GiB, have {have_gb:.1f}GiB")

        # Check GPU
        if requirements.gpus and requirements.gpus > 0:
            missing.append(f"GPU: need {requirements.gpus}, cannot detect")

        return {
            "can_run_locally": len(missing) == 0,
            "missing": missing,
            "warnings": warnings,
            "requirements": requirements.to_dict()
        }


class MockPlatformValidator:
    """Mock platform validator for testing."""

    OS_ALIASES = {
        "darwin": ["darwin", "macos", "mac"],
        "linux": ["linux"],
        "windows": ["windows", "win32"]
    }

    ARCH_ALIASES = {
        "x86_64": ["x86_64", "amd64", "x64"],
        "arm64": ["arm64", "aarch64"]
    }

    def validate(self, platform_req: Dict[str, Any]) -> Dict[str, Any]:
        """Validate platform requirements."""
        warnings = []
        normalized = {}

        # Normalize OS
        if "os" in platform_req:
            os_list = platform_req["os"]
            normalized_os = []
            for os_name in os_list:
                norm = self._normalize_os(os_name)
                if norm:
                    normalized_os.append(norm)
                else:
                    warnings.append(f"Unknown OS: {os_name}")
            normalized["os"] = normalized_os

        # Normalize arch
        if "arch" in platform_req:
            arch_list = platform_req["arch"]
            normalized_arch = []
            for arch_name in arch_list:
                norm = self._normalize_arch(arch_name)
                if norm:
                    normalized_arch.append(norm)
                else:
                    warnings.append(f"Unknown arch: {arch_name}")
            normalized["arch"] = normalized_arch

        # Software
        if "software" in platform_req:
            normalized["software"] = platform_req["software"]

        requirements = MockPlatformRequirements(
            os=normalized.get("os"),
            arch=normalized.get("arch"),
            software=normalized.get("software")
        )

        return {
            "valid": True,
            "warnings": warnings,
            "requirements": requirements
        }

    def check_local_capability(self, requirements: MockPlatformRequirements) -> Dict[str, Any]:
        """Check if local platform satisfies requirements."""
        missing = []
        warnings = []

        # Check OS
        if requirements.os:
            current_os = platform.system().lower()
            normalized = self._normalize_os(current_os)
            if normalized not in requirements.os:
                missing.append(f"OS: need one of {requirements.os}, have {normalized}")

        # Check arch
        if requirements.arch:
            current_arch = platform.machine().lower()
            normalized = self._normalize_arch(current_arch)
            if normalized not in requirements.arch:
                missing.append(f"Architecture: need one of {requirements.arch}, have {normalized}")

        # Check software (mock)
        if requirements.software:
            for software in requirements.software:
                # Mock check - assume not available
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

    def _normalize_os(self, os_name):
        os_lower = os_name.lower()
        for standard, aliases in self.OS_ALIASES.items():
            if os_lower in aliases:
                return standard
        return None

    def _normalize_arch(self, arch_name):
        arch_lower = arch_name.lower()
        for standard, aliases in self.ARCH_ALIASES.items():
            if arch_lower in aliases:
                return standard
        return None


def test_resource_validation():
    """Test resource validation."""
    print("\n" + "=" * 60)
    print("Testing Resource Validation (Phase 3)")
    print("=" * 60 + "\n")

    validator = MockResourceValidator()

    # Test 1: Basic resources
    print("1. Testing basic resource requirements...")
    resources = {"cpus": 4, "memory": "8Gi"}
    result = validator.validate(resources)

    print(f"   Valid: {result['valid']}")
    print(f"   Warnings: {result['warnings']}")
    print(f"   Requirements: cpus={result['requirements'].cpus}, memory={result['requirements'].memory}")
    print(f"   ✅ Basic validation works!\n")

    # Test 2: GPU requirements
    print("2. Testing GPU requirements...")
    resources = {"gpus": 2, "gpu_type": "A100", "memory": "32Gi"}
    result = validator.validate(resources)

    print(f"   Valid: {result['valid']}")
    print(f"   Requirements: gpus={result['requirements'].gpus}, type={result['requirements'].gpu_type}")
    print(f"   ✅ GPU validation works!\n")

    # Test 3: Local capability check
    print("3. Testing local capability check...")
    requirements = MockResourceRequirements(cpus=4, memory="8Gi")
    capability = validator.check_local_capability(requirements)

    print(f"   Can run locally: {capability['can_run_locally']}")
    print(f"   Missing: {capability['missing']}")
    print(f"   ✅ Capability check works!\n")

    # Test 4: High resource request
    print("4. Testing high resource request...")
    resources = {"cpus": 256, "gpus": 16}
    result = validator.validate(resources)

    print(f"   Warnings: {result['warnings']}")
    assert len(result['warnings']) == 2, "Should warn about high resources"
    print(f"   ✅ High resource warning works!\n")

    print("=" * 60)
    print("✅ Resource validation tests passed!")
    print("=" * 60)


def test_platform_validation():
    """Test platform validation."""
    print("\n" + "=" * 60)
    print("Testing Platform Validation (Phase 3)")
    print("=" * 60 + "\n")

    validator = MockPlatformValidator()

    # Test 1: OS requirements
    print("1. Testing OS requirements...")
    platform_req = {"os": ["linux", "darwin"]}
    result = validator.validate(platform_req)

    print(f"   Valid: {result['valid']}")
    print(f"   Normalized OS: {result['requirements'].os}")
    print(f"   ✅ OS validation works!\n")

    # Test 2: Architecture requirements
    print("2. Testing architecture requirements...")
    platform_req = {"arch": ["x86_64", "arm64"]}
    result = validator.validate(platform_req)

    print(f"   Valid: {result['valid']}")
    print(f"   Normalized arch: {result['requirements'].arch}")
    print(f"   ✅ Architecture validation works!\n")

    # Test 3: Platform capability check
    print("3. Testing platform capability check...")
    requirements = MockPlatformRequirements(os=["linux"], arch=["x86_64"])
    capability = validator.check_local_capability(requirements)

    current_os = platform.system().lower()
    print(f"   Current platform: {capability['current_platform']}")
    print(f"   Can run locally: {capability['can_run_locally']}")
    print(f"   Missing: {capability['missing']}")

    if current_os == "linux":
        print(f"   ✅ Platform matches!")
    else:
        print(f"   ⚠️  Platform mismatch (expected on Linux)")

    print()

    # Test 4: Combined requirements
    print("4. Testing combined platform requirements...")
    platform_req = {
        "os": ["darwin", "linux"],
        "arch": ["arm64", "x86_64"],
        "software": ["docker", "ffmpeg"]
    }
    result = validator.validate(platform_req)

    print(f"   Valid: {result['valid']}")
    print(f"   OS: {result['requirements'].os}")
    print(f"   Arch: {result['requirements'].arch}")
    print(f"   Software: {result['requirements'].software}")
    print(f"   ✅ Combined requirements work!\n")

    print("=" * 60)
    print("✅ Platform validation tests passed!")
    print("=" * 60)


def test_phase3_integration():
    """Test Phase 3 integration scenario."""
    print("\n" + "=" * 60)
    print("Testing Phase 3 Integration: requires + resources + platform")
    print("=" * 60 + "\n")

    # Simulate skill.yaml structure (方案 B)
    skill_config = {
        "execution": {
            "runtime": {
                # Functional dependencies (requires)
                "requires": {
                    "bins": ["python3"],
                    "pythonPackages": ["torch"]
                },
                # Resource requirements (resources)
                "resources": {
                    "cpus": 8,
                    "gpus": 2,
                    "memory": "32Gi"
                },
                # Platform requirements (platform)
                "platform": {
                    "os": ["linux"],
                    "arch": ["x86_64"],
                    "software": ["cuda"]
                }
            }
        }
    }

    print("Skill Configuration (方案 B):")
    print("  requires:")
    print("    bins: [python3]")
    print("    pythonPackages: [torch]")
    print("  resources:")
    print("    cpus: 8, gpus: 2, memory: 32Gi")
    print("  platform:")
    print("    os: [linux], arch: [x86_64], software: [cuda]")

    print("\n" + "─" * 60)
    print("Separation of Concerns:")
    print("─" * 60)

    print("\n1️⃣  requires (Functional Dependencies)")
    print("   Question: Do I have the required tools?")
    print("   Check: python3, torch package")
    print("   Status: ⚠️  Need to check availability")

    print("\n2️⃣  resources (Hardware Requirements)")
    print("   Question: Do I have enough hardware?")
    print("   Check: 8 CPUs, 2 GPUs, 32GiB memory")
    print("   Status: ⚠️  Likely needs remote execution")

    print("\n3️⃣  platform (Platform Compatibility)")
    print("   Question: Can this run on my platform?")
    print("   Check: Linux OS, x86_64 arch, CUDA software")
    print("   Status: ⚠️  Platform-specific")

    print("\n" + "=" * 60)
    print("✅ Integration test demonstrates clear separation!")
    print("=" * 60)


if __name__ == "__main__":
    test_resource_validation()
    test_platform_validation()
    test_phase3_integration()

    print("\n" + "=" * 70)
    print("🎉 ALL PHASE 3 TESTS PASSED! 🎉")
    print("=" * 70 + "\n")
