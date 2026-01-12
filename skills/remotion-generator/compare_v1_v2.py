#!/usr/bin/env python3
"""
v1.0 vs v2.0 对比测试

快速对比两个版本的 Content Analyzer 在几个代表性测试用例上的表现。
"""

import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

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


# 精选的代表性测试用例
SAMPLE_TEST_CASES = [
    {
        "id": 1,
        "description": "生成一个泰勒公式的教学视频，重点讲解多项式逼近的核心理念",
        "category": "calculus",
        "difficulty": "intermediate"
    },
    {
        "id": 2,
        "description": "勾股定理：直角三角形的三边关系 a² + b² = c²",
        "category": "geometry",
        "difficulty": "introductory"
    },
    {
        "id": 3,
        "description": "二次方程的求根公式推导和几何意义",
        "category": "algebra",
        "difficulty": "intermediate"
    },
    {
        "id": 4,
        "description": "正态分布：钟形曲线的含义和应用",
        "category": "statistics",
        "difficulty": "intermediate"
    },
    {
        "id": 5,
        "description": "特征值和特征向量：矩阵的本质属性",
        "category": "linear_algebra",
        "difficulty": "advanced"
    }
]


def evaluate_topic_quality(analysis, expected):
    """评估主题识别质量"""
    score = 0
    details = []

    # 检查主题名称
    detected = analysis['topic']['name'].lower()
    if any(word in detected for word in expected['category'].split() if len(word) > 3):
        score += 1
        details.append("✓ 主题相关")
    else:
        details.append("✗ 主题可能不相关")

    # 检查类别
    if analysis['topic']['category'] == expected['category']:
        score += 1
        details.append(f"✓ 类别正确: {expected['category']}")
    else:
        details.append(f"✗ 类别错误: {analysis['topic']['category']} vs {expected['category']}")

    # 检查难度
    if analysis['topic']['difficulty'] == expected['difficulty']:
        score += 1
        details.append(f"✓ 难度正确: {expected['difficulty']}")
    else:
        details.append(f"~ 难度不同: {analysis['topic']['difficulty']} vs {expected['difficulty']}")

    return score, details


def evaluate_scene_quality(analysis):
    """评估场景结构质量"""
    score = 0
    details = []
    scenes = analysis.get('scenes', [])

    # 检查场景数量
    num_scenes = len(scenes)
    if 3 <= num_scenes <= 6:
        score += 1
        details.append(f"✓ 场景数合理: {num_scenes}")
    else:
        details.append(f"~ 场景数异常: {num_scenes}")

    # 检查时间分配
    total_percent = sum(s.get('duration_percent', 0) for s in scenes)
    if total_percent == 100:
        score += 1
        details.append(f"✓ 时间分配正确: {total_percent}%")
    else:
        details.append(f"✗ 时间分配错误: {total_percent}%")

    # 检查场景多样性
    scene_types = set(s.get('content_type', '') for s in scenes)
    if len(scene_types) >= 3:
        score += 1
        details.append(f"✓ 场景类型多样: {len(scene_types)} 种")
    else:
        details.append(f"~ 场景类型单一: {len(scene_types)} 种")

    # 检查描述质量
    avg_desc_len = sum(len(s.get('description', '')) for s in scenes) / len(scenes) if scenes else 0
    if avg_desc_len > 30:
        score += 1
        details.append(f"✓ 描述详细: 平均 {avg_desc_len:.0f} 字符")
    else:
        details.append(f"~ 描述简略: 平均 {avg_desc_len:.0f} 字符")

    return score, details


def evaluate_visualization_quality(analysis):
    """评估可视化策略质量"""
    score = 0
    details = []
    viz = analysis.get('visualization', {})

    # 检查是否有 primary_visual
    primary = viz.get('primary_visual', '')
    if primary and len(primary) > 10:
        score += 1
        details.append(f"✓ 主要可视化明确: {primary[:30]}...")
    else:
        details.append("~ 主要可视化不明确")

    # 检查颜色方案
    colors = viz.get('color_scheme', {})
    if all(k in colors for k in ['primary', 'secondary', 'accent']):
        score += 1
        details.append(f"✓ 颜色方案完整")
    else:
        details.append("~ 颜色方案不完整")

    # 检查动画风格
    anim_style = viz.get('animation_style', '')
    if anim_style:
        score += 1
        details.append(f"✓ 动画风格: {anim_style}")
    else:
        details.append("~ 无动画风格")

    return score, details


async def compare_versions():
    """对比 v1.0 和 v2.0"""
    print_header("v1.0 vs v2.0 Content Analyzer 对比测试")
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
            topic_score_v1, topic_details_v1 = evaluate_topic_quality(analysis_v1, test_case)
            scene_score_v1, scene_details_v1 = evaluate_scene_quality(analysis_v1)
            viz_score_v1, viz_details_v1 = evaluate_visualization_quality(analysis_v1)
            v1_success = True
        except Exception as e:
            print_error(f"v1.0 失败: {str(e)}")
            v1_success = False
            topic_score_v1 = scene_score_v1 = viz_score_v1 = 0
            topic_details_v1 = scene_details_v1 = viz_details_v1 = ["错误"]

        # 运行 v2.0
        print(f"{Colors.OKBLUE}v2.0 分析中...{Colors.ENDC}")
        try:
            analysis_v2 = await v2.analyze(test_case['description'])
            topic_score_v2, topic_details_v2 = evaluate_topic_quality(analysis_v2, test_case)
            scene_score_v2, scene_details_v2 = evaluate_scene_quality(analysis_v2)
            viz_score_v2, viz_details_v2 = evaluate_visualization_quality(analysis_v2)
            v2_success = True
        except Exception as e:
            print_error(f"v2.0 失败: {str(e)}")
            v2_success = False
            topic_score_v2 = scene_score_v2 = viz_score_v2 = 0
            topic_details_v2 = scene_details_v2 = viz_details_v2 = ["错误"]

        # 收集结果
        result = {
            'test_id': test_case['id'],
            'description': test_case['description'],
            'v1': {
                'topic_score': topic_score_v1,
                'scene_score': scene_score_v1,
                'viz_score': viz_score_v1,
                'total': topic_score_v1 + scene_score_v1 + viz_score_v1,
                'success': v1_success
            },
            'v2': {
                'topic_score': topic_score_v2,
                'scene_score': scene_score_v2,
                'viz_score': viz_score_v2,
                'total': topic_score_v2 + scene_score_v2 + viz_score_v2,
                'success': v2_success
            }
        }
        results.append(result)

        # 显示对比
        print(f"\n{Colors.BOLD}对比结果:{Colors.ENDC}")
        print(f"  主题识别: v1={topic_score_v1}/3, v2={topic_score_v2}/3")
        print(f"  场景质量: v1={scene_score_v1}/4, v2={scene_score_v2}/4")
        print(f"  可视化:  v1={viz_score_v1}/3, v2={viz_score_v2}/3")
        print(f"  {Colors.BOLD}总分:     v1={result['v1']['total']}/10, v2={result['v2']['total']}/10{Colors.ENDC}")

        # 显示改进
        improvement = result['v2']['total'] - result['v1']['total']
        if improvement > 0:
            print_success(f"  改进: +{improvement} 分")
        elif improvement < 0:
            print_error(f"  下降: {improvement} 分")
        else:
            print_info(f"  持平")

        # v2 详细信息
        print(f"\n{Colors.OKCYAN}v2.0 分析详情:{Colors.ENDC}")
        print(f"  主题: {analysis_v2['topic']['name']} ({analysis_v2['topic']['category']})")
        print(f"  难度: {analysis_v2['topic']['difficulty']}")
        print(f"  场景数: {len(analysis_v2['scenes'])}")
        print(f"  可视化: {analysis_v2['visualization']['primary_visual']}")

    # 总结统计
    print_header("总结统计")

    v1_total = sum(r['v1']['total'] for r in results if r['v1']['success'])
    v2_total = sum(r['v2']['total'] for r in results if r['v2']['success'])
    v1_avg = v1_total / len(results)
    v2_avg = v2_total / len(results)
    improvement = v2_avg - v1_avg

    print(f"v1.0 平均分: {v1_avg:.2f}/10")
    print(f"v2.0 平均分: {v2_avg:.2f}/10")
    print(f"{Colors.BOLD}改进: {improvement:+.2f} 分 ({improvement/v1_avg*100:+.1f}%){Colors.ENDC}\n")

    # 各维度对比
    print("各维度对比:")
    dimensions = ['topic_score', 'scene_score', 'viz_score']
    names = ['主题识别', '场景质量', '可视化质量']
    max_scores = [3, 4, 3]

    for dim, name, max_score in zip(dimensions, names, max_scores):
        v1_sum = sum(r['v1'][dim] for r in results if r['v1']['success'])
        v2_sum = sum(r['v2'][dim] for r in results if r['v2']['success'])
        v1_avg = v1_sum / len(results) / max_score * 100
        v2_avg = v2_sum / len(results) / max_score * 100
        diff = v2_avg - v1_avg

        status = Colors.OKGREEN if diff > 0 else Colors.WARNING if diff == 0 else Colors.FAIL
        print(f"{status}{name}: v1={v1_avg:.1f}%, v2={v2_avg:.1f}% ({diff:+.1f}%){Colors.ENDC}")

    # 保存结果
    print_header("保存结果")
    results_file = Path(__file__).parent / "v1_vs_v2_results.json"
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False, default=str)
    print_success(f"结果已保存到: {results_file}")

    # 推荐
    print_header("建议")
    if improvement >= 1:
        print_success(f"🎉 v2.0 明显优于 v1.0！推荐升级到 v2.0")
    elif improvement >= 0.5:
        print(f"{Colors.OKGREEN}✅ v2.0 优于 v1.0，建议升级{Colors.ENDC}")
    elif improvement >= -0.5:
        print(f"{Colors.WARNING}⚠️  v2.0 与 v1.0 相当，可以考虑升级{Colors.ENDC}")
    else:
        print_error(f"❌ v2.0 不如 v1.0，需要进一步优化")


if __name__ == "__main__":
    asyncio.run(compare_versions())
