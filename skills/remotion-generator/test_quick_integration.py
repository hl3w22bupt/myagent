#!/usr/bin/env python3
"""
快速集成测试：v1.0 vs v2.0 完整两阶段生成（简化版）

只测试 2 个代表性用例，快速验证功能。
"""

import asyncio
import sys
import json
import time
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from generators.llm_analyzer import ContentAnalyzer as ContentAnalyzerV1
from generators.llm_analyzer_v2 import ContentAnalyzerV2
from generators.code_generator import RemotionCodeGenerator as RemotionCodeGeneratorV1
from generators.code_generator_v2 import RemotionCodeGeneratorV2
from generators.validator import CodeValidator


class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'


def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*70}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text:^70}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*70}{Colors.ENDC}\n")


def print_success(text):
    print(f"{Colors.OKGREEN}✅ {text}{Colors.ENDC}")


def print_error(text):
    print(f"{Colors.FAIL}❌ {text}{Colors.ENDC}")


def print_info(text):
    print(f"{Colors.OKCYAN}ℹ️  {text}{Colors.ENDC}")


# 只测试 2 个代表性用例
SAMPLE_TEST_CASES = [
    {
        "id": 1,
        "description": "勾股定理：直角三角形的三边关系 a² + b² = c²",
        "category": "geometry",
        "difficulty": "introductory",
        "expected_complexity": "simple"
    },
    {
        "id": 2,
        "description": "泰勒公式：如何用多项式逼近任意光滑函数",
        "category": "calculus",
        "difficulty": "intermediate",
        "expected_complexity": "medium"
    }
]


def evaluate_analysis_quality(analysis, test_case):
    """评估内容分析质量（简化版）"""
    score = 0
    max_score = 10
    details = []

    # 主题识别 (3分)
    topic = analysis.get('topic', {})
    if topic.get('category') == test_case['category']:
        score += 3
        details.append(f"✓ 类别正确: {test_case['category']}")
    else:
        score += 2
        details.append(f"~ 类别不同: {topic.get('category')}")

    # 场景结构 (4分)
    scenes = analysis.get('scenes', [])
    if 3 <= len(scenes) <= 6:
        score += 2
        details.append(f"✓ 场景数合理: {len(scenes)}")

    total_percent = sum(s.get('duration_percent', 0) for s in scenes)
    if abs(total_percent - 100) < 1:
        score += 2
        details.append(f"✓ 时间分配正确: {total_percent}%")

    # 可视化策略 (3分)
    viz = analysis.get('visualization', {})
    if viz.get('primary_visual'):
        score += 2
        details.append(f"✓ 主要可视化明确")

    if viz.get('animation_style'):
        score += 1
        details.append(f"✓ 动画风格: {viz.get('animation_style')}")

    return score, max_score, details


def evaluate_code_quality(code, validator):
    """评估代码质量（简化版）"""
    score = 0
    max_score = 10
    details = []

    try:
        is_valid, errors, warnings = validator.validate(code)

        # 基本语法 (3分)
        if is_valid:
            score += 3
            details.append("✓ TypeScript 语法正确")
        else:
            details.append(f"✗ 语法错误: {', '.join(errors)}")

        # 必需组件 (3分)
        if 'Composition' in code:
            score += 1
            details.append("✓ Composition 导入")

        if 'useCurrentFrame' in code:
            score += 1
            details.append("✓ useCurrentFrame 存在")

        if 'registerRoot' in code:
            score += 1
            details.append("✓ registerRoot 存在")

        # 代码质量 (4分)
        if len(code) > 500:
            score += 2
            details.append(f"✓ 代码长度合理")

        if 'interpolate' in code or 'spring' in code:
            score += 2
            details.append("✓ 包含动画逻辑")

    except Exception as e:
        details.append(f"✗ 验证失败: {str(e)}")

    return score, max_score, details


async def test_version_combination(
    test_case,
    analyzer,
    code_generator,
    validator,
    analyzer_version,
    generator_version
):
    """测试特定的版本组合"""
    result = {
        'test_id': test_case['id'],
        'analyzer_version': analyzer_version,
        'generator_version': generator_version,
        'analysis': None,
        'code': None,
        'analysis_score': 0,
        'analysis_max': 10,
        'analysis_details': [],
        'code_score': 0,
        'code_max': 10,
        'code_details': [],
        'total_score': 0,
        'errors': [],
        'success': False
    }

    try:
        # Stage 1: Content Analysis
        start_time = time.time()
        analysis = await analyzer.analyze(test_case['description'])
        analysis_time = time.time() - start_time
        result['analysis'] = analysis

        # 评估分析质量
        score, max_score, details = evaluate_analysis_quality(analysis, test_case)
        result['analysis_score'] = score
        result['analysis_max'] = max_score
        result['analysis_details'] = details

        # Stage 2: Code Generation
        start_time = time.time()
        code = await code_generator.generate(
            analysis=analysis,
            duration=10,
            fps=30,
            resolution="1920x1080"
        )
        generation_time = time.time() - start_time
        result['code'] = code
        result['timing'] = {'analysis': analysis_time, 'generation': generation_time}

        # 评估代码质量
        score, max_score, details = evaluate_code_quality(code, validator)
        result['code_score'] = score
        result['code_max'] = max_score
        result['code_details'] = details

        result['total_score'] = result['analysis_score'] + result['code_score']
        result['success'] = True

    except Exception as e:
        result['errors'].append(str(e))
        result['success'] = False

    return result


async def run_quick_tests():
    """运行快速集成测试"""
    print_header("v1.0 vs v2.0 快速集成测试 - 完整两阶段生成")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # 初始化
    v1_analyzer = ContentAnalyzerV1()
    v2_analyzer = ContentAnalyzerV2()
    v1_generator = RemotionCodeGeneratorV1()
    v2_generator = RemotionCodeGeneratorV2()
    validator = CodeValidator()

    # 只测试 v2.0 + v2.0
    print(f"{Colors.OKBLUE}测试 v2.0 + v2.0 (Content Analyzer v2 + Code Generator v2){Colors.ENDC}\n")

    all_results = []

    for test_case in SAMPLE_TEST_CASES:
        print(f"\n{'='*70}")
        print(f"测试 {test_case['id']}/{len(SAMPLE_TEST_CASES)}: {test_case['description'][:50]}...")
        print(f"{'='*70}\n")

        print(f"{Colors.OKBLUE}运行中...{Colors.ENDC}")

        result = await test_version_combination(
            test_case, v2_analyzer, v2_generator, validator,
            "v2.0", "v2.0"
        )

        all_results.append(result)

        if result['success']:
            print_success(f"分析: {result['analysis_score']}/{result['analysis_max']} | "
                        f"代码: {result['code_score']}/{result['code_max']} | "
                        f"总分: {result['total_score']}/20")
            print_info(f"耗时: 分析={result['timing']['analysis']:.2f}s, "
                      f"生成={result['timing']['generation']:.2f}s")

            # 显示代码片段
            if result['code']:
                code_preview = result['code'][:200].replace('\n', ' ')
                print(f"\n代码预览: {code_preview}...")
        else:
            print_error(f"失败: {', '.join(result['errors'])}")

    # 汇总统计
    print_header("汇总统计")

    successful = [r for r in all_results if r['success']]
    if successful:
        avg_analysis = sum(r['analysis_score'] for r in successful) / len(successful)
        avg_code = sum(r['code_score'] for r in successful) / len(successful)
        avg_total = sum(r['total_score'] for r in successful) / len(successful)

        print(f"\n{Colors.BOLD}v2.0 + v2.0 平均得分:{Colors.ENDC}")
        print(f"  分析质量: {avg_analysis:.2f}/10")
        print(f"  代码质量: {avg_code:.2f}/10")
        print(f"  {Colors.BOLD}总分:     {avg_total:.2f}/20{Colors.ENDC}")

        # 评估结果
        print(f"\n{Colors.BOLD}评估:{Colors.ENDC}")
        if avg_total >= 16:
            print_success("🎉 v2.0 表现优秀！")
        elif avg_total >= 14:
            print(f"{Colors.OKGREEN}✅ v2.0 表现良好{Colors.ENDC}")
        elif avg_total >= 12:
            print(f"{Colors.WARNING}⚠️  v2.0 表现一般{Colors.ENDC}")
        else:
            print_error("❌ v2.0 需要进一步优化")
    else:
        print_error("所有测试都失败了")

    # 保存结果
    results_file = Path(__file__).parent / "quick_integration_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
    print_success(f"\n结果已保存到: {results_file}")


if __name__ == "__main__":
    asyncio.run(run_quick_tests())
