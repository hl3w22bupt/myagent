"""Content Refiner - LLM-powered content optimization for infographics.

This module uses LLM to analyze and refine user input for optimal infographic generation.
It transforms raw user descriptions into well-structured, visually-optimized content.
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional
import sys
import os

sys.path.insert(0, os.path.dirname(__file__) + "/..")

try:
    from src.core.skill.llm_client import LLMClient, get_llm_client
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False
    LLMClient = None

logger = logging.getLogger(__name__)


# Available AntV Infographic templates - MUST match lib/templates.py
# These are the ONLY templates that are actually supported
AVAILABLE_TEMPLATES = {
    "sequence": [
        "sequence-zigzag-steps-underline-text",
        "sequence-horizontal-zigzag-simple",
        "sequence-timeline-simple",
        "sequence-timeline-rounded-rect-node",
        "sequence-roadmap-vertical-simple",
        "sequence-snake-steps-underline-text",
        "sequence-ascending-steps",
        "sequence-stairs-front-compact-card",
    ],
    "list": [
        "list-row-horizontal-icon-arrow",
        "list-row-simple-illus",
        "list-column-vertical-icon-arrow",
        "list-column-done-list",
        "list-grid-badge-card",
        "list-grid-candy-card-lite",
    ],
    "compare": [
        "compare-binary-horizontal-simple-fold",
        "compare-binary-horizontal-badge-card-arrow",
        "compare-swot",
    ],
    "hierarchy": [
        "hierarchy-tree-tech-style-capsule-item",
        "hierarchy-tree-curved-line-rounded-rect-node",
        "hierarchy-structure",
    ],
    "chart": [
        "chart-column-simple",
        "chart-bar-plain-text",
        "chart-line-plain-text",
        "chart-pie-donut-pill-badge",
        "chart-pie-plain-text",
    ],
    "quadrant": [
        "quadrant-quarter-simple-card",
        "quadrant-quarter-circular",
    ],
    "relation": [
        "relation-circle-icon-badge",
        "relation-circle-circular-progress",
    ],
}

# Flatten all templates into a set for easy validation
ALL_VALID_TEMPLATES = set()
for templates in AVAILABLE_TEMPLATES.values():
    ALL_VALID_TEMPLATES.update(templates)


def get_default_template(content_type: str) -> str:
    """Get a safe default template for a given content type."""
    defaults = {
        "sequence": "sequence-horizontal-zigzag-simple",
        "list": "list-row-horizontal-icon-arrow",
        "compare": "compare-binary-horizontal-simple-fold",
        "chart": "chart-column-simple",
        "hierarchy": "hierarchy-tree-tech-style-capsule-item",
        "quadrant": "quadrant-quarter-simple-card",
        "relation": "relation-circle-icon-badge",
    }
    return defaults.get(content_type, "list-row-horizontal-icon-arrow")


def validate_template(template: str, content_type: str) -> str:
    """Validate and return a valid template.

    If the suggested template is not in our available list,
    return a default template for the content type.
    """
    if template in ALL_VALID_TEMPLATES:
        return template

    # Template not found, log and use default
    logger.warning(f"Template '{template}' not available, using default for '{content_type}'")
    return get_default_template(content_type)


class ContentRefiner:
    """
    LLM-powered content refiner for infographic generation.

    Analyzes raw user input and produces optimized content structure
    specifically designed for infographic visualization.
    """

    def __init__(self, llm_client: Optional[LLMClient] = None, task_id: Optional[str] = None):
        """
        Initialize the content refiner.

        Args:
            llm_client: Optional LLM client (creates singleton if not provided)
            task_id: Optional task ID for tracing
        """
        # Get task_id from environment if not provided
        if task_id is None:
            task_id = os.getenv('MOTIA_TASK_ID', 'unknown')

        self.task_id = task_id

        if LLM_AVAILABLE and llm_client is None:
            # Use force_new=True to ensure we get a fresh instance with correct task_id
            self.llm_client = get_llm_client(
                skill_name="infographic-generator",
                task_id=task_id,
                model=os.getenv("INFOGRAPHIC_LLM_MODEL", "claude-sonnet-4-5"),
                force_new=True  # Force new instance to get correct task_id
            )
        else:
            self.llm_client = llm_client
            # Update task_id if client was provided
            if self.llm_client and hasattr(self.llm_client, 'task_id'):
                self.llm_client.task_id = task_id

        self.llm_enabled = LLM_AVAILABLE and self.llm_client is not None

        if not self.llm_enabled:
            logger.warning("LLM not available - content refiner will use rule-based fallback")

    async def refine(
        self,
        content: str,
        preferred_template: Optional[str] = None,
        theme_hint: Optional[str] = None,
        language: str = "auto"
    ) -> Dict[str, Any]:
        """
        Refine user content for optimal infographic generation.

        Args:
            content: Raw user input content
            preferred_template: Optional template preference from user
            theme_hint: Optional theme/style hint
            language: Content language (auto/zh/en)

        Returns:
            Dict with refined content structure:
            {
                "title": "Optimized title",
                "description": "Clear description",
                "content_type": "sequence|list|compare|chart|hierarchy|quadrant|relation",
                "recommended_template": "template-name",
                "items": [
                    {"label": "Item 1", "desc": "Description", "icon": "mdi/star", "value": None},
                    ...
                ],
                "suggested_theme": "business|tech|nature|warm|cool|monochrome",
                "suggested_style": "rough|pattern|linear-gradient",
                "metadata": {
                    "item_count": 5,
                    "has_numeric_data": false,
                    "confidence": 0.95
                }
            }
        """
        if not self.llm_enabled:
            return self._rule_based_refine(content, preferred_template, theme_hint)

        try:
            # Detect language if auto
            detected_language = self._detect_language(content) if language == "auto" else language

            # Build the refinement prompt
            prompt = self._build_refinement_prompt(
                content,
                preferred_template,
                theme_hint,
                detected_language
            )

            # Call LLM with structured output
            response = await self._call_llm_refiner(prompt, content)

            # Validate and normalize response
            refined = self._normalize_refinement(response, content, preferred_template)

            logger.info(f"Content refined: {refined['title']} ({refined['content_type']}, {len(refined['items'])} items)")
            return refined

        except Exception as e:
            logger.error(f"LLM refinement failed: {e}, falling back to rule-based")
            return self._rule_based_refine(content, preferred_template, theme_hint)

    def _detect_language(self, content: str) -> str:
        """Detect content language (Chinese or English)."""
        chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', content))
        total_chars = len(content)

        if total_chars > 0 and chinese_chars / total_chars > 0.3:
            return "zh"
        return "en"

    def _build_refinement_prompt(
        self,
        content: str,
        preferred_template: Optional[str],
        theme_hint: Optional[str],
        language: str
    ) -> str:
        """Build the LLM prompt for content refinement."""

        lang_instruction = {
            "zh": "请用中文回复",
            "en": "Please respond in English"
        }.get(language, "")

        template_hint = ""
        if preferred_template:
            template_hint = f"\nThe user prefers template: {preferred_template}"

        theme_hint_text = ""
        if theme_hint and theme_hint != "auto":
            theme_hint_text = f"\nTheme hint: {theme_hint}"

        # Build template list for LLM - ONLY include actually available templates
        sequence_templates = ", ".join(AVAILABLE_TEMPLATES["sequence"])
        list_templates = ", ".join(AVAILABLE_TEMPLATES["list"])
        compare_templates = ", ".join(AVAILABLE_TEMPLATES["compare"])
        chart_templates = ", ".join(AVAILABLE_TEMPLATES["chart"])

        return f"""You are an expert infographic designer and content strategist. Your task is to analyze and refine user input to create optimal content for infographic generation.

**User Input:**
{content}
{template_hint}{theme_hint_text}

**Your Role:**
Transform the raw user input into a well-structured, visually-optimized format for infographic generation using AntV Infographic syntax.

**Analysis Requirements:**

1. **Content Type Classification**: Determine which type best fits:
   - `sequence`: Time-based steps, processes, flows, timelines (has order/progression)
   - `list`: Collection of items, features, points (no particular order)
   - `compare`: Comparing two things, pros/cons, vs analysis
   - `chart`: Data with numbers, statistics, percentages
   - `hierarchy`: Tree structures, organizational charts, categories
   - `quadrant`: 2x2 matrices, four-quadrant analysis
   - `relation`: Relationships, connections, circular flows

2. **Title Optimization**: Create a clear, concise title (max 30 chars)
   - Remove action verbs like "Generate", "Create", "Show me"
   - Focus on the subject matter
   - Make it descriptive but brief

3. **Item Structure**: Break down content into clear, scannable items
   - Each item should have a short label (max 20 chars)
   - Add optional descriptions for clarity (max 50 chars)
   - Extract any numeric values
   - Maintain proper hierarchy

4. **Icon Suggestions**: Suggest relevant icons from Material Design Icons (mdi/*)
   - Use semantic icons that match each item's meaning
   - Examples: mdi/rocket, mdi/chart-line, mdi/cog, mdi/lightbulb, etc.

5. **Template Recommendation**: **CRITICAL - ONLY recommend from the available templates below**

   Sequence (ordered steps): {sequence_templates}
   List (unordered items): {list_templates}
   Compare (two-way comparison): {compare_templates}
   Chart (data with numbers): {chart_templates}

   Selection guidelines:
   - 2-4 items: Use compact templates
   - 5-7 items: Use standard templates
   - 8+ items: Use expanded/timeline templates

6. **Theme & Style**: Suggest appropriate visual theme
   - `business`: Blue tones for professional content
   - `tech`: Purple/cyan for technical topics
   - `nature`: Green tones for environmental topics
   - `warm`: Orange/red for energetic content
   - `cool`: Blue/teal for calm content
   - `monochrome`: Grayscale for minimal designs

**Output Format:**
Return ONLY valid JSON, no additional text:

```json
{{
  "title": "Optimized Title",
  "description": "Brief description of what this infographic shows",
  "content_type": "sequence|list|compare|chart|hierarchy|quadrant|relation",
  "recommended_template": "template-name-from-list-above",
  "items": [
    {{
      "label": "Short item label",
      "description": "Optional explanatory text",
      "icon": "mdi/icon-name",
      "value": null
    }}
  ],
  "suggested_theme": "business|tech|nature|warm|cool|monochrome",
  "suggested_style": "rough|pattern|linear-gradient",
  "metadata": {{
    "item_count": 5,
    "has_numeric_data": false,
    "confidence": 0.95,
    "reasoning": "Brief explanation of choices"
  }}
}}
```

**CRITICAL CONSTRAINTS:**
- Keep labels SHORT (ideally 5-15 characters)
- Keep descriptions CONCISE (under 50 characters)
- Only include descriptions if they add meaningful context
- **MUST recommend ONLY from the template lists above**
- Use appropriate icons from Material Design Icons
- Choose templates that fit the item count well
- {lang_instruction}

Analyze the user input and output the refined JSON structure:"""

    async def _call_llm_refiner(self, prompt: str, original_content: str) -> Dict[str, Any]:
        """Call LLM for content refinement."""

        if not self.llm_client:
            raise RuntimeError("LLM client not available")

        # Use async version if available
        if hasattr(self.llm_client, 'generate_async'):
            response = await self.llm_client.generate_async(
                prompt=prompt,
                max_tokens=2000,
                temperature=0.3,
                system_prompt="You are an expert infographic designer and content strategist. Always output valid JSON.",
                purpose="content_refinement_for_infographic"
            )
        else:
            # Fallback to sync
            response = self.llm_client.generate(
                prompt=prompt,
                max_tokens=2000,
                temperature=0.3,
                system_prompt="You are an expert infographic designer and content strategist. Always output valid JSON.",
                purpose="content_refinement_for_infographic"
            )

        # Extract JSON from response
        content = response.content.strip()

        # Try to extract JSON if there's extra text
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            content = json_match.group(0)

        return json.loads(content)

    def _normalize_refinement(
        self,
        llm_output: Dict[str, Any],
        original_content: str,
        preferred_template: Optional[str]
    ) -> Dict[str, Any]:
        """Normalize and validate LLM output."""

        # Ensure required fields
        if "title" not in llm_output or not llm_output["title"]:
            llm_output["title"] = self._extract_fallback_title(original_content)

        if "description" not in llm_output:
            llm_output["description"] = ""

        if "content_type" not in llm_output:
            llm_output["content_type"] = "list"

        if "recommended_template" not in llm_output:
            # Use preferred or fallback
            if preferred_template:
                llm_output["recommended_template"] = preferred_template
            else:
                llm_output["recommended_template"] = self._get_default_template(
                    llm_output["content_type"],
                    len(llm_output.get("items", []))
                )

        if "items" not in llm_output or not llm_output["items"]:
            llm_output["items"] = self._extract_fallback_items(original_content)

        # Normalize items structure
        normalized_items = []
        for item in llm_output["items"]:
            if not isinstance(item, dict):
                item = {"label": str(item)}
            normalized_items.append({
                "label": item.get("label", "Item"),
                "desc": item.get("description") or item.get("desc", ""),
                "icon": item.get("icon", "mdi/star"),
                "value": item.get("value")
            })
        llm_output["items"] = normalized_items

        # Ensure metadata
        if "metadata" not in llm_output:
            llm_output["metadata"] = {}

        llm_output["metadata"]["item_count"] = len(llm_output["items"])

        return llm_output

    def _rule_based_refine(
        self,
        content: str,
        preferred_template: Optional[str],
        theme_hint: Optional[str]
    ) -> Dict[str, Any]:
        """Rule-based fallback when LLM is not available."""

        from lib.utils import extract_title, extract_description, parse_list_items
        from lib.templates import identify_content_type, recommend_template
        from lib.icons import suggest_icon_for_context

        items = parse_list_items(content)
        title = extract_title(content)
        description = extract_description(content)
        content_type = identify_content_type(content)

        # Build items with icons
        refined_items = []
        for item in items:
            refined_items.append({
                "label": item[:30],  # Truncate if too long
                "desc": "",
                "icon": suggest_icon_for_context(item),
                "value": None
            })

        # Select template
        if preferred_template:
            template = preferred_template
        else:
            template = recommend_template(content_type, content)

        # Determine theme
        theme = theme_hint if theme_hint and theme_hint != "auto" else "business"

        return {
            "title": title,
            "description": description,
            "content_type": content_type,
            "recommended_template": template,
            "items": refined_items,
            "suggested_theme": theme,
            "suggested_style": "rough",
            "metadata": {
                "item_count": len(refined_items),
                "has_numeric_data": False,
                "confidence": 0.6,
                "reasoning": "Rule-based extraction (LLM unavailable)"
            }
        }

    def _extract_fallback_title(self, content: str) -> str:
        """Extract a simple title from content."""
        lines = content.strip().split('\n')
        first_line = lines[0].strip() if lines else "Infographic"

        # Remove common prefixes
        prefixes = ["生成", "创建", "设计", "制作", "Generate", "Create", "Design"]
        for prefix in prefixes:
            if first_line.startswith(prefix):
                first_line = first_line[len(prefix):].strip()
                break

        return first_line[:30] if first_line else "Infographic"

    def _extract_fallback_items(self, content: str) -> List[Dict[str, Any]]:
        """Extract simple items from content."""
        from lib.utils import parse_list_items
        from lib.icons import suggest_icon_for_context

        raw_items = parse_list_items(content)
        items = []
        for item in raw_items[:10]:  # Limit to 10 items
            items.append({
                "label": item[:20],
                "desc": "",
                "icon": suggest_icon_for_context(item),
                "value": None
            })
        return items if items else [{"label": "Item 1", "desc": "", "icon": "mdi/star", "value": None}]

    def _get_default_template(self, content_type: str, item_count: int) -> str:
        """Get default template based on content type and item count."""
        templates = AVAILABLE_TEMPLATES.get(content_type, AVAILABLE_TEMPLATES["list"])

        if item_count <= 4:
            return templates[0] if templates else "list-column-vertical-icon-arrow"
        elif item_count <= 7:
            return templates[min(1, len(templates) - 1)] if len(templates) > 1 else templates[0]
        else:
            # For many items, prefer vertical or expanded templates
            if content_type == "sequence":
                return "sequence-roadmap-vertical-simple"
            return "list-column-vertical-icon-arrow"


# Singleton instance for reuse
_refiner_instance: Optional[ContentRefiner] = None


def get_content_refiner(task_id: Optional[str] = None, force_new: bool = False) -> ContentRefiner:
    """Get or create content refiner instance.

    Args:
        task_id: Optional task ID for tracing
        force_new: Force creation of new instance instead of using cached one

    Returns:
        ContentRefiner instance
    """
    global _refiner_instance

    # Get task_id from environment if not provided
    if task_id is None:
        task_id = os.getenv('MOTIA_TASK_ID', 'unknown')

    # Create new instance if forced, or if task_id changed (important for trace attribution)
    if _refiner_instance is None or force_new or getattr(_refiner_instance, 'task_id', None) != task_id:
        _refiner_instance = ContentRefiner(task_id=task_id)

    return _refiner_instance
