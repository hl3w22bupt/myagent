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
    lines = content.split("\n")
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
    """Parse content into list items."""
    items = []

    separators = ["→", "->", ">", "•", "-", "*", "1.", "2.", "3.", "4.", "5."]

    for sep in separators:
        if sep in content:
            items = [item.strip() for item in content.split(sep) if item.strip()]
            if len(items) > 1:
                return items

    if "\n" in content:
        items = [line.strip() for line in content.split("\n") if line.strip()]

    return items if items else [content]
