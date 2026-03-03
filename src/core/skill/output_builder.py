"""
myagent Skill Output Builder

提供统一的输出格式构建工具,确保所有 skill 输出符合标准化 schema。

参考文档: skills/schemas/DEVELOPMENT_GUIDE.md
"""

import time
import os
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from dataclasses import dataclass, field


@dataclass
class MediaInfo:
    """媒体文件信息"""
    path: str  # 相对于 outputs/ 的路径,不包含 outputs/ 前缀
    mime_type: str
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None  # 音视频时长(秒)
    fps: Optional[int] = None  # 视频帧率
    sample_rate: Optional[int] = None  # 音频采样率
    frame_count: Optional[int] = None  # GIF/动图帧数
    thumbnail_path: Optional[str] = None  # 缩略图路径(相对于 outputs/)

    # Infographic 特有字段
    template: Optional[str] = None
    chart_type: Optional[str] = None
    theme: Optional[str] = None
    style: Optional[str] = None

    # Report 特有字段
    page_count: Optional[int] = None
    word_count: Optional[int] = None

    # Table 特有字段
    headers: Optional[List[str]] = None
    rows: Optional[List[List[Any]]] = None
    title: Optional[str] = None
    sortable: Optional[bool] = None

    # Code 特有字段
    code: Optional[str] = None
    language: Optional[str] = None
    highlight: Optional[List[int]] = None

    # Text/Markdown 特有字段
    text: Optional[str] = None


@dataclass
class ErrorInfo:
    """错误信息"""
    type: str  # validation, execution, timeout, network, resource, permission, dependency, unknown
    message: str  # 用户友好的错误消息
    details: Optional[str] = None  # 详细错误信息(技术细节)
    retryable: bool = False  # 是否可重试
    suggestions: Optional[List[str]] = None  # 建议的解决方案
    code: Optional[str] = None  # 错误代码


class OutputBuilder:
    """
    统一的输出格式构建器

    使用示例:
        # 成功输出 - 图片
        output = OutputBuilder() \\
            .set_media(MediaInfo(
                path="images/result.png",
                mime_type="image/png",
                size=12345
            )) \\
            .set_title("生成的图片") \\
            .add_tag("generated") \\
            .build()

        # 成功输出 - 信息图
        output = OutputBuilder() \\
            .set_infographic(
                path="infographics/q4_sales.svg",
                mime_type="image/svg+xml",
                template="column-chart",
                theme="business"
            ) \\
            .build()

        # 错误输出
        output = OutputBuilder() \\
            .set_error(
                ErrorInfo(
                    type="validation",
                    message="输入参数无效",
                    retryable=True,
                    suggestions=["检查参数格式", "参考文档示例"]
                )
            ) \\
            .build()
    """

    def __init__(self):
        self._result_type: Optional[str] = None
        self._success: bool = True
        self._content: Optional[Dict[str, Any]] = None
        self._title: Optional[str] = None
        self._description: Optional[str] = None
        self._metadata: Dict[str, Any] = {}
        self._start_time: float = time.time()
        self._skills_used: List[str] = []

    def set_result_type(self, result_type: str) -> 'OutputBuilder':
        """
        设置 result_type

        Args:
            result_type: 结果类型 (text, markdown, code, image, video, audio, gif,
                           infographic, report, table, json, error, mixed)

        Returns:
            self (支持链式调用)
        """
        valid_types = {
            "text", "markdown", "code",
            "image", "video", "audio", "gif",
            "infographic", "report", "table", "json",
            "error", "mixed"
        }

        if result_type not in valid_types:
            raise ValueError(f"Invalid result_type: {result_type}. Must be one of {valid_types}")

        self._result_type = result_type
        return self

    def set_success(self, success: bool) -> 'OutputBuilder':
        """
        设置 success 标志

        Args:
            success: 是否成功

        Returns:
            self
        """
        self._success = success
        return self

    def set_media(self, media_info: MediaInfo) -> 'OutputBuilder':
        """
        设置媒体内容 (image, video, audio, gif)

        Args:
            media_info: 媒体信息

        Returns:
            self
        """
        # 根据媒体类型自动推断 result_type
        mime_to_type = {
            "image/": "image",
            "video/": "video",
            "audio/": "audio",
            "image/gif": "gif"
        }

        for mime_prefix, result_type in mime_to_type.items():
            if media_info.mime_type.startswith(mime_prefix):
                self._result_type = result_type
                break

        content = {
            "path": media_info.path,
            "mime_type": media_info.mime_type
        }

        # 添加可选字段
        if media_info.size is not None:
            content["size"] = media_info.size
        if media_info.width is not None:
            content["width"] = media_info.width
        if media_info.height is not None:
            content["height"] = media_info.height
        if media_info.duration is not None:
            content["duration"] = media_info.duration
        if media_info.fps is not None:
            content["fps"] = media_info.fps
        if media_info.sample_rate is not None:
            content["sample_rate"] = media_info.sample_rate
        if media_info.frame_count is not None:
            content["frame_count"] = media_info.frame_count
        if media_info.thumbnail_path is not None:
            content["thumbnail_path"] = media_info.thumbnail_path

        self._content = content
        return self

    def set_infographic(
        self,
        path: str,
        mime_type: str,
        size: Optional[int] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        thumbnail_path: Optional[str] = None,
        template: Optional[str] = None,
        chart_type: Optional[str] = None,
        theme: Optional[str] = None,
        style: Optional[str] = None
    ) -> 'OutputBuilder':
        """
        设置信息图内容

        Args:
            path: 文件路径(相对于 outputs/)
            mime_type: MIME 类型
            size: 文件大小(字节)
            width: 宽度(像素)
            height: 高度(像素)
            thumbnail_path: 缩略图路径
            template: 模板类型
            chart_type: 图表类型
            theme: 主题
            style: 样式

        Returns:
            self
        """
        self._result_type = "infographic"

        content = {
            "path": path,
            "mime_type": mime_type
        }

        if size is not None:
            content["size"] = size
        if width is not None:
            content["width"] = width
        if height is not None:
            content["height"] = height
        if thumbnail_path is not None:
            content["thumbnail_path"] = thumbnail_path
        if template is not None:
            content["template"] = template
        if chart_type is not None:
            content["chart_type"] = chart_type
        if theme is not None:
            content["theme"] = theme
        if style is not None:
            content["style"] = style

        self._content = content
        return self

    def set_report(
        self,
        path: str,
        mime_type: str,
        size: Optional[int] = None,
        page_count: Optional[int] = None,
        word_count: Optional[int] = None,
        title: Optional[str] = None
    ) -> 'OutputBuilder':
        """
        设置报告内容

        Args:
            path: 文件路径(相对于 outputs/)
            mime_type: MIME 类型 (如 application/pdf)
            size: 文件大小(字节)
            page_count: 页数
            word_count: 字数
            title: 报告标题

        Returns:
            self
        """
        self._result_type = "report"

        content = {
            "path": path,
            "mime_type": mime_type
        }

        if size is not None:
            content["size"] = size
        if page_count is not None:
            content["page_count"] = page_count
        if word_count is not None:
            content["word_count"] = word_count
        if title is not None:
            content["title"] = title

        self._content = content
        return self

    def set_table(
        self,
        headers: List[str],
        rows: List[List[Any]],
        title: Optional[str] = None,
        sortable: bool = False
    ) -> 'OutputBuilder':
        """
        设置表格内容

        Args:
            headers: 表头
            rows: 行数据
            title: 表格标题
            sortable: 是否可排序

        Returns:
            self
        """
        self._result_type = "table"

        self._content = {
            "columns": headers,  # 前端期望 columns 字段
            "headers": headers,  # 保留 headers 以向后兼容
            "rows": rows
        }

        if title is not None:
            self._content["title"] = title
        if sortable:
            self._content["sortable"] = sortable

        return self

    def set_code(
        self,
        code: str,
        language: str,
        filename: str = '',
        highlight: Optional[List[int]] = None
    ) -> 'OutputBuilder':
        """
        设置代码内容

        Args:
            code: 代码内容
            language: 编程语言
            filename: 文件名（可选）
            highlight: 高亮行号列表

        Returns:
            self
        """
        self._result_type = "code"

        self._content = {
            "code": code,
            "language": language,
            "filename": filename
        }

        if highlight is not None:
            self._content["highlight"] = highlight

        return self

    def set_text(self, text: str) -> 'OutputBuilder':
        """
        设置文本内容

        Args:
            text: 文本内容

        Returns:
            self
        """
        self._result_type = "text"
        self._content = text
        return self

    def set_markdown(self, markdown: str) -> 'OutputBuilder':
        """
        设置 Markdown 内容

        Args:
            markdown: Markdown 内容

        Returns:
            self
        """
        self._result_type = "markdown"
        self._content = markdown
        return self

    def set_json(self, data: Union[str, Dict, List]) -> 'OutputBuilder':
        """
        设置 JSON 内容

        Args:
            data: JSON 数据(字符串或对象)

        Returns:
            self
        """
        self._result_type = "json"

        if isinstance(data, (dict, list)):
            import json
            self._content = json.dumps(data, ensure_ascii=False, indent=2)
        else:
            self._content = data

        return self

    def set_mixed(self, items: List[Dict[str, Any]]) -> 'OutputBuilder':
        """
        设置混合内容

        Args:
            items: 内容项列表,每项包含:
                   - type: 内容类型
                   - content: 内容数据
                   - title: (可选) 标题
                   - description: (可选) 描述
                   - order: (可选) 排序

        Returns:
            self
        """
        self._result_type = "mixed"
        self._content = items
        return self

    def set_error(
        self,
        error: Union[Exception, ErrorInfo],
        suggestions: Optional[List[str]] = None
    ) -> 'OutputBuilder':
        """
        设置错误内容

        Args:
            error: 异常对象或 ErrorInfo
            suggestions: 建议的解决方案列表

        Returns:
            self
        """
        self._result_type = "error"
        self._success = False

        if isinstance(error, ErrorInfo):
            error_content = {
                "type": error.type,
                "message": error.message
            }

            if error.details is not None:
                error_content["details"] = error.details
            if error.retryable:
                error_content["retryable"] = error.retryable
            if error.suggestions is not None:
                error_content["suggestions"] = error.suggestions
            if error.code is not None:
                error_content["code"] = error.code

            self._content = error_content
        else:
            # 从 Exception 构建 ErrorInfo
            import traceback

            # 推断错误类型
            error_type_map = {
                ValueError: "validation",
                TypeError: "validation",
                KeyError: "validation",
                AttributeError: "validation",
                TimeoutError: "timeout",
                ConnectionError: "network",
                PermissionError: "permission",
                ImportError: "dependency",
                FileNotFoundError: "resource",
            }

            error_type = "unknown"
            for exc_type, mapped_type in error_type_map.items():
                if isinstance(error, exc_type):
                    error_type = mapped_type
                    break

            error_content = {
                "type": error_type,
                "message": str(error) if str(error) else error.__class__.__name__,
                "details": traceback.format_exc(),
                "retryable": error_type in ["timeout", "network", "resource"]
            }

            if suggestions is not None:
                error_content["suggestions"] = suggestions
            else:
                # 默认建议
                error_content["suggestions"] = [
                    "检查输入参数是否正确",
                    "查看详细错误信息",
                    "如果问题持续存在,请联系技术支持"
                ]

            self._content = error_content

        return self

    def set_title(self, title: str) -> 'OutputBuilder':
        """
        设置标题

        Args:
            title: 标题

        Returns:
            self
        """
        self._title = title
        return self

    def set_description(self, description: str) -> 'OutputBuilder':
        """
        设置描述

        Args:
            description: 描述

        Returns:
            self
        """
        self._description = description
        return self

    def add_tag(self, tag: str) -> 'OutputBuilder':
        """
        添加标签

        Args:
            tag: 标签

        Returns:
            self
        """
        if "tags" not in self._metadata:
            self._metadata["tags"] = []

        self._metadata["tags"].append(tag)
        return self

    def add_skill(self, skill_name: str) -> 'OutputBuilder':
        """
        添加使用的 skill

        Args:
            skill_name: Skill 名称

        Returns:
            self
        """
        self._skills_used.append(skill_name)
        return self

    def add_metadata(self, key: str, value: Any) -> 'OutputBuilder':
        """
        添加自定义元数据

        Args:
            key: 键
            value: 值

        Returns:
            self
        """
        # 自定义字段使用 x- 前缀
        self._metadata[f"x-{key}"] = value
        return self

    def add_standard_metadata(self, key: str, value: Any) -> 'OutputBuilder':
        """
        添加标准元数据(不带 x- 前缀)

        Args:
            key: 键
            value: 值

        Returns:
            self
        """
        self._metadata[key] = value
        return self

    def set_metadata(self, key: str, value: Any) -> 'OutputBuilder':
        """
        设置元数据(通用方法，支持任意键值对)

        Args:
            key: 键
            value: 值

        Returns:
            self
        """
        self._metadata[key] = value
        return self

    def build(self) -> Dict[str, Any]:
        """
        构建最终输出

        Returns:
            符合统一格式的输出字典
        """
        # 验证必需字段
        if self._result_type is None:
            raise ValueError("result_type is required. Use set_result_type() or content-specific methods.")

        if self._content is None:
            raise ValueError("content is required. Use content-specific methods like set_media(), set_error(), etc.")

        # 计算执行时间
        execution_time = int((time.time() - self._start_time) * 1000)

        # 构建 metadata
        metadata = {
            "execution_time": execution_time,
            "skills_used": self._skills_used
        }

        # 合入自定义 metadata
        metadata.update(self._metadata)

        # 构建最终输出
        output = {
            "result_type": self._result_type,
            "success": self._success,
            "content": self._content,
            "metadata": metadata
        }

        # 对于 text 和 markdown 类型，同时设置 output 字段
        # 这样 task-result-handler 可以正确处理并创建 artifacts
        if self._result_type in ("text", "markdown") and isinstance(self._content, str):
            output["output"] = self._content

        # 添加可选的 title 和 description
        if self._title is not None:
            output["title"] = self._title
        if self._description is not None:
            output["description"] = self._description

        # 提升常用元数据到顶层（用于 tool skills 追踪和调试）
        if "output_files" in metadata:
            output["output_files"] = metadata["output_files"]
        if "command" in metadata:
            output["command"] = metadata["command"]
        if "pattern" in metadata:
            output["pattern"] = metadata["pattern"]
        if "matched_files" in metadata:
            output["matched_files"] = metadata["matched_files"]
        if "matches" in metadata:
            output["matches"] = metadata["matches"]
        if "match_count" in metadata:
            output["match_count"] = metadata["match_count"]

        return output


def get_relative_path(full_path: Union[str, Path], base_dir: Optional[Union[str, Path]] = None) -> str:
    """
    获取相对于 outputs/ 目录的路径

    Args:
        full_path: 完整文件路径
        base_dir: 基础目录(默认为项目根目录)

    Returns:
        相对于 outputs/ 的路径,不包含 outputs/ 前缀

    Examples:
        >>> get_relative_path("/path/to/project/outputs/infographics/q4.svg")
        "infographics/q4.svg"

        >>> get_relative_path("/path/to/project/outputs/videos/clip.mp4")
        "videos/clip.mp4"
    """
    if base_dir is None:
        # 默认使用项目根目录
        current_file = Path(__file__)
        base_dir = current_file.parent.parent.parent

    full_path = Path(full_path)
    base_dir = Path(base_dir)

    # 尝试找到 outputs 目录
    outputs_dir = base_dir / "outputs"

    # 如果传入的路径已经是相对于 outputs 的,直接返回
    try:
        relative = full_path.relative_to(outputs_dir)
        return str(relative)
    except ValueError:
        # 如果不是相对于 outputs 的,尝试其他方式
        pass

    # 如果路径包含 outputs/,提取其后部分
    path_str = str(full_path)
    if "outputs/" in path_str:
        # 提取 outputs/ 后的部分
        parts = path_str.split("outputs/")
        if len(parts) > 1:
            result = parts[1]
            # 移除开头的斜杠
            if result.startswith("/"):
                result = result[1:]
            return result

    # 如果无法提取,返回路径的文件名部分(作为最后的备选)
    return full_path.name


def get_file_size(file_path: Union[str, Path]) -> Optional[int]:
    """
    获取文件大小

    Args:
        file_path: 文件路径

    Returns:
        文件大小(字节),如果文件不存在返回 None
    """
    try:
        return Path(file_path).stat().st_size
    except (FileNotFoundError, OSError):
        return None


def get_image_dimensions(image_path: Union[str, Path]) -> Optional[tuple]:
    """
    获取图片尺寸

    Args:
        image_path: 图片路径

    Returns:
        (width, height) 元组,如果无法获取返回 None
    """
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            return img.size
    except Exception:
        return None


def get_video_dimensions(video_path: Union[str, Path]) -> Optional[tuple]:
    """
    获取视频尺寸

    Args:
        video_path: 视频路径

    Returns:
        (width, height) 元组,如果无法获取返回 None
    """
    try:
        import subprocess
        result = subprocess.run([
            "ffprobe", "-v", "quiet", "-show_entries",
            "stream=width,height", "-of", "csv=p=0", str(video_path)
        ], capture_output=True, text=True, timeout=10)

        if result.returncode == 0:
            dimensions_str = result.stdout.strip()
            if ',' in dimensions_str:
                width, height = dimensions_str.split(',')
                return (int(width), int(height))
    except Exception:
        pass

    return None


# 便捷函数
def build_media_output(
    file_path: str,
    mime_type: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    skills_used: Optional[List[str]] = None,
    **kwargs
) -> Dict[str, Any]:
    """
    快速构建媒体输出(image/video/audio/gif)

    Args:
        file_path: 文件路径(完整路径或相对于 outputs/)
        mime_type: MIME 类型
        title: 标题
        description: 描述
        skills_used: 使用的 skill 列表
        **kwargs: 其他 MediaInfo 字段

    Returns:
        标准化输出
    """
    # 获取相对路径
    relative_path = get_relative_path(file_path)

    # 获取文件大小
    size = get_file_size(file_path)

    # 构建 MediaInfo
    media_info = MediaInfo(
        path=relative_path,
        mime_type=mime_type,
        size=size,
        **kwargs
    )

    # 使用 OutputBuilder 构建
    builder = OutputBuilder().set_media(media_info)

    if title:
        builder.set_title(title)
    if description:
        builder.set_description(description)
    if skills_used:
        for skill in skills_used:
            builder.add_skill(skill)

    return builder.build()


def build_error_output(
    error: Union[Exception, ErrorInfo],
    error_type: Optional[str] = None,
    message: Optional[str] = None,
    retryable: bool = False,
    suggestions: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    快速构建错误输出

    Args:
        error: 异常对象或 ErrorInfo
        error_type: 错误类型(如果 error 是 Exception)
        message: 错误消息(如果 error 是 Exception)
        retryable: 是否可重试
        suggestions: 建议的解决方案

    Returns:
        标准化错误输出
    """
    if isinstance(error, ErrorInfo):
        return OutputBuilder().set_error(error).build()
    else:
        # 如果提供了自定义的 error_type 或 message,覆盖默认值
        if error_type or message:
            error_info = ErrorInfo(
                type=error_type or "unknown",
                message=message or str(error),
                retryable=retryable,
                suggestions=suggestions
            )
            return OutputBuilder().set_error(error_info).build()
        else:
            return OutputBuilder().set_error(error, suggestions).build()
