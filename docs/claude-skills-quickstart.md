# Claude Skills 快速入门指南

## 什么是 Claude Skills？

Claude Skills 是 Claude Code 的插件系统，允许你为 AI 助手定义可重用的技能。Motia 框架已经集成了 Claude Skills，让你的 Agent 能够自动发现和执行这些技能。

## 当前可用的 Skills

### UI/UX Pro Max
- **功能**: UI/UX 设计智能助手
- **能力**:
  - 50+ 种设计风格（glassmorphism, minimalism, dark mode 等）
  - 21 种配色方案
  - 50 种字体配对
  - 支持 React, Next.js, Vue, Svelte, SwiftUI, Flutter 等框架
  - 支持设计按钮、卡片、表单、导航栏等组件

## 快速开始

### 1. 运行基本测试

```bash
python examples/test_skill_selection.py
```

这个脚本会：
- 扫描所有可用的 skills
- 演示自动选择机制
- 执行选中的 skill

### 2. 运行 Agent 集成演示

```bash
# 演示模式（预设对话）
python examples/agent_skill_integration_demo.py

# 交互式模式（你可以自己输入任务）
python examples/agent_skill_integration_demo.py --interactive
```

## 使用示例

### 示例 1: 设计登录页面

```python
from src.core.skill import create_executor_with_claude_skills
import asyncio

async def design_login_page():
    # 创建 executor
    executor = await create_executor_with_claude_skills(
        claude_skills_paths=['.claude/skills']
    )

    # 执行 UI 设计 skill
    result = await executor.execute(
        'ui-ux-pro-max',
        {
            'task': {
                'description': '设计一个现代化的登录页面'
            }
        }
    )

    if result.success:
        # result.output 包含完整的设计提示
        print(result.output)

asyncio.run(design_login_page())
```

### 示例 2: 在 Agent 中使用

```python
class MyAgent:
    def __init__(self):
        self.executor = None

    async def initialize(self):
        self.executor = await create_executor_with_claude_skills()

    async def handle_request(self, user_message: str):
        # 检查是否是 UI 设计任务
        if any(keyword in user_message.lower()
               for keyword in ['ui', 'design', '界面', '设计', 'frontend']):
            # 使用 UI/UX skill
            result = await self.executor.execute(
                'ui-ux-pro-max',
                {'task': {'description': user_message}}
            )
            return result.output

        # 其他处理...
```

## Skill 工作流程

```
用户请求
    ↓
关键词分析
    ↓
选择 Skill
    ↓
准备输入数据
    ↓
执行 Skill
    ↓
返回结果
    ↓
（可选）发送给 LLM 处理
```

## 常见任务关键词

### UI/UX 设计任务
使用 `ui-ux-pro-max` skill

**触发关键词**:
- ui, ux, design
- 界面, 设计
- frontend, 前端
- layout, 布局
- navigation, navbar, 导航
- button, modal, card
- form, 表单
- 登录页面, 注册页面
- 仪表板, dashboard
- color, style, font
- 响应式, responsive

**示例输入**:
```
"设计一个现代化的登录页面"
"创建一个响应式的导航栏"
"设计一个深色主题的仪表板"
"创建一个产品卡片组件"
```

## 如何添加新的 Claude Skills

### 方法 1: 使用现有 Claude Skills

直接将 `.md` 文件放到 `.claude/skills/` 目录：

```bash
# 复制你的 Claude Skill 文件
cp my-frontend-design.md .claude/skills/
```

系统会自动：
1. 扫描新文件
2. 解析元数据
3. 注册到 Virtual Registry
4. 可以被 executor 调用

### 方法 2: 创建 Motia Native Skill

在 `skills/` 目录创建 skill：

```
skills/
├── my-skill/
│   ├── skill.yaml      # Skill 配置
│   └── handler.py      # 实现代码
```

示例 `skill.yaml`:
```yaml
name: my-skill
version: 1.0.0
description: 我的自定义技能
type: pure-script
execution:
  handler: handler.py
  function: my_handler
```

## 技术架构

```
┌─────────────────────────────────────────────────┐
│              Agent / User Request               │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         Skill Selection Logic                   │
│  (关键词匹配 / Embedding / LLM)                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         SkillExecutor                           │
│  ┌─────────────────────────────────────────┐   │
│  │  SkillRegistry                          │   │
│  │  - Native Skills (skills/)              │   │
│  │  - Claude Skills (.claude/skills/)      │   │
│  └─────────────────────────────────────────┘   │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         Skill Execution                         │
│  - PURE_PROMPT: 返回提示模板                    │
│  - PURE_SCRIPT: 执行 Python 代码                │
│  - HYBRID: 混合模式                             │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│         Result                                  │
│  - success/error                                │
│  - output                                       │
│  - execution_time                               │
└─────────────────────────────────────────────────┘
```

## API 参考

### create_executor_with_claude_skills

创建支持 Claude Skills 的 executor：

```python
executor = await create_executor_with_claude_skills(
    skills_dir='skills/',              # Native skills 目录
    claude_skills_paths=['.claude/skills'],  # Claude skills 目录
    hooks=[],                          # Hooks（可选）
    notify_hook_api_url=None           # 通知 URL（可选）
)
```

### executor.execute

执行一个 skill：

```python
result = await executor.execute(
    skill_name='ui-ux-pro-max',
    input_data={
        'task': {
            'description': '任务描述',
            'context': {}  # 可选的上下文
        }
    }
)

# 检查结果
if result.success:
    print(result.output)
else:
    print(f"错误: {result.error}")
```

### executor.list_skills

列出所有可用的 skills：

```python
skills = executor.list_skills()
for skill in skills:
    print(f"{skill['name']}: {skill['description']}")
```

## 调试技巧

### 启用调试输出

系统会自动输出调试信息：

```
[DEBUG] SkillExecutor.execute: skill_name=ui-ux-pro-max
[DEBUG]   has_hooks_configured=False
[DEBUG]   hook_manager.hooks count=0
```

### 查看可用的 Skills

```python
from src.core.skill import list_all_skills

skills_info = await list_all_skills()
print(f"Native: {len(skills_info['native'])}")
print(f"Claude: {len(skills_info['claude'])}")
```

### 测试单个 Skill

```bash
# 使用测试脚本
python examples/test_skill_selection.py
```

## 故障排除

### 问题 1: Skill 未被发现

**症状**: 执行时提示 "Skill not found"

**解决方案**:
1. 检查文件路径是否正确
2. 确认 SKILL.md 文件格式正确
3. 查看扫描日志

### 问题 2: Skill 执行失败

**症状**: result.success = False

**解决方案**:
1. 查看 result.error 获取详细错误信息
2. 检查输入参数是否完整
3. 确认 skill 类型（PURE_PROMPT/PURE_SCRIPT/HYBRID）

### 问题 3: Skill 选择不准确

**症状**: 选择了错误的 skill

**解决方案**:
1. 调整关键词列表（`agent_skill_integration_demo.py`）
2. 改进匹配算法
3. 考虑使用 Embedding 进行语义匹配

## 最佳实践

### 1. 命名规范

- Skill 名称使用小写和连字符：`ui-ux-pro-max`
- 关键词包含中英文：`['design', '设计', '界面']`

### 2. 错误处理

```python
try:
    result = await executor.execute(skill_name, input_data)
    if result.success:
        # 处理成功结果
        pass
    else:
        # 处理错误
        print(f"Skill 执行失败: {result.error}")
except Exception as e:
    # 处理异常
    print(f"执行异常: {e}")
```

### 3. 性能优化

- executor 可以重复使用，不要每次请求都创建新的
- 使用 `execute_batch` 并行执行多个 skills

```python
results = await executor.execute_batch([
    {'skill_name': 'skill1', 'input_data': {...}},
    {'skill_name': 'skill2', 'input_data': {...}},
])
```

## 下一步

- 📖 阅读 [完整测试报告](./claude-skills-integration-test-report.md)
- 🔧 查看 [集成文档](./claude-skills-adapter.md)
- 🚀 开始构建你自己的 Agent！

---

**需要帮助？**

- 查看示例代码: `examples/`
- 阅读测试用例了解用法
- 检查日志输出进行调试
