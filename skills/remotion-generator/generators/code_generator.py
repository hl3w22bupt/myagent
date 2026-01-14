"""
Remotion Code Generator - Phase 2 of Two-Stage Generation

Generates complete Remotion TypeScript/React code based on content analysis.
"""

import json
import logging
from typing import Dict, Any, Optional

from .base_generator import BaseGenerator, GenerationResult

logger = logging.getLogger(__name__)


class RemotionCodeGenerator(BaseGenerator):
    """
    Generates Remotion code from content analysis.

    This is Phase 2 of the two-stage generation process:
    - Phase 1: Content Analysis (ContentAnalyzer)
    - Phase 2: Code Generation (this class)
    """

    async def generate(
        self,
        analysis: Dict[str, Any],
        duration: int = 10,
        fps: int = 30,
        resolution: str = "1920x1080",
        error_context: Optional[str] = None
    ) -> str:
        """
        Generate Remotion code from content analysis.

        Args:
            analysis: Content analysis from Phase 1
            duration: Video duration in seconds
            fps: Frames per second
            resolution: Video resolution (e.g., "1920x1080")
            error_context: Optional error feedback from validation

        Returns:
            Complete TypeScript/Remotion code
        """
        # Check cache
        cache_key = self._make_cache_key(
            "generate", analysis, duration, fps, resolution
        )
        cached = self._get_from_cache(cache_key)
        if cached:
            logger.info("Using cached generated code")
            return cached

        # Build generation prompt
        prompt = self._build_code_prompt(
            analysis, duration, fps, resolution, error_context
        )

        # Call LLM
        try:
            response = await self._llm_call_with_fallback(
                prompt=prompt,
                max_tokens=4000,  # Longer for code
                temperature=0.2,  # Lower for consistent code
                system_prompt=self._get_system_prompt()
            )

            # Extract code from response
            code = self._extract_code_from_response(response, "typescript")

            # Cache result
            self._set_cache(cache_key, code)
            self.stats["total_generations"] += 1

            logger.info("Remotion code generation complete")
            return code

        except Exception as e:
            logger.error(f"Code generation failed: {str(e)}")
            # Return minimal fallback code
            return self._get_fallback_code(analysis, duration, fps, resolution)

    async def generate_from_description(
        self,
        description: str,
        duration: int = 10,
        fps: int = 30,
        resolution: str = "1920x1080"
    ) -> str:
        """
        Convenience method: Generate code directly from description.

        This combines Phase 1 (analysis) and Phase 2 (generation).

        Args:
            description: User's natural language description
            duration: Video duration in seconds
            fps: Frames per second
            resolution: Video resolution

        Returns:
            Complete TypeScript/Remotion code
        """
        # Import here to avoid circular dependency
        from .llm_analyzer import ContentAnalyzer

        # Phase 1: Analyze
        analyzer = ContentAnalyzer(llm_client=self.llm)
        analysis = await analyzer.analyze(description)

        # Phase 2: Generate code
        code = await self.generate(analysis, duration, fps, resolution)

        return code

    async def generate_result(
        self,
        analysis: Dict[str, Any],
        duration: int = 10,
        fps: int = 30,
        resolution: str = "1920x1080"
    ) -> GenerationResult:
        """
        Generate code with result metadata (implements BaseGenerator interface).

        Args:
            analysis: Content analysis
            duration: Video duration
            fps: Frames per second
            resolution: Video resolution

        Returns:
            GenerationResult with code and metadata
        """
        try:
            code = await self.generate(analysis, duration, fps, resolution)

            return GenerationResult(
                code=code,
                metadata={
                    "type": "remotion_code",
                    "topic": analysis["topic"]["name"],
                    "duration": duration,
                    "fps": fps,
                    "resolution": resolution,
                    "num_scenes": len(analysis.get("scenes", []))
                },
                success=True
            )

        except Exception as e:
            logger.error(f"Code generation failed: {str(e)}")
            return GenerationResult(
                code=self._get_fallback_code(analysis, duration, fps, resolution),
                metadata={
                    "type": "remotion_code",
                    "topic": analysis.get("topic", {}).get("name", "unknown")
                },
                success=False,
                errors=[str(e)]
            )

    def _get_system_prompt(self) -> str:
        """Get system prompt for code generation."""
        return """You are an expert Remotion/React developer specializing in educational math videos.

You generate clean, idiomatic TypeScript code with:
- Proper React functional components
- Correct TypeScript interfaces
- Efficient use of Remotion APIs (useCurrentFrame, interpolate, spring)
- Semantic, readable code
- Performance-optimized rendering"""

    def _build_code_prompt(
        self,
        analysis: Dict[str, Any],
        duration: int,
        fps: int,
        resolution: str,
        error_context: Optional[str] = None
    ) -> str:
        """Build code generation prompt from analysis."""
        width, height = resolution.split("x")
        total_frames = duration * fps

        error_section = ""
        if error_context:
            error_section = f"""

## Previous Attempt Issues
{error_context}

Please address these issues in your new implementation."""

        return f"""Generate complete Remotion TypeScript/React code based on the educational content analysis.

## Content Analysis
```json
{json.dumps(analysis, indent=2, ensure_ascii=False)}
```

## Video Parameters
- Duration: {duration} seconds
- FPS: {fps}
- Resolution: {resolution} ({width}x{height})
- Total Frames: {total_frames}

## Code Requirements

### 1. Structure
```typescript
import {{ Composition, AbsoluteFill, useCurrentFrame, useVideoConfig,
         interpolate, spring, registerRoot }} from 'remotion';
import React from 'react';

// Component interfaces
interface Props {{
  // ... define props
}}

// Scene components
const Scene1: React.FC<Props> = ({{ ... }}) => {{ ... }};
const Scene2: React.FC<Props> = ({{ ... }}) => {{ ... }};

// Main composition
const EducationalVideo: React.FC<Props> = ({{ title, ... }}) => {{
  // Scene timing logic
  // Render current scene
}};

export const Root: React.FC = () => {{
  return (
    <Composition
      id="YourVideoId"
      // CRITICAL: Composition id can ONLY contain:
      // - Letters (a-z, A-Z), Numbers (0-9)
      // - Hyphens (-), CJK characters
      // NO UNDERSCORES (_) or special characters!
      // Example: ✅ "MyVideo-Component", ❌ "My_Video_Component"
      component={{YourComponentName}}
      durationInFrames={{total_frames}}
      width={{width}}
      height={{height}}
      fps={{fps}}
      defaultProps={{{{ ... }}}}
    />
  );
}};

registerRoot(Root);
```

### 2. Scene Management
- Use `frame` and `durationInFrames` to determine current scene
- Implement smooth transitions between scenes
- Each scene should have clear visual purpose

### 3. Animations
- Use `interpolate()` for linear animations (opacity, position)
- Use `spring()` for organic animations (scale, rotation)
- Ensure animations complete before scene transitions

### 4. Visualization Components
Create specialized components for:
- **Math Formulas**: Use proper formatting (superscripts, subscripts)
- **Text**: Readable fonts (Georgia for formulas, sans-serif for text)
- **Simple Graphics**: Basic SVG shapes (rectangles, circles, lines)

### 5. Color & Style
- Use the suggested color scheme from analysis
- Ensure text contrast (WCAG AA minimum)
- Professional, educational aesthetic

### 6. Performance
- Avoid complex calculations in render
- Use simple values where possible
- Pre-calculate values where feasible

## Scene Breakdown
{self._format_scene_breakdown(analysis.get('scenes', []), total_frames)}

## Topic-Specific Guidelines
{self._get_topic_guidelines(analysis['topic'].get('category', 'general'))}

## Code Quality Checklist
- Valid TypeScript syntax
- No `any` types without justification
- Proper prop interfaces
- Accessible colors and font sizes
- Responsive to frame count
- No hardcoded duration values (use percentages of total_frames){error_section}

## Output
Output ONLY the complete TypeScript code, wrapped in ```typescript code blocks.
No explanations, no markdown outside the code block."""

    def _sanitize_composition_id(self, topic_name: str) -> str:
        """
        Sanitize topic name for use as composition ID (fallback code only).

        NOTE: This is only used for generating fallback/minimal code.
        The LLM prompt already constrains composition ID format, so LLM-generated
        code should always have correct IDs. This is just a safety measure for
        our manually written fallback templates.
        """
        # Replace spaces and underscores with hyphens
        sanitized = topic_name.replace(" ", "-").replace("_", "-")
        # Keep only alphanumeric and hyphens
        sanitized = "".join(c for c in sanitized if c.isalnum() or c == "-")
        # Clean up consecutive/leading/trailing hyphens
        sanitized = "-".join(filter(None, sanitized.split("-")))
        return f"{sanitized}-Video"

    def _format_scene_breakdown(
        self,
        scenes: list,
        total_frames: int
    ) -> str:
        """Format scene breakdown for prompt."""
        if not scenes:
            return "No specific scene breakdown provided."

        lines = ["Scene Breakdown:"]
        current_frame = 0

        for i, scene in enumerate(scenes, 1):
            percent = scene.get("duration_percent", 20)
            frames = int(total_frames * percent / 100)
            end_frame = current_frame + frames

            lines.append(
                f"- Scene {i} ({scene.get('title', 'Untitled')}): "
                f"Frames {current_frame}-{end_frame} ({percent}%) - "
                f"{scene.get('description', 'No description')}"
            )

            current_frame = end_frame

        return "\n".join(lines)

    def _get_topic_guidelines(self, category: str) -> str:
        """Get topic-specific guidelines."""
        guidelines = {
            "calculus": """
- Show curves with simple SVG paths when possible
- Use smooth animations for transformations
- Color-code different functions/curves
- Keep formulas simple and readable
""",
            "geometry": """
- Clear, labeled diagrams
- Simple shapes (circles, triangles, rectangles)
- Highlight important angles or sides
- Use color to distinguish elements
""",
            "algebra": """
- Step-by-step equation transformations
- Highlight important terms
- Use color to track variables
- Keep equations readable
""",
            "general": """
- Focus on clear text explanations
- Use simple, clean layouts
- Emphasize key concepts
- Keep visual distractions minimal
"""
        }

        return guidelines.get(category, guidelines["general"])

    def _get_fallback_code(
        self,
        analysis: Dict[str, Any],
        duration: int,
        fps: int,
        resolution: str
    ) -> str:
        """Get minimal fallback code when generation fails."""
        width, height = resolution.split("x")
        total_frames = duration * fps
        topic_name = analysis.get("topic", {}).get("name", "Topic")
        composition_id = self._sanitize_composition_id(topic_name)

        # Extract color scheme
        colors = analysis.get("visualization", {}).get("color_scheme", {})
        primary = colors.get("primary", "#3B82F6")
        bg_color = "#1F2937"  # Dark gray background

        return f'''import {{
  Composition,
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  registerRoot
}} from 'remotion';
import React from 'react';

interface EducationalVideoProps {{
  title: string;
}}

const EducationalVideo: React.FC<EducationalVideoProps> = ({{ title }}) => {{
  const frame = useCurrentFrame();
  const {{ durationInFrames }} = useVideoConfig();

  // Fade in animation
  const opacity = interpolate(frame, [0, 30], [0, 1], {{
    extrapolateRight: 'clamp'
  }});

  // Fade out animation
  const fadeOut = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {{
    extrapolateLeft: 'clamp'
  }});

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '{bg_color}',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          opacity: opacity * fadeOut,
          color: '{primary}',
          fontSize: 80,
          fontWeight: 'bold',
          textAlign: 'center',
          fontFamily: 'Arial, sans-serif'
        }}
      >
        {{title}}
      </div>
      <div
        style={{
          opacity: opacity * fadeOut,
          color: '#ffffff',
          fontSize: 40,
          marginTop: 40,
          textAlign: 'center',
          fontFamily: 'Georgia, serif'
        }}
      >
        Educational Video
      </div>
    </AbsoluteFill>
  );
}};

export const Root: React.FC = () => {{
  return (
    <Composition
      id="{composition_id}"
      component={EducationalVideo}
      durationInFrames={total_frames}
      width={width}
      height={height}
      fps={fps}
      defaultProps={{
        title: "{topic_name}"
      }}
    />
  );
}};

registerRoot(Root);
'''
