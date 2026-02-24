"""Test script for Content Refiner.

Tests the LLM-powered content refinement for infographic generation.
"""

import asyncio
import json
import sys
from pathlib import Path

# Add paths
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "generators"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from generators.content_refiner import ContentRefiner, get_content_refiner


# Test cases covering different content types and scenarios
TEST_CASES = [
    {
        "name": "Simple List (Chinese)",
        "content": "生成一个信息图展示编程学习路线：1. 基础语法 2. 数据结构 3. 算法 4. 框架学习 5. 项目实战",
        "language": "zh",
    },
    {
        "name": "Sequential Process (Chinese)",
        "content": "软件开发生命周期包括：需求分析阶段收集用户需求；系统设计阶段规划架构；编码实现阶段编写代码；测试阶段验证功能；部署维护阶段上线运行",
        "language": "zh",
    },
    {
        "name": "Comparison (English)",
        "content": "Compare React vs Vue: React has larger ecosystem and better job market; Vue has gentler learning curve and simpler syntax",
        "language": "en",
    },
    {
        "name": "Data Statistics (Chinese)",
        "content": "2024年编程语言使用率统计：Python 35%、JavaScript 28%、Java 18%、C++ 12%、其他 7%",
        "language": "zh",
    },
    {
        "name": "Complex Multi-line Input (Chinese)",
        "content": """展示微服务架构的优势：
- 独立部署：每个服务可以独立发布
- 技术异构：不同服务可以使用不同技术栈
- 弹性扩展：按需扩展特定服务
- 故障隔离：单个服务故障不影响整体""",
        "language": "zh",
    },
    {
        "name": "Timeline/Roadmap (English)",
        "content": "Product roadmap for 2024: Q1 launch MVP with core features; Q2 add user analytics; Q3 introduce mobile apps; Q4 enterprise features launch",
        "language": "en",
    },
]


async def test_refiner():
    """Test the content refiner with various inputs."""

    print("=" * 80)
    print("Testing Content Refiner for Infographic Generation")
    print("=" * 80)

    refiner = get_content_refiner()

    if not refiner.llm_enabled:
        print("⚠️  LLM not available - using rule-based fallback")
        print("   Set ANTHROPIC_API_KEY environment variable to enable LLM features")
        print()

    results = []

    for i, test_case in enumerate(TEST_CASES, 1):
        print(f"\n{'─' * 80}")
        print(f"Test {i}/{len(TEST_CASES)}: {test_case['name']}")
        print(f"{'─' * 80}")
        print(f"Input: {test_case['content'][:80]}...")
        print()

        try:
            refined = await refiner.refine(
                content=test_case['content'],
                language=test_case.get('language', 'auto')
            )

            print(f"✅ Refinement successful")
            print(f"\n📊 Result:")
            print(f"  Title:           {refined.get('title', 'N/A')}")
            print(f"  Description:     {refined.get('description', 'N/A')}")
            print(f"  Content Type:    {refined.get('content_type', 'N/A')}")
            print(f"  Template:        {refined.get('recommended_template', 'N/A')}")
            print(f"  Theme:           {refined.get('suggested_theme', 'N/A')}")
            print(f"  Style:           {refined.get('suggested_style', 'N/A')}")
            print(f"  Item Count:      {len(refined.get('items', []))}")

            metadata = refined.get('metadata', {})
            if metadata:
                print(f"  Confidence:       {metadata.get('confidence', 'N/A')}")
                print(f"  Reasoning:        {metadata.get('reasoning', 'N/A')}")

            print(f"\n📝 Items:")
            for j, item in enumerate(refined.get('items', [])[:5], 1):
                label = item.get('label', 'N/A')
                desc = item.get('desc', '')
                icon = item.get('icon', 'N/A')
                print(f"  {j}. {label} ({icon}){f' - {desc}' if desc else ''}")

            if len(refined.get('items', [])) > 5:
                remaining = len(refined.get('items', [])) - 5
                print(f"  ... and {remaining} more items")

            results.append({
                "test": test_case['name'],
                "success": True,
                "result": refined
            })

        except Exception as e:
            print(f"❌ Test failed: {e}")
            import traceback
            traceback.print_exc()
            results.append({
                "test": test_case['name'],
                "success": False,
                "error": str(e)
            })

    # Summary
    print(f"\n{'=' * 80}")
    print("Test Summary")
    print(f"{'=' * 80}")

    passed = sum(1 for r in results if r['success'])
    total = len(results)

    print(f"Passed: {passed}/{total}")

    if passed == total:
        print("✅ All tests passed!")
    else:
        print("⚠️  Some tests failed:")
        for r in results:
            if not r['success']:
                print(f"  - {r['test']}: {r.get('error', 'Unknown error')}")

    # Show example of refined JSON structure
    if passed > 0:
        successful_result = next(r['result'] for r in results if r['success'])
        print(f"\n{'=' * 80}")
        print("Example Refined JSON Structure")
        print(f"{'=' * 80}")
        print(json.dumps(successful_result, ensure_ascii=False, indent=2))


async def test_rule_based_fallback():
    """Test the rule-based fallback when LLM is not available."""

    print("\n" + "=" * 80)
    print("Testing Rule-Based Fallback (LLM Disabled)")
    print("=" * 80)

    # Create refiner with no LLM client
    refiner = ContentRefiner(llm_client=None)

    test_content = "生成信息图：1. 需求分析 2. 系统设计 3. 开发实现 4. 测试验证 5. 部署上线"

    print(f"Input: {test_content}\n")

    refined = await refiner.refine(test_content)

    print(f"Rule-based result:")
    print(f"  Title:        {refined.get('title')}")
    print(f"  Content Type: {refined.get('content_type')}")
    print(f"  Template:     {refined.get('recommended_template')}")
    print(f"  Item Count:   {len(refined.get('items', []))}")
    print(f"  Confidence:   {refined.get('metadata', {}).get('confidence')}")


if __name__ == "__main__":
    import os

    # Check for API key
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("⚠️  Warning: ANTHROPIC_API_KEY not set")
        print("   LLM features will use rule-based fallback\n")

    # Run tests
    asyncio.run(test_refiner())

    # Also test fallback
    asyncio.run(test_rule_based_fallback())
