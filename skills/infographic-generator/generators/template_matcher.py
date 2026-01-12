"""Template matcher for infographic generation."""

from typing import Dict, List
import sys
import os

sys.path.insert(0, os.path.dirname(__file__) + "/..")

from lib.templates import identify_content_type, recommend_template
from lib.palettes import recommend_palette


class TemplateMatcher:
    """Matches content to best template and theme."""

    @staticmethod
    def match(
        content: str,
        preferred_template: str = None,
        theme: str = "auto",
        style: str = "auto",
    ) -> Dict[str, any]:
        """Match content to template and generate recommendations."""
        content_type = identify_content_type(content)

        if preferred_template:
            template = preferred_template
        else:
            template = recommend_template(content_type, content)

        if theme == "auto":
            palette = recommend_palette(content)
        elif theme in ["business", "tech", "nature", "warm", "cool", "monochrome"]:
            from lib.palettes import PALETTES

            palette = PALETTES[theme]
        else:
            palette = ["#3b82f6", "#8b5cf6", "#10b981"]

        if style == "auto":
            style = "rough"

        return {
            "content_type": content_type,
            "template": template,
            "palette": palette,
            "style": style,
        }
