"""
Remotion Video Generation Skill

Generates videos using Remotion framework from natural language descriptions.
Focus: Natural Language → Video File
Output: Structured video data for downstream skills to consume
"""

import asyncio
import subprocess
import json
import os
import sys
import tempfile
import shutil
import time
import math
import platform
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import logging

# Add src to path for shared utilities (src must be in path for 'from core.skill' to work)
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder, get_relative_path, MediaInfo
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

# Configure logging to show INFO level messages
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s'
)

# IMPORTANT: Add skill directory to sys.path for relative imports to work
# This is needed when the module is imported via importlib (e.g., by Motia agent system)
SKILL_DIR = Path(__file__).parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))
    logging.info(f"Added {SKILL_DIR} to sys.path for imports")

# Import LLM-based generators
# Version control via environment variables
USE_ANALYZER_V2 = os.getenv("USE_ANALYZER_V2", "true").lower() == "true"
USE_CODE_GENERATOR_V2 = os.getenv("USE_CODE_GENERATOR_V2", "true").lower() == "true"

try:
    if USE_ANALYZER_V2:
        from generators.llm_analyzer_v2 import ContentAnalyzerV2 as ContentAnalyzer
        logging.info(f"✅ Using ContentAnalyzer v2.0")
    else:
        from generators.llm_analyzer import ContentAnalyzer
        logging.info(f"Using ContentAnalyzer v1.0")

    if USE_CODE_GENERATOR_V2:
        from generators.code_generator_v2 import RemotionCodeGeneratorV2 as RemotionCodeGenerator
        logging.info(f"✅ Using RemotionCodeGenerator v2.0")
    else:
        from generators.code_generator import RemotionCodeGenerator
        logging.info(f"Using RemotionCodeGenerator v1.0")

    from generators.validator import CodeValidator
    GENERATORS_AVAILABLE = True
except ImportError as e:
    GENERATORS_AVAILABLE = False
    logging.warning(f"LLM generators not available: {str(e)}. Using template-based generation only.")

class RemotionVideoGenerator:
    """Specialized Remotion video generator."""

    def __init__(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="remotion_"))
        self.project_dir = self.temp_dir / "remotion-project"
        # Path to pre-installed template
        self.template_dir = Path(__file__).parent / "template"
        # Persistent output directory (project root, not skills/ subdirectory)
        self.output_dir = Path(__file__).parent.parent.parent / "outputs" / "videos"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # Persistent counter file for tracking video counts across processes
        self.counter_file = self.output_dir / ".video_counts.json"

    def _load_video_counts(self) -> Dict[str, int]:
        """Load video counts from persistent storage (file)."""
        if self.counter_file.exists():
            try:
                with open(self.counter_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                pass
        return {}

    def _save_video_counts(self, counts: Dict[str, int]) -> None:
        """Save video counts to persistent storage (file)."""
        try:
            # Create parent directory if needed
            self.counter_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.counter_file, 'w') as f:
                json.dump(counts, f, indent=2)
        except IOError as e:
            logging.warning(f"Failed to save video counts: {e}")

    def _get_next_video_number(self, task_id: str) -> int:
        """Get next video number for a task, incrementing the counter."""
        counts = self._load_video_counts()
        video_number = counts.get(task_id, 0) + 1
        counts[task_id] = video_number
        self._save_video_counts(counts)
        return video_number

    async def generate_video(self, input_data: Dict[str, Any], context=None) -> Dict[str, Any]:
        """
        Generate video using Remotion from natural language.

        This function focuses ONLY on video generation.
        All post-processing (upload, sharing, etc.) should be handled by other skills.

        Args:
            input_data: Video generation parameters

        Returns:
            Structured result in unified output format
        """
        start_time = time.time()

        try:
            # DEBUG: Log input_data to understand what's being passed
            print(f"[DEBUG] generate_video called with input_data type: {type(input_data)}")
            print(f"[DEBUG] input_data content: {input_data}")
            print(f"[DEBUG] input_data keys: {input_data.keys() if isinstance(input_data, dict) else 'N/A'}")
            desc = input_data.get('description', 'N/A')
            logging.info(f"[DEBUG] Starting generate_video with description: {str(desc)[:100]}")

            # Report progress
            if context:
                await context.report_step("Extracting video parameters...")

            # Extract parameters with fallback for flexible input
            description = input_data.get('description', '')

            # If description is not provided, try other common field names
            if not description:
                description = input_data.get('task', '')
            if not description:
                description = input_data.get('query', '')
            if not description:
                description = input_data.get('prompt', '')  # LLM often uses 'prompt'
            if not description:
                description = input_data.get('text', '')

            # Last resort: if input_data is a string, use it directly
            if not description and isinstance(input_data, str):
                description = input_data

            # Check if composition_code is provided (direct code rendering mode)
            composition_code = input_data.get('composition_code', '')
            composition_id = input_data.get('composition_id', 'MyComposition')

            # Default parameters
            duration = int(input_data.get('duration', 10)) if isinstance(input_data.get('duration'), (int, str)) else 10
            fps = int(input_data.get('fps', 30)) if isinstance(input_data.get('fps'), (int, str)) else 30

            # Handle resolution - ensure it's a string
            resolution_raw = input_data.get('resolution', '1920x1080')
            if isinstance(resolution_raw, dict):
                # If resolution is a dict, try to extract width and height
                width = resolution_raw.get('width', resolution_raw.get('width', 1920))
                height = resolution_raw.get('height', resolution_raw.get('height', 1080))
                resolution = f"{width}x{height}"
            elif isinstance(resolution_raw, str):
                # Normalize resolution shorthand formats (e.g., '1080p' -> '1920x1080')
                resolution = self._normalize_resolution(resolution_raw)
            else:
                resolution = '1920x1080'

            style = input_data.get('style', 'minimal')
            output_format = input_data.get('output_format', 'mp4')
            quality = input_data.get('quality', 'medium')

            # Determine mode: direct code rendering or description-based generation
            if composition_code:
                # Direct code rendering mode - skip code generation
                remotion_code = composition_code
                # Use provided duration_frames if available, otherwise calculate from duration
                duration_frames = input_data.get('duration_frames', duration * fps)
                if context:
                    await context.report_step("Using direct composition code...")
            else:
                # Description-based generation mode
                if not description:
                    raise ValueError("Description is required. Please provide a description of the video you want to generate.")
                if duration <= 0 or duration > 300:  # Max 5 minutes
                    raise ValueError("Duration must be between 1 and 300 seconds")

                # Generate Remotion code from description
                if context:
                    await context.report_step("Generating Remotion code...")
                print(f"[DEBUG] About to call _generate_remotion_code...")
                logging.info(f"[DEBUG] About to call _generate_remotion_code with description: {str(description)[:100]}")
                remotion_code = await self._generate_remotion_code(
                    description, duration, fps, resolution, style, input_data
                )
                print(f"[DEBUG] _generate_remotion_code returned, code length: {len(remotion_code) if remotion_code else 0}")
                logging.info(f"[DEBUG] _generate_remotion_code returned, code length: {len(remotion_code) if remotion_code else 0}")
                duration_frames = duration * fps

            # Create Remotion project and render
            # For direct code mode, calculate duration from duration_frames
            render_duration = duration_frames / fps if composition_code else duration
            if context:
                await context.report_step("Creating Remotion project...")
            video_info = await self._render_video(
                remotion_code, render_duration, fps, resolution, output_format, quality, input_data
            )

            # Generate thumbnail
            if context:
                await context.report_step("Generating video thumbnail...")
            thumbnail_info = await self._generate_thumbnail(video_info['video_path'])

            # Get file info
            file_size = video_info['video_path'].stat().st_size if video_info['video_path'].exists() else 0

            # Use OutputBuilder if available
            if context:
                await context.report_step("Finalizing video generation...")

            if OUTPUT_BUILDER_AVAILABLE:
                # Get relative path for output
                relative_video_path = get_relative_path(video_info['video_path'])
                relative_thumbnail_path = get_relative_path(thumbnail_info['thumbnail_path']) if thumbnail_info else None

                # Determine mime type based on format
                mime_type_map = {
                    'mp4': 'video/mp4',
                    'webm': 'video/webm',
                    'gif': 'image/gif'
                }
                mime_type = mime_type_map.get(output_format, 'video/mp4')

                # Create MediaInfo object
                media_info = MediaInfo(
                    path=relative_video_path,
                    mime_type=mime_type,
                    size=file_size,
                    duration=video_info['actual_duration'],
                    fps=int(video_info['actual_fps']) if video_info['actual_fps'] else None,
                    thumbnail_path=relative_thumbnail_path
                )

                return OutputBuilder() \
                    .set_media(media_info=media_info) \
                    .add_standard_metadata("style", style) \
                    .add_standard_metadata("format", output_format) \
                    .add_standard_metadata("quality", quality) \
                    .build()
            else:
                # Fallback to old format for backward compatibility
                return {
                    "success": True,
                    "video_path": str(video_info['video_path']),
                    "video_url": str(video_info['video_path']),  # Use actual file path
                    "thumbnail_path": str(thumbnail_info['thumbnail_path']) if thumbnail_info else None,
                    "thumbnail_url": str(thumbnail_info['thumbnail_path']) if thumbnail_info else None,
                    "duration": video_info['actual_duration'],
                    "fps": video_info['actual_fps'],
                    "resolution": video_info['actual_resolution'],
                    "file_size": file_size,
                    "metadata": {
                        "title": self._extract_title(description),
                        "description": description[:200],  # Truncate for metadata
                        "style": style,
                        "format": output_format,
                        "quality": quality,
                        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S")
                    }
                }

        except Exception as e:
            print(f"[DEBUG] Exception in generate_video: {type(e).__name__}: {str(e)}")
            logging.error(f"[DEBUG] Exception in generate_video: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()

            # Use OutputBuilder for error handling if available
            if OUTPUT_BUILDER_AVAILABLE:
                return OutputBuilder() \
                    .set_error(
                        error=e,
                        suggestions=[
                            "Check if Remotion is properly installed",
                            "Ensure the video description is clear and specific",
                            "Verify output directory has write permissions",
                            "Try reducing video duration or resolution"
                        ]
                    ) \
                    .build()
            else:
                # Fallback to old error format
                return {
                    "success": False,
                    "error": str(e),
                    "error_type": type(e).__name__,
                    "video_path": None,
                    "video_url": None,
                    "thumbnail_path": None,
                    "thumbnail_url": None
                }

    async def _generate_remotion_code(
        self,
        description: str,
        duration: int,
        fps: int,
        resolution: str,
        style: str,
        context: Dict[str, Any]
    ) -> str:
        """
        Generate Remotion code using two-stage LLM generation with retry logic.

        Strategy:
        - Always use LLM code generator
        - Retry up to 2 times if generation fails
        - No fallback to templates
        """

        if not GENERATORS_AVAILABLE:
            raise RuntimeError("LLM generators not available. Please check the installation.")

        # Retry up to 2 times (total 3 attempts)
        max_attempts = 3
        last_error = None

        # 添加标记日志文件（用于确认重试）
        retry_marker = f"/tmp/remotion_retry_{id(self)}_{int(time.time())}.log"

        for attempt in range(1, max_attempts + 1):
            try:
                # 写入标记文件（无法遗漏的证据）
                with open(retry_marker, 'a') as f:
                    f.write(f"\n{'='*60}\n")
                    f.write(f"RETRY ATTEMPT: {attempt}/{max_attempts}\n")
                    f.write(f"TIMESTAMP: {datetime.now().isoformat()}\n")
                    f.write(f"DESCRIPTION: {description[:100]}\n")
                    f.write(f"{'='*60}\n")

                logging.info(f"[RETRY-{attempt}/{max_attempts}] LLM generation START")
                logging.info(f"[RETRY-{attempt}/{max_attempts}] Description: {description[:50]}...")

                code = await self._generate_with_llm_two_stage(
                    description, duration, fps, resolution, style,
                    error_context=last_error,  # Pass previous error for context
                    retry_attempt=attempt - 1  # Pass retry attempt (0-based)
                )

                logging.info(f"[RETRY-{attempt}/{max_attempts}] LLM generation DONE, code length: {len(code) if code else 0}")

                # Validate code using CodeValidator with TypeScript syntax check
                from generators.validator import CodeValidator
                validator = CodeValidator()

                logging.info(f"[RETRY-{attempt}/{max_attempts}] VALIDATION START")

                is_valid, validation_errors, validation_warnings = validator.validate_with_syntax_check(code)

                # 写入验证结果到文件
                with open(retry_marker, 'a') as f:
                    f.write(f"VALIDATION_RESULT: {'PASS' if is_valid else 'FAIL'}\n")
                    if not is_valid:
                        f.write(f"VALIDATION_ERRORS: {validation_errors[:3]}\n")

                if not is_valid:
                    last_error = f"Code validation failed: {'; '.join(validation_errors[:3])}"
                    logging.error(f"[RETRY-{attempt}/{max_attempts}] VALIDATION FAILED: {last_error}")
                    logging.warning(f"[RETRY-{attempt}/{max_attempts}] Will retry...")

                    # 等待后重试
                    if attempt < max_attempts:
                        wait_time = 2 ** attempt
                        logging.info(f"[RETRY-{attempt}/{max_attempts}] Waiting {wait_time}s before retry...")
                        await asyncio.sleep(wait_time)
                    continue  # ← 关键：重试循环

                if validation_warnings:
                    logging.warning(f"Validation warnings: {'; '.join(validation_warnings[:3])}")

                # Post-process: Ensure complete Remotion structure
                code = self._ensure_complete_structure(code, duration, fps, resolution)
                logging.info(f"✅ LLM generation successful on attempt {attempt}")
                return code

            except Exception as e:
                last_error = f"{type(e).__name__}: {str(e)}"
                logging.error(f"❌ Attempt {attempt} failed: {last_error}")
                if attempt < max_attempts:
                    logging.info(f"Retrying in {2 ** attempt} seconds...")
                    await asyncio.sleep(2 ** attempt)

        # All attempts failed
        error_msg = f"Failed to generate code after {max_attempts} attempts. Last error: {last_error}"
        logging.error(error_msg)
        raise RuntimeError(error_msg)

    async def _generate_with_llm_two_stage(
        self,
        description: str,
        duration: int,
        fps: int,
        resolution: str,
        style: str,
        error_context: Optional[str] = None,
        retry_attempt: int = 0
    ) -> str:
        """
        Generate Remotion code using two-stage LLM process.

        Stage 1: Content Analysis
        Stage 2: Code Generation

        Args:
            description: User's natural language description
            duration: Video duration in seconds
            fps: Frames per second
            resolution: Video resolution (e.g., "1920x1080")
            style: Video style (can inform visualization choices)
            error_context: Optional error feedback for retry
            retry_attempt: Which retry attempt (0 = first attempt)

        Returns:
            Complete TypeScript/Remotion code
        """
        if not GENERATORS_AVAILABLE:
            raise RuntimeError("LLM generators not available")

        # Stage 1: Analyze content
        analyzer = ContentAnalyzer()
        logging.info("Stage 1: Analyzing content...")
        analysis = await analyzer.analyze(description, retry_attempt=retry_attempt)
        logging.info(f"Analysis complete: {analysis['topic']['name']}")

        # Stage 2: Generate code
        code_generator = RemotionCodeGenerator()
        logging.info("Stage 2: Generating Remotion code...")
        code = await code_generator.generate(
            analysis=analysis,
            duration=duration,
            fps=fps,
            resolution=resolution,
            error_context=error_context,
            retry_attempt=retry_attempt
        )
        logging.info("Code generation complete")

        return code

    async def _parse_educational_content(self, description: str) -> Dict[str, Any]:
        """
        Parse educational content using simple keyword matching.
        For production, this would use an actual LLM API.
        """
        # Educational content keywords
        edu_keywords = ['教学', '教育', 'tutorial', 'educational', 'lesson',
                       '定理', '公式', 'formula', 'theorem', '勾股定理',
                       'pythagorean', 'math', '数学', 'triangle', '三角形']

        description_lower = description.lower()

        # Check if this is educational content
        is_educational = any(keyword in description_lower for keyword in edu_keywords)

        if not is_educational:
            return {'is_educational': False}

        # Extract title - look for quoted text or main topic
        title = "教学视频"
        if '"' in description or '"' in description or '"' in description:
            # Extract quoted text
            import re
            quotes = re.findall(r'["\"](.*?)["\"]', description)
            if quotes:
                title = quotes[0]
        elif '勾股定理' in description or 'pythagorean' in description_lower:
            title = "勾股定理"
        elif '定理' in description:
            # Extract theorem name
            import re
            theorem_match = re.search(r'(\w+定理)', description)
            if theorem_match:
                title = theorem_match.group(1)

        # Extract visual elements
        visual_elements = []
        if '三角' in description or 'triangle' in description_lower:
            visual_elements.append('triangle')
        if '公式' in description or 'formula' in description_lower:
            visual_elements.append('formula')
        if '动画' in description or 'animated' in description_lower:
            visual_elements.append('animation')

        # Extract duration hints
        content_type = 'simple'
        if '详细' in description or 'detailed' in description_lower:
            content_type = 'detailed'

        return {
            'is_educational': True,
            'title': title,
            'content_type': content_type,
            'visual_elements': visual_elements,
            'description': description
        }

    def _extract_composition_id(self, code: str) -> str:
        """
        Extract the composition id from generated Remotion code.

        Uses regex to find the Composition component and extract its id prop.

        Args:
            code: Generated Remotion TypeScript code

        Returns:
            The composition id (e.g., 'MyVideo', 'CNNVideo')
        """
        import re

        # Pattern to match: id="Something" or id='Something' or id={Something}
        # Only search within Composition components
        patterns = [
            r'<Composition[^>]*\bid=["\']([^"\']+)["\']',  # id="name" or id='name'
            r'<Composition[^>]*\bid=({([^}]+)})',  # id={variable}
        ]

        for pattern in patterns:
            matches = re.findall(pattern, code)
            if matches:
                # For pattern 1, matches[0] is the id
                # For pattern 2, matches[0] is the full match, matches[1] is the variable
                if pattern == r'<Composition[^>]*\bid=["\']([^"\']+)["\']':
                    composition_id = matches[0]
                else:
                    composition_id = matches[0][1] if len(matches[0]) > 1 else matches[0]

                logger.info(f"Extracted composition_id: {composition_id}")
                return composition_id

        # Fallback: try to find any Composition and look for nearby id
        composition_match = re.search(r'<Composition[^>]*>', code)
        if composition_match:
            composition_tag = composition_match.group(0)
            logger.warning(f"Found Composition but couldn't extract id: {composition_tag[:100]}")

        # Default fallback
        logger.warning("Could not extract composition_id, using default 'MyComposition'")
        return 'MyComposition'

    def _ensure_complete_structure(
        self,
        code: str,
        duration: int,
        fps: int,
        resolution: str
    ) -> str:
        """
        Ensure the generated code has complete Remotion structure.

        If Composition is missing, extract the main component and wrap it properly.
        """
        import re

        # Check if Composition component (not just comment) already exists
        # Look for actual JSX <Composition id=...
        if re.search(r'<Composition\s+id=', code):
            print("[DEBUG] Composition component already exists in code")
            return code

        print("[DEBUG] Composition component missing, adding it...")

        # Try to find the main component
        # Look for: export const SomethingVideo: React.FC
        main_component_match = re.search(r'export\s+const\s+(\w+):\s*React\.FC', code)

        if not main_component_match:
            # Try alternative patterns
            main_component_match = re.search(r'export\s+const\s+(\w+)\s*=\s*\(\)\s*=>', code)

        if not main_component_match:
            print("[WARNING] Could not find main component, leaving code as-is")
            return code

        component_name = main_component_match.group(1)
        print(f"[DEBUG] Found main component: {component_name}")

        # Extract parameters
        width, height = resolution.split("x")
        total_frames = duration * fps

        # Add Composition at the end before registerRoot
        composition_code = f"""

// --- Root Composition ---
<Composition
  id="{component_name.replace('Video', '')}"
  component={component_name}
  durationInFrames={total_frames}
  fps={fps}
  width={width}
  height={height}
/>
"""

        # Insert before registerRoot call
        if 'registerRoot(' in code:
            # Find the registerRoot line
            register_root_idx = code.find('registerRoot(')
            if register_root_idx != -1:
                # Find the newline before it
                newline_before = code.rfind('\n', 0, register_root_idx)
                if newline_before != -1:
                    code = code[:newline_before + 1] + composition_code + '\n' + code[newline_before + 1:]
                    print(f"[DEBUG] Added Composition before registerRoot")
                else:
                    # Append at the end
                    code += composition_code
                    print(f"[DEBUG] Appended Composition at the end")
            else:
                code += composition_code
        else:
            # No registerRoot, just append
            code += composition_code

        return code

    def _extract_composition_id(self, code: str) -> str:
        """Extract composition ID from generated Remotion code."""
        import re
        # Look for <Composition id="CompositionName" ... />
        match = re.search(r'<Composition\s[^>]*id="([^"]+)"', code)
        if match:
            return match.group(1)
        # Fallback to MinimalVideo
        return "MinimalVideo"

    def _get_template_code(
        self,
        style: str,
        description: str,
        duration: int,
        fps: int,
        resolution: str
    ) -> Optional[str]:
        """Get Remotion code from predefined templates."""

        templates = {
            "minimal": self._template_minimal,
            "corporate": self._template_corporate,
            "presentation": self._template_presentation,
            "animated": self._template_animated,
            "cinematic": self._template_cinematic,
            "educational": self._template_educational
        }

        template_func = templates.get(style)
        if template_func:
            return template_func(description, duration, fps, resolution)
        return None

    def _template_minimal(self, description: str, duration: int, fps: int, resolution: str) -> str:
        """Minimal style template - clean and simple."""
        width, height = map(int, resolution.split('x'))
        total_frames = duration * fps

        # Escape double quotes in description for JavaScript string safety
        safe_description = description.replace('"', '\\"')

        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, registerRoot } from 'remotion';

interface MinimalVideoProps {
  title: string;
  subtitle?: string;
}

const MinimalVideo: React.FC<MinimalVideoProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade in animation
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Subtitle delay
  const subtitleOpacity = interpolate(frame, [60, 90], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}>
      <div style={{
        textAlign: 'center',
        color: '#333333',
        maxWidth: '80%%',
      }}>
        <h1 style={{
          fontSize: Math.min(64, %d / 15),
          fontWeight: 'bold',
          margin: 0,
          marginBottom: 20,
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 24,
            margin: 0,
            color: '#666666',
            opacity: subtitleOpacity,
          }}>
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="MinimalVideo"
      component={MinimalVideo}
      durationInFrames={%d}
      width={%d}
      height={%d}
      fps={%d}
      defaultProps={{
        title: "%s",
        subtitle: "Generated with Remotion",
      }}
    />
  );
};

registerRoot(Root);''' % (width, total_frames, width, height, fps, safe_description)

    def _template_corporate(self, description: str, duration: int, fps: int, resolution: str) -> str:
        """Corporate style template - professional and branded."""
        width, height = map(int, resolution.split('x'))

        # Escape double quotes in description for JavaScript string safety
        safe_description = description.replace('"', '\\"')
        total_frames = duration * fps

        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, registerRoot } from 'remotion';

interface CorporateVideoProps {
  title: string;
  subtitle?: string;
  brandColor?: string;
}

const CorporateVideo: React.FC<CorporateVideoProps> = ({
  title,
  subtitle,
  brandColor = "#2563eb"
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Logo entrance animation
  const logoScale = spring({
    fps: %d,
    frame: frame - 15,
    config: { damping: 200, stiffness: 100 },
  });

  // Title fade-in
  const titleOpacity = interpolate(frame, [45, 75], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Background gradient animation
  const gradientOffset = interpolate(frame, [0, %d], [0, 1]);

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${brandColor} 0%%, #1e293b ${gradientOffset}%%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        transform: `scale(${logoScale})`,
        marginBottom: 60,
      }}>
        <div style={{
          width: 80,
          height: 80,
          backgroundColor: 'white',
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 'bold',
          color: brandColor,
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        }}>
          LOGO
        </div>
      </div>

      <div style={{
        opacity: titleOpacity,
        textAlign: 'center',
        maxWidth: '80%%',
      }}>
        <h1 style={{
          fontSize: Math.min(56, %d / 18),
          fontWeight: 'bold',
          color: 'white',
          margin: 0,
          marginBottom: 16,
          lineHeight: 1.3,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 20,
            color: 'rgba(255, 255, 255, 0.9)',
            margin: 0,
          }}>
            {subtitle}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="CorporateVideo"
      component={CorporateVideo}
      durationInFrames={%d}
      width={%d}
      height={%d}
      fps={%d}
      defaultProps={{
        title: "%s",
        subtitle: "Professional Video Generation",
        brandColor: "#2563eb",
      }}
    />
  );
};

registerRoot(Root);''' % (fps, total_frames, width, total_frames, width, height, fps, safe_description)

    def _template_presentation(self, description: str, duration: int, fps: int, resolution: str) -> str:
        """Presentation style template - clean and informational."""
        width, height = map(int, resolution.split('x'))

        # Escape double quotes in description for JavaScript string safety
        safe_description = description.replace('"', '\\"')
        total_frames = duration * fps

        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, registerRoot } from 'remotion';

interface PresentationVideoProps {
  title: string;
  subtitle?: string;
  bulletPoints?: string[];
}

const PresentationVideo: React.FC<PresentationVideoProps> = ({ title, subtitle, bulletPoints = [] }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade in animation
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}>
      <div style={{
        maxWidth: '90%%',
        textAlign: 'center',
        color: '#1e293b',
      }}>
        <h1 style={{
          fontSize: Math.min(48, %d / 20),
          fontWeight: 'bold',
          margin: 0,
          marginBottom: 30,
          lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 24,
            margin: 0,
            marginBottom: 40,
            color: '#64748b',
          }}>
            {subtitle}
          </p>
        )}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          textAlign: 'left',
        }}>
          {bulletPoints.slice(0, 5).map((point, index) => {
            const pointOpacity = interpolate(frame, [60 + index * 20, 90 + index * 20], [0, 1], {
              extrapolateRight: 'clamp',
            });

            return (
              <div key={index} style={{
                opacity: pointOpacity,
                fontSize: 20,
                color: '#374151',
                display: 'flex',
                alignItems: 'flex-start',
              }}>
                <span style={{
                  fontWeight: 'bold',
                  marginRight: 8,
                  minWidth: 20,
                  color: '#059669',
                }}>
                  .
                </span>
                <span>{point}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="PresentationVideo"
      component={PresentationVideo}
      durationInFrames={%d}
      width={%d}
      height={%d}
      fps={%d}
      defaultProps={{
        title: "%s",
        subtitle: "Presentation Style Video",
        bulletPoints: ["Key point 1", "Key point 2", "Key point 3"],
      }}
    />
  );
};

registerRoot(Root);''' % (width, total_frames, width, height, fps, safe_description)

    def _template_animated(self, description: str, duration: int, fps: int, resolution: str) -> str:
        """Animated style template - dynamic and engaging."""
        width, height = map(int, resolution.split('x'))

        # Escape double quotes in description for JavaScript string safety
        safe_description = description.replace('"', '\\"')
        total_frames = duration * fps

        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, registerRoot } from 'remotion';

interface AnimatedVideoProps {
  title: string;
  accentColor?: string;
}

const AnimatedVideo: React.FC<AnimatedVideoProps> = ({ title, accentColor = "#3b82f6" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Bounce animation for title
  const titleScale = spring({
    fps: %d,
    frame: frame - 20,
    config: { damping: 100, stiffness: 200, mass: 1 },
  });

  // Rotate animation for accent
  const rotation = interpolate(frame, [0, %d], [0, 360], {
    extrapolateLeft: 'extend',
  });

  // Fade in
  const opacity = interpolate(frame, [0, 40], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Slide in from left
  const translateX = interpolate(frame, [0, 60], [-%d, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(45deg, #fef3c7 0%%, #ddd6fe 100%%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          opacity,
          textAlign: 'center',
          maxWidth: '80%%',
        }}
      >
        <h1
          style={{
            transform: `scale(${titleScale})`,
            fontSize: Math.min(56, %d / 18),
            fontWeight: 'bold',
            color: '#1f2937',
            margin: 0,
            marginBottom: 30,
          }}
        >
          {title}
        </h1>

        <div
          style={{
            width: 120,
            height: 120,
            backgroundColor: accentColor,
            borderRadius: '50%%',
            transform: `rotate(${rotation}deg)`,
            marginBottom: 30,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="AnimatedVideo"
      component={AnimatedVideo}
      durationInFrames={%d}
      width={%d}
      height={%d}
      fps={%d}
      defaultProps={{
        title: "%s",
        accentColor: "#3b82f6",
      }}
    />
  );
};

registerRoot(Root);''' % (fps, total_frames, width // 2, width, total_frames, width, height, fps, safe_description)

    def _template_cinematic(self, description: str, duration: int, fps: int, resolution: str) -> str:
        """Cinematic style template - dramatic and film-like."""
        width, height = map(int, resolution.split('x'))

        # Escape double quotes in description for JavaScript string safety
        safe_description = description.replace('"', '\\"')
        total_frames = duration * fps

        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, registerRoot } from 'remotion';

interface CinematicVideoProps {
  title: string;
  subtitle?: string;
}

const CinematicVideo: React.FC<CinematicVideoProps> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Cinematic fade-in with vignette effect
  const vignetteOpacity = interpolate(frame, [0, 60], [0, 0.7], {
    extrapolateRight: 'clamp',
  });

  // Title reveal animation
  const titleOpacity = interpolate(frame, [90, 120], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Subtle zoom
  const scale = interpolate(frame, [0, %d], [1.1, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      background: '#000000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Main content */}
      <div style={{
        transform: `scale(${scale})`,
        textAlign: 'center',
        maxWidth: '80%%',
        zIndex: 2,
      }}>
        <h1 style={{
          fontSize: Math.min(64, %d / 15),
          fontWeight: 'bold',
          color: '#ffffff',
          margin: 0,
          marginBottom: 20,
          textShadow: '0 4px 20px rgba(0,0,0,0.8)',
          opacity: titleOpacity,
          lineHeight: 1.3,
          letterSpacing: '2px',
          textTransform: 'uppercase',
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 24,
            color: '#e5e7eb',
            margin: 0,
            opacity: titleOpacity,
          }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Vignette overlay */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle, transparent 30%%, rgba(0,0,0,${vignetteOpacity}) 100%%)`,
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="CinematicVideo"
      component={CinematicVideo}
      durationInFrames={%d}
      width={%d}
      height={%d}
      fps={%d}
      defaultProps={{
        title: "%s",
        subtitle: "Cinematic Style Video",
      }}
    />
  );
};

registerRoot(Root);''' % (total_frames, width, total_frames, width, height, fps, safe_description)

    def _template_educational(
        self,
        parsed_content: Dict[str, Any],
        duration: int,
        fps: int,
        resolution: str
    ) -> str:
        """Educational template with dynamic animations for math/science content."""
        width, height = map(int, resolution.split('x'))
        title = parsed_content.get('title', '教学视频')
        visual_elements = parsed_content.get('visual_elements', [])
        has_triangle = 'triangle' in visual_elements
        has_formula = 'formula' in visual_elements

        total_frames = duration * fps

        # Pre-calculate sizes in Python
        font_size = min(96, width // 15)  # 增大字体
        svg_size = 600  # 增大SVG尺寸
        line_width = 6  # 增大线条宽度
        label_font = 28  # 增大标签字体

        # Build the educational video code with multiple scenes
        return '''import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, registerRoot } from 'remotion';
import React from 'react';

interface EducationalVideoProps {
  title: string;
  showTriangle?: boolean;
  showFormula?: boolean;
}

const Triangle: React.FC<{ progress: number }> = ({ progress }) => {
  const svgSize = %d;

  // Simplified coordinates - center the triangle in the SVG
  // Triangle takes up 80 percent of SVG space
  const margin = svgSize * 0.1;
  const triangleSize = svgSize - (margin * 2);

  // Right triangle vertices (using simple 0-based coordinates)
  const A = { x: margin, y: svgSize - margin };  // Bottom-left (right angle)
  const B = { x: svgSize - margin, y: svgSize - margin };  // Bottom-right
  const C = { x: margin, y: margin };  // Top-left

  // Calculate side lengths for stroke-dasharray
  const sideAB = triangleSize;  // Bottom side (b)
  const sideAC = triangleSize;  // Left side (a)
  const sideBC = Math.sqrt(2) * triangleSize;  // Hypotenuse (c)

  // Animate line drawing - distribute progress evenly across 3 sides
  const progressPerSide = progress / 3;
  const currentSide = Math.floor(progress * 3);
  const sideProgress = (progress * 3) - Math.floor(progress * 3);

  return (
    <svg
      width={svgSize}
      height={svgSize}
      style={{ position: 'absolute', top: '50%%', left: '50%%', transform: 'translate(-50%%, -50%%)' }}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
    >
      {/* Side 1: Vertical side (a) - from A to C */}
      {progress > 0 && (
        <line
          x1={A.x}
          y1={A.y}
          x2={C.x}
          y2={C.y}
          stroke="#4F46E5"
          strokeWidth={%d}
          strokeDasharray={sideAC}
          strokeDashoffset={sideAC * (1 - Math.min(progress * 3, 1))}
          strokeLinecap="round"
        />
      )}

      {/* Side 2: Horizontal side (b) - from A to B */}
      {progress > 0.33 && (
        <line
          x1={A.x}
          y1={A.y}
          x2={B.x}
          y2={B.y}
          stroke="#4F46E5"
          strokeWidth={%d}
          strokeDasharray={sideAB}
          strokeDashoffset={sideAB * (1 - Math.min((progress - 0.33) * 3, 1))}
          strokeLinecap="round"
        />
      )}

      {/* Side 3: Hypotenuse (c) - from C to B */}
      {progress > 0.66 && (
        <line
          x1={C.x}
          y1={C.y}
          x2={B.x}
          y2={B.y}
          stroke="#EC4899"
          strokeWidth={%d}
          strokeDasharray={sideBC}
          strokeDashoffset={sideBC * (1 - Math.min((progress - 0.66) * 3, 1))}
          strokeLinecap="round"
        />
      )}

      {/* Right angle marker */}
      {progress >= 1 && (
        <path
          d={`M ${A.x + 30} ${A.y} L ${A.x + 30} ${A.y - 30} L ${A.x} ${A.y - 30}`}
          stroke="#EC4899"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
      )}

      {/* Labels - positioned relative to sides */}
      {progress >= 1 && (
        <>
          <text
            x={A.x - 25}
            y={(A.y + C.y) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#4F46E5"
            fontSize={%d}
            fontWeight="bold"
          >a</text>
          <text
            x={(A.x + B.x) / 2}
            y={A.y + 35}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#4F46E5"
            fontSize={%d}
            fontWeight="bold"
          >b</text>
          <text
            x={(B.x + C.x) / 2 + 20}
            y={(B.y + C.y) / 2 - 20}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#EC4899"
            fontSize={%d + 4}
            fontWeight="bold"
          >c</text>
        </>
      )}
    </svg>
  );
};

const Formula: React.FC<{ progress: number }> = ({ progress }) => {
  const opacity = Math.min(progress * 2, 1);
  const scale = spring({ frame: progress * 60, fps: 30, config: { damping: 15 } });

  return (
    <div style={{
      opacity,
      transform: `scale(${scale})`,
      textAlign: 'center',
      fontSize: 56,
      fontWeight: 'bold',
      color: '#1F2937',
      fontFamily: 'Georgia, serif',
      textShadow: '0 2px 10px rgba(0,0,0,0.2)',
    }}>
      <span style={{ color: '#4F46E5' }}>a</span>
      <sup>2</sup>
      {' + '}
      <span style={{ color: '#4F46E5' }}>b</span>
      <sup>2</sup>
      {' = '}
      <span style={{ color: '#EC4899' }}>c</span>
      <sup>2</sup>
    </div>
  );
};

const EducationalVideo: React.FC<EducationalVideoProps> = ({ title, showTriangle = false, showFormula = false }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Scene timing (divide total frames into scenes)
  const titleSceneEnd = Math.floor(durationInFrames * 0.25);
  const triangleSceneEnd = Math.floor(durationInFrames * 0.60);
  const formulaSceneEnd = Math.floor(durationInFrames * 0.85);

  // Calculate which scene we're in
  const inTitleScene = frame < titleSceneEnd;
  const inTriangleScene = frame >= titleSceneEnd && frame < triangleSceneEnd;
  const inFormulaScene = frame >= triangleSceneEnd && frame < formulaSceneEnd;
  const inSummaryScene = frame >= formulaSceneEnd;

  // Title animation
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const titleScale = spring({ frame, fps: 30, config: { damping: 10 } });

  // Triangle progress and opacity
  const triangleProgress = interpolate(
    frame,
    [titleSceneEnd, triangleSceneEnd],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
  const triangleOpacity = interpolate(
    frame,
    [titleSceneEnd, titleSceneEnd + 20],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // Formula progress and opacity
  const formulaProgress = interpolate(
    frame,
    [triangleSceneEnd, formulaSceneEnd],
    [0, 1],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );
  const formulaOpacity = interpolate(
    frame,
    [triangleSceneEnd, triangleSceneEnd + 20],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // Summary opacity
  const summaryOpacity = interpolate(
    frame,
    [formulaSceneEnd, formulaSceneEnd + 30],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // Render content based on current scene
  const renderContent = () => {
    if (inSummaryScene) {
      return (
        <div style={{
          opacity: summaryOpacity,
          textAlign: 'center',
          color: '#ffffff',
        }}>
          <h2 style={{ fontSize: 36, margin: 0, marginBottom: 20 }}>勾股定理</h2>
          <p style={{ fontSize: 24, opacity: 0.9 }}>直角三角形两直角边的平方和等于斜边的平方</p>
        </div>
      );
    }

    if (inFormulaScene && showFormula) {
      return (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            opacity: triangleOpacity,
            marginBottom: 40,
          }}>
            <Triangle progress={1} />
          </div>
          <div style={{
            opacity: formulaOpacity,
          }}>
            <Formula progress={formulaProgress} />
          </div>
        </div>
      );
    }

    if (inTriangleScene && showTriangle) {
      return (
        <div style={{
          opacity: triangleOpacity,
        }}>
          <Triangle progress={triangleProgress} />
        </div>
      );
    }

    // Default: title scene
    return (
      <div style={{
        opacity: titleOpacity,
        transform: `scale(${titleScale})`,
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: %d,
          fontWeight: 'bold',
          color: '#ffffff',
          margin: 0,
          textShadow: '0 4px 20px rgba(0,0,0,0.3)',
          fontFamily: "'Noto Sans SC', sans-serif",
        }}>
          {title}
        </h1>
      </div>
    );
  };

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(135deg, #667eea 0%%, #764ba2 100%%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {renderContent()}
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="EducationalVideo"
        component={EducationalVideo}
        durationInFrames={%d}
        width={%d}
        height={%d}
        fps={%d}
        defaultProps={{
          title: "%s",
          showTriangle: %s,
          showFormula: %s,
        }}
      />
    </>
  );
};

registerRoot(Root);''' % (svg_size, line_width, line_width, line_width, label_font, label_font, label_font, font_size, total_frames, width, height, fps, title, str(has_triangle).lower(), str(has_formula).lower())

    async def _generate_with_llm(
        self,
        description: str,
        duration: int,
        fps: int,
        resolution: str,
        style: str,
        context: Dict[str, Any]
    ) -> str:
        """Generate code using LLM when templates don't match."""

        # For now, fall back to minimal template
        # In production, this would call an actual LLM API
        return self._template_minimal(description, duration, fps, resolution)

    async def _render_video(
        self,
        code: str,
        duration: int,
        fps: int,
        resolution: str,
        output_format: str,
        quality: str,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create Remotion project and render video."""

        try:
            # Extract composition ID from code
            composition_id = self._extract_composition_id(code)
            print(f"[DEBUG] Extracted composition ID: {composition_id}")

            # Create project structure
            await self._create_remotion_project(code)

            # Render video
            temp_video_path = await self._render_with_remotion(duration, fps, output_format, quality, composition_id)

            # Verify output
            if not temp_video_path.exists():
                raise Exception("Remotion rendering completed but no video file found")

            # Copy video to persistent output directory
            # Get task_id from input_data for better naming
            # Priority: MOTIA_TASK_ID env var > input_data.task_id > metadata.taskId > sessionId > timestamp
            task_id = (
                os.environ.get('MOTIA_TASK_ID') or  # Read taskId from environment variable set by sandbox
                input_data.get('task_id') or
                input_data.get('metadata', {}).get('taskId') or
                input_data.get('sessionId') or
                f"task_{int(time.time())}"
            )

            # Generate unique filename for this task
            # Use persistent file-based counter to share counts across processes (multi-turn conversations)
            video_number = self._get_next_video_number(task_id)
            output_filename = f"{task_id}_video_{video_number}.{output_format}"
            persistent_video_path = self.output_dir / output_filename

            shutil.copy2(temp_video_path, persistent_video_path)
            print(f"[DEBUG] Task ID: {task_id}, Video #{video_number}")
            print(f"[DEBUG] Copied video from {temp_video_path} to {persistent_video_path}")

            # Get actual video properties
            actual_duration = await self._get_video_duration(persistent_video_path)
            actual_fps = await self._get_video_fps(persistent_video_path)
            actual_resolution = await self._get_video_resolution(persistent_video_path)

            return {
                "video_path": persistent_video_path,
                "actual_duration": actual_duration,
                "actual_fps": actual_fps,
                "actual_resolution": actual_resolution
            }

        except Exception as e:
            raise Exception(f"Video rendering failed: {str(e)}")

    def _check_chrome_installation(self) -> str:
        """
        Check if Chrome headless shell is properly installed.

        Returns:
            str: Path to the Chrome binary

        Raises:
            Exception: If Chrome is not installed or not accessible
        """
        # Detect platform and architecture
        system = platform.system().lower()  # 'darwin' or 'linux'
        machine = platform.machine().lower()  # 'x86_64', 'arm64', etc.

        # Map to Chrome platform naming (matches directory name from zip)
        if system == "darwin":
            if machine == "arm64":
                chrome_subdir = "chrome-headless-shell-mac-arm64"
            else:  # x86_64
                chrome_subdir = "chrome-headless-shell-mac-x64"
        else:  # linux
            if machine == "aarch64":
                chrome_subdir = "chrome-headless-shell-linux-arm64"
            else:  # x86_64
                chrome_subdir = "chrome-headless-shell-linux64"

        # Chrome is extracted directly to: node_modules/.remotion/chrome-headless-shell/
        chrome_binary = (
            self.template_dir / "node_modules" / ".remotion" / "chrome-headless-shell" /
            chrome_subdir / "chrome-headless-shell"
        )

        # Check if Chrome binary exists
        if not chrome_binary.exists():
            # Build platform description for error message
            platform_desc = f"{system} ({machine})"
            raise Exception(
                f"Chrome Headless Shell not found at: {chrome_binary}\n\n"
                f"Detected platform: {platform_desc}\n"
                f"Expected directory: {chrome_subdir}\n\n"
                f"Please install Chrome Headless Shell by running:\n"
                f"  bash {self.template_dir.parent / 'scripts' / 'install-chrome.sh'}\n\n"
                f"Or manually download from:\n"
                f"  https://googlechromelabs.github.io/chrome-for-testing/\n"
            )

        # Check if binary is executable
        if not os.access(chrome_binary, os.X_OK):
            logging.warning(f"Chrome binary is not executable: {chrome_binary}")
            try:
                os.chmod(chrome_binary, 0o755)
                logging.info(f"Made Chrome binary executable: {chrome_binary}")
            except Exception as e:
                raise Exception(f"Failed to make Chrome binary executable: {e}")

        # Verify Chrome can run
        try:
            result = subprocess.run(
                [str(chrome_binary), "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                logging.info(f"✓ Chrome validated: {result.stdout.strip()}")
            else:
                logging.warning(f"Chrome --version check failed: {result.stderr}")
        except Exception as e:
            logging.warning(f"Could not verify Chrome version: {e}")

        logging.info(f"✓ Chrome installation validated: {chrome_binary}")
        return str(chrome_binary)

    async def _create_remotion_project(self, code: str):
        """Create Remotion project by copying pre-installed template."""

        # Check if template exists
        if not self.template_dir.exists():
            raise Exception(f"Template directory not found: {self.template_dir}")

        # NEW: Check Chrome installation before rendering
        logging.info("Checking Chrome installation...")
        self._chrome_binary = self._check_chrome_installation()

        # Copy template to project directory
        if self.project_dir.exists():
            shutil.rmtree(self.project_dir)

        # Install dependencies if not already installed in template
        template_node_modules = self.template_dir / "node_modules"
        if not template_node_modules.exists():
            print(f"[INFO] Template dependencies not found. Installing npm dependencies...")
            try:
                subprocess.run(
                    ["npm", "install"],
                    cwd=self.template_dir,
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=300  # 5 minutes timeout
                )
                print(f"[INFO] Template dependencies installed successfully")
            except subprocess.TimeoutExpired:
                raise Exception("npm install timed out after 5 minutes")
            except subprocess.CalledProcessError as e:
                raise Exception(f"npm install failed: {e.stderr}")

        # Copy template (exclude node_modules initially for speed)
        shutil.copytree(self.template_dir, self.project_dir,
                        ignore=shutil.ignore_patterns('node_modules'))

        # Copy node_modules separately (needed for runtime)
        project_node_modules = self.project_dir / "node_modules"
        if template_node_modules.exists():
            # Use copytree with ignore to speed up (exclude .cache, large build artifacts)
            shutil.copytree(
                template_node_modules,
                project_node_modules,
                ignore=shutil.ignore_patterns(
                    '.cache',
                    '*/test',
                    '*/tests',
                    '*.map',
                    '*.test.*'
                )
            )

            # Copy .cache directory with chrome-headless-shell
            src_cache = self.template_dir / "node_modules" / ".cache" / "remotion"
            if src_cache.exists():
                dst_cache = project_node_modules / ".cache" / "remotion"
                dst_cache.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_cache / "chrome-headless-shell",
                            dst_cache / "chrome-headless-shell")

        # DEBUG: Save generated code for debugging
        debug_code_path = Path("/tmp") / f"remotion_debug_code_{int(time.time())}.tsx"
        with open(debug_code_path, "w") as f:
            f.write(code)
        print(f"[DEBUG] Saved generated code to: {debug_code_path}")

        # Overwrite index.tsx with generated code (it contains Root component)
        src_dir = self.project_dir / "src"
        with open(src_dir / "index.tsx", "w") as f:
            f.write(code)

    async def _render_with_remotion(
        self,
        duration: int,
        fps: int,
        output_format: str,
        quality: str,
        composition_id: str = "MinimalVideo"
    ) -> Path:
        """Render video using Remotion CLI (using pre-installed template)."""

        # Quality presets
        quality_preset = {
            "low": "23",
            "medium": "24",
            "high": "25",
            "ultra": "26"
        }.get(quality, "24")

        # Use remotion CLI from template directory
        remotion_cli = self.template_dir / "node_modules" / ".bin" / "remotion"

        # Set environment to use template's node_modules
        env = os.environ.copy()
        env['NODE_PATH'] = str(self.template_dir / "node_modules")

        # Use the Chrome binary path from _check_chrome_installation()
        chrome_binary = Path(self._chrome_binary)

        # Point Remotion to Chrome Headless Shell
        env['CHROME_EXECUTABLE_PATH'] = str(chrome_binary)
        env['BROWSER_EXECUTABLE_PATH'] = str(chrome_binary)
        env['PUPPETEER_EXECUTABLE_PATH'] = str(chrome_binary)

        # Skip Chrome download - prevent any Chrome download attempts
        env['PUPPETEER_SKIP_CHROMIUM_DOWNLOAD'] = 'true'
        env['PUPPETEER_SKIP_DOWNLOAD'] = 'true'
        env['REMONITION_SKIP_BROWSER_DOWNLOAD'] = 'true'
        env['CHROME_SKIP_DOWNLOAD'] = 'true'
        env['NODE_ENV'] = 'production'  # Avoid dev mode auto-downloads
        env['REMONITION_SKIP_BUNDLE_DOWNLOAD'] = 'true'  # Skip bundle downloads

        # Make Chrome executable (just in case)
        os.chmod(chrome_binary, 0o755)

        # Render video using template's remotion CLI
        # Format: remotion render <entry-point.ts> <comp-id> <output-file.mp4>
        render_args = [
            str(remotion_cli),
            "render",
            str(self.project_dir / "src" / "index.tsx"),  # Entry point (must call registerRoot)
            composition_id,  # Dynamic composition ID
            str(self.project_dir / f"out/video.{output_format}"),  # Output file
            "--codec", "h264" if output_format == "mp4" else output_format,
            "--fps", str(fps),
            f"--frames=0-{duration * fps - 1}",  # Use frame range instead of duration
            "--jpeg-quality", quality_preset,
            "--concurrency=1"  # Use concurrency=1 to avoid bundler issues
        ]

        # DEBUG: Log the render command
        print(f"[DEBUG] Render command: {' '.join(render_args)}")
        print(f"[DEBUG] Working directory: {self.project_dir}")
        print(f"[DEBUG] Duration: {duration}, FPS: {fps}, Frame range: 0-{duration * fps - 1}")

        logging.info("Starting Remotion render...")
        result = subprocess.run(
            render_args,
            cwd=self.project_dir,
            env=env,
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )

        # ENHANCED: Log complete stdout and stderr
        logging.info(f"Remotion render completed with exit code: {result.returncode}")

        # Log full output (truncated for readability)
        if result.stdout:
            stdout_preview = result.stdout[-1000:] if len(result.stdout) > 1000 else result.stdout
            logging.info(f"STDOUT (last 1000 chars):\n{stdout_preview}")

        if result.stderr:
            stderr_preview = result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr
            logging.warning(f"STDERR (last 1000 chars):\n{stderr_preview}")

        # ENHANCED: Check stderr for errors even if returncode is 0
        if result.stderr:
            error_keywords = ['error', 'failed', 'exception', 'chrome', 'download', 'ECONNRESET', 'ETIMEDOUT']
            stderr_lower = result.stderr.lower()
            found_errors = [kw for kw in error_keywords if kw in stderr_lower]

            if found_errors:
                error_msg = f"Potential errors detected in Remotion output (exit code was {result.returncode}):\n"
                error_msg += f"Found keywords: {', '.join(found_errors)}\n"
                error_msg += f"STDERR: {result.stderr}\n"
                error_msg += f"STDOUT: {result.stdout[-500:] if result.stdout else ''}"
                logging.error(error_msg)
                raise Exception(error_msg)

        # Check exit code
        if result.returncode != 0:
            error_msg = self._format_render_error(result, "rendering")
            raise Exception(error_msg)

        # ENHANCED: Validate output file exists and is valid
        output_path = self.project_dir / "out" / f"video.{output_format}"
        logging.info(f"Validating output file: {output_path}")

        if not output_path.exists():
            error_msg = f"Remotion completed (exit code 0) but no output file found!\n"
            error_msg += f"Expected: {output_path}\n"
            error_msg += f"STDERR: {result.stderr}\n"
            error_msg += f"STDOUT: {result.stdout[-500:] if result.stdout else ''}"
            logging.error(error_msg)
            raise Exception(error_msg)

        # Validate file size (must be at least 1KB)
        file_size = output_path.stat().st_size
        if file_size < 1024:
            error_msg = f"Generated video is too small: {file_size} bytes\n"
            error_msg += f"File: {output_path}\n"
            error_msg += f"STDERR: {result.stderr}\n"
            error_msg += f"This usually indicates rendering failed silently."
            logging.error(error_msg)
            raise Exception(error_msg)

        logging.info(f"✓ Output file validated: {output_path} ({file_size} bytes)")
        return output_path

    def _format_render_error(self, result, phase: str = "render") -> str:
        """
        Format Remotion render error with complete context.

        Args:
            result: subprocess result object
            phase: Phase where error occurred

        Returns:
            Formatted error message
        """
        error_msg = f"""
=== Remotion Video Generation Error ===
Phase: {phase}
Exit Code: {result.returncode}

STDERR:
{result.stderr}

STDOUT (last 1000 chars):
{result.stdout[-1000:] if result.stdout else ''}

Environment:
- CHROME_EXECUTABLE_PATH: {os.environ.get('CHROME_EXECUTABLE_PATH', 'NOT SET')}
- PUPPETEER_SKIP_DOWNLOAD: {os.environ.get('PUPPETEER_SKIP_DOWNLOAD', 'NOT SET')}
- Working Directory: {self.project_dir}
"""
        return error_msg

    async def _generate_thumbnail(self, video_path: Path) -> Optional[Dict[str, Path]]:
        """Generate thumbnail from video."""
        try:
            thumbnail_path = video_path.parent / "thumbnail.jpg"

            # Try ffmpeg to extract frame at 1 second
            result = subprocess.run([
                "ffmpeg", "-i", str(video_path),
                "-ss", "00:00:01",
                "-vframes", "1",
                "-vf", "scale=320:240",
                "-y",
                str(thumbnail_path)
            ], capture_output=True, text=True, timeout=30)

            if result.returncode == 0 and thumbnail_path.exists():
                return {"thumbnail_path": thumbnail_path}
            else:
                return None

        except (subprocess.TimeoutExpired, FileNotFoundError):
            # ffmpeg not available or timeout
            return None

    async def _get_video_duration(self, video_path: Path) -> float:
        """Get actual video duration using ffprobe."""
        try:
            result = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries",
                "format=duration", "-of", "csv=p=0", str(video_path)
            ], capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                duration_str = result.stdout.strip()
                return float(duration_str)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
        return 10.0  # Default fallback

    async def _get_video_fps(self, video_path: Path) -> int:
        """Get actual video FPS using ffprobe."""
        try:
            result = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries",
                "stream=r_frame_rate=avg_frame_rate", "-of", "csv=p=0", str(video_path)
            ], capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                fps_str = result.stdout.strip()
                # Handle fractional fps like "30/1" -> 30
                if '/' in fps_str:
                    return int(fps_str.split('/')[0])
                return int(float(fps_str))
        except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
            pass
        return 30  # Default fallback

    async def _get_video_resolution(self, video_path: Path) -> str:
        """Get actual video resolution using ffprobe."""
        try:
            result = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries",
                "stream=width,height", "-of", "csv=p=0", str(video_path)
            ], capture_output=True, text=True, timeout=10)

            if result.returncode == 0:
                resolution_str = result.stdout.strip()
                # Format is "width,height"
                if ',' in resolution_str:
                    dimensions = resolution_str.split(',')
                    return f"{int(dimensions[0])}x{int(dimensions[1])}"
        except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
            pass
        return "1920x1080"  # Default fallback

    def _extract_title(self, description: str) -> str:
        """Extract a concise title from description."""
        # Simple extraction - take first sentence or truncate
        if '.' in description:
            title = description.split('.')[0].strip()
        elif len(description) > 50:
            title = description[:47] + "..."
        else:
            title = description
        return title

    def _normalize_resolution(self, resolution: str) -> str:
        """
        Normalize resolution shorthand formats to standard 'WIDTHxHEIGHT' format.

        Supports:
        - '1080p' -> '1920x1080'
        - '720p' -> '1280x720'
        - '480p' -> '854x480'
        - '360p' -> '640x360'
        - '240p' -> '426x240'
        - '144p' -> '256x144'
        - '4K' -> '3840x2160'
        - '1920x1080' -> '1920x1080' (already normalized)
        """
        # Common resolution mappings
        resolution_map = {
            '4k': '3840x2160',
            '2160p': '3840x2160',
            '1440p': '2560x1440',
            '1080p': '1920x1080',
            '720p': '1280x720',
            '480p': '854x480',
            '360p': '640x360',
            '240p': '426x240',
            '144p': '256x144',
        }

        # Convert to lowercase for case-insensitive matching
        resolution_lower = resolution.lower().strip()

        # Check if it's already in 'WIDTHxHEIGHT' format
        if 'x' in resolution_lower:
            # Validate it's a valid format (has exactly one 'x')
            parts = resolution_lower.split('x')
            if len(parts) == 2 and parts[0].strip().isdigit() and parts[1].strip().isdigit():
                return resolution_lower

        # Look up in mapping
        if resolution_lower in resolution_map:
            return resolution_map[resolution_lower]

        # If not recognized, try to extract just the number (e.g., '1080' from '1080p')
        import re
        match = re.match(r'(\d+)p?', resolution_lower)
        if match:
            height = match.group(1)
            # Common aspect ratio is 16:9
            width = int(int(height) * 16 / 9)
            return f"{width}x{height}"

        # Fallback to default
        return '1920x1080'

    def __del__(self):
        """Cleanup temporary directory."""
        if hasattr(self, 'temp_dir') and self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)


# Main skill function - PTC will call this
async def generate_video(input_data: Dict[str, Any], context=None) -> Dict[str, Any]:
    """
    Main entry point for remotion-generator skill.

    This is the function that PTC-generated code will call:
    video_result = await executor.execute('remotion-generator', {...})
    """
    generator = RemotionVideoGenerator()

    try:
        if context:
            await context.report_step("Initializing video generator...")

        result = await generator.generate_video(input_data, context)
        return result
    finally:
        # Ensure cleanup
        del generator
