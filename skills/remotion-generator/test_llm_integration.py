#!/usr/bin/env python3
"""
Test script for LLM-based Remotion code generation.

This script tests the two-stage LLM generation pipeline:
1. Content Analysis
2. Code Generation
3. Validation
"""

import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Set environment variables for testing
os.environ.setdefault("LLM_API_KEY", "test-key")

from generators import (
    ContentAnalyzer,
    RemotionCodeGenerator,
    CodeValidator,
    LLMClient
)


async def test_content_analyzer():
    """Test Phase 1: Content Analysis."""
    print("\n" + "="*60)
    print("TEST 1: Content Analyzer")
    print("="*60)

    description = "生成一个泰勒公式的教学视频，重点讲解它的核心理念和本质"

    try:
        analyzer = ContentAnalyzer()
        analysis = await analyzer.analyze(description)

        print("\n✅ Analysis successful!")
        print(f"\nTopic: {analysis['topic']['name']}")
        print(f"Category: {analysis['topic']['category']}")
        print(f"Difficulty: {analysis['topic']['difficulty']}")
        print(f"\nNumber of scenes: {len(analysis['scenes'])}")

        for i, scene in enumerate(analysis['scenes'], 1):
            print(f"  Scene {i}: {scene['title']} ({scene['duration_percent']}%)")

        print(f"\nPrimary visual: {analysis['visualization']['primary_visual']}")
        print(f"Animation style: {analysis['visualization']['animation_style']}")

        return analysis

    except Exception as e:
        print(f"\n❌ Analysis failed: {str(e)}")
        return None


async def test_code_generator(analysis):
    """Test Phase 2: Code Generation."""
    print("\n" + "="*60)
    print("TEST 2: Code Generator")
    print("="*60)

    if not analysis:
        print("⚠️  Skipping code generation (no analysis available)")
        return None

    try:
        generator = RemotionCodeGenerator()
        code = await generator.generate(
            analysis=analysis,
            duration=10,
            fps=30,
            resolution="1920x1080"
        )

        print("\n✅ Code generation successful!")
        print(f"\nCode length: {len(code)} characters")
        print(f"\nFirst 500 characters of generated code:")
        print("-" * 60)
        print(code[:500])
        print("-" * 60)

        return code

    except Exception as e:
        print(f"\n❌ Code generation failed: {str(e)}")
        return None


async def test_code_validator(code):
    """Test Phase 3: Code Validation."""
    print("\n" + "="*60)
    print("TEST 3: Code Validator")
    print("="*60)

    if not code:
        print("⚠️  Skipping validation (no code available)")
        return

    try:
        validator = CodeValidator()
        is_valid, errors, warnings = validator.validate(code)

        if is_valid:
            print("\n✅ Validation passed!")
        else:
            print("\n❌ Validation failed!")

        if errors:
            print(f"\nErrors ({len(errors)}):")
            for i, error in enumerate(errors, 1):
                print(f"  {i}. {error}")

        if warnings:
            print(f"\nWarnings ({len(warnings)}):")
            for i, warning in enumerate(warnings, 1):
                print(f"  {i}. {warning}")

        if not errors and not warnings:
            print("\n🎉 No issues found!")

    except Exception as e:
        print(f"\n❌ Validation failed: {str(e)}")


async def test_end_to_end():
    """Test complete pipeline end-to-end."""
    print("\n" + "="*60)
    print("TEST 4: End-to-End Pipeline")
    print("="*60)

    description = "生成一个勾股定理的教学视频"

    try:
        # Import here to avoid import issues
        from generators import RemotionCodeGenerator

        generator = RemotionCodeGenerator()
        code = await generator.generate_from_description(
            description=description,
            duration=10,
            fps=30,
            resolution="1920x1080"
        )

        print(f"\n✅ End-to-end generation successful!")
        print(f"Generated code length: {len(code)} characters")

        # Validate
        validator = CodeValidator()
        is_valid, errors, warnings = validator.validate(code)

        if is_valid:
            print(f"✅ Generated code is valid!")
        else:
            print(f"⚠️  Generated code has {len(errors)} errors")

        return is_valid

    except Exception as e:
        print(f"\n❌ End-to-end test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("LLM Remotion Generator Integration Tests")
    print("="*60)

    # Check if API key is set
    if not os.getenv("LLM_API_KEY") or os.getenv("LLM_API_KEY") == "test-key":
        print("\n⚠️  WARNING: LLM_API_KEY not set!")
        print("Tests will fail without a valid API key.")
        print("\nSet it with:")
        print("  export LLM_API_KEY='your-key-here'")
        print("\nOr create a .env file with:")
        print("  LLM_API_KEY=your-key-here")

        response = input("\nContinue anyway? (y/N): ")
        if response.lower() != 'y':
            print("\nTests aborted.")
            return

    # Run tests
    analysis = await test_content_analyzer()
    code = await test_code_generator(analysis)
    await test_code_validator(code)
    await test_end_to_end()

    print("\n" + "="*60)
    print("All tests completed!")
    print("="*60)


if __name__ == "__main__":
    asyncio.run(main())
