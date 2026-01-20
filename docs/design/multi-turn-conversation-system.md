# 多轮对话与实时进度系统 - 总体设计

## 概述

本文档整合了多轮对话系统、实时进度反馈和Skill Hook系统的完整设计方案，为任务详情页提供现代化的交互体验。

## 系统目标

1. **混合UI交互模式**：左侧进度流 + 底部对话区，用户提问时同步到进度流
2. **实时流式响应**：基于Motia Stream架构，修复后启用真正的实时更新
3. **多轮对话支持**：任务级上下文隔离，支持对话历史和智能压缩
4. **Skill Hook系统**：Pre/Post/Progressing三级Hook，支持进度通知和逻辑注入

## 核心组件

### 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        前端UI层                              │
│  ┌──────────────┐              ┌──────────────────┐         │
│  │TaskDetail    │              │进度流 + 对话区    │         │
│  │订阅Stream    │◄─────────────│实时更新          │         │
│  └──────────────┘              └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ WebSocket/Motia Stream
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Motia API层                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │notify-api    │  │task-chat     │  │task-create   │     │
│  │.step.ts      │  │.step.ts      │  │.step.ts      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        Hook系统层                            │
│  ┌──────────────────────────┐  ┌────────────────────┐     │
│  │TaskHook (TypeScript)     │  │SkillHook (Python)  │     │
│  │- BaseTaskHook            │  │- BaseHook          │     │
│  │- TaskHookExecutor        │  │- SkillExecutor     │     │
│  │- DefaultTaskHook         │  │- WebSearchHook     │     │
│  │- ContextManagerHook      │  │                    │     │
│  └──────────────────────────┘  └────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent & Context层                       │
│  ┌──────────────┐              ┌──────────────┐           │
│  │Master-Agent  │              │ContextManager│           │
│  │.step.ts      │◄─────────────│              │           │
│  └──────────────┘              └──────────────┘           │
│         │                                                   │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │Sandbox       │                                          │
│  │(Python)      │                                          │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

### 1. 前端UI层

**文件位置**：`motia-frontend/src/pages/TaskDetail.jsx`（重构）

```jsx
// 任务详情页组件结构
function TaskDetail({ taskId }) {
  const [messages, setMessages] = useState([]);  // 进度流消息
  const [chatMessages, setChatMessages] = useState([]);  // 对话消息
  const [inputValue, setInputValue] = useState('');

  // 订阅Motia Stream
  useEffect(() => {
    const stream = subscribeToStream(taskId, (message) => {
      // 根据消息类型分发到不同区域
      if (message.type === 'chat') {
        setChatMessages(prev => [...prev, message]);
      }
      // 所有消息都显示在进度流
      setMessages(prev => [...prev, message]);
    });

    return () => stream.unsubscribe();
  }, [taskId]);

  // 发送对话消息
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = {
      type: 'chat',
      role: 'user',
      content: inputValue,
      timestamp: new Date().toISOString(),
    };

    // 立即显示在UI上
    setMessages(prev => [...prev, userMessage]);
    setChatMessages(prev => [...prev, userMessage]);

    // 发送到后端
    await agentsAPI.sendChatMessage(taskId, inputValue);
    setInputValue('');
  };

  return (
    <div className="task-detail-container">
      {/* 左侧进度流区域 */}
      <div className="progress-stream">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* 底部对话区域 */}
      <div className="chat-area">
        <div className="chat-messages">
          {chatMessages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </div>

        <div className="chat-input">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="输入问题或指令..."
          />
          <button onClick={handleSendMessage}>发送</button>
        </div>
      </div>
    </div>
  );
}

// 消息气泡组件
function MessageBubble({ message }) {
  const styles = {
    status: 'status-message',
    step: 'step-message',
    heartbeat: 'heartbeat-message',
    chat: 'chat-message',
  };

  return (
    <div className={`${styles[message.type]} message`}>
      <span className="timestamp">{formatTime(message.timestamp)}</span>
      <span className="content">{message.message || message.content}</span>
      {message.skill && <span className="badge">{message.skill}</span>}
    </div>
  );
}
```

### 2. 后端API层

#### Notify API Step
**文件位置**：`steps/streams/notify-api.step.ts`

```typescript
export const config = {
  type: 'api',
  name: 'notify-api',
  path: '/api/notify',
  method: 'POST',
  emits: [],
};

export const handler = async (request: any, { logger, streams }) => {
  const body = await request.json();
  const { taskId, type, message, skill, data, timestamp } = body;

  // 通过Motia Stream发送到前端
  await streams.taskExecution.set(taskId, taskId, {
    type,  // 'status' | 'step' | 'heartbeat' | 'chat'
    timestamp: new Date(timestamp * 1000).toISOString(),
    message,
    skill,
    data,
  });

  return { status: 200, body: { success: true } };
};
```

#### Chat API Step
**文件位置**：`steps/agents/task-chat.step.ts`

```typescript
export const config = {
  type: 'api',
  name: 'task-chat',
  path: '/api/tasks/:id/chat',
  method: 'POST',
  emits: ['agent.task.chat'],
};

export const handler = async (request: any, { logger, emit, streams }) => {
  const taskId = request.params.id;
  const { message, userId } = await request.json();

  // 1. 添加用户消息到上下文
  const contextManager = new ContextManager();
  const task = await getTask(taskId);
  const userMessage = {
    id: generateId(),
    taskId,
    role: 'user',
    content: message,
    metadata: { timestamp: new Date(), userId },
  };

  const updatedContext = await contextManager.addMessage(task.context, userMessage);

  // 2. 通过Stream发送用户消息
  await streams.taskExecution.set(taskId, taskId, {
    type: 'chat',
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });

  // 3. 发送事件给Agent处理
  await emit({
    topic: 'agent.task.chat',
    data: {
      taskId,
      sessionId: task.sessionId,
      message,
      context: updatedContext,
    },
  });

  // 4. 保存上下文
  await updateTaskContext(taskId, updatedContext);

  return { status: 200, body: { success: true } };
};
```

### 3. Python Hook SDK

**文件位置**：`src/core/skill/hooks/base.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass

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
    """Hook基类"""

    @abstractmethod
    async def pre_exec(self, context: SkillContext) -> Optional[Dict[str, Any]]:
        """Skill执行前调用"""
        pass

    @abstractmethod
    async def post_exec(self, context: SkillContext, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Skill执行后调用"""
        pass

    async def on_progressing_notify(self, context: SkillContext, progress_data: Dict[str, Any]):
        """进度通知（可选）"""
        pass
```

**文件位置**：`src/core/skill/executor.py`

```python
import httpx

class SkillExecutor:
    """Skill执行器"""

    def __init__(self, hook: BaseHook = None, notify_api_url: str = None):
        self.hook = hook
        self.notify_api_url = notify_api_url
        self._http_client = None

    async def report_progress(self, context: SkillContext, progress_type: str, data: Dict[str, Any]):
        """报告进度"""
        # 调用Hook回调
        if self.hook:
            await self.hook.on_progressing_notify(context, data)

        # 发送到Motia Notify API
        if not self.notify_api_url:
            return

        if not self._http_client:
            self._http_client = httpx.AsyncClient(timeout=5.0)

        try:
            await self._http_client.post(
                self.notify_api_url,
                json={
                    "taskId": context.task_id,
                    "type": progress_type,
                    "timestamp": time.time(),
                    **data
                }
            )
        except Exception as e:
            print(f"Warning: Failed to send progress: {e}")

    async def execute(self, skill_name: str, skill_func: Callable, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """执行Skill并调用Hook"""
        context = SkillContext(
            skill_name=skill_name,
            task_id=input_data.get("task_id", ""),
            session_id=input_data.get("session_id", ""),
            input_data=input_data,
            metadata=input_data.get("metadata", {}),
            execution_start_time=time.time()
        )

        # Pre-Exec Hook
        if self.hook:
            pre_result = await self.hook.pre_exec(context)
            if pre_result and pre_result.get('stop'):
                return {"success": False, "error": "Stopped by pre-hook"}
            if pre_result and 'modified_input' in pre_result:
                input_data = pre_result['modified_input']

        # 执行主逻辑
        try:
            result = await skill_func(input_data)
        except Exception as e:
            result = {"success": False, "error": str(e)}

        # Post-Exec Hook
        if self.hook:
            post_result = await self.hook.post_exec(context, result)
            if post_result:
                result.update(post_result)

        return result
```

### 4. 上下文管理系统

**文件位置**：`src/core/context/manager.ts`

```typescript
export class ContextManager {
  /**
   * 创建任务上下文
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    return {
      taskId,
      sessionId,
      currentTurn: 0,
      messages: [],
      summary: {
        sessionIntent: '',
        currentTask: input,
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      },
      artifactIndex: [],
      workingMemory: {},
      metadata: {
        totalTokens: 0,
        llmCallsCount: 0,
        skillCallsCount: 0,
      },
    };
  }

  /**
   * 添加消息并自动压缩
   */
  async addMessage(context: TaskContext, message: Message): Promise<TaskContext> {
    const newContext = { ...context };
    newContext.messages.push(message);
    newContext.currentTurn += 1;

    // 更新token统计
    newContext.metadata.totalTokens += message.metadata.tokens || 1000;

    // 检查是否需要压缩
    const maxTokens = 100000;
    const threshold = 0.8;

    if (newContext.metadata.totalTokens > maxTokens * threshold) {
      return await this.compressContext(newContext);
    }

    return newContext;
  }

  /**
   * 上下文压缩（Anchored Iterative Summarization）
   */
  private async compressContext(context: TaskContext): Promise<TaskContext> {
    // 保留最近20条消息
    const messagesToKeep = 20;
    const messagesToCompress = context.messages.slice(0, -messagesToKeep);

    // 生成新的结构化摘要
    const newSummary = await this.generateStructuredSummary(context.summary, messagesToCompress);

    // 更新Artifact索引
    await this.updateArtifactIndex(context.taskId, messagesToCompress);

    return {
      ...context,
      messages: context.messages.slice(-messagesToKeep),
      summary: newSummary,
      metadata: {
        ...context.metadata,
        lastCompressedAt: new Date(),
        totalTokens: this.estimateCompressedTokens(
          context.messages.slice(-messagesToKeep),
          newSummary
        ),
      },
    };
  }

  /**
   * 获取LLM上下文
   */
  async getContextForLLM(taskId: string): Promise<string> {
    const task = await getTask(taskId);
    const ctx = task.context;

    return `
## Summary
${this.formatSummary(ctx.summary)}

## Artifacts
${ctx.artifactIndex.map(a => `- ${a.artifactType}: ${a.path}`).join('\n')}

## Recent Messages
${ctx.messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
`;
  }
}
```

## 完整数据流

### 任务创建流程
```
用户提交任务
  ↓
POST /api/tasks/create
  ↓
master-agent.step.ts
  ├─ contextManager.createTaskContext()
  ├─ emit(agent.task.execute)
  └─ streams.taskExecution.set(type='status', status='pending')
```

### 任务执行流程
```
Agent执行任务
  ↓
master-agent.step.ts
  ├─ contextManager.getContextForLLM()
  ├─ llmService.complete(prompt_with_context)
  ├─ Skill执行
  │   ├─ SkillExecutor.execute()
  │   │   ├─ hook.pre_exec()
  │   │   ├─ skill_func()
  │   │   │   └─ executor.report_progress(type='step')
  │   │   │       ↓
  │   │   │   HTTP POST /api/notify
  │   │   │       ↓
  │   │   │   streams.taskExecution.set()
  │   │   │       ↓
  │   │   │   前端实时更新
  │   │   └─ hook.post_exec()
  └─ contextManager.addMessage(assistantMessage)
```

### 多轮对话流程
```
用户在任务详情页输入问题
  ↓
POST /api/tasks/:id/chat
  ↓
task-chat.step.ts
  ├─ contextManager.addMessage(userMessage)
  ├─ streams.taskExecution.set(type='chat', role='user')
  ├─ emit(agent.task.chat)
  └─ 保存上下文
      ↓
master-agent.step.ts (监听agent.task.chat)
  ├─ contextManager.getContextForLLM()
  ├─ llmService.complete(prompt_with_full_context)
  ├─ contextManager.addMessage(assistantMessage)
  └─ streams.taskExecution.set(type='chat', role='assistant')
      ↓
前端收到两条消息（用户+助手）都显示在进度流和对话区
```

## 实施计划

### Phase 1: 修复Stream并实现基础Hook（2周）
- [ ] 修复wrapObject堆栈溢出bug
- [ ] 重新启用taskExecution Stream
- [ ] 实现BaseHook和SkillExecutor
- [ ] 实现Notify API Step
- [ ] 在一个示例Skill中集成Hook

### Phase 2: 实现上下文管理（2周）
- [ ] 实现ContextManager核心功能
- [ ] 创建数据库Schema（task_context, artifact_index, compression_history）
- [ ] 实现Anchored Iterative Summarization
- [ ] 实现Artifact索引和提取

### Phase 3: 实现多轮对话（1周）
- [ ] 实现task-chat API Step
- [ ] 在master-agent中集成上下文管理
- [ ] 修改Agent执行流程以支持上下文传递
- [ ] 测试多轮对话场景

### Phase 4: 前端UI重构（1.5周）
- [ ] 重构TaskDetail页面，添加进度流和对话区
- [ ] 实现WebSocket/Motia Stream订阅
- [ ] 实现消息气泡和样式
- [ ] 实现流式响应展示

### Phase 5: 集成测试和优化（1周）
- [ ] 端到端测试：任务创建→执行→多轮对话
- [ ] 性能优化：上下文压缩触发时机、Artifact提取准确性
- [ ] 用户体验优化：消息展示、输入交互、错误提示
- [ ] 文档完善：API文档、Hook编写指南

## 关键技术点

### 1. wrapObject堆栈溢出修复
**问题**：`src/core/sandbox/wrapObject.ts` 中的递归导致堆栈溢出
**解决方案**：
```typescript
// 使用WeakMap跟踪已处理对象，避免循环引用
const processed = new WeakMap();

function safeWrap(obj: any, depth = 0): any {
  if (depth > 10) return '[Object]';  // 限制深度
  if (processed.has(obj)) return processed.get(obj);

  // ... 包装逻辑
  processed.set(obj, wrapped);
  return wrapped;
}
```

### 2. Motia Stream实时通信
**订阅方式**：
```typescript
// 前端使用Motia Stream订阅
const stream = await streams.subscribe('taskExecution', taskId, (update) => {
  console.log('Received update:', update);
});
```

### 3. 上下文压缩质量保证
**Probe-based Evaluation**：
```typescript
const quality = await evaluateCompressionQuality(original, compressed);
if (quality.overallScore < 0.7) {
  // 调整压缩策略
  logger.warn('Compression quality too low', { score: quality.overallScore });
}
```

## 测试场景

### 场景1：简单任务执行
1. 用户提交任务："搜索AI最新进展"
2. 前端显示进度流：
   - `[status] Task created`
   - `[step] Initializing search...`
   - `[step] Searching for: AI最新进展`
   - `[step] Processing 10 results...`
   - `[status] Task completed`
3. 用户点击结果查看详情

### 场景2：长时间任务进度反馈
1. 用户提交任务："生成10分钟的视频"
2. 前端显示进度流：
   - `[status] Task started`
   - `[step] Analyzing requirements...`
   - `[heartbeat] Still processing...` (30秒后)
   - `[step] Generating script...`
   - `[heartbeat] Still processing...` (60秒后)
   - `[step] Rendering video (0%)...`
   - `[step] Rendering video (25%)...`
   - ...
   - `[status] Task completed`

### 场景3：多轮对话
1. 用户提交任务："分析React性能问题"
2. Agent开始分析，前端显示进度
3. 用户在对话区输入："重点关注useMemo的使用"
4. 前端进度流和对话区同时显示：
   - `[chat] User: 重点关注useMemo的使用`
5. Agent回复：
   - `[chat] Assistant: 好的，我会重点检查useMemo的使用场景...`
6. Agent继续分析，前端显示：
   - `[step] Checking useMemo usage...`
   - `[step] Found 3 potential issues...`

## 相关文档

### 核心设计文档
- [Skill Hook系统设计](./skill-hook-system.md) - Skill级别的Hook系统
- [Task Hook系统设计](./task-hook-system.md) - 任务级别的Hook系统
- [上下文工程设计](./context-engineering.md) - 多轮对话的上下文管理

### Motia框架文档
- [Motia Event Steps](../../.cursor/rules/motia/event-steps.mdc)
- [Motia Realtime Streaming](../../.cursor/rules/motia/realtime-streaming.mdc)
- [Motia State Management](../../.cursor/rules/motia/state-management.mdc)
- [Motia Middlewares](../../.cursor/rules/motia/middlewares.mdc)

### 参考资料
- Factory Research: "Evaluating Context Compression for AI Agents"
- Netflix Engineering: "The Infinite Software Crisis" (AI Summit 2025)
- Motia Framework Documentation

## 版本历史

- **v1.1** (2026-01-21): 补充TaskHook系统设计，完善Hook粒度说明
- **v1.0** (2026-01-21): 初始设计，整合Hook系统和上下文工程
