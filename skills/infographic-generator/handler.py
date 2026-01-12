"""Infographic Generator Skill - Main Handler"""

import asyncio
import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
sys.path.insert(0, str(Path(__file__).parent / "generators"))

from palettes import PALETTES
from templates import identify_content_type, recommend_template
from icons import suggest_icon_for_context
from utils import (
    sanitize_filename,
    generate_id,
    format_timestamp,
    extract_title,
    extract_description,
    parse_list_items,
)


class InfographicRenderer:
    """Renders infographic HTML using Puppeteer."""

    def __init__(self, template_dir: Path):
        self.template_dir = template_dir
        self.chrome_path = self._find_chrome()

    def _find_chrome(self) -> Optional[str]:
        """Find Chrome executable."""
        chrome_paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
        ]

        for path in chrome_paths:
            if os.path.exists(path):
                return path

        return None

    async def render_to_svg(self, html_content: str, output_path: str) -> bool:
        """Render HTML and extract SVG."""
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                await page.set_content(html_content, wait_until="networkidle")
                await page.wait_for_timeout(2000)

                svg_content = await page.evaluate("""
                    () => {
                        const infographic = window.infographic;
                        if (infographic && infographic.toSVG) {
                            return infographic.toSVG();
                        }
                        return null;
                    }
                """)

                if svg_content:
                    with open(output_path, "w", encoding="utf-8") as f:
                        f.write(svg_content)
                    await browser.close()
                    return True

                await browser.close()
                return False

        except ImportError:
            print("Playwright not available, skipping SVG export")
            return False
        except Exception as e:
            print(f"SVG export error: {e}")
            return False


class InfographicGenerator:
    """Main infographic generator."""

    def __init__(self):
        self.base_dir = Path(__file__).parent
        self.output_dir = (
            self.base_dir.parent.parent.parent / "outputs" / "infographics"
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.template_dir = self.base_dir / "template"
        self.renderer = InfographicRenderer(self.template_dir)

    async def generate_infographic(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate infographic from input data."""
        try:
            content = input_data.get("content", "")
            if not content:
                return {
                    "success": False,
                    "error": "Content is required",
                    "error_type": "ValidationError",
                }

            language = input_data.get("language", "auto")
            preferred_template = input_data.get("preferred_template")
            theme_input = input_data.get("theme", "auto")
            style = input_data.get("style", "auto")
            width = input_data.get("width", 1920)
            height = input_data.get("height", 1080)
            export_format = input_data.get("export_format", "both")

            content_type = identify_content_type(content)

            if preferred_template:
                template = preferred_template
            else:
                template = recommend_template(content_type, content)

            if theme_input == "auto":
                from palettes import recommend_palette

                palette = recommend_palette(content)
            elif theme_input in PALETTES:
                palette = PALETTES[theme_input]
            else:
                palette = PALETTES["cool"]

            if style == "auto":
                style = "rough"

            title = extract_title(content)
            desc = extract_description(content)
            items = parse_list_items(content)

            items_with_data = []
            for item in items:
                item_dict = {"label": item}
                item_dict["icon"] = suggest_icon_for_context(item)
                items_with_data.append(item_dict)

            dsl = self._generate_dsl(
                template, title, desc, items_with_data, palette, style, width, height
            )
            html_content = self._generate_html(title, dsl, width, height)

            filename = sanitize_filename(title)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_filename = f"{filename}_{timestamp}"

            html_path = self.output_dir / f"{base_filename}.html"
            svg_path = self.output_dir / f"{base_filename}.svg"

            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            success_svg = False
            if export_format in ["svg", "both"]:
                success_svg = await self.renderer.render_to_svg(
                    html_content, str(svg_path)
                )

            result = {
                "success": True,
                "html_path": str(html_path),
                "svg_path": str(svg_path) if success_svg else None,
                "html_url": f"/outputs/infographics/{base_filename}.html",
                "svg_url": f"/outputs/infographics/{base_filename}.svg"
                if success_svg
                else None,
                "metadata": {
                    "title": title,
                    "template": template,
                    "content_type": content_type,
                    "theme": palette,
                    "style": style,
                    "dimensions": {"width": width, "height": height},
                    "generated_at": format_timestamp(),
                },
            }

            return result

        except Exception as e:
            import traceback

            traceback.print_exc()
            return {"success": False, "error": str(e), "error_type": type(e).__name__}

    def _generate_dsl(
        self,
        template: str,
        title: str,
        desc: str,
        items: list,
        palette: list,
        style: str,
        width: int,
        height: int,
    ) -> str:
        """Generate AntV Infographic DSL."""
        lines = [f"infographic {template}", "theme", f"  stylize {style}", "  palette"]

        for color in palette:
            lines.append(f"  - {color}")

        lines.extend(["", "data", f"  title {title}"])

        if desc:
            lines.append(f"  desc {desc}")

        lines.append("  items")

        for item in items:
            label = item.get("label", "")
            icon = item.get("icon", "mdi/star")

            lines.append(f"  - label {label}")
            lines.append(f"    icon {icon}")

        return "\n".join(lines)

    def _generate_html(self, title: str, dsl: str, width: int, height: int) -> str:
        """Generate HTML from template."""
        escaped_dsl = dsl.replace("`", "\\`").replace("$", "\\$")

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
    <style>
        body {{
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #f5f5f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }}
        #container {{
            background-color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 8px;
        }}
    </style>
</head>
<body>
    <div id="container" style="width: {width}px; height: {height}px;"></div>
    <script>
        const dsl = `{escaped_dsl}`;
        const infographic = new Infographic({{
            container: document.getElementById('container'),
            dsl: dsl
        }});
    </script>
</body>
</html>
"""
        return html


async def generate_infographic(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for infographic generation."""
    generator = InfographicGenerator()
    return await generator.generate_infographic(input_data)
