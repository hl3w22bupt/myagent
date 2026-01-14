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

    async def render_to_svg(self, html_content: str, output_path: str) -> tuple[bool, str | None]:
        """Render HTML and export to SVG or PNG (as fallback).

        Returns:
            (success, actual_path): success flag and path to exported file (SVG or PNG)
        """
        png_path = output_path.replace('.svg', '.png')

        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page(viewport={'width': 1920, 'height': 1080})

                await page.set_content(html_content, wait_until="networkidle")
                await page.wait_for_timeout(3000)

                # First, try to export SVG/PNG from rendered content
                try:
                    export_result = await page.evaluate("""
                        () => {
                            const infographic = window.infographic;
                            if (!infographic) {
                                return { type: 'error', message: 'No infographic instance' };
                            }

                            // Try toDataURL method for SVG
                            if (typeof infographic.toDataURL === 'function') {
                                try {
                                    const result = infographic.toDataURL({type: 'svg'});
                                    if (result && typeof result === 'string' && result.startsWith('data:image/svg+xml')) {
                                        return { type: 'svg', dataUrl: result };
                                    }
                                } catch (e) {
                                    console.error('toDataURL failed:', e.message);
                                }
                            }

                            // Try canvas export
                            const canvas = document.querySelector('canvas');
                            if (canvas) {
                                try {
                                    const pngDataUrl = canvas.toDataURL('image/png');
                                    return { type: 'canvas-png', dataUrl: pngDataUrl };
                                } catch (e) {
                                    console.error('Canvas export failed:', e.message);
                                }
                            }

                            return { type: 'no-render', message: 'Nothing rendered yet' };
                        }
                    """)

                    # Handle export result
                    if export_result.get('type') == 'svg' and export_result.get('dataUrl'):
                        # SVG export successful
                        import base64
                        svg_data = export_result['dataUrl']
                        svg_bytes = base64.b64decode(svg_data.split(',')[1])
                        with open(output_path, "w", encoding="utf-8") as f:
                            f.write(svg_bytes.decode('utf-8'))
                        await browser.close()
                        print(f"✅ SVG export successful: {output_path}")
                        return True, output_path

                    elif export_result.get('type') == 'canvas-png' and export_result.get('dataUrl'):
                        # Canvas PNG export successful
                        import base64
                        png_data = export_result['dataUrl']
                        png_bytes = base64.b64decode(png_data.split(',')[1])
                        with open(png_path, "wb") as f:
                            f.write(png_bytes)
                        await browser.close()
                        print(f"✅ Canvas PNG export successful: {png_path}")
                        return True, png_path

                except Exception as e:
                    print(f"⚠️  Direct export failed: {e}, falling back to screenshot")

                # Fallback: Use Playwright screenshot
                print("📸 Using screenshot fallback...")
                try:
                    # Screenshot the entire page
                    screenshot_bytes = await page.screenshot(type="png", full_page=False)

                    with open(png_path, "wb") as f:
                        f.write(screenshot_bytes)

                    await browser.close()
                    print(f"✅ Screenshot export successful: {png_path}")
                    return True, png_path

                except Exception as e:
                    print(f"❌ Screenshot failed: {e}")
                    await browser.close()
                    return False, None

        except ImportError:
            print("❌ Playwright not available, skipping export")
            return False, None
        except Exception as e:
            print(f"❌ Export error: {e}")
            import traceback
            traceback.print_exc()
            return False, None


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

            export_success = False
            actual_export_path = None
            if export_format in ["svg", "both"]:
                export_success, actual_export_path = await self.renderer.render_to_svg(
                    html_content, str(svg_path)
                )

            # Determine actual export path and URL
            if export_success and actual_export_path:
                # If the actual path is PNG, use that; otherwise use SVG path
                if actual_export_path.endswith('.png'):
                    png_path = actual_export_path
                    svg_path = None
                    base_name = Path(png_path).stem
                    export_url = f"/outputs/infographics/{base_name}.png"
                else:
                    png_path = None
                    export_url = f"/outputs/infographics/{base_filename}.svg"
            else:
                png_path = None
                svg_path = None
                export_url = None

            result = {
                "success": True,
                "html_path": str(html_path),
                "svg_path": svg_path,
                "png_path": png_path,  # Add PNG path for fallback
                "html_url": f"/outputs/infographics/{base_filename}.html",
                "svg_url": export_url if svg_path else None,
                "png_url": export_url if png_path else None,
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
        // AntV Infographic exports the constructor as AntVInfographic.Infographic
        const infographic = new window.AntVInfographic.Infographic({{
            container: document.getElementById('container'),
            dsl: dsl
        }});
        // Make it globally accessible for SVG export
        window.infographic = infographic;

        // CRITICAL: Call render() to trigger rendering
        infographic.render();

        // Listen for render completion
        infographic.on('rendered', (event) => {{
            console.log('Infographic rendered successfully');
            window.renderComplete = true;
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
