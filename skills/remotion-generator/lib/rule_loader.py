"""
规则加载器 - 从 rules/ 目录加载 Markdown 规则文件
"""

from pathlib import Path
from typing import List, Dict, Optional
import re


class RuleLoader:
    """
    加载 rules/ 目录下的 Markdown 规则文件

    用法：
        loader = RuleLoader()
        must_rules = loader.get_must_rules()
        all_rules = loader.get_all_rules()
    """

    def __init__(self, rules_dir: Optional[str] = None):
        """
        初始化规则加载器

        Args:
            rules_dir: 规则目录路径，默认为 "rules"
        """
        if rules_dir is None:
            # 默认相对于当前文件的 rules 目录
            current_file = Path(__file__)
            self.rules_dir = current_file.parent.parent / "rules"
        else:
            self.rules_dir = Path(rules_dir)

        # 验证目录存在
        if not self.rules_dir.exists():
            raise FileNotFoundError(f"Rules directory not found: {self.rules_dir}")

    def load_rule(self, rule_name: str) -> str:
        """
        加载单个规则文件

        Args:
            rule_name: 规则文件名（不含 .md 扩展名）

        Returns:
            规则文件的内容字符串

        Raises:
            FileNotFoundError: 规则文件不存在
        """
        rule_path = self.rules_dir / f"{rule_name}.md"

        if not rule_path.exists():
            raise FileNotFoundError(
                f"Rule file not found: {rule_path}\n"
                f"Available rules: {self.list_available_rules()}"
            )

        try:
            with open(rule_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return content
        except Exception as e:
            raise RuntimeError(f"Error loading rule {rule_name}: {str(e)}")

    def load_rules(self, rule_names: List[str]) -> str:
        """
        加载并合并多个规则文件

        Args:
            rule_names: 规则文件名列表（不含 .md 扩展名）

        Returns:
            合并后的规则内容，用分隔符分开
        """
        rules = []
        for name in rule_names:
            try:
                content = self.load_rule(name)
                rules.append(content)
            except FileNotFoundError as e:
                # 添加错误信息而不是中断
                rules.append(f"# Error loading rule: {name}\n\n{str(e)}")

        return "\n\n---\n\n".join(rules)

    def get_must_rules(self) -> str:
        """
        获取包含 MUST 规则的所有文件内容

        Returns:
            合并后的 MUST 规则内容
        """
        must_rule_files = []
        for rule_file in self.rules_dir.glob("*.md"):
            content = rule_file.read_text(encoding='utf-8')
            if "MUST" in content:
                must_rule_files.append(rule_file.stem)

        return self.load_rules(must_rule_files)

    def get_forbidden_rules(self) -> str:
        """
        获取包含 FORBIDDEN 规则的所有文件内容

        Returns:
            合并后的 FORBIDDEN 规则内容
        """
        forbidden_rule_files = []
        for rule_file in self.rules_dir.glob("*.md"):
            content = rule_file.read_text(encoding='utf-8')
            if "FORBIDDEN" in content:
                forbidden_rule_files.append(rule_file.stem)

        return self.load_rules(forbidden_rule_files)

    def get_recommended_rules(self) -> str:
        """
        获取包含 RECOMMENDED 规则的所有文件内容

        Returns:
            合并后的 RECOMMENDED 规则内容
        """
        recommended_rule_files = []
        for rule_file in self.rules_dir.glob("*.md"):
            content = rule_file.read_text(encoding='utf-8')
            if "RECOMMENDED" in content:
                recommended_rule_files.append(rule_file.stem)

        return self.load_rules(recommended_rule_files)

    def get_animation_rules(self) -> str:
        """
        获取与动画相关的规则文件内容

        Returns:
            合并后的动画规则内容
        """
        animation_rule_files = ["animations", "timing", "transitions"]
        return self.load_rules(animation_rule_files)

    def get_scene_rules(self) -> str:
        """
        获取与场景相关的规则文件内容

        Returns:
            合并后的场景规则内容
        """
        scene_rule_files = ["compositions", "sequencing", "trimming"]
        return self.load_rules(scene_rule_files)

    def get_all_rules(self) -> str:
        """
        获取所有规则

        Returns:
            合并后的所有规则内容
        """
        all_rule_files = [f.stem for f in self.rules_dir.glob("*.md") if not f.name.startswith('_')]
        return self.load_rules(all_rule_files)

    def list_available_rules(self) -> List[str]:
        """
        列出所有可用的规则文件

        Returns:
            规则文件名列表（不含 .md 扩展名）
        """
        try:
            return [
                f.stem for f in self.rules_dir.glob("*.md")
                if not f.name.startswith('_')  # 排除隐藏文件
            ]
        except Exception:
            return []

    def get_rule_info(self, rule_name: str) -> Dict[str, str]:
        """
        获取规则文件的元信息

        从规则文件中提取标题和第一级标题

        Args:
            rule_name: 规则文件名（不含 .md 扩展名）

        Returns:
            包含 title 和 headings 的字典
        """
        content = self.load_rule(rule_name)

        # 提取主标题（第一个 # 标题）
        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        title = title_match.group(1) if title_match else rule_name

        # 提取所有二级标题
        headings = re.findall(r'^##\s+(.+)$', content, re.MULTILINE)

        return {
            "title": title,
            "headings": headings,
            "word_count": len(content.split())
        }


# 便捷函数
def load_rule(rule_name: str, rules_dir: Optional[str] = None) -> str:
    """
    快捷加载单个规则文件

    Args:
        rule_name: 规则文件名（不含 .md 扩展名）
        rules_dir: 规则目录路径，默认为 "rules"

    Returns:
        规则文件的内容字符串
    """
    loader = RuleLoader(rules_dir)
    return loader.load_rule(rule_name)


def load_all_rules(rules_dir: Optional[str] = None) -> str:
    """
    快捷加载所有规则文件

    Args:
        rules_dir: 规则目录路径，默认为 "rules"

    Returns:
        合并后的所有规则内容
    """
    loader = RuleLoader(rules_dir)
    return loader.get_all_rules()


if __name__ == "__main__":
    # 测试代码
    import sys

    print("=== Rule Loader Test ===\n")

    try:
        loader = RuleLoader()

        print(f"Rules directory: {loader.rules_dir}")
        print(f"\nAvailable rules: {loader.list_available_rules()}")
        print(f"\nTotal rules: {len(loader.list_available_rules())}")

        # 测试加载单个规则
        print("\n=== Testing load_rule ===")
        must_rules = loader.load_rule("must-rules")
        print(f"Must rules loaded: {len(must_rules)} characters")
        print(f"First 200 chars:\n{must_rules[:200]}...")

        # 测试获取核心规则
        print("\n=== Testing get_core_rules ===")
        core_rules = loader.get_core_rules()
        print(f"Core rules loaded: {len(core_rules)} characters")

        # 测试获取规则信息
        print("\n=== Testing get_rule_info ===")
        info = loader.get_rule_info("must-rules")
        print(f"Title: {info['title']}")
        print(f"Headings: {info['headings']}")
        print(f"Word count: {info['word_count']}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
