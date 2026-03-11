"""
Skill environment variable loader.

Manages environment variable injection for skills with:
- Default values from skill.yaml (execution.runtime.env)
- Override values from config/skills-env.yaml
- Session-scoped injection with automatic cleanup
"""

import os
import yaml
from typing import Dict, Optional, Any
from pathlib import Path


class SkillEnvLoader:
    """
    Skill environment variable loader.

    Loads environment variables for skill execution with:
    1. Default values from skill.yaml (execution.runtime.env)
    2. Override values from config/skills-env.yaml
    3. Automatic cleanup after execution
    """

    def __init__(self, config_path: str = "config/skills-env.yaml"):
        """
        Initialize the loader.

        Args:
            config_path: Path to the skills environment configuration file
        """
        self.config_path = config_path
        self.config_overrides = self._load_config_overrides()
        self._injected_env: Dict[str, Dict[str, str]] = {}  # {skill_name: {var: value}}

    def _load_config_overrides(self) -> Dict[str, Any]:
        """
        Load configuration overrides from YAML file.

        Returns:
            Dictionary with configuration overrides
        """
        config_file = Path(self.config_path)
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    config = yaml.safe_load(f)
                    return config.get("skills", {}).get("entries", {})
            except Exception as e:
                print(f"⚠️  Failed to load config from {self.config_path}: {e}")
                return {}
        return {}

    def get_skill_config(self, skill_name: str) -> Dict[str, Any]:
        """
        Get skill configuration from config overrides.

        Args:
            skill_name: Name of the skill

        Returns:
            Skill configuration dictionary
        """
        return self.config_overrides.get(skill_name, {})

    def load_for_skill(self, skill_name: str,
                       runtime_env: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """
        Load environment variables for a skill session.

        Priority:
        1. Config file overrides (highest priority)
        2. skill.yaml default values (execution.runtime.env)
        3. System environment variables (fallback)

        Args:
            skill_name: Name of the skill
            runtime_env: Default environment values from skill.yaml

        Returns:
            Dictionary of injected environment variables
        """
        skill_config = self.get_skill_config(skill_name)
        injected = {}

        # Merge default values and overrides
        merged_env = {}
        if runtime_env:
            merged_env.update(runtime_env)

        # Apply overrides from config
        override_env = skill_config.get("env", {})
        merged_env.update(override_env)

        # Inject environment variables (only if not already set)
        for key, value in merged_env.items():
            if key not in os.environ:
                os.environ[key] = str(value)
                injected[key] = str(value)

        # Store injected variables for this skill
        self._injected_env[skill_name] = injected

        return injected

    def restore(self, skill_name: str):
        """
        Restore environment variables after skill execution.

        Removes environment variables that were injected for this skill.
        Only removes variables that were actually injected (not existing vars).

        Args:
            skill_name: Name of the skill
        """
        if skill_name in self._injected_env:
            injected = self._injected_env[skill_name]
            for key in injected:
                # Only remove if it's still the value we injected
                # (user may have changed it during execution)
                if key in os.environ:
                    del os.environ[key]

            del self._injected_env[skill_name]

    def get_api_key(self, skill_name: str,
                   primary_env: Optional[str] = None) -> Optional[str]:
        """
        Get API key for a skill.

        Priority:
        1. Config file apiKey setting
        2. Primary environment variable
        3. System environment

        Args:
            skill_name: Name of the skill
            primary_env: Name of the primary environment variable

        Returns:
            API key string or None
        """
        skill_config = self.get_skill_config(skill_name)
        api_key_config = skill_config.get("apiKey")

        # Check config file apiKey
        if api_key_config:
            if isinstance(api_key_config, str):
                # Direct string value
                return api_key_config
            elif isinstance(api_key_config, dict):
                # SecretRef structure
                source = api_key_config.get("source")
                provider = api_key_config.get("provider", "default")
                key_id = api_key_config.get("id")

                if source == "env":
                    if provider == "default":
                        # From environment variable
                        return os.getenv(key_id)
                    else:
                        # From external provider
                        return self._fetch_from_provider(provider, key_id)

        # Fallback to primary environment variable
        if primary_env:
            return os.getenv(primary_env)

        return None

    def _fetch_from_provider(self, provider: str, key_id: str) -> Optional[str]:
        """
        Fetch API key from external provider.

        Args:
            provider: Provider name (e.g., "1password", "aws-secrets")
            key_id: Key identifier in the provider

        Returns:
            API key string or None
        """
        # Placeholder for external provider integration
        # Supported providers:
        # - 1password (op)
        # - AWS Secrets Manager
        # - HashiCorp Vault
        # - Azure Key Vault

        print(f"⚠️  External provider '{provider}' not implemented yet")
        print(f"   Key ID: {key_id}")
        print(f"   Falling back to environment variable")

        # Fallback to environment variable
        return os.getenv(key_id)

    def list_loaded_skills(self) -> list:
        """
        List all skills with currently loaded environment variables.

        Returns:
            List of skill names
        """
        return list(self._injected_env.keys())

    def get_injected_vars(self, skill_name: str) -> Dict[str, str]:
        """
        Get environment variables injected for a skill.

        Args:
            skill_name: Name of the skill

        Returns:
            Dictionary of injected variables
        """
        return self._injected_env.get(skill_name, {})
