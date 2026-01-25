# Skill 进度报告使用指南

本指南介绍如何在 Skill 中使用 `SkillExecutionContext` 报告执行进度。

## 概述

进度报告系统允许 Skill 在执行过程中向 Hook 和前端发送实时进度更新。

### 架构流程

```
Skill Handler
    ↓
context.report_step("Processing...")
    ↓
SkillExecutionContext.report_step()
    ↓
progress_reporter (callable)
    ↓
Hook.on_progressing_notify()
    ↓
Notify API (前端)
```

## 如何使用

### 1. 在 Skill Handler 中接收 Context

修改你的 skill handler 函数签名，添加 `context` 参数：

```python
from typing import Dict, Any, Optional
from src.core.skill.context import SkillExecutionContext

async def execute(
    input_data: Dict[str, Any],
    context: Optional[SkillExecutionContext] = None  # 添加 context 参数
) -> Dict[str, Any]:
    # 你的 skill 逻辑
    pass
```

### 2. 报告进度

使用 context 提供的便捷方法报告不同类型的进度：

```python
async def execute(input_data, context=None):
    # 报告步骤进度
    if context:
        await context.report_step("开始处理数据...")

    # 执行一些工作
    await process_data(input_data)

    # 报告另一个步骤
    if context:
        await context.report_step("处理完成，生成结果...")

    return {"success": True, "data": "..."}
```

### 3. 可用的进度报告方法

#### `report_step(message, **extra_data)`
报告执行步骤（最常用）

```python
await context.report_step("正在搜索...", query=query)
```

#### `report_heartbeat(**data)`
发送心跳信号（用于长时间运行的任务）

```python
await context.report_heartbeat(alive=True)
```

#### `report_status(status, **data)`
报告状态变化

```python
await context.report_status("processing", percent_complete=50)
await context.report_status("completed", result_count=100)
```

#### `report_chat(message, **data)`
报告聊天消息（用于对话式 skill）

```python
await context.report_chat("已找到 5 个结果")
```

### 4. 在 Hook 中处理进度

Hook 可以通过 `on_progressing_notify` 方法接收并处理进度：

```python
class MyHook(BaseHook):
    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """处理进度通知"""
        progress_type = progress_data.get("type")
        message = progress_data.get("message")

        print(f"[Progress] {progress_type}: {message}")

        # 可以修改进度数据
        progress_data["timestamp"] = time.time()

        return progress_data  # 返回修改后的数据
```

## 完整示例

### Skill Handler 示例

```python
# skills/my-skill/handler.py
from typing import Dict, Any, Optional
from src.core.skill.context import SkillExecutionContext
import asyncio

async def execute(
    input_data: Dict[str, Any],
    context: Optional[SkillExecutionContext] = None
) -> Dict[str, Any]:
    """执行长时间运行的任务并报告进度"""

    query = input_data.get("query")

    # 步骤 1: 开始
    if context:
        await context.report_step(f"开始处理: {query}")

    # 模拟工作
    await asyncio.sleep(1)

    # 步骤 2: 处理中
    if context:
        await context.report_step(f"分析数据中...")

    await asyncio.sleep(1)

    # 步骤 3: 完成
    if context:
        await context.report_step(f"处理完成")
        await context.report_status("completed", items_processed=10)

    return {
        "success": True,
        "results": ["item1", "item2"]
    }
```

### Hook 示例

```python
# skills/my-skill/hook.py
from src.core.skill.hooks.base import BaseHook, SkillContext
from typing import Dict, Any

class ProgressLoggerHook(BaseHook):
    """记录所有进度更新"""

    async def on_progressing_notify(
        self,
        context: SkillContext,
        progress_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """记录进度"""
        print(f"[{context.skill_name}] {progress_data.get('type')}: {progress_data.get('message')}")

        # 不修改数据
        return {}
```

### 使用示例

```python
from src.core.skill.executor import SkillExecutor
from skills.my_skill.hook import ProgressLoggerHook

# 创建 executor
executor = SkillExecutor(
    skills_dir='skills/',
    hook=ProgressLoggerHook(),
    notify_api_url="http://localhost:3000/api/notify"
)

# 执行 skill（会自动报告进度）
result = await executor.execute(
    skill_name="my-skill",
    input_data={"query": "test"},
    context_params={
        "task_id": "task-123",
        "session_id": "session-456"
    }
)

# 输出：
# [my-skill] step: 开始处理: test
# [my-skill] step: 分析数据中...
# [my-skill] step: 处理完成
# [my-skill] status: completed
```

## 向后兼容性

**Context 参数是完全可选的！**

现有的 skill handler 不需要修改就能继续工作：

```python
# 旧版本（没有 context）
async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    return {"success": True}

# 新版本（有 context）
async def execute(
    input_data: Dict[str, Any],
    context: Optional[SkillExecutionContext] = None
) -> Dict[str, Any]:
    if context:
        await context.report_step("Processing...")
    return {"success": True}
```

SkillExecutor 会自动检测 handler 函数的签名，只在其接受 context 参数时才传递。

## 最佳实践

### 1. 总是检查 context 是否存在

```python
# ✅ 好的做法
if context:
    await context.report_step("Processing...")

# ❌ 不好的做法
await context.report_step("Processing...")  # 可能为 None
```

### 2. 只报告有意义的进度

```python
# ✅ 好的做法：报告关键步骤
await context.report_step("开始搜索")
# ... 执行搜索
await context.report_step(f"找到 {len(results)} 个结果")

# ❌ 不好的做法：报告太多细节
for i, item in enumerate(items):
    await context.report_step(f"处理 item {i}")  # 太频繁
```

### 3. 使用合适的进度类型

- **step**: 执行步骤（推荐用于大多数情况）
- **heartbeat**: 长时间任务的存活信号
- **status**: 状态变化（开始、完成、错误等）
- **chat**: 对话消息（聊天类 skill）

### 4. 在 Hook 中不要阻塞进度处理

```python
async def on_progressing_notify(self, context, progress_data):
    # ✅ 好的做法：快速处理
    logger.info(f"Progress: {progress_data}")

    # ❌ 不好的做法：执行耗时操作
    await slow_database_operation(progress_data)  # 会阻塞 skill 执行
```

## 高级用法

### 自定义进度聚合

```python
class ProgressAggregatorHook(BaseHook):
    """聚合多个进度更新"""

    def __init__(self):
        self.progress_buffer = []

    async def on_progressing_notify(self, context, progress_data):
        # 缓存进度
        self.progress_buffer.append(progress_data)

        # 每10个进度发送一次聚合
        if len(self.progress_buffer) >= 10:
            await self.send_aggregated_progress()

        return {}
```

### 条件进度报告

```python
async def execute(input_data, context=None):
    # 只在特定条件下报告详细进度
    verbose = input_data.get("verbose", False)

    if context and verbose:
        await context.report_step("详细模式：开始处理")
    elif context:
        await context.report_step("处理中...")

    # ...
```

## 故障排查

### Q: Skill 报告的进度没有到达前端？

A: 检查以下几点：
1. SkillExecutor 是否传入了 `notify_api_url`？
2. Hook 的 `on_progressing_notify` 是否返回了数据？
3. Notify API 是否正常运行？

### Q: Context 参数导致现有的 skill 报错？

A: 不会。Context 是可选参数，SkillExecutor 会自动检测 handler 是否接受该参数。

### Q: 如何测试进度报告？

A: 使用 mock context 和 hook：

```python
class MockContext:
    progress_calls = []

    async def report_step(self, message, **data):
        self.progress_calls.append(("step", message, data))

async def test_skill_progress():
    context = MockContext()
    result = await execute({"query": "test"}, context=context)
    assert len(context.progress_calls) > 0
```

## 相关文档

- [Hook 开发指南](hook-development-guide.md)
- [Skill Hook System Design](../design/skill-hook-system.md)
- [Skill Context API](../api/context.md)

---

**最后更新**: 2025-01-24
**维护者**: Motia Team
