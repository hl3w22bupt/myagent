"""
Context Hook for Skill and Tool execution.

专门处理与 TaskContext 相关的功能：
- 记录所有 Skill 执行（成功+失败）到 skillExecutionHistory
- 记录所有 Tool 使用（成功+失败）到 toolUsageHistory
- 从失败执行中提炼失败经验到 errorsAndSolutions
- 用户画像更新（后续扩展）

职责：
- trace_hook.py: 执行追踪和 trace 数据收集
- context_hook.py: 上下文管理和持久化
"""

import time
import httpx
import json
import os
from datetime import datetime
from typing import Optional, Dict, Any
from .base import BaseHook, SkillContext, HookResult


class ContextHook(BaseHook):
    """
    Context-level hook for managing TaskContext during skill execution.

    功能：
    1. 记录所有 Skill 执行到 TaskContext.skillExecutionHistory
    2. 记录所有 Tool 使用到 TaskContext.toolUsageHistory
    3. 从失败执行中提炼失败经验到 errorsAndSolutions
    """

    def __init__(self, context_api_url: Optional[str] = None):
        """
        Initialize the context hook.

        Args:
            context_api_url: Context API base URL (e.g., 'http://localhost:3000/api/context')
                            If not provided, will use MOTIA_CONTEXT_API_URL env var
        """
        if context_api_url is None:
            context_api_url = os.getenv('MOTIA_CONTEXT_API_URL', 'http://localhost:3000/api/context')

        self.context_api_url = context_api_url
        self._http_client: Optional[httpx.AsyncClient] = None

        # 存储执行开始时间，用于计算耗时
        self._execution_start_times: Dict[str, float] = {}

    async def pre_exec(self, context: SkillContext) -> Optional[HookResult]:
        """
        Pre-execution: 记录开始时间
        """
        task_id = context.task_id or "unknown"
        skill_name = context.skill_name

        # 记录开始时间
        self._execution_start_times[f"{task_id}-{skill_name}"] = time.time()

        return None

    async def post_exec(
        self,
        context: SkillContext,
        result: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Post-execution: 记录执行历史并提炼失败经验

        记录所有执行（成功+失败），失败时额外提炼失败经验
        """
        try:
            task_id = context.task_id or "unknown"
            skill_name = context.skill_name
            success = result.get("success", True)

            # 计算执行耗时
            start_time = self._execution_start_times.get(f"{task_id}-{skill_name}", time.time())
            duration = int((time.time() - start_time) * 1000)  # 毫秒

            # 记录 Skill 执行（所有执行）
            await self._record_skill_execution(
                task_id=task_id,
                skill_name=skill_name,
                success=success,
                duration=duration,
                input_data=context.input_data,
                result=result
            )

            # 如果失败，额外提炼失败经验
            if not success:
                await self._collect_failure_experience(
                    task_id=task_id,
                    skill_name=skill_name,
                    error=result.get("error", "Unknown error"),
                    input_data=context.input_data,
                    result=result
                )

            # 记录 Tool 使用（如果结果中包含 tool_usage 信息）
            if "tool_usage" in result:
                await self._record_tool_usage(
                    task_id=task_id,
                    tool_usage_records=result["tool_usage"]
                )

        except Exception as e:
            # 静默失败，不影响主流程
            print(f"[ContextHook] Failed to record execution: {e}")

        return result

    async def _record_skill_execution(
        self,
        task_id: str,
        skill_name: str,
        success: bool,
        duration: int,
        input_data: Dict[str, Any],
        result: Dict[str, Any]
    ):
        """记录 Skill 执行并发送到后端 API"""
        try:
            # 提取场景信息
            scenario = self._extract_scenario(skill_name, input_data)

            # 生成输入摘要（前 100 字符）
            input_summary = self._summarize_input(input_data)

            # 提取输出类型（成功时）
            output_type = None
            if success:
                output_type = result.get("artifact_type") or \
                             result.get("metadata", {}).get("artifact_type")

            # 构造执行记录
            execution_record = {
                "taskId": task_id,
                "skillName": skill_name,
                "success": success,
                "startedAt": datetime.fromtimestamp(time.time() - duration / 1000).isoformat(),
                "completedAt": datetime.now().isoformat(),
                "duration": duration,
                "inputSummary": input_summary,
            }

            # 只添加非None的可选字段
            if output_type is not None:
                execution_record["outputType"] = output_type
            if scenario is not None:
                execution_record["scenario"] = scenario

            # 失败时添加错误信息
            if not success:
                execution_record["error"] = result.get("error", "Unknown error")

            # 发送到后端 API（异步，不阻塞主流程）
            api_url = f"{self.context_api_url}/skill-execution"

            # 使用短超时，避免影响技能执行
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.post(api_url, json=execution_record)
                response.raise_for_status()

                status_icon = "✓" if success else "✗"
                print(f"[ContextHook] {status_icon} Skill execution recorded: {skill_name} ({duration}ms)")

        except httpx.TimeoutException:
            print(f"[ContextHook] ⏱ Timeout recording skill execution (non-critical)")
        except Exception as e:
            print(f"[ContextHook] ✗ Failed to record skill execution: {e}")

    async def _collect_failure_experience(
        self,
        task_id: str,
        skill_name: str,
        error: str,
        input_data: Dict[str, Any],
        result: Dict[str, Any]
    ):
        """从失败执行中提炼经验并发送到后端 API"""
        try:
            # 提取场景信息
            scenario = self._extract_scenario(skill_name, input_data)

            # 生成解决方案建议
            solution = await self._suggest_solution(skill_name, error, result)

            # 构造失败经验
            experience = {
                "taskId": task_id,
                "skillName": skill_name,
                "error": error,
                "scenario": scenario,
                "solution": solution,
                "timestamp": datetime.now().isoformat()
            }

            # 发送到后端 API（异步，不阻塞主流程）
            api_url = f"{self.context_api_url}/failure-experience"

            # 使用短超时，避免影响技能执行
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.post(api_url, json=experience)
                response.raise_for_status()

                print(f"[ContextHook] ✓ Failure experience collected: {skill_name}")

        except httpx.TimeoutException:
            print(f"[ContextHook] ⏱ Timeout collecting failure experience (non-critical)")
        except Exception as e:
            print(f"[ContextHook] ✗ Failed to collect failure experience: {e}")

    async def _record_tool_usage(
        self,
        task_id: str,
        tool_usage_records: list
    ):
        """
        记录 Tool 使用并发送到后端 API

        Note: Tool usage tracking requires skill handlers to report tool calls
        in their result metadata under the 'tool_usage' key.
        Format: [{"toolName": "Bash", "success": true, "summary": "...", "error": "..."}]
        """
        try:
            if not tool_usage_records or not isinstance(tool_usage_records, list):
                return

            for record in tool_usage_records:
                # 验证必需字段
                if not all(k in record for k in ['toolName', 'success', 'summary']):
                    continue

                tool_record = {
                    "taskId": task_id,
                    "toolName": record['toolName'],
                    "success": record['success'],
                    "timestamp": datetime.now().isoformat(),
                    "summary": record['summary'][:200],  # 限制长度
                }

                # 添加错误信息（如果有）
                if not record['success'] and 'error' in record:
                    tool_record['error'] = str(record['error'])[:500]  # 限制长度

                # 发送到后端 API
                api_url = f"{self.context_api_url}/tool-usage"

                async with httpx.AsyncClient(timeout=2.0) as client:
                    response = await client.post(api_url, json=tool_record)
                    response.raise_for_status()

                    status_icon = "✓" if record['success'] else "✗"
                    print(f"[ContextHook] {status_icon} Tool usage recorded: {record['toolName']}")

        except httpx.TimeoutException:
            print(f"[ContextHook] ⏱ Timeout recording tool usage (non-critical)")
        except Exception as e:
            print(f"[ContextHook] ✗ Failed to record tool usage: {e}")

    def _extract_scenario(self, skill_name: str, input_data: Dict[str, Any]) -> str:
        """
        从输入数据中提取场景信息

        简单实现：提取关键词
        后续可改进为使用 LLM 分类
        """
        keywords = []

        # 从 input_data 中提取关键词
        for key, value in input_data.items():
            if isinstance(value, str):
                # 常见场景词
                if any(word in value.lower() for word in ['fetch', 'scrape', 'download', 'url']):
                    keywords.append('fetching')
                if any(word in value.lower() for word in ['video', 'image', 'audio']):
                    keywords.append(value.lower())
                if any(word in value.lower() for word in ['code', 'script', 'execute']):
                    keywords.append('executing')

        # 如果没有提取到关键词，使用 skill_name 作为场景
        if not keywords:
            return skill_name.replace('-', ' ')

        return ', '.join(keywords) if keywords else 'general'

    def _summarize_input(self, input_data: Dict[str, Any]) -> str:
        """
        生成输入摘要（前 100 字符）
        """
        # 转换为 JSON 字符串
        input_str = json.dumps(input_data, default=str, ensure_ascii=False)

        # 截取前 100 字符
        if len(input_str) > 100:
            return input_str[:97] + '...'

        return input_str

    async def _suggest_solution(self, skill_name: str, error: str, result: Dict[str, Any]) -> str:
        """
        生成解决方案建议

        简单实现：基于错误类型提供通用建议
        后续可改进为使用 LLM 生成针对性建议
        """
        error_lower = error.lower()

        # Timeout errors
        if 'timeout' in error_lower:
            return f"Consider increasing timeout or using an alternative approach to {skill_name}"

        # Permission errors
        if 'permission' in error_lower or 'denied' in error_lower:
            return f"Check file permissions or access rights for {skill_name}"

        # Network errors
        if 'network' in error_lower or 'connection' in error_lower:
            return f"Check network connectivity or URL validity for {skill_name}"

        # API errors
        if 'api' in error_lower:
            return f"Verify API credentials and endpoint configuration for {skill_name}"

        # Generic solution
        return f"Review {skill_name} configuration and input parameters"
