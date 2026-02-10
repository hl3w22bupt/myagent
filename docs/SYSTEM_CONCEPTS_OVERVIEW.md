# MyAgent 系统核心概念全梳理

> 本文档全面梳理 MyAgent 系统中的所有核心概念及其相互关系

## 一、核心概念关系图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              系统架构全景图                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                    HTTP Request (/agent/execute)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. 用户层 (User Layer)                                                       │
│                                                                              │
│  User (用户) ──提交任务──► Task (任务)                                       │
│   │                      ┌─────────────────────────────────┐                │
│   │                      │ taskId: 唯一标识                │                │
│   │                      │ task: 任务描述                  │                │
│   │                      │ sessionId: 会话ID               │                │
│   │                      │ status: pending/running/...     │                │
│   │                      │ originalTask: 原始请求(无历史)  │                │
│   │                      └─────────────────────────────────┘                │
│   │                                                                       │
│   └───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. 会话层 (Session Layer)                                                    │
│                                                                              │
│  Session (会话) ─────────────────────┐                                       │
│   │                                 │                                        │
│   │  ┌───────────────────────────┐  │                                        │
│   │  │ SessionState              │  │                                        │
│   │  │  - sessionId              │  │                                        │
│   │  │  - conversationHistory[]  │  │  (Agent 内存状态)                        │
│   │  │  - executionHistory[]     │  │                                        │
│   │  │  - variables (Map)        │  │                                        │
│   │  │  - createdAt              │  │                                        │
│   │  │  - lastActivityAt         │  │                                        │
│   │  └───────────────────────────┘  │                                        │
│   │                                 │                                        │
│   └─────────────────────────────────┘                                        │
│                                                                              │
│  AgentManager (会话管理器)                                                   │
│   ├─ acquire(sessionId) ──→ 返回 Agent (复用或创建)                         │
│   ├─ release(sessionId) ──→ 清理会话资源                                     │
│   └─ 自动清理过期会话                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. 代理层 (Agent Layer)                                                       │
│                                                                              │
│  Agent (代理实例) ─────────────────────┐                                     │
│   │  (每个 Session 一个 Agent)         │                                     │
│   │                                    │                                     │
│   │  ┌──────────────────────────────┐ │                                     │
│   │  │ Agent / MasterAgent          │ │                                     │
│   │  │                              │ │                                     │
│   │  │ 核心方法:                    │ │                                     │
│   │  │  - run(task, taskId)        │ │                                     │
│   │  │  - getState()               │ │                                     │
│   │  │  - cleanup()                │ │                                     │
│   │  │                              │ │                                     │
│   │  │ 内部组件:                    │ │                                     │
│   │  │  - LLMClient (LLM 调用)     │ │                                     │
│   │  │  - PTCGenerator (代码生成)  │ │                                     │
│   │  │  - Sandbox (执行环境)       │ │                                     │
│   │  │  - SkillDiscovery (技能发现)│ │                                     │
│   │  └──────────────────────────────┘ │                                     │
│   │                                    │                                     │
│   └────────────────────────────────────┘                                     │
│                                                                              │
│  AgentHook (代理钩子) ──作用于 Agent 生命周期                                │
│   ├─ onAgentCreate()     创建时触发                                         │
│   ├─ onAgentAcquire()    获取时触发                                         │
│   ├─ onTaskStart()       任务开始前触发                                     │
│   ├─ onTaskComplete()    任务完成后触发                                     │
│   ├─ onAgentStatusCheck() 定期状态检查                                       │
│   └─ onAgentDestroy()    销毁时触发                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. 任务执行层 (Task Execution Layer)                                         │
│                                                                              │
│  TaskHook (任务钩子) ──作用于单次任务执行                                    │
│   ├─ preExec()            任务执行前 (可中断)                               │
│   ├─ postExec()           任务执行后 (清理/记录)                            │
│   └─ onProgressingNotify() 任务进行中 (定期通知)                            │
│                                                                              │
│  执行流程:                                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 1. TaskHook.preExec()             ← Task 级别                          │   │
│  │ 2. AgentManager.acquire()         ← 触发 AgentHook                    │   │
│  │ 3. AgentHook.onTaskStart()        ← Agent 级别                        │   │
│  │ 4. agent.run()                    ← 实际执行                          │   │
│  │ 5. AgentHook.onTaskComplete()     ← Agent 级别                        │   │
│  │ 6. TaskHook.postExec()            ← Task 级别                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. 代码生成层 (Code Generation Layer)                                        │
│                                                                              │
│  PTCGenerator (Python Task Code 生成器)                                     │
│   │                                                                         │
│   ├─ planSkills()      ──→ 选择需要的 Skill                                │
│   │                            │                                           │
│   │                            └─ 使用 LLM 分析任务                        │
│   │                               从 SkillRegistry 选择                     │
│   │                                                                         │
│   └─ generateCode()    ──→ 生成 Python 代码                                 │
│                            │                                                 │
│                            └─ 使用 LLM 生成                                │
│                               包含 Skill 调用语句                          │
│                                                                              │
│  PTC (Python Task Code) 特点:                                               │
│   - 异步代码 (async/await)                                                   │
│   - 调用 SkillExecutor.execute()                                            │
│   - 包含重试逻辑 (execute_with_retry)                                       │
│   - 返回统一格式结果                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. 技能层 (Skill Layer)                                                       │
│                                                                              │
│  Skill (技能) ──────────────────────────────┐                               │
│   │  (可复用的功能单元)                      │                               │
│   │                                         │                               │
│   │  ┌──────────────────────────────────┐  │                               │
│   │  │ Skill Metadata                    │  │                               │
│   │  │  - name: 技能名称                 │  │                               │
│   │  │  - description: 功能描述           │  │                               │
│   │  │  - tags: 标签                     │  │                               │
│   │  │  - metadata:                      │  │                               │
│   │  │    - input_schema: 输入参数定义   │  │                               │
│   │  │    - output_schema: 输出定义      │  │                               │
│   │  │  - type: pure-prompt/pure-script/ │  │                               │
│   │  │         hybrid                    │  │                               │
│   │  └──────────────────────────────────┘  │                               │
│   │                                         │                               │
│   └─────────────────────────────────────────┘                               │
│                                                                              │
│  SkillHook (技能钩子) ──作用于单次 Skill 执行                               │
│   ├─ preExec()            Skill 执行前                                     │
│   ├─ postExec()           Skill 执行后                                     │
│   └─ onProgressingNotify() Skill 执行中                                    │
│                                                                              │
│  SkillRegistry (技能注册表)                                                  │
│   - 存储所有可用 Skill 的元数据                                              │
│   - 支持 Skill 发现和过滤                                                    │
│   - Agent 创建时初始化                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. 执行环境层 (Execution Layer)                                              │
│                                                                              │
│  Sandbox (沙箱执行环境) ──────────────────────┐                             │
│   │  (隔离的 Python 执行环境)                │                             │
│   │                                          │                             │
│   │  支持的适配器:                           │                             │
│   │  ├─ LocalSandbox     (本地进程)         │                             │
│   │  ├─ DaytonaSandbox   (云环境)           │                             │
│   │  ├─ E2BSandbox        (云环境)           │                             │
│   │  └─ ModalSandbox      (云环境)           │                             │
│   │                                          │                             │
│   │  接口:                                   │                             │
│   │  ├─ execute(code, options)              │                             │
│   │  ├─ cleanup(sessionId?)                 │                             │
│   │  ├─ healthCheck()                       │                             │
│   │  └─ getInfo()                           │                             │
│   │                                          │                             │
│   │  返回: SandboxResult                    │                             │
│   │  ├─ success: boolean                    │                             │
│   │  ├─ output: any                         │                             │
│   │  ├─ error?: SandboxError                │                             │
│   │  ├─ executionTime: number               │                             │
│   │  ├─ stdout/stderr: string               │                             │
│   │  └─ structuredOutput?: StructuredOutput │                             │
│   └──────────────────────────────────────────┘                             │
│                                                                              │
│  StructuredOutput (统一输出格式)                                            │
│   ├─ result_type: video/image/code/text/...                               │
│   ├─ success: boolean                                                      │
│   ├─ content: any                                                           │
│   └─ metadata?: { execution_time, skills_used, ... }                       │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. 上下文层 (Context Layer)                                                  │
│                                                                              │
│  Context (上下文) ─────────────────────────┐                                │
│   │  (多轮对话的状态)                      │                                │
│   │                                        │                                │
│   │  ┌──────────────────────────────────┐ │                                │
│   │  │ TaskContext                       │ │                                │
│   │  │  - taskId                         │ │                                │
│   │  │  - sessionId                      │ │                                │
│   │  │  - currentTurn                    │ │                                │
│   │  │  - messages[]                     │ │  ← 对话历史                  │
│   │  │  - summary: StructuredSummary     │ │  ← 压缩摘要                  │
│   │  │  - artifactIndex[]                │ │  ← 产物索引                  │
│   │  │  - workingMemory: Record          │ │  ← 工作内存                  │
│   │  │  - metadata:                      │ │                                │
│   │  │    - totalTokens                  │ │                                │
│   │  │    - llmCallsCount                │ │                                │
│   │  │    - skillCallsCount              │ │                                │
│   │  │    - lastCompressedAt             │ │                                │
│   │  └──────────────────────────────────┘ │                                │
│   │                                        │                                │
│   │  StructuredSummary 结构:              │                                │
│   │  ├─ sessionIntent: string             │                                │
│   │  ├─ currentTask: string               │                                │
│   │  ├─ completedSteps[]                  │                                │
│   │  ├─ filesModified[]                   │                                │
│   │  ├─ decisionsMade[]                   │                                │
│   │  ├─ currentStatus: string             │                                │
│   │  ├─ nextSteps[]                       │                                │
│   │  ├─ errorsAndSolutions[]              │                                │
│   │  └─ technicalDetails{}                │                                │
│   │                                        │                                │
│   └────────────────────────────────────────┘                                │
│                                                                              │
│  ContextManager (上下文管理器)                                              │
│   ├─ createTaskContext()    创建上下文                                      │
│   ├─ getContext()            获取上下文                                      │
│   ├─ addMessage()            添加消息                                        │
│   ├─ saveContext()           保存上下文                                      │
│   └─ getContextForLLM()      格式化给 LLM                                    │
│                                                                              │
│  ContextCompressor (上下文压缩器)                                           │
│   - 当消息过多时自动压缩                                                     │
│   - 使用 Anchored Iterative Summarization                                   │
│   - 保留最近 20 条消息 + 压缩摘要                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 9. 数据持久层 (Data Persistence Layer)                                       │
│                                                                              │
│  DataStore (数据存储) ──────────────────────┐                              │
│   │                                        │                              │
│   │  存储内容:                             │                              │
│   │  ├─ Task (任务记录)                    │                              │
│   │  │   - id, sessionId, task, status    │                              │
│   │  │   - createdAt, updatedAt           │                              │
│   │  │                                     │                              │
│   │  ├─ Context (上下文)                   │                              │
│   │  │   - TaskContext 完整结构            │                              │
│   │  │                                     │                              │
│   │  ├─ Artifact (产物)                    │                              │
│   │  │   - id, taskId, type, path         │                              │
│   │  │   - description, timestamp          │                              │
│   │  │                                     │                              │
│   │  └─ CompressionHistory (压缩历史)      │                              │
│   │       - originalTokenCount             │                              │
│   │       - compressedTokenCount           │                              │
│   │       - compressionRatio               │                              │
│   │                                       │                              │
│   │  支持的后端:                           │                              │
│   │  ├─ SQLite                            │                              │
│   │  ├─ PostgreSQL                        │                              │
│   │  └─ 内存 (开发/测试)                  │                              │
│   │                                        │                              │
│   └────────────────────────────────────────┘                              │
│                                                                              │
│  关键方法:                                                                   │
│   ├─ createTask() / updateTask() / getTask() / listTasks()                  │
│   ├─ createTaskContext() / getContext() / saveContext()                     │
│   ├─ addArtifact() / getArtifact() / listArtifacts()                        │
│   └─ saveCompressionHistory() / getCompressionHistory()                    │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 10. 通信层 (Communication Layer)                                             │
│                                                                              │
│  Stream (流) ───────────────────────────────┐                               │
│   │  (实时通信)                             │                               │
│   │                                         │                               │
│   │  Motia Stream API:                     │                               │
│   │  ├─ streams.taskExecution.set()        │  发送任务执行事件              │
│   │  ├─ groupId: taskId                    │                               │
│   │  ├─ entryId: 唯一ID                    │                               │
│   │  └─ data: {                             │                               │
│   │       type, progressType, status,      │                               │
│   │       timestamp, data, metadata        │                               │
│   │     }                                   │                               │
│   │                                         │                               │
│   │  事件类型:                              │                               │
│   │  ├─ intent_analysis    (意图分析)      │  ← AgentHook 触发             │
│   │  ├─ ptc_planning       (PTC 规划)      │  ← AgentHook 触发             │
│   │  ├─ skill_selection   (技能选择)      │  ← AgentHook 触发             │
│   │  ├─ heartbeat          (心跳)          │  ← TaskHook 触发              │
│   │  ├─ chat               (聊天消息)      │  ← Agent 回复时触发           │
│   │  └─ error              (错误)          │                               │
│   │                                         │                               │
│   └─────────────────────────────────────────┘                               │
│                                                                              │
│  Event (事件)                                                                │
│   ├─ agent.task.execute    (任务执行)                                       │
│   ├─ agent.task.chat       (聊天消息)                                        │
│   ├─ agent.task.completed  (任务完成)                                        │
│   ├─ agent.task.failed     (任务失败)                                        │
│   └─ skill.*               (技能事件)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 二、概念层级关系

### 2.1 按范围从大到小

```
Level 1: User (用户)
    ↓
Level 2: Session (会话)
    ↓
Level 3: Agent (代理实例)
    ↓
Level 4: Task (任务)
    ↓
Level 5: PTC (代码)
    ↓
Level 6: Skill (技能)
```

### 2.2 按生命周期

| 概念 | 生命周期 | 复用性 | 状态 |
|------|----------|--------|------|
| **User** | 持久 | - | 无状态 |
| **Session** | 长期 (timeout 后清理) | 跨 Task 复用 | 有状态 (SessionState) |
| **Agent** | 长期 (绑定 Session) | 跨 Task 复用 | 有状态 (SessionState) |
| **Task** | 短期 (执行完成) | 每次独立 | 有状态 (TaskStatus) |
| **PTC** | 短期 (生成后执行) | 每次独立 | 无状态 |
| **Skill** | 持久 | 全局复用 | 无状态 |
| **Context** | 长期 (跨 Task) | 跨 Task 继承 | 有状态 (TaskContext) |

### 2.3 Hook 作用域对比

```
┌─────────────────────────────────────────────────────────────────┐
│                     TaskHook (最大作用域)                       │
│                 关注: 单次任务执行                              │
│                 触发: 每个 Task 一次                            │
│                  ┌─────────────────────────────┐                │
│                  │    AgentHook (中等作用域)   │                │
│                  │    关注: Agent 生命周期      │                │
│                  │    触发: 每个 Agent 多次     │                │
│                  │     ┌───────────────────┐   │                │
│                  │     │ SkillHook (最小)  │   │                │
│                  │     │ 关注: 单次 Skill   │   │                │
│                  │     │ 触发: 每个 Skill 一次│   │                │
│                  │     └───────────────────┘   │                │
│                  └─────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

## 三、数据流转关系

### 3.1 任务执行数据流

```
User Request (用户请求)
    │
    ├─ task: "生成一个视频"
    ├─ sessionId: "session-123" (可选)
    └─ availableSkills: [] (可选)
    │
    ▼
agent-api.step.ts (HTTP 接收)
    │
    ├─ 生成 taskId
    ├─ emit('agent.task.execute')
    └─ 返回 taskId 给用户
    │
    ▼
master-agent.step.ts (事件处理)
    │
    ├─ 1. 构建 TaskContext
    │       ├─ taskId, sessionId, task
    │       ├─ status: 'pending'
    │       ├─ context: null
    │       └─ services: { streams, logger, emit }
    │
    ├─ 2. TaskHook.preExec(context)
    │       ├─ DefaultTaskHook
    │       ├─ ContextManagerTaskHook
    │       ├─ UserAllowTaskHook
    │       └─ MetricsCollectorTaskHook
    │
    ├─ 3. AgentManager.acquire(sessionId)
    │       ├─ 触发 AgentHook.onAgentCreate()
    │       ├─ 触发 AgentHook.onAgentAcquire()
    │       └─ 返回 Agent (复用或新建)
    │
    ├─ 4. AgentHook.onTaskStart(task, taskId, context)
    │       ├─ AgentMonitoringHook (发送通知)
    │       ├─ AgentContextSyncHook (同步上下文)
    │       └─ AgentProgressNotifyHook (进度通知)
    │
    ├─ 5. 加载历史上下文
    │       └─ ContextManager.getContextForLLM(taskId)
    │           └─ 返回: "## Summary\n...\n## Recent Messages\n..."
    │
    ├─ 6. agent.run(task, taskId, context)
    │       │
    │       ├─ Step 1: notifyIntentAnalysis(task)
    │       │       └─ Stream: intent_analysis 事件
    │       │
    │       ├─ Step 2: PTCGenerator.generate(task, options)
    │       │       │
    │       │       ├─ planSkills(task)
    │       │       │       └─ LLM 选择 Skill → selectedSkills[]
    │       │       │
    │       │       └─ generateCode(task, selectedSkills)
    │       │               └─ LLM 生成 Python 代码
    │       │
    │       ├─ Step 3: notifyPTCPlanning(ptcResult)
    │       │       └─ Stream: ptc_planning 事件
    │       │
    │       ├─ Step 4: Sandbox.execute(ptcCode, options)
    │       │       │
    │       │       ├─ 执行 Python 代码
    │       │       ├─ 调用 SkillExecutor.execute()
    │       │       ├─ SkillHook.preExec() / postExec()
    │       │       └─ 返回 SandboxResult
    │       │           ├─ success: boolean
    │       │           ├─ output: any
    │       │           └─ structuredOutput?: StructuredOutput
    │       │
    │       └─ Step 5: 返回 AgentResult
    │               ├─ success: boolean
    │               ├─ output: string
    │               ├─ steps: AgentStep[]
    │               ├─ executionTime: number
    │               └─ metadata: { llmCalls, skillCalls, ... }
    │
    ├─ 7. AgentHook.onTaskComplete(result, context)
    │       └─ 发送完成通知
    │
    ├─ 8. TaskHook.postExec(context, result)
    │       ├─ 保存 Context
    │       ├─ 提取 Artifacts
    │       ├─ 压缩上下文 (如需要)
    │       └─ 记录指标
    │
    └─ 9. emit('agent.task.completed')
            └─ 返回结果给用户
```

### 3.2 上下文继承关系

```
Session: "session-123"
    │
    ├─ Task 1 (第一个任务)
    │       ├─ 创建 TaskContext (初始)
    │       │       ├─ messages: []
    │       │       ├─ currentTurn: 0
    │       │       └─ summary: {}
    │       │
    │       ├─ 执行任务...
    │       ├─ 添加消息到 messages
    │       ├─ 保存 Context
    │       └─ currentTurn → 1
    │
    ├─ Task 2 (第二个任务)
    │       ├─ ContextManager.createTaskContext()
    │       │       └─ 查找最近的任务上下文 → 找到 Task 1
    │       │
    │       ├─ 继承 Task 1 的上下文
    │       │       ├─ messages: [从 Task 1 继承]
    │       │       ├─ currentTurn: 1 (从 Task 1 继承)
    │       │       ├─ summary: {...} (从 Task 1 继承)
    │       │       └─ artifactIndex: [...] (从 Task 1 继承)
    │       │
    │       ├─ 执行任务... (带历史上下文)
    │       ├─ 添加新消息
    │       └─ currentTurn → 2
    │
    └─ Task N (第 N 个任务)
            └─ 继承 Task N-1 的上下文
```

## 四、关键区别总结

### 4.1 Task vs Session

| 维度 | Task | Session |
|------|------|---------|
| **定义** | 单次任务执行 | 会话 (多轮对话) |
| **生命周期** | 短期 (完成即结束) | 长期 (timeout 后清理) |
| **状态** | TaskStatus | SessionState |
| **关联** | 1 Task → 1 Session | 1 Session → N Tasks |
| **上下文** | TaskContext (可继承) | Agent State (内存) |

### 4.2 TaskContext vs SessionState

| 维度 | TaskContext | SessionState |
|------|-------------|--------------|
| **存储** | Database (持久化) | Memory (Agent 内部) |
| **范围** | 单次任务 (可继承) | 整个会话 |
| **内容** | messages, summary, artifacts | conversationHistory, variables |
| **用途** | 多轮对话压缩 | 会话状态管理 |

### 4.3 PTC vs Code

| 维度 | PTC | Code |
|------|-----|------|
| **全称** | Python Task Code | 通用代码 |
| **格式** | 异步 Python | 任意语言 |
| **特点** | 调用 Skill | 直接执行 |
| **生成** | PTCGenerator | 人工或其他工具 |

### 4.4 Sandbox vs Environment

| 维度 | Sandbox | Environment |
|------|---------|-------------|
| **定义** | 隔离执行环境 | 系统环境变量 |
| **作用** | 执行 PTC 代码 | 配置系统参数 |
| **类型** | Local/Daytona/E2B | process.env |

## 五、最佳实践建议

### 5.1 何时使用 AgentHook

- **需要跨 Task 共享状态**：使用 Agent 级别变量
- **需要监控 Agent 生命周期**：创建、销毁、状态检查
- **需要 Agent 级别的进度通知**：意图分析、PTC 规划
- **需要同步 Agent 和数据库状态**

### 5.2 何时使用 TaskHook

- **每次 Task 都需要执行**：权限检查、指标收集
- **需要中断 Task 执行**：用户确认、资源检查
- **需要 Task 级别的进度通知**：定期心跳
- **需要处理 Task 结果**：清理、记录

### 5.3 何时使用 SkillHook

- **需要监控 Skill 执行**：重试、超时
- **需要 Skill 级别的日志**：参数、结果
- **需要修改 Skill 输入输出**

### 5.4 上下文管理建议

- **短期对话** (5 轮内)：直接使用 messages
- **中期对话** (5-20 轮)：启用自动压缩
- **长期对话** (20+ 轮)：定期清理，保留摘要
- **关键决策**：保存到 decisionsMade
- **重要产物**：记录到 artifactIndex

## 六、常见问题

### Q1: Agent 和 MasterAgent 有什么区别？

**A:**
- **Agent**: 基础代理，直接执行任务
- **MasterAgent**: 支持委派的代理，可以调用 SubAgent

```typescript
// Agent 执行
const agent = await agentManager.acquire(sessionId, { agentType: 'agent' });
await agent.run('生成一个视频');

// MasterAgent 执行
const masterAgent = await agentManager.acquire(sessionId, { agentType: 'master' });
await masterAgent.run('审查这段代码');  // 会委派给 code-reviewer
```

### Q2: Task 和 originalTask 有什么区别？

**A:**
- **task**: 包含对话历史的完整任务描述
- **originalTask**: 用户原始请求 (不含历史)

```typescript
// TaskContext 中
taskContext.task = `
## Conversation History
[user]: 生成一个视频
[assistant]: 好的，我将生成视频...

## Current Task
添加动画效果
`;  // ← 包含历史的 task

taskContext.originalTask = '添加动画效果';  // ← 纯粹的用户请求
```

### Q3: 什么时候需要手动 release Agent？

**A:**
- **通常不需要**：AgentManager 自动清理过期会话
- **需要清理的情况**：
  - 用户明确退出
  - 内存压力大
  - 测试环境重置

```typescript
// 手动释放
await agentManager.release(sessionId);
```

### Q4: Context 压缩什么时候触发？

**A:**
- **自动触发条件** (在 ContextCompressor 中)：
  - 消息数量 > 20 条
  - Token 数量 > 10000
  - 距上次压缩 > 1 小时

```typescript
// 检查是否需要压缩
if (compressor.shouldCompress(context)) {
  const compressed = await compressor.compress(context, llmSummarize);
}
```

### Q5: Stream 事件有哪些类型？

**A:**
- **Agent 级别**：intent_analysis, ptc_planning, skill_selection
- **Task 级别**：heartbeat, status_update
- **聊天**：chat (role: user/assistant)
- **错误**：error

---

## 总结

MyAgent 系统的核心概念可以概括为：

1. **User → Session → Agent → Task → PTC → Skill** (层级关系)
2. **TaskHook > AgentHook > SkillHook** (Hook 作用域)
3. **Context** (多轮对话状态) + **Sandbox** (隔离执行) + **Store** (持久化)
4. **Stream** (实时通信) + **Event** (事件驱动)

理解这些概念及其关系，有助于：
- 正确选择 Hook 类型
- 合理管理上下文
- 高效追踪问题
- 扩展系统功能
