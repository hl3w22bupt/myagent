"""
Web Search Skill - Mock Implementation

This is a mock implementation for demonstration purposes.
In production, this would integrate with a real search API.
"""

import asyncio
import sys
import time
from pathlib import Path
from typing import Dict, Any, List

# Add src to path for shared utilities (src must be in path for 'from core.skill' to work)
src_dir = Path(__file__).parent.parent.parent / "src"
if src_dir.exists():
    sys.path.insert(0, str(src_dir))

try:
    from core.skill.output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


async def perform_web_search(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    执行网络搜索

    当前实现: DuckDuckGo Search
    未来切换点: 可以在这里替换为 MCP 工具调用

    Args:
        query: 搜索关键词
        limit: 返回结果数量

    Returns:
        搜索结果列表
    """
    # ========================================================================
    # 当前实现: DuckDuckGo Search (无需 API key)
    # ========================================================================
    try:
        from ddgs import DDGS

        ddgs = DDGS()
        results = list(ddgs.text(query, max_results=limit))

        formatted = []
        for r in results:
            formatted.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),  # 新版本使用 href 而不是 link
                "snippet": r.get("body", ""),
                "source": "DuckDuckGo"
            })

        return formatted

    except Exception as e:
        # 回退到 mock 数据
        return [
            {
                "title": f"Result {i+1} for '{query}'",
                "url": f"https://example.com/result-{i+1}",
                "snippet": f"Search error: {str(e)}. Please install: pip install ddgs",
                "source": "Fallback"
            }
            for i in range(limit)
        ]

    # ========================================================================
    # 未来切换点: 集成 MCP web-search-prime 工具
    # ========================================================================
    #
    # 当 Motia 框架支持 Python 调用 MCP 工具时,可以替换上面的实现为:
    #
    # try:
    #     # 通过 MCP 工具调用 (伪代码,具体实现取决于 Motia 的 MCP 支持)
    #     mcp_results = await context.mcp_call(
    #         server="web-search-prime",
    #         tool="webSearchPrime",
    #         parameters={
    #             "search_query": query,
    #             "limit": limit,
    #             "content_size": "medium"
    #         }
    #     )
    #
    #     # 格式化 MCP 返回结果
    #     return [
    #         {
    #             "title": r.get("title", ""),
    #             "url": r.get("link", ""),
    #             "snippet": r.get("content", ""),
    #             "source": "MCP Web Search"
    #         }
    #         for r in mcp_results.get("results", [])
    #     ]
    #
    # except Exception as e:
    #     # 回退到 DuckDuckGo
    #     return await perform_duckduckgo_search(query, limit)
    #
    # ========================================================================


async def execute(input_data: Dict[str, Any], context=None) -> Dict[str, Any]:
    """
    Execute web search using a search API.

    Args:
        input_data: Dictionary containing:
            - query: Search query string (preferred)
            - task: Task description (fallback for query)
            - description: Description of what to search (fallback)
            - limit: Maximum number of results (default: 5)

    Returns:
        Dictionary with search results in unified format
    """
    start_time = time.time()

    # Try multiple field names for query (in order of preference)
    query = input_data.get('query') or input_data.get('task') or input_data.get('description')
    limit = input_data.get('limit', 5)

    # Input validation with smart fallback
    if not query or not query.strip():
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ValueError("Query is required for web search"),
                    suggestions=[
                        "Provide a search query using 'query' field",
                        "Provide task description using 'task' field",
                        "Ensure at least one field is not empty"
                    ]
                ) \
                .build()
        else:
            return {"error": "Query is required"}

    # Query length validation (moved from WebSearchHook)
    MIN_QUERY_LENGTH = 3
    if len(query.strip()) < MIN_QUERY_LENGTH:
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ValueError(f"Query too short (minimum {MIN_QUERY_LENGTH} characters)"),
                    suggestions=[
                        f"Provide a query with at least {MIN_QUERY_LENGTH} characters",
                        "Try a more specific search term"
                    ]
                ) \
                .build()
        else:
            return {"error": f"Query too short (minimum {MIN_QUERY_LENGTH} characters)"}

    try:
        # Report progress
        if context:
            await context.report_step("Initializing search...")

        if context:
            await context.report_step(f"Searching for: {query}")

        # 调用搜索功能
        search_results = await perform_web_search(query, limit)

        if context:
            await context.report_step(f"Found {len(search_results)} results")

        # Use OutputBuilder
        return OutputBuilder() \
            .set_table(
                headers=["Title", "URL", "Snippet", "Source"],
                rows=[[r["title"], r["url"], r["snippet"], r["source"]]
                      for r in search_results],
                title=f"Search Results for '{query}'"
            ) \
            .add_standard_metadata("query", query) \
            .add_standard_metadata("search_engine", "duckduckgo") \
            .add_standard_metadata("result_count", len(search_results)) \
            .build()

    except Exception as e:
        # Error handling with OutputBuilder
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check if the search query is valid",
                        "Try installing: pip install ddgs",
                        "Check network connectivity"
                    ]
                ) \
                .add_standard_metadata("query", query) \
                .build()
        else:
            return {"error": str(e), "query": query}


# For testing purposes
if __name__ == "__main__":
    import asyncio
    import json

    async def test():
        result = await execute({"query": "Python programming", "limit": 3})
        print(json.dumps(result, indent=2))

    asyncio.run(test())
