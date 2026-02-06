#!/usr/bin/env python3
"""
测试 artifact_type 推断功能
"""

import sys
import os
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))

from core.skill.types import SkillDefinition
from pydantic import BaseModel


class MockOutputSchema(BaseModel):
    class Properties(BaseModel):
        class ResultType(BaseModel):
            enum: list[str]

        result_type: ResultType

    properties: Properties


def test_native_skill_artifact_type():
    """测试 Native Skills 的 artifact_type 推断"""
    print("=== 测试 1: Native Skills artifact_type 推断 ===\n")

    test_cases = [
        {
            'name': 'remotion-generator',
            'description': 'Generate videos using Remotion',
            'tags': ['remotion', 'video', 'animation'],
            'artifact_type': None,  # 没有手动声明
            'output_schema': {
                'properties': {
                    'result_type': {
                        'enum': ['video', 'error']
                    }
                }
            },
            'expected': 'video'
        },
        {
            'name': 'infographic-generator',
            'description': 'Generate infographics',
            'tags': ['infographic', 'image', 'data'],
            'artifact_type': None,
            'output_schema': {
                'properties': {
                    'result_type': {
                        'enum': ['infographic', 'error']
                    }
                }
            },
            'expected': 'image'
        },
        {
            'name': 'web-search',
            'description': 'Search web and return table',
            'tags': ['search', 'web', 'data'],
            'artifact_type': None,
            'output_schema': {
                'properties': {
                    'result_type': {
                        'enum': ['table', 'mixed', 'error']
                    }
                }
            },
            'expected': 'json'
        },
        {
            'name': 'custom-skill',
            'description': 'Custom skill with manual declaration',
            'tags': ['random', 'tags'],
            'artifact_type': 'code',  # 手动声明
            'output_schema': {
                'properties': {
                    'result_type': {
                        'enum': ['text', 'error']
                    }
                }
            },
            'expected': 'code'  # 应该使用手动声明的值
        },
        {
            'name': 'text-only-skill',
            'description': 'A text only skill',
            'tags': ['text', 'simple'],
            'artifact_type': None,
            'output_schema': {
                'type': 'object',
                'properties': {}  # 空的 output_schema
            },
            'expected': 'text'  # 默认值
        },
    ]

    passed = 0
    failed = 0

    for i, case in enumerate(test_cases, 1):
        print(f"测试 {i}: {case['name']}")
        print(f"  描述: {case['description']}")
        print(f"  Tags: {case['tags']}")
        print(f"  手动声明 artifact_type: {case['artifact_type']}")

        # 创建 InputSchema
        input_schema = {
            'type': 'object',
            'properties': {},
            'required': []
        }

        # 创建 OutputSchema (如果不是 None)
        output_schema = case['output_schema']

        # 创建 SkillDefinition 实例
        skill = SkillDefinition(
            name=case['name'],
            description=case['description'],
            version='1.0.0',
            tags=case['tags'],
            type='hybrid',
            artifact_type=case['artifact_type'],
            input_schema=input_schema,
            output_schema=output_schema
        )

        # 调用 get_artifact_type()
        result = skill.get_artifact_type()
        expected = case['expected']

        print(f"  推断结果: {result}")
        print(f"  预期结果: {expected}")

        if result == expected:
            print(f"  ✅ 通过\n")
            passed += 1
        else:
            print(f"  ❌ 失败\n")
            failed += 1

    print(f"\n=== 测试结果 ===")
    print(f"通过: {passed}/{len(test_cases)}")
    print(f"失败: {failed}/{len(test_cases)}")

    return failed == 0


def test_claude_skill_artifact_type():
    """测试 Claude Skills 的 artifact_type 推断"""
    print("\n=== 测试 2: Claude Skills artifact_type 推断 ===\n")

    from core.skill.adapters.claude_skill_analyzer import ClaudeSkillAnalyzer

    analyzer = ClaudeSkillAnalyzer()

    test_cases = [
        {
            'name': 'frontend-design',
            'frontmatter': {
                'name': 'frontend-design',
                'description': 'Create production-grade frontend interfaces',
                'tags': ['frontend', 'design', 'ui']
            },
            'expected': 'code'  # 'frontend' tag → 'code'
        },
        {
            'name': 'video-creator',
            'frontmatter': {
                'name': 'video-creator',
                'description': 'Create engaging videos',
                'tags': ['video', 'remotion', 'animation']
            },
            'expected': 'video'
        },
        {
            'name': 'data-visualizer',
            'frontmatter': {
                'name': 'data-visualizer',
                'description': 'Generate beautiful infographics from data',
                'tags': ['data', 'visualization', 'infographic']
            },
            'expected': 'image'
        },
        {
            'name': 'manual-declaration',
            'frontmatter': {
                'name': 'manual-declaration',
                'description': 'Some description',
                'tags': ['random'],
                'artifact_type': 'markdown'  # 手动声明
            },
            'expected': 'markdown'
        },
        {
            'name': 'default-skill',
            'frontmatter': {
                'name': 'default-skill',
                'description': 'A simple skill',
                'tags': ['simple', 'basic']
            },
            'expected': 'text'  # 默认值
        },
    ]

    passed = 0
    failed = 0

    for i, case in enumerate(test_cases, 1):
        print(f"测试 {i}: {case['name']}")
        frontmatter = case['frontmatter']
        expected = case['expected']

        # 调用 _infer_artifact_type()
        result = analyzer._infer_artifact_type(
            tags=frontmatter.get('tags', []),
            description=frontmatter.get('description', ''),
            frontmatter=frontmatter
        )

        print(f"  推断结果: {result}")
        print(f"  预期结果: {expected}")

        if result == expected:
            print(f"  ✅ 通过\n")
            passed += 1
        else:
            print(f"  ❌ 失败\n")
            failed += 1

    print(f"\n=== 测试结果 ===")
    print(f"通过: {passed}/{len(test_cases)}")
    print(f"失败: {failed}/{len(test_cases)}")

    return failed == 0


if __name__ == '__main__':
    print("🧪 开始测试 artifact_type 推断功能\n")

    test1_passed = test_native_skill_artifact_type()
    test2_passed = test_claude_skill_artifact_type()

    print("\n" + "="*50)
    print("📊 总体测试结果")
    print("="*50)
    print(f"Native Skills 测试: {'✅ 通过' if test1_passed else '❌ 失败'}")
    print(f"Claude Skills 测试: {'✅ 通过' if test2_passed else '❌ 失败'}")

    if test1_passed and test2_passed:
        print("\n🎉 所有测试通过！")
        sys.exit(0)
    else:
        print("\n⚠️  部分测试失败")
        sys.exit(1)
