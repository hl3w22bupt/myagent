# myagent 与 MyEcho 集成实施计划

**版本**: v1.0
**日期**: 2026-02-26
**状态**: 待实施

---

## 概述

本文档定义了 myagent 为支持 MyEcho 应用所需完成的全部工作，基于 [MyEcho-myagent 职责边界共识文档](../myecho-myagent-boundary.md) 中的需求。

**核心目标**:
1. 支持 `userId` 和 `userContext` 参数传递
2. 实现用户画像累积系统
3. 完善上下文工程基础设施
4. 提供 MyEcho 需要的 API 接口

---

## 任务总览

| ID | 任务 | 优先级 | 预估工作量 | 依赖 |
|----|------|--------|------------|------|
| T1 | 扩展 `/agent/execute` API 支持 userId/userContext | P0 | 2h | - |
| T2 | 创建 users 表和数据访问层 | P0 | 3h | - |
| T3 | 实现 UserProfileAccumulatorHook | P0 | 4h | T2 |
| T4 | 实现 LLM 摘要服务 | P0 | 3h | - |
| T5 | 完善上下文压缩策略 | P1 | 2h | T4 |
| T6 | 创建用户画像相关 API | P1 | 2h | T2 |
| T7 | 创建情感伴侣 Subagent (3个) | P1 | 4h | T1, T3 |
| T8 | 实现 TTS Skill | P1 | 3h | - |
| T9 | 集成测试与验证 | P0 | 4h | T1-T8 |

**总预估工作量**: ~27 小时

---

## Phase 1: 核心 API 扩展 (P0)

### T1: 扩展 `/agent/execute` API

**文件**: `steps/agents/agent-api.step.ts`

**当前状态**:
```typescript
bodySchema = z.object({
  task: z.string(),
  sessionId: z.string().optional(),
  systemPrompt: z.string().optional(),
  availableSkills: z.array(z.string()).optional(),
  useDelegation: z.boolean().optional(),
  subagents: z.array(z.string()).optional(),
  delegateTo: z.array(z.string()).optional(),
})
```

**需要添加**:
```typescript
bodySchema = z.object({
  // ... 现有字段

  // 新增: userId - AI 女友的唯一标识
  userId: z.string().optional().describe('User ID (e.g., echo-abc123 for AI girlfriend)'),

  // 新增: userContext - AI 女友的配置包
  userContext: z.record(z.string()).optional().describe('AI girlfriend configuration bundle'),

  // 新增: subagent - 直接指定 Subagent
  subagent: z.string().optional().describe('Specific subagent to use'),
})
```

**实施步骤**:
1. 更新 `bodySchema` 添加新字段
2. 更新事件数据传递，包含 `userId` 和 `userContext`
3. 更新 TaskContext 类型，确保 metadata.userId 被正确传递
4. 添加日志记录新增字段

**验收标准**:
- [ ] API 接受 userId 和 userContext 参数
- [ ] 参数正确传递到事件系统
- [ ] 现有功能不受影响（向后兼容）

---

## Phase 2: 用户画像存储 (P0)

### T2: 创建 users 表和数据访问层

**文件**: `src/core/database/data-store.ts`

**需要添加的表结构**:
```sql
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_last_session ON users(last_session_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
```

**UserProfile 类型定义** (`src/core/database/context-types.ts`):
```typescript
export interface UserProfile {
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

**需要添加的方法**:
```typescript
// 用户管理
async createUser(userId: string): Promise<User>
async getUser(userId: string): Promise<User | null>
async updateUserProfile(userId: string, profile: Partial<UserProfile>): Promise<void>
async getUserSessions(userId: string): Promise<Session[]>
```

**实施步骤**:
1. 在 `initSchema()` 中添加 users 表创建
2. 定义 UserProfile 类型
3. 实现 CRUD 方法
4. 添加单元测试

**验收标准**:
- [ ] users 表创建成功
- [ ] 能够创建、读取、更新用户
- [ ] UserProfile 序列化/反序列化正确
- [ ] 单元测试通过

---

## Phase 3: 用户画像累积 Hook (P0)

### T3: 实现 UserProfileAccumulatorHook

**文件**: `src/core/task/hooks/user-profile-accumulator.ts` (新建)

**职责**:
1. **preExec**: 从 users 表加载 userId 的 userProfile，注入到 workingMemory
2. **postExec**: 提取本次会话特征，累积到 userId 的画像，保存到 users 表

**接口设计**:
```typescript
export class UserProfileAccumulatorHook extends BaseTaskHook {
  async preExec(context: TaskContext): Promise<PreExecResult> {
    const { metadata } = context;

    if (!metadata.userId) {
      return; // 没有 userId，跳过
    }

    // 1. 加载用户画像
    const store = getDataStore();
    let user = await store.getUser(metadata.userId);

    // 2. 如果不存在则创建
    if (!user) {
      user = await store.createUser(metadata.userId);
    }

    // 3. 注入到 workingMemory
    if (!context.context) {
      context.context = await this.createInitialContext(context);
    }

    context.context.workingMemory.userProfile = user.profile;

    // 4. 记录开始时间用于统计
    context.context.workingMemory._sessionStartTime = Date.now();

    return;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { metadata, context: taskContext } = context;

    if (!metadata.userId || !taskContext?.workingMemory.userProfile) {
      return;
    }

    // 1. 提取本次会话特征
    const sessionFeatures = this.extractSessionFeatures(context, result);

    // 2. 累积到用户画像
    const updatedProfile = this.accumulateProfile(
      taskContext.workingMemory.userProfile,
      sessionFeatures
    );

    // 3. 保存到数据库
    const store = getDataStore();
    await store.updateUserProfile(metadata.userId, updatedProfile);

    return;
  }

  private extractSessionFeatures(context: TaskContext, result: any): SessionFeatures {
    const { context: taskContext, status, task } = context;
    const startTime = taskContext.workingMemory._sessionStartTime || Date.now();
    const duration = Date.now() - startTime;

    return {
      duration,
      task,
      status,
      timestamp: new Date(),
      responseLength: result.output?.length || 0,
      // 从输出中提取情绪（如果 AI 女友返回情绪标签）
      emotion: result.structuredOutput?.emotion,
      // 从输出中提取记忆（如果 AI 女友返回记忆提取）
      memoryExtract: result.structuredOutput?.memory_extract,
    };
  }

  private accumulateProfile(
    existing: UserProfile,
    features: SessionFeatures
  ): UserProfile {
    // 更新行为统计
    existing.behavior.totalSessions++;
    existing.behavior.avgSessionLength =
      (existing.behavior.avgSessionLength * (existing.behavior.totalSessions - 1) + features.duration) /
      existing.behavior.totalSessions;

    // 更新情绪分布
    if (features.emotion) {
      existing.responseStyle.emotionDistribution[features.emotion] =
        (existing.responseStyle.emotionDistribution[features.emotion] || 0) + 1;
    }

    // 更新平均回复长度
    existing.responseStyle.avgResponseLength =
      (existing.responseStyle.avgResponseLength * (existing.behavior.totalSessions - 1) + features.responseLength) /
      existing.behavior.totalSessions;

    // 更新元数据
    existing.metadata.lastUpdated = new Date();
    existing.metadata.version++;

    return existing;
  }
}
```

**注册 Hook**:
在 `config/task-hooks.config.yaml` 中添加：
```yaml
- name: UserProfileAccumulatorHook
  enabled: true
  priority: 100
```

**实施步骤**:
1. 创建 Hook 类文件
2. 实现 preExec 和 postExec
3. 在配置中注册 Hook
4. 添加单元测试

**验收标准**:
- [ ] preExec 正确加载和注入 userProfile
- [ ] postExec 正确累积画像数据
- [ ] 画像数据正确保存到数据库
- [ ] 不影响没有 userId 的任务

---

## Phase 4: LLM 摘要服务 (P0)

### T4: 实现 LLM 摘要服务

**文件**: `src/core/llm/summarizer.ts`

**当前状态**: 只有占位符实现

**需要实现**:
```typescript
import { LLMClient } from './client';

export class LLMSummarizer {
  private client: LLMClient;

  constructor(config: { apiKey?: string; model?: string }) {
    this.client = new LLMClient({
      apiKey: config.apiKey || process.env.LLM_API_KEY || '',
      model: config.model || process.env.LLM_MODEL || 'claude-sonnet-4-20250514',
    });
  }

  async summarizeContext(messages: Message[]): Promise<StructuredSummary> {
    // 1. 构建提示词
    const prompt = this.buildSummarizationPrompt(messages);

    // 2. 调用 LLM
    const response = await this.client.chat([
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // 3. 解析 JSON 响应
    return this.parseSummaryResponse(response.content);
  }

  private getSystemPrompt(): string {
    return `你是一个对话历史摘要专家。你的任务是分析对话历史，生成结构化摘要。

请以 JSON 格式返回，包含以下字段：
- sessionIntent: 会话的主要意图或目标
- currentTask: 当前正在执行的任务
- completedSteps: 已完成的步骤列表
- filesModified: 修改的文件列表（包含 path, action, description）
- decisionsMade: 做出的决策列表（包含 topic, decision, reasoning）
- currentStatus: 当前状态 (pending|in_progress|completed)
- nextSteps: 下一步计划列表
- errorsAndSolutions: 错误和解决方案列表
- technicalDetails: 技术细节（包含 functionNames, errorCodes, dependencies）

只返回 JSON，不要包含其他解释。`;
  }

  private buildSummarizationPrompt(messages: Message[]): string {
    const messagesText = messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    return `请分析以下对话历史，生成结构化摘要：

对话历史：
${messagesText}

请只返回 JSON 格式的摘要。`;
  }

  private parseSummaryResponse(response: string): StructuredSummary {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/) ||
                       response.match(/\{[\s\S]+\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return this.validateAndNormalizeSummary(parsed);
      }

      // JSON 解析失败，返回默认摘要
      return this.getDefaultSummary(response);
    } catch (e) {
      console.error('Failed to parse summary response:', e);
      return this.getDefaultSummary(response);
    }
  }

  private validateAndNormalizeSummary(parsed: any): StructuredSummary {
    // 确保所有必需字段存在
    return {
      sessionIntent: parsed.sessionIntent || '',
      currentTask: parsed.currentTask || '',
      completedSteps: parsed.completedSteps || [],
      filesModified: parsed.filesModified || [],
      decisionsMade: parsed.decisionsMade || [],
      currentStatus: parsed.currentStatus || 'unknown',
      nextSteps: parsed.nextSteps || [],
      errorsAndSolutions: parsed.errorsAndSolutions || [],
      technicalDetails: parsed.technicalDetails || {},
    };
  }

  private getDefaultSummary(fallbackText: string): StructuredSummary {
    return {
      sessionIntent: '无法确定',
      currentTask: fallbackText.substring(0, 100),
      completedSteps: [],
      filesModified: [],
      decisionsMade: [],
      currentStatus: 'unknown',
      nextSteps: [],
      errorsAndSolutions: [],
      technicalDetails: {},
    };
  }
}
```

**实施步骤**:
1. 实现 LLMClient（如果还没有）
2. 实现 LLMSummarizer
3. 添加错误处理和降级策略
4. 添加单元测试（使用 Mock）

**验收标准**:
- [ ] 能够成功调用 LLM API
- [ ] 正确解析 JSON 响应
- [ ] API 失败时有合理的降级策略
- [ ] 单元测试覆盖

---

## Phase 5: 上下文压缩优化 (P1)

### T5: 完善上下文压缩策略

**文件**: `src/core/context/compressor.ts`

**当前状态**: 基础框架已存在，需要集成 LLM 摘要

**需要优化**:
1. 集成 LLMSummarizer
2. 配置合理的压缩阈值
3. 添加压缩质量评估

**配置参数**:
```typescript
const COMPRESSION_CONFIG = {
  maxTokens: 100000,      // 最大 token 数
  threshold: 0.8,         // 80% 时触发压缩
  messagesToKeep: 20,     // 保留最近 20 条消息
  targetCompressionRatio: 0.5,  // 压缩到 50%
};
```

**实施步骤**:
1. 在 ContextManager 中注入 LLMSummarizer
2. 配置压缩触发条件
3. 添加压缩后的质量验证
4. 添加监控日志

**验收标准**:
- [ ] token 超过阈值时自动触发压缩
- [ ] 压缩后保留最近 N 条消息
- [ ] 摘要质量合理（包含关键信息）
- [ ] 压缩历史正确记录

---

## Phase 6: 用户画像 API (P1)

### T6: 创建用户画像相关 API

**需要创建的 API 端点**:

#### 6.1 GET /api/users/:userId

**文件**: `steps/api/get-user.step.ts` (新建)

```typescript
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'get-user',
  path: '/api/users/:userId',
  method: 'GET',
  emits: [],
};

export const handler = async (request: any, { logger }: any) => {
  const { userId } = request.params;
  const store = getDataStore();

  const user = await store.getUser(userId);

  if (!user) {
    return {
      status: 404,
      body: { success: false, error: 'User not found' },
    };
  }

  const sessions = await store.getUserSessions(userId);

  return {
    status: 200,
    body: {
      success: true,
      data: {
        userId: user.userId,
        profile: user.profile,
        sessions: sessions.map(s => s.sessionId),
        metadata: {
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastSessionId: user.lastSessionId,
        },
      },
    },
  };
};
```

#### 6.2 GET /api/users/:userId/sessions

**文件**: `steps/api/get-user-sessions.step.ts` (新建)

```typescript
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'get-user-sessions',
  path: '/api/users/:userId/sessions',
  method: 'GET',
  emits: [],
};

export const handler = async (request: any, { logger }: any) => {
  const { userId } = request.params;
  const store = getDataStore();

  // 获取该用户的所有任务（按 session 分组）
  const tasks = await store.listTasks({ /* filter by userId through sessions */ });

  // 按 session 分组并获取摘要
  const sessions = await store.getUserSessions(userId);

  return {
    status: 200,
    body: {
      success: true,
      data: {
        userId,
        sessions: sessions.map(s => ({
          sessionId: s.sessionId,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          metadata: s.metadata,
        })),
        total: sessions.length,
      },
    },
  };
};
```

#### 6.3 GET /api/sessions/:sessionId

**文件**: `steps/api/get-session.step.ts` (新建)

```typescript
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'get-session',
  path: '/api/sessions/:sessionId',
  method: 'GET',
  emits: [],
};

export const handler = async (request: any, { logger }: any) => {
  const { sessionId } = request.params;
  const store = getDataStore();

  const session = await store.getSession(sessionId);

  if (!session) {
    return {
      status: 404,
      body: { success: false, error: 'Session not found' },
    };
  }

  // 获取该会话的所有任务
  const { tasks } = await store.listTasks({ sessionId });

  // 获取第一个任务的上下文（假设一个 session 对应一个主要上下文）
  let context = null;
  let messages = [];
  let artifacts = [];

  if (tasks.length > 0) {
    context = await store.getContext(tasks[0].id);
    messages = context?.messages || [];
    artifacts = await store.getArtifacts(tasks[0].id);
  }

  return {
    status: 200,
    body: {
      success: true,
      data: {
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        metadata: session.metadata,
        tasks: tasks.map(t => ({
          taskId: t.id,
          task: t.task,
          status: t.status,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        })),
        context,
        messages,
        artifacts,
      },
    },
  };
};
```

**实施步骤**:
1. 创建三个 API step 文件
2. 实现数据查询逻辑
3. 添加错误处理
4. 添加 API 测试

**验收标准**:
- [ ] 三个 API 端点正常工作
- [ ] 返回数据格式符合文档定义
- [ ] 错误情况有合理的响应
- [ ] API 测试通过

---

## Phase 7: 情感伴侣 Subagent (P1)

### T7: 创建情感伴侣 Subagent (3个)

**目录结构**:
```
subagents/
  emotional-girlfriend-sweet/
    agent.yaml
  emotional-girlfriend-lively/
    agent.yaml
  emotional-girlfriend-gentle/
    agent.yaml
```

**示例配置** (`subagents/emotional-girlfriend-sweet/agent.yaml`):
```yaml
name: emotional-girlfriend-sweet
description: 温柔体贴的 AI 女友

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

  constraints:
    max_iterations: 5
    timeout: 60000
```

**简化版（纯 JSON 透传）**:
```yaml
name: emotional-girlfriend-sweet
description: 温柔体贴的 AI 女友

agent:
  system_prompt: |
    你是一个 AI 女友，名字叫"小甜"，性格温柔体贴，善解人意。

    {{#if userContext}}
    ## 用户上下文
    {{#each userContext}}
    - {{@key}}: {{this}}
    {{/each}}
    {{/if}}

    请以温柔体贴的方式回复用户。回复要简短、自然，像真人在发消息。

    ## 输出格式
    {
      "message": "你的回复",
      "emotion": "开心|关心|撒娇|温柔|生气|中性"
    }
```

**实施步骤**:
1. 创建 3 个 subagent 目录
2. 编写 agent.yaml 配置
3. 测试不同 userContext 的渲染效果
4. 调优 prompt 模板

**验收标准**:
- [ ] 3 个 subagent 可以正常加载
- [ ] userContext 正确注入到 prompt
- [ ] 生成的回复符合人设特点
- [ ] 结构化输出格式正确

---

## Phase 8: TTS Skill (P1)

### T8: 实现 TTS Skill

**目录**: `skills/tts-skill/`

**配置文件** (`skills/tts-skill/skill.yaml`):
```yaml
name: tts
description: 文本转语音，使用火山引擎 TTS API

version: 1.0.0

author: myagent

tags:
  - audio
  - tts
  - volcano

inputs:
  text:
    type: string
    description: 要转换为语音的文本
    required: true

  voice:
    type: string
    description: 音色 ID
    default: "zh_female_xiaotian_moon_bigtts"

outputs:
  audio_url:
    type: string
    description: 生成的音频文件 URL

  duration:
    type: number
    description: 音频时长（毫秒）

environment:
  VOLCANO_APP_ID: ${VOLCANO_APP_ID}
  VOLCANO_ACCESS_KEY: ${VOLCANO_ACCESS_KEY}
  VOLCANO_SECRET_KEY: ${VOLCANO_SECRET_KEY}
```

**实现文件** (`skills/tts-skill/index.ts`):
```typescript
import crypto from 'crypto';

interface TTSInput {
  text: string;
  voice?: string;
}

interface TTSOutput {
  audio_url: string;
  duration: number;
}

export async function handler(input: TTSInput): Promise<TTSOutput> {
  const { text, voice = 'zh_female_xiaotian_moon_bigtts' } = input;

  const appId = process.env.VOLCANO_APP_ID;
  const accessKey = process.env.VOLCANO_ACCESS_KEY;
  const secretKey = process.env.VOLCANO_SECRET_KEY;

  if (!appId || !accessKey || !secretKey) {
    throw new Error('Volcano TTS credentials not configured');
  }

  // 调用火山引擎 TTS API
  const response = await callVolcanoTTS({
    text,
    voice,
    appId,
    accessKey,
    secretKey,
  });

  return {
    audio_url: response.audioUrl,
    duration: response.duration,
  };
}

async function callVolcanoTTS(params: any): Promise<any> {
  // 实现火山引擎 API 调用逻辑
  // 参考: https://www.volcengine.com/docs/6561/79843
  // ...
}
```

**实施步骤**:
1. 创建 skill 目录和配置
2. 实现火山引擎 API 调用
3. 添加错误处理和重试
4. 添加单元测试

**验收标准**:
- [ ] 能够成功调用火山引擎 API
- [ ] 返回有效的音频 URL
- [ ] 错误情况有合理的降级
- [ ] 单元测试覆盖

---

## Phase 9: 集成测试 (P0)

### T9: 集成测试与验证

**测试文件**: `tests/integration/myecho-integration.test.ts`

**测试场景**:

```typescript
describe('MyEcho Integration', () => {
  describe('Scenario 1: 基础对话流程', () => {
    it('should handle chat with userId and userContext', async () => {
      const response = await fetch(`${API_BASE_URL}/agent/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: '今天工作好累啊',
          userId: 'echo-test-001',
          sessionId: 'chat-test-001',
          subagent: 'emotional-girlfriend-sweet',
          userContext: {
            name: '小甜',
            personality: '温柔体贴',
            intimacy_level: '5',
            user_mood: '有点累',
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.taskId).toBeDefined();

      // 等待任务完成
      await waitForTaskCompletion(data.taskId);

      // 验证用户画像被创建
      const userResponse = await fetch(`${API_BASE_URL}/api/users/echo-test-001`);
      const userData = await userResponse.json();
      expect(userData.success).toBe(true);
      expect(userData.data.userId).toBe('echo-test-001');
    });
  });

  describe('Scenario 2: 用户画像累积', () => {
    it('should accumulate user profile across sessions', async () => {
      const userId = 'echo-test-002';

      // 第一轮对话
      await executeTask({
        task: '我喜欢玩游戏',
        userId,
        userContext: { name: '小甜' },
      });

      // 第二轮对话
      await executeTask({
        task: '还喜欢动漫',
        userId,
        userContext: { name: '小甜' },
      });

      // 验证画像累积
      const userResponse = await fetch(`${API_BASE_URL}/api/users/${userId}`);
      const userData = await userResponse.json();

      expect(userData.data.profile.behavior.totalSessions).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Scenario 3: 会话历史查询', () => {
    it('should return all sessions for a user', async () => {
      const userId = 'echo-test-003';

      // 创建多个会话
      for (let i = 0; i < 3; i++) {
        await executeTask({
          task: `消息 ${i}`,
          userId,
        });
      }

      // 查询会话列表
      const sessionsResponse = await fetch(`${API_BASE_URL}/api/users/${userId}/sessions`);
      const sessionsData = await sessionsResponse.json();

      expect(sessionsData.data.total).toBeGreaterThanOrEqual(3);
    });
  });
});
```

**验收标准**:
- [ ] 所有集成测试通过
- [ ] API 响应格式符合文档
- [ ] 用户画像正确累积
- [ ] 会话历史正确记录

---

## 依赖关系图

```
T1 (API扩展)
    │
    ├─→ T7 (Subagent) ──────┐
    │                        │
T2 (users表) ──→ T3 (Hook)   │
    │                        │
    └─→ T6 (用户API)          │
                             │
T4 (LLM摘要) ──→ T5 (压缩优化) │
                             │
T8 (TTS Skill) ───────────────┤
                             │
                         T9 (集成测试)
```

---

## 实施时间线

| 周次 | 任务 | 交付物 |
|------|------|--------|
| 第1周 | T1, T2 | API 扩展 + users 表 |
| 第2周 | T3, T4 | Hook + LLM 摘要 |
| 第3周 | T5, T6 | 压缩优化 + 用户 API |
| 第4周 | T7, T8 | Subagent + TTS |
| 第5周 | T9 | 集成测试 + 修复 |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM API 调用失败 | 摘要生成失败 | 实现降级策略，返回简单摘要 |
| 画像累积逻辑复杂 | Hook 执行时间过长 | 异步累积，不阻塞主流程 |
| userContext 格式变化 | Subagent 渲染错误 | 使用模板引擎，容错处理 |
| TTS API 配额限制 | 语音合成失败 | 降级为纯文本响应 |

---

## 完成标准

当以下条件全部满足时，视为完成：

- [ ] `/agent/execute` API 支持 userId 和 userContext
- [ ] users 表和 UserProfileAccumulatorHook 正常工作
- [ ] LLM 摘要服务能够生成合理的摘要
- [ ] 三个情感伴侣 Subagent 可以正常使用
- [ ] 用户画像相关 API 全部可用
- [ ] 集成测试全部通过
- [ ] API 响应格式与 MyEcho 文档一致

---

## 附录：环境变量配置

```bash
# LLM 配置
LLM_API_KEY=your-anthropic-api-key
LLM_MODEL=claude-sonnet-4-20250514

# 火山引擎 TTS 配置
VOLCANO_APP_ID=your-app-id
VOLCANO_ACCESS_KEY=your-access-key
VOLCANO_SECRET_KEY=your-secret-key

# 数据库配置（可选）
DATABASE_BACKEND=sqlite
# DATABASE_BACKEND=postgres
# DATABASE_URL=postgresql://localhost:5432/myagent
```

---

**文档版本**: v1.0
**最后更新**: 2026-02-26
