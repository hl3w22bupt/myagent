"""
Test script for structured output implementation.

This script tests the new unified structured output format.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Add src to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))
sys.path.insert(0, str(project_root))

from core.skill.executor import SkillExecutor
from core.sandbox.adapters.local import LocalSandboxAdapter


async def test_simple_code_generator():
    """Test simple-code-generator skill with new OutputBuilder format."""
    print("=" * 60)
    print("Testing simple-code-generator with OutputBuilder")
    print("=" * 60)

    # Create skill executor
    executor = SkillExecutor()

    # Test input
    input_data = {
        "task": "Generate a Python hello world function",
        "context": {}
    }

    try:
        # Execute skill
        result = await executor.execute_skill(
            skill_name="simple-code-generator",
            input_data=input_data
        )

        print("\n✅ Skill executed successfully")
        print(f"\nResult type: {type(result)}")
        print(f"Result keys: {result.keys() if isinstance(result, dict) else 'N/A'}")

        # Check for OutputBuilder format
        if isinstance(result, dict):
            if 'result_type' in result:
                print(f"\n✅ Found result_type: {result['result_type']}")
            else:
                print("\n❌ Missing result_type")

            if 'success' in result:
                print(f"✅ Found success: {result['success']}")
            else:
                print("❌ Missing success")

            if 'content' in result:
                print(f"✅ Found content: {type(result['content'])}")
                if isinstance(result['content'], dict):
                    if 'code' in result['content']:
                        print(f"✅ Found content.code (length: {len(result['content']['code'])})")
                        print(f"Code preview:\n{result['content']['code'][:200]}...")
                    if 'language' in result['content']:
                        print(f"✅ Found content.language: {result['content']['language']}")
                    if 'filename' in result['content']:
                        print(f"✅ Found content.filename: {result['content']['filename']}")
            else:
                print("❌ Missing content")

            if 'metadata' in result:
                print(f"✅ Found metadata: {result['metadata']}")
            else:
                print("❌ Missing metadata")

        # Print full result for debugging
        print("\n" + "=" * 60)
        print("Full result:")
        print("=" * 60)
        print(json.dumps(result, indent=2, ensure_ascii=False))

        # Check for structured output file
        output_dir = '/tmp/motia-sandbox/structured_outputs'
        output_files = list(Path(output_dir).glob('output_*.json')) if os.path.exists(output_dir) else []

        if output_files:
            print(f"\n✅ Found {len(output_files)} structured output file(s)")
            for output_file in output_files:
                print(f"  - {output_file.name}")
                with open(output_file, 'r') as f:
                    file_content = json.load(f)
                    print(f"    result_type: {file_content.get('result_type')}")
        else:
            print("\n⚠️  No structured output files found (expected if not executed through sandbox)")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


async def test_output_builder_directly():
    """Test OutputBuilder directly."""
    print("\n" + "=" * 60)
    print("Testing OutputBuilder directly")
    print("=" * 60)

    # Add skills/lib to path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'skills' / 'lib'))

    try:
        from output_builder import OutputBuilder

        # Test code output
        result = OutputBuilder() \
            .set_code("print('hello world')", language='python', filename='hello.py') \
            .set_title("Generated Python code") \
            .build()

        print("\n✅ OutputBuilder code output created")
        print(f"Result type: {result.get('result_type')}")
        print(f"Content keys: {result.get('content').keys() if result.get('content') else 'N/A'}")
        print(f"Code preview: {result.get('content', {}).get('code', '')[:50]}...")

        # Print full result
        print("\n" + "=" * 60)
        print("Full OutputBuilder result:")
        print("=" * 60)
        print(json.dumps(result, indent=2, ensure_ascii=False))

    except ImportError as e:
        print(f"\n⚠️  Could not import OutputBuilder: {e}")
        print("This is expected if skills/lib is not in the path")


def test_typescript_changes():
    """Verify TypeScript changes are in place."""
    print("\n" + "=" * 60)
    print("Verifying TypeScript changes")
    print("=" * 60)

    # Check types.ts
    types_file = Path(__file__).parent.parent.parent / 'src' / 'core' / 'sandbox' / 'types.ts'
    if types_file.exists():
        content = types_file.read_text()
        if 'StructuredOutput' in content:
            print("✅ types.ts: StructuredOutput interface found")
        else:
            print("❌ types.ts: StructuredOutput interface NOT found")

        if 'structuredOutput?: StructuredOutput' in content:
            print("✅ types.ts: SandboxResult.structuredOutput field found")
        else:
            print("❌ types.ts: SandboxResult.structuredOutput field NOT found")
    else:
        print(f"❌ types.ts file not found at {types_file}")

    # Check local.ts
    local_file = Path(__file__).parent.parent.parent / 'src' / 'core' / 'sandbox' / 'adapters' / 'local.ts'
    if local_file.exists():
        content = local_file.read_text()
        if '[STRUCTURED_OUTPUT]' in content:
            print("✅ local.ts: [STRUCTURED_OUTPUT] marker parsing found")
        else:
            print("❌ local.ts: [STRUCTURED_OUTPUT] marker parsing NOT found")

        if 'structuredOutput,' in content or 'structuredOutput:' in content:
            print("✅ local.ts: structuredOutput in return value found")
        else:
            print("❌ local.ts: structuredOutput in return value NOT found")

        if 'STRUCTURED_OUTPUT_DIR' in content:
            print("✅ local.ts: STRUCTURED_OUTPUT_DIR creation found")
        else:
            print("❌ local.ts: STRUCTURED_OUTPUT_DIR creation NOT found")
    else:
        print(f"❌ local.ts file not found at {local_file}")

    # Check agent.ts
    agent_file = Path(__file__).parent.parent.parent / 'src' / 'core' / 'agent' / 'agent.ts'
    if agent_file.exists():
        content = agent_file.read_text()
        if 'sandboxResult.structuredOutput' in content:
            print("✅ agent.ts: sandboxResult.structuredOutput usage found")
        else:
            print("❌ agent.ts: sandboxResult.structuredOutput usage NOT found")

        if 'structuredOutput: sandboxResult.structuredOutput' in content:
            print("✅ agent.ts: structuredOutput in metadata found")
        else:
            print("❌ agent.ts: structuredOutput in metadata NOT found")
    else:
        print(f"❌ agent.ts file not found at {agent_file}")


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("STRUCTURED OUTPUT IMPLEMENTATION TEST")
    print("=" * 60)

    # Test TypeScript changes
    test_typescript_changes()

    # Test OutputBuilder directly
    await test_output_builder_directly()

    # Test simple-code-generator
    await test_simple_code_generator()

    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print("✅ All basic tests completed")
    print("Please verify:")
    print("  1. OutputBuilder creates correct format")
    print("  2. TypeScript interfaces are updated")
    print("  3. LocalSandboxAdapter reads structured output")
    print("  4. Frontend uses structuredOutput for rendering")
    print("\nTo test end-to-end:")
    print("  1. Start the server: npm run dev")
    print("  2. Create a task with simple-code-generator skill")
    print("  3. Check the browser console for structuredOutput logs")
    print("  4. Verify code is rendered correctly with syntax highlighting")


if __name__ == '__main__':
    asyncio.run(main())
