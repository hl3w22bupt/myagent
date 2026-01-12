"""
Content Analyzer - Phase 2: Enhanced Prompt Version

Optimized prompt with Few-Shot examples, category-specific visualization,
and improved topic identification guidance.

Version: 2.0
Improvements:
- Added Few-Shot examples (2 complete examples)
- Category-specific visualization strategies
- Enhanced topic identification with detailed categories
- Difficulty-adaptive scene structure
- Improved educational approach guidance
"""

import json
import logging
from typing import Dict, Any, Optional

from .base_generator import BaseGenerator, GenerationResult

logger = logging.getLogger(__name__)


class ContentAnalyzerV2(BaseGenerator):
    """
    Enhanced Content Analyzer with optimized prompts (v2.0).

    This version includes:
    - Few-Shot examples for consistent output quality
    - Category-specific visualization strategies
    - Detailed topic identification guidance
    - Difficulty-adaptive scene structures
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

        # Build enhanced analysis prompt
        prompt = self._build_analysis_prompt_v2(description)

        # Call LLM
        try:
            response = await self._llm_call_with_fallback(
                prompt=prompt,
                max_tokens=2500,  # Increased for Few-Shot examples
                temperature=0.3,  # Low temperature for consistent analysis
                system_prompt=self._get_system_prompt_v2()
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

    def _get_system_prompt_v2(self) -> str:
        """Get enhanced system prompt for content analysis (v2.0)."""
        return """You are an expert educational content analyzer specializing in mathematics and science video production.

**Your Expertise**:
- Deep understanding of mathematical concepts across all levels
- Knowledge of effective teaching strategies and visualization techniques
- Ability to break down complex topics into clear, learnable components
- Familiarity with video production best practices for educational content

**Your Role**:
Analyze user descriptions to extract structured information that will guide AI-driven video code generation. Be precise, specific, and pedagogically sound.

**Analysis Principles**:
1. **Precision**: Use exact mathematical terminology
2. **Clarity**: Break down complex concepts into understandable components
3. **Visualization**: Suggest visuals that enhance understanding, not just decoration
4. **Pedagogy**: Consider the learner's journey from confusion to clarity
5. **Practicality**: Ensure suggestions are technically feasible in video format"""

    def _build_analysis_prompt_v2(self, description: str) -> str:
        """Build enhanced analysis prompt with Few-Shot examples (v2.0)."""
        return f"""Analyze the following video description and extract structured information for code generation.

## User Description
{description}

---

## 1. Topic Identification

**Categories** (choose ONE):
- **calculus**: Derivatives, integrals, limits, series, differential equations
- **geometry**: Triangles, circles, polygons, 3D shapes, proofs, transformations
- **algebra**: Equations, functions, inequalities, matrices, logarithms
- **statistics**: Probability, distributions, hypothesis testing, regression
- **linear_algebra**: Vectors, matrices, eigenvalues, transformations
- **physics**: Mechanics, electricity, waves, thermodynamics

**Difficulty Levels**:
- **introductory**: First exposure, intuitive approach, minimal prerequisites
- **intermediate**: Some background needed, includes calculations/proofs
- **advanced**: Abstract concepts, requires solid foundation, rigorous treatment

**Common Topics Reference**:
- Calculus: "Taylor Series", "Chain Rule", "Integration by Parts", "Fundamental Theorem of Calculus", "Limits"
- Geometry: "Pythagorean Theorem", "Circle Area", "Similar Triangles", "Trigonometric Functions"
- Algebra: "Quadratic Formula", "Function Composition", "Logarithmic Functions", "Matrix Operations"
- Statistics: "Normal Distribution", "Conditional Probability", "Central Limit Theorem", "Hypothesis Testing"

---

## 2. Scene Structure Guidelines

**Scene Count by Difficulty**:
- **Introductory**: 3-4 scenes (keep it simple and clear)
- **Intermediate**: 4-5 scenes (balance depth and accessibility)
- **Advanced**: 5-6 scenes (thorough coverage of complex ideas)

**Standard Scene Pattern**:
1. **Title** (10-15%): Hook viewers, state the topic clearly
2. **Introduction** (15-25%): Motivate the need, real-world connection
3. **Concept/Demonstration** (25-40%): Core idea, detailed explanation
4. **Example/Application** (15-25%): Concrete use, step-by-step
5. **Summary** (10-15%): Key takeaways, connections forward

**Time Allocation Rules**:
- Must sum to exactly 100%
- Title + Summary: 20-30% combined
- Core content: 70-80%
- Adjust based on topic complexity

---

## 3. Visualization Strategy (Category-Specific)

### Calculus Visuals:
- **Curve sketching**: Show function behavior, derivatives, integrals
- **Area accumulation**: Visualize integrals as areas under curves
- **Limit process**: Show step-by-step approximations
- **Animation**: Continuously deform/approximate to demonstrate limits

### Geometry Visuals:
- **Shape construction**: Build figures step-by-step
- **Color highlighting**: Emphasize sides/angles/areas of interest
- **Transformations**: Show rotations, reflections, translations
- **Proof diagrams**: Visual step-by-step logical reasoning

### Algebra Visuals:
- **Function graphs**: Show equations as visual curves
- **Step-by-step manipulation**: Display algebraic transformations
- **Pattern highlighting**: Color-code terms/variables
- **Balance scales**: Visualize equation solving

### Statistics Visuals:
- **Distributions**: Bell curves, histograms, box plots
- **Probability trees**: Branching scenarios
- **Sampling**: Visual data collection process
- **Confidence intervals**: Shaded regions on distributions

**Color Scheme Guidelines**:
- **Calculus**: Blues (trust, logic) + Oranges (change, derivative)
- **Geometry**: Greens (structure) + Reds (emphasis)
- **Algebra**: Purples (abstraction) + Yellows (highlighting)
- **Statistics**: Blues/Greens (data) with accent for key metrics

---

## 4. Few-Shot Examples

### Example 1: Introductory Geometry

**Input**: "勾股定理：直角三角形的三边关系"

**Output**:
```json
{{
  "topic": {{
    "name": "Pythagorean Theorem",
    "category": "geometry",
    "difficulty": "introductory"
  }},
  "key_elements": {{
    "formulas": ["a² + b² = c²"],
    "visuals": ["Right triangle with labeled sides", "Square visualization of a² + b² = c²"],
    "logic_steps": ["Identify right angle", "Label legs a and b", "Calculate hypotenuse c", "Verify relationship"]
  }},
  "scenes": [
    {{
      "id": "scene_1",
      "title": "What is the Pythagorean Theorem?",
      "duration_percent": 15,
      "content_type": "title",
      "description": "Introduce the theorem with visual right triangle",
      "visual_elements": ["Triangle diagram", "Formula display"]
    }},
    {{
      "id": "scene_2",
      "title": "Understanding the Relationship",
      "duration_percent": 30,
      "content_type": "introduction",
      "description": "Visual proof using squares on each side",
      "visual_elements": ["Square construction", "Area comparison animation"]
    }},
    {{
      "id": "scene_3",
      "title": "Worked Example",
      "duration_percent": 40,
      "content_type": "demonstration",
      "description": "Calculate missing side in 3-4-5 triangle",
      "visual_elements": ["Step-by-step calculation", "Number substitution"]
    }},
    {{
      "id": "scene_4",
      "title": "Key Takeaways",
      "duration_percent": 15,
      "content_type": "summary",
      "description": "Summary of when and how to use the theorem",
      "visual_elements": ["Bullet points", "Real-world applications"]
    }}
  ],
  "visualization": {{
    "primary_visual": "Geometric proof with animated squares on triangle sides",
    "color_scheme": {{
      "primary": "#10B981",
      "secondary": "#3B82F6",
      "accent": "#EF4444"
    }},
    "animation_style": "gradual_reveal"
  }},
  "educational": {{
    "key_points": [
      "Only works for right triangles",
      "c is always the longest side (hypotenuse)",
      "Connects algebra and geometry"
    ],
    "emphasis": "Visual understanding of why a² + b² = c² through area comparison"
  }}
}}
```

### Example 2: Intermediate Calculus

**Input**: "Taylor Series: polynomial approximation of functions"

**Output**:
```json
{{
  "topic": {{
    "name": "Taylor Series Expansion",
    "category": "calculus",
    "difficulty": "intermediate"
  }},
  "key_elements": {{
    "formulas": ["f(x) = f(a) + f'(a)(x-a) + f''(a)(x-a)²/2! + ..."],
    "visuals": ["Successive polynomial approximations", "Error reduction animation", "Convergence visualization"],
    "logic_steps": ["Choose expansion point", "Calculate derivatives at point", "Build polynomial series", "Compare approximation to actual function"]
  }},
  "scenes": [
    {{
      "id": "scene_1",
      "title": "The Approximation Problem",
      "duration_percent": 12,
      "content_type": "introduction",
      "description": "Why do we need polynomial approximations for complex functions?",
      "visual_elements": ["Complex function curve", "Difficulty of direct calculation"]
    }},
    {{
      "id": "scene_2",
      "title": "Building the Taylor Series",
      "duration_percent": 28,
      "content_type": "demonstration",
      "description": "Derive the formula step-by-step from derivative matching",
      "visual_elements": ["Derivative matching animation", "Term-by-term construction"]
    }},
    {{
      "id": "scene_3",
      "title": "Visualizing Convergence",
      "duration_percent": 35,
      "content_type": "demonstration",
      "description": "Watch polynomials of increasing order approach the actual function",
      "visual_elements": ["Animated curve comparison", "Error graph shrinking", "Order-by-order visualization"]
    }},
    {{
      "id": "scene_4",
      "title": "Maclaurin Series Example",
      "duration_percent": 15,
      "content_type": "example",
      "description": "Approximate sin(x) and exp(x) using Taylor series",
      "visual_elements": ["Specific function examples", "Numerical accuracy comparison"]
    }},
    {{
      "id": "scene_5",
      "title": "Summary and Applications",
      "duration_percent": 10,
      "content_type": "summary",
      "description": "When Taylor series are useful in mathematics and engineering",
      "visual_elements": ["Applications list", "Convergence conditions"]
    }}
  ],
  "visualization": {{
    "primary_visual": "Animated polynomial curves morphing to match target function",
    "color_scheme": {{
      "primary": "#3B82F6",
      "secondary": "#F59E0B",
      "accent": "#10B981"
    }},
    "animation_style": "morph_with_interpolate"
  }},
  "educational": {{
    "key_points": [
      "Polynomials can approximate smooth functions",
      "More terms = better approximation (within radius of convergence)",
      "Works best near the expansion point",
      "Foundation for numerical methods and scientific computing"
    ],
    "emphasis": "Visual intuition of how adding terms improves approximation quality"
  }}
}}
```

**Notice the pattern**:
- Introductory: 4 scenes, simpler language, focus on intuition
- Intermediate: 5 scenes, more detailed, includes formal definitions
- Scene descriptions are specific and actionable for code generation
- Visualizations are category-appropriate
- Difficulty-appropriate depth in key_points

---

## Your Task

Analyze the user description following the examples above. Output ONLY valid JSON, no additional text.

**Remember**:
- Match difficulty level to scene count
- Use category-specific visualization strategies
- Be specific about visual elements and animations
- Ensure scene percentages sum to 100%
- Include concrete examples in your analysis

**Output Format**: Same as examples above"""

    def _normalize_analysis(
        self,
        analysis: Dict[str, Any],
        description: str
    ) -> Dict[str, Any]:
        """Normalize and validate analysis output."""
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
            scale = 100 / max(total_percent, 1)
            for scene in analysis["scenes"]:
                scene["duration_percent"] = int(scene.get("duration_percent", 20) * scale)

        return analysis

    def _extract_topic_from_description(self, description: str) -> Dict[str, str]:
        """Extract topic from description text."""
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

    def _get_default_scene_structure(self, description: str) -> list:
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
                "primary": "#3B82F6",
                "secondary": "#10B981",
                "accent": "#F59E0B"
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

    async def generate(self, description: str, **kwargs) -> GenerationResult:
        """Generate analysis (implements BaseGenerator interface)."""
        try:
            analysis = await self.analyze(description)

            return GenerationResult(
                code=json.dumps(analysis, indent=2, ensure_ascii=False),
                metadata={
                    "type": "content_analysis_v2",
                    "topic": analysis["topic"]["name"],
                    "num_scenes": len(analysis["scenes"]),
                    "version": "2.0"
                },
                success=True
            )

        except Exception as e:
            logger.error(f"Analysis generation failed: {str(e)}")
            return GenerationResult(
                code="{}",
                metadata={"type": "content_analysis_v2"},
                success=False,
                errors=[str(e)]
            )
