"""
Content Analyzer - Phase 1 of Two-Stage Generation

Analyzes user descriptions to extract structured information for code generation.
"""

import json
import logging
from typing import Dict, Any, Optional, List

from .base_generator import BaseGenerator, GenerationResult

logger = logging.getLogger(__name__)


class ContentAnalyzer(BaseGenerator):
    """
    Analyzes user video descriptions to extract structured information.

    This is Phase 1 of the two-stage generation process:
    - Phase 1: Content Analysis (this class)
    - Phase 2: Code Generation (RemotionCodeGenerator)
    """

    async def analyze(self, description: str) -> Dict[str, Any]:
        """
        Analyze user description and extract structured information.

        Args:
            description: User's natural language description of desired video

        Returns:
            Dict with structured analysis including:
            - topic: Subject matter and category
            - key_elements: Formulas, visuals, logic steps
            - scenes: Scene breakdown with timing
            - visualization: Visual style and animation preferences
            - educational: Teaching approach and key points
        """
        # Check cache
        cache_key = self._make_cache_key("analyze", description)
        cached = self._get_from_cache(cache_key)
        if cached:
            logger.info(f"Using cached analysis for: {description[:50]}...")
            return cached

        # Build analysis prompt
        prompt = self._build_analysis_prompt(description)

        # Call LLM
        try:
            response = await self._llm_call_with_fallback(
                prompt=prompt,
                max_tokens=2000,
                temperature=0.3,  # Low temperature for consistent analysis
                system_prompt=self._get_system_prompt()
            )

            # Parse JSON response
            analysis = self._extract_json_from_response(response)

            # Normalize and validate
            analysis = self._normalize_analysis(analysis, description)

            # Cache result
            self._set_cache(cache_key, analysis)
            self.stats["total_generations"] += 1

            logger.info(f"Analysis complete: {analysis['topic']['name']}")
            return analysis

        except Exception as e:
            logger.error(f"Analysis failed: {str(e)}")
            # Return default analysis
            return self._get_default_analysis(description)

    async def generate(self, description: str, **kwargs) -> GenerationResult:
        """
        Generate analysis (implements BaseGenerator interface).

        Args:
            description: User description
            **kwargs: Additional parameters

        Returns:
            GenerationResult with analysis
        """
        try:
            analysis = await self.analyze(description)

            return GenerationResult(
                code=json.dumps(analysis, indent=2, ensure_ascii=False),
                metadata={
                    "type": "content_analysis",
                    "topic": analysis["topic"]["name"],
                    "num_scenes": len(analysis["scenes"])
                },
                success=True
            )

        except Exception as e:
            logger.error(f"Analysis generation failed: {str(e)}")
            return GenerationResult(
                code="{}",
                metadata={"type": "content_analysis"},
                success=False,
                errors=[str(e)]
            )

    def _get_system_prompt(self) -> str:
        """Get system prompt for content analysis."""
        return """You are an educational video content analyzer specializing in mathematics and science.

Your role is to analyze user descriptions and extract structured information that will guide video code generation.

Be specific about mathematical concepts, suggest appropriate visualizations, and ensure scene timing is realistic."""

    def _build_analysis_prompt(self, description: str) -> str:
        """Build analysis prompt from user description."""
        return f"""Analyze the following video description and extract structured information for code generation.

## User Description
{description}

## Your Analysis Should Include:

1. **Topic Identification**
   - Primary subject (e.g., "Taylor Series", "Pythagorean Theorem")
   - Category (calculus, geometry, algebra, statistics, physics, etc.)
   - Difficulty level (introductory, intermediate, advanced)

2. **Key Mathematical Elements**
   - Formulas involved (e.g., "a² + b² = c²", "f(x) = Σ(fⁿ(a)/n!)(x-a)ⁿ")
   - Visual representations needed (graphs, diagrams, animations)
   - Step-by-step logic to explain

3. **Scene Structure**
   Break down into 3-5 scenes:
   - Scene 1: Title/Introduction (15-20% of duration)
   - Scene 2: Concept Introduction (25-30%)
   - Scene 3: Main Content/Demonstration (30-40%)
   - Scene 4: Examples/Applications (15-20%)
   - Scene 5: Summary (10-15%)

4. **Visualization Strategy**
   - Type of visual (SVG graph, formula animation, diagram)
   - Color scheme (suggest 2-3 primary colors)
   - Animation style (fade, slide, spring, interpolate)

5. **Educational Approach**
   - Key points to emphasize
   - Common misconceptions to address
   - Memory aids or visual hooks

## Output Format (JSON):
```json
{{
  "topic": {{
    "name": "string",
    "category": "string",
    "difficulty": "introductory|intermediate|advanced"
  }},
  "key_elements": {{
    "formulas": ["string"],
    "visuals": ["string"],
    "logic_steps": ["string"]
  }},
  "scenes": [
    {{
      "id": "scene_1",
      "title": "string",
      "duration_percent": 15,
      "content_type": "title|introduction|demonstration|example|summary",
      "description": "string",
      "visual_elements": ["string"]
    }}
  ],
  "visualization": {{
    "primary_visual": "string",
    "color_scheme": {{
      "primary": "#hex",
      "secondary": "#hex",
      "accent": "#hex"
    }},
    "animation_style": "string"
  }},
  "educational": {{
    "key_points": ["string"],
    "emphasis": "string"
  }}
}}
```

**Important**:
- Be specific about the mathematical topic
- Suggest appropriate visualizations for the concept
- Ensure scene timing adds up to 100%
- Output ONLY the JSON, no additional text
- If the description is unclear, make reasonable assumptions based on educational best practices"""

    def _normalize_analysis(
        self,
        analysis: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """
        Normalize and validate analysis output.

        Args:
            analysis: Raw analysis from LLM
            description: Original user description

        Returns:
            Normalized analysis dict
        """
        # Ensure required fields exist
        if "topic" not in analysis:
            analysis["topic"] = self._extract_topic_from_description(description)

        if "scenes" not in analysis or not analysis["scenes"]:
            analysis["scenes"] = self._get_default_scene_structure(description)

        if "visualization" not in analysis:
            analysis["visualization"] = self._get_default_visualization()

        # Normalize scene percentages
        total_percent = sum(scene.get("duration_percent", 0) for scene in analysis["scenes"])
        if total_percent != 100:
            # Scale to 100%
            scale = 100 / max(total_percent, 1)
            for scene in analysis["scenes"]:
                scene["duration_percent"] = int(scene.get("duration_percent", 20) * scale)

        return analysis

    def _extract_topic_from_description(self, description: str) -> Dict[str, str]:
        """Extract topic from description text."""
        # Simple heuristic: first few words or key terms
        words = description.split()[:5]
        topic_name = " ".join(words)

        # Detect category from keywords
        category = "general"
        lower_desc = description.lower()
        if any(kw in lower_desc for kw in ["导数", "积分", "极限", "微分", "derivative", "integral", "calculus"]):
            category = "calculus"
        elif any(kw in lower_desc for kw in ["三角", "圆", "几何", "triangle", "geometry", "circle"]):
            category = "geometry"
        elif any(kw in lower_desc for kw in ["函数", "方程", "algebra", "equation", "function"]):
            category = "algebra"

        return {
            "name": topic_name,
            "category": category,
            "difficulty": "introductory"
        }

    def _get_default_scene_structure(self, description: str) -> List[Dict[str, Any]]:
        """Get default scene structure."""
        topic = self._extract_topic_from_description(description)
        topic_name = topic["name"]

        return [
            {
                "id": "scene_1",
                "title": "Title",
                "duration_percent": 15,
                "content_type": "title",
                "description": f"Introduction to {topic_name}",
                "visual_elements": ["text"]
            },
            {
                "id": "scene_2",
                "title": "Concept",
                "duration_percent": 30,
                "content_type": "introduction",
                "description": f"Explaining the concept of {topic_name}",
                "visual_elements": ["text", "diagram"]
            },
            {
                "id": "scene_3",
                "title": "Demonstration",
                "duration_percent": 40,
                "content_type": "demonstration",
                "description": f"Demonstrating {topic_name}",
                "visual_elements": ["animation", "formula"]
            },
            {
                "id": "scene_4",
                "title": "Summary",
                "duration_percent": 15,
                "content_type": "summary",
                "description": f"Summary of {topic_name}",
                "visual_elements": ["text"]
            }
        ]

    def _get_default_visualization(self) -> Dict[str, Any]:
        """Get default visualization settings."""
        return {
            "primary_visual": "text",
            "color_scheme": {
                "primary": "#3B82F6",   # Blue
                "secondary": "#10B981", # Green
                "accent": "#F59E0B"     # Orange
            },
            "animation_style": "fade"
        }

    def _get_default_analysis(self, description: str) -> Dict[str, Any]:
        """Get fallback analysis when LLM fails."""
        topic = self._extract_topic_from_description(description)

        return {
            "topic": topic,
            "key_elements": {
                "formulas": [],
                "visuals": ["text"],
                "logic_steps": []
            },
            "scenes": self._get_default_scene_structure(description),
            "visualization": self._get_default_visualization(),
            "educational": {
                "key_points": [f"Understanding {topic['name']}"],
                "emphasis": f"Learn the fundamentals of {topic['name']}"
            }
        }
