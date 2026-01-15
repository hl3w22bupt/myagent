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

# Add parent lib for OutputBuilder (absolute path to skills/lib)
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute web search using a search API.

    Args:
        input_data: Dictionary containing:
            - query: Search query string
            - limit: Maximum number of results (default: 5)

    Returns:
        Dictionary with search results in unified format
    """
    start_time = time.time()

    query = input_data.get('query')
    limit = input_data.get('limit', 5)

    # Input validation
    if not query or not query.strip():
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=ValueError("Query is required for web search"),
                    suggestions=[
                        "Provide a search query",
                        "Ensure query field is not empty"
                    ]
                ) \
                .build()
        else:
            return {"error": "Query is required"}

    try:
        # Simulate API call delay
        await asyncio.sleep(0.5)

        # Mock search results
        # In production, replace with actual search API call
        mock_results = [
            {
                "title": f"Result {i+1} for '{query}'",
                "url": f"https://example.com/result-{i+1}",
                "snippet": f"This is result {i+1} for the query '{query}'. "
                          f"It contains relevant information about the topic.",
                "source": "Example Search"
            }
            for i in range(limit)
        ]

        # Use OutputBuilder if available
        if OUTPUT_BUILDER_AVAILABLE:
            # Convert results to table format
            columns = ["Title", "URL", "Snippet", "Source"]
            rows = [
                [result["title"], result["url"], result["snippet"], result["source"]]
                for result in mock_results
            ]

            return OutputBuilder() \
                .set_table(
                    headers=columns,
                    rows=rows,
                    title=f"Search Results for '{query}'"
                ) \
                .add_standard_metadata("query", query) \
                .add_standard_metadata("search_engine", "mock") \
                .add_standard_metadata("result_count", len(mock_results)) \
                .build()
        else:
            # Fallback to old format
            return {
                "results": mock_results,
                "total": len(mock_results),
                "query": query
            }

    except Exception as e:
        # Error handling with OutputBuilder
        if OUTPUT_BUILDER_AVAILABLE:
            return OutputBuilder() \
                .set_error(
                    error=e,
                    suggestions=[
                        "Check if the search query is valid",
                        "Try a different search query",
                        "Verify network connectivity"
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
