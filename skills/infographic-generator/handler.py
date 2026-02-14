"""Infographic Generator Skill - Main Handler"""

import asyncio
import os
import sys
import json
import time
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

# Add lib to path
sys.path.insert(0, str(Path(__file__).parent / "lib"))
sys.path.insert(0, str(Path(__file__).parent / "generators"))

# Add src to path for shared utilities (src must be in path for 'from core.skill' to work)
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

from palettes import PALETTES

try:
    from core.skill.output_builder import OutputBuilder, get_relative_path, get_file_size
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False
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
from aspect_ratio import recommend_dimensions, get_dimension_variants


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
            self.base_dir.parent.parent / "outputs" / "infographics"
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.template_dir = self.base_dir / "template"
        self.renderer = InfographicRenderer(self.template_dir)
        self.task_infographic_counts = {}  # Track infographic count per task

    async def generate_infographic(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate infographic from input data."""
        try:
            # Support 'content', 'description', and 'task' as parameter names
            content = input_data.get("content") or input_data.get("description") or input_data.get("task", "")
            if not content:
                if OUTPUT_BUILDER_AVAILABLE:
                    error_output = OutputBuilder() \
                        .set_error(
                            error=ValueError("Content is required"),
                            suggestions=["请提供要生成信息图的内容描述"]
                        ) \
                        .add_skill("infographic-generator") \
                        .build()
                    return error_output
                else:
                    return {
                        "success": False,
                        "error": "Content is required",
                        "error_type": "ValidationError",
                    }

            language = input_data.get("language", "auto")
            preferred_template = input_data.get("preferred_template")
            theme_input = input_data.get("theme", "auto")
            style = input_data.get("style", "auto")
            export_format = input_data.get("export_format", "both")

            content_type = identify_content_type(content)

            # Parse items first to get meaningful title and count
            items = parse_list_items(content)
            item_count = len(items)

            # Smart dimension recommendation
            user_width = input_data.get("width")
            user_height = input_data.get("height")
            platform = input_data.get("platform", "default")

            # Only use smart recommendation if user didn't specify both dimensions
            if user_width is None or user_height is None:
                width, height, dimension_desc = recommend_dimensions(
                    content_type=content_type,
                    item_count=item_count,
                    text_length=len(content),
                    platform=platform,
                    custom_width=user_width,
                    custom_height=user_height
                )

                # Log the recommendation for debugging
                import sys
                print(f"[Infographic] 使用推荐尺寸: {width}x{height} ({dimension_desc})", file=sys.stderr)
            else:
                width = user_width if user_width else 1920
                height = user_height if user_height else 1080
                print(f"[Infographic] 使用用户自定义尺寸: {width}x{height}", file=sys.stderr)

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

            # Generate title from first item or extract from content
            # Note: items already parsed above for dimension calculation
            if len(items) > 0 and len(items[0]) <= 30:
                # Use first item as title if it's short enough
                title = items[0]
                desc = None  # Don't set desc to avoid duplication
            else:
                title = extract_title(content)
                desc = None  # Don't set desc to avoid duplication

            items_with_data = []
            for item in items:
                item_dict = {"label": item}
                item_dict["icon"] = suggest_icon_for_context(item)
                items_with_data.append(item_dict)

            config = self._generate_config_json(
                template, title, desc, items_with_data, palette, style,
                auto_scale=True  # Enable auto-scaling
            )
            html_content = self._generate_html(title, config, width, height)

            # Generate task ID (same logic as remotion)
            # Priority: input_data.task_id > environment variable > sessionId > timestamp
            task_id = (
                input_data.get('task_id') or
                os.getenv('MOTIA_TASK_ID') or  # Read from environment variable set by sandbox
                input_data.get('metadata', {}).get('taskId') or
                input_data.get('sessionId') or
                f"task_{int(time.time())}"
            )

            # Generate unique filename for this task
            if task_id not in self.task_infographic_counts:
                self.task_infographic_counts[task_id] = 0
            self.task_infographic_counts[task_id] += 1

            infographic_number = self.task_infographic_counts[task_id]

            # Add timestamp to ensure uniqueness in multi-turn conversations
            # Format: {task_id}_infographic_{number}_{timestamp_ms}.{format}
            timestamp_ms = int(time.time() * 1000)
            html_filename = f"{task_id}_infographic_{infographic_number}_{timestamp_ms}.html"
            png_filename = f"{task_id}_infographic_{infographic_number}_{timestamp_ms}.png"

            html_path = self.output_dir / html_filename
            svg_path = self.output_dir / png_filename  # PNG will be saved here as fallback

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
                    png_path = Path(actual_export_path)  # Convert to Path object
                    svg_path = None
                    export_url = f"/outputs/infographics/{png_filename}"
                else:
                    png_path = None
                    # svg_path is already a Path object from line 273
                    export_url = f"/outputs/infographics/{png_filename}"  # SVG also uses same name
            else:
                png_path = None
                svg_path = None
                export_url = None

            # Build standardized output using OutputBuilder
            # Determine actual output file (prefer PNG)
            actual_output_path = None
            actual_mime_type = None

            if png_path and png_path.exists():
                actual_output_path = png_path
                actual_mime_type = "image/png"
            elif svg_path and svg_path.exists():
                actual_output_path = svg_path
                actual_mime_type = "image/svg+xml"
            else:
                actual_output_path = html_path
                actual_mime_type = "text/html"

            # Get file information
            relative_path = get_relative_path(actual_output_path)
            file_size = get_file_size(actual_output_path)

            # Use OutputBuilder to build standardized output
            result = OutputBuilder() \
                .set_infographic(
                    path=relative_path,
                    mime_type=actual_mime_type,
                    size=file_size,
                    width=width,
                    height=height,
                    template=template,
                    chart_type=content_type,
                    theme=theme_input if theme_input != "auto" else None,
                    style=style
                ) \
                .set_title(title) \
                .add_skill("infographic-generator") \
                .add_standard_metadata("template", template) \
                .add_standard_metadata("content_type", content_type) \
                .add_standard_metadata("theme", palette) \
                .add_standard_metadata("style", style) \
                .add_standard_metadata("dimensions", {"width": width, "height": height}) \
                .build()

            return result

        except Exception as e:
            import traceback

            traceback.print_exc()

            # Build standardized error output
            if OUTPUT_BUILDER_AVAILABLE:
                error_output = OutputBuilder() \
                    .set_error(
                        error=e,
                        suggestions=[
                            "检查输入内容格式是否正确",
                            "尝试简化内容描述",
                            "如果问题持续,请查看错误日志"
                        ]
                    ) \
                    .add_skill("infographic-generator") \
                    .build()
                return error_output
            else:
                return {"success": False, "error": str(e), "error_type": type(e).__name__}

    def _generate_config_json(
        self,
        template: str,
        title: str,
        desc: str,
        items: list,
        palette: list,
        style: str,
        auto_scale: bool = True,
    ) -> dict:
        """Generate AntV Infographic configuration as JSON object."""
        config = {
            "template": template,
            "data": {
                "title": title,
                "items": items,
            },
        }

        if desc:
            config["data"]["desc"] = desc

        # Add theme if palette or style provided
        theme = {}
        if style:
            theme["stylize"] = style
        if palette:
            theme["palette"] = palette

        if theme:
            config["theme"] = theme

        # Add auto-scale configuration
        if auto_scale:
            # Calculate content metrics to determine optimal scale
            total_items = len(items)
            avg_text_length = sum(len(str(item.get('label', ''))) for item in items) / max(total_items, 1)
            max_text_length = max((len(str(item.get('label', ''))) for item in items), default=0)

            # Determine scale factor based on content characteristics
            if total_items > 10:
                scale_factor = 0.75  # Scale down for many items
            elif total_items > 6:
                scale_factor = 0.85
            elif max_text_length > 30:
                scale_factor = 0.85  # Scale down for long text
            elif max_text_length > 20:
                scale_factor = 0.90
            else:
                scale_factor = 1.0  # No scaling for normal content

            config["layout"] = {
                "autoFit": True,
                "autoSize": True,
            }

            # Add custom scale to infographic
            config["scale"] = scale_factor

            # Log scaling decision for debugging
            print(f"[Infographic] Auto-scale: {scale_factor:.2f}x (items={total_items}, max_text_len={max_text_length})")

        return config

    def _generate_html(self, title: str, config: dict, width: int, height: int) -> str:
        """Generate HTML from template with auto-scaling support."""
        import json

        config_json = json.dumps(config, ensure_ascii=False, indent=2)
        # Escape for JavaScript template literal
        escaped_config = config_json.replace("`", "\\`").replace("$", "\\$")

        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #f0f2f5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            overflow: hidden;  /* Prevent body scroll */
        }}

        #wrapper {{
            position: relative;
            width: 100vw;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
        }}

        #container {{
            background-color: white;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            border-radius: 12px;
            padding: 40px 60px;
            transform-origin: center center;
            transition: transform 0.3s ease;
            max-width: 100%;
            max-height: 100%;
        }}

        /* Auto-scaling container */
        #container.auto-scale {{
            width: {width}px;
            height: {height}px;
        }}

        /* Overflow handling for scaled content */
        .overflow-warning {{
            display: none;
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
        }}
    </style>
</head>
<body>
    <div id="wrapper">
        <div id="container" class="auto-scale"></div>
        <div id="overflow-warning" class="overflow-warning">
            ⚠️ 内容较长，已自动缩放以适应屏幕
        </div>
    </div>
    <script>
        // Using JavaScript API (not DSL)
        const config = {escaped_config};
        const {{Infographic}} = window.AntVInfographic;

        const container = document.getElementById('container');
        const wrapper = document.getElementById('wrapper');

        const infographic = new Infographic({{
            container: container,
            width: '{width}px',
            height: '{height}px',
            ...config
        }});

        // Make it globally accessible for export
        window.infographic = infographic;

        // Call render() to trigger rendering
        infographic.render();

        // Auto-scale functionality
        infographic.on('rendered', (event) => {{
            console.log('✅ Infographic rendered successfully');
            window.renderComplete = true;

            // Auto-scale to fit viewport
            setTimeout(() => {{
                autoScaleContent();
            }}, 100);
        }});

        // Listen for errors
        infographic.on('error', (error) => {{
            console.error('❌ Infographic render error:', error);
            window.renderError = error;
        }});

        function autoScaleContent() {{
            const wrapperWidth = wrapper.clientWidth - 40;  // 40px padding
            const wrapperHeight = wrapper.clientHeight - 40;
            const contentWidth = {width};
            const contentHeight = {height};

            // Calculate scale ratios
            const widthRatio = wrapperWidth / contentWidth;
            const heightRatio = wrapperHeight / contentHeight;

            // Use the smaller ratio to ensure content fits
            let scale = Math.min(widthRatio, heightRatio, 1.0);

            // Only scale down, never scale up
            if (scale >= 0.95) {{
                scale = 1.0;
            }} else if (scale < 0.5) {{
                // Don't scale too much
                scale = 0.5;
            }}

            // Apply scale if needed
            if (scale < 1.0) {{
                container.style.transform = `scale(${{scale}})`;

                // Show warning if significantly scaled
                const warning = document.getElementById('overflow-warning');
                if (scale < 0.8) {{
                    warning.style.display = 'block';
                    setTimeout(() => {{
                        warning.style.display = 'none';
                    }}, 3000);
                }}

                console.log(`[Auto-scale] Scaled to ${{(scale * 100).toFixed(1)}}% to fit viewport`);
            }} else {{
                container.style.transform = 'scale(1.0)';
            }}
        }}

        // Re-scale on window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {{
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {{
                if (window.renderComplete) {{
                    autoScaleContent();
                }}
            }}, 250);
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
