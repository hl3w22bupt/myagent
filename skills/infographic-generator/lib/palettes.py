"""Color palette definitions for infographic themes."""

PALETTES = {
    "business": ["#3b82f6", "#8b5cf6", "#f97316", "#10b981"],
    "tech": ["#06b6d4", "#8b5cf6", "#ec4899", "#6366f1"],
    "nature": ["#22c55e", "#84cc16", "#14b8a6", "#0ea5e9"],
    "warm": ["#f97316", "#ef4444", "#eab308", "#f59e0b"],
    "cool": ["#3b82f6", "#0ea5e9", "#06b6d4", "#6366f1"],
    "monochrome": ["#1f2937", "#4b5563", "#9ca3af", "#d1d5db"],
}

STYLE_KEYWORDS = {
    "business": ["商业", "业务", "企业", "business", "corporate", "enterprise"],
    "tech": ["技术", "科技", "AI", "tech", "technology", "digital"],
    "nature": ["环保", "自然", "绿色", "eco", "nature", "green", "environmental"],
    "warm": ["活力", "热情", "温暖", "energy", "passion", "warm"],
    "cool": ["冷静", "专业", "科技蓝", "cool", "calm", "professional"],
}


def recommend_palette(content: str) -> list:
    """Recommend color palette based on content keywords."""
    content_lower = content.lower()

    for theme, keywords in STYLE_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in content_lower:
                return PALETTES[theme]

    return PALETTES["cool"]
