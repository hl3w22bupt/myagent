"""
Skill Hook Executor

Manages hook execution and progress reporting.
"""
import asyncio
import os
import pathlib
import time
from typing import Callable, Optional, Dict, Any, List, Tuple
from .base import BaseHook, SkillContext, HookResult, NoOpHook
from .manager import HookManager
from .system.progress_notification_hook import ProgressNotificationHook
from .workspace_manager import WorkspaceManager


class SkillHookExecutor:
    """Executor for Skill with Hook support."""

    def __init__(
        self,
        hooks: Optional[List[BaseHook]] = None,
        notify_hook_api_url: Optional[str] = None
    ):
        """
        Initialize the hook executor.

        Args:
            hooks: List of hook instances to register (should include ProgressNotificationHook via get_default_hooks)
            notify_hook_api_url: Motia Notify API URL (kept for compatibility, but not used here)
        """
        self.hook_manager = HookManager()

        # 注册所有提供的 hook（去重逻辑）
        if hooks:
            for hook in hooks:
                # 检查是否已存在同类型的 hook，避免重复注册
                if not any(isinstance(existing, type(hook)) for existing in self.hook_manager.hooks):
                    self.hook_manager.register(hook)

    async def report_progress(
        self,
        context: SkillContext,
        progress_type: str,
        data: Dict[str, Any],
        stage: str = "processing"
    ):
        """
        Report progress from Skill execution.

        Args:
            context: Execution context
            progress_type: Type of progress ('step', 'heartbeat', 'status', 'chat')
            data: Progress data
            stage: Execution stage ('pre', 'processing', 'post')
        """
        # 调用所有注册的 hook 的进度通知方法
        await self.hook_manager.on_progressing_notify(
            context,
            {**data, "type": progress_type, "stage": stage}
        )

    async def execute_with_hooks(
        self,
        skill_name: str,
        skill_func: Callable,
        input_data: Dict[str, Any],
        skill_type: str = "claude"
    ) -> Dict[str, Any]:
        """
        Execute skill with hook lifecycle.

        Args:
            skill_name: Name of the skill
            skill_func: Main skill function
            input_data: Input data for skill
            skill_type: Type of skill ("pure-script", "pure-prompt", "hybrid")

        Returns:
            Skill execution result
        """
        # Add skill_name and workspace_dir to input_data for internal use
        enhanced_input = {
            "_skill_name": skill_name,
            **input_data
        }

        # workspace_dir will be set after workspace creation below

        # Create execution context
        # Try to get task_id and session_id from input_data or environment
        task_id = input_data.get("task_id") or os.getenv("MOTIA_TASK_ID", "")
        session_id = input_data.get("session_id") or os.getenv("MOTIA_SESSION_ID", "")

        context = SkillContext(
            skill_name=skill_name,
            task_id=task_id,
            session_id=session_id,
            input_data=input_data,
            metadata=input_data.get("metadata", {}),
            execution_start_time=asyncio.get_event_loop().time(),
            workspace_dir="",  # Will be set after workspace creation
            skill_type="native" if skill_type in ("pure-script", "hybrid") else "claude"
        )

        # ============ Workspace Management ============
        # Create workspace before skill execution
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)
        context.workspace_dir = workspace_dir

        # Set environment variable as fallback
        os.environ['MOTIA_WORKSPACE_DIR'] = workspace_dir

        # Pass workspace_dir to skill via enhanced_input
        enhanced_input["_workspace_dir"] = workspace_dir
        # ==============================================

        # Pre-exec hook
        try:
            pre_result = await self.hook_manager.pre_exec(context)
            if pre_result.get("action") == "stop":
                return {
                    "success": False,
                    "error": f"Stopped by pre-hook: {pre_result.get('reason')}" if pre_result.get('reason') else "Stopped by pre-hook",
                    "reason": pre_result.get('reason')
                }
            if pre_result.get("modified_input"):
                # Update input_data with modifications
                input_data = pre_result.get("modified_input")
                # Also update enhanced_input
                enhanced_input = {
                    "_skill_name": skill_name,
                    **input_data
                }
        except Exception as e:
            # Hook error should not stop execution
            print(f"Warning: Pre-hook error: {e}")

        # Execute main logic
        try:
            result = await skill_func(enhanced_input)
        except Exception as e:
            # Return OutputBuilder format for errors
            result = {
                'result_type': 'error',
                'success': False,
                'content': {
                    'type': 'execution',
                    'message': str(e)
                },
                'metadata': {
                    'execution_time': 0,
                    'skills_used': []
                }
            }

        # Post-exec hook
        try:
            post_result = await self.hook_manager.post_exec(context, result)
            if post_result:
                result.update(post_result)
        except Exception as e:
            print(f"Warning: Post-hook error: {e}")

        # ============ Artifact Management ============
        # Always scan workspace and transfer artifacts (takes priority over explicit output_files)
        # Scan task-level workspace to capture files created/modified by any skill in this task
        # This supports multi-skill workflows where downstream skills modify files created by upstream skills
        if workspace_dir:
            # Get task-level workspace (one level up from skill workspace)
            task_workspace = os.path.dirname(workspace_dir)
            if os.path.exists(task_workspace):
                artifacts = WorkspaceManager.scan_task_artifacts(task_workspace)
            else:
                artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

            transferred_files = []
            for artifact_type, items in artifacts.items():
                dest_dir = f"outputs/{artifact_type}"
                for item in items:
                    # Handle both tuple (rel_path, skill_name) and string (rel_path) formats
                    if isinstance(item, tuple):
                        rel_path, item_skill_name = item
                    else:
                        rel_path, item_skill_name = item, skill_name

                    src_path = os.path.join(task_workspace, rel_path)
                    try:
                        dest_path = WorkspaceManager.transfer_artifact(
                            src_path,
                            dest_dir,
                            task_id,
                            item_skill_name
                        )
                        # Get file extension for file-type field
                        file_ext = pathlib.Path(rel_path).suffix.lower().lstrip('.')
                        if not file_ext:
                            file_ext = "unknown"

                        transferred_files.append({
                            "type": "file",
                            "file-type": file_ext,
                            "path": dest_path
                        })
                    except Exception as e:
                        print(f"[WorkspaceManager] Warning: Failed to transfer {src_path}: {e}")

            # Update result with transferred file paths
            if transferred_files:
                result["output_files"] = transferred_files
            # If no files were transferred but result had output_files pointing to workspace,
            # those files are now lost (workspace cleaned), so remove stale references
            elif "output_files" in result:
                # Check if any output_files point to workspace
                workspace_files = [f for f in result["output_files"]
                                 if isinstance(f, str) and workspace_dir in f]
                if workspace_files:
                    # Remove stale workspace references
                    if transferred_files:
                        result["output_files"] = transferred_files
                    else:
                        # No files transferred, but we had workspace files that are now gone
                        result["output_files"] = []

        # NOTE: Workspace cleanup is now handled at task level (TaskWorkspaceHook)
        # to support inter-skill file dependencies during task execution.
        # ===========================================

        # ============ 新增：强制验证 OutputBuilder 格式 ============
        if not isinstance(result, dict) or 'result_type' not in result or 'content' not in result:
            raise ValueError(
                f"Skill {skill_name} MUST return OutputBuilder format: "
                f"{{result_type, success, content, metadata}}. "
                f"Got: {type(result)}"
            )
        # =========================================================

        # 创建结构化输出目录
        import json
        import uuid
        output_dir = '/tmp/motia-sandbox/structured_outputs'
        os.makedirs(output_dir, exist_ok=True)

        # 获取 sessionId
        sessionId = context.metadata.get('sessionId') or session_id or 'unknown'

        # 为每个 skill 调用生成唯一的文件名，包含 skill 名称和随机 ID
        # 这样多个 skill 在一轮执行中就不会覆盖彼此的输出
        unique_id = str(uuid.uuid4())[:8]
        output_file = os.path.join(output_dir, f'output_{sessionId}_{skill_name}_{unique_id}.json')

        # 写入结构化输出到文件
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        # 输出文件路径标记（唯一需要的 stdout 输出）
        print(f"[STRUCTURED_OUTPUT] {output_file}")

        return result

    async def close(self):
        """Close hook resources."""
        # 关闭所有 hook 的资源
        for hook in self.hook_manager.hooks:
            if hasattr(hook, 'close') and callable(getattr(hook, 'close')):
                try:
                    await hook.close()
                except Exception as e:
                    print(f"[SkillHookExecutor] Error closing hook: {e}")
