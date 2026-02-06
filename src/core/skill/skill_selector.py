"""
Skill Selector - 自动为任务选择合适的 Skill

基于关键词匹配和语义分析，为用户任务自动选择最合适的 Claude Skill
"""

from typing import List, Dict, Optional, Any
from . import create_executor_with_claude_skills


class SkillSelector:
    """智能 Skill 选择器"""

    # 定义关键词到 skill 的映射
    SKILL_KEYWORDS = {
        'frontend-design': [
            'frontend', 'design', 'web', 'ui', 'ux', 'interface',
            '界面', '设计', '网页', '前端', 'component', 'page',
            'website', 'landing page', 'dashboard', 'react', 'html',
            'css', 'layout', '按钮', '表单', '导航', '卡片',
            '登录页面', '注册页面', '导航栏', '响应式', 'component',
            '页面', '应用', 'application', 'styling', 'beautifying'
        ],
        'text-counter': [
            'count', 'word count', 'character', 'line',
            '计数', '字数', '字符数', '行数', '统计'
        ],
        'mcp-builder': [
            'mcp', 'model context protocol', 'server', 'integration',
            'api', 'external service'
        ],
        'brand-guidelines': [
            'brand', 'anthropic', 'style guide', 'branding',
            '品牌', '风格', '规范'
        ],
        # Native skills
        'remotion-generator': [
            'video', 'remotion', '视频', '动画', 'animation'
        ],
        'infographic-generator': [
            'infographic', '图表', '信息图', 'chart', '可视化',
            'visualization', '数据可视化', '图表生成'
        ],
        'web-search': [
            'search', '搜索', '查找', 'google', 'web', '网上'
        ],
        'summarize': [
            'summarize', 'summary', '总结', '摘要', '概括',
            '简短', '概述'
        ],
        'code-analysis': [
            'analyze', '分析', 'code review', '代码审查', '代码分析'
        ],
        'read-file': [
            'read', '读取', 'file', '文件'
        ],
        'simple-code-generator': [
            'code', 'generator', 'generate', 'example', 'function', 'python',
            'javascript', 'typescript', 'java', 'go', 'rust', 'code snippet',
            '示例代码', '代码生成', '函数', '示例', 'using', 'simple-code',
            'binary search', '算法', 'algorithm'
        ],
    }

    def __init__(self):
        self.executor = None
        self._loaded = False

    async def initialize(self):
        """初始化 Skill Selector"""
        if self._loaded:
            return

        try:
            self.executor = await create_executor_with_claude_skills(
                skills_dir='skills/',
                claude_skills_paths=['claude_skills'],
                hooks=[]
            )
            await self.executor.ensure_loaded()
            self._loaded = True
        except Exception as e:
            print(f"[SkillSelector] Warning: Failed to initialize executor: {e}")
            self._loaded = False

    async def select_skill(self, task: str) -> Optional[str]:
        """
        为任务选择最合适的 skill

        Args:
            task: 任务描述

        Returns:
            选择的 skill 名称，如果没有匹配则返回 None
        """
        # 确保已初始化
        if not self._loaded:
            await self.initialize()

        if not self.executor:
            return None

        # 获取所有可用的 skills
        all_skills = self.executor.list_skills()

        # 计算每个 skill 的匹配分数
        best_match = None
        best_score = 0

        task_lower = task.lower()

        for skill_dict in all_skills:
            skill_name = skill_dict['name']
            skill_desc = skill_dict.get('description', '').lower()
            skill_tags = [tag.lower() for tag in skill_dict.get('tags', [])]

            # 获取该 skill 的关键词列表
            keywords = self.SKILL_KEYWORDS.get(skill_name, [])

            # 计算匹配分数
            score = 0

            # 检查任务描述中的关键词
            for keyword in keywords:
                if keyword in task_lower:
                    score += 1

            # 检查 skill 描述和标签的相关性
            if any(kw in skill_desc for kw in task_lower.split()):
                score += 0.5

            if skill_tags and any(kw in ' '.join(skill_tags) for kw in task_lower.split()):
                score += 0.5

            # 更新最佳匹配
            if score > best_score:
                best_score = score
                best_match = skill_name

        # 只有当分数大于 0 时才返回匹配
        return best_match if best_score > 0 else None

    async def select_and_describe(self, task: str) -> Dict[str, Any]:
        """
        选择 skill 并返回详细信息

        Args:
            task: 任务描述

        Returns:
            包含 skill 名称和描述的字典
        """
        selected_skill = await self.select_skill(task)

        if not selected_skill:
            return {
                'selected': False,
                'skill_name': None,
                'reason': 'No matching skill found for this task'
            }

        # 获取 skill 详细信息
        all_skills = self.executor.list_skills()
        skill_info = next(
            (s for s in all_skills if s['name'] == selected_skill),
            None
        )

        return {
            'selected': True,
            'skill_name': selected_skill,
            'description': skill_info.get('description', 'N/A') if skill_info else 'N/A',
            'type': skill_info.get('type', 'N/A') if skill_info else 'N/A',
            'reason': f'Task matches keywords for {selected_skill}'
        }


# 全局单例
_global_selector: Optional[SkillSelector] = None


async def get_skill_selector() -> SkillSelector:
    """获取全局 Skill Selector 实例"""
    global _global_selector
    if _global_selector is None:
        _global_selector = SkillSelector()
        await _global_selector.initialize()
    return _global_selector


async def auto_select_skill(task: str) -> Optional[str]:
    """
    快捷函数：自动选择 skill

    Args:
        task: 任务描述

    Returns:
        选择的 skill 名称，如果没有匹配则返回 None
    """
    selector = await get_skill_selector()
    return await selector.select_skill(task)
