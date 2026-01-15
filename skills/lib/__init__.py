"""
Motia Skills Library

公共工具库,被所有 skills 使用。
"""

from .output_builder import (
    OutputBuilder,
    MediaInfo,
    ErrorInfo,
    get_relative_path,
    get_file_size,
    get_image_dimensions,
    get_video_dimensions,
    build_media_output,
    build_error_output
)

__all__ = [
    "OutputBuilder",
    "MediaInfo",
    "ErrorInfo",
    "get_relative_path",
    "get_file_size",
    "get_image_dimensions",
    "get_video_dimensions",
    "build_media_output",
    "build_error_output"
]
