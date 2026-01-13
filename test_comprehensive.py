"""Comprehensive test suite for infographic-generator skill."""

import asyncio
import sys
from pathlib import Path
from datetime import datetime

# Add skill directory to path
skill_dir = Path(__file__).parent / "skills" / "infographic-generator"
sys.path.insert(0, str(skill_dir))

from handler import generate_infographic


# Test cases for all 7 content types
TEST_CASES = [
    # 1. Sequence (流程/步骤)
    {
        "name": "Sequence - 软件开发流程",
        "content": "软件开发流程：需求分析 → 系统设计 → 代码开发 → 测试验证 → 部署上线 → 运维监控",
        "content_type": "sequence",
    },
    # 2. List (列表)
    {
        "name": "List - 产品特性清单",
        "content": "产品的主要特性包括：\n1. 易于使用的界面设计\n2. 高性能的处理引擎\n3. 安全可靠的数据保护\n4. 灵活可扩展的架构",
        "content_type": "list",
    },
    # 3. Compare (对比)
    {
        "name": "Compare - React vs Vue",
        "content": "对比 React 和 Vue 两个前端框架：React 拥有更丰富的生态系统和庞大的社区支持，学习曲线相对较陡；Vue 则更加轻量级，上手容易，文档友好",
        "content_type": "compare",
    },
    # 4. Hierarchy (层级结构)
    {
        "name": "Hierarchy - 公司组织架构",
        "content": "公司组织架构：CEO 下面设有 CTO、CFO、COO 三个高管职位。CTO 负责技术部门，包括研发团队和测试团队；CFO 负责财务部门；COO 负责运营部门",
        "content_type": "hierarchy",
    },
    # 5. Chart (数据图表)
    {
        "name": "Chart - 季度销售数据",
        "content": "2024年各季度销售额数据：Q1 达到 500 万元，Q2 增长到 650 万元，Q3 突破 800 万元，Q4 达到全年最高的 1000 万元",
        "content_type": "chart",
    },
    # 6. Quadrant (矩阵/象限)
    {
        "name": "Quadrant - 任务优先级矩阵",
        "content": "任务分类矩阵：重要且紧急的任务立即处理，重要不紧急的任务规划处理，不重要但紧急的任务委托处理，不重要不紧急的任务延后处理",
        "content_type": "quadrant",
    },
    # 7. Relation (关系)
    {
        "name": "Relation - 系统组件关系",
        "content": "前端通过 REST API 与后端通信，后端连接 MySQL 数据库存储数据，同时使用 Redis 作为缓存层提升性能，所有服务通过消息队列实现解耦",
        "content_type": "relation",
    },
]

# Edge cases
EDGE_CASES = [
    {
        "name": "Empty Content",
        "content": "",
        "should_fail": True,
    },
    {
        "name": "Very Long Content",
        "content": " ".join(["这是一个很长的测试内容"] * 100),
        "should_fail": False,
    },
    {
        "name": "Special Characters",
        "content": "测试特殊字符：@#$%^&*()_+-=[]{}|;':\",./<>?`~中文🎉Emoji",
        "should_fail": False,
    },
    {
        "name": "Mixed Language",
        "content": "Mixed English and Chinese: 这是一个混合语言测试。This is a mixed language test. 包含 numbers 123 和 symbols @#$.",
        "should_fail": False,
    },
]


async def run_test(test_case, index):
    """Run a single test case."""
    name = test_case["name"]
    content = test_case["content"]
    should_fail = test_case.get("should_fail", False)

    print(f"\n{'='*80}")
    print(f"Test {index + 1}: {name}")
    print(f"{'='*80}")
    print(f"Content: {content[:100]}{'...' if len(content) > 100 else ''}")
    print(f"Expected to fail: {should_fail}")
    print(f"{'-'*80}\n")

    start_time = datetime.now()

    try:
        result = await generate_infographic(
            {
                "content": content,
                "export_format": "both",
                "width": 1920,
                "height": 1080,
            }
        )

        elapsed = (datetime.now() - start_time).total_seconds()

        if result["success"]:
            if should_fail:
                print(f"❌ UNEXPECTED SUCCESS (should have failed)")
                return False
            else:
                print(f"✅ SUCCESS (in {elapsed:.2f}s)")
                print(f"   HTML: {result.get('html_path', 'N/A')}")
                print(f"   PNG: {result.get('png_path', 'N/A')}")
                print(f"   SVG: {result.get('svg_path', 'N/A')}")

                # Verify files exist
                html_path = result.get('html_path')
                png_path = result.get('png_path')

                if html_path and Path(html_path).exists():
                    html_size = Path(html_path).stat().st_size
                    print(f"   ✅ HTML file verified ({html_size:,} bytes)")
                else:
                    print(f"   ⚠️  HTML file not found")
                    return False

                if png_path and Path(png_path).exists():
                    png_size = Path(png_path).stat().st_size
                    print(f"   ✅ PNG file verified ({png_size:,} bytes)")

                    # Check if PNG size is reasonable
                    if png_size < 10000:
                        print(f"   ⚠️  PNG file seems small, might be just background")
                else:
                    print(f"   ⚠️  PNG file not found (export may have failed)")

                metadata = result.get('metadata', {})
                print(f"\n   📊 Metadata:")
                print(f"      Title: {metadata.get('title')}")
                print(f"      Template: {metadata.get('template')}")
                print(f"      Content Type: {metadata.get('content_type')}")
                print(f"      Theme: {len(metadata.get('theme', []))} colors")
                print(f"      Dimensions: {metadata.get('dimensions')}")

                return True
        else:
            error = result.get('error', 'Unknown error')
            error_type = result.get('error_type', 'Unknown')

            if should_fail:
                print(f"✅ EXPECTED FAILURE")
                print(f"   Error: {error}")
                print(f"   Type: {error_type}")
                return True
            else:
                print(f"❌ UNEXPECTED FAILURE")
                print(f"   Error: {error}")
                print(f"   Type: {error_type}")
                return False

    except Exception as e:
        print(f"❌ EXCEPTION")
        print(f"   Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_all_tests():
    """Run all test cases."""
    print("="*80)
    print("COMPREHENSIVE INFOGRAPHIC GENERATOR TEST SUITE")
    print("="*80)
    print(f"\nTotal test cases: {len(TEST_CASES) + len(EDGE_CASES)}")
    print(f"  - Content type tests: {len(TEST_CASES)}")
    print(f"  - Edge case tests: {len(EDGE_CASES)}")

    # Run content type tests
    content_results = []
    for i, test_case in enumerate(TEST_CASES):
        result = await run_test(test_case, i)
        content_results.append(result)

    # Run edge case tests
    edge_results = []
    for i, test_case in enumerate(EDGE_CASES):
        result = await run_test(test_case, len(TEST_CASES) + i)
        edge_results.append(result)

    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)

    content_pass = sum(content_results)
    content_total = len(content_results)
    edge_pass = sum(edge_results)
    edge_total = len(edge_results)
    total_pass = content_pass + edge_pass
    total_tests = content_total + edge_total

    print(f"\nContent Type Tests: {content_pass}/{content_total} passed")
    print(f"Edge Case Tests: {edge_pass}/{edge_total} passed")
    print(f"\n📊 Total: {total_pass}/{total_tests} passed ({100*total_pass/total_tests:.1f}%)")

    # Show failures
    if total_pass < total_tests:
        print(f"\n❌ Failed tests:")
        for i, test_case in enumerate(TEST_CASES + EDGE_CASES):
            result = (content_results + edge_results)[i]
            if not result:
                print(f"   - {test_case['name']}")

    print("\n" + "="*80)

    return total_pass == total_tests


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
