"""
Web Reader - 网页内容读取工具

支持两种输入模式：
1. 直接参数：url（直接执行，无需内部 LLM）
2. 任务模式：task（自然语言，内部 LLM 解析为参数）
"""
import sys
import json
from pathlib import Path
from typing import Dict, Any
import subprocess

# Add src to path for shared utilities
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False

try:
    from core.skill.llm_client import get_llm_client
    LLM_CLIENT_AVAILABLE = True
except ImportError:
    LLM_CLIENT_AVAILABLE = False


def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行网页读取 - 支持任务模式和直接参数模式

    优先级：
    1. 直接参数（url）- 直接执行
    2. 任务模式 - 内部 LLM 解析为参数
    """
    # 模式 1：直接参数（优先）
    if "url" in input_data:
        return _execute_direct(input_data)

    # 模式 2：任务模式
    task = input_data.get("task")
    if task:
        params = _call_llm_for_params(task)
        return _execute_direct(params)

    # 两种模式都未提供
    if OUTPUT_BUILDER_AVAILABLE:
        return OutputBuilder().set_error(
            error=ValueError("Either 'task' or 'url' parameter is required"),
            suggestions=["Provide 'url' for direct execution or 'task' for natural language"]
        ).build()
    else:
        return {
            "success": False,
            "error": "Either 'task' or 'url' parameter is required"
        }


def _execute_direct(params: Dict[str, Any]) -> Dict[str, Any]:
    """直接执行，使用解析后的参数"""
    url = params.get("url")
    timeout = params.get("timeout", 20)
    return_format = params.get("return_format", "markdown")

    if not url:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(
                error=ValueError("url is required"),
                suggestions=["Provide 'url' parameter"]
            ).build()
        else:
            return {"success": False, "error": "url is required"}

    try:
        # 使用 MCP web-reader 工具读取网页
        content = _read_web_page(url, timeout, return_format)

        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_text(content).build()
        else:
            return {
                "success": True,
                "result_type": "text",
                "content": content
            }
    except Exception as e:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder().set_error(e).build()
        else:
            return {
                "success": False,
                "error": str(e)
            }


def _read_web_page(url: str, timeout: int, return_format: str) -> str:
    """
    使用 MCP web-reader 工具读取网页

    Args:
        url: 网页 URL
        timeout: 超时时间（秒）
        return_format: 返回格式（markdown 或 text）

    Returns:
        网页内容（Markdown 或纯文本）
    """
    # 这里需要调用 MCP web-reader 工具
    # 由于是 Python 环境，我们使用 requests 库直接实现
    try:
        import requests
        from bs4 import BeautifulSoup
        import html2text

        # 发送 HTTP 请求
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        # 禁用 SSL 验证（仅用于开发环境）
        response = requests.get(url, headers=headers, timeout=timeout, verify=False)
        response.raise_for_status()
        response.encoding = response.apparent_encoding

        # 解析 HTML
        soup = BeautifulSoup(response.text, 'html.parser')

        # 移除脚本和样式
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()

        # 提取主要内容
        # 尝试找到主要内容区域
        main_content = (
            soup.find('article') or
            soup.find('main') or
            soup.find('div', class_='content') or
            soup.find('div', class_='main') or
            soup.body
        )

        if not main_content:
            main_content = soup

        # 根据格式返回
        if return_format == "markdown":
            # 转换为 Markdown
            h = html2text.HTML2Text()
            h.ignore_links = False
            h.ignore_images = False
            h.body_width = 0  # 不换行
            content = h.handle(str(main_content))
        else:
            # 纯文本
            content = main_content.get_text(separator='\n', strip=True)

        # 添加标题
        title = soup.title.string if soup.title else "Untitled"
        result = f"# {title}\n\n{content}"

        return result

    except ImportError:
        # 如果没有安装依赖，使用简化版本
        return _simple_web_read(url, timeout)
    except Exception as e:
        raise Exception(f"Failed to read web page: {str(e)}")


def _simple_web_read(url: str, timeout: int) -> str:
    """简化版网页读取（不依赖额外库）"""
    try:
        import urllib.request
        import urllib.error
        from html.parser import HTMLParser

        # 发送请求
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            html = response.read().decode('utf-8', errors='ignore')

        # 简单的文本提取
        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text = []
                self.in_script = False

            def handle_starttag(self, tag, attrs):
                if tag in ['script', 'style', 'nav', 'footer']:
                    self.in_script = True

            def handle_endtag(self, tag):
                if tag in ['script', 'style', 'nav', 'footer']:
                    self.in_script = False

            def handle_data(self, data):
                if not self.in_script and data.strip():
                    self.text.append(data.strip())

        parser = TextExtractor()
        parser.feed(html)

        # 提取标题
        title_start = html.find('<title>')
        title_end = html.find('</title>')
        if title_start != -1 and title_end != -1:
            title = html[title_start + 7:title_end].strip()
        else:
            title = "Untitled"

        # 组合结果
        content = '\n'.join(parser.text[:100])  # 限制行数
        return f"# {title}\n\n{content}"

    except Exception as e:
        raise Exception(f"Failed to read web page: {str(e)}")


def _call_llm_for_params(task: str) -> Dict[str, Any]:
    """使用 LLM 解析自然语言任务为参数"""
    if not LLM_CLIENT_AVAILABLE:
        # 简单的 URL 提取逻辑
        import re
        url_match = re.search(r'https?://[^\s]+', task)
        if url_match:
            return {"url": url_match.group()}
        else:
            raise ValueError("Could not extract URL from task")

    try:
        llm_client = get_llm_client()

        prompt = f"""Extract the URL from this task and return as JSON:
Task: {task}

Return format: {{"url": "extracted_url", "timeout": 20, "return_format": "markdown"}}
Only return the JSON, no other text."""

        response = llm_client.complete([{"role": "user", "content": prompt}])

        # 解析 JSON 响应
        result = json.loads(response.strip())
        return result

    except Exception as e:
        # 降级到简单提取
        import re
        url_match = re.search(r'https?://[^\s]+', task)
        if url_match:
            return {"url": url_match.group()}
        else:
            raise ValueError(f"Failed to parse task: {str(e)}")
