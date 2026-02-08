"""Aspect ratio recommendations for infographics.

Provides intelligent aspect ratio recommendations based on:
- Content type (sequence, list, chart, etc.)
- Item count
- Text length
- Platform compatibility (Instagram, Twitter, LinkedIn, etc.)
"""

from typing import Tuple, Dict, List
from enum import Enum


class AspectRatio(Enum):
    """Standard aspect ratios."""
    # Landscape (horizontal)
    SQUARE_1_1 = (1, 1, "1:1 正方形")
    LANDSCAPE_4_3 = (4, 3, "4:3 标准")
    LANDSCAPE_16_9 = (16, 9, "16:9 宽屏")
    LANDSCAPE_21_9 = (21, 9, "21:9 超宽")

    # Portrait (vertical)
    PORTRAIT_3_4 = (3, 4, "3:4 竖版")
    PORTRAIT_9_16 = (9, 16, "9:16 手机竖屏")

    # Specialized
    A4 = (297, 210, "A4 文档")  # mm, but used as ratio
    SLIDE = (16, 9, "PPT 幻灯片")
    POSTER = (3, 4, "海报")


# Platform-specific optimal ratios
PLATFORM_RATIOS = {
    "instagram": {
        "feed": AspectRatio.SQUARE_1_1,
        "story": AspectRatio.PORTRAIT_9_16,
        "portrait": AspectRatio.PORTRAIT_3_4,
    },
    "twitter": {
        "feed": AspectRatio.LANDSCAPE_16_9,
        "timeline": AspectRatio.SQUARE_1_1,
    },
    "linkedin": {
        "feed": AspectRatio.LANDSCAPE_4_3,
        "document": AspectRatio.SQUARE_1_1,
    },
    "weixin": {
        "moments": AspectRatio.SQUARE_1_1,
        "article": AspectRatio.PORTRAIT_3_4,
    },
    "default": {
        "standard": AspectRatio.LANDSCAPE_16_9,
    }
}


def recommend_dimensions(
    content_type: str,
    item_count: int,
    text_length: int = 0,
    platform: str = "default",
    custom_width: int = None,
    custom_height: int = None
) -> Tuple[int, int, str]:
    """Recommend optimal dimensions for infographic.

    Args:
        content_type: Type of content (sequence, list, chart, etc.)
        item_count: Number of items to display
        text_length: Approximate text length (optional)
        platform: Target platform (instagram, twitter, linkedin, weixin, default)
        custom_width: User-specified width (overrides recommendation)
        custom_height: User-specified height (overrides recommendation)

    Returns:
        (width, height, description): Recommended dimensions and description
    """
    # If user specified both dimensions, use them
    if custom_width and custom_height:
        return custom_width, custom_height, "用户自定义"

    # Determine base aspect ratio based on content type and item count
    aspect_ratio = _determine_aspect_ratio(content_type, item_count, text_length)

    # Only override with platform-specific recommendation if explicitly requested
    # and platform is not "default"
    if platform != "default" and platform in PLATFORM_RATIOS:
        platform_config = PLATFORM_RATIOS[platform]
        # Use platform's standard ratio
        aspect_ratio = list(platform_config.values())[0]

    # Calculate dimensions from aspect ratio
    width, height = _calculate_dimensions_from_ratio(aspect_ratio, custom_width, custom_height)

    description = f"{aspect_ratio.value[2]} - {content_type}({item_count}项)"

    return width, height, description


def _determine_aspect_ratio(content_type: str, item_count: int, text_length: int) -> AspectRatio:
    """Determine best aspect ratio based on content characteristics."""

    # 1. Content type specific recommendations
    if content_type == "sequence":
        # Sequence/flowcharts work best in wide format
        if item_count <= 4:
            return AspectRatio.LANDSCAPE_16_9
        elif item_count <= 8:
            return AspectRatio.LANDSCAPE_21_9  # Wider for more steps
        else:
            return AspectRatio.LANDSCAPE_21_9  # Ultra wide for long sequences

    elif content_type == "list":
        # Lists can work in multiple formats
        if item_count <= 4:
            # Few items, square looks balanced
            return AspectRatio.SQUARE_1_1
        elif item_count <= 8:
            # Medium list, standard landscape
            return AspectRatio.LANDSCAPE_16_9
        else:
            # Many items, portrait might work better for mobile
            return AspectRatio.PORTRAIT_3_4

    elif content_type == "chart":
        # Charts typically look best in standard ratios
        return AspectRatio.LANDSCAPE_16_9

    elif content_type == "compare":
        # Comparison often needs width for side-by-side
        return AspectRatio.LANDSCAPE_16_9

    elif content_type == "hierarchy":
        # Hierarchy/tree structures vary
        if item_count <= 6:
            return AspectRatio.LANDSCAPE_16_9
        else:
            return AspectRatio.LANDSCAPE_21_9  # More space for complex trees

    elif content_type == "quadrant":
        # Quadrants are naturally square
        return AspectRatio.SQUARE_1_1

    elif content_type == "relation":
        # Relation/circle diagrams are often square
        return AspectRatio.SQUARE_1_1

    # 2. Fallback based on item count
    if item_count <= 3:
        return AspectRatio.SQUARE_1_1
    elif item_count <= 6:
        return AspectRatio.LANDSCAPE_16_9
    else:
        return AspectRatio.LANDSCAPE_16_9


def _calculate_dimensions_from_ratio(
    aspect_ratio: AspectRatio,
    custom_width: int = None,
    custom_height: int = None
) -> Tuple[int, int]:
    """Calculate actual dimensions from aspect ratio.

    Uses standard base resolutions:
    - Square: 1080x1080 (Instagram standard)
    - Landscape: 1920x1080 (Full HD)
    - Portrait: 1080x1920 (Mobile)
    """

    # Base dimensions for each ratio type
    base_dimensions = {
        AspectRatio.SQUARE_1_1: (1080, 1080),
        AspectRatio.LANDSCAPE_4_3: (1440, 1080),
        AspectRatio.LANDSCAPE_16_9: (1920, 1080),
        AspectRatio.LANDSCAPE_21_9: (2560, 1080),
        AspectRatio.PORTRAIT_3_4: (1080, 1440),
        AspectRatio.PORTRAIT_9_16: (1080, 1920),
    }

    width_ratio, height_ratio, _ = aspect_ratio.value

    # If custom dimension provided, calculate the other
    if custom_width:
        # Calculate height from width
        height = int(custom_width * height_ratio / width_ratio)
        return custom_width, height

    if custom_height:
        # Calculate width from height
        width = int(custom_height * width_ratio / height_ratio)
        return width, custom_height

    # Use base dimensions
    if aspect_ratio in base_dimensions:
        return base_dimensions[aspect_ratio]

    # Calculate from base width 1920
    base_width = 1920
    height = int(base_width * height_ratio / width_ratio)
    return base_width, height


def get_dimension_variants(content_type: str, item_count: int) -> List[Dict[str, any]]:
    """Get multiple dimension options for user to choose from.

    Returns a list of recommended dimension options with descriptions.
    """
    primary_width, primary_height, primary_desc = recommend_dimensions(
        content_type, item_count
    )

    variants = [
        {
            "width": primary_width,
            "height": primary_height,
            "description": primary_desc,
            "recommended": True,
            "ratio": round(primary_width / primary_height, 2),
        }
    ]

    # Add alternatives
    if content_type in ["list", "sequence"]:
        # Add square variant for lists/sequences
        sq_w, sq_h, sq_desc = recommend_dimensions(
            content_type, item_count, platform="instagram"
        )
        variants.append({
            "width": sq_w,
            "height": sq_h,
            "description": f"正方形（适合社交媒体）",
            "recommended": False,
            "ratio": 1.0,
        })

        # Add ultra-wide variant for sequences
        if content_type == "sequence" and item_count > 6:
            uw_w, uw_h, uw_desc = recommend_dimensions(
                content_type, item_count
            )
            # Use 21:9 ratio
            variants.append({
                "width": 2560,
                "height": 1080,
                "description": f"超宽屏（适合{item_count}+步骤）",
                "recommended": False,
                "ratio": 2.37,
            })

    return variants


# Standard dimension presets for quick access
STANDARD_DIMENSIONS = {
    "square": (1080, 1080),
    "landscape": (1920, 1080),
    "portrait": (1080, 1920),
    "ultra_wide": (2560, 1080),
    "presentation": (1920, 1080),
    "a4_print": (2480, 3508),  # A4 at 300 DPI
}


def get_standard_preset(name: str) -> Tuple[int, int]:
    """Get a standard dimension preset by name."""
    return STANDARD_DIMENSIONS.get(name.lower(), STANDARD_DIMENSIONS["landscape"])
