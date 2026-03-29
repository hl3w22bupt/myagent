# Remotion Generator LLM Tracing Implementation

## 概述

为 `remotion-generator` skill 的独立 LLM client 添加了完整的 tracing 功能，使其与项目现有的 tracing 系统一致。

## 实现内容

### 修改的文件

- `skills/remotion-generator/generators/llm_client.py`

### 新增功能

#### 1. Trace 配置参数

在 `LLMClient.__init__` 中添加了三个新的可选参数：

```python
def __init__(
    self,
    ...
    trace_api_url: Optional[str] = None,
    task_id: Optional[str] = None,
    skill_name: str = "remotion-generator"
):
```

- `trace_api_url`: Trace API endpoint（默认从 `MOTIA_TRACE_API_URL` 环境变量读取）
- `task_id`: 当前任务 ID（默认从 `MOTIA_TASK_ID` 环境变量读取）
- `skill_name`: Skill 名称（默认 "remotion-generator"）

#### 2. `_send_trace` 方法

异步发送 trace 数据到 Motia executionTraces stream：

```python
async def _send_trace(self, trace_data: Dict[str, Any]):
    """Send trace data to Motia executionTraces stream via API."""
    if not self.trace_api_url:
        return

    if not self._http_client:
        self._http_client = httpx.AsyncClient(timeout=5.0)

    try:
        response = await self._http_client.post(
            self.trace_api_url,
            json=trace_data
        )
        response.raise_for_status()
        print(f"[LLMClient] ✓ LLM trace sent: {trace_data.get('id')}")
    except Exception as e:
        print(f"[LLMClient] ✗ Failed to send LLM trace: {e}")
```

#### 3. `_send_llm_trace` 方法

构建并发送符合 trace API schema 的 LLM 调用数据：

```python
def _send_llm_trace(
    self,
    prompt: str,
    response: LLMResponse,
    execution_time: float,
    max_tokens: int,
    temperature: float
):
```

**Trace 数据结构**：

```python
{
    "id": f"llm-skill-{skill_name}-{task_id}-{timestamp_ms}",
    "level": "skill-internal",
    "taskId": task_id,
    "agentId": session_id,
    "skillName": skill_name,
    "stage": "llm_call",
    "status": "completed",
    "executionTime": int(execution_time * 1000),
    "timestamp": datetime.fromtimestamp(timestamp_ms / 1000).isoformat(),
    "metadata": {
        "sessionId": session_id,
        "llmProvider": "anthropic",
        "llmModel": response.model,
        "llmRequest": {
            "prompt": prompt[:1000],  # 截断长 prompt
            "promptLength": len(prompt),
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
        "llmResponse": {
            "content": response.content[:1000],  # 截断长响应
            "responseLength": len(response.content),
            "promptTokens": response.usage['input_tokens'],
            "completionTokens": response.usage['output_tokens'],
            "totalTokens": response.usage['input_tokens'] + response.usage['output_tokens'],
        }
    }
}
```

#### 4. 修改 `generate` 方法

在 LLM 调用后自动发送 trace：

```python
async def generate(self, prompt: str, ...) -> LLMResponse:
    start_time = time.time()

    # ... LLM API 调用 ...

    llm_response = LLMResponse(...)

    # 发送 trace
    execution_time = time.time() - start_time
    self._send_llm_trace(prompt, llm_response, execution_time, max_tokens, temperature)

    return llm_response
```

#### 5. 更新 `get_llm_client` 函数

支持 trace 参数传递：

```python
def get_llm_client(
    model: Optional[str] = None,
    trace_api_url: Optional[str] = None,
    task_id: Optional[str] = None,
    skill_name: str = "remotion-generator"
) -> LLMClient:
    ...
```

## 环境变量支持

Tracing 功能支持以下环境变量：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `MOTIA_TRACE_API_URL` | Trace API endpoint | `http://localhost:3000/api/traces/submit` |
| `MOTIA_TASK_ID` | 当前任务 ID | `unknown` |
| `MOTIA_SESSION_ID` | 当前 session/agent ID | `unknown` |

## 错误处理

- Trace 发送失败**不会影响主流程**（使用 try-except）
- 异步发送避免阻塞 LLM 调用
- 记录警告日志便于调试

## 向后兼容性

实现保持完全向后兼容：

- 所有新参数都是可选的
- 如果未提供 trace 配置，功能会优雅地降级（不发送 trace）
- 现有代码无需修改即可继续工作

## 测试

创建了测试脚本 `skills/remotion-generator/generators/test_llm_client_trace.py`：

```bash
cd skills/remotion-generator
python generators/test_llm_client_trace.py
```

**预期结果**：
- 控制台输出 `[LLMClient] ✓ LLM trace sent` 消息
- Trace 数据被发送到 executionTraces stream
- 可通过 API 查询：`GET /api/tasks/{taskId}/traces`

## 验证步骤

1. **创建使用 remotion-generator 的 task**
2. **执行 task 并观察日志**
   - 查找 `[LLMClient] ✓ LLM trace sent` 消息
3. **调用 traces API**
   ```bash
   curl http://localhost:3000/api/tasks/{taskId}/traces
   ```
4. **验证返回数据**：
   - `level: "skill-internal"`
   - `stage: "llm_call"`
   - `metadata.llmRequest` 和 `metadata.llmResponse`
   - Token 使用信息
5. **在前端 ExecutionTraces 组件中查看**

## 与现有系统的集成

### TypeScript 端

已有的 LLMClient tracing 实现（`src/core/agent/llm-client.ts`）保持不变。

### Python 端

- `ClaudeSkillHandler` (`src/core/skill/handlers/claude_skill_handler.py`) 已实现完整 tracing
- `LLMClient` (`skills/remotion-generator/generators/llm_client.py`) 现在也支持 tracing

两个 Python LLM client 的 tracing 实现模式保持一致。

### Trace API

`steps/api/traces-submit-api.step.ts` 的 schema 已支持所需的 trace 数据结构，无需修改。

### 前端组件

前端 ExecutionTraces 组件（`motia-frontend/src/components/ExecutionTraces.jsx`）会自动显示新的 trace 数据，无需修改。

## 关键设计决策

### 1. 异步非阻塞发送

使用 `asyncio.ensure_future()` 异步发送 trace，避免阻塞主 LLM 调用流程。

### 2. 数据截断

Prompt 和 Response 内容限制为 1000 字符，避免 trace 数据过大。

### 3. 环境变量优先级

参数传递优先级：显式参数 > 环境变量 > 默认值

### 4. 错误容错

Trace 发送失败仅记录警告，不影响主业务逻辑。

## 参考资料

- Plan 文档：查看实现前的完整计划
- `ClaudeSkillHandler._send_llm_trace`: Python tracing 实现参考
- `steps/api/traces-submit-api.step.ts`: Trace API schema 定义
