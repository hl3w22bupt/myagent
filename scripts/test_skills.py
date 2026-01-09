#!/usr/bin/env python3
"""
Simple test script to verify all three Skills work correctly.

This bypasses the full Skill Executor to test Skills directly.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_code_analysis():
    """Test code-analysis skill (pure-script)."""
    print("\n=== Testing Code Analysis Skill (Pure Script) ===")

    import importlib.util
    spec = importlib.util.spec_from_file_location("analyzer", "skills/code-analysis/analyzer.py")
    analyzer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(analyzer)

    result = analyzer.analyze({
        'code': '''
def calculate_sum(numbers):
    result = 0
    for num in numbers:
        result += num
        print(f"Adding {num}")
    return result
''',
        'language': 'python'
    })

    print(f"✓ Success!")
    print(f"  Score: {result['score']}/100")
    print(f"  Issues found: {len(result['issues'])}")
    print(f"  Metrics: {result['metrics']}")
    return True


def test_web_search():
    """Test web-search skill (hybrid)."""
    print("\n=== Testing Web Search Skill (Hybrid) ===")

    import asyncio
    import importlib.util

    spec = importlib.util.spec_from_file_location("handler", "skills/web-search/handler.py")
    handler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(handler)

    async def run_test():
        result = await handler.execute({
            'query': 'Python async programming',
            'limit': 3
        })

        print(f"✓ Success!")
        print(f"  Results: {len(result['results'])}")
        print(f"  Query: {result['query']}")
        return True

    return asyncio.run(run_test())


def test_summarize():
    """Test summarize skill (pure-prompt)."""
    print("\n=== Testing Summarize Skill (Pure Prompt) ===")

    # Pure prompt skills don't execute code, they return prompts
    # For now, just verify the YAML loads correctly
    import yaml

    with open('skills/summarize/skill.yaml', 'r') as f:
        config = yaml.safe_load(f)

    print(f"✓ Success!")
    print(f"  Name: {config['name']}")
    print(f"  Type: {config['type']}")
    print(f"  Has prompt template: {bool(config.get('prompt_template'))}")
    return True


def main():
    """Run all tests."""
    print("Testing Skill Subsystem...")
    print("=" * 50)

    results = []

    try:
        results.append(("Code Analysis", test_code_analysis()))
    except Exception as e:
        print(f"✗ Failed: {e}")
        results.append(("Code Analysis", False))

    try:
        results.append(("Web Search", test_web_search()))
    except Exception as e:
        print(f"✗ Failed: {e}")
        results.append(("Web Search", False))

    try:
        results.append(("Summarize", test_summarize()))
    except Exception as e:
        print(f"✗ Failed: {e}")
        results.append(("Summarize", False))

    # Summary
    print("\n" + "=" * 50)
    print("Test Summary:")
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All Skill tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
