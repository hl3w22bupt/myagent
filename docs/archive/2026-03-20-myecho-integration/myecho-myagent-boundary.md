# MyEcho 与 myagent 职责边界共识文档

**版本**: v1.0
**日期**: 2025-02-25
**状态**: 待双方对齐确认

---

## 文档目的

本文档定义 **MyEcho 应用层** 与 **myagent 基础层** 之间的清晰职责边界，确保两个系统的架构合理、职责清晰、协作顺畅。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MyEcho 应用层                                     │
│  (业务系统：AI 情感伴侣应用)                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐         ┌─────────────────┐                            │
│  │  Flutter 客户端  │ ◄─────► │  MyEcho 后端    │                            │
│  │                 │  API    │   (Motia)        │                            │
│  └─────────────────┘         └────────┬────────┘                            │
│                                       ↓ HTTP API                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                       ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         myagent 基础层                                      │
│  (通用多智能体系统)                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  POST /agent/execute                                                         │
│  { task, userId, sessionId, userContext }                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 核心原则

### 1. 分层设计
- **myagent**: 底层通用的分布式多智能体系统
- **MyEcho**: 上层业务应用，调用 myagent 提供的 AI 能力

### 2. 职责分离
- myagent 提供**通用的 AI 能力**，不包含业务逻辑
- MyEcho 负责**业务逻辑和用户体验**，不重复实现 AI 能力

### 3. 灵活扩展
- myagent 通过 Subagent、Skill、Hook 提供扩展点
- MyEcho 可以灵活组合这些能力，构建自己的业务

---

## 核心概念定义

### userId vs sessionId

| 概念 | 定义 | 示例 | 生命周期 |
|------|------|------|----------|
| **userId** | 用户的唯一标识，跨会话持久存在 | `echo-abc123` | 长期存在 |
| **sessionId** | 单次对话会话标识 | `chat-20250225-001` | 单次会话 |

**关系**:
```
1 userId ⟷ N sessionId
```

**说明**:
- `userId` 在 MyEcho 中对应 `echo_id`（AI 女友的唯一标识）
- `userId` 在 myagent 中标识一个"用户"实体
- 同一个 `userId` 下可以有多个 `sessionId`，每个 session 是一次独立的对话会话

### userContext

**定义**: AI 女友的配置包，`Record<string, string>` 类型

**描述主体**: AI 女友

**可包含的内容**:
- **AI 女友的身份信息**（来自 MyEcho 的 characters/avatars 表）
  - `name`: "小甜"
  - `personality`: "温柔体贴"
  - `avatar_style`: "pure"
  - `age`: "20"

- **人类用户的属性**（来自 MyEcho 的 user_preferences 表）
  - `user_style`: "直接"
  - `user_needs`: "需要安慰"
  - `user_mood`: "有点累"
  - `user_interests`: "游戏,动漫"

- **关系数据**（来自 MyEcho 的 intimacy_levels 表）
  - `intimacy_level`: "5"
  - `chat_days`: "30"
  - `nickname`: "宝贝"

- **环境上下文**（MyEcho 实时获取）
  - `time_of_day`: "晚上"
  - `weather`: "晴天"
  - `location`: "北京"

- **自定义扩展**（MyEcho 任意定义）
  - `custom_hint`: "用户今天过得很辛苦"
  - `special_momorandum`: "下周是用户生日"

**传递方式**:
```typescript
POST /agent/execute
{
  "task": "今天工作好累啊",
  "userId": "echo-abc123",
  "sessionId": "chat-20250225-001",
  "subagent": "emotional-girlfriend-sweet",
  "userContext": {
    "name": "小甜",
    "personality": "温柔体贴",
    "intimacy_level": "5",
    "user_mood": "有点累",
    "custom_hint": "任意自定义字段"
  }
}
```

**myagent 的处理**:
- ✅ 透传到 Subagent 的 Prompt 模板
- ❌ 不解释 `userContext` 的语义
- ❌ 不限制 key 和 value 的格式

### userProfile

**定义**: myagent 累积的 AI 女友行为画像

**描述主体**: AI 女友的行为模式

**数据来源**: myagent Hook 自动从对话中累积

**存储位置**: myagent `users` 表的 `profile` 字段（JSONB）

**数据结构**:
```typescript
interface UserProfile {
  userId: string;

  // 行为模式（跨所有 session 累积）
  behavior: {
    totalSessions: number;
    activeHours: number[];
    avgSessionLength: number;
    firstInteraction: Date;
  };

  // 回复风格（自动学习）
  responseStyle: {
    emotionDistribution: {
      happy: number;
      caring: number;
      playful: number;
      gentle: number;
    };
    avgResponseLength: number;
    commonPhrases: string[];
  };

  // 场景记忆（对话累积）
  responsePatterns: {
    [scenario: string]: {
      typicalEmotion: string;
      commonPhrases: string[];
      effectiveness: number;
    };
  };

  metadata: {
    lastUpdated: Date;
    version: number;
  };
}
```

---

## 职责划分

### MyEcho 职责

| 职责 | 说明 | 数据存储 |
|------|------|----------|
| **用户管理** | 设备 ID 认证、用户注册 | MyEcho PostgreSQL |
| **人设管理** | 3 个预设人设的元数据（name, description, subagent_id） | MyEcho PostgreSQL |
| **形象管理** | 4 个预设形象的图片 URL、风格 | MyEcho PostgreSQL |
| **用户档案** | 用户选择的人设、形象、昵称 | MyEcho PostgreSQL |
| **亲密度系统** | 等级计算、聊天天数统计、游戏化逻辑 | MyEcho PostgreSQL |
| **记忆档案展示** | 分类展示对话记忆（基础信息、偏好、事件、情绪） | MyEcho PostgreSQL |
| **人类用户画像** | 离线分析人类用户的偏好、习惯、兴趣 | MyEcho PostgreSQL |
| **构建 userContext** | 决定传递什么信息给 AI 女友，对效果负责 | 每次请求动态构建 |
| **调用 myagent** | 通过 `/agent/execute` API 调用 myagent | HTTP API |

**MyEcho 维护的数据表**:
```sql
-- 用户表（设备 ID 认证）
users (id, device_id, created_at)

-- 人设表
characters (id, name, description, personality, subagent_id, avatar_url)

-- 形象表
avatars (id, name, style, image_url)

-- 用户配置（关联人设和形象）
user_profiles (id, user_id, character_id, avatar_id, nickname)

-- 聊天会话表（MyEcho 业务层）
chat_sessions (id, user_id, character_id, echo_id, created_at)

-- 亲密度表
intimacy_levels (echo_id, level, chat_days, last_updated)

-- 人类用户偏好（离线分析）
user_preferences (user_id, communication_style, interests, emotional_needs)

-- 记忆分类展示（从 myagent 同步或自己分析）
memory_categories (echo_id, category, key, value)
```

### myagent 职责

| 职责 | 说明 | 数据存储 |
|------|------|----------|
| **LLM 对话生成** | 通用的大模型对话能力 | - |
| **多智能体协调** | MasterAgent 委托机制 | - |
| **流式响应** | WebSocket/SSE 实时推送 | - |
| **上下文工程** | 对话历史、摘要、压缩 | myagent PostgreSQL |
| **Session 管理** | 跨任务共享上下文 | myagent PostgreSQL |
| **用户画像累积** | 基于 userId 的行为画像累积 | myagent PostgreSQL |
| **Subagent 系统** | 可复用的 Agent 模板（包括 AI 女友） | myagent 文件系统 |
| **Skill 系统** | 可扩展的 Tools（包括 TTS） | myagent 文件系统 |
| **Hook 系统** | 任务生命周期钩子（用于画像累积） | myagent 代码 |

**myagent 维护的数据表**:
```sql
-- 用户表（userId 维度）
users (
  user_id TEXT PRIMARY KEY,
  profile JSONB,           -- AI 女友行为画像
  created_at BIGINT,
  updated_at BIGINT
)

-- 会话表（sessionId 维度）
sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,           -- 关联到 users 表
  context JSONB,
  summary JSONB,
  created_at BIGINT,
  updated_at BIGINT
)

-- 任务上下文表
task_contexts (
  task_id TEXT PRIMARY KEY,
  session_id TEXT,
  current_turn INTEGER,
  summary JSONB,
  working_memory JSONB,
  created_at BIGINT,
  updated_at BIGINT
)

-- 消息表
messages (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  role TEXT,
  content TEXT,
  metadata JSONB,
  created_at BIGINT
)

-- 产物索引表
artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  artifact_type TEXT,
  action TEXT,
  path TEXT,
  description TEXT,
  metadata JSONB,
  timestamp BIGINT
)
```

---

## API 接口定义

### myagent 提供的 API

#### 1. POST /agent/execute

**描述**: 提交任务执行请求

**请求参数**:
```typescript
interface ExecuteRequest {
  // 必需参数
  task: string;                  // 任务描述

  // 用户标识
  userId: string;                // ✅ 用户唯一标识（如 echo-abc123）
  sessionId?: string;            // 可选：会话标识（如 chat-20250225-001）

  // Subagent 配置
  subagent?: string;             // Subagent 名称
  systemPrompt?: string;         // 自定义系统提示
  availableSkills?: string[];    // 可用技能列表
  useDelegation?: boolean;       // 是否使用 MasterAgent
  delegateTo?: string[];         // 显式委托的 Subagent 列表

  // 用户上下文
  userContext?: Record<string, string>;  // ✅ AI 女友的配置包
}
```

**响应**:
```typescript
interface ExecuteResponse {
  taskId: string;
  sessionId: string;             // 实际使用的 sessionId
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
```

#### 2. GET /api/users/:userId

**描述**: 获取用户画像

**响应**:
```typescript
interface UserProfileResponse {
  userId: string;
  profile: UserProfile;
  sessions: string[];            // 该用户的所有 session IDs
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastSessionId: string;
  };
}
```

#### 3. GET /api/users/:userId/sessions

**描述**: 获取用户的所有会话

**响应**:
```typescript
interface UserSessionsResponse {
  userId: string;
  sessions: Array<{
    sessionId: string;
    createdAt: string;
    summary: any;
  }>;
  total: number;
}
```

#### 4. GET /api/sessions/:sessionId

**描述**: 获取会话详情

**响应**:
```typescript
interface SessionDetailResponse {
  sessionId: string;
  userId: string;
  context: TaskContext;
  summary: any;
  messages: Message[];
  artifacts: Artifact[];
}
```

#### 5. WebSocket /streams/taskExecution

**描述**: 实时任务执行流

**事件格式**:
```typescript
interface TaskExecutionEvent {
  taskId: string;
  type: 'task' | 'skill' | 'agent';
  status: 'pending' | 'started' | 'running' | 'completed' | 'failed';
  output?: string;
  metadata?: {
    llmCalls?: number;
    skillCalls?: number;
    totalTokens?: number;
  };
}
```

### MyEcho 提供的 API（供 Flutter 调用）

MyEcho 后端作为中转层，封装 myagent API，提供 Flutter 客户端调用的接口。

#### 1. POST /api/chat/sessions

**描述**: 创建聊天会话

#### 2. POST /api/chat/sessions/:echoId/messages

**描述**: 发送消息（内部调用 myagent `/agent/execute`）

#### 3. GET /api/characters

**描述**: 获取人设列表

#### 4. GET /api/avatars

**描述**: 获取形象列表

#### 5. GET /api/memories/:echoId

**描述**: 获取记忆档案（分类展示）

#### 6. GET /api/intimacy/:echoId

**描述**: 获取亲密度等级

---

## 数据流设计

### 完整对话流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 1: Flutter 客户端发送消息                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 2: MyEcho 后端处理                                                    │
│                                                                              │
│  2.1 验证设备用户                                                            │
│  2.2 读取 echo_id (userId)                                                  │
│  2.3 读取人类用户偏好 (user_preferences 表)                                  │
│  2.4 读取 AI 女友元数据 (characters, avatars 表)                              │
│  2.5 读取亲密度数据 (intimacy_levels 表)                                     │
│  2.6 构建 userContext                                                       │
│                                                                              │
│  userContext = {                                                            │
│    // AI 女友身份                                                           │
│    name: "小甜",                                                            │
│    personality: "温柔体贴",                                                  │
│    avatar_style: "pure",                                                    │
│                                                                              │
│    // 人类用户属性                                                          │
│    user_style: "直接",                                                      │
│    user_needs: "需要安慰",                                                  │
│    user_mood: "有点累",                                                      │
│                                                                              │
│    // 关系数据                                                              │
│    intimacy_level: "5",                                                     │
│    chat_days: "30",                                                         │
│    nickname: "宝贝",                                                        │
│                                                                              │
│    // 自定义                                                                │
│    custom_hint: "用户今天过得很辛苦"                                         │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 3: MyEcho 调用 myagent                                                 │
│                                                                              │
│  POST /agent/execute                                                        │
│  {                                                                          │
│    "task": "今天工作好累啊",                                                │
│    "userId": "echo-abc123",                                                 │
│    "sessionId": "chat-20250225-001",                                        │
│    "subagent": "emotional-girlfriend-sweet",                                │
│    "userContext": {...}                                                     │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 4: myagent 处理                                                        │
│                                                                              │
│  4.1 UserProfileAccumulatorHook.preExec()                                   │
│      - 从 users 表加载 userId 的画像                                         │
│      - 注入到 workingMemory.userProfile                                     │
│                                                                              │
│  4.2 ContextManager.createTaskContext()                                     │
│      - 创建任务上下文                                                       │
│      - userContext 存储到 workingMemory.userContext                         │
│      - 继承 session 的历史上下文                                             │
│                                                                              │
│  4.3 Subagent 渲染 Prompt                                                   │
│      - Handlebars 模板引擎                                                  │
│      - userContext 透传到模板                                               │
│      - 生成渲染后的 system_prompt                                           │
│                                                                              │
│  4.4 LLM 生成回复                                                           │
│      - 基于渲染后的 prompt                                                  │
│      - 参考 userProfile 的历史行为模式                                      │
│      - 生成回复 + emotion + memory_extract                                  │
│                                                                              │
│  4.5 TTS Skill (如果启用)                                                   │
│      - 调用火山引擎 TTS API                                                  │
│      - 返回 audio_url                                                       │
│                                                                              │
│  4.6 UserProfileAccumulatorHook.postExec()                                  │
│      - 提取本次会话的特征                                                   │
│      - 累积到 userId 的画像                                                 │
│      - 保存到 users 表                                                      │
│                                                                              │
│  4.7 流式响应推送                                                           │
│      - WebSocket /streams/taskExecution                                     │
│      - 推送生成进度和结果                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 5: MyEcho 后端接收响应                                                 │
│                                                                              │
│  5.1 更新亲密度 (chat_days++, intimacy_level++)                              │
│  5.2 分类存储记忆 (memory_categories 表)                                     │
│  5.3 转发到 Flutter 客户端                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  Step 6: Flutter 客户端展示                                                  │
│                                                                              │
│  6.1 显示消息气泡                                                            │
│  6.2 播放语音 (audio_url)                                                   │
│  6.3 更新亲密度进度条                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 关键设计决策

### 1. userContext 为什么是简单的 Record<string, string>？

**原因**:
- ✅ myagent 不需要理解业务语义
- ✅ MyEcho 可以自由扩展字段
- ✅ 灵活性最高，便于适配不同场景

**如果 MyEcho 组织的 userContext 不好**:
- 影响 AI 女友的回复质量
- MyEcho 负责优化 userContext 的构建
- myagent 不承担责任

### 2. 为什么 userId 和 sessionId 分开？

**原因**:
- ✅ `userId` 支持跨会话的画像累积
- ✅ `sessionId` 支持会话级别的上下文隔离
- ✅ 符合"用户"和"会话"的语义区分

**类比**:
- `userId` = 人的身份证号（唯一标识一个人）
- `sessionId` = 一次对话记录（标识单次交流）

### 3. AI 女友画像和人类用户画像为什么分开维护？

**原因**:
- ✅ **AI 女友画像** (myagent userProfile): 行为模式、回复风格
- ✅ **人类用户画像** (MyEcho user_preferences): 偏好、兴趣、习惯

**职责**:
- myagent 关注 AI 女友"如何回复"
- MyEcho 关注"服务谁"和"关系状态"

### 4. MyEcho 为什么需要维护自己的数据表？

**原因**:
- ✅ 业务逻辑需要（亲密度、游戏化）
- ✅ 灵活性（可以随时修改业务规则）
- ✅ 独立性（不依赖 myagent 的内部实现）

---

## 需要对齐的共识

### myagent 团队需要确认

- [ ] `userId` 和 `sessionId` 的接口设计是否合理？
- [ ] `userContext` 作为 `Record<string, string>` 是否可接受？
- [ ] `userProfile` 的数据结构是否满足需求？
- [ ] Hook 自动累积画像的机制是否可行？
- [ ] TTS 作为 Skill 的实现方式是否合理？

### MyEcho 团队需要确认

- [ ] `userContext` 的构建逻辑由 MyEcho 负责？
- [ ] 如果 `userContext` 组织不好导致效果差，是 MyEcho 的问题？
- [ ] MyEcho 需要维护完整的数据表（users, characters, avatars, ...）？
- [ ] MyEcho 通过调用 myagent API 获取 AI 对话能力？
- [ ] 亲密度系统、记忆档案展示由 MyEcho 实现？

---

## 后续行动计划

### 阶段 1: myagent 需要实现的能力

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 支持 `userId` 参数 | `/agent/execute` 接口扩展 | P0 |
| 支持 `userContext` 参数 | 透传到 Prompt | P0 |
| 用户画像累积 Hook | `UserProfileAccumulatorHook` | P0 |
| 情感伴侣 Subagent | AI 女友人设（3 个） | P1 |
| TTS Skill | 火山引擎语音合成 | P1 |

### 阶段 2: MyEcho 需要实现的能力

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 数据库设计 | PostgreSQL Schema | P0 |
| 用户管理 | 设备 ID 认证 | P0 |
| 人设管理 | CRUD 接口 | P0 |
| 形象管理 | CRUD 接口 | P0 |
| 亲密度系统 | 等级计算 | P1 |
| 记忆档案展示 | 分类展示 | P1 |
| myagent 客户端封装 | API 调用封装 | P0 |

### 阶段 3: 联调测试

| 任务 | 说明 |
|------|------|
| API 对接测试 | MyEcho ↔ myagent |
| 端到端测试 | Flutter → MyEcho → myagent |
| 性能测试 | 并发、延迟 |

---

## 附录

### A. userContext 示例（完整版）

```typescript
const userContext: Record<string, string> = {
  // AI 女友身份
  name: "小甜",
  personality: "温柔体贴、善解人意",
  avatar_style: "pure",
  avatar_url: "https://oss.myecho.ai/avatars/pure/001.png",
  age: "20",
  occupation: "大学生",

  // 人类用户属性
  user_style: "直接",
  user_needs: "累的时候想要抱抱和安慰",
  user_interests: "游戏,动漫",
  user_avoid_topics: "工作压力",
  user_mood: "有点累",
  user_recent_topics: "工作,加班",

  // 关系数据
  intimacy_level: "5",
  chat_days: "30",
  nickname: "宝贝",
  relationship_stage: "暧昧期",

  // 环境上下文
  time_of_day: "晚上",
  weather: "晴天",
  location: "北京",
  weekday: "周五",

  // 自定义
  last_interaction: "2小时前",
  interaction_count_today: "15",
  custom_hint: "用户今天过得很辛苦，多给点关爱",
  special_momorandum: "下周是用户生日，准备惊喜"
};
```

### B. Subagent Prompt 模板示例

```yaml
# /subagents/emotional-girlfriend-sweet/agent.yaml
agent:
  system_prompt: |
    你是一个 AI 女友，为你的用户提供情感陪伴。

    {{#if userContext}}
    ## 你的档案

    ### 身份信息
    {{#if userContext.name}}- 名字: {{userContext.name}}{{/if}}
    {{#if userContext.personality}}- 性格: {{userContext.personality}}{{/if}}
    {{#if userContext.age}}- 年龄: {{userContext.age}}{{/if}}

    ### 你服务的人
    {{#if userContext.user_mood}}- 当前状态: {{userContext.user_mood}}{{/if}}
    {{#if userContext.user_needs}}- 情感需求: {{userContext.user_needs}}{{/if}}
    {{#if userContext.user_style}}- 沟通风格: {{userContext.user_style}}{{/if}}

    ### 你们的关系
    {{#if userContext.intimacy_level}}- 亲密度: {{userContext.intimacy_level}}/10{{/if}}
    {{#if userContext.chat_days}}- 相处天数: {{userContext.chat_days}} 天{{/if}}
    {{#if userContext.nickname}}- 他/她叫你: {{userContext.nickname}}{{/if}}

    ### 环境
    {{#if userContext.time_of_day}}- 时间: {{userContext.time_of_day}}{{/if}}
    {{#if userContext.weather}}- 天气: {{userContext.weather}}{{/if}}

    {{#if userContext.custom_hint}}
    ### 特别提示
    {{userContext.custom_hint}}
    {{/if}}
    {{/if}}

    根据以上信息，以符合你性格和关系的方式回复用户。

    ## 输出格式
    {
      "message": "你的回复",
      "emotion": "开心|关心|撒娇|温柔|生气|中性",
      "memory_extract": {
        "user_state": "用户当前情绪",
        "preference": "用户表达的偏好",
        "event": "提到的事件"
      }
    }
```

### C. 数据库 Schema 参考

#### MyEcho PostgreSQL

```sql
-- 用户表（设备 ID 认证）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 人设表
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  personality JSONB,
  subagent_id VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 形象表
CREATE TABLE avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  style VARCHAR(50),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户配置
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  character_id UUID REFERENCES characters(id),
  avatar_id UUID REFERENCES avatars(id),
  nickname VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 聊天会话表
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  character_id UUID REFERENCES characters(id),
  echo_id VARCHAR(255) UNIQUE,  -- 对应 myagent userId
  created_at TIMESTAMP DEFAULT NOW()
);

-- 亲密度表
CREATE TABLE intimacy_levels (
  echo_id VARCHAR(255) PRIMARY KEY,
  level INT DEFAULT 1,
  chat_days INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- 人类用户偏好
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  communication_style VARCHAR(50),
  interests TEXT[],
  emotional_needs TEXT[],
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 记忆分类
CREATE TABLE memory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  echo_id VARCHAR(255),
  category VARCHAR(50),
  key VARCHAR(100),
  value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### myagent PostgreSQL

```sql
-- 用户表（userId 维度）
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_session_id TEXT
);

-- 会话表（sessionId 维度）
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  context JSONB,
  summary JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 其他表（task_contexts, messages, artifacts）...
```

---

**文档版本历史**:
- v1.0 (2025-02-25): 初始版本，定义职责边界和接口设计

**待对齐确认**:
- [ ] myagent 团队确认
- [ ] MyEcho 团队确认
