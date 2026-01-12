"""Content analysis for infographics."""

import re
from typing import Dict, List, Any
import sys
import os

sys.path.insert(0, os.path.dirname(__file__) + "/..")

from lib.templates import identify_content_type, recommend_template
from lib.palettes import recommend_palette
from lib.utils import extract_title, extract_description, parse_list_items
from lib.icons import suggest_icon_for_context


class ContentAnalyzer:
    """Analyzes content and extracts structured data."""

    def __init__(self, content: str, language: str = "auto"):
        self.content = content
        self.language = language
        self.items = []
        self.parsed = False

    def analyze(self, preferred_template: str = None) -> Dict[str, Any]:
        """Analyze content and return structured data."""
        if not self.parsed:
            self._parse_content()

        content_type = identify_content_type(self.content)

        if preferred_template:
            template = preferred_template
        else:
            template = recommend_template(content_type, self.content)

        title = extract_title(self.content)
        desc = extract_description(self.content)

        items_with_icons = []
        for item in self.items:
            item_data = {"label": item}
            item_data["icon"] = suggest_icon_for_context(item)
            items_with_icons.append(item_data)

        return {
            "content_type": content_type,
            "recommended_template": template,
            "title": title,
            "desc": desc,
            "items": items_with_icons,
            "confidence": 0.9,
        }

    def _parse_content(self):
        """Parse content into structured items."""
        self.items = parse_list_items(self.content)
        self.parsed = True
