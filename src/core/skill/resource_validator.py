"""
Resource validator for skill resource requirements.

Validates and checks hardware resource requirements:
- CPU cores
- GPU count and type
- Memory requirements
- Disk space
"""

import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class ResourceRequirements:
    """Resource requirements for skill execution."""
    cpus: Optional[float] = None      # CPU cores (can be fractional)
    gpus: Optional[int] = None        # GPU count
    gpu_type: Optional[str] = None    # Specific GPU type (A100, RTX4090, etc.)
    memory: Optional[str] = None      # Memory (e.g., "8Gi", "512Mi")
    disk: Optional[str] = None        # Disk space
    priority: Optional[int] = None    # Scheduling priority (1-10)
    timeout: Optional[int] = None     # Max execution time (seconds)

    def __post_init__(self):
        """Validate and normalize resource requirements."""
        if self.memory:
            self.memory_bytes = self._parse_memory(self.memory)
        else:
            self.memory_bytes = 0

        if self.disk:
            self.disk_bytes = self._parse_memory(self.disk)
        else:
            self.disk_bytes = 0

    def _parse_memory(self, memory_str: str) -> int:
        """Parse memory string to bytes."""
        match = re.match(r'(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?', memory_str)
        if not match:
            raise ValueError(f"Invalid memory format: {memory_str}")

        value, unit = match.groups()
        value = float(value)

        multipliers = {
            None: 1,
            'Ki': 1024,
            'Mi': 1024**2,
            'Gi': 1024**3,
            'Ti': 1024**4
        }

        return int(value * multipliers.get(unit, 1))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "cpus": self.cpus,
            "gpus": self.gpus,
            "gpu_type": self.gpu_type,
            "memory": self.memory,
            "memory_bytes": self.memory_bytes,
            "disk": self.disk,
            "disk_bytes": self.disk_bytes,
            "priority": self.priority,
            "timeout": self.timeout
        }


class ResourceValidator:
    """Validator for resource requirements."""

    def validate(self, resources: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate resource requirements configuration.

        Args:
            resources: Raw resources dict from skill.yaml

        Returns:
            Validation result with valid flag, warnings, and normalized requirements
        """
        warnings = []
        normalized = {}

        try:
            # Parse and validate CPUs
            if "cpus" in resources:
                cpus = float(resources["cpus"])
                if cpus <= 0:
                    warnings.append(f"CPU count must be positive, got {cpus}")
                elif cpus > 128:
                    warnings.append(f"Unusually high CPU request: {cpus}")
                normalized["cpus"] = cpus

            # Parse and validate GPUs
            if "gpus" in resources:
                gpus = int(resources["gpus"])
                if gpus < 0:
                    warnings.append(f"GPU count cannot be negative, got {gpus}")
                elif gpus > 8:
                    warnings.append(f"Unusually high GPU request: {gpus}")
                normalized["gpus"] = gpus

            # Validate GPU type
            if "gpu_type" in resources:
                gpu_type = resources["gpu_type"]
                known_types = ["A100", "H100", "RTX4090", "RTX4080", "V100", "T4"]
                if gpu_type not in known_types:
                    warnings.append(f"Unknown GPU type: {gpu_type}")
                normalized["gpu_type"] = gpu_type

            # Parse and validate memory
            if "memory" in resources:
                memory_str = resources["memory"]
                try:
                    memory_bytes = self._parse_memory(memory_str)
                    normalized["memory"] = memory_str
                    normalized["memory_bytes"] = memory_bytes

                    # Warn if > 1 TiB
                    if memory_bytes > 1024**4:
                        warnings.append(f"Very large memory request: {memory_str}")
                except ValueError as e:
                    warnings.append(str(e))

            # Parse and validate disk
            if "disk" in resources:
                disk_str = resources["disk"]
                try:
                    disk_bytes = self._parse_memory(disk_str)
                    normalized["disk"] = disk_str
                    normalized["disk_bytes"] = disk_bytes
                except ValueError as e:
                    warnings.append(str(e))

            # Validate priority
            if "priority" in resources:
                priority = int(resources["priority"])
                if priority < 1 or priority > 10:
                    warnings.append(f"Priority must be 1-10, got {priority}")
                normalized["priority"] = priority

            # Validate timeout
            if "timeout" in resources:
                timeout = int(resources["timeout"])
                if timeout <= 0:
                    warnings.append(f"Timeout must be positive, got {timeout}")
                elif timeout > 86400:  # 24 hours
                    warnings.append(f"Very long timeout: {timeout}s")
                normalized["timeout"] = timeout

            # Create ResourceRequirements object
            requirements = ResourceRequirements(
                cpus=normalized.get("cpus"),
                gpus=normalized.get("gpus"),
                gpu_type=normalized.get("gpu_type"),
                memory=normalized.get("memory"),
                disk=normalized.get("disk"),
                priority=normalized.get("priority"),
                timeout=normalized.get("timeout")
            )

            return {
                "valid": True,
                "warnings": warnings,
                "requirements": requirements
            }

        except Exception as e:
            return {
                "valid": False,
                "errors": [str(e)],
                "warnings": warnings
            }

    def _parse_memory(self, memory_str: str) -> int:
        """Parse memory string to bytes."""
        match = re.match(r'(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?', memory_str)
        if not match:
            raise ValueError(f"Invalid memory format: {memory_str}")

        value, unit = match.groups()
        value = float(value)

        multipliers = {
            None: 1,
            'Ki': 1024,
            'Mi': 1024**2,
            'Gi': 1024**3,
            'Ti': 1024**4
        }

        return int(value * multipliers.get(unit, 1))

    def check_local_capability(self, requirements: ResourceRequirements) -> Dict[str, Any]:
        """
        Check if local machine can satisfy resource requirements.

        Args:
            requirements: ResourceRequirements object

        Returns:
            Capability check result
        """
        try:
            import psutil
        except ImportError:
            return {
                "can_run_locally": False,
                "missing": ["psutil not installed for resource detection"],
                "warnings": []
            }

        missing = []
        warnings = []

        # Check CPU
        if requirements.cpus:
            available_cpus = psutil.cpu_count()
            if requirements.cpus > available_cpus:
                missing.append(f"CPU: need {requirements.cpus}, have {available_cpus}")

        # Check memory
        if requirements.memory_bytes > 0:
            available_memory = psutil.virtual_memory().total
            if requirements.memory_bytes > available_memory:
                need_gb = requirements.memory_bytes / 1024**3
                have_gb = available_memory / 1024**3
                missing.append(f"Memory: need {need_gb:.1f}GiB, have {have_gb:.1f}GiB")

        # Check GPU (basic check)
        if requirements.gpus and requirements.gpus > 0:
            try:
                # Try to detect GPUs
                import subprocess
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=count", "--format=csv,noheader"],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    gpu_count = int(result.stdout.strip().split()[0])
                    if requirements.gpus > gpu_count:
                        missing.append(f"GPU: need {requirements.gpus}, have {gpu_count}")
                else:
                    # nvidia-smi not found
                    missing.append(f"GPU: need {requirements.gpus}, nvidia-smi not found")
            except (FileNotFoundError, subprocess.TimeoutExpired):
                missing.append(f"GPU: need {requirements.gpus}, cannot detect GPUs")

        # Check GPU type if specified
        if requirements.gpu_type:
            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    gpu_names = result.stdout.strip().split('\n')
                    if requirements.gpu_type not in ' '.join(gpu_names):
                        missing.append(f"GPU type: need {requirements.gpu_type}, have {gpu_names}")
            except (FileNotFoundError, subprocess.TimeoutExpired):
                warnings.append("Cannot verify GPU type")

        return {
            "can_run_locally": len(missing) == 0,
            "missing": missing,
            "warnings": warnings,
            "requirements": requirements.to_dict()
        }
