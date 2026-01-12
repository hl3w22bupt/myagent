#!/usr/bin/env python3
"""
集成测试：v1.0 vs v2.0 完整两阶段生成测试

测试 Content Analyzer + Code Generator 的完整流程，
对比 v1.0 和 v2.0 的实际效果。
"""

import asyncio
import sys
import os
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


# 精选测试用例（5个，涵盖不同类别和难度）
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
    },
    {
        "id": 3,
        "description": "二次方程的求根公式推导和几何意义",
        "category": "algebra",
        "difficulty": "intermediate",
        "expected_complexity": "medium"
    },
    {
        "id": 4,
        "description": "正态分布：钟形曲线的含义、标准差和68-95-99.7规则",
        "category": "statistics",
        "difficulty": "intermediate",
        "expected_complexity": "medium"
    },
    {
        "id": 5,
        "description": "特征值和特征向量：矩阵对角化的几何直观",
        "category": "linear_algebra",
        "difficulty": "advanced",
        "expected_complexity": "complex"
    }
]


def evaluate_analysis_quality(analysis, test_case):
    """评估内容分析质量"""
    score = 0
    max_score = 10
    details = []

    # 1. 主题识别 (3分)
    topic = analysis.get('topic', {})
    topic_name = topic.get('name', '').lower()

    # 检查主题相关性（简单检查：是否包含描述中的关键词）
    desc_words = set(test_case['description'].lower().split())
    topic_words = set(topic_name.split())
    if len(topic_words & desc_words) > 0 or len(topic_name) > 5:
        score += 2
        details.append(f"✓ 主题相关: {topic.get('name')}")

    # 检查类别
    if topic.get('category') == test_case['category']:
        score += 1
        details.append(f"✓ 类别正确: {test_case['category']}")
    else:
        details.append(f"~ 类别不同: {topic.get('category')} vs {test_case['category']}")

    # 2. 场景结构 (4分)
    scenes = analysis.get('scenes', [])
    num_scenes = len(scenes)

    if 3 <= num_scenes <= 6:
        score += 2
        details.append(f"✓ 场景数合理: {num_scenes}")

    # 检查时间分配
    total_percent = sum(s.get('duration_percent', 0) for s in scenes)
    if abs(total_percent - 100) < 1:
        score += 1
        details.append(f"✓ 时间分配正确: {total_percent}%")

    # 检查场景多样性
    scene_types = set(s.get('content_type', '') for s in scenes)
    if len(scene_types) >= 3:
        score += 1
        details.append(f"✓ 场景类型多样: {len(scene_types)} 种")

    # 3. 可视化策略 (3分)
    viz = analysis.get('visualization', {})

    if viz.get('primary_visual'):
        score += 1
        details.append(f"✓ 主要可视化明确")

    colors = viz.get('color_scheme', {})
    if all(k in colors for k in ['primary', 'secondary', 'accent']):
        score += 1
        details.append(f"✓ 颜色方案完整")

    if viz.get('animation_style'):
        score += 1
        details.append(f"✓ 动画风格: {viz.get('animation_style')}")

    return score, max_score, details


def evaluate_code_quality(code, validator):
    """评估代码质量"""
    score = 0
    max_score = 10
    details = []

    try:
        # 使用 CodeValidator 进行基本验证
        validation = validator.validate(code)

        # 1. 基本语法 (3分)
        if validation.get('valid_syntax', False):
            score += 3
            details.append("✓ TypeScript 语法正确")
        else:
            details.append(f"✗ 语法错误: {validation.get('syntax_error', 'Unknown')}")

        # 2. 必需组件 (3分)
        required_imports = ['Composition', 'useCurrentFrame']
        found_imports = sum(1 for imp in required_imports if imp in code)
        score += found_imports
        if found_imports == len(required_imports):
            details.append(f"✓ 所有必需导入存在")
        else:
            details.append(f"~ 缺少导入: {len(required_imports) - found_imports}")

        # 3. Remotion 组件 (2分)
        if 'registerRoot' in code:
            score += 1
            details.append("✓ registerRoot 存在")

        if 'export const Root' in code or 'export function Root' in code:
            score += 1
            details.append("✓ Root 组件导出")

        # 4. 代码质量 (2分)
        # 检查是否有基本的场景管理
        if 'scene' in code.lower() or 'interpolate' in code or 'spring' in code:
            score += 1
            details.append("✓ 包含动画/场景逻辑")

        # 检查代码长度（合理的代码应该 > 500 字符）
        if len(code) > 500:
            score += 1
            details.append(f"✓ 代码长度合理: {len(code)} 字符")
        else:
            details.append(f"~ 代码较短: {len(code)} 字符")

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
        'timing': {}
    }

    try:
        # Stage 1: Content Analysis
        start_time = time.time()
        analysis = await analyzer.analyze(test_case['description'])
        result['timing']['analysis'] = time.time() - start_time
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
        result['timing']['generation'] = time.time() - start_time
        result['code'] = code

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


async def run_integration_tests():
    """运行完整的集成测试"""
    print_header("v1.0 vs v2.0 集成测试 - 完整两阶段生成")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # 初始化 generators
    v1_analyzer = ContentAnalyzerV1()
    v2_analyzer = ContentAnalyzerV2()
    v1_generator = RemotionCodeGeneratorV1()
    v2_generator = RemotionCodeGeneratorV2()
    validator = CodeValidator()

    # 测试版本组合
    combinations = [
        ("v1.0", "v1.0", v1_analyzer, v1_generator),
        ("v2.0", "v2.0", v2_analyzer, v2_generator),
    ]

    all_results = {}

    for test_case in SAMPLE_TEST_CASES:
        test_id = test_case['id']
        print(f"\n{'='*70}")
        print(f"测试 {test_id}/{len(SAMPLE_TEST_CASES)}: {test_case['description'][:50]}...")
        print(f"{'='*70}\n")

        all_results[test_id] = {
            'test_case': test_case,
            'combinations': {}
        }

        for analyzer_ver, gen_ver, analyzer, generator in combinations:
            print(f"{Colors.OKBLUE}测试 {analyzer_ver} + {gen_ver}...{Colors.ENDC}")

            result = await test_version_combination(
                test_case, analyzer, generator, validator,
                analyzer_ver, gen_ver
            )

            all_results[test_id]['combinations'][f"{analyzer_ver}+{gen_ver}"] = result

            if result['success']:
                print_success(f"分析: {result['analysis_score']}/{result['analysis_max']} | "
                            f"代码: {result['code_score']}/{result['code_max']} | "
                            f"总分: {result['total_score']}/20")
                print_info(f"耗时: 分析={result['timing'].get('analysis', 0):.2f}s, "
                          f"生成={result['timing'].get('generation', 0):.2f}s")
            else:
                print_error(f"失败: {', '.join(result['errors'])}")

    # 汇总统计
    print_header("汇总统计")

    stats = {
        'v1.0+v1.0': {'total': 0, 'analysis': 0, 'code': 0, 'count': 0},
        'v2.0+v2.0': {'total': 0, 'analysis': 0, 'code': 0, 'count': 0}
    }

    for test_id, data in all_results.items():
        for combo, result in data['combinations'].items():
            if result['success']:
                stats[combo]['total'] += result['total_score']
                stats[combo]['analysis'] += result['analysis_score']
                stats[combo]['code'] += result['code_score']
                stats[combo]['count'] += 1

    # 计算平均分
    for combo in stats:
        count = stats[combo]['count']
        if count > 0:
            stats[combo]['avg_total'] = stats[combo]['total'] / count
            stats[combo]['avg_analysis'] = stats[combo]['analysis'] / count
            stats[combo]['avg_code'] = stats[combo]['code'] / count

    print(f"\n{Colors.BOLD}平均得分对比:{Colors.ENDC}\n")
    print(f"{'版本组合':<15} {'分析质量':<12} {'代码质量':<12} {'总分':<10}")
    print('-' * 50)
    for combo, data in stats.items():
        if data['count'] > 0:
            print(f"{combo:<15} "
                  f"{data['avg_analysis']:.2f}/10    "
                  f"{data['avg_code']:.2f}/10    "
                  f"{Colors.BOLD}{data['avg_total']:.2f}/20{Colors.ENDC}")

    # 改进幅度
    if stats['v1.0+v1.0']['count'] > 0 and stats['v2.0+v2.0']['count'] > 0:
        v1_total = stats['v1.0+v1.0']['avg_total']
        v2_total = stats['v2.0+v2.0']['avg_total']
        improvement = v2_total - v1_total
        improvement_pct = (improvement / v1_total) * 100 if v1_total > 0 else 0

        print(f"\n{Colors.BOLD}改进幅度:{Colors.ENDC}")
        print(f"总分提升: {improvement:+.2f} ({improvement_pct:+.1f}%)")

        v1_analysis = stats['v1.0+v1.0']['avg_analysis']
        v2_analysis = stats['v2.0+v2.0']['avg_analysis']
        analysis_improvement = ((v2_analysis - v1_analysis) / v1_analysis * 100) if v1_analysis > 0 else 0

        v1_code = stats['v1.0+v1.0']['avg_code']
        v2_code = stats['v2.0+v2.0']['avg_code']
        code_improvement = ((v2_code - v1_code) / v1_code * 100) if v1_code > 0 else 0

        print(f"分析质量: {analysis_improvement:+.1f}%")
        print(f"代码质量: {code_improvement:+.1f}%")

    # 保存详细结果
    print_header("保存结果")
    results_file = Path(__file__).parent / "integration_test_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
    print_success(f"详细结果已保存到: {results_file}")

    # 推荐
    print_header("建议")
    if stats['v2.0+v2.0']['count'] > 0:
        v2_avg = stats['v2.0+v2.0']['avg_total']
        if v2_avg >= 16:
            print_success(f"🎉 v2.0 表现优秀！推荐立即升级到生产环境")
        elif v2_avg >= 14:
            print(f"{Colors.OKGREEN}✅ v2.0 表现良好，建议升级{Colors.ENDC}")
        else:
            print(f"{Colors.WARNING}⚠️  v2.0 还需要进一步优化{Colors.ENDC}")


if __name__ == "__main__":
    asyncio.run(run_integration_tests())
