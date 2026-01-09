#!/usr/bin/env python3
"""
Debug script to test Sandbox execution.
"""

import subprocess
import sys
import os
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def wrap_code(code: str) -> str:
    """Wrap user code for Sandbox execution."""
    return f"""
import asyncio
import sys
import os

# Add current directory to Python path
if os.getcwd() not in sys.path:
    sys.path.insert(0, os.getcwd())

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
    print("=== Sandbox Debug Test ===\n")

    print("Environment:")
    print(f"  Python: {sys.executable}")
    print(f"  CWD: {os.getcwd()}")
    print(f"  PYTHONPATH: {os.environ.get('PYTHONPATH', 'Not set')}")
    print("")

    # Test 1: Simple code
    print("Test 1: Simple Python code")
    code1 = "print('Hello from Python')"
    wrapped1 = wrap_code(code1)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped1)
        temp1 = f.name

    try:
        result = subprocess.run(
            [sys.executable, temp1],
            capture_output=True,
            text=True,
            timeout=5,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"  Success: {result.returncode == 0}")
        print(f"  Output: {result.stdout.strip()}")
        if result.stderr:
            print(f"  Stderr: {result.stderr.strip()}")
    finally:
        os.unlink(temp1)

    print("")

    # Test 2: Import SkillExecutor
    print("Test 2: SkillExecutor already imported")
    code2 = "print('SUCCESS: SkillExecutor is accessible')"
    wrapped2 = wrap_code(code2)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped2)
        temp2 = f.name

    try:
        result = subprocess.run(
            [sys.executable, temp2],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"  Success: {result.returncode == 0}")
        print(f"  Output: {result.stdout.strip()}")
        if result.stderr:
            print(f"  Stderr: {result.stderr.strip()}")
    finally:
        os.unlink(temp2)

    print("")

    # Test 3: Skill Registry
    print("Test 3: Skill Registry")
    code3 = """
from core.skill.registry import SkillRegistry
registry = SkillRegistry()
skills = await registry.scan()
print(f"SUCCESS: Found {len(skills)} skills")
for name in skills.keys():
    print(f"  - {name}")
"""
    wrapped3 = wrap_code(code3)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(wrapped3)
        temp3 = f.name

    try:
        result = subprocess.run(
            [sys.executable, temp3],
            capture_output=True,
            text=True,
            timeout=10,
            env={**os.environ, 'PYTHONPATH': os.getcwd()}
        )

        print(f"  Success: {result.returncode == 0}")
        print(f"  Output: {result.stdout.strip()}")
        if result.stderr:
            print(f"  Stderr: {result.stderr.strip()}")
    finally:
        os.unlink(temp3)

    print("")

if __name__ == "__main__":
    main()
