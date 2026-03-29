# Skill Hook System Design

## 概述

本文档描述了Motia框架的Skill Hook系统设计，用于在Skill执行前后和执行过程中注入自定义逻辑。

## 设计目标

1. **统一接口**：所有Hook继承同一个基类，实现一致的接口
2. **解耦架构**：Hook独立于Motia核心体系，Skill在Sandbox中执行
3. **进度通知**：支持Skill执行过程中的实时进度反馈到前端
4. **简化架构**：技能不需要专门配置Hook，避免过度设计

## 核心架构

### 1. Hook基类（Python SDK）

**文件位置**：`src/core/skill/hooks/base.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass
import asyncio

@dataclass
class SkillContext:
    """Skill执行上下文"""
    skill_name: str
    task_id: str
    session_id: str
    input_data: Dict[str, Any]
    metadata: Dict[str, Any]
    execution_start_time: float

class BaseHook(ABC):
    """Hook基类：所有Skill Hook都继承此类"""

    @abstractmethod
    async def pre_exec(self, context: SkillContext) -> Optional[Dict[str, Any]]:
        """
        Skill执行前调用

        返回值：
        - None或空字典：继续执行
        - {'stop': True, 'reason': '...'}：中断执行
        - {'modified_input': {...}}：修改输入数据

        用途：
        - 参数验证
        - 权限检查
        - 数据预处理
        - 日志记录
        """
        pass

    @abstractmethod
    async def post_exec(self, context: SkillContext, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Skill执行后调用

        参数：
        - context: 执行上下文
        - result: Skill的执行结果

        返回值：
        - None：不修改结果
        - 修改后的result字典

        用途：
        - 结果后处理
        - 数据格式转换
        - 元数据添加
        - 清理资源
        - 错误处理
        """
        pass

    async def on_progressing_notify(self, context: SkillContext, progress_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Skill执行过程中的进度通知（可选实现）

        默认实现不做任何事，子类可以重写此方法。

        参数：
        - context: 执行上下文
        - progress_data: 进度数据

        用途：
        - 自定义进度处理逻辑
        - 本地日志记录
        - 进度聚合
        """
        return {}
```

### 2. Skill执行器

**文件位置**：`src/core/skill/executor.py`

```python
import httpx
from typing import Callable, Optional
from src.core.skill.hooks.base import BaseHook, SkillContext

class SkillExecutor:
    """Skill执行器：集成Hook调用和进度通知"""

    def __init__(self, hook: Optional[BaseHook] = None, notify_api_url: Optional[str] = None):
        """
        初始化执行器

        参数：
        - hook: Hook实例
        - notify_api_url: Motia Notify API的URL（如 "http://localhost:3000/api/notify"）
        """
        self.hook = hook
        self.notify_api_url = notify_api_url
        self._http_client = None

    async def _notify_progress(self, task_id: str, progress_type: str, data: Dict[str, Any]):
        """
        通过Notify API发送进度到Motia

        参数：
        - task_id: 任务ID
        - progress_type: 进度类型（"step", "heartbeat", "status", "chat"）
        - data: 进度数据
        """
        if not self.notify_api_url:
            return

        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            response = await self._http_client.post(
                self.notify_api_url,
                json={
                    "taskId": task_id,
                    "type": progress_type,
                    "timestamp": asyncio.get_event_loop().time(),
                    **data
                }
            )
            response.raise_for_status()
        except Exception as e:
            # 静默失败，不影响主流程
            print(f"Warning: Failed to send progress notification: {e}")

    async def execute(
        self,
        skill_name: str,
        skill_func: Callable,
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        执行Skill并调用Hook

        参数：
        - skill_name: Skill名称
        - skill_func: Skill的主逻辑函数
        - input_data: 输入数据

        返回：
        - Skill执行结果
        """
        # 创建上下文
        context = SkillContext(
            skill_name=skill_name,
            task_id=input_data.get("task_id", ""),
            session_id=input_data.get("session_id", ""),
            input_data=input_data,
            metadata=input_data.get("metadata", {}),
            execution_start_time=asyncio.get_event_loop().time()
        )

        # 1. Pre-Exec Hook
        if self.hook:
            pre_result = await self.hook.pre_exec(context)
            if pre_result and pre_result.get('stop'):
                return {
                    "success": False,
                    "error": "Stopped by pre-hook",
                    "reason": pre_result.get('reason')
                }
            if pre_result and 'modified_input' in pre_result:
                input_data = pre_result['modified_input']

        # 2. 执行主逻辑
        try:
            result = await skill_func(input_data)
        except Exception as e:
            result = {"success": False, "error": str(e)}

        # 3. Post-Exec Hook
        if self.hook:
            post_result = await self.hook.post_exec(context, result)
            if post_result:
                result.update(post_result)

        return result

    async def report_progress(
        self,
        context: SkillContext,
        progress_type: str,
        data: Dict[str, Any]
    ):
        """
        Skill调用此方法报告进度

        参数：
        - context: 执行上下文
        - progress_type: 进度类型（"step", "heartbeat", "status", "chat"）
        - data: 进度数据
        """
        # 先调用Hook的回调（如果实现了）
        if self.hook:
            await self.hook.on_progressing_notify(context, data)

        # 然后发送到Motia的Notify API
        await self._notify_progress(context.task_id, progress_type, data)
```

### 3. Notify API Step（Motia体系）

**文件位置**：`steps/streams/notify-api.step.ts`

```typescript
import { z } from 'zod';

export const config = {
  type: 'api',
  name: 'notify-api',
  path: '/api/notify',
  method: 'POST',
  emits: [],
};

const notifySchema = z.object({
  taskId: z.string(),
  type: z.enum(['step', 'heartbeat', 'status', 'chat']),
  timestamp: z.number(),
  message: z.string().optional(),
  skill: z.string().optional(),
  data: z.any().optional(),
});

export const handler = async (request: any, { logger, streams }) => {
  try {
    const body = await request.json();
    const data = notifySchema.parse(body);

    // 通过Motia Stream发送到前端
    await streams.taskExecution.set(data.taskId, data.taskId, {
      type: data.type,
      timestamp: new Date(data.timestamp * 1000).toISOString(),
      message: data.message,
      skill: data.skill,
      data: data.data,
    });

    logger.info('Progress notification sent', {
      taskId: data.taskId,
      type: data.type
    });

    return {
      status: 200,
      body: { success: true },
    };
  } catch (error) {
    logger.error('Failed to send notification', { error });

    return {
      status: 500,
      body: { success: false, error: error.message },
    };
  }
};
```

### 4. 具体Hook实现示例

**文件位置**：`skills/web-search/hook.py`

```python
from typing import Dict, Any, Optional
from src.core.skill.hooks.base import BaseHook, SkillContext

class WebSearchHook(BaseHook):
    """WebSearch Skill的Hook实现"""

    async def pre_exec(self, context: SkillContext) -> Optional[Dict[str, Any]]:
        """执行前：验证搜索参数"""
        query = context.input_data.get("query", "")
        if len(query) < 3:
            return {
                "stop": True,
                "reason": "Query too short (minimum 3 characters)"
            }

        print(f"[WebSearchHook] Starting search for: {query}")
        return None

    async def post_exec(self, context: SkillContext, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """执行后：记录结果统计"""
        if result.get("success"):
            print(f"[WebSearchHook] Search completed successfully")
            # 添加额外元数据
            result["metadata"] = result.get("metadata", {})
            result["metadata"]["hook_processed"] = True
        else:
            print(f"[WebSearchHook] Search failed: {result.get('error')}")

        return result

    async def on_progressing_notify(self, context: SkillContext, progress_data: Dict[str, Any]) -> Dict[str, Any]:
        """进度通知：打印到控制台"""
        message = progress_data.get("message", "No message")
        print(f"[WebSearchHook] Progress: {message}")
        return {}
```

### 5. Skill Handler中使用Hook

**文件位置**：`skills/web-search/handler.py`

```python
from src.core.skill.executor import SkillExecutor
from skills.web-search.hook import WebSearchHook
from output_builder import OutputBuilder

async def search_web_logic(input_data: Dict[str, Any], executor: SkillExecutor) -> Dict[str, Any]:
    """实际的搜索逻辑"""
    query = input_data["query"]

    # 创建上下文用于进度报告
    from src.core.skill.hooks.base import SkillContext
    context = SkillContext(
        skill_name="web-search",
        task_id=input_data["task_id"],
        session_id=input_data.get("session_id", ""),
        input_data=input_data,
        metadata={},
        execution_start_time=0
    )

    # 步骤1：初始化
    await executor.report_progress(context, "step", {
        "message": "Initializing search...",
        "current_step": "init"
    })

    # 步骤2：执行搜索
    await executor.report_progress(context, "step", {
        "message": f"Searching for: {query}",
        "current_step": "searching"
    })

    results = await perform_search(query)

    # 步骤3：处理结果
    await executor.report_progress(context, "step", {
        "message": f"Processing {len(results)} results...",
        "current_step": "processing"
    })

    return {"results": results}

async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Skill入口函数"""

    # 创建Hook实例
    hook = WebSearchHook()

    # 创建执行器，传入notify API地址
    executor = SkillExecutor(
        hook=hook,
        notify_api_url=input_data.get("notify_api_url", "http://localhost:3000/api/notify")
    )

    # 执行搜索
    result = await executor.execute(
        skill_name="web-search",
        skill_func=lambda x: search_web_logic(x, executor),
        input_data=input_data
    )

    # 构建输出
    if result.get("success"):
        return OutputBuilder().set_result(result.get("results")).build()
    else:
        return OutputBuilder().set_error(result.get("error")).build()
```

### 6. YAML配置支持（可选）

**文件位置**：`skills/web-search/skill.yaml`

```yaml
name: web-search
version: 1.0.0
description: Search the web for information
tags: [web, research, search]

# Hook配置（可选）
hooks:
  pre:
    enabled: true
    validate_params: true
  post:
    enabled: true
    add_metadata: true
  progressing:
    enabled: true
    report_steps: true

execution:
  handler: handler.py
  function: execute
  timeout: 30000
```

## 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        Skill Handler (Python)                    │
│                                                                   │
│  ┌──────────────┐                                               │
│  │ WebSearchHook│                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │SkillExecutor │                                               │
│  └──────┬───────┘                                               │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ execute()
          │
          ├─────────┐
          │         │
          ▼         ▼
    ┌─────────┐  ┌──────────────┐
    │pre_exec │  │skill_func()  │
    └─────────┘  └──────┬───────┘
                         │
                         │ report_progress()
                         │
                         ▼
                  ┌─────────────┐
                  │HTTP POST    │
                  │/api/notify  │
                  └──────┬──────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │notify   │   │streams   │   │Frontend  │
    │API Step │   │.taskExec │   │UI        │
    └─────────┘   └──────────┘   └──────────┘
          │
          └─────────┐
                    │
                    ▼
              ┌─────────┐
              │post_exec│
              └─────────┘
```

## Hook粒度

### Skill级别Hook
- 作用域：单个Skill调用
- 配置位置：Skill的handler.py或skill.yaml
- 触发时机：Skill执行前后、执行中
- 实现语言：Python（在Sandbox中执行）
- 详细设计：参见本文档

### 任务级别Hook
- 作用域：整个Agent任务
- 配置位置：Agent配置或任务配置
- 触发时机：任务开始前、任务结束后、任务执行中
- 实现语言：TypeScript（在Motia体系中执行）
- 详细设计：参见 [Task Hook系统设计](./task-hook-system.md)

## 进度类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `step` | 关键步骤进展 | "开始调用web-search" |
| `heartbeat` | 保活信号 | 每30秒发送"仍在处理中" |
| `status` | 状态变化 | pending→running→completed |
| `chat` | 对话消息 | 用户提问或Agent回复 |

## 错误处理

1. **Hook错误不影响主流程**
   - PreHook错误：记录日志，默认继续执行
   - PostHook错误：记录日志，不修改结果
   - ProgressingHook错误：静默失败

2. **Notify API失败**
   - 不抛出异常，避免中断Skill执行
   - 记录警告日志

## 实现优先级

1. ✅ **Phase 1**: 实现Hook基类和SkillExecutor
2. ✅ **Phase 2**: 实现Notify API Step
3. ⏳ **Phase 3**: 在现有Skill中集成Hook
4. ⏳ **Phase 4**: 支持YAML配置

## 相关文档

- [Task Hook系统设计](./task-hook-system.md) - 任务级别的Hook系统
- [上下文工程设计](./context-engineering.md) - 多轮对话的上下文管理
- [Motia Event Steps](../../.cursor/rules/motia/event-steps.mdc)
- [Motia Streams](../../.cursor/rules/motia/realtime-streaming.mdc)
- [多轮对话系统](./multi-turn-conversation-system.md) - 整体系统设计
