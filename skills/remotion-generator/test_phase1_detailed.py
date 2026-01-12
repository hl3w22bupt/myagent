#!/usr/bin/env python3
"""
Phase 1 全面测试脚本

测试所有组件的功能和集成。
"""

import asyncio
import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class Colors:
    """终端颜色"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_header(text):
    """打印标题"""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*70}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text:^70}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*70}{Colors.ENDC}\n")


def print_success(text):
    """打印成功消息"""
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")


def print_error(text):
    """打印错误消息"""
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")


def print_warning(text):
    """打印警告消息"""
    print(f"{Colors.WARNING}⚠️  {text}{Colors.ENDC}")


def print_info(text):
    """打印信息"""
    print(f"{Colors.OKCYAN}ℹ️  {text}{Colors.ENDC}")


async def test_imports():
    """测试 1: 导入所有组件"""
    print_header("测试 1: 导入组件")

    try:
        from generators import (
            LLMClient,
            ContentAnalyzer,
            RemotionCodeGenerator,
            CodeValidator
        )
        print_success("所有组件导入成功")
        return True
    except Exception as e:
        print_error(f"导入失败: {str(e)}")
        return False


async def test_llm_client():
    """测试 2: LLM Client"""
    print_header("测试 2: LLM Client")

    try:
        from generators import get_llm_client

        # 创建客户端
        llm = get_llm_client()
        print_success("LLM Client 创建成功")

        # 获取模型信息
        info = llm.get_model_info()
        print_info(f"模型: {info['model']}")
        print_info(f"超时: {info['timeout']}秒")

        # 测试简单生成
        print_info("测试简单生成...")
        try:
            response = await llm.generate(
                prompt="Say 'Hello, World!' in JSON format: {\"message\": \"...\"}",
                max_tokens=50,
                temperature=0.1
            )
            print_success(f"LLM 响应: {response.content[:100]}")
            print_info(f"Token 使用: {response.usage}")
        except Exception as e:
            print_warning(f"LLM 调用失败（可能是 API key 问题）: {str(e)}")
            return False

        return True

    except Exception as e:
        print_error(f"LLM Client 测试失败: {str(e)}")
        return False


async def test_content_analyzer():
    """测试 3: Content Analyzer"""
    print_header("测试 3: Content Analyzer")

    try:
        from generators import ContentAnalyzer

        analyzer = ContentAnalyzer()
        print_success("ContentAnalyzer 创建成功")

        # 测试分析
        test_cases = [
            "生成一个泰勒公式的教学视频，重点讲解它的核心理念",
            "勾股定理：a² + b² = c²",
            "解释微积分基本定理"
        ]

        results = []
        for i, description in enumerate(test_cases, 1):
            print_info(f"\n测试用例 {i}: {description[:50]}...")

            try:
                analysis = await analyzer.analyze(description)
                print_success(f"分析成功")
                print_info(f"  主题: {analysis['topic']['name']}")
                print_info(f"  类别: {analysis['topic']['category']}")
                print_info(f"  场景数: {len(analysis['scenes'])}")

                # 显示场景结构
                for j, scene in enumerate(analysis['scenes'][:3], 1):
                    print_info(f"    场景 {j}: {scene['title']} ({scene['duration_percent']}%)")

                results.append(True)

            except Exception as e:
                print_error(f"分析失败: {str(e)}")
                results.append(False)

        success_rate = sum(results) / len(results) * 100
        print(f"\n成功率: {success_rate:.0f}%")

        return all(results)

    except Exception as e:
        print_error(f"Content Analyzer 测试失败: {str(e)}")
        return False


async def test_code_generator():
    """测试 4: Code Generator"""
    print_header("测试 4: Code Generator")

    try:
        from generators import RemotionCodeGenerator

        generator = RemotionCodeGenerator()
        print_success("RemotionCodeGenerator 创建成功")

        # 创建模拟分析结果
        mock_analysis = {
            "topic": {
                "name": "泰勒公式测试",
                "category": "calculus",
                "difficulty": "intermediate"
            },
            "scenes": [
                {
                    "id": "scene_1",
                    "title": "Title",
                    "duration_percent": 20,
                    "content_type": "title",
                    "description": "Introduction",
                    "visual_elements": ["text"]
                },
                {
                    "id": "scene_2",
                    "title": "Content",
                    "duration_percent": 80,
                    "content_type": "demonstration",
                    "description": "Main content",
                    "visual_elements": ["text", "formula"]
                }
            ],
            "visualization": {
                "primary_visual": "text",
                "color_scheme": {
                    "primary": "#3B82F6",
                    "secondary": "#10B981",
                    "accent": "#F59E0B"
                },
                "animation_style": "fade"
            },
            "educational": {
                "key_points": ["Point 1", "Point 2"],
                "emphasis": "Understanding Taylor Series"
            }
        }

        print_info("生成 Remotion 代码...")
        code = await generator.generate(
            analysis=mock_analysis,
            duration=10,
            fps=30,
            resolution="1920x1080"
        )

        print_success(f"代码生成成功 ({len(code)} 字符)")

        # 检查代码关键部分
        required_elements = [
            ("import", "import 语句"),
            ("Composition", "Composition 组件"),
            ("registerRoot", "registerRoot 调用"),
            ("interface", "TypeScript 接口"),
            ("useCurrentFrame", "useCurrentFrame hook"),
            ("泰勒公式测试", "主题内容")
        ]

        print_info("\n检查代码元素:")
        all_present = True
        for element, name in required_elements:
            if element in code:
                print_success(f"  ✓ {name}")
            else:
                print_error(f"  ✗ {name} 缺失")
                all_present = False

        return all_present

    except Exception as e:
        print_error(f"Code Generator 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_code_validator():
    """测试 5: Code Validator"""
    print_header("测试 5: Code Validator")

    try:
        from generators import CodeValidator

        validator = CodeValidator()
        print_success("CodeValidator 创建成功")

        # 测试用例 1: 有效代码
        valid_code = '''import { Composition, registerRoot } from 'remotion';
import React from 'react';

interface Props {
  title: string;
}

const TestVideo: React.FC<Props> = ({ title }) => {
  return <div>{title}</div>;
};

export const Root: React.FC = () => {
  return (
    <Composition
      id="TestVideo"
      component={TestVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(Root);
'''

        print_info("测试有效代码...")
        is_valid, errors, warnings = validator.validate(valid_code)

        if is_valid:
            print_success("有效代码验证通过 ✓")
        else:
            print_error(f"有效代码验证失败: {errors}")
            return False

        if warnings:
            print_info(f"警告: {warnings}")

        # 测试用例 2: 无效代码
        invalid_code = "export const Broken = () => { return <div>; }"

        print_info("\n测试无效代码...")
        is_valid, errors, warnings = validator.validate(invalid_code)

        if not is_valid:
            print_success("无效代码正确识别 ✗")
            print_info(f"检测到 {len(errors)} 个错误:")
            for error in errors[:3]:  # 只显示前3个
                print_info(f"  - {error}")
        else:
            print_error("无效代码未被检测")
            return False

        # 获取统计信息
        stats = validator.get_validation_summary()
        print_info(f"\n验证统计: {stats}")

        return True

    except Exception as e:
        print_error(f"Code Validator 测试失败: {str(e)}")
        return False


async def test_end_to_end():
    """测试 6: 端到端集成"""
    print_header("测试 6: 端到端集成")

    try:
        from generators import ContentAnalyzer, RemotionCodeGenerator, CodeValidator

        description = "生成一个勾股定理的教学视频，展示直角三角形"

        print_info(f"输入: {description}")

        # Phase 1: 分析
        print_info("\nPhase 1: 内容分析...")
        analyzer = ContentAnalyzer()
        analysis = await analyzer.analyze(description)
        print_success(f"分析完成: {analysis['topic']['name']}")

        # Phase 2: 生成代码
        print_info("\nPhase 2: 代码生成...")
        generator = RemotionCodeGenerator()
        code = await generator.generate(
            analysis=analysis,
            duration=10,
            fps=30,
            resolution="1920x1080"
        )
        print_success(f"代码生成完成 ({len(code)} 字符)")

        # Phase 3: 验证
        print_info("\nPhase 3: 代码验证...")
        validator = CodeValidator()
        is_valid, errors, warnings = validator.validate(code)

        if is_valid:
            print_success("验证通过 ✓")
        else:
            print_warning(f"验证发现问题: {len(errors)} 个错误")
            for error in errors[:3]:
                print_info(f"  - {error}")

        if warnings:
            print_info(f"警告: {len(warnings)} 个")

        # 检查关键特性
        print_info("\n关键特性检查:")
        checks = [
            ("勾股定理" in code or "Pythagorean" in code, "包含主题内容"),
            ("import" in code, "包含导入语句"),
            ("Composition" in code, "包含 Composition"),
            ("registerRoot" in code, "包含 registerRoot")
        ]

        all_pass = True
        for check, name in checks:
            if check:
                print_success(f"  ✓ {name}")
            else:
                print_error(f"  ✗ {name}")
                all_pass = False

        return is_valid and all_pass

    except Exception as e:
        print_error(f"端到端测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def test_caching():
    """测试 7: 缓存机制"""
    print_header("测试 7: 缓存机制")

    try:
        from generators import ContentAnalyzer

        analyzer = ContentAnalyzer()
        print_success("ContentAnalyzer 创建成功")

        description = "测试缓存机制的描述"

        # 第一次调用
        print_info("第一次调用（无缓存）...")
        import time
        start = time.time()
        analysis1 = await analyzer.analyze(description)
        time1 = time.time() - start
        print_success(f"完成 ({time1:.2f}秒)")

        # 第二次调用（应该从缓存）
        print_info("\n第二次调用（有缓存）...")
        start = time.time()
        analysis2 = await analyzer.analyze(description)
        time2 = time.time() - start
        print_success(f"完成 ({time2:.2f}秒)")

        # 检查缓存统计
        stats = analyzer.get_stats()
        print_info(f"\n缓存统计:")
        print_info(f"  总生成次数: {stats['total_generations']}")
        print_info(f"  缓存命中: {stats['cache_hits']}")
        print_info(f"  命中率: {stats['cache_hit_rate']}")

        # 检查加速效果
        if time2 < time1:
            speedup = time1 / time2
            print_success(f"缓存加速: {speedup:.1f}x")
        else:
            print_warning("缓存未生效（可能是相同内容）")

        return True

    except Exception as e:
        print_error(f"缓存测试失败: {str(e)}")
        return False


async def test_statistics():
    """测试 8: 统计信息"""
    print_header("测试 8: 统计信息追踪")

    try:
        from generators import ContentAnalyzer, RemotionCodeGenerator, CodeValidator

        analyzer = ContentAnalyzer()
        generator = RemotionCodeGenerator()
        validator = CodeValidator()

        print_info("获取组件统计信息...")

        # Analyzer stats
        analyzer_stats = analyzer.get_stats()
        print_info(f"\nContentAnalyzer:")
        print_info(f"  总生成: {analyzer_stats['total_generations']}")
        print_info(f"  缓存命中: {analyzer_stats['cache_hits']}")
        print_info(f"  失败: {analyzer_stats['failures']}")
        print_info(f"  缓存大小: {analyzer_stats['cache_size']}")

        # Generator stats
        generator_stats = generator.get_stats()
        print_info(f"\nRemotionCodeGenerator:")
        print_info(f"  总生成: {generator_stats['total_generations']}")
        print_info(f"  缓存命中: {generator_stats['cache_hits']}")
        print_info(f"  失败: {generator_stats['failures']}")

        # Validator stats
        validator_stats = validator.get_validation_summary()
        print_info(f"\nCodeValidator:")
        print_info(f"  总验证: {validator_stats['total_validations']}")
        print_info(f"  通过: {validator_stats['passed']}")
        print_info(f"  失败: {validator_stats['failed']}")
        print_info(f"  通过率: {validator_stats['pass_rate']}")

        print_success("统计信息获取成功")
        return True

    except Exception as e:
        print_error(f"统计信息测试失败: {str(e)}")
        return False


async def main():
    """运行所有测试"""
    print_header("Phase 1 全面测试")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 运行所有测试
    tests = [
        ("导入组件", test_imports),
        ("LLM Client", test_llm_client),
        ("Content Analyzer", test_content_analyzer),
        ("Code Generator", test_code_generator),
        ("Code Validator", test_code_validator),
        ("端到端集成", test_end_to_end),
        ("缓存机制", test_caching),
        ("统计信息", test_statistics)
    ]

    results = {}
    for test_name, test_func in tests:
        try:
            results[test_name] = await test_func()
        except Exception as e:
            print_error(f"{test_name} 测试崩溃: {str(e)}")
            results[test_name] = False

    # 打印总结
    print_header("测试总结")

    total = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed
    pass_rate = (passed / total * 100) if total > 0 else 0

    print(f"总测试数: {total}")
    print_success(f"通过: {passed}")
    print_error(f"失败: {failed}")
    print(f"通过率: {pass_rate:.0f}%")

    print("\n详细结果:")
    for test_name, result in results.items():
        status = f"{Colors.OKGREEN}✓{Colors.ENDC}" if result else f"{Colors.FAIL}✗{Colors.ENDC}"
        print(f"{status} {test_name}")

    print(f"\n结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if pass_rate == 100:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}🎉 所有测试通过！Phase 1 实施成功！{Colors.ENDC}")
    elif pass_rate >= 75:
        print(f"\n{Colors.WARNING}{Colors.BOLD}⚠️  大部分测试通过，需要修复部分问题{Colors.ENDC}")
    else:
        print(f"\n{Colors.FAIL}{Colors.BOLD}❌ 测试失败率较高，需要修复{Colors.ENDC}")

    return pass_rate >= 75


if __name__ == "__main__":
    asyncio.run(main())
