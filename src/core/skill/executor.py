"""
Skill Executor for unified Skill execution.

The Executor provides a consistent interface for executing all types of Skills:
- pure-prompt: Template-based, returns prompt for LLM
- pure-script: Code-only execution
- hybrid: Combined script and prompt execution
"""

import importlib
import json
import time
import asyncio
from typing import Any, Dict, Optional, List
from .registry import SkillRegistry
from .types import SkillType, SkillResult, SkillContext


class SkillExecutor:
    """
    Unified executor for all Skill types.

    Provides a single `execute()` method that handles all Skill types
    and returns consistent results.
    """

    def __init__(self, skills_dir: str = 'skills/'):
        """
        Initialize the Skill Executor.

        Args:
            skills_dir: Path to the skills directory
        """
        self.registry = SkillRegistry(skills_dir)
        self._loaded = False

    async def ensure_loaded(self):
        """Ensure registry is initialized and scanned."""
        if not self._loaded:
            await self.registry.scan()
            self._loaded = True

    async def execute(
        self,
        skill_name: str,
        input_data: Dict[str, Any],
        context: Optional[SkillContext] = None
    ) -> SkillResult:
        """
        Execute a skill by name.

        This is the main entry point for skill execution.
        Automatically determines the skill type and executes appropriately.

        Args:
            skill_name: Name of the skill to execute
            input_data: Input parameters for the skill
            context: Optional execution context

        Returns:
            SkillResult with success status, output, and metadata
        """
        await self.ensure_loaded()

        skill = await self.registry.load_full(skill_name)
        start_time = time.time()

        try:
            if skill.type == SkillType.PURE_PROMPT:
                output = await self._execute_prompt_skill(skill, input_data)
            elif skill.type == SkillType.PURE_SCRIPT:
                output = await self._execute_script_skill(skill, input_data)
            elif skill.type == SkillType.HYBRID:
                output = await self._execute_hybrid_skill(skill, input_data)
            else:
                raise ValueError(f"Unknown skill type: {skill.type}")

            execution_time = time.time() - start_time

            return SkillResult(
                success=True,
                output=output,
                execution_time=execution_time
            )

        except Exception as e:
            execution_time = time.time() - start_time

            return SkillResult(
                success=False,
                error=str(e),
                execution_time=execution_time
            )

    async def _execute_prompt_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Any:
        """
        Execute pure-prompt skill.

        Pure prompt skills don't execute code, they return a formatted
        prompt template for the LLM to process.

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            Formatted prompt string
        """
        if not skill.prompt_template:
            raise ValueError(
                f"Pure prompt skill '{skill.name}' missing prompt_template"
            )

        # Render template with input data
        template = skill.prompt_template
        for key, value in input_data.items():
            # Support both {{key}} and {key} syntax
            template = template.replace(f"{{{{{key}}}}}", str(value))
            template = template.replace(f"{{{key}}}", str(value))

        return {
            "type": "prompt",
            "content": template,
            "skill_name": skill.name
        }

    async def _execute_script_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Any:
        """
        Execute pure-script skill.

        Script skills execute Python code in a handler module.

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            Result from handler function
        """
        if not skill.execution:
            raise ValueError(
                f"Script skill '{skill.name}' missing execution config"
            )

        try:
            # Construct module path
            handler = skill.execution.handler
            if handler.endswith('.py'):
                handler = handler[:-3]

            # Dynamic import: skills.{skill_name}.{handler}
            module_path = f"skills.{skill.name}.{handler.replace('/', '.')}"

            skill_module = importlib.import_module(module_path)

            # Get the function
            function_name = skill.execution.function
            if not hasattr(skill_module, function_name):
                raise AttributeError(
                    f"Function '{function_name}' not found in module '{module_path}'"
                )

            handler_func = getattr(skill_module, function_name)

            # Execute the function
            if asyncio.iscoroutinefunction(handler_func):
                result = await handler_func(input_data)
            else:
                result = handler_func(input_data)

            return result

        except ImportError as e:
            raise ImportError(
                f"Failed to import skill module for '{skill.name}': {e}"
            )
        except AttributeError as e:
            raise AttributeError(
                f"Handler function not found for skill '{skill.name}': {e}"
            )

    async def _execute_hybrid_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Any:
        """
        Execute hybrid skill.

        Hybrid skills combine script execution with prompt templates.
        The script can use the prompt template internally for LLM calls.

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            Result from handler function
        """
        # For hybrid skills, execute the script part
        # The script can access skill.prompt_template for LLM calls
        return await self._execute_script_skill(skill, input_data)

    async def execute_batch(
        self,
        executions: List[Dict[str, Any]]
    ) -> List[SkillResult]:
        """
        Execute multiple skills in parallel.

        Args:
            executions: List of dicts with 'skill_name' and 'input_data'

        Returns:
            List of SkillResults in the same order
        """
        await self.ensure_loaded()

        tasks = [
            self.execute(exec['skill_name'], exec.get('input_data', {}))
            for exec in executions
        ]

        return await asyncio.gather(*tasks)

    def list_skills(self, tags=None) -> list:
        """
        List available skills.

        Args:
            tags: Optional tags to filter by

        Returns:
            List of skill metadata
        """
        if not self._loaded:
            # Return empty list if not loaded (sync method)
            return []

        skills = self.registry.list(tags)
        return [
            {
                'name': s.name,
                'version': s.version,
                'description': s.description,
                'tags': s.tags,
                'type': s.type
            }
            for s in skills
        ]

    async def get_skill_info(self, skill_name: str) -> Dict[str, Any]:
        """
        Get detailed information about a skill.

        Args:
            skill_name: Name of the skill

        Returns:
            Dictionary with skill information
        """
        await self.ensure_loaded()

        skill = await self.registry.load_full(skill_name)

        return {
            'name': skill.name,
            'version': skill.version,
            'description': skill.description,
            'tags': skill.tags,
            'type': skill.type,
            'input_schema': skill.input_schema.dict(),
            'output_schema': skill.output_schema.dict(),
            'has_prompt': skill.prompt_template is not None,
            'has_execution': skill.execution is not None
        }
