#!/usr/bin/env python3
"""
Phase 2 Prompt 评估脚本

运行扩展测试用例，评估当前 prompt 的性能，
为优化提供数据支持。
"""

import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from generators import ContentAnalyzer, RemotionCodeGenerator, CodeValidator
from test_cases import ALL_TEST_CASES, TEST_CATEGORIES, DIFFICULTY_LEVELS


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


def calculate_topic_match(detected_topic: str, expected_topic: str) -> float:
    """
    计算主题匹配度。

    Args:
        detected_topic: 检测到的主题
        expected_topic: 期望的主题

    Returns:
        匹配度分数 (0-1)
    """
    detected_lower = detected_topic.lower()
    expected_lower = expected_topic.lower()

    # 完全匹配
    if detected_lower == expected_lower:
        return 1.0

    # 包含匹配
    if expected_lower in detected_lower or detected_lower in expected_lower:
        return 0.8

    # 关键词匹配
    expected_words = set(expected_lower.split())
    detected_words = set(detected_lower.split())

    overlap = expected_words & detected_words
    if overlap:
        return len(overlap) / max(len(expected_words), len(detected_words))

    return 0.0


async def evaluate_content_analyzer():
    """评估 Content Analyzer 的性能"""
    print_header("Phase 2 评估: Content Analyzer")

    analyzer = ContentAnalyzer()
    results = []

    print_info(f"总测试用例: {len(ALL_TEST_CASES)}")
    print_info("开始评估...\n")

    for i, test_case in enumerate(ALL_TEST_CASES, 1):
        print(f"[{i}/{len(ALL_TEST_CASES)}] 测试: {test_case['description'][:50]}...")

        try:
            # 运行分析
            analysis = await analyzer.analyze(test_case['description'])

            # 评估结果
            detected_topic = analysis['topic']['name']
            expected_topic = test_case['expected_topic']
            category_match = analysis['topic']['category'] == test_case['category']

            topic_match_score = calculate_topic_match(detected_topic, expected_topic)

            result = {
                'test_id': test_case['id'],
                'description': test_case['description'],
                'category': test_case['category_name'],
                'expected_topic': expected_topic,
                'detected_topic': detected_topic,
                'topic_match_score': topic_match_score,
                'category_match': category_match,
                'difficulty_match': analysis['topic']['difficulty'] == test_case['expected_difficulty'],
                'num_scenes': len(analysis['scenes']),
                'has_visualization': bool(analysis.get('visualization')),
                'success': topic_match_score >= 0.8 and category_match
            }

            results.append(result)

            # 显示结果
            if result['success']:
                print_success(f"✓ {detected_topic} ({analysis['topic']['category']})")
            else:
                print_warning(f"⚠️  {detected_topic} vs {expected_topic}")

        except Exception as e:
            print_error(f"分析失败: {str(e)}")
            results.append({
                'test_id': test_case['id'],
                'error': str(e),
                'success': False
            })

    # 统计结果
    successful = sum(1 for r in results if r.get('success', False))
    total = len(results)
    success_rate = (successful / total * 100) if total > 0 else 0

    print_header("评估结果统计")

    print(f"总体成功率: {success_rate:.1f}% ({successful}/{total})")

    # 按类别统计
    print("\n按类别统计:")
    for category, data in TEST_CATEGORIES.items():
        category_results = [r for r in results if r.get('category') == data['name']]
        if category_results:
            cat_success = sum(1 for r in category_results if r.get('success', False))
            cat_total = len(category_results)
            cat_rate = (cat_success / cat_total * 100) if cat_total > 0 else 0
            status = Colors.OKGREEN if cat_rate >= 80 else Colors.WARNING if cat_rate >= 60 else Colors.FAIL
            print(f"{status}{data['name']}: {cat_rate:.1f}% ({cat_success}/{cat_total}){Colors.ENDC}")

    # 找出问题案例
    failed_cases = [r for r in results if not r.get('success', False)]
    if failed_cases:
        print_header("需要改进的案例")
        for i, case in enumerate(failed_cases[:10], 1):  # 只显示前10个
            print(f"{i}. {case['description'][:60]}...")
            print(f"   期望: {case['expected_topic']}")
            print(f"   实际: {case['detected_topic']}")
            print(f"   匹配度: {case['topic_match_score']:.2f}")
            print()

    return results


async def evaluate_scene_structure():
    """评估场景分解的质量"""
    print_header("场景结构质量评估")

    analyzer = ContentAnalyzer()

    # 选择几个代表性测试用例
    sample_cases = ALL_TEST_CASES[:5]

    print_info("分析场景分解质量...\n")

    for test_case in sample_cases:
        print(f"测试: {test_case['description'][:50]}...")

        analysis = await analyzer.analyze(test_case['description'])

        print(f"  场景数: {len(analysis['scenes'])}")
        print(f"  预期难度: {test_case['expected_difficulty']}")
        print(f"  检测难度: {analysis['topic']['difficulty']}")

        # 检查场景时间分配
        total_percent = sum(scene.get('duration_percent', 0) for scene in analysis['scenes'])
        print(f"  时间分配: {total_percent}% (应为100%)")

        # 显示场景列表
        print(f"  场景列表:")
        for i, scene in enumerate(analysis['scenes'], 1):
            print(f"    {i}. {scene['title']}: {scene.get('duration_percent', 0)}%")

        # 评估场景多样性
        scene_types = set(scene.get('content_type', '') for scene in analysis['scenes'])
        print(f"  场景类型: {', '.join(scene_types)}")

        print()


def analyze_prompt_issues():
    """分析当前 prompt 的潜在问题"""
    print_header("Prompt 问题分析")

    issues = [
        {
            "id": 1,
            "category": "主题识别",
            "issue": "主题名称可能不够精确",
            "impact": "中",
            "evidence": "测试中某些主题被识别为更通用的名称",
            "suggestion": "添加更多主题示例，强调精确命名"
        },
        {
            "id": 2,
            "category": "场景分解",
            "issue": "场景数量可能不够灵活",
            "impact": "低",
            "evidence": "所有测试都生成了 4-5 个场景",
            "suggestion": "根据难度级别动态调整场景数量"
        },
        {
            "id": 3,
            "category": "可视化建议",
            "issue": "可视化策略可能过于通用",
            "impact": "中",
            "evidence": "不同主题的可视化建议相似",
            "suggestion": "为不同类别添加特定的可视化建议"
        },
        {
            "id": 4,
            "category": "教育重点",
            "issue": "关键点提取可能不够具体",
            "impact": "中",
            "evidence": "某些测试的关键点较为笼统",
            "suggestion": "添加关键点提取的指导原则"
        }
    ]

    for issue in issues:
        print(f"\n{Colors.WARNING}问题 {issue['id']}: {issue['category']}{Colors.ENDC}")
        print(f"  描述: {issue['issue']}")
        print(f"  影响: {issue['impact']}")
        print(f"  证据: {issue['evidence']}")
        print(f"  建议: {issue['suggestion']}")


async def main():
    """主函数"""
    print_header("Phase 2 Prompt 优化 - 基线评估")
    print(f"开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 评估 Content Analyzer
    analyzer_results = await evaluate_content_analyzer()

    # 评估场景结构
    await evaluate_scene_structure()

    # 分析 prompt 问题
    analyze_prompt_issues()

    # 保存结果
    print_header("保存评估结果")

    results_file = Path(__file__).parent / "phase2_baseline_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(analyzer_results, f, indent=2, ensure_ascii=False)

    print_success(f"结果已保存到: {results_file}")

    print(f"\n结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 总结
    successful = sum(1 for r in analyzer_results if r.get('success', False))
    total = len(analyzer_results)
    success_rate = (successful / total * 100) if total > 0 else 0

    print_header("总结")
    print(f"基线成功率: {success_rate:.1f}%")
    print(f"总测试数: {total}")
    print(f"成功数: {successful}")
    print(f"失败数: {total - successful}")

    if success_rate >= 90:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}🎉 基线性能优秀！重点优化细节质量。{Colors.ENDC}")
    elif success_rate >= 80:
        print(f"\n{Colors.OKGREEN}{Colors.BOLD}✅ 基线性能良好，可以开始针对性优化。{Colors.ENDC}")
    elif success_rate >= 70:
        print(f"\n{Colors.WARNING}{Colors.BOLD}⚠️  基线性能一般，需要重点优化。{Colors.ENDC}")
    else:
        print(f"\n{Colors.FAIL}{Colors.BOLD}❌ 基线性能较差，需要全面优化 prompt。{Colors.ENDC}")


if __name__ == "__main__":
    asyncio.run(main())
