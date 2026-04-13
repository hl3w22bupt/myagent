"""
Unit tests for WorkspaceManager

Tests workspace creation, artifact scanning, and cleanup functionality.
"""
import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import patch

from core.skill.hooks.workspace_manager import WorkspaceManager


class TestWorkspaceManager:
    """Test WorkspaceManager class."""

    def setup_method(self):
        """Setup test fixtures before each test method."""
        # Clean up any existing test workspace
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)

    def teardown_method(self):
        """Clean up after each test method."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)

    def test_workspace_root_constant(self):
        """Test that WORKSPACE_ROOT is set correctly."""
        assert WorkspaceManager.WORKSPACE_ROOT == "/tmp/myagent-workspace"

    def test_artifact_types_mapping(self):
        """Test that ARTIFACT_TYPES contains correct mappings."""
        assert "videos" in WorkspaceManager.ARTIFACT_TYPES
        assert "images" in WorkspaceManager.ARTIFACT_TYPES
        assert "audios" in WorkspaceManager.ARTIFACT_TYPES
        assert "codes" in WorkspaceManager.ARTIFACT_TYPES

        # Check some common extensions
        assert ".mp4" in WorkspaceManager.ARTIFACT_TYPES["videos"]
        assert ".png" in WorkspaceManager.ARTIFACT_TYPES["images"]
        assert ".mp3" in WorkspaceManager.ARTIFACT_TYPES["audios"]
        assert ".py" in WorkspaceManager.ARTIFACT_TYPES["codes"]

    def test_get_skill_workspace(self):
        """Test get_skill_workspace returns correct path."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        expected = os.path.join("/tmp/myagent-workspace", task_id, skill_name)

        result = WorkspaceManager.get_skill_workspace(task_id, skill_name)

        assert result == expected

    def test_create_workspace_creates_directory(self):
        """Test that create_workspace creates the directory."""
        task_id = "test_task_123"
        skill_name = "test-skill"

        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        assert os.path.exists(workspace_dir)
        assert os.path.isdir(workspace_dir)

    def test_create_workspace_returns_absolute_path(self):
        """Test that create_workspace returns absolute path."""
        task_id = "test_task_123"
        skill_name = "test-skill"

        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Should be an absolute path under /tmp/myagent-workspace
        assert isinstance(workspace_dir, str)
        assert os.path.isabs(workspace_dir)
        assert workspace_dir == os.path.join("/tmp/myagent-workspace", task_id, skill_name)

    def test_cleanup_workspace_removes_directory(self):
        """Test that cleanup_task_workspace removes the directory."""
        task_id = "test_task_123"
        skill_name = "test-skill"

        # Create workspace first
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)
        assert os.path.exists(workspace_dir)

        # Cleanup entire task workspace
        WorkspaceManager.cleanup_task_workspace(task_id)

        assert not os.path.exists(workspace_dir)

    def test_cleanup_task_workspace_removes_all_skills(self):
        """Test cleanup_task_workspace removes entire task directory including all skills."""
        task_id = "test_task_123"
        skill_name = "test-skill"

        # Create workspace
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)
        assert os.path.exists(workspace_dir)

        # Cleanup entire task workspace should remove everything
        WorkspaceManager.cleanup_task_workspace(task_id)

        assert not os.path.exists(workspace_dir)
        # Parent task dir should also be gone
        assert not os.path.exists(WorkspaceManager.get_task_workspace(task_id))

    def test_cleanup_nonexistent_workspace_no_error(self):
        """Test that cleaning up non-existent workspace doesn't raise error."""
        # Should not raise any exception
        WorkspaceManager.cleanup_task_workspace("nonexistent_task")

    def test_scan_artifacts_empty_workspace(self):
        """Test scanning empty workspace returns empty dict."""
        task_id = "test_task_123"
        skill_name = "test-skill"

        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)
        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Empty dict or dict with empty lists
        assert isinstance(artifacts, dict)
        for artifact_type in artifacts.values():
            assert isinstance(artifact_type, list)

    def test_scan_artifacts_detects_video_files(self):
        """Test that scan_artifacts correctly identifies video files."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test video files
        test_files = ["video1.mp4", "video2.mov", "video3.avi"]
        for filename in test_files:
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("fake video content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert "videos" in artifacts
        assert len(artifacts["videos"]) == len(test_files)
        for filename in test_files:
            assert filename in artifacts["videos"]

    def test_scan_artifacts_detects_image_files(self):
        """Test that scan_artifacts correctly identifies image files."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test image files
        test_files = ["image1.png", "image2.jpg", "image3.svg"]
        for filename in test_files:
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("fake image content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert "images" in artifacts
        assert len(artifacts["images"]) == len(test_files)

    def test_scan_artifacts_detects_audio_files(self):
        """Test that scan_artifacts correctly identifies audio files."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test audio files
        test_files = ["audio1.mp3", "audio2.wav", "audio3.aac"]
        for filename in test_files:
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("fake audio content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert "audios" in artifacts
        assert len(artifacts["audios"]) == len(test_files)

    def test_scan_artifacts_detects_code_files(self):
        """Test that scan_artifacts correctly identifies code files."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test code files
        test_files = ["script.py", "config.json", "style.css"]
        for filename in test_files:
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("fake code content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert "codes" in artifacts
        assert len(artifacts["codes"]) == len(test_files)

    def test_scan_artifacts_mixed_file_types(self):
        """Test scanning workspace with mixed file types."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create mixed files
        files = {
            "video": ["output.mp4"],
            "images": ["thumb.png", "poster.jpg"],
            "codes": ["script.sh", "config.json"]
        }

        for file_type, filenames in files.items():
            for filename in filenames:
                filepath = os.path.join(workspace_dir, filename)
                Path(filepath).write_text(f"fake {file_type} content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert len(artifacts["videos"]) == 1
        assert len(artifacts["images"]) == 2
        assert len(artifacts["codes"]) == 2

    def test_scan_artifacts_skips_temporary_files(self):
        """Test that scan_artifacts skips temporary and cache files."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create files that should be skipped
        skip_files = [
            "test.tmp", "backup~", ".DS_Store",
            "__pycache__/test.pyc", "node_modules/package.js"
        ]

        for filename in skip_files:
            if "/" in filename:
                # Create directory structure
                dir_part, file_part = filename.rsplit("/", 1)
                dir_path = os.path.join(workspace_dir, dir_part)
                os.makedirs(dir_path, exist_ok=True)
                filepath = os.path.join(dir_path, file_part)
            else:
                filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("temp content")

        # Create one valid file
        valid_file = os.path.join(workspace_dir, "valid.mp4")
        Path(valid_file).write_text("video content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Should only find the valid file
        assert len(artifacts["videos"]) == 1
        assert "valid.mp4" in artifacts["videos"]

    def test_scan_artifacts_recursive(self):
        """Test that scan_artifacts scans subdirectories recursively."""
        task_id = "test_task_123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create subdirectory with files
        subdir = os.path.join(workspace_dir, "subdir", "nested")
        os.makedirs(subdir, exist_ok=True)

        nested_file = os.path.join(subdir, "nested_video.mp4")
        Path(nested_file).write_text("nested video")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Should find the nested file
        assert len(artifacts["videos"]) == 1
        # Path should be relative to workspace_dir
        assert any("nested_video.mp4" in f for f in artifacts["videos"])

    def test_scan_artifacts_nonexistent_workspace(self):
        """Test scanning non-existent workspace returns empty dict."""
        artifacts = WorkspaceManager.scan_artifacts("/nonexistent/path")
        assert artifacts == {}

    def test_transfer_artifact_creates_output_directory(self):
        """Test that transfer_artifact creates destination directory."""
        task_id = "test_task"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test file
        src_file = os.path.join(workspace_dir, "test.mp4")
        Path(src_file).write_text("video content")

        # Transfer to outputs/videos (directory may not exist)
        dest_dir = "outputs/videos"
        dest_path = WorkspaceManager.transfer_artifact(
            src_file, dest_dir, task_id, skill_name
        )

        assert os.path.exists(dest_dir)
        assert os.path.exists(dest_path)

    def test_transfer_artifact_naming_convention(self):
        """Test that transfer_artifact uses correct naming convention."""
        task_id = "test-task-123"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test file
        src_file = os.path.join(workspace_dir, "original.mp4")
        Path(src_file).write_text("video content")

        dest_dir = "outputs/videos"
        dest_path = WorkspaceManager.transfer_artifact(
            src_file, dest_dir, task_id, skill_name
        )

        # Check filename format: {task_id}_{skill_name}_{original_name}
        filename = os.path.basename(dest_path)
        assert filename.startswith(f"{task_id}_{skill_name}_")
        assert filename.endswith("original.mp4")

    def test_transfer_artifact_sanitizes_special_characters(self):
        """Test that transfer_artifact sanitizes special characters in task_id and skill_name."""
        task_id = "test/task@123#"
        skill_name = "skill.name!"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test file
        src_file = os.path.join(workspace_dir, "test.mp4")
        Path(src_file).write_text("video content")

        dest_dir = "outputs/videos"
        dest_path = WorkspaceManager.transfer_artifact(
            src_file, dest_dir, task_id, skill_name
        )

        # Special characters should be replaced with underscores
        filename = os.path.basename(dest_path)
        assert "/" not in filename
        assert "@" not in filename
        assert "#" not in filename
        assert "." not in filename.split("_")[1]  # skill name part

    def test_transfer_artifact_copies_file(self):
        """Test that transfer_artifact copies (not moves) the file."""
        task_id = "test_task"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test file
        src_file = os.path.join(workspace_dir, "test.mp4")
        original_content = "video content"
        Path(src_file).write_text(original_content)

        dest_dir = "outputs/videos"
        dest_path = WorkspaceManager.transfer_artifact(
            src_file, dest_dir, task_id, skill_name
        )

        # Original file should still exist
        assert os.path.exists(src_file)

        # Destination file should exist with same content
        assert os.path.exists(dest_path)
        assert Path(dest_path).read_text() == original_content

    def test_full_workflow(self):
        """Test the full workspace workflow: create, produce files, scan, transfer, cleanup."""
        task_id = "full_workflow_test"
        skill_name = "test-bash"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Simulate skill execution creating various files
        test_files = {
            "output.mp4": "video content",
            "thumb.png": "image content",
            "script.sh": "script content",
            "data.json": "json content"
        }

        for filename, content in test_files.items():
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text(content)

        # Scan artifacts
        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Verify all files were found and classified correctly
        assert "videos" in artifacts
        assert "images" in artifacts
        assert "codes" in artifacts

        # Transfer files
        transferred = []
        for artifact_type, files in artifacts.items():
            for rel_path in files:
                src = os.path.join(workspace_dir, rel_path)
                dest_dir = f"outputs/{artifact_type}"
                dest = WorkspaceManager.transfer_artifact(src, dest_dir, task_id, skill_name)
                transferred.append(dest)

        # Verify all files were transferred
        assert len(transferred) == len(test_files)
        for dest_path in transferred:
            assert os.path.exists(dest_path)

        # Cleanup workspace
        WorkspaceManager.cleanup_task_workspace(task_id)

        # Verify workspace is cleaned
        assert not os.path.exists(workspace_dir)

        # But outputs should still exist
        for dest_path in transferred:
            assert os.path.exists(dest_path)


class TestWorkspaceManagerFileTypeDetection:
    """Test file type detection edge cases."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

    def test_unknown_extension_not_categorized(self):
        """Test that files with unknown extensions are not categorized."""
        task_id = "test_task"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create file with unknown extension
        unknown_file = os.path.join(workspace_dir, "file.unknownext")
        Path(unknown_file).write_text("content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Unknown extension should not appear in any category
        total_files = sum(len(files) for files in artifacts.values())
        assert total_files == 0

    def test_case_insensitive_extension_matching(self):
        """Test that extension matching is case-insensitive."""
        task_id = "test_task"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create files with uppercase extensions
        test_files = ["video.MP4", "image.PNG", "audio.MP3"]
        for filename in test_files:
            filepath = os.path.join(workspace_dir, filename)
            Path(filepath).write_text("content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        assert len(artifacts["videos"]) == 1
        assert len(artifacts["images"]) == 1
        assert len(artifacts["audios"]) == 1

    def test_files_without_extension(self):
        """Test handling of files without extensions."""
        task_id = "test_task"
        skill_name = "test-skill"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create file without extension
        no_ext_file = os.path.join(workspace_dir, "README")
        Path(no_ext_file).write_text("content")

        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # File without extension should not be categorized
        total_files = sum(len(files) for files in artifacts.values())
        assert total_files == 0
