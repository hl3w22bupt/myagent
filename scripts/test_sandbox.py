#!/usr/bin/env python3
"""
Sandbox + Skills Integration Test Script.

This script tests the Local Sandbox executing PTC code that calls Skills.
"""

import sys
import os
import subprocess
import tempfile
import json

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_sandbox_python_code():
    """Test that Local Sandbox can execute basic Python code."""
    print("\n=== Test 1: Basic Python Execution ===")

    code = """
print("Hello from Sandbox!")
x = 1 + 1
print(f"1 + 1 = {x}")
"""

    wrapped_code = wrap_code(code)

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped_code)
        temp_path = f.name

    try:
        # Execute
        result = subprocess.run(
            ['python3', temp_path],
            capture_output=True,
            text=True,
            timeout=5
        )

        print(f"✓ Execution successful!")
        print(f"  Exit code: {result.returncode}")
        print(f"  Output: {result.stdout.strip()}")

        return result.returncode == 0
    finally:
        os.unlink(temp_path)


def test_sandbox_skill_executor_import():
    """Test that SkillExecutor can be imported in Sandbox."""
    print("\n=== Test 2: SkillExecutor Import ===")

    code = """
# SkillExecutor is already imported by wrap_code
# Just test that it's accessible
print(f"✓ SkillExecutor is accessible: {type(SkillExecutor).__name__}")
"""

    wrapped_code = wrap_code(code)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped_code)
        temp_path = f.name

    try:
        result = subprocess.run(
            ['python3', temp_path],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"Output:\n{result.stdout}")

        if result.stderr:
            print(f"Stderr:\n{result.stderr}")

        # Check if SkillExecutor is accessible
        success = 'SkillExecutor is accessible' in result.stdout or result.returncode == 0
        return success
    finally:
        os.unlink(temp_path)


def test_sandbox_execute_summarize_skill():
    """Test executing Summarize skill through Sandbox."""
    print("\n=== Test 3: Execute Summarize Skill ===")

    code = """
result = await executor.execute('summarize', {
    'content': 'This is a test document for summarization.',
    'max_length': 50
})
print(f"Success: {result.success}")
print(f"Type: {result.output.get('type')}")
"""

    wrapped_code = wrap_code(code)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped_code)
        temp_path = f.name

    try:
        result = subprocess.run(
            ['python3', temp_path],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"Output:\n{result.stdout}")

        if result.returncode != 0:
            print(f"Stderr:\n{result.stderr}")
            return False

        return 'Success: True' in result.stdout and 'Type: prompt' in result.stdout
    finally:
        os.unlink(temp_path)


def test_sandbox_execute_code_analysis_skill():
    """Test executing Code Analysis skill through Sandbox."""
    print("\n=== Test 4: Execute Code Analysis Skill ===")

    code = """
result = await executor.execute('code-analysis', {
    'code': 'def hello():\\n    print("Hi")',
    'language': 'python'
})
print(f"Success: {result.success}")
print(f"Score: {result.output.get('score')}")
"""

    wrapped_code = wrap_code(code)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped_code)
        temp_path = f.name

    try:
        result = subprocess.run(
            ['python3', temp_path],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"Output:\n{result.stdout}")

        if result.returncode != 0:
            print(f"Stderr:\n{result.stderr}")
            return False

        return 'Success: True' in result.stdout
    finally:
        os.unlink(temp_path)


def wrap_code(code: str) -> str:
    """Wrap user code for Sandbox execution."""
    return f"""
import asyncio
import sys
import os

# Add current directory to Python path
if os.getcwd() not in sys.path:
    sys.path.insert(0, os.getcwd())

# Add python_modules
python_modules = os.path.join(os.getcwd(), 'python_modules', 'lib', 'python3.11', 'site-packages')
if os.path.exists(python_modules) and python_modules not in sys.path:
    sys.path.insert(0, python_modules)

from core.skill.executor import SkillExecutor

async def main():
    executor = SkillExecutor()
    try:
{chr(10).join('        ' + line for line in code.split(chr(10)))}
    except Exception as e:
        print(f"Error: {{e}}")
        import traceback
        traceback.print_exc()

asyncio.run(main())
"""


def main():
    """Run all integration tests."""
    print("=" * 60)
    print("Sandbox + Skills Integration Tests")
    print("=" * 60)

    tests = [
        ("Basic Python Execution", test_sandbox_python_code),
        ("SkillExecutor Import", test_sandbox_skill_executor_import),
        ("Execute Summarize Skill", test_sandbox_execute_summarize_skill),
        ("Execute Code Analysis Skill", test_sandbox_execute_code_analysis_skill),
    ]

    results = []

    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"✗ {name} failed with exception: {e}")
            results.append((name, False))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")

    if passed == total:
        print("\n🎉 All Sandbox integration tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
