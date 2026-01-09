"""
Web Search Skill - Mock Implementation

This is a mock implementation for demonstration purposes.
In production, this would integrate with a real search API.
"""

import asyncio
from typing import Dict, Any


async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute web search using a search API.

    Args:
        input_data: Dictionary containing:
            - query: Search query string
            - limit: Maximum number of results (default: 5)

    Returns:
        Dictionary with search results
    """
    query = input_data.get('query')
    limit = input_data.get('limit', 5)

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

    return {
        "results": mock_results,
        "total": len(mock_results),
        "query": query
    }


# For testing purposes
if __name__ == "__main__":
    import asyncio

    async def test():
        result = await execute({"query": "Python programming", "limit": 3})
        print(json.dumps(result, indent=2))

    asyncio.run(test())
