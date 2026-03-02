# MyAgent 系统概念与关系详解

> 本文档系统介绍 MyAgent 的核心概念、架构关系和数据流转

## 目录

- [一、核心概念层级](#一核心概念层级)
- [二、概念详解](#二概念详解)
- [三、钩子系统对比](#三钩子系统对比)
- [四、数据流转关系](#四数据流转关系)
- [五、关键概念对比](#五关键概念对比)
- [六、最佳实践](#六最佳实践)
- [七、常见问题](#七常见问题)

---

## 一、核心概念层级

### 1.1 概念金字塔

```
                    ┌─────────────────┐
                    │     User        │  用户 (发起请求)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Session      │  会话 (多轮对话)
                    │  1 Session → N  │
                    │     Tasks       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     Agent       │  代理 (执行单元)
                    │  1 Agent → 1    │
                    │    Session      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     Task        │  任务 (用户请求封装)
                    │  1 Task → 1     │
                    │    Session      │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼─────┐ ┌──────▼──────┐ ┌───▼────────┐
    │      PTC      │ │   Context   │ │   Skill    │
    │  (代码生成)    │ │  (上下文)    │ │  (技能)    │
    └───────────────┘ └─────────────┘ └────────────┘
```

### 1.2 层级关系表

| 层级 | 概念 | 生命周期 | 复用性 | 状态存储 |
|------|------|----------|--------|----------|
| **L1** | User | 持久 | - | 无状态 |
| **L2** | Session | 长期 (timeout 后清理) | 跨 Task | SessionState (内存) |
| **L3** | Agent | 长期 (绑定 Session) | 跨 Task | SessionState (内存) |
| **L4** | Task | 短期 (执行完成) | 每次独立 | TaskStatus (DB) |
| **L5** | PTC | 短期 (生成后执行) | 每次独立 | 无状态 |
| **L6** | Skill | 持久 | 全局复用 | 无状态 |

### 1.3 上下文工程三层架构

MyAgent 的上下文工程采用三层数据源设计，为 Agent 的决策提供全面的信息支持。

```
┌─────────────────────────────────────────────────────────────────────┐
│                      上下文工程数据源                                │
└─────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  Agent 决策输入  │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Context 层     │         │   Memory 层      │         │  Knowledge 层    │
│  (短期/动态)      │         │  (长期/稳定)      │         │  (静态/通用)      │
│                 │         │                 │         │                 │
│ "正在做什么?"    │         │ "学到了什么?"    │         │ "知道什么?"      │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

#### 三层数据源对比

| 维度 | Context 层 | Memory 层 | Knowledge 层 |
|------|-----------|-----------|--------------|
| **本质** | "正在发生什么" | "学到了什么/偏好什么" | "知道什么" |
| **时效性** | 短期、动态 | 长期、相对稳定 | 静态、通用 |
| **作用域** | 单次任务/会话 | 用户级别 | 全局共享 |
| **数据示例** | 对话历史、执行状态 | 用户偏好、画像 | 技能定义、文档 |
| **存储位置** | Database (可压缩) | Database (长期) | 文件系统/Database |
| **更新频率** | 实时 | 低频 | 版本发布/定期 |
| **继承性** | 跨 Task 继承 | 跨 Session 继承 | 无需继承 |

#### 三层数据源详细说明

**Context 层 (短期上下文)**
- **用途**: 理解当前对话状态、执行进度
- **核心数据**:
  - messages: 对话历史
  - summary: 压缩摘要
  - workingMemory: 任务临时状态
  - artifactIndex: 产物索引
- **特点**: 容量有限，会"遗忘" (压缩)

**Memory 层 (长期记忆)**
- **用途**: 个性化决策、用户画像
- **核心数据**:
  - UserProfile: 用户基本信息、角色、经验
  - UserPreferences: 用户偏好设置、交互风格
  - BehaviorHistory: 行为历史、成功/失败模式
  - SuccessPatterns: 任务 → 成功配置映射
- **特点**: 容量大，持久化，跨会话复用

**Knowledge 层 (通用知识)**
- **用途**: 补充通用信息，不依赖用户
- **三种形态**:
  - **Skill**: 工具/能力调用 (已实现)
  - **Markdown 知识库**: 产品文档、API 参考 (简单)
  - **RAG 系统**: 企业知识库、大知识量 (复杂)
- **特点**: 静态知识，全局共享

#### 类比理解

```
人的认知模型:

┌─────────────────────────────────────────────────────────────┐
│  Context (短期记忆/工作记忆)                                  │
│  - "我们在讨论什么？"                                         │
│  - "上一步做了什么？"                                         │
│  - "当前目标是什么？"                                         │
│  - 容量有限，会"遗忘" (压缩)                                  │
├─────────────────────────────────────────────────────────────┤
│  Memory (长期记忆)                                           │
│  - "用户喜欢什么风格？"                                        │
│  - "用户是开发者还是设计师？"                                   │
│  - "之前成功/失败的案例"                                       │
│  - 容量大，持久化                                             │
├─────────────────────────────────────────────────────────────┤
│  Knowledge (知识库)                                           │
│  - "这个工具怎么用？"                                          │
│  - "最佳实践是什么？"                                          │
│  - "有哪些相关文档？"                                         │
│  - 静态知识，全局共享                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、概念详解

### 2.1 User (用户)

**定义**: 系统的使用者，发起任务请求

**关键属性**:
- 无状态，通过 Session 追踪
- 可以并发多个任务
- 通过 HTTP/WebSocket 与系统交互

### 2.2 Session (会话)

**定义**: 多轮对话的容器，维护对话上下文

**关键特性**:
- **生命周期**: 创建 → 活动 → 超时清理
- **默认超时**: 1 小时
- **状态管理**: SessionState (Agent 内存)
- **上下文继承**: Task 可以继承之前 Task 的上下文

**SessionState 结构**:
```typescript
interface SessionState {
  sessionId: string;              // 会话 ID
  createdAt: number;              // 创建时间
  lastActivityAt: number;         // 最后活动时间
  conversationHistory: Array<{    // 对话历史
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  executionHistory: Array<{       // 执行历史
    task: string;
    result: any;
    timestamp: number;
    executionTime: number;
  }>;
  variables: Map<string, any>;    // 会话变量
}
```

**与 Task 的关系**:
```
Session (1) ←→ (N) Task
  ↓
  ├─ Task 1: "生成视频"
  ├─ Task 2: "添加音乐"  (继承 Task 1 的上下文)
  └─ Task 3: "导出"     (继承 Task 1, 2 的上下文)
```

### 2.3 Agent (代理)

**定义**: 任务执行的核心单元，每个 Session 对应一个 Agent 实例

**类型**:
- **Agent**: 基础代理，直接执行任务
- **MasterAgent**: 支持委派的代理，可以调用 SubAgent

**核心方法**:
```typescript
class Agent {
  // 执行任务
  async run(task: string, taskId?: string, context?: any): Promise<AgentResult>;

  // 获取状态
  getState(): SessionState;

  // 清理资源
  async cleanup(): Promise<void>;
}
```

**内部组件**:
- **LLMClient**: LLM 调用 (生成 PTC 代码)
- **PTCGenerator**: Python 代码生成器
- **Sandbox**: 隔离执行环境
- **SkillDiscovery**: 技能发现和注册

**Agent 管理流程**:
```
AgentManager.acquire(sessionId)
  │
  ├─ Session 已存在?
  │   ├─ YES → 复用现有 Agent
  │   └─ NO  → 创建新 Agent
  │
  ├─ 触发: AgentHook.onAgentCreate()
  ├─ 触发: AgentHook.onAgentAcquire()
  └─ 返回: Agent 实例
```

### 2.4 Task (任务)

**定义**: 用户请求的封装，单次执行的单元

**TaskContext 结构**:
```typescript
interface TaskContext {
  // 基础信息
  taskId: string;
  sessionId: string;
  task: string;              // 完整任务描述 (含历史)
  originalTask?: string;     // 原始用户请求 (无历史)

  // 执行状态
  status: 'pending' | 'running' | 'completed' | 'failed';

  // 任务上下文 (持久化)
  context: {
    taskId: string;
    sessionId: string;
    currentTurn: number;      // 当前轮次
    messages: Message[];      // 对话历史
    summary: any;             // 压缩摘要
    artifactIndex: any[];     // 产物索引
    workingMemory: Record<string, any>;
    metadata: {
      totalTokens: number;
      llmCallsCount: number;
      skillCallsCount: number;
      lastCompressedAt?: Date;
    };
  } | null;

  // 执行元数据
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
    userId?: string;
  };

  // Motia 服务引用
  services: {
    streams: any;
    logger: any;
    emit: any;
  };
}
```

**task vs originalTask**:
```typescript
// task (包含历史)
task = `
## Conversation History
[user]: 生成一个视频
[assistant]: 好的，我将生成视频...
[user]: 添加动画效果

## Current Task
添加动画效果
`;

// originalTask (纯粹的用户请求)
originalTask = "添加动画效果";
```

### 2.5 PTC (Python Task Code)

**定义**: LLM 生成的 Python 执行代码

**生成流程**:
```typescript
// Step 1: 选择 Skill
const plan = await ptcGenerator.planSkills(task);
// → { selectedSkills: ['remotion-generator'], reasoning: '...' }

// Step 2: 生成代码
const code = await ptcGenerator.generateCode(task, plan.selectedSkills);
// → Python 代码 (async def main(): ...)

// Step 3: 在 Sandbox 中执行
const result = await sandbox.execute(code);
```

**PTC 代码特点**:
- 异步执行 (async/await)
- 调用 SkillExecutor
- 包含重试逻辑 (execute_with_retry)
- 返回统一格式

**示例**:
```python
# PTC 生成的内容
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='remotion-generator',
    input_data={
        'task': '生成一个视频',
    }
)

if result['success']:
    print(result['content'])
else:
    error = result['content'].get('message', 'Unknown error')
    print(f"Error: {error}")
```

### 2.6 Skill (技能)

**定义**: 可复用的功能单元

**SkillMetadata 结构**:
```typescript
interface SkillMetadata {
  name: string;              // 技能名称
  description: string;        // 功能描述
  tags: string[];            // 标签 (用于搜索)
  type: 'pure-prompt' | 'pure-script' | 'hybrid';
  metadata: {
    input_schema: {          // 输入参数定义
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        default?: any;
      }>;
      required: string[];
    };
    output_schema: object;    // 输出定义
  };
}
```

**Skill 执行流程**:
```
PTC 代码
  ↓
SkillExecutor.execute(skillName, inputData)
  ↓
SkillHook.preExec() (Skill 级别钩子)
  ↓
Skill Handler 执行
  ↓
SkillHook.postExec()
  ↓
返回: { success, content, result_type, metadata }
```

### 2.7 Context (上下文)

**定义**: 多轮对话的状态管理

**两个层次的上下文**:

#### 2.7.1 TaskContext (持久化上下文)

**存储位置**: Database
**生命周期**: 跨 Task 继承
**用途**: 多轮对话压缩、历史追踪

```typescript
interface TaskContext {
  taskId: string;
  sessionId: string;
  currentTurn: number;

  // 对话历史
  messages: Message[];

  // 压缩摘要
  summary: StructuredSummary;

  // 产物索引
  artifactIndex: ArtifactIndex[];

  // 临时工作内存
  workingMemory: Record<string, any>;

  // 元数据
  metadata: {
    totalTokens: number;
    llmCallsCount: number;
    skillCallsCount: number;
    lastCompressedAt?: Date;
  };
}
```

#### 2.7.2 SessionState (内存上下文)

**存储位置**: Agent 内存
**生命周期**: 绑定 Session
**用途**: 会话状态管理

```typescript
interface SessionState {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
  conversationHistory: Array<{...}>;
  executionHistory: Array<{...}>;
  variables: Map<string, any>;
}
```

**上下文继承流程**:
```
Session: "session-123"
  │
  ├─ Task 1 (第一个任务)
  │   ├─ 创建 TaskContext (初始)
  │   ├─ messages: []
  │   ├─ currentTurn: 0
  │   └─ 保存到 DB
  │
  ├─ Task 2 (第二个任务)
  │   ├─ ContextManager.createTaskContext()
  │   ├─ 查找最近上下文 → 找到 Task 1
  │   ├─ 继承 messages, summary, artifacts
  │   ├─ currentTurn: 1
  │   └─ 执行任务 (带历史上下文)
  │
  └─ Task N (第 N 个任务)
      └─ 继承 Task N-1 的上下文
```

**上下文压缩**:
- **触发条件**:
  - 消息数量 > 20 条
  - Token 数量 > 10000
  - 距上次压缩 > 1 小时

- **压缩策略**:
  - 保留最近 20 条消息
  - 旧消息压缩为 StructuredSummary
  - 保存压缩历史

### 2.8 Sandbox (沙箱)

**定义**: 隔离的 Python 执行环境

**支持的适配器**:
- **LocalSandbox**: 本地进程执行
- **DaytonaSandbox**: 云环境 (计划中)
- **E2BSandbox**: 云环境 (计划中)

**SandboxResult 结构**:
```typescript
interface SandboxResult {
  success: boolean;
  output?: any;              // 输出数据
  error?: SandboxError;      // 错误信息
  executionTime: number;     // 执行时间
  sessionId: string;
  stdout?: string;           // 标准输出
  stderr?: string;           // 标准错误
  structuredOutput?: StructuredOutput;  // 统一输出格式
}

interface StructuredOutput {
  result_type: 'video' | 'image' | 'code' | 'text' | 'markdown' | 'json' | 'table' | 'error' | 'infographic' | 'audio' | 'gif' | 'report' | 'mixed';
  success: boolean;
  content: any;
  metadata?: {
    execution_time: number;
    skills_used?: string[];
    [key: string]: any;
  };
  title?: string;
  description?: string;
}
```

### 2.9 Memory (长期记忆)

**定义**: 用户级别的长期记忆，用于个性化决策和用户画像

**核心特点**:
- **用途**: 个性化决策、用户画像、行为模式学习
- **时效性**: 长期、相对稳定
- **作用域**: 用户级别 (跨 Session 复用)
- **更新频率**: 低频

**Memory 的核心数据结构**:

| 数据类型 | 内容 | 更新频率 | 典型用途 |
|----------|------|----------|----------|
| **UserProfile** | 用户基本信息 | 低 | 用户画像 |
| **UserPreferences** | 用户偏好设置 | 中 | 个性化配置 |
| **BehaviorHistory** | 行为历史 | 高 | 模式学习 |
| **SuccessPatterns** | 成功模式 | 中 | 复用成功经验 |
| **Failures** | 失败案例 | 低 | 避免重复错误 |

#### 2.9.1 UserProfile (用户画像)

**内容**:
- 用户基本信息：角色、经验、行业
- 技能标签：python, react, video-editing
- 使用统计：总任务数、成功率、平均执行时间

**用途**:
- 识别用户类型 (开发者/设计师/产品经理)
- 调整交互风格 (简洁/详细/友好)
- 提供个性化建议

#### 2.9.2 UserPreferences (用户偏好)

**内容**:
- **交互偏好**: 语言、响应风格、通知级别
- **技能偏好**: 优先使用的技能、避免使用的技能、自定义参数
- **上下文偏好**: 压缩阈值、历史保留轮数
- **输出偏好**: 默认格式、质量级别、是否包含元数据

**用途**:
- 自动参数预填充
- Skill 选择优化
- 输出格式定制

#### 2.9.3 BehaviorHistory (行为历史)

**内容**:
- 最近任务历史 (任务、成功/失败、执行时间、使用的技能)
- 技能使用频率统计
- 时间模式 (活跃时段、活跃日期)

**用途**:
- 预测用户需求
- 优化技能推荐
- 识别使用模式

#### 2.9.4 SuccessPatterns (成功模式)

**内容**:
- 任务 → 成功配置映射
- 成功的技能组合
- 成功的参数配置
- 成功案例索引

**用途**:
- 自动复用成功配置
- 智能推荐
- 加速任务执行

#### 2.9.5 Failures (失败案例)

**内容**:
- 任务失败记录
- 尝试的技能组合
- 错误信息和解决方案
- 已知陷阱和规避建议

**用途**:
- 避免重复错误
- 提供替代方案
- 智能错误恢复

### 2.10 Knowledge (通用知识)

**定义**: 静态的通用知识库，为 Agent 提供外部知识和参考信息

**核心特点**:
- **用途**: 补充通用信息，不依赖用户
- **时效性**: 静态知识
- **作用域**: 全局共享
- **更新方式**: 版本发布/定期更新

**三种形态**:

| 形态 | 实现状态 | 适用场景 | 知识量 | 复杂度 |
|------|----------|----------|--------|--------|
| **Skill** | ✅ 已实现 | 工具/能力调用 | 小 | 已完成 |
| **Markdown 知识库** | 🚧 计划中 | 产品文档、API 参考 | 小-中 | 简单 |
| **RAG 系统** | ⏳ 未来 | 企业知识库、大知识量 | 大 | 中等-复杂 |

#### 2.10.1 Skill (技能知识)

**特点**:
- 动态可执行的工具
- 有明确的输入输出 schema
- 可被发现和自动调用

**内容**:
- 技能元数据 (名称、描述、标签)
- 输入参数定义
- 输出格式定义

**典型示例**:
- remotion-generator: 视频生成技能
- simple-code-generator: 代码生成技能
- web-search: 网络搜索技能

#### 2.10.2 Markdown 知识库

**特点**:
- 静态文档
- 直接读取
- 适合小知识量 (几个文档)

**典型场景**:
- 产品使用手册
- API 参考文档
- 项目架构文档
- 编码规范

**配置示例**:
```yaml
markdown:
  enabled: true
  basePaths:
    - ./docs/product-manual
    - ./docs/api-reference
    - ./docs/architecture
  maxFiles: 50  # 限制文件数量，避免加载过多
```

**使用方式**:
- 根据关键词搜索文档
- 直接注入相关文档内容到 LLM 提示词
- 适合快速参考和查阅

#### 2.10.3 RAG 系统 (未来)

**特点**:
- 向量检索
- 适合大知识量 (数千个文档)
- 需要向量数据库支持

**典型场景**:
- 企业知识库
- 技术文档库
- 法律法规库
- 医疗知识库

**工作原理**:
1. 文档分块并转换为向量
2. 存储到向量数据库
3. 查询时将问题转换为向量
4. 检索最相关的文档块
5. 注入到 LLM 提示词

**配置示例**:
```yaml
rag:
  enabled: true
  vectorDb:
    type: chroma  # 或 pinecone, weaviate, qdrant
    connectionString: http://localhost:8000
  embedding:
    provider: openai
    model: text-embedding-3-small
  retrieval:
    topK: 5  # 返回前 5 个最相关的结果
    threshold: 0.7  # 相似度阈值
```

### 2.11 Store (存储)

**定义**: 数据持久化层

**存储内容**:
- **Task**: 任务记录 (id, sessionId, task, status, ...)
- **Context**: 上下文 (TaskContext 完整结构)
- **Memory**: 长期记忆 (UserProfile, Preferences, ...)
- **Artifact**: 产物 (id, taskId, type, path, ...)
- **CompressionHistory**: 压缩历史

**支持的后端**:
- SQLite (开发环境)
- PostgreSQL (生产环境)
- Memory (测试环境)

---

## 三、钩子系统对比

### 3.1 Hook 作用域

```
┌─────────────────────────────────────────────────────────────────┐
│                     TaskHook (最大作用域)                       │
│                                                                 │
│  作用范围:   单次任务执行                                        │
│  触发频率:   每个 Task 一次                                      │
│  典型用途:   权限检查、指标收集、进度通知                         │
│                                                                 │
│   方法:                                                         │
│   ├─ preExec(context)           ← 任务执行前 (可中断)           │
│   ├─ postExec(context, result)  ← 任务执行后                   │
│   └─ onProgressingNotify(context) ← 任务进行中 (定期)          │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │              AgentHook (中等作用域)                     │  │
│   │                                                         │  │
│   │   作用范围:   Agent 生命周期                             │  │
│   │   触发频率:   每个 Agent 多次 (多个 Task)                │  │
│   │   典型用途:   上下文同步、进度通知、Agent 监控            │  │
│   │                                                         │  │
│   │   方法:                                                │  │
│   │   ├─ onAgentCreate(config, sessionId)       ← 创建时    │  │
│   │   ├─ onAgentAcquire(agent, sessionId)      ← 获取时    │  │
│   │   ├─ onTaskStart(task, taskId, context)   ← 任务开始  │  │
│   │   ├─ onTaskComplete(result, context)      ← 任务完成  │  │
│   │   ├─ onAgentStatusCheck(agent)            ← 定期检查   │  │
│   │   └─ onAgentDestroy(sessionId)            ← 销毁时    │  │
│   │                                                         │  │
│   │   ┌─────────────────────────────────────────────────┐  │  │
│   │   │            SkillHook (最小作用域)               │  │  │
│   │   │                                                 │  │  │
│   │   │   作用范围:   单次 Skill 执行                    │  │  │
│   │   │   触发频率:   每个 Skill 一次                    │  │  │
│   │   │   典型用途:   Skill 执行监控、日志、重试         │  │  │
│   │   │                                                 │  │  │
│   │   │   方法:                                        │  │  │
│   │   │   ├─ preExec(context)        ← Skill 执行前    │  │  │
│   │   │   ├─ postExec(context, result) ← Skill 执行后  │  │  │
│   │   │   └─ onProgressingNotify(context) ← 执行中     │  │  │
│   │   │                                                 │  │  │
│   │   └─────────────────────────────────────────────────┘  │  │
│   └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Hook 对比表

| 维度 | TaskHook | AgentHook | SkillHook |
|------|----------|-----------|-----------|
| **作用域** | 单次任务 | Agent 生命周期 | 单次 Skill |
| **触发频率** | 每个 Task 一次 | 每个 Agent 多次 | 每个 Skill 一次 |
| **状态共享** | 无状态 | 有状态 (跨 Task) | 无状态 |
| **中断能力** | 可以 (preExec) | 可以 (onAgentCreate) | 可以 (preExec) |
| **典型用途** | 权限检查、指标收集 | 上下文同步、监控 | 执行监控、日志 |
| **注册位置** | master-agent.step.ts | agentManager | SkillExecutor |

### 3.3 Hook 执行顺序

```
用户请求: "生成一个视频"
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. TaskHook.preExec()                                        │
│    ├─ DefaultTaskHook: 初始化                                │
│    ├─ ContextManagerTaskHook: 加载上下文                     │
│    ├─ UserProfileAccumulatorHook: 加载用户画像               │
│    ├─ UserAllowTaskHook: 权限检查                            │
│    └─ MetricsCollectorTaskHook: 指标初始化                   │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. AgentManager.acquire(sessionId)                           │
│    ├─ Session 已存在?                                        │
│    │   ├─ YES → 复用 Agent                                   │
│    │   └─ NO → 创建新 Agent                                  │
│    │                                                         │
│    ├─ AgentHook.onAgentCreate()    ← 创建时触发              │
│    └─ AgentHook.onAgentAcquire()   ← 获取时触发              │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. AgentHook.onTaskStart()                                   │
│    ├─ AgentMonitoringHook: 发送 intent_analysis 事件         │
│    ├─ AgentContextSyncHook: 同步上下文到 Agent               │
│    └─ AgentProgressNotifyHook: 发送进度通知                  │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. agent.run(task, taskId, context)                          │
│    │                                                         │
│    ├─ Step 1: PTCGenerator.generate(task)                   │
│    │   ├─ planSkills()    → LLM 选择 Skill                  │
│    │   └─ generateCode()  → LLM 生成 Python 代码            │
│    │                                                         │
│    ├─ Step 2: Sandbox.execute(ptcCode)                      │
│    │   ├─ 执行 Python 代码                                   │
│    │   ├─ 调用 SkillExecutor.execute()                       │
│    │   ├─ SkillHook.preExec() / postExec()                  │
│    │   └─ 返回 SandboxResult                                │
│    │                                                         │
│    └─ Step 3: 返回 AgentResult                              │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. AgentHook.onTaskComplete(result)                          │
│    └─ 发送完成通知                                           │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. TaskHook.postExec(context, result)                        │
│    ├─ DefaultTaskHook: 清理资源                              │
│    ├─ ContextManagerTaskHook: 保存上下文                     │
│    ├─ UserProfileAccumulatorHook: 更新用户画像               │
│    ├─ MetricsCollectorTaskHook: 记录指标                     │
│    └─ (如果需要) 压缩上下文                                   │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
返回结果给用户
```

---

## 四、数据流转关系

### 4.1 完整执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: 用户发起请求                                            │
└─────────────────────────────────────────────────────────────────┘
POST /agent/execute
{
  "task": "生成一个视频",
  "sessionId": "session-123",  // 可选
  "availableSkills": [],         // 可选
  "useDelegation": false         // 可选
}
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: agent-api.step.ts (HTTP 接收)                          │
└─────────────────────────────────────────────────────────────────┘
- 生成唯一 taskId
- emit('agent.task.execute', { taskId, task, sessionId, ... })
- 返回 { success: true, taskId }
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: master-agent.step.ts (事件处理)                        │
└─────────────────────────────────────────────────────────────────┘
  │
  ├─ 3.1 构建 TaskContext
  │       {
  │         taskId: "task-xxx",
  │         sessionId: "session-123",
  │         task: "生成一个视频",
  │         originalTask: "生成一个视频",
  │         status: "pending",
  │         context: null,
  │         metadata: { createdAt, updatedAt, ... },
  │         services: { streams, logger, emit }
  │       }
  │
  ├─ 3.2 TaskHook.preExec(context)
  │       ├─ DefaultTaskHook: 初始化
  │       ├─ ContextManagerTaskHook: 加载历史上下文
  │       ├─ UserAllowTaskHook: 权限检查
  │       └─ MetricsCollectorTaskHook: 指标初始化
  │
  ├─ 3.3 AgentManager.acquire(sessionId)
  │       ├─ 触发: AgentHook.onAgentCreate()
  │       ├─ 触发: AgentHook.onAgentAcquire()
  │       └─ 返回: Agent (复用或新建)
  │
  ├─ 3.4 AgentHook.onTaskStart(task, taskId, context)
  │       ├─ AgentMonitoringHook → Stream: intent_analysis
  │       ├─ AgentContextSyncHook → 同步上下文到 Agent
  │       └─ AgentProgressNotifyHook → 进度通知
  │
  ├─ 3.5 ContextManager.getContextForLLM(taskId)
  │       └─ 返回: "## Summary\n...\n## Recent Messages\n..."
  │
  ├─ 3.6 agent.run(task, taskId, context)
  │       │
  │       ├─ 3.6.1 notifyIntentAnalysis(task)
  │       │       └─ Stream: intent_analysis 事件
  │       │
  │       ├─ 3.6.2 PTCGenerator.generate(task, options)
  │       │       │
  │       │       ├─ planSkills(task)
  │       │       │       ├─ LLM 分析任务
  │       │       │       ├─ 从 SkillRegistry 选择
  │       │       │       └─ 返回: { selectedSkills, reasoning }
  │       │       │
  │       │       └─ generateCode(task, selectedSkills)
  │       │               ├─ LLM 生成 Python 代码
  │       │               └─ 返回: ptcCode (string)
  │       │
  │       ├─ 3.6.3 notifyPTCPlanning(ptcResult)
  │       │       └─ Stream: ptc_planning 事件
  │       │
  │       ├─ 3.6.4 Sandbox.execute(ptcCode, options)
  │       │       │
  │       │       ├─ 执行 Python 代码
  │       │       ├─ 调用 SkillExecutor.execute()
  │       │       │       ├─ SkillHook.preExec()
  │       │       │       ├─ Skill Handler 执行
  │       │       │       └─ SkillHook.postExec()
  │       │       │
  │       │       └─ 返回: SandboxResult
  │       │               ├─ success: boolean
  │       │               ├─ output: any
  │       │               ├─ executionTime: number
  │       │               └─ structuredOutput?: StructuredOutput
  │       │
  │       └─ 3.6.5 返回 AgentResult
  │               ├─ success: boolean
  │               ├─ output: string
  │               ├─ steps: AgentStep[]
  │               ├─ executionTime: number
  │               └─ metadata: { llmCalls, skillCalls, ... }
  │
  ├─ 3.7 AgentHook.onTaskComplete(result, context)
  │       └─ 发送完成通知
  │
  ├─ 3.8 TaskHook.postExec(context, result)
  │       ├─ DefaultTaskHook: 清理资源
  │       ├─ ContextManagerTaskHook: 保存上下文
  │       ├─ MetricsCollectorTaskHook: 记录指标
  │       └─ (如果需要) ContextCompressor.compress()
  │
  └─ 3.9 emit('agent.task.completed')
          └─ 返回结果给用户
```

### 4.2 上下文数据流

```
Session: "session-123"

┌──────────────────────────────────────────────────────────────┐
│ Task 1: "生成一个视频"                                         │
└──────────────────────────────────────────────────────────────┘
  │
  ├─ ContextManager.createTaskContext(taskId1, sessionId, input)
  │       │
  │       ├─ 查找历史上下文 → 无 (第一个任务)
  │       │
  │       ├─ 创建新的 TaskContext
  │       │   ├─ messages: []
  │       │   ├─ currentTurn: 0
  │       │   ├─ summary: {}
  │       │   └─ artifactIndex: []
  │       │
  │       └─ 保存到 Database
  │
  ├─ 执行任务...
  │
  ├─ ContextManager.addMessage(taskId1, { role: 'user', content: '生成一个视频' })
  │       └─ messages: [{ role: 'user', content: '生成一个视频', ... }]
  │
  ├─ ContextManager.addMessage(taskId1, { role: 'assistant', content: '好的，我将生成视频...' })
  │       └─ messages: [..., { role: 'assistant', content: '好的，我将生成视频...', ... }]
  │
  └─ currentTurn → 1

┌──────────────────────────────────────────────────────────────┐
│ Task 2: "添加动画效果" (继承 Task 1 的上下文)                   │
└──────────────────────────────────────────────────────────────┘
  │
  ├─ ContextManager.createTaskContext(taskId2, sessionId, input)
  │       │
  │       ├─ 查找历史上下文 → 找到 Task 1
  │       │
  │       ├─ 继承 Task 1 的上下文
  │       │   ├─ messages: [从 Task 1 继承的 2 条消息]
  │       │   ├─ currentTurn: 1 (从 Task 1 继承)
  │       │   ├─ summary: { ... }
  │       │   └─ artifactIndex: [ ... ]
  │       │
  │       ├─ 更新 currentTask
  │       │   └─ summary.currentTask = "添加动画效果"
  │       │
  │       └─ 保存到 Database
  │
  ├─ 生成带历史的任务描述
  │       │
  │       └─ taskWithContext = `
  │           ## Conversation History
  │           [user]: 生成一个视频
  │           [assistant]: 好的，我将生成视频...
  │
  │           ## Current Task
  │           添加动画效果
  │           `
  │
  ├─ 执行任务 (带历史上下文)
  │
  ├─ 添加新消息
  │       └─ messages: [..., { role: 'user', content: '添加动画效果' }, ...]
  │
  └─ currentTurn → 2

┌──────────────────────────────────────────────────────────────┐
│ Task 3: "导出视频" (继承 Task 1, 2 的上下文)                    │
└──────────────────────────────────────────────────────────────┘
  │
  └─ 继承 Task 2 的上下文 (包含 Task 1 和 Task 2 的所有历史)
```

### 4.3 Stream 事件流

```
┌──────────────────────────────────────────────────────────────┐
│ Agent 级别事件 (AgentHook 触发)                               │
└──────────────────────────────────────────────────────────────┘
  │
  ├─ intent_analysis     (意图分析)
  │       └─ AgentMonitoringHook 触发
  │       └─ { type: 'intent_analysis', data: { intent, reasoning, category } }
  │
  ├─ ptc_planning        (PTC 规划)
  │       └─ AgentMonitoringHook 触发
  │       └─ { type: 'ptc_planning', data: { selectedSkills, reasoning, executionPlan } }
  │
  └─ skill_selection     (技能选择)
          └─ AgentMonitoringHook 触发
          └─ { type: 'skill_selection', data: { skills, plan } }

┌──────────────────────────────────────────────────────────────┐
│ Task 级别事件 (TaskHook 触发)                                │
└──────────────────────────────────────────────────────────────┘
  │
  ├─ heartbeat           (心跳)
  │       └─ TaskHook.onProgressingNotify 触发
  │       └─ { type: 'heartbeat', status: 'running', timestamp }
  │
  ├─ status_update       (状态更新)
  │       └─ { type: 'status_update', status: 'completed', output }
  │
  └─ error               (错误)
          └─ { type: 'error', error: '...', timestamp }

┌──────────────────────────────────────────────────────────────┐
│ 聊天事件 (Agent 回复时触发)                                  │
└──────────────────────────────────────────────────────────────┘
  │
  └─ chat                (聊天消息)
          └─ { type: 'chat', role: 'assistant', content: '...', timestamp }
```

---

## 五、关键概念对比

### 5.1 Task vs Session

| 维度 | Task | Session |
|------|------|---------|
| **定义** | 单次任务执行 | 会话容器 |
| **生命周期** | 短期 (完成即结束) | 长期 (timeout 后清理) |
| **状态** | TaskStatus (pending/running/completed/failed) | SessionState (内存状态) |
| **关系** | 1 Task → 1 Session | 1 Session → N Tasks |
| **上下文** | TaskContext (可继承) | 无 (通过 Agent 管理) |
| **存储** | Database (持久化) | Memory (Agent 内部) |

### 5.2 TaskContext vs SessionState

| 维度 | TaskContext | SessionState |
|------|-------------|--------------|
| **存储位置** | Database | Agent 内存 |
| **生命周期** | 持久化 (跨 Session) | 绑定 Session |
| **范围** | 单次任务 (可继承) | 整个会话 |
| **内容** | messages, summary, artifacts | conversationHistory, variables |
| **用途** | 多轮对话压缩、历史追踪 | 会话状态管理、变量存储 |
| **继承性** | 可跨 Task 继承 | 不可继承 |

### 5.3 task vs originalTask

| 维度 | task | originalTask |
|------|------|--------------|
| **定义** | 完整任务描述 | 原始用户请求 |
| **内容** | 包含对话历史 | 不含历史 |
| **格式** | "## Conversation History\n...\n## Current Task\n..." | 纯文本描述 |
| **用途** | 传递给 LLM 生成 PTC | 保存真实意图 |
| **示例** | (见 2.4 节) | (见 2.4 节) |

### 5.4 PTC vs Code

| 维度 | PTC | Code |
|------|-----|------|
| **全称** | Python Task Code | 通用代码 |
| **格式** | 异步 Python | 任意语言 |
| **特点** | 调用 Skill | 直接执行 |
| **生成** | PTCGenerator (LLM) | 人工或其他工具 |
| **执行** | Sandbox | 直接运行 |

### 5.5 Agent vs MasterAgent

| 维度 | Agent | MasterAgent |
|------|-------|-------------|
| **类型** | 基础代理 | 支持委派的代理 |
| **执行** | 直接执行任务 | 可以委派给 SubAgent |
| **适用场景** | 简单任务 | 复杂任务 (需要分工) |
| **示例** | 生成视频 | 审查代码 (委派给 code-reviewer) |

### 5.6 Context vs Memory vs Knowledge

| 维度 | Context 层 | Memory 层 | Knowledge 层 |
|------|-----------|-----------|--------------|
| **本质** | "正在发生什么" | "学到了什么/偏好什么" | "知道什么" |
| **时效性** | 短期、动态 | 长期、相对稳定 | 静态、通用 |
| **作用域** | 单次任务/会话 | 用户级别 | 全局共享 |
| **数据示例** | 对话历史、执行状态 | 用户偏好、画像 | 技能定义、文档 |
| **存储位置** | Database (可压缩) | Database (长期) | 文件系统/Database |
| **更新频率** | 实时 | 低频 | 版本发布/定期 |
| **继承性** | 跨 Task 继承 | 跨 Session 继承 | 无需继承 |
| **容量** | 有限 (会压缩) | 大 | 很大 |
| **典型用途** | 理解当前任务 | 个性化决策 | 补充通用知识 |

#### 使用场景指南

**何时使用 Context**:
- ✅ 理解当前对话状态
- ✅ 追踪任务执行进度
- ✅ 维护对话历史
- ✅ 管理任务产物

**何时使用 Memory**:
- ✅ 个性化决策 (如技能选择)
- ✅ 参数预填充 (如用户偏好)
- ✅ 复用成功经验
- ✅ 避免重复错误

**何时使用 Knowledge**:
- ✅ 查询工具使用方法
- ✅ 参考产品文档
- ✅ 获取最佳实践
- ✅ 学习新的技术知识

---

## 六、最佳实践

### 6.1 Hook 使用建议

#### 何时使用 TaskHook

- ✅ 每次任务都需要执行的操作
  - 权限检查
  - 指标收集
  - 资源初始化/清理

- ✅ 需要中断任务执行
  - 用户确认
  - 资源检查
  - 验证失败

- ✅ 任务级别的进度通知
  - 定期心跳
  - 状态更新

- ❌ 不适合跨 Task 共享状态

#### 何时使用 AgentHook

- ✅ 需要跨 Task 共享状态
  - Agent 级别变量
  - 会话统计

- ✅ 监控 Agent 生命周期
  - 创建/销毁事件
  - 状态检查

- ✅ Agent 级别的进度通知
  - 意图分析
  - PTC 规划
  - 技能选择

- ✅ 同步 Agent 和数据库状态
  - 上下文同步

- ❌ 不适合单次任务的操作

#### 何时使用 SkillHook

- ✅ 监控 Skill 执行
  - 重试、超时
  - 性能指标

- ✅ Skill 级别的日志
  - 参数记录
  - 结果记录

- ✅ 修改 Skill 输入输出
  - 数据转换
  - 结果处理

### 6.2 上下文管理建议

#### 短期对话 (5 轮以内)

```typescript
// 直接使用 messages，无需压缩
const context = await contextManager.getContext(taskId);
// messages 数量 < 5，直接使用
```

#### 中期对话 (5-20 轮)

```typescript
// 启用自动压缩
const context = await contextManager.getContext(taskId);
// 当 messages > 20 时，自动触发压缩
if (compressor.shouldCompress(context)) {
  const compressed = await compressor.compress(context, llmSummarize);
}
```

#### 长期对话 (20+ 轮)

```typescript
// 定期清理，保留摘要
const context = await contextManager.getContext(taskId);
// 保留最近 20 条 + 压缩摘要
// 关键决策保存到 decisionsMade
// 重要产物记录到 artifactIndex
```

### 6.3 性能优化建议

#### Agent 复用

```typescript
// ✅ 推荐: 复用 Agent (通过 sessionId)
const agent = await agentManager.acquire(sessionId);
await agent.run(task1);
await agent.run(task2);  // 复用同一个 Agent

// ❌ 不推荐: 每个 Task 创建新 Agent
const agent1 = await agentManager.acquire(sessionId1);
const agent2 = await agentManager.acquire(sessionId2);
```

#### 上下文压缩

```typescript
// ✅ 推荐: 定期压缩上下文
await contextManager.addMessage(taskId, message);
// ContextManager 自动检测并压缩

// ❌ 不推荐: 无限累积消息
// messages 数量过大 → 性能下降
```

#### Skill 选择

```typescript
// ✅ 推荐: 让 PTCGenerator 自动选择
const agent = await agentManager.acquire(sessionId);
// 不指定 availableSkills，让 LLM 选择

// ❌ 不推荐: 过度限制 Skill
const agent = await agentManager.acquire(sessionId, {
  availableSkills: ['specific-skill']  // 限制过死
});
```

---

## 七、常见问题

### Q1: Agent 和 MasterAgent 有什么区别？

**A:**
- **Agent**: 基础代理，直接执行任务
- **MasterAgent**: 支持委派的代理，可以调用 SubAgent

```typescript
// 使用 Agent
const agent = await agentManager.acquire(sessionId, { agentType: 'agent' });
await agent.run('生成一个视频');

// 使用 MasterAgent
const masterAgent = await agentManager.acquire(sessionId, { agentType: 'master' });
await masterAgent.run('审查这段代码');  // 会委派给 code-reviewer
```

### Q2: Task 和 originalTask 有什么区别？

**A:**
- **task**: 包含对话历史的完整任务描述
- **originalTask**: 用户原始请求 (不含历史)

```typescript
// task (包含历史)
task = `
## Conversation History
[user]: 生成一个视频
[assistant]: 好的，我将生成视频...

## Current Task
添加动画效果
`;

// originalTask (纯粹的用户请求)
originalTask = '添加动画效果';
```

**用途**:
- `task`: 传递给 LLM 生成 PTC
- `originalTask`: 保存真实意图，用于通知

### Q3: 什么时候需要手动 release Agent？

**A:**
- **通常不需要**: AgentManager 自动清理过期会话
- **需要清理的情况**:
  - 用户明确退出
  - 内存压力大
  - 测试环境重置

```typescript
// 手动释放
await agentManager.release(sessionId);
```

### Q4: Context 压缩什么时候触发？

**A:**
- **自动触发条件**:
  - 消息数量 > 20 条
  - Token 数量 > 10000
  - 距上次压缩 > 1 小时

```typescript
// ContextCompressor 内部逻辑
if (context.messages.length > 20 ||
    context.metadata.totalTokens > 10000 ||
    shouldCompressByTime(context.metadata.lastCompressedAt)) {
  return true;
}
```

### Q5: Stream 事件有哪些类型？

**A:**
- **Agent 级别**: intent_analysis, ptc_planning, skill_selection
- **Task 级别**: heartbeat, status_update
- **聊天**: chat (role: user/assistant)
- **错误**: error

### Q6: TaskHook 和 AgentHook 的范围区别？

**A:**
- **TaskHook**: 关注单次任务执行，每个 Task 触发一次
- **AgentHook**: 关注 Agent 生命周期，每个 Agent 触发多次

```
TaskHook (更大范围)
  └─ 每个 Task 一次
  └─ 无状态

AgentHook (中等范围)
  └─ 每个 Agent 多次
  └─ 有状态 (跨 Task)
```

### Q7: 如何选择 Hook 类型？

**A:**
| 需求 | 推荐的 Hook |
|------|------------|
| 权限检查 (每次任务) | TaskHook |
| 指标收集 (每次任务) | TaskHook |
| 上下文同步 (跨任务) | AgentHook |
| 意图分析 (Agent 级别) | AgentHook |
| Skill 监控 | SkillHook |

### Q8: Context 和 Memory 的边界在哪里？

**A:**
核心区别可以用一个简单的问题判断：**"这个信息是关于'正在做什么'还是'学到了什么'？"**

- **Context (正在做什么)**:
  - 当前对话内容
  - 当前任务进度
  - 当前执行状态
  - 临时数据 (workingMemory)

- **Memory (学到了什么)**:
  - 用户偏好 (喜欢什么风格)
  - 用户画像 (开发者/设计师)
  - 成功模式 (哪些配置有效)
  - 失败案例 (哪些配置无效)

**判断标准**:
- 如果信息会随每次对话改变 → Context
- 如果信息是用户长期特征 → Memory
- 如果信息需要跨会话保留 → Memory
- 如果信息只对当前任务有用 → Context

### Q9: Knowledge 的三种形态应该选择哪种？

**A:**
根据知识量和更新频率选择：

| 知识量 | 更新频率 | 推荐方案 | 示例 |
|--------|----------|----------|------|
| 小 (1-10个文档) | 低 | Markdown 知识库 | API 参考、产品手册 |
| 中 (10-100个文档) | 中 | Markdown + 简单搜索 | 项目文档、规范 |
| 大 (100+个文档) | 高 | RAG 系统 | 企业知识库、技术文档 |

**具体建议**:
- **开发阶段**: 使用 Markdown 知识库 (快速迭代)
- **生产阶段**: 评估知识量，必要时升级到 RAG
- **混合使用**: Skill + Markdown 知识库 (最常见)

### Q10: 三层数据源如何协同工作？

**A:**
```
用户请求: "如何使用 remotion-generator 生成视频？"
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 1: 分析请求意图                                         │
└─────────────────────────────────────────────────────────────┘
  │
  ├─ 意图: "使用 remotion-generator"
  ├─ 关键词: ["remotion-generator", "生成", "视频"]
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2: 加载 Memory (用户偏好)                              │
└─────────────────────────────────────────────────────────────┘
  │
  ├─ 用户角色: Designer
  ├─ 偏好风格: Modern
  ├─ 成功案例: 之前使用 remotion-generator 成功过
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 3: 查询 Knowledge (通用知识)                            │
└─────────────────────────────────────────────────────────────┘
  │
  ├─ Skills: remotion-generator 的 schema
  ├─ Markdown: remotion-generator 使用文档
  ├─ RAG: 相关的示例和最佳实践 (如果启用)
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 4: 构建 Enriched Context (丰富上下文)                   │
└─────────────────────────────────────────────────────────────┘
  │
  ├─ Context: 对话历史、执行状态
  ├─ Memory: 用户偏好、成功模式
  └─ Knowledge: 技能定义、使用文档
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Agent 决策                                           │
└─────────────────────────────────────────────────────────────┘
  │
  ├─ 考虑用户偏好 (Modern 风格)
  ├─ 使用成功的配置
  ├─ 参考知识库文档
  └─ 生成个性化的 PTC 代码
```

**关键点**:
- 三层数据源互相补充，不是替代关系
- Memory 提供个性化，Knowledge 提供通用性
- Context 提供当前状态，确保连贯性
- 最终目标是提供更智能、更个性化的 Agent 决策

---

## 总结

MyAgent 系统的核心概念可以概括为：

### 层级关系
```
User → Session → Agent → Task → PTC → Skill
```

### Hook 作用域
```
TaskHook > AgentHook > SkillHook
```

### 三大核心
```
Context (多轮对话) + Sandbox (隔离执行) + Store (持久化)
```

### 上下文工程三层架构
```
Context (短期/动态) + Memory (长期/稳定) + Knowledge (静态/通用)
```

**三层协同**:
- **Context**: "正在做什么" → 理解当前任务状态
- **Memory**: "学到了什么" → 个性化决策
- **Knowledge**: "知道什么" → 补充通用知识

### 通信机制
```
Stream (实时通信) + Event (事件驱动)
```

理解这些概念及其关系，有助于：
- ✅ 正确选择 Hook 类型
- ✅ 合理管理上下文
- ✅ 高效追踪问题
- ✅ 扩展系统功能
- ✅ 设计个性化 Agent
- ✅ 构建智能知识库
