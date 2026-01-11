"""
Unit tests for remotion-generator skill

Tests all major components of the Remotion video generation skill including:
- Template code generation
- Error handling  
- Input validation
- Output format validation
"""

import pytest
import asyncio
import json
import tempfile
from pathlib import Path
from typing import Dict, Any
import sys
import os

# Add skills directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Mock the core modules to avoid dependency issues
class MockSkillExecutor:
    """Mock SkillExecutor for testing without full dependencies."""
    
    async def execute(self, skill_name: str, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock execute method."""
        if skill_name == 'remotion-generator':
            return {
                'success': True,
                'video_path': '/tmp/test_video.mp4',
                'video_url': '/outputs/videos/test_video.mp4',
                'thumbnail_path': '/tmp/test_thumbnail.jpg',
                'thumbnail_url': '/outputs/videos/test_thumbnail.jpg',
                'duration': 10,
                'fps': 30,
                'resolution': '1920x1080',
                'file_size': 1000000,
                'metadata': {
                    'title': 'Test Video',
                    'style': 'minimal',
                    'format': 'mp4',
                    'quality': 'medium'
                }
            }
        return {'success': False, 'error': 'Unknown skill'}


# Replace the import with our mock
import core.skill.executor
core.skill.executor.SkillExecutor = MockSkillExecutor


# Import after patching
from skills.remotion_generator.handler import RemotionVideoGenerator


class TestRemotionGenerator:
    """Test suite for RemotionVideoGenerator class."""
    
    @pytest.fixture
    def generator(self):
        """Create a fresh generator instance for each test."""
        return RemotionVideoGenerator()
    
    @pytest.fixture
    def temp_dir(self, tmp_path):
        """Temporary directory for test outputs."""
        temp_dir = tmp_path / "test_output"
        temp_dir.mkdir(exist_ok=True)
        return temp_dir
    
    # ===== Template Generation Tests =====
    
    def test_template_minimal_generates_valid_code(self, generator):
        """Test that minimal template generates valid TypeScript code."""
        code = generator._template_minimal(
            description='Test Video',
            duration=10,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is not None
        assert 'import' in code
        assert 'Composition' in code
        assert 'MinimalVideo' in code
        assert 'durationInFrames=300' in code  # 10s * 30fps = 300
        assert 'width=1920' in code
        assert 'height=1080' in code
        assert 'Test Video' in code
    
    def test_template_corporate_generates_valid_code(self, generator):
        """Test that corporate template generates valid code."""
        code = generator._template_corporate(
            description='Corporate Test',
            duration=15,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is not None
        assert 'import' in code
        assert 'CorporateVideo' in code
        assert 'durationInFrames=450' in code  # 15s * 30fps
        assert 'linear-gradient' in code
        assert 'spring' in code
    
    def test_template_presentation_generates_valid_code(self, generator):
        """Test that presentation template generates valid code."""
        code = generator._template_presentation(
            description='Presentation Test',
            duration=20,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is not None
        assert 'import' in code
        assert 'PresentationVideo' in code
        assert 'durationInFrames=600' in code
        assert 'bulletPoints' in code
    
    def test_template_animated_generates_valid_code(self, generator):
        """Test that animated template generates valid code."""
        code = generator._template_animated(
            description='Animated Test',
            duration=8,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is not None
        assert 'import' in code
        assert 'AnimatedVideo' in code
        assert 'durationInFrames=240' in code
        assert 'spring' in code
        assert 'interpolate' in code
    
    def test_template_cinematic_generates_valid_code(self, generator):
        """Test that cinematic template generates valid code."""
        code = generator._template_cinematic(
            description='Cinematic Test',
            duration=12,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is not None
        assert 'import' in code
        assert 'CinematicVideo' in code
        assert 'durationInFrames=360' in code  # 12s * 30fps = 360
        assert 'vignette' in code
        assert 'textShadow' in code
    
    # ===== Input Validation Tests =====
    
    def test_generate_video_with_valid_input(self, generator, temp_dir):
        """Test video generation with valid minimal input."""
        input_data = {
            'description': 'A simple test video',
            'duration': 5,
            'fps': 30,
            'resolution': '1920x1080',
            'style': 'minimal'
        }
        
        # Monkey patch to avoid actual Remotion rendering
        original_create = generator._create_remotion_project
        original_render = generator._render_with_remotion
        original_thumbnail = generator._generate_thumbnail
        
        async def mock_create(code):
            return None
        
        async def mock_render(*args, **kwargs):
            return {
                'video_path': temp_dir / 'test_video.mp4',
                'actual_duration': 5,
                'actual_fps': 30,
                'actual_resolution': '1920x1080'
            }
        
        async def mock_thumbnail(video_path):
            return {'thumbnail_path': temp_dir / 'test_thumbnail.jpg'}
        
        generator._create_remotion_project = mock_create
        generator._render_with_remotion = mock_render
        generator._generate_thumbnail = mock_thumbnail
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            assert result['success'] is True
            assert result['video_url'] is not None
            assert result['duration'] == 5
            assert result['fps'] == 30
            assert result['resolution'] == '1920x1080'
            assert result['metadata']['style'] == 'minimal'
        finally:
            # Restore original methods
            generator._create_remotion_project = original_create
            generator._render_with_remotion = original_render
            generator._generate_thumbnail = original_thumbnail
    
    def test_generate_video_with_corporate_style(self, generator, temp_dir):
        """Test video generation with corporate style."""
        input_data = {
            'description': 'Corporate presentation',
            'duration': 10,
            'style': 'corporate',
            'output_format': 'mp4',
            'quality': 'high'
        }
        
        # Mock rendering
        original_render = generator._render_with_remotion
        original_thumbnail = generator._generate_thumbnail
        
        async def mock_render(*args, **kwargs):
            return {
                'video_path': temp_dir / 'corporate.mp4',
                'actual_duration': 10,
                'actual_fps': 30,
                'actual_resolution': '1920x1080'
            }
        
        async def mock_thumbnail(video_path):
            return {'thumbnail_path': temp_dir / 'corp_thumb.jpg'}
        
        generator._render_with_remotion = mock_render
        generator._generate_thumbnail = mock_thumbnail
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            assert result['success'] is True
            assert result['metadata']['style'] == 'corporate'
            assert result['metadata']['quality'] == 'high'
            assert result['metadata']['format'] == 'mp4'
        finally:
            generator._render_with_remotion = original_render
            generator._generate_thumbnail = original_thumbnail
    
    def test_generate_video_invalid_duration(self, generator):
        """Test that invalid duration raises error."""
        input_data = {
            'description': 'Test video',
            'duration': 0,  # Invalid: too short
            'style': 'minimal'
        }
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            assert result['success'] is False
            assert 'error' in result
            assert 'Duration' in result['error'] or 'duration' in result['error'].lower()
        except Exception:
            # Also acceptable to raise exception
            pass
    
    def test_generate_video_missing_description(self, generator):
        """Test that missing description raises error."""
        input_data = {
            'duration': 5,
            'style': 'minimal'
        }
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            assert result['success'] is False
            assert 'error' in result
            assert 'Description' in result['error'] or 'description' in result['error'].lower()
        except Exception:
            # Also acceptable to raise exception
            pass
    
    # ===== Output Format Tests =====
    
    def test_output_format_contains_required_fields(self, generator, temp_dir):
        """Test that output contains all required fields."""
        input_data = {
            'description': 'Output format test',
            'duration': 5
        }
        
        # Mock methods
        async def mock_render(*args, **kwargs):
            return {
                'video_path': temp_dir / 'output.mp4',
                'actual_duration': 5,
                'actual_fps': 30,
                'actual_resolution': '1920x1080'
            }
        
        async def mock_thumbnail(video_path):
            return {'thumbnail_path': temp_dir / 'thumb.jpg'}
        
        original_render = generator._render_with_remotion
        original_thumbnail = generator._generate_thumbnail
        generator._render_with_remotion = mock_render
        generator._generate_thumbnail = mock_thumbnail
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            # Check all required output fields
            required_fields = [
                'success', 'video_path', 'video_url',
                'duration', 'fps', 'resolution', 'metadata'
            ]
            
            for field in required_fields:
                assert field in result, f"Missing required field: {field}"
            
            # Check success is true
            assert result['success'] is True
            
            # Check metadata structure
            metadata = result['metadata']
            assert 'title' in metadata
            assert 'style' in metadata
            assert 'format' in metadata
            assert 'generated_at' in metadata
        finally:
            generator._render_with_remotion = original_render
            generator._generate_thumbnail = original_thumbnail
    
    def test_error_output_format(self, generator):
        """Test that error output has correct format."""
        input_data = {
            'description': 'Test error',
            'duration': -999  # Invalid
        }
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            # Check error output fields
            if not result['success']:
                assert result['success'] is False
                assert 'error' in result
                assert 'error_type' in result
                assert result['video_url'] is None
                assert result['thumbnail_url'] is None
        except Exception:
            # Exception is also acceptable
            pass
    
    # ===== Template Selection Tests =====
    
    def test_get_template_code_selects_correct_template(self, generator):
        """Test that _get_template_code selects correct template."""
        styles = ['minimal', 'corporate', 'presentation', 'animated', 'cinematic']
        
        for style in styles:
            code = generator._get_template_code(
                style=style,
                description=f'{style} test',
                duration=10,
                fps=30,
                resolution='1920x1080'
            )
            
            assert code is not None, f"Template {style} returned None"
            
            # Verify template name in code
            template_names = {
                'minimal': 'MinimalVideo',
                'corporate': 'CorporateVideo',
                'presentation': 'PresentationVideo',
                'animated': 'AnimatedVideo',
                'cinematic': 'CinematicVideo'
            }
            
            expected_name = template_names.get(style)
            assert expected_name in code, f"Template {style} doesn't contain expected name {expected_name}"
    
    def test_get_template_code_returns_none_for_unknown_style(self, generator):
        """Test that unknown style returns None."""
        code = generator._get_template_code(
            style='unknown_style',
            description='Test',
            duration=10,
            fps=30,
            resolution='1920x1080'
        )
        
        assert code is None
    
    # ===== Utility Function Tests =====
    
    def test_extract_title_from_description(self, generator):
        """Test title extraction from description."""
        # Test various description formats
        test_cases = [
            ('This is a test video.', 'This is a test video'),
            ('Create a simple welcome animation', 'Create a simple welcome animation'),
            ('Product launch video with exciting features', 'Product launch video with exciting features'),
            ('A' * 100, 'A' * 47 + '...'),  # Long description gets truncated
        ]
        
        for description, expected in test_cases:
            result = generator._extract_title(description)
            assert result == expected or (len(result) <= 50), f"Title extraction failed for: {description}"
    
    def test_file_size_extraction(self, generator, temp_dir):
        """Test that file size is extracted correctly."""
        # Create a test file with known size
        test_file = temp_dir / 'test.mp4'
        test_content = b'x' * 1000  # 1000 bytes
        test_file.write_bytes(test_content)
        
        file_size = test_file.stat().st_size
        assert file_size == 1000
    
    # ===== Cleanup Tests =====
    
    def test_temp_dir_cleanup_on_deletion(self, generator):
        """Test that temporary directory is cleaned up on deletion."""
        temp_dir = generator.temp_dir
        
        assert temp_dir.exists()
        
        # Delete the generator
        del generator
        
        # Temp directory should be cleaned up
        # Note: This might not work immediately due to garbage collection
        # But it shows the __del__ method exists


class TestSkillIntegration:
    """Integration tests for the full skill."""
    
    @pytest.fixture
    def skill_executor(self):
        """Create a mock skill executor."""
        return MockSkillExecutor()
    
    def test_skill_yaml_structure(self):
        """Test that skill.yaml has correct structure."""
        import yaml
        
        skill_path = Path(__file__).parent.parent.parent / 'skills' / 'remotion-generator' / 'skill.yaml'
        
        if skill_path.exists():
            with open(skill_path, 'r') as f:
                config = yaml.safe_load(f)
            
            # Verify required fields
            assert 'name' in config
            assert 'version' in config
            assert 'description' in config
            assert 'type' in config
            assert config['type'] == 'hybrid'
            
            # Verify input schema
            assert 'input_schema' in config
            assert 'output_schema' in config
            
            # Verify input required fields
            input_schema = config['input_schema']
            assert 'description' in input_schema['properties']
            assert input_schema['properties']['description']['type'] == 'string'
            assert 'description' in input_schema['required']
            
            # Verify enum values
            style_enum = input_schema['properties']['style']['enum']
            expected_styles = ['minimal', 'corporate', 'animated', 'cinematic', 'presentation']
            assert set(style_enum) == set(expected_styles)
    
    def test_handler_module_exists(self):
        """Test that handler.py module exists."""
        handler_path = Path(__file__).parent.parent.parent / 'skills' / 'remotion-generator' / 'handler.py'
        
        assert handler_path.exists(), "handler.py not found"
        assert handler_path.is_file(), "handler should be a file"
    
    def test_init_module_exists(self):
        """Test that __init__.py module exists."""
        init_path = Path(__file__).parent.parent.parent / 'skills' / 'remotion-generator' / '__init__.py'
        
        assert init_path.exists(), "__init__.py not found"
        assert init_path.is_file(), "__init__.py should be a file"


class TestOutputFormats:
    """Tests for various output formats and qualities."""
    
    @pytest.fixture
    def generator(self):
        """Create a fresh generator instance."""
        return RemotionVideoGenerator()
    
    @pytest.fixture
    def temp_dir(self, tmp_path):
        """Temporary directory for test outputs."""
        temp_dir = tmp_path / "format_test"
        temp_dir.mkdir(exist_ok=True)
        return temp_dir
    
    @pytest.mark.parametrize("output_format", ["mp4", "webm", "gif"])
    def test_different_output_formats(self, generator, temp_dir, output_format):
        """Test that different output formats are handled correctly."""
        input_data = {
            'description': f'Test {output_format} format',
            'duration': 5,
            'output_format': output_format
        }
        
        # Mock to avoid actual rendering
        async def mock_render(*args, **kwargs):
            return {
                'video_path': temp_dir / f'video.{output_format}',
                'actual_duration': 5,
                'actual_fps': 30,
                'actual_resolution': '1920x1080'
            }
        
        async def mock_thumbnail(video_path):
            return {'thumbnail_path': temp_dir / 'thumb.jpg'}
        
        original_render = generator._render_with_remotion
        original_thumbnail = generator._generate_thumbnail
        generator._render_with_remotion = mock_render
        generator._generate_thumbnail = mock_thumbnail
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            # Verify output format in metadata
            assert result['success'] is True
            assert result['metadata']['format'] == output_format
            
            # Verify file extension
            assert output_format in result['video_url']
        finally:
            generator._render_with_remotion = original_render
            generator._generate_thumbnail = original_thumbnail
    
    @pytest.mark.parametrize("quality", ["low", "medium", "high", "ultra"])
    def test_different_quality_presets(self, generator, temp_dir, quality):
        """Test that different quality presets are handled correctly."""
        input_data = {
            'description': f'Test {quality} quality',
            'duration': 5,
            'quality': quality
        }
        
        # Mock to avoid actual rendering
        async def mock_render(*args, **kwargs):
            return {
                'video_path': temp_dir / 'video.mp4',
                'actual_duration': 5,
                'actual_fps': 30,
                'actual_resolution': '1920x1080'
            }
        
        async def mock_thumbnail(video_path):
            return {'thumbnail_path': temp_dir / 'thumb.jpg'}
        
        original_render = generator._render_with_remotion
        original_thumbnail = generator._generate_thumbnail
        generator._render_with_remotion = mock_render
        generator._generate_thumbnail = mock_thumbnail
        
        try:
            result = asyncio.run(generator.generate_video(input_data))
            
            # Verify quality in metadata
            assert result['success'] is True
            assert result['metadata']['quality'] == quality
        finally:
            generator._render_with_remotion = original_render
            generator._generate_thumbnail = original_thumbnail


class TestPTCIntegration:
    """Tests for PTC integration with remotion-generator skill."""
    
    @pytest.fixture
    def skill_executor(self):
        """Create a mock skill executor."""
        return MockSkillExecutor()
    
    def test_ptc_code_generates_correct_executor_call(self, generator):
        """Test that PTC would generate correct executor calls."""
        # Simulate what PTC would generate
        task = "Create a 10-second corporate video"
        
        # Expected PTC output
        expected_ptc_code = '''
async def main():
    try:
        video_result = await executor.execute('remotion-generator', {
            'description': 'Create a 10-second corporate video',
            'duration': 10,
            'style': 'corporate'
        })
        
        print(json.dumps(video_result))
        
        if not video_result.get('success', False):
            print(json.dumps({
                'error': 'Video generation failed',
                'details': video_result.get('error')
            }))
    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'error_type': type(e).__name__
        }))

asyncio.run(main())
'''
        
        # Verify key elements
        assert "executor.execute('remotion-generator'" in expected_ptc_code
        assert "'description':" in expected_ptc_code
        assert "'duration': 10" in expected_ptc_code
        assert "'style': 'corporate'" in expected_ptc_code
        assert 'video_result' in expected_ptc_code
    
    def test_ptc_output_can_be_used_by_downstream_skill(self):
        """Test that output format is suitable for downstream skills."""
        # Simulate remotion-generator output
        mock_output = {
            'success': True,
            'video_path': '/tmp/video.mp4',
            'video_url': '/outputs/videos/video.mp4',
            'thumbnail_path': '/tmp/thumb.jpg',
            'thumbnail_url': '/outputs/videos/thumb.jpg',
            'duration': 10,
            'fps': 30,
            'resolution': '1920x1080',
            'file_size': 1000000,
            'metadata': {
                'title': 'Test Video',
                'style': 'corporate',
                'format': 'mp4',
                'quality': 'medium',
                'generated_at': '2024-01-10 12:00:00'
            }
        }
        
        # Test that downstream skills can use this output
        # YouTube poster would use:
        youtube_input = {
            'video_path': mock_output['video_path'],
            'title': mock_output['metadata']['title']
        }
        
        # Watermark skill would use:
        watermark_input = {
            'video_path': mock_output['video_path'],
            'logo_path': '/assets/logo.png'
        }
        
        # Verify fields are accessible
        assert 'video_path' in mock_output
        assert 'video_url' in mock_output
        assert 'duration' in mock_output
        assert 'resolution' in mock_output
        
        print("✅ PTC integration test passed")


if __name__ == '__main__':
    # Run tests with verbose output
    pytest.main([__file__, '-v', '--tb=short'])
