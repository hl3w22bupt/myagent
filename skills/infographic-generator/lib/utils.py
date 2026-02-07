"""Utility functions for infographic generation."""

import re
import hashlib
from datetime import datetime


def sanitize_filename(filename: str) -> str:
    """Sanitize filename to be safe for filesystem."""
    filename = re.sub(r'[<>:"/\\|?*]', "", filename)
    filename = filename.strip()
    if not filename:
        filename = "infographic"
    return filename


def generate_id(content: str) -> str:
    """Generate unique ID based on content hash."""
    return hashlib.md5(content.encode()).hexdigest()[:8]


def format_timestamp() -> str:
    """Format current timestamp for metadata."""
    return datetime.utcnow().isoformat() + "Z"


def truncate_text(text: str, max_length: int) -> str:
    """Truncate text to max length, adding ellipsis if needed."""
    if len(text) <= max_length:
        return text
    return text[: max_length - 3] + "..."


def extract_title(content: str, max_length: int = 20) -> str:
    """Extract meaningful title from content."""
    # 移除常见任务前缀
    prefixes = [
        "生成一个", "创建一个", "设计一个", "制作一个", "画一个",
        "生成", "创建", "设计", "制作", "画",
        "用图表展示", "展示", "绘制",
        "请生成", "请创建", "请设计", "请制作",
    ]

    content_cleaned = content.strip()
    for prefix in prefixes:
        if content_cleaned.startswith(prefix):
            content_cleaned = content_cleaned[len(prefix):].strip()
            break

    # 移除结尾的标点
    content_cleaned = content_cleaned.rstrip('。.!！')

    lines = content_cleaned.split("\n")
    first_line = lines[0].strip()

    if len(first_line) <= max_length:
        return first_line

    return truncate_text(first_line, max_length)


def extract_description(content: str, max_length: int = 50) -> str:
    """Extract meaningful description from content."""
    lines = [l.strip() for l in content.split("\n") if l.strip()]
    if len(lines) > 1:
        return truncate_text(lines[1], max_length)
    return truncate_text(content, max_length)


def parse_list_items(content: str) -> list:
    """Parse content into clean list items.

    Handles formats like:
    1. Item one - description
    2. Item two - description
    3. Item three - description

    Or inline format:
    The stages are: 1. Requirement Analysis: description; 2. System Design: description; 3. Coding...

    Or:
    - Item one
    - Item two
    - Item three
    """
    items = []

    # Try numbered list with comma separator (e.g., "1. A, 2. B, 3. C" or "1. A、2. B、3. C")
    # This handles AI-generated descriptions like "include these 5 stages: 1. A, 2. B, 3. C"
    # Also handles ending with period: "1. A, 2. B, 3. C."
    numbered_comma_pattern = r'\d+\.\s*([^,，.。]+?)(?=\s*[,，.。])'
    numbered_comma_matches = re.findall(numbered_comma_pattern, content)

    if numbered_comma_matches and len(numbered_comma_matches) > 1:
        items = [match.strip() for match in numbered_comma_matches if match.strip()]
        # Remove items that are too short or too long
        items = [item for item in items if 2 <= len(item) <= 50]
        if items and len(items) > 1:
            return items

    # Try inline numbered list first (e.g., "1. Item...; 2. Item...; 3. Item...")
    # This handles cases where all items are on the same line or in a paragraph
    # Pattern: "1. Label: description; 2. Label: description;" or "1. Label - description; 2. Label - description;"
    inline_pattern = r'\d+\.\s*([^:：\-；;]+?)(?:[:：]| - |－)(?:[^;；]*?)(?=;\s*\d+\.|；\s*\d+\.|;\s*$|；\s*$|$)'
    inline_matches = re.findall(inline_pattern, content)

    if inline_matches and len(inline_matches) > 1:
        items = [match.strip() for match in inline_matches]
        if items:
            return items

    # Try multi-line numbered list pattern (e.g., "1. ", "2. ", etc.)
    numbered_pattern = r'(?:^|\n)\s*\d+\.\s*([^\n]+?)(?:\s*-\s*[^\n]+)?(?=\n\s*\d+\.|\n*$|$)'
    numbered_matches = re.findall(numbered_pattern, content, re.MULTILINE)

    if numbered_matches and len(numbered_matches) > 1:
        # Extract just the main label (before dash) or full line if no dash
        items = []
        for match in numbered_matches:
            match = match.strip()
            # If there's a dash, take only the part before it
            if ' - ' in match:
                label = match.split(' - ')[0].strip()
            elif '－' in match:  # Full-width dash
                label = match.split('－')[0].strip()
            else:
                label = match
            items.append(label)
        if items:
            return items

    # Try bullet points or hyphens
    bullet_pattern = r'(?:^|\n)\s*[-•*]\s*([^\n]+?)(?:\s*-\s*[^\n]+)?(?=\n\s*[-•*]|\n*$|$)'
    bullet_matches = re.findall(bullet_pattern, content, re.MULTILINE)

    if bullet_matches and len(bullet_matches) > 1:
        items = []
        for match in bullet_matches:
            match = match.strip()
            if ' - ' in match:
                label = match.split(' - ')[0].strip()
            elif '－' in match:
                label = match.split('－')[0].strip()
            else:
                label = match
            items.append(label)
        if items:
            return items

    # Try Chinese enumeration (一、二、三、等)
    chinese_pattern = r'(?:^|\n)\s*[一二三四五六七八九十][、．.]\s*([^\n]+?)(?:\s*[-－—]\s*[^\n]+)?(?=\n|\n*$|$)'
    chinese_matches = re.findall(chinese_pattern, content, re.MULTILINE)

    if chinese_matches and len(chinese_matches) > 1:
        items = []
        for match in chinese_matches:
            match = match.strip()
            if ' - ' in match:
                label = match.split(' - ')[0].strip()
            elif '－' in match or ' — ' in match:
                label = re.split(r'[－—]', match)[0].strip()
            else:
                label = match
            items.append(label)
        if items:
            return items

    # Try Chinese comma-separated list (e.g., "Item1、Item2、Item3" or "Item1,Item2,Item3")
    # This handles common Chinese punctuation
    # First, check if there's a colon with list indicator after it
    list_start_pattern = r'[:：][：:\s]*(.*?)(?:$|\.|。|!|！)'
    list_match = re.search(list_start_pattern, content)

    if list_match:
        # Only parse the part after the colon
        content_to_parse = list_match.group(1)
    else:
        # Check for common list indicator keywords
        indicator_pattern = r'(?:包括|包含|如下|为|有)[：:\s]+(.*?)(?:$|\.|。|!|！)'
        indicator_match = re.search(indicator_pattern, content)
        if indicator_match:
            content_to_parse = indicator_match.group(1)
        else:
            # Use entire content
            content_to_parse = content

    comma_pattern = r'[^、,，]+(?=[、,，]|$)'
    comma_matches = re.findall(comma_pattern, content_to_parse)

    # Filter out common phrases that aren't actual items
    if comma_matches and len(comma_matches) > 1:
        items = [match.strip() for match in comma_matches if match.strip()]
        # Remove items that are too short (likely noise) or too long (likely sentences)
        items = [item for item in items if 2 <= len(item) <= 50]
        if items and len(items) > 1:
            return items

    # Fallback: split by newlines and clean up
    if "\n" in content:
        items = [line.strip() for line in content.split("\n") if line.strip()]
        # Further clean items by removing colons and extra descriptions
        cleaned_items = []
        for item in items:
            # Remove common prefixes like "阶段：", "步骤：" etc.
            item = re.sub(r'^[阶段步骤步骤][：:]\s*', '', item)
            # Split by dash and take first part if item is long
            if ' - ' in item and len(item) > 20:
                item = item.split(' - ')[0].strip()
            elif '－' in item and len(item) > 20:
                item = item.split('－')[0].strip()
            cleaned_items.append(item)
        return cleaned_items

    return items if items else [content]
