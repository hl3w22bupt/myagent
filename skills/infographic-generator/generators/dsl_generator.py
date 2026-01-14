"""DSL generator for AntV Infographic."""

from typing import Dict, List, Any


class DSLGenerator:
    """Generates AntV Infographic DSL from structured data."""

    @staticmethod
    def generate(analysis: Dict[str, Any], style: str = "rough") -> str:
        """Generate DSL from analysis result."""
        template = analysis["recommended_template"]
        title = analysis["title"]
        desc = analysis.get("desc", "")
        items = analysis["items"]

        dsl_lines = [
            f"infographic {template}",
            "theme",
            f"  stylize {style}",
            "  palette",
        ]

        palette = analysis.get("palette", ["#3b82f6", "#8b5cf6", "#10b981"])
        for color in palette:
            dsl_lines.append(f"  - {color}")

        dsl_lines.extend(["", "data", f"  title {title}"])

        if desc:
            dsl_lines.append(f"  desc {desc}")

        dsl_lines.append("  items")

        for item in items:
            label = item.get("label", "")
            icon = item.get("icon", "mdi/star")
            value = item.get("value")

            dsl_lines.append(f"  - label {label}")
            dsl_lines.append(f"    icon {icon}")

            if value is not None:
                dsl_lines.append(f"    value {value}")

            item_desc = item.get("desc")
            if item_desc:
                dsl_lines.append(f"    desc {item_desc}")

        return "\n".join(dsl_lines)
