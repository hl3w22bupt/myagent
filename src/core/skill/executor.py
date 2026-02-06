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

        # ✅ 新增：验证技能名称存在
        available_skills = self.registry.get_skill_names()

        if skill_name not in available_skills:
            # 尝试找到相似的技能名称
            similar_skill = self._find_similar_skill(skill_name, available_skills)

            error_msg = (
                f"Skill '{skill_name}' not found in registry. "
                f"Available skills: {available_skills}"
            )

            if similar_skill:
                error_msg += f". Did you mean '{similar_skill}'?"

            print(f"[ERROR] SkillExecutor: Invalid skill name")
            print(f"  Requested: {skill_name}")
            print(f"  Similar: {similar_skill}")
            print(f"  Available: {available_skills}")

            return SkillResult(
                success=False,
                output=None,
                error=error_msg,
                execution_time=0,
                metadata={'skill_not_found': True, 'suggested_skill': similar_skill}
            )

        skill = await self.registry.load_full(skill_name)
        start_time = time.time()

        # Get artifact_type from skill
        artifact_type = self._get_skill_artifact_type(skill)

        # Define the skill execution function（简化后的逻辑）
        async def _skill_func(enhanced_input: Dict[str, Any]) -> Any:
            """
            Internal skill execution function

            判断逻辑：
            1. Claude Skills（在 virtual_registry 中）→ _execute_claude_skill
            2. 有 execution 且 handler == 'claude_skill_handler' → Claude Code Skills（旧路径）
            3. 没有 execution → Native Pure-Prompt Skills
            4. 有 execution 且 handler != 'claude_skill_handler' → Native Skills
            """
            # ============ 优先判断：是否是 Claude Skill ============
            if self._virtual_registry and skill_name in self._virtual_registry._virtual_skills:
                # ⭐ Claude Skills, 统一使用 _execute_claude_skill 处理
                return await self._execute_claude_skill(
                    skill,
                    enhanced_input
                )

            # ============ 判断：是否有 execution 配置 ============
            if not skill.execution:
                # ⭐ Native Pure-Prompt Skills
                # 没有 execution，但有 prompt_template
                return await self._execute_native_prompt_skill(
                    skill,
                    enhanced_input
                )

            # 有 execution 配置
            # 判断 handler 类型
            handler_path = skill.execution.handler

            if 'claude_skill_handler' in handler_path:
                # ⭐ Claude Code Skills（旧路径，使用 skill.yaml）
                # handler 指向 claude_skill_handler.py
                return await self._execute_claude_skill(
                    skill,
                    enhanced_input
                )
            else:
                # ⭐ Native Skills (handler.py)
                # 传统的 Python handler
                return await self._execute_native_skill(
                    skill,
                    enhanced_input
                )

        # Execute with hooks if there are any hooks configured
        from config.hooks import HOOK_CONFIG
        has_hooks_configured = len(self.hook_executor.hook_manager.hooks) > 0

        # print(f"[DEBUG] SkillExecutor.execute: skill_name={skill_name}")
        # print(f"[DEBUG]   has_hooks_configured={has_hooks_configured}")
        # print(f"[DEBUG]   hook_manager.hooks count={len(self.hook_executor.hook_manager.hooks)}")
        # for i, hook in enumerate(self.hook_executor.hook_manager.hooks):
        #     print(f"[DEBUG]     hook[{i}]: {type(hook).__name__}")

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

    async def _execute_native_prompt_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Native Pure-Prompt Skills 执行

        使用 ClaudeSkillHandler（template 模式）

        注意：Claude Skills不会走这个方法，
        它们会通过 virtual_registry 判断，走 _execute_claude_skill 路径。

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            OutputBuilder 格式的输出
        """
        from .handlers.claude_skill_handler import ClaudeSkillHandler

        # 创建 handler（template 模式）
        handler = ClaudeSkillHandler(
            skill_name=skill.name,
            prompt_template=skill.prompt_template,  # ← 从字段读取
            mode=ClaudeSkillHandler.MODE_TEMPLATE  # ← template 模式
        )

        return handler.execute(input_data)

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
        from .adapters.claude_skill_scanner import ClaudeSkillScanner

        # Determine skill_root and timeout
        timeout = 30000  # Default timeout
        skill_root = None

        if skill.execution:
            timeout = skill.execution.timeout or timeout
            if skill.execution.script_path:
                script_path_obj = Path(skill.execution.script_path)
                skill_root = script_path_obj.parent
        else:
            # No execution config - this is a pure Claude Skill (from claude_skills/ directory)
            # Find the SKILL.md file
            scanner = ClaudeSkillScanner()
            skill_files = scanner.scan()
            for skill_file in skill_files:
                if skill_file.skill_name == skill.name:
                    # skill_file.root_dir 指向 claude_skills/
                    # SKILL.md 在 claude_skills/{skill_name}/SKILL.md
                    skill_root = skill_file.root_dir / skill.name
                    # print(f"[DEBUG] Auto-detected skill_root for {skill.name}: {skill_root}")
                    break

        # print(f"[DEBUG] Creating ClaudeSkillHandler for {skill.name}:")
        # print(f"[DEBUG]   skill_root: {skill_root}")
        # print(f"[DEBUG]   timeout: {timeout}")
        # print(f"[DEBUG]   Will use mode: {'file' if skill_root else 'template'}")

        handler = ClaudeSkillHandler(
            skill_name=skill.name,
            skill_root=skill_root,
            timeout=timeout,
            mode='file' if skill_root else 'template'  # Explicitly set mode based on skill_root
        )

        # Execute skill
        # Pass the complete input_data to handler (not just extracted fields)
        # This ensures all fields from PTC code are available to the skill
        handler_input = {
            'skill_name': skill.name,
            **input_data  # Include all fields from input_data
        }

        print(f"[DEBUG] _execute_claude_skill calling handler with:")
        result = handler.execute(handler_input)
        # 移除 result 的打印输出，避免干扰 [STRUCTURED_OUTPUT] 标记

        if not result.get('success'):
            raise Exception(result.get('error', 'Claude Skill execution failed'))

        # Return the full result dict, not just the output
        # This is important for hook processing
        return result

    async def _execute_native_skill(
        self,
        skill,
        input_data: Dict[str, Any]
    ) -> Any:
        """
        Native Skills 执行（传统 handler.py）

        动态导入并执行 handler.py

        Args:
            skill: Skill definition
            input_data: Input parameters

        Returns:
            Handler 函数的返回值
        """
        if not skill.execution:
            raise ValueError(f"Skill '{skill.name}' missing execution config")

        # 构建模块路径
        handler = skill.execution.handler
        if handler.endswith('.py'):
            handler = handler[:-3]

        # 动态导入
        module_path = f"skills.{skill.name}.{handler.replace('/', '.')}"
        skill_module = importlib.import_module(module_path)

        # 获取函数
        function_name = skill.execution.function or "execute"
        if not hasattr(skill_module, function_name):
            raise AttributeError(
                f"Function '{function_name}' not found in '{module_path}'"
            )

        handler_func = getattr(skill_module, function_name)

        # 执行
        if asyncio.iscoroutinefunction(handler_func):
            result = await handler_func(input_data)
        else:
            result = handler_func(input_data)

        return result

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

    def _find_similar_skill(self, invalid_name: str, available_skills: list[str]) -> str | None:
        """
        Find similar skill name for typos or variations.

        Args:
            invalid_name: The invalid skill name provided
            available_skills: List of available skill names

        Returns:
            The most similar skill name, or None if no close match found
        """
        if not available_skills:
            return None

        invalid_normalized = invalid_name.lower().replace('_', '-')

        # Direct substring match
        for skill in available_skills:
            skill_normalized = skill.lower()
            if (invalid_normalized in skill_normalized or
                skill_normalized in invalid_normalized):
                return skill

        # Word-based matching
        invalid_words = set(invalid_normalized.split('-'))
        for skill in available_skills:
            skill_words = set(skill.lower().split('-'))
            common_words = invalid_words & skill_words
            if len(common_words) >= 2:
                return skill

        return None

