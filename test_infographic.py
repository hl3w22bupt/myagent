"""Test script for infographic generator skill."""

import asyncio
import sys
from pathlib import Path

skill_dir = Path(__file__).parent / "infographic-generator"
sys.path.insert(0, str(skill_dir))

from handler import generate_infographic


async def test_basic_generation():
    """Test basic infographic generation."""

    test_cases = [
        {
            "name": "Sequence - 软件开发流程",
            "content": "展示软件开发流程：需求分析 → 设计 → 开发 → 测试 → 部署",
        },
        {
            "name": "List - 产品特性",
            "content": "产品的主要特性包括：1. 易于使用 2. 高性能 3. 安全可靠 4. 可扩展",
        },
        {
            "name": "Compare - React vs Vue",
            "content": "对比 React 和 Vue：React 生态丰富，学习曲线较陡；Vue 轻量级，易于上手",
        },
    ]

    for test_case in test_cases:
        print(f"\n{'=' * 60}")
        print(f"Testing: {test_case['name']}")
        print(f"{'=' * 60}")
        print(f"Content: {test_case['content']}")
        print(f"{'-' * 60}\n")

        result = await generate_infographic(
            {
                "content": test_case["content"],
                "export_format": "html",
                "width": 1920,
                "height": 1080,
            }
        )

        if result["success"]:
            print("✅ Success!")
            print(f"  HTML: {result['html_path']}")
            print(f"  SVG: {result['svg_path']}")
            print(f"  Title: {result['metadata']['title']}")
            print(f"  Template: {result['metadata']['template']}")
            print(f"  Content Type: {result['metadata']['content_type']}")
        else:
            print("❌ Failed!")
            print(f"  Error: {result.get('error')}")
            print(f"  Type: {result.get('error_type')}")

        print(f"{'-' * 60}\n")


if __name__ == "__main__":
    asyncio.run(test_basic_generation())
