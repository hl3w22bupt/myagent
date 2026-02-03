"""
Skill Executor for unified Skill execution.

The Executor provides a consistent interface for executing all types of Skills:
- pure-prompt: Template-based, returns prompt for LLM
- pure-script: Code-only execution
- hybrid: Combined script and prompt execution

Supports both native Motia skills and adapted Claude Skills.
"""

import os
import importlib
import json
import time
import asyncio
from pathlib import Path
from typing import Any, Dict, Optional, List, TYPE_CHECKING
from .registry import SkillRegistry
from .types import SkillType, SkillResult, SkillContext
from .hooks.base import BaseHook, NoOpHook
from .hooks.executor import SkillHookExecutor

# Import Claude Skills components only when needed
if TYPE_CHECKING:
    from .adapters.virtual_skill_registry import VirtualSkillRegistry


class SkillExecutor:
    """
    Unified executor for all Skill types.

    Provides a single `execute()` method that handles all Skill types
    and returns consistent results.

    Supports both native Motia skills and adapted Claude Skills.
    """

    def __init__(
        self,
        skills_dir: str = 'skills/',
        hooks: Optional[List[BaseHook]] = None,
        notify_hook_api_url: Optional[str] = None,
        virtual_registry: Optional['VirtualSkillRegistry'] = None
    ):
        """
        Initialize the Skill Executor.

        Args:
            skills_dir: Path to the skills directory
            hooks: Optional list of hook instances for pre/post execution callbacks
            notify_hook_api_url: Optional URL for progress notifications (e.g., 'http://localhost:3000/api/notify')
                              If not provided, will try to get from MOTIA_NOTIFY_API_URL environment variable
            virtual_registry: Optional VirtualSkillRegistry for Claude Skills
        """
        # Create registry with virtual registry support
        self.registry = SkillRegistry(skills_dir, virtual_registry=virtual_registry)
        self._loaded = False

        # Store virtual registry for Claude Skill execution
        self._virtual_registry = virtual_registry

        # Get notify_hook_api_url from parameter or environment variable
        if notify_hook_api_url is None:
            notify_hook_api_url = os.getenv('MOTIA_NOTIFY_API_URL', 'http://localhost:3000/api/notify')

        # Get default hook configuration
        from config.hooks import get_default_hooks

        # Hook configuration logic:
        # - hooks=None (default): Auto-register default hooks (ProgressNotificationHook if notify_api_url is set)
        # - hooks=[] (explicit empty): Disable all hooks
        # - hooks=[...]: Use custom hooks
        if hooks is None:
            default_hooks = get_default_hooks(notify_hook_api_url)
        elif hooks == []:  # Explicitly empty list - disable all hooks
            default_hooks = []
        else:  # User provided custom hooks
            default_hooks = hooks

        # Create hook executor
        self.hook_executor = SkillHookExecutor(
            hooks=default_hooks,
            notify_hook_api_url=notify_hook_api_url if default_hooks else None
        )

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

        # Get artifact_type from skill
        artifact_type = self._get_skill_artifact_type(skill)

        # Define the skill execution function
        async def _skill_func(enhanced_input: Dict[str, Any]) -> Any:
            """Internal skill execution function"""
            if skill.type == SkillType.PURE_PROMPT:
                return await self._execute_prompt_skill(skill, enhanced_input)
            elif skill.type == SkillType.PURE_SCRIPT:
                return await self._execute_script_skill(skill, enhanced_input)
            elif skill.type == SkillType.HYBRID:
                return await self._execute_hybrid_skill(skill, enhanced_input)
            else:
                raise ValueError(f"Unknown skill type: {skill.type}")

        # Execute with hooks if there are any hooks configured
        from config.hooks import HOOK_CONFIG
        has_hooks_configured = len(self.hook_executor.hook_manager.hooks) > 0

        print(f"[DEBUG] SkillExecutor.execute: skill_name={skill_name}")
        print(f"[DEBUG]   has_hooks_configured={has_hooks_configured}")
        print(f"[DEBUG]   hook_manager.hooks count={len(self.hook_executor.hook_manager.hooks)}")
        for i, hook in enumerate(self.hook_executor.hook_manager.hooks):
            print(f"[DEBUG]     hook[{i}]: {type(hook).__name__}")

        if has_hooks_configured:
            try:
                result = await self.hook_executor.execute_with_hooks(
                    skill_name=skill_name,
                    skill_func=_skill_func,
                    input_data=input_data
                )

                execution_time = time.time() - start_time

                # Convert hook result to SkillResult
                # 支持两种格式：旧格式（直接 output/error）和 OutputBuilder 统一格式
                if result.get("success"):
                    # 成功：提取 output 或 content
                    output = result.get("output")
                    if output is None:
                        # OutputBuilder 统一格式：内容在 content 字段
                        output = result.get("content")

                    # 保留完整的 structured_output（如果存在）
                    metadata = {'artifact_type': artifact_type}
                    if 'result_type' in result:
                        # 这是 OutputBuilder 格式，保存完整的 structured_output
                        metadata['structured_output'] = {
                            k: v for k, v in result.items()
                            if k not in ['success']  # 排除 success 字段
                        }

                    return SkillResult(
                        success=True,
                        output=output,
                        execution_time=execution_time,
                        metadata=metadata
                    )
                else:
                    # 失败：提取 error
                    error = result.get("error")
                    if error is None:
                        # OutputBuilder 统一格式：错误信息在 content 字段
                        content = result.get("content", {})
                        if isinstance(content, dict):
                            # 从 content 中提取错误信息
                            error = content.get("message") or content.get("details") or str(content)
                        else:
                            error = str(content)

                    # 失败时也保留 structured_output（包含错误信息）
                    metadata = {'artifact_type': artifact_type}
                    if 'result_type' in result:
                        metadata['structured_output'] = {
                            k: v for k, v in result.items()
                            if k not in ['success']
                        }

                    return SkillResult(
                        success=False,
                        error=error,
                        execution_time=execution_time,
                        metadata=metadata
                    )
            except Exception as e:
                execution_time = time.time() - start_time
                return SkillResult(
                    success=False,
                    error=str(e),
                    execution_time=execution_time,
                    metadata={'artifact_type': artifact_type}
                )
        else:
            # Execute without hooks (backward compatibility)
            try:
                output = await _skill_func(input_data)
                execution_time = time.time() - start_time
                return SkillResult(
                    success=True,
                    output=output,
                    execution_time=execution_time,
                    metadata={'artifact_type': artifact_type}
                )
            except Exception as e:
                execution_time = time.time() - start_time
                return SkillResult(
                    success=False,
                    error=str(e),
                    execution_time=execution_time,
                    metadata={'artifact_type': artifact_type}
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

        Supports both native Motia skills and Claude Skills.

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

        # Check if this is a Claude Skill
        is_claude_skill = (
            hasattr(skill.execution, 'handler') and
            'claude_skill_handler' in str(skill.execution.handler)
        )

        if is_claude_skill:
            return await self._execute_claude_skill(skill, input_data)

        # Native Motia skill execution
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

    async def _execute_claude_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Any:
        """
        Execute Claude Skill using the Claude Skill Handler.

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            Result from Claude Skill handler (full dict with success, output, error)
        """
        from .handlers.claude_skill_handler import ClaudeSkillHandler

        # Get script path from execution config
        script_path = skill.execution.script_path

        # Create handler - pass the script path directly if available
        if script_path:
            # Extract the directory containing the script
            script_path_obj = Path(script_path)
            skill_root = script_path_obj.parent
        else:
            skill_root = None

        handler = ClaudeSkillHandler(
            skill_name=skill.name,
            skill_root=skill_root,
            timeout=skill.execution.timeout
        )

        # Execute skill
        handler_input = {
            'skill_name': skill.name,
            'task': input_data.get('task', {}),
            'context': input_data.get('context', {})
        }

        print(f"[DEBUG] _execute_claude_skill calling handler with: {handler_input}")
        result = handler.execute(handler_input)
        # 移除 result 的打印输出，避免干扰 [STRUCTURED_OUTPUT] 标记

        if not result.get('success'):
            raise Exception(result.get('error', 'Claude Skill execution failed'))

        # Return the full result dict, not just the output
        # This is important for hook processing
        return result

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

    def _get_skill_artifact_type(self, skill) -> str:
        """
        获取 skill 的 artifact_type

        Args:
            skill: SkillDefinition object

        Returns:
            Artifact type string (e.g., 'video', 'image', 'code', 'text')
        """
        if hasattr(skill, 'get_artifact_type'):
            return skill.get_artifact_type()
        return 'text'
