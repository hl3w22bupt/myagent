"""
Demo script for infographic generator with LLM content refinement.

This script demonstrates the difference between rule-based extraction
and LLM-powered content refinement.
"""

import asyncio
import sys
from pathlib import Path

# Add paths
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "generators"))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from generators.content_refiner import get_content_refiner


async def demo_refinement():
    """Demonstrate LLM-powered content refinement."""

    print("=" * 80)
    print("Infographic Generator - LLM Content Refinement Demo")
    print("=" * 80)
    print()

    # Test content
    test_cases = [
        {
            "name": "Sequential Process",
            "content": "软件开发生命周期：需求分析 → 系统设计 → 编码实现 → 测试验证 → 部署上线"
        },
        {
            "name": "Data Statistics",
            "content": "2024年编程语言使用率：Python 35%, JavaScript 28%, Java 18%, C++ 12%, 其他 7%"
        },
        {
            "name": "Feature List",
            "content": "React 优势：组件化开发、虚拟 DOM、丰富生态系统、单向数据流、活跃社区"
        }
    ]

    refiner = get_content_refiner()

    if not refiner.llm_enabled:
        print("⚠️  LLM not available - showing rule-based fallback\n")
    else:
        print("✅ LLM enabled - showing intelligent refinement\n")

    for i, test in enumerate(test_cases, 1):
        print(f"\n{'─' * 80}")
        print(f"Example {i}: {test['name']}")
        print(f"{'─' * 80}")
        print(f"📥 Input: {test['content']}")
        print()

        refined = await refiner.refine(test['content'])

        print(f"📤 Refined Output:")
        print(f"   Title:        {refined['title']}")
        print(f"   Description:  {refined.get('description', 'N/A')}")
        print(f"   Type:         {refined['content_type']}")
        print(f"   Template:     {refined['recommended_template']}")
        print(f"   Theme:        {refined['suggested_theme']}")
        print(f"   Style:        {refined['suggested_style']}")
        print()

        print(f"   Items ({len(refined['items'])}):")
        for j, item in enumerate(refined['items'], 1):
            label = item.get('label', 'N/A')
            desc = item.get('desc', '')
            icon = item.get('icon', 'mdi/star')
            value = item.get('value')
            value_str = f" ({value})" if value is not None else ""
            desc_str = f" - {desc}" if desc else ""
            print(f"      {j}. {label}{value_str} [{icon}]{desc_str}")

        metadata = refined.get('metadata', {})
        if metadata.get('reasoning'):
            print()
            print(f"   💡 Reasoning: {metadata['reasoning']}")


if __name__ == "__main__":
    asyncio.run(demo_refinement())
