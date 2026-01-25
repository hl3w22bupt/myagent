"""
Example: Web Search Handler with Progress Reporting

This example shows how to use the SkillExecutionContext to report progress
during skill execution.
"""

import asyncio
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional, TYPE_CHECKING

# Add parent lib for OutputBuilder
lib_dir = Path(__file__).parent.parent / "lib"
if lib_dir.exists():
    sys.path.insert(0, str(lib_dir))

# Import SkillExecutionContext for type hints
if TYPE_CHECKING:
    from src.core.skill.context import SkillExecutionContext

try:
    from output_builder import OutputBuilder
    OUTPUT_BUILDER_AVAILABLE = True
except ImportError:
    OUTPUT_BUILDER_AVAILABLE = False


async def execute(
    input_data: Dict[str, Any],
    context: Optional['SkillExecutionContext'] = None
) -> Dict[str, Any]:
    """
    Execute web search with progress reporting.

    Args:
        input_data: Search parameters (query, limit, etc.)
        context: Optional execution context for progress reporting

    Returns:
        Search results
    """
    start_time = time.time()

    # Report initial step
    if context:
        await context.report_step("Starting web search...")

    # Try multiple field names for query
    query = input_data.get('query') or input_data.get('task') or input_data.get('description')
    limit = input_data.get('limit', 5)

    # Input validation
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

    try:
        # Report query validation
        if context:
            await context.report_step(f"Searching for: {query}")

        # Simulate API call delay
        await asyncio.sleep(0.5)

        # Report progress during result processing
        if context:
            await context.report_step(f"Processing top {limit} results...")

        # Mock search results
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

        # Report completion
        if context:
            await context.report_step(f"Found {len(mock_results)} results")
            await context.report_status("completed", result_count=len(mock_results))

        # Use OutputBuilder if available
        if OUTPUT_BUILDER_AVAILABLE:
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
            return {
                "results": mock_results,
                "total": len(mock_results),
                "query": query
            }

    except Exception as e:
        # Report error
        if context:
            await context.report_status("error", error=str(e))

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

    # Mock context for testing
    class MockContext:
        async def report_step(self, message, **data):
            print(f"[STEP] {message}")

        async def report_status(self, status, **data):
            print(f"[STATUS] {status}: {data}")

    async def test():
        result = await execute(
            {"query": "Python programming", "limit": 3},
            context=MockContext()
        )
        print("Result:", result)

    asyncio.run(test())
