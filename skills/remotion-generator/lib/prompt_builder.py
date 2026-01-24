"""
Prompt 构建器 - 将规则文件集成到 LLM prompt 中

这个模块展示如何在实际的生成流程中使用规则加载器
"""

from typing import Dict, Any, Optional
import yaml
from pathlib import Path

from .rule_loader import RuleLoader


class PromptBuilder:
    """
    构建 LLM prompt，集成规则文件

    用法：
        builder = PromptBuilder()
        prompt = builder.build_prompt({
            "description": "生成一个泰勒公式的教学视频",
            "duration": 15,
            "fps": 30,
            "resolution": "1920x1080",
            "style": "presentation"
        })
    """

    def __init__(self, skill_yaml_path: Optional[str] = None, rules_dir: Optional[str] = None):
        """
        初始化 Prompt Builder

        Args:
            skill_yaml_path: skill.yaml 文件路径
            rules_dir: rules 目录路径
        """
        if skill_yaml_path is None:
            # 默认路径
            current_file = Path(__file__)
            skill_yaml_path = current_file.parent.parent / "skill.yaml"

        self.skill_yaml_path = Path(skill_yaml_path)
        self.rule_loader = RuleLoader(rules_dir)

        # 加载 skill.yaml
        with open(self.skill_yaml_path, 'r', encoding='utf-8') as f:
            self.skill_config = yaml.safe_load(f)

    def build_prompt(self, params: Dict[str, Any]) -> str:
        """
        构建完整的 prompt，包括规则

        Args:
            params: 参数字典，包含 description, duration, fps 等

        Returns:
            完整的 prompt 字符串
        """
        # 获取 prompt_template
        prompt_template = self.skill_config.get('prompt_template', '')

        # 加载规则
        must_rules = self.rule_loader.load_rule("must-rules")
        forbidden_rules = self.rule_loader.load_rule("forbidden-rules")
        recommended_rules = self.rule_loader.load_rule("recommended-rules")
        animation_presets = self.rule_loader.load_rule("animation-presets")
        scene_patterns = self.rule_loader.load_rule("scene-patterns")

        # 计算总帧数
        duration = params.get('duration', 10)
        fps = params.get('fps', 30)
        total_frames = duration * fps

        # 解析分辨率
        resolution = params.get('resolution', '1920x1080')
        width, height = resolution.split('x') if 'x' in resolution else (1920, 1080)

        # 替换占位符
        prompt = prompt_template

        # 替换规则占位符
        prompt = prompt.replace("{{MUST_RULES}}", must_rules)
        prompt = prompt.replace("{{FORBIDDEN_RULES}}", forbidden_rules)
        prompt = prompt.replace("{{RECOMMENDED_RULES}}", recommended_rules)
        prompt = prompt.replace("{{ANIMATION_PRESETS}}", animation_presets)
        prompt = prompt.replace("{{SCENE_PATTERNS}}", scene_patterns)

        # 替换参数占位符
        prompt = prompt.replace("{{description}}", params.get('description', ''))
        prompt = prompt.replace("{{duration}}", str(duration))
        prompt = prompt.replace("{{fps}}", str(fps))
        prompt = prompt.replace("{{total_frames}}", str(total_frames))
        prompt = prompt.replace("{{resolution}}", resolution)
        prompt = prompt.replace("{{width}}", str(width))
        prompt = prompt.replace("{{height}}", str(height))
        prompt = prompt.replace("{{style}}", params.get('style', 'minimal'))
        prompt = prompt.replace("{{output_format}}", params.get('output_format', 'mp4'))
        prompt = prompt.replace("{{quality}}", params.get('quality', 'medium'))

        return prompt

    def build_prompt_from_params(self, **kwargs) -> str:
        """
        从关键字参数构建 prompt（便捷方法）

        用法：
            prompt = builder.build_prompt_from_params(
                description="生成一个泰勒公式的教学视频",
                duration=15,
                fps=30
            )
        """
        return self.build_prompt(kwargs)


# 便捷函数
def build_prompt(params: Dict[str, Any]) -> str:
    """
    快捷构建 prompt

    Args:
        params: 参数字典

    Returns:
        完整的 prompt 字符串
    """
    builder = PromptBuilder()
    return builder.build_prompt(params)


if __name__ == "__main__":
    # 测试代码
    import sys

    print("=== Prompt Builder Test ===\n")

    try:
        builder = PromptBuilder()

        # 测试参数
        test_params = {
            "description": "生成一个泰勒公式的教学视频，重点讲解多项式逼近",
            "duration": 15,
            "fps": 30,
            "resolution": "1920x1080",
            "style": "presentation",
            "output_format": "mp4",
            "quality": "medium"
        }

        print(f"Building prompt with params:")
        for key, value in test_params.items():
            print(f"  {key}: {value}")

        print("\n" + "="*80)
        prompt = builder.build_prompt(test_params)

        # 显示 prompt 的前 2000 个字符
        print("\n=== Generated Prompt (first 2000 chars) ===\n")
        print(prompt[:2000])
        print("\n...")

        # 显示 prompt 的统计信息
        print(f"\nTotal prompt length: {len(prompt)} characters")
        print(f"Estimated tokens: ~{len(prompt) // 4} tokens")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
