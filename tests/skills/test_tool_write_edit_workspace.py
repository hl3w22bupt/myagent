"""
Tests for tool-write and tool-edit skills with workspace integration.

Tests that tool-write and tool-edit correctly use the workspace directory
for file operations.
"""
import pytest
import os
import shutil
from pathlib import Path

# Add skills directory to path
import sys
skills_dir = Path(__file__).parent.parent.parent / "skills"
sys.path.insert(0, str(skills_dir))

from tool_write.handler import execute as execute_write
from tool_edit.handler import execute as execute_edit
from core.skill.hooks.workspace_manager import WorkspaceManager


class TestToolWriteWorkspaceIntegration:
    """Test tool-write integration with workspace."""

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

    def test_write_to_workspace_with_relative_path(self):
        """Test that relative paths are written to workspace."""
        task_id = "write_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Write file with relative path
        result = execute_write({
            "file_path": "test.txt",
            "content": "Hello, workspace!",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True

        # File should be in workspace, not current directory
        workspace_file = os.path.join(workspace_dir, "test.txt")
        assert os.path.exists(workspace_file)
        assert Path(workspace_file).read_text() == "Hello, workspace!"

    def test_write_absolute_path_bypasses_workspace(self):
        """Test that absolute paths bypass workspace."""
        task_id = "write_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create temp file path
        with tempfile.TemporaryDirectory() as temp_dir:
            abs_path = os.path.join(temp_dir, "absolute.txt")

            result = execute_write({
                "file_path": abs_path,
                "content": "Absolute path content",
                "_workspace_dir": workspace_dir
            })

            assert result["success"] is True

            # File should be at absolute path, not in workspace
            assert os.path.exists(abs_path)
            workspace_file = os.path.join(workspace_dir, "absolute.txt")
            assert not os.path.exists(workspace_file)

    def test_write_nested_path_in_workspace(self):
        """Test writing to nested paths within workspace."""
        task_id = "write_nested_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        result = execute_write({
            "file_path": "subdir/nested/file.txt",
            "content": "Nested file content",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True

        # File should be in workspace subdirectory
        nested_file = os.path.join(workspace_dir, "subdir", "nested", "file.txt")
        assert os.path.exists(nested_file)

    def test_write_creates_output_files_metadata(self):
        """Test that tool-write creates output_files metadata."""
        task_id = "write_metadata_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        result = execute_write({
            "file_path": "output.txt",
            "content": "Test content",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True
        assert "output_files" in result

    def test_write_different_file_types(self):
        """Test writing different file types to workspace."""
        task_id = "write_types_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        file_types = [
            ("script.py", "print('hello')", "code"),
            ("config.json", '{"key": "value"}', "code"),
            ("style.css", "body { margin: 0; }", "code"),
        ]

        for filename, content, _ in file_types:
            result = execute_write({
                "file_path": filename,
                "content": content,
                "_workspace_dir": workspace_dir
            })

            assert result["success"] is True

            # Verify file exists in workspace
            workspace_file = os.path.join(workspace_dir, filename)
            assert os.path.exists(workspace_file)


class TestToolEditWorkspaceIntegration:
    """Test tool-edit integration with workspace."""

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

    def test_edit_file_in_workspace(self):
        """Test editing a file in workspace."""
        task_id = "edit_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # First create a file
        test_file = os.path.join(workspace_dir, "test.txt")
        Path(test_file).write_text("Hello World")

        # Edit the file
        result = execute_edit({
            "file_path": "test.txt",
            "old_string": "Hello World",
            "new_string": "Hello, Workspace!",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True

        # Verify edit
        assert Path(test_file).read_text() == "Hello, Workspace!"

    def test_edit_nested_file_in_workspace(self):
        """Test editing a nested file in workspace."""
        task_id = "edit_nested_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create nested file
        nested_dir = os.path.join(workspace_dir, "subdir")
        os.makedirs(nested_dir)
        test_file = os.path.join(nested_dir, "config.json")
        Path(test_file).write_text('{"debug": false}')

        # Edit the file
        result = execute_edit({
            "file_path": "subdir/config.json",
            "old_string": "false",
            "new_string": "true",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True
        assert '"debug": true' in Path(test_file).read_text()

    def test_edit_absolute_path_bypasses_workspace(self):
        """Test that absolute paths bypass workspace."""
        task_id = "edit_absolute_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create file in temp directory
        with tempfile.TemporaryDirectory() as temp_dir:
            abs_file = os.path.join(temp_dir, "absolute.txt")
            Path(abs_file).write_text("Original content")

            # Edit with absolute path
            result = execute_edit({
                "file_path": abs_file,
                "old_string": "Original content",
                "new_string": "Modified content",
                "_workspace_dir": workspace_dir
            })

            assert result["success"] is True
            assert Path(abs_file).read_text() == "Modified content"

    def test_edit_creates_output_files_metadata(self):
        """Test that tool-edit creates output_files metadata."""
        task_id = "edit_metadata_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create file
        test_file = os.path.join(workspace_dir, "test.txt")
        Path(test_file).write_text("Original")

        # Edit
        result = execute_edit({
            "file_path": "test.txt",
            "old_string": "Original",
            "new_string": "Modified",
            "_workspace_dir": workspace_dir
        })

        assert result["success"] is True
        assert "output_files" in result


class TestWriteEditArtifactDetection:
    """Test that files written/edited are detected as artifacts."""

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

    def test_written_code_files_detected(self):
        """Test that written code files are detected as artifacts."""
        task_id = "write_code_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Write various code files
        code_files = [
            "script.py",
            "module.ts",
            "config.json",
            "styles.css"
        ]

        for filename in code_files:
            execute_write({
                "file_path": filename,
                "content": f"# {filename}",
                "_workspace_dir": workspace_dir
            })

        # Scan artifacts
        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # All should be detected as code
        assert len(artifacts["codes"]) == len(code_files)

    def test_edited_files_preserve_type(self):
        """Test that edited files maintain their artifact type."""
        task_id = "edit_type_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create and edit a Python file
        test_file = os.path.join(workspace_dir, "script.py")
        Path(test_file).write_text("print('old')")

        execute_edit({
            "file_path": "script.py",
            "old_string": "old",
            "new_string": "new",
            "_workspace_dir": workspace_dir
        })

        # Scan artifacts
        artifacts = WorkspaceManager.scan_artifacts(workspace_dir)

        # Should still be detected as code
        assert "script.py" in artifacts["codes"]


class TestWriteEditWithEnvironmentVariable:
    """Test that MOTIA_WORKSPACE_DIR environment variable is used as fallback."""

    def setup_method(self):
        """Setup test fixtures."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

        # Save original environment
        self.original_env = os.environ.get('MOTIA_WORKSPACE_DIR')

    def teardown_method(self):
        """Clean up after tests."""
        if os.path.exists(WorkspaceManager.WORKSPACE_ROOT):
            shutil.rmtree(WorkspaceManager.WORKSPACE_ROOT)
        if os.path.exists("outputs"):
            shutil.rmtree("outputs")

        # Restore environment
        if self.original_env is not None:
            os.environ['MOTIA_WORKSPACE_DIR'] = self.original_env
        else:
            os.environ.pop('MOTIA_WORKSPACE_DIR', None)

    def test_tool_write_uses_environment_variable(self):
        """Test that tool-write uses MOTIA_WORKSPACE_DIR when available."""
        task_id = "env_write_test"
        skill_name = "tool-write"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Set environment variable
        os.environ['MOTIA_WORKSPACE_DIR'] = workspace_dir

        try:
            # Write without passing _workspace_dir
            result = execute_write({
                "file_path": "env_test.txt",
                "content": "Environment variable test"
            })

            assert result["success"] is True

            # File should be in workspace
            env_file = os.path.join(workspace_dir, "env_test.txt")
            assert os.path.exists(env_file)
        finally:
            # Clean up environment
            if self.original_env is not None:
                os.environ['MOTIA_WORKSPACE_DIR'] = self.original_env
            else:
                os.environ.pop('MOTIA_WORKSPACE_DIR', None)

    def test_tool_edit_uses_environment_variable(self):
        """Test that tool-edit uses MOTIA_WORKSPACE_DIR when available."""
        task_id = "env_edit_test"
        skill_name = "tool-edit"
        workspace_dir = WorkspaceManager.create_workspace(task_id, skill_name)

        # Create test file
        test_file = os.path.join(workspace_dir, "env_edit.txt")
        Path(test_file).write_text("Original")

        # Set environment variable
        os.environ['MOTIA_WORKSPACE_DIR'] = workspace_dir

        try:
            # Edit without passing _workspace_dir
            result = execute_edit({
                "file_path": "env_edit.txt",
                "old_string": "Original",
                "new_string": "Modified"
            })

            assert result["success"] is True
            assert Path(test_file).read_text() == "Modified"
        finally:
            # Clean up environment
            if self.original_env is not None:
                os.environ['MOTIA_WORKSPACE_DIR'] = self.original_env
            else:
                os.environ.pop('MOTIA_WORKSPACE_DIR', None)


# Import tempfile here
import tempfile
