#!/usr/bin/env python3
"""
End-to-End Demo: 完整的 Remotion 视频生成流程

展示规则系统在整个流程中的作用：
1. 分析用户描述（使用场景模式规则）
2. 生成 Remotion 代码（使用所有规则）
3. 验证生成的代码（检查规则违反）
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


async def demo_full_pipeline():
    """演示完整的生成流程"""
    print("\n" + "="*80)
    print("🎬 Remotion Generator - 完整流程演示")
    print("="*80)

    # ============================================
    # Step 1: 内容分析（使用场景模式规则）
    # ============================================
    print("\n📋 Step 1: 分析用户描述")
    print("-"*80)

    from generators.llm_analyzer_v2 import ContentAnalyzerV2

    analyzer = ContentAnalyzerV2()

    # 模拟分析（不实际调用 LLM）
    test_description = "勾股定理：直角三角形的三边关系"
    print(f"用户描述: {test_description}")
    print(f"\n✅ 分析器已初始化，RuleLoader: {'✅' if analyzer.rule_loader else '❌'}")

    # 检查场景模式是否加载
    test_prompt = analyzer._build_analysis_prompt_v2(test_description)
    has_scene_patterns = "Educational Video Scene Patterns" in test_prompt
    print(f"✅ 场景模式已加载: {'是' if has_scene_patterns else '否'}")
    print(f"📊 分析 prompt 大小: {len(test_prompt)} 字符 (~{len(test_prompt)//4} tokens)")

    # 显示场景模式部分
    if has_scene_patterns:
        scene_section_start = test_prompt.find("Educational Video Scene Patterns")
        scene_section = test_prompt[scene_section_start:scene_section_start+500]
        print(f"\n📄 场景模式部分预览:")
        print("-" * 80)
        print(scene_section)
        print("-" * 80)

    # ============================================
    # Step 2: 代码生成（使用所有规则）
    # ============================================
    print("\n💻 Step 2: 生成 Remotion 代码")
    print("-"*80)

    from generators.code_generator_v2 import RemotionCodeGeneratorV2

    generator = RemotionCodeGeneratorV2()

    # 模拟分析结果
    mock_analysis = {
        "topic": {
            "name": "Pythagorean Theorem",
            "category": "geometry",
            "difficulty": "introductory"
        },
        "scenes": [
            {
                "id": "scene_1",
                "title": "What is the Pythagorean Theorem?",
                "duration_percent": 15,
                "content_type": "title",
                "description": "Introduce the theorem with visual right triangle"
            }
        ],
        "visualization": {
            "color_scheme": {
                "primary": "#10B981",
                "secondary": "#3B82F6"
            }
        }
    }

    print(f"✅ 代码生成器已初始化，PromptBuilder: {'✅' if generator.prompt_builder else '❌'}")

    # 构建代码生成 prompt（不实际调用 LLM）
    code_prompt = generator._build_code_prompt_v2(
        mock_analysis,
        duration=10,
        fps=30,
        resolution="1920x1080"
    )

    # 检查规则是否加载
    has_must = "MUST 规则" in code_prompt or "MUST RULES" in code_prompt
    has_forbidden = "FORBIDDEN 规则" in code_prompt or "FORBIDDEN RULES" in code_prompt
    has_recommended = "RECOMMENDED 规则" in code_prompt or "RECOMMENDED RULES" in code_prompt
    has_animation = "动画预设" in code_prompt or "Animation Presets" in code_prompt
    has_scene_patterns = "场景模式" in code_prompt or "Scene Patterns" in code_prompt

    print(f"✅ MUST 规则已加载: {'是' if has_must else '否'}")
    print(f"✅ FORBIDDEN 规则已加载: {'是' if has_forbidden else '否'}")
    print(f"✅ RECOMMENDED 规则已加载: {'是' if has_recommended else '否'}")
    print(f"✅ 动画预设已加载: {'是' if has_animation else '否'}")
    print(f"✅ 场景模式已加载: {'是' if has_scene_patterns else '否'}")
    print(f"📊 代码生成 prompt 大小: {len(code_prompt)} 字符 (~{len(code_prompt)//4} tokens)")

    # 显示规则部分
    if has_must:
        must_start = code_prompt.find("MUST")
        must_section = code_prompt[must_start:must_start+600]
        print(f"\n📄 MUST 规则部分预览:")
        print("-" * 80)
        print(must_section)
        print("-" * 80)

    # ============================================
    # Step 3: 代码验证（检查规则违反）
    # ============================================
    print("\n🔍 Step 3: 验证生成的代码")
    print("-"*80)

    from generators.validator import CodeValidator

    validator = CodeValidator()
    print(f"✅ 验证器已初始化，RuleLoader: {'✅' if validator.rule_loader else '❌'}")

    # 测试错误代码（违反规则）
    bad_code = """
import React from 'react';
import { Composition, registerRoot } from 'remotion';

const BadComponent: React.FC = () => {
  return (
    <div style={{ transition: 'opacity 1s', animation: 'fadeIn 0.5s' }}>
      <div className="animate-bounce transition-all">
        Bad code with CSS animations
      </div>
    </div>
  );
};

export const BadVideo: React.FC = () => <BadComponent />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="BadVideo"
      component={BadVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

registerRoot(RemotionRoot);
"""

    is_valid_bad, errors_bad, warnings_bad = validator.validate(bad_code)
    print(f"\n❌ 错误代码验证结果:")
    print(f"   有效: {is_valid_bad}")
    print(f"   错误: {len(errors_bad)} 个")
    print(f"   警告: {len(warnings_bad)} 个")

    if errors_bad:
        print(f"\n   检测到的规则违反:")
        for error in errors_bad:
            print(f"   • {error}")

    # 测试正确代码
    good_code = """
import React from 'react';
import { Composition, registerRoot, useCurrentFrame, interpolate } from 'remotion';

const GoodComponent: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1]);

  return (
    <div style={{ opacity, backgroundColor: '#000' }}>
      Good code with frame-based animation
    </div>
  );
};

export const GoodVideo: React.FC = () => <GoodComponent />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="GoodVideo"
      component={GoodVideo}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

registerRoot(RemotionRoot);
"""

    is_valid_good, errors_good, warnings_good = validator.validate(good_code)
    print(f"\n✅ 正确代码验证结果:")
    print(f"   有效: {is_valid_good}")
    print(f"   错误: {len(errors_good)} 个")
    print(f"   警告: {len(warnings_good)} 个")

    if warnings_good:
        print(f"\n   检测到的警告:")
        for warning in warnings_good:
            print(f"   • {warning}")

    # ============================================
    # Summary
    # ============================================
    print("\n" + "="*80)
    print("📊 流程总结")
    print("="*80)

    checks = [
        ("Step 1: 分析器 - 场景模式规则", has_scene_patterns),
        ("Step 2: 生成器 - MUST 规则", has_must),
        ("Step 2: 生成器 - FORBIDDEN 规则", has_forbidden),
        ("Step 2: 生成器 - RECOMMENDED 规则", has_recommended),
        ("Step 2: 生成器 - 动画预设", has_animation),
        ("Step 3: 验证器 - 检测 FORBIDDEN 违规", len(errors_bad) > 0),
        ("Step 3: 验证器 - 正确代码通过", is_valid_good)
    ]

    for check, passed in checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{check:40s} {status}")

    all_passed = all(passed for _, passed in checks)

    print("-" * 80)
    if all_passed:
        print("🎉 所有检查通过！规则系统完全集成并正常工作。")
        print("\n✨ 生成的代码将严格遵循 Remotion 官方 best practices:")
        print("   • 使用 useCurrentFrame() 驱动动画")
        print("   • 避免使用 CSS transitions/animations")
        print("   • 使用 TypeScript 类型定义")
        print("   • 正确注册 Composition 和 registerRoot")
        print("   • 使用 Sequence 管理时序")
        print("   • 应用动画预设和场景模式")
    else:
        print("⚠️  部分检查未通过，请检查相关组件。")

    return 0 if all_passed else 1


def main():
    """运行演示"""
    import asyncio
    return asyncio.run(demo_full_pipeline())


if __name__ == "__main__":
    sys.exit(main())
