"""
Integration tests for workspace artifact management in SkillHookExecutor

Tests the complete workflow of workspace creation, skill execution, artifact scanning,
and cleanup.
"""
import pytest
import asyncio
import os
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, patch

from core.skill.hooks.executor import SkillHookExecutor
from core.skill.hooks.workspace_manager import WorkspaceManager
from core.skill.output_builder import OutputBuilder


def async_test(func):
    """Decorator to run async test functions."""
    def wrapper(self, *args, **kwargs):
        return asyncio.run(func(self, *args, **kwargs))
    return wrapper


class TestWorkspaceLifecycle:
    """Test workspace lifecycle in SkillHookExecutor."""

    def setup_method(self):
        """Setup test fixtures."""
        # Clean up workspace root
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        # Clean up outputs
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    @async_test
    async def test_workspace_created_before_skill_execution(self):
        """Test that workspace is created before skill execution."""
        executor = SkillHookExecutor()
        task_id = "test_task_123"
        skill_name = "test-skill"

        # Track if workspace was created
        workspace_created = False
        original_create = WorkspaceManager.create_workspace

        def mock_create(tid, sname):
            nonlocal workspace_created
            if tid == task_id and sname == skill_name:
                workspace_created = True
            return original_create(tid, sname)

        with patch.object(WorkspaceManager, 'create_workspace', side_effect=mock_create):
            async def skill_func(input_data):
                # Workspace should be created by now
                assert workspace_created
                assert "_workspace_dir" in input_data
                return OutputBuilder().set_text("Success").build()

            await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        assert workspace_created

    @async_test
    async def test_workspace_dir_passed_to_skill(self):
        """Test that workspace directory is passed to skill via input_data."""
        executor = SkillHookExecutor()
        task_id = "test_task_123"
        skill_name = "test-skill"

        received_workspace_dir = None

        async def skill_func(input_data):
            nonlocal received_workspace_dir
            received_workspace_dir = input_data.get("_workspace_dir")
            return OutputBuilder().set_text("Success").build()

        await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        assert received_workspace_dir is not None
        assert "tmp-workspace" in received_workspace_dir
        assert task_id in received_workspace_dir
        assert skill_name in received_workspace_dir

    @async_test
    async def test_workspace_cleanup_after_execution(self):
        """Test that workspace is cleaned up after skill execution."""
        executor = SkillHookExecutor()
        task_id = "test_task_123"
        skill_name = "test-skill"

        workspace_dir = None

        async def skill_func(input_data):
            nonlocal workspace_dir
            workspace_dir = input_data.get("_workspace_dir")
            # Create a test file in workspace
            Path(workspace_dir).mkdir(parents=True, exist_ok=True)
            test_file = os.path.join(workspace_dir, "test.txt")
            Path(test_file).write_text("test content")
            return OutputBuilder().set_text("Success").build()

        await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Workspace should be cleaned up
        assert not os.path.exists(workspace_dir)

    @async_test
    async def test_environment_variable_set(self):
        """Test that MOTIA_WORKSPACE_DIR environment variable is set."""
        executor = SkillHookExecutor()
        task_id = "test_task_123"
        skill_name = "test-skill"

        received_env_var = None

        async def skill_func(input_data):
            nonlocal received_env_var
            received_env_var = os.getenv('MOTIA_WORKSPACE_DIR')
            return OutputBuilder().set_text("Success").build()

        await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        assert received_env_var is not None
        assert "tmp-workspace" in received_env_var


class TestArtifactScanningAndTransfer:
    """Test artifact scanning and transfer functionality."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    @async_test
    async def test_video_file_detected_and_transferred(self):
        """Test that video files created in workspace are detected and transferred."""
        executor = SkillHookExecutor()
        task_id = "video_test"
        skill_name = "video-generator"

        workspace_dir = None

        async def skill_func(input_data):
            nonlocal workspace_dir
            workspace_dir = input_data.get("_workspace_dir")

            # Create a video file in workspace
            video_path = os.path.join(workspace_dir, "output.mp4")
            Path(video_path).write_text("fake video content")

            return OutputBuilder().set_text("Video created").build()

        result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Check that file was transferred to outputs/videos/
        expected_dir = "outputs/videos"
        assert os.path.exists(expected_dir)

        # Find the transferred file
        videos = list(Path(expected_dir).glob("*.mp4"))
        assert len(videos) >= 1

        # Check filename format
        filename = videos[0].name
        assert task_id in filename
        assert skill_name in filename

    @async_test
    async def test_multiple_file_types_transferred(self):
        """Test that multiple file types are correctly categorized and transferred."""
        executor = SkillHookExecutor()
        task_id = "multi_test"
        skill_name = "multi-generator"

        async def skill_func(input_data):
            workspace_dir = input_data.get("_workspace_dir")

            # Create different file types
            files = {
                "video.mp4": "video",
                "image.png": "image",
                "audio.mp3": "audio",
                "script.py": "code"
            }

            for filename, content in files.items():
                filepath = os.path.join(workspace_dir, filename)
                Path(filepath).write_text(content)

            return OutputBuilder().set_text("Multi files created").build()

        result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Check that all files were transferred to correct directories
        assert os.path.exists("outputs/videos")
        assert os.path.exists("outputs/images")
        assert os.path.exists("outputs/audios")
        assert os.path.exists("outputs/codes")

    @async_test
    async def test_nested_files_in_workspace(self):
        """Test handling of files in nested subdirectories."""
        executor = SkillHookExecutor()
        task_id = "nested_test"
        skill_name = "nested-skill"

        async def skill_func(input_data):
            workspace_dir = input_data.get("_workspace_dir")

            # Create nested directory structure
            subdir = os.path.join(workspace_dir, "assets", "videos")
            os.makedirs(subdir, exist_ok=True)

            video_path = os.path.join(subdir, "nested.mp4")
            Path(video_path).write_text("nested video content")

            return OutputBuilder().set_text("Nested file created").build()

        result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Check that nested file was found and transferred
        videos_dir = "outputs/videos"
        assert os.path.exists(videos_dir)

        videos = list(Path(videos_dir).glob("*.mp4"))
        assert len(videos) >= 1


class TestOutputFilesCompatibility:
    """Test compatibility with explicit output_files."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    @async_test
    async def test_explicit_output_files_takes_priority(self):
        """Test that explicit output_files in result takes priority over scanning."""
        executor = SkillHookExecutor()
        task_id = "priority_test"
        skill_name = "priority-skill"

        workspace_dir = None
        workspace_scanned = False

        async def skill_func(input_data):
            nonlocal workspace_dir
            workspace_dir = input_data.get("_workspace_dir")

            # Create files in workspace
            test_file = os.path.join(workspace_dir, "should_be_ignored.mp4")
            Path(test_file).write_text("this file should be ignored")

            # Return explicit output_files
            return OutputBuilder() \
                .set_text("Success") \
                .set_metadata("output_files", ["/explicit/path/file.mp4"]) \
                .build()

        result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Check that explicit output_files is preserved
        assert "output_files" in result
        assert result["output_files"] == ["/explicit/path/file.mp4"]

    @async_test
    async def test_no_scanning_when_output_files_present(self):
        """Test that workspace scanning is skipped when output_files is already set."""
        executor = SkillHookExecutor()
        task_id = "skip_scan_test"
        skill_name = "skip-skill"

        async def skill_func(input_data):
            workspace_dir = input_data.get("_workspace_dir")

            # Create files in workspace
            test_file = os.path.join(workspace_dir, "video.mp4")
            Path(test_file).write_text("video content")

            # Return result with output_files already set
            return {
                "result_type": "text",
                "success": True,
                "content": "Success",
                "output_files": ["/explicit/video.mp4"]
            }

        result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Explicit output_files should be preserved
        assert result["output_files"] == ["/explicit/video.mp4"]


class TestMultiTurnConversation:
    """Test workspace cleanup in multi-turn conversations."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    @async_test
    async def test_multiple_turns_with_cleanup(self):
        """Test that workspace is cleaned up after each turn."""
        executor = SkillHookExecutor()

        task_id = "multi_turn_test"
        skill_name = "test-skill"

        workspace_dirs = []

        for turn in range(3):
            async def skill_func(input_data):
                workspace_dir = input_data.get("_workspace_dir")
                workspace_dirs.append(workspace_dir)

                # Create a file in this turn's workspace
                test_file = os.path.join(workspace_dir, f"turn_{len(workspace_dirs)-1}.txt")
                Path(test_file).write_text(f"Turn {len(workspace_dirs)-1} content")

                return OutputBuilder().set_text(f"Turn {len(workspace_dirs)-1}").build()

            await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

            # Previous workspace should be cleaned up
            if len(workspace_dirs) > 1:
                assert not os.path.exists(workspace_dirs[-2])

        # Final workspace should also be cleaned up
        for workspace_dir in workspace_dirs:
            assert not os.path.exists(workspace_dir)

    @async_test
    async def test_different_tasks_independent_workspaces(self):
        """Test that different tasks get independent workspaces."""
        executor = SkillHookExecutor()
        skill_name = "test-skill"

        task_1_id = "task_1"
        task_2_id = "task_2"

        workspace_1_dir = None
        workspace_2_dir = None

        # Execute task 1
        async def skill_func_1(input_data):
            nonlocal workspace_1_dir
            workspace_1_dir = input_data.get("_workspace_dir")
            Path(os.path.join(workspace_1_dir, "file1.txt")).write_text("Task 1")
            return OutputBuilder().set_text("Task 1").build()

        await executor.execute_with_hooks(skill_name, skill_func_1, {"task_id": task_1_id})

        # Execute task 2
        async def skill_func_2(input_data):
            nonlocal workspace_2_dir
            workspace_2_dir = input_data.get("_workspace_dir")
            Path(os.path.join(workspace_2_dir, "file2.txt")).write_text("Task 2")
            return OutputBuilder().set_text("Task 2").build()

        await executor.execute_with_hooks(skill_name, skill_func_2, {"task_id": task_2_id})

        # Workspaces should be different
        assert workspace_1_dir != workspace_2_dir
        assert task_1_id in workspace_1_dir
        assert task_2_id in workspace_2_dir


class TestErrorHandling:
    """Test error handling in workspace lifecycle."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    @async_test
    async def test_cleanup_failure_doesnt_affect_result(self):
        """Test that cleanup failure doesn't affect the skill result."""
        executor = SkillHookExecutor()
        task_id = "cleanup_fail_test"
        skill_name = "test-skill"

        workspace_dir = None

        async def skill_func(input_data):
            nonlocal workspace_dir
            workspace_dir = input_data.get("_workspace_dir")
            Path(workspace_dir).mkdir(parents=True, exist_ok=True)

            return OutputBuilder().set_text("Success").build()

        # Mock cleanup to fail but not raise
        original_cleanup = WorkspaceManager.cleanup_workspace

        def mock_cleanup(*args, **kwargs):
            # Silently fail
            pass

        with patch.object(WorkspaceManager, 'cleanup_workspace', side_effect=mock_cleanup):
            result = await executor.execute_with_hooks(skill_name, skill_func, {"task_id": task_id})

        # Result should still be successful
        assert result["success"] is True

    @async_test
    async def test_skill_exception_still_cleans_workspace(self):
        """Test that workspace is cleaned up even when skill raises exception."""
        executor = SkillHookExecutor()
        task_id = "exception_test"
        skill_name = "test-skill"

        workspace_dir = None

        async def failing_skill(input_data):
            nonlocal workspace_dir
            workspace_dir = input_data.get("_workspace_dir")
            Path(workspace_dir).mkdir(parents=True, exist_ok=True)

            raise ValueError("Skill failed!")

        result = await executor.execute_with_hooks(skill_name, failing_skill, {"task_id": task_id})

        # Workspace should still be cleaned up
        assert not os.path.exists(workspace_dir)

        # Result should indicate error
        assert result["success"] is False
