"""
Test script for LLM Client tracing functionality.

This script tests the tracing feature added to the remotion-generator LLM client.
"""

import asyncio
import os
from generators.llm_client import LLMClient


async def test_tracing():
    """Test that LLM traces are sent correctly."""

    # Set required environment variables for tracing
    os.environ['MOTIA_TRACE_API_URL'] = 'http://localhost:3000/api/traces/submit'
    os.environ['MOTIA_TASK_ID'] = 'test-task-123'
    os.environ['MOTIA_SESSION_ID'] = 'test-session-456'

    # Create LLM client with tracing enabled
    client = LLMClient(
        skill_name='remotion-generator-test',
        task_id='test-task-123'
    )

    # Test parameters
    test_prompt = "What is 2 + 2? Answer with just the number."

    print("Testing LLM client with tracing...")
    print(f"Prompt: {test_prompt}")
    print(f"Trace API URL: {client.trace_api_url}")
    print(f"Task ID: {client.task_id}")
    print(f"Skill Name: {client.skill_name}")
    print("-" * 50)

    try:
        # Generate response (this should trigger a trace)
        response = await client.generate(
            prompt=test_prompt,
            max_tokens=100,
            temperature=0.3
        )

        print("✓ LLM call successful")
        print(f"Response: {response.content[:100]}...")
        print(f"Model: {response.model}")
        print(f"Tokens: {response.usage}")
        print("-" * 50)

        # Wait a bit for async trace to be sent
        await asyncio.sleep(1)

        print("✓ Test completed!")
        print("\nTo verify the trace was sent:")
        print("1. Check the console output for '[LLMClient] ✓ LLM trace sent' message")
        print("2. Query the traces API: GET /api/tasks/test-task-123/traces")
        print("3. Look for traces with:")
        print("   - level: 'skill-internal'")
        print("   - stage: 'llm_call'")
        print("   - skillName: 'remotion-generator-test'")

    except Exception as e:
        print(f"✗ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_tracing())
