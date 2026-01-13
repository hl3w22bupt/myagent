"""
Remotion Code Generator - Phase 2: Enhanced Prompt Version (v2.0)

Optimized prompt with Few-Shot examples, detailed scene management patterns,
concrete visualization components, and performance optimization guidelines.

Version: 2.0
Improvements:
- Enhanced system prompt with expertise and standards
- Few-Shot code examples (2 complete examples)
- Detailed scene management implementation patterns
- Concrete visualization component implementations
- Performance optimization specific techniques
- Common pitfalls and best practices
"""

import json
import logging
from typing import Dict, Any, Optional

from .base_generator import BaseGenerator, GenerationResult

logger = logging.getLogger(__name__)


class RemotionCodeGeneratorV2(BaseGenerator):
    """
    Enhanced Remotion Code Generator with optimized prompts (v2.0).

    This version includes:
    - Expert-level system prompt
    - Few-Shot complete code examples
    - Detailed scene management patterns
    - Concrete visualization components
    - Performance optimization guidelines
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
            error_context: Optional error feedback for retry

        Returns:
            Complete TypeScript/Remotion code
        """
        # Check cache
        cache_key = self._make_cache_key(
            "generate_v2", analysis, duration, fps, resolution
        )
        cached = self._get_from_cache(cache_key)
        if cached:
            logger.info("Using cached generated code (v2)")
            return cached

        # Build enhanced code generation prompt
        prompt = self._build_code_prompt_v2(
            analysis, duration, fps, resolution, error_context
        )

        # Call LLM
        try:
            response = await self._llm_call_with_fallback(
                prompt=prompt,
                max_tokens=8000,  # Increased to prevent code truncation
                temperature=0.2,  # Lower for consistent code
                system_prompt=self._get_system_prompt_v2()
            )

            # Extract code from response
            code = self._extract_code_from_response(response, "typescript")

            # DEBUG: Check if extraction worked
            if code.strip().startswith("```"):
                logger.warning(f"⚠️  Code extraction failed - still has markdown markers!")
                logger.warning(f"   Code starts with: {code[:100]}")
                # Try manual extraction
                if "```typescript" in response:
                    start = response.find("```typescript") + len("```typescript")
                    end = response.find("```", start)
                    if end != -1:
                        code = response[start:end].strip()
                        logger.info(f"✅ Manual extraction successful")
                elif "```" in response:
                    start = response.find("```") + 3
                    newline = response.find("\n", start)
                    if newline != -1:
                        start = newline + 1
                        end = response.find("```", start)
                        if end != -1:
                            code = response[start:end].strip()
                            logger.info(f"✅ Manual extraction successful (generic)")

            # Cache result
            self._set_cache(cache_key, code)
            self.stats["total_generations"] += 1

            logger.info("Remotion v2.0 code generation complete")
            return code

        except Exception as e:
            logger.error(f"Code generation failed: {str(e)}")
            # Do NOT use fallback - let the error propagate
            raise

    # _get_fallback_code removed as per user requirement

    def _get_system_prompt_v2(self) -> str:
        """Get enhanced system prompt for code generation (v2.0)."""
        return """You are a senior Remotion/React developer specializing in educational mathematics videos.

**Your Expertise**:
- Deep knowledge of Remotion API and best practices
- Expert in React functional components and TypeScript
- Understanding of video rendering performance optimization
- Experience with mathematical visualization in web technologies

**Code Quality Standards**:
- **Clean Code**: Semantic naming, single responsibility, DRY principles
- **Type Safety**: Proper TypeScript interfaces, no `any` without justification
- **Performance**: Optimized for 60fps rendering, avoid unnecessary re-renders
- **Maintainability**: Clear component structure, well-commented complex logic
- **Remotion Best Practices**: Proper use of hooks, interpolation, and sequences

**Your Approach**:
1. Start with the analysis - understand what needs to be visualized
2. Design component hierarchy - separate concerns
3. Implement efficient animations - use interpolate/spring appropriately
4. Optimize for performance - useMemo, useCallback, pre-calculate
5. Ensure accessibility - readable fonts, contrast, clear visuals"""

    def _build_code_prompt_v2(
        self,
        analysis: Dict[str, Any],
        duration: int,
        fps: int,
        resolution: str,
        error_context: Optional[str] = None
    ) -> str:
        """Build enhanced code generation prompt with Few-Shot examples (v2.0)."""
        width, height = resolution.split("x")
        total_frames = duration * fps

        error_section = ""
        if error_context:
            error_section = """

## Previous Attempt Issues
{}

Please address these issues in your new implementation.""".format(error_context)

        # Get scene breakdown
        scene_breakdown = self._format_scene_breakdown_v2(analysis.get('scenes', []), total_frames)

        # Build prompt using format() to avoid f-string brace escaping
        prompt = """Generate complete Remotion TypeScript/React code based on the educational content analysis.

## Content Analysis
```json
{}
```

## Video Parameters
- Duration: {} seconds
- FPS: {}
- Resolution: {} ({}x{})
- Total Frames: {}

---

## Complete File Example (Reference)

Study this complete, renderable Remotion file structure. NOTE: This shows the REQUIRED structure - your output must have similar imports, export, Composition, and registerRoot.

Key structural requirements:
1. Import Composition and registerRoot from 'remotion'
2. Define all your components (interfaces, helpers, scenes)
3. EXPORT your main component: export const MainComponent: React.FC = () => (your component body)
4. Define Composition at the end with id, component, durationInFrames, fps, width, height
5. Call registerRoot(MainComponent) as the very last line

Your output should follow this pattern but with your actual content.

---

## Code Structure Requirements

### Complete File Structure (CRITICAL)
Your output must be a COMPLETE, RENDERABLE Remotion entry point file with:

1. **Import Statements** (at the very top)
   - Must include: React from 'react'
   - Must include: Composition, registerRoot from 'remotion'
   - Must include: AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence from 'remotion'
   - Only import Video if you need to embed video files in your composition

2. **Component Definitions** (after all imports)
   - Define TypeScript interfaces for your props
   - Create reusable visualization components (graphs, formulas, etc.)
   - Create scene-specific components (Scene1, Scene2, Scene3, etc.)
   - Create main video component that orchestrates all scenes

3. **Export Statement** (before the Composition)
   - You MUST export your main component like: export const MyVideo: React.FC
   - The component should be defined with proper TypeScript typing

4. **Composition Component** (at the end, before registerRoot)
   - Create a Composition with these required props:
     - id: A unique string identifier for your composition
     - component: Your exported main component
     - durationInFrames: Total number of frames (use provided value)
     - fps: Frames per second (use provided value)
     - width: Video width (use provided value)
     - height: Video height (use provided value)

5. **registerRoot Call** (the VERY LAST line of your file)
   - MUST call registerRoot(YourMainComponent) as the final line
   - This is CRITICAL for Remotion to recognize your composition

### Component Organization Checklist
- Import ALL required Remotion hooks and utilities
- Define TypeScript interfaces for component props
- Create helper components for common visualizations
- Create scene components for each major section
- Create main component that manages scene transitions
- EXPORT your main component
- Define Composition with all required props
- Call registerRoot with your main component

### Scene Management Pattern (Conceptual)
Instead of frame-based scene switching, use Sequence from Remotion for cleaner code:

- Import Sequence from 'remotion'
- Calculate scene durations as fractions of total frames
- Use Sequence component with 'from' and 'durationInFrames' props
- Nest scenes to create sequential playback
- Each Sequence renders only during its designated time range

Example structure:
- Scene 1: from frame 0, duration 25% of total
- Scene 2: from frame (scene1End), duration 35% of total
- Scene 3: from frame (scene1End + scene2End), duration 40% of total

---

## Performance Optimization

### 1. Use useMemo for expensive calculations
Memoize expensive calculations to avoid recomputing on every frame:
- Call useMemo with a function that returns computed values
- Pass dependencies array as second argument

### 2. Pre-calculate positions
Calculate positions once and reuse them:
- Define center positions using useMemo with x and y coordinates
- Use these pre-calculated values in your render

### 3. Conditional rendering
Only render components when needed:
- Use boolean AND operator: shouldShow && <Component />
- This prevents unnecessary component creation

---

## Visualization Components

### Formula Display
Create a component to display mathematical formulas:
- Use functional component with TypeScript props interface
- Props should include the formula string
- Style with Georgia font for mathematical look
- Large font size (48px or larger) for readability

### SVG Graph
Create a component to render function graphs:
- Define interface for props (data array, function, etc.)
- Use SVG element with viewBox for scalability
- Generate SVG path data from mathematical functions
- Style with stroke color and width for visibility

---

## Scene Breakdown
{}

## Topic-Specific Guidelines
{}

## Code Quality Checklist
- Valid TypeScript syntax
- Proper interfaces (no `any` without justification)
- Performance-optimized (useMemo, pre-calculate)
- Accessible (font sizes > 16, color contrast > 4.5:1)
- Scene timing sums to 100%
- No hardcoded frame numbers
- Complete, working code (no placeholders)

---

## Output Requirements

**CRITICAL** - Your code MUST include:
1. ✅ All required imports (including Composition and registerRoot)
2. ✅ All component definitions (interfaces, helper components, scenes)
3. ✅ export statement for your main component (e.g., export const MyVideo)
4. ✅ Composition component definition with all required props
5. ✅ registerRoot(YourMainComponent) call as the very last line

**Format Requirements**:
- Output ONLY the complete TypeScript code
- Wrap code in \\```typescript code blocks
- No explanations outside code blocks
- No placeholders - provide complete, working code
- Ensure code is ready to run without modifications
- Code must pass `remotion render` without errors

Generate the complete, production-ready Remotion code now.""".format(
    json.dumps(analysis, indent=2, ensure_ascii=False),
    duration, fps, resolution, width, height, total_frames,
    scene_breakdown,
    self._get_topic_guidelines_v2(analysis['topic'].get('category', 'general'))
)

        return prompt

    def _sanitize_composition_id(self, topic_name: str) -> str:
        """Sanitize topic name for use as composition ID."""
        # Remove special characters, replace spaces with underscores
        sanitized = topic_name.replace(" ", "_").replace("-", "_")
        sanitized = "".join(c for c in sanitized if c.isalnum() or c == "_")
        return f"{sanitized}_Video"

    def _format_scene_breakdown_v2(
        self,
        scenes: list,
        total_frames: int
    ) -> str:
        """Format scene breakdown with detailed implementation hints (v2.0)."""
        if not scenes:
            return "No specific scene breakdown provided."

        lines = ["## Scene Breakdown with Implementation Hints"]
        lines.append("")

        current_frame = 0

        for i, scene in enumerate(scenes, 1):
            percent = scene.get("duration_percent", 20)
            frames = int(total_frames * percent / 100)
            end_frame = current_frame + frames

            scene_type = scene.get('content_type', 'demonstration')
            hints = self._get_scene_implementation_hint(scene_type)

            lines.append(f"**Scene {i}: {scene.get('title', 'Untitled')}**")
            lines.append(f"- Frame range: {current_frame}-{end_frame} ({percent}%)")
            lines.append(f"- Content type: {scene_type}")
            lines.append(f"- Description: {scene.get('description', 'No description')}")
            lines.append(f"- Visual elements: {', '.join(scene.get('visual_elements', []))}")
            lines.append(f"- Implementation: {hints}")
            lines.append("")

            current_frame = end_frame

        return "\n".join(lines)

    def _get_scene_implementation_hint(self, scene_type: str) -> str:
        """Get implementation hint for scene type."""
        hints = {
            "title": "Fade in title text, use scale spring animation",
            "introduction": "Build up concept gradually, reveal key elements step-by-step",
            "demonstration": "Show main content with clear visual steps, use smooth animations",
            "example": "Display step-by-step calculation, highlight current step",
            "summary": "Fade in summary points, use bullet list format"
        }
        return hints.get(scene_type, "Clear visual explanation with animations")

    def _get_topic_guidelines_v2(self, category: str) -> str:
        """Get enhanced topic-specific guidelines (v2.0)."""
        guidelines = {
            "calculus": """
**Calculus-Specific Guidelines**:
- **Curve Visualization**: Use SVG paths for function graphs
  ```typescript
  const pathData = `M ${{points.map(p => p.join(',')).join(' L ')}}`;
  ```
- **Area Accumulation**: Show integral as filled area under curve
- **Limit Process**: Animate approximation improving step-by-step
- **Animation**: Use interpolate for smooth transitions, spring for organic movement
- **Color Coding**: Use different colors for f(x), f'(x), f''(x)

**Example for Taylor Series**:
- Show curve approximation improving with each term
- Animate polynomials converging to target function
- Color-code: original (blue), linear approx (green), quadratic (orange)
""",
            "geometry": """
**Geometry-Specific Guidelines**:
- **Shape Construction**: Build shapes step-by-step with animation
- **Labeling**: Always label sides/angles with clear text
- **Color Highlighting**: Emphasize important elements with accent colors
- **Proof Diagrams**: Show step-by-step visual reasoning
- **Transformations**: Use rotate/scale transforms to show relationships

**SVG Shapes**:
- Use `<circle>`, `<rect>`, `<polygon>` for basic shapes
- Use `<text>` for labels with clear positioning
- Use `<line>` for dashed construction lines
""",
            "algebra": """
**Algebra-Specific Guidelines**:
- **Equation Steps**: Show transformations step-by-step
- **Highlighting**: Color-code terms to track variables
- **Function Graphs**: Show equations as visual curves
- **Balance Metaphor**: Visualize equation solving as balance

**Formula Display**:
- Use superscript `<sup>` and subscript `<sub>` for exponents
- Use proper spacing around operators
- Keep equations on single line if possible, or use clear line breaks
""",
            "statistics": """
**Statistics-Specific Guidelines**:
- **Distributions**: Show bell curves with shaded regions
- **Probability Trees**: Use branching diagrams with labels
- **Sampling**: Visualize data collection process
- **Confidence Intervals**: Show shaded regions on distributions

**Visualization**:
- Use smooth curves for normal distribution
- Use bar charts for categorical data
- Use line graphs for trends over time
"""
        }
        return guidelines.get(category, """
**General Guidelines**:
- Keep visualizations clear and simple
- Use color to highlight important elements
- Ensure text is readable at video resolution
- Animate smoothly to avoid jarring movements
""")

    async def generate_result(self, analysis: Dict[str, Any], **kwargs) -> GenerationResult:
        """Generate code with result metadata."""
        try:
            code = await self.generate(analysis, **kwargs)

            return GenerationResult(
                code=code,
                metadata={
                    "type": "remotion_code_v2",
                    "topic": analysis["topic"]["name"],
                    "version": "2.0"
                },
                success=True
            )

        except Exception as e:
            logger.error(f"Code generation failed: {str(e)}")
            # Return failed result without fallback code - let caller handle retries
            return GenerationResult(
                code="",  # No fallback code per user requirement
                metadata={"type": "remotion_code_v2"},
                success=False,
                errors=[str(e)]
            )
