# Hook 开发指南

本指南介绍如何在 Motia 框架中为 Skill 创建和使用 Hook。

## 目录

- [什么是 Hook？](#什么是-hook)
- [Hook 执行流程](#hook-执行流程)
- [创建自定义 Hook](#创建自定义-hook)
- [Hook 最佳实践](#hook-最佳实践)
- [完整示例](#完整示例)
- [测试 Hook](#测试-hook)

---

## 什么是 Hook？

Hook 是一种在 Skill 执行前后注入自定义逻辑的机制。通过 Hook，你可以：

- **验证输入**：在 Skill 执行前验证参数
- **修改数据**：预处理输入或后处理输出
- **中断执行**：在特定条件下停止 Skill 执行
- **添加元数据**：为执行结果添加额外的上下文信息
- **进度通知**：自定义 Skill 执行过程中的进度报告

### Hook 类型

1. **pre_exec**：在 Skill 执行前调用
2. **post_exec**：在 Skill 执行后调用
3. **on_progressing_notify**：在 Skill 执行过程中报告进度时调用（可选）

---

## Hook 执行流程

```
输入数据 → pre_exec → [检查是否中断]
                    ↓ 是 → 返回错误
                    ↓ 否
                 → Skill 执行 → post_exec → 返回结果
```

---

## 创建自定义 Hook

### 1. 定义 Hook 类

创建一个继承自 `BaseHook` 的类：

```python
from core.skill.hooks.base import BaseHook, SkillContext, HookResult, HookResultAction
from typing import Dict, Any, Optional

class MyCustomHook(BaseHook):
    """自定义 Hook 示例"""

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """
        在 Skill 执行前调用
        """
        # 获取输入数据
        input_data = context.input_data

        # 示例 1: 验证输入
        if not input_data.get("required_field"):
            return HookResult(
                action=HookResultAction.STOP,
                reason="缺少必需字段: required_field"
            )

        # 示例 2: 修改输入
        if input_data.get("value", 0) < 0:
            # 将负数转换为正数
            modified = input_data.copy()
            modified["value"] = abs(modified["value"])
            return HookResult(
                action=HookResultAction.CONTINUE,
                modified_input=modified
            )

        # 继续执行
        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        在 Skill 执行后调用
        """
        # 只处理成功的结果
        if result.get("success"):
            # 添加自定义元数据
            result["metadata"] = result.get("metadata", {})
            result["metadata"]["processed_by_hook"] = True
            result["metadata"]["hook_timestamp"] = context.execution_start_time

        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        进度通知（可选）
        """
        # 可以在这里记录日志或修改进度数据
        print(f"Progress: {progress_data.get('message', 'No message')}")
        return {}  # 返回空字典或修改后的进度数据
```

### 2. 在 Skill Handler 中使用 Hook

#### 方式 1: 直接集成到 Handler

```python
# skills/my-skill/handler.py

import os
import importlib.util
from pathlib import Path
from typing import Dict, Any

# 导入 Hook 相关类
from core.skill.hooks.executor import SkillHookExecutor

# 导入 Hook（使用 importlib 处理带连字符的目录名）
hook_path = Path(__file__).parent / "hook.py"
hook_spec = importlib.util.spec_from_file_location("my_skill_hook", hook_path)
hook_module = importlib.util.module_from_spec(hook_spec)
hook_spec.loader.exec_module(hook_module)
MySkillHook = hook_module.MySkillHook

# 全局 executor 实例
_executor: SkillHookExecutor = None

def _get_executor() -> SkillHookExecutor:
    """获取或创建 Hook executor"""
    global _executor
    if _executor is None:
        notify_api_url = os.getenv("MOTIA_NOTIFY_API_URL")
        hook = MySkillHook()
        _executor = SkillHookExecutor(hook=hook, notify_api_url=notify_api_url)
    return _executor

async def _skill_logic(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    实际的 Skill 逻辑（不包含 Hook）
    """
    # 你的 Skill 实现逻辑
    result = await do_something(input_data)
    return {"success": True, "data": result}

async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Skill 入口函数（带 Hook）
    """
    executor = _get_executor()
    return await executor.execute_with_hooks(
        skill_name="my-skill",
        skill_func=_skill_logic,
        input_data=input_data
    )
```

#### 方式 2: 使用环境变量配置

在环境变量中设置 Notify API URL：

```bash
export MOTIA_NOTIFY_API_URL="http://localhost:3000/api/notify"
```

---

## Hook 最佳实践

### 1. 验证逻辑放在 pre_exec

```python
async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
    # ✅ 好的做法：提前验证
    if not context.input_data.get("api_key"):
        return HookResult(
            action=HookResultAction.STOP,
            reason="API key is required"
        )
    return None
```

### 2. 修改数据使用 HookResult

```python
async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
    # ✅ 好的做法：通过 modified_input 修改
    if context.input_data.get("format") != "json":
        modified = context.input_data.copy()
        modified["format"] = "json"
        return HookResult(
            action=HookResultAction.CONTINUE,
            modified_input=modified
        )
    return None
```

### 3. Post_exec 只处理成功的情况

```python
async def post_exec(
    self,
    context: SkillContext,
    result: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    # ✅ 好的做法：检查成功状态
    if not result.get("success"):
        return result  # 失败时不修改

    # 只处理成功的结果
    result["metadata"] = result.get("metadata", {})
    result["metadata"]["hook_processed"] = True
    return result
```

### 4. 避免在 Hook 中执行耗时操作

```python
async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
    # ❌ 不好的做法：在 Hook 中执行长时间 API 调用
    # api_result = await slow_api_call()  # 不要这样做！

    # ✅ 好的做法：只做快速验证
    if not context.input_data.get("token"):
        return HookResult(action=HookResultAction.STOP, reason="No token")
    return None
```

### 5. 使用 Hook 添加有用的元数据

```python
async def post_exec(
    self,
    context: SkillContext,
    result: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    if result.get("success"):
        result.setdefault("metadata", {}).update({
            "version": "1.0.0",
            "processed_at": context.execution_start_time,
            "skill_name": context.skill_name
        })
    return result
```

---

## 完整示例

### WebSearch Hook 示例

```python
# skills/web-search/hook.py
from core.skill.hooks.base import BaseHook, SkillContext, HookResult, HookResultAction

class WebSearchHook(BaseHook):
    """WebSearch Skill 的 Hook"""

    MIN_QUERY_LENGTH = 3

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """验证搜索查询"""
        query = context.input_data.get("query", "")

        # 验证查询长度
        if len(query) < self.MIN_QUERY_LENGTH:
            return HookResult(
                action=HookResultAction.STOP,
                reason=f"查询太短（最少 {self.MIN_QUERY_LENGTH} 个字符）"
            )

        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """添加搜索元数据"""
        if result.get("success"):
            result.setdefault("metadata", {})["hook_processed"] = True
        return result

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """处理进度通知（可选）"""
        return {}  # 不修改进度数据
```

---

## 测试 Hook

### 单元测试示例

```python
# tests/unit/skills/hooks/test_web_search_hook.py
import pytest
from core.skill.hooks.base import SkillContext, HookResultAction

class TestWebSearchHook:
    """WebSearch Hook 单元测试"""

    @pytest.fixture
    def hook(self):
        from skills.web_search.hook import WebSearchHook
        return WebSearchHook()

    @pytest.fixture
    def context(self):
        return SkillContext(
            skill_name="web-search",
            task_id="test-123",
            session_id="session-456",
            input_data={},
            metadata={},
            execution_start_time=0.0
        )

    @pytest.mark.asyncio
    async def test_valid_query_passes(self, hook, context):
        """测试有效查询通过验证"""
        context.input_data = {"query": "Python programming"}

        result = await hook.pre_exec(context)

        assert result is None  # None 表示继续执行

    @pytest.mark.asyncio
    async def test_short_query_blocked(self, hook, context):
        """测试短查询被拦截"""
        context.input_data = {"query": "py"}

        result = await hook.pre_exec(context)

        assert result.action == HookResultAction.STOP
        assert "太短" in result.reason

    @pytest.mark.asyncio
    async def test_post_exec_adds_metadata(self, hook, context):
        """测试 post_exec 添加元数据"""
        result = {"success": True, "data": "results"}

        modified = await hook.post_exec(context, result)

        assert modified["metadata"]["hook_processed"] is True
```

### 集成测试示例

```python
# tests/integration/skills/test_web_search_handler.py
import pytest

class TestWebSearchHandlerIntegration:
    """WebSearch Handler 集成测试"""

    @pytest.mark.asyncio
    async def test_hook_validates_query(self):
        """测试 Hook 验证查询"""
        from skills.web_search.handler import execute

        # 短查询应该被拦截
        result = await execute({"query": "ab"})
        assert result.get("success") is False

    @pytest.mark.asyncio
    async def test_hook_allows_valid_query(self):
        """测试 Hook 允许有效查询"""
        from skills.web_search.handler import execute

        # 有效查询应该通过
        result = await execute({"query": "Python programming"})
        assert "error" not in result
```

---

## 常见问题

### Q: Hook 可以抛出异常吗？

A: 可以，但不建议。Hook 中的异常会被捕获并记录为警告，不会中断 Skill 执行。更好的做法是返回 `HookResult(action=HookResultAction.STOP, reason="...")`。

### Q: 如何在多个 Skill 间共享 Hook？

A: 将共享的 Hook 放在 `src/core/skill/hooks/common/` 目录中，然后在各个 Skill 中导入使用。

### Q: Hook 可以访问数据库吗？

A: 技术上可以，但建议只在 pre_exec 中做快速查询。对于耗时操作，应该在 Skill 逻辑中处理。

### Q: 如何禁用某个 Hook？

A: 使用 `NoOpHook` 替代：
```python
from core.skill.hooks.base import NoOpHook

executor = SkillHookExecutor(hook=NoOpHook())
```

---

## 相关文档

- [Skill Hook System Design](../design/skill-hook-system.md)
- [Multi-turn Conversation System](../design/multi-turn-conversation-system.md)
- [Motia Framework Guides](../../../.cursor/rules/motia/)

---

**最后更新**: 2025-01-24
**维护者**: Motia Team
