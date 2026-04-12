"""
Workspace Manager for Task and Skill Artifacts

Manages task-level workspace creation, cleanup, and artifact scanning.
All tasks (workflow steps or single tasks) share a task-level workspace.
"""
import os
import shutil
import pathlib
from typing import Dict, List, Optional, Tuple


class WorkspaceManager:
    """管理 Task Level workspace 的创建、清理和产物扫描"""

    WORKSPACE_ROOT = "/tmp/myagent-workspace"  # ✅ 统一为绝对路径

    # 文件类型映射
    ARTIFACT_TYPES: Dict[str, List[str]] = {
        "videos": [".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv"],
        "images": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
        "audios": [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"],
        "codes": [
            ".py", ".js", ".ts", ".jsx", ".tsx",
            ".json", ".yaml", ".yml", ".toml", ".xml",
            ".html", ".css", ".md", ".sh", ".sql",
            ".txt", ".csv", ".tsv", ".ini", ".cfg", ".conf"
        ],
    }

    # 跳过的文件模式
    SKIP_PATTERNS: List[str] = [
        "*.tmp", "*~", ".DS_Store", "__pycache__", "*.pyc",
        "node_modules", ".git", "*.log"
    ]

    @staticmethod
    def get_task_workspace(task_id: str) -> str:
        """
        获取 Task Level workspace 路径（所有 skills 共享）

        Args:
            task_id: Task identifier

        Returns:
            绝对路径，格式为 /tmp/myagent-workspace/{task_id}/
        """
        return os.path.join(WorkspaceManager.WORKSPACE_ROOT, task_id)

    @staticmethod
    def create_task_workspace(task_id: str) -> str:
        """
        创建 Task Level workspace

        Args:
            task_id: Task identifier

        Returns:
            绝对路径，格式为 /tmp/myagent-workspace/{task_id}/
        """
        workspace_dir = WorkspaceManager.get_task_workspace(task_id)
        print(f"[WorkspaceManager] Creating task workspace: {workspace_dir}")
        os.makedirs(workspace_dir, exist_ok=True)
        print(f"[WorkspaceManager] ✓ Task workspace created: {workspace_dir}")
        return workspace_dir

    @staticmethod
    def get_skill_workspace(task_id: str, skill_name: str) -> str:
        """
        获取 Skill Level workspace 路径（可选，用于 skill 私有文件）

        Note: 大多数情况下应该使用 task workspace，skill workspace 只用于
              skill 需要私有临时文件的场景

        Args:
            task_id: Task identifier
            skill_name: Name of the skill

        Returns:
            绝对路径，格式为 /tmp/myagent-workspace/{task_id}/{skill_name}/
        """
        task_workspace = WorkspaceManager.get_task_workspace(task_id)
        return os.path.join(task_workspace, skill_name)

    @staticmethod
    def create_workspace(task_id: str, skill_name: str) -> str:
        """
        创建 workspace 目录

        Args:
            task_id: Task identifier
            skill_name: Name of the skill

        Returns:
            Absolute path to created workspace directory
        """
        workspace_dir = WorkspaceManager.get_skill_workspace(task_id, skill_name)
        print(f"[WorkspaceManager] Creating workspace directory: {workspace_dir}")
        os.makedirs(workspace_dir, exist_ok=True)
        print(f"[WorkspaceManager] ✓ Workspace created: {workspace_dir}")
        return workspace_dir

    @staticmethod
    def cleanup_task_workspace(task_id: str, force: bool = False) -> bool:
        """
        清理 Task Level workspace

        Args:
            task_id: Task identifier
            force: True=强制清理, False=只清理默认 workspace

        Returns:
            是否成功清理
        """
        try:
            task_workspace = WorkspaceManager.get_task_workspace(task_id)

            # 判断是否为默认 workspace
            is_default = task_workspace.startswith(WorkspaceManager.WORKSPACE_ROOT)

            if not is_default and not force:
                print(f"[WorkspaceManager] Preserving user-specified workspace: {task_workspace}")
                return False

            if os.path.exists(task_workspace):
                print(f"[WorkspaceManager] Cleaning up task workspace: {task_workspace}")
                shutil.rmtree(task_workspace)
                print(f"[WorkspaceManager] ✓ Task workspace cleaned: {task_workspace}")
                return True
            else:
                print(f"[WorkspaceManager] Task workspace does not exist: {task_workspace}")
                return False

        except Exception as e:
            print(f"[WorkspaceManager] Warning: Failed to cleanup workspace: {e}")
            return False

    @staticmethod
    def _should_skip_file(filename: str) -> bool:
        """
        判断文件是否应该被跳过

        Args:
            filename: Name of the file

        Returns:
            True if file should be skipped
        """
        for pattern in WorkspaceManager.SKIP_PATTERNS:
            if filename.endswith(pattern.replace("*", "")) or filename == pattern:
                return True
        return False

    @staticmethod
    def _get_artifact_type(filename: str) -> Optional[str]:
        """
        根据文件扩展名获取产物类型

        Args:
            filename: Name of the file

        Returns:
            Artifact type (videos/images/audios/codes) or None
        """
        ext = pathlib.Path(filename).suffix.lower()
        for artifact_type, extensions in WorkspaceManager.ARTIFACT_TYPES.items():
            if ext in extensions:
                return artifact_type
        return None

    @staticmethod
    def scan_task_artifacts(task_id: str) -> Dict[str, List[str]]:
        """
        扫描 Task Level workspace 中的产物文件，按类型分类

        Args:
            task_id: Task identifier

        Returns:
            Dict mapping artifact types to lists of relative file paths
        """
        task_workspace = WorkspaceManager.get_task_workspace(task_id)
        return WorkspaceManager.scan_artifacts(task_workspace)

    @staticmethod
    def scan_artifacts(workspace_dir: str) -> Dict[str, List[str]]:
        """
        扫描 workspace 中的产物文件，按类型分类

        Args:
            workspace_dir: Path to workspace directory

        Returns:
            Dict mapping artifact types to lists of relative file paths
        """
        if not os.path.exists(workspace_dir):
            return {}

        artifacts: Dict[str, List[str]] = {
            "videos": [],
            "images": [],
            "audios": [],
            "codes": [],
        }

        for root, dirs, files in os.walk(workspace_dir):
            # 过滤掉需要跳过的目录
            dirs[:] = [d for d in dirs if not WorkspaceManager._should_skip_file(d)]

            for filename in files:
                if WorkspaceManager._should_skip_file(filename):
                    continue

                artifact_type = WorkspaceManager._get_artifact_type(filename)
                if artifact_type and artifact_type in artifacts:
                    # 获取相对于 workspace_dir 的路径
                    full_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(full_path, workspace_dir)
                    artifacts[artifact_type].append(rel_path)

        # 移除空列表
        return {k: v for k, v in artifacts.items() if v}

    @staticmethod
    def transfer_artifact(
        src: str,
        dest_dir: str,
        task_id: str,
        skill_name: str
    ) -> str:
        """
        转移产物文件到 outputs/ 目录

        Args:
            src: Source file path
            dest_dir: Destination directory (e.g., "outputs/videos")
            task_id: Task identifier for naming
            skill_name: Skill name for naming

        Returns:
            Path to transferred file
        """
        os.makedirs(dest_dir, exist_ok=True)

        # 提取原始文件名
        original_name = os.path.basename(src)

        # 生成新文件名: {task_id}_{skill_name}_{original_name}
        # 清理 task_id 和 skill_name 中的特殊字符
        safe_task_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in task_id)
        safe_skill_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_name)

        new_filename = f"{safe_task_id}_{safe_skill_name}_{original_name}"
        dest_path = os.path.join(dest_dir, new_filename)

        # 复制文件到目标位置
        shutil.copy2(src, dest_path)

        return dest_path
