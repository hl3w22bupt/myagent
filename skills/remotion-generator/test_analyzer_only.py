#!/usr/bin/env python3
"""
简化版集成测试：只测试 Content Analyzer v1.0 vs v2.0

快速对比两个版本的内容分析质量。
"""

import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from generators.llm_analyzer import ContentAnalyzer as ContentAnalyzerV1
from generators.llm_analyzer_v2 import ContentAnalyzerV2


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


# 3个精选测试用例
SAMPLE_TEST_CASES = [
    {
        "id": 1,
        "description": "勾股定理：直角三角形的三边关系 a² + b² = c²",
        "category": "geometry",
        "difficulty": "introductory"
    },
    {
        "id": 2,
        "description": "泰勒公式：如何用多项式逼近任意光滑函数",
        "category": "calculus",
        "difficulty": "intermediate"
    },
    {
        "id": 3,
        "description": "二次方程的求根公式推导和几何意义",
        "category": "algebra",
        "difficulty": "intermediate"
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
    desc_words = set(test_case['description'].lower().split())
    topic_words = set(topic_name.split())

    if len(topic_words & desc_words) > 0 or len(topic_name) > 5:
        score += 2
        details.append(f"✓ 主题相关: {topic.get('name')}")

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

    total_percent = sum(s.get('duration_percent', 0) for s in scenes)
    if abs(total_percent - 100) < 1:
        score += 1
        details.append(f"✓ 时间分配正确: {total_percent}%")

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


async def run_quick_tests():
    """运行快速对比测试"""
    print_header("Content Analyzer v1.0 vs v2.0 快速测试")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    v1 = ContentAnalyzerV1()
    v2 = ContentAnalyzerV2()

    results = []

    for i, test_case in enumerate(SAMPLE_TEST_CASES, 1):
        print(f"\n{'='*70}")
        print(f"测试 {i}/{len(SAMPLE_TEST_CASES)}: {test_case['description'][:50]}...")
        print(f"{'='*70}\n")

        # 运行 v1.0
        print(f"{Colors.OKBLUE}v1.0 分析中...{Colors.ENDC}")
        try:
            analysis_v1 = await v1.analyze(test_case['description'])
            score_v1, max_score, details_v1 = evaluate_analysis_quality(analysis_v1, test_case)
            v1_success = True
        except Exception as e:
            print_error(f"v1.0 失败: {str(e)}")
            v1_success = False
            score_v1 = 0
            details_v1 = [f"错误: {str(e)}"]

        # 运行 v2.0
        print(f"{Colors.OKBLUE}v2.0 分析中...{Colors.ENDC}")
        try:
            analysis_v2 = await v2.analyze(test_case['description'])
            score_v2, max_score, details_v2 = evaluate_analysis_quality(analysis_v2, test_case)
            v2_success = True
        except Exception as e:
            print_error(f"v2.0 失败: {str(e)}")
            v2_success = False
            score_v2 = 0
            details_v2 = [f"错误: {str(e)}"]

        # 显示对比
        if v1_success and v2_success:
            print(f"\n{Colors.BOLD}对比结果:{Colors.ENDC}")
            print(f"  v1.0: {score_v1}/{max_score}")
            print(f"  v2.0: {score_v2}/{max_score}")
            improvement = score_v2 - score_v1
            if improvement > 0:
                print_success(f"  改进: +{improvement} 分")
            elif improvement < 0:
                print_error(f"  下降: {improvement} 分")
            else:
                print_info(f"  持平")

            # v2.0 详细信息
            print(f"\n{Colors.OKCYAN}v2.0 分析详情:{Colors.ENDC}")
            print(f"  主题: {analysis_v2['topic']['name']} ({analysis_v2['topic']['category']})")
            print(f"  难度: {analysis_v2['topic']['difficulty']}")
            print(f"  场景数: {len(analysis_v2['scenes'])}")
            print(f"  主要可视化: {analysis_v2['visualization']['primary_visual']}")

            # 显示场景详情
            print(f"\n  场景分解:")
            for j, scene in enumerate(analysis_v2['scenes'], 1):
                print(f"    {j}. {scene['title']} ({scene['duration_percent']}%)")

        result = {
            'test_id': test_case['id'],
            'description': test_case['description'],
            'v1_score': score_v1,
            'v2_score': score_v2,
            'v1_success': v1_success,
            'v2_success': v2_success,
            'improvement': score_v2 - score_v1 if (v1_success and v2_success) else 0
        }
        results.append(result)

    # 总结统计
    print_header("总结统计")

    v1_total = sum(r['v1_score'] for r in results if r['v1_success'])
    v2_total = sum(r['v2_score'] for r in results if r['v2_success'])
    v1_avg = v1_total / len(results)
    v2_avg = v2_total / len(results)
    improvement = v2_avg - v1_avg

    print(f"v1.0 平均分: {v1_avg:.2f}/10")
    print(f"v2.0 平均分: {v2_avg:.2f}/10")
    print(f"{Colors.BOLD}改进: {improvement:+.2f} 分 ({improvement/v1_avg*100:+.1f}%){Colors.ENDC}\n")

    # 保存结果
    results_file = Path(__file__).parent / "analyzer_test_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print_success(f"结果已保存到: {results_file}")

    # 推荐
    print_header("建议")
    if improvement >= 1:
        print_success(f"🎉 v2.0 明显优于 v1.0！")
    elif improvement >= 0.5:
        print(f"{Colors.OKGREEN}✅ v2.0 优于 v1.0{Colors.ENDC}")
    elif improvement >= -0.5:
        print(f"{Colors.WARNING}⚠️  v2.0 与 v1.0 相当{Colors.ENDC}")
    else:
        print_error(f"❌ v2.0 不如 v1.0")


if __name__ == "__main__":
    asyncio.run(run_quick_tests())
