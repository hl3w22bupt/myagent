# 智能体上下文工程设计

## 概述

本文档描述了Motia框架的智能体上下文工程系统，用于管理多轮对话、上下文压缩和智能检索。

## 设计目标

1. **分层结构化**：会话→任务→消息三层架构，清晰的信息组织
2. **按需取用**：根据当前任务动态选择最相关的上下文
3. **智能压缩**：采用Anchored Iterative Summarization，在保留关键信息的同时减少token消耗
4. **Artifact完整性**：专门跟踪文件修改、函数调用等技术细节
5. **任务级隔离**：每个任务独立的上下文空间，避免跨任务干扰

## 核心架构

### 1. 三层上下文模型

```
┌─────────────────────────────────────────────────────────────┐
│                        Session Layer                         │
│  - sessionId: "sess_123"                                     │
│  - createdAt: "2026-01-21T10:00:00Z"                        │
│  - metadata: {userId, tags, preferences}                    │
├─────────────────────────────────────────────────────────────┤
│                        Task Layer                            │
│  - taskId: "task_456"                                       │
│  - parentSessionId: "sess_123"                              │
│  - status: "running"                                         │
│  - context: {...}  # 任务级上下文                            │
├─────────────────────────────────────────────────────────────┤
│                      Message Layer                           │
│  - messageIds: ["msg_1", "msg_2", ...]                      │
│  - compressedSummary: {...}  # 压缩后的摘要                  │
│  - artifactIndex: {...}  # Artifact跟踪                      │
└─────────────────────────────────────────────────────────────┘
```

### 2. 数据库Schema

**文件位置**：`src/core/database/context-store.ts`

```typescript
// 会话表
interface Session {
  id: string;                    // sessionId
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
  preferences: {
    compressionThreshold: number;  // 默认0.8
    maxContextTokens: number;      // 默认100000
    artifactTrackingEnabled: boolean;
  };
}

// 任务表
interface Task {
  id: string;                    // taskId
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: string;
  context: TaskContext;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// 消息表
interface Message {
  id: string;                    // messageId
  taskId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: {
    timestamp: Date;
    tokens?: number;
    llmCalls?: number;
    skillCalls?: string[];
  };
  compressed?: boolean;          // 是否已被压缩
}

// Artifact索引表
interface ArtifactIndex {
  taskId: string;
  artifactType: 'file' | 'function' | 'variable' | 'error';
  action: 'created' | 'modified' | 'read' | 'deleted';
  path: string;                  // 文件路径或函数名
  description?: string;          // 简短描述
  commitHash?: string;           // 相关Git提交
  timestamp: Date;
}

// 上下文压缩历史表
interface CompressionHistory {
  taskId: string;
  compressedAt: Date;
  originalTokenCount: number;
  compressedTokenCount: number;
  compressionRatio: number;
  summary: StructuredSummary;
  truncatedMessageIds: string[];  // 被压缩的消息ID
}
```

### 3. TaskContext结构

**文件位置**：`src/core/context/types.ts`

```typescript
interface TaskContext {
  // 基础信息
  taskId: string;
  sessionId: string;
  currentTurn: number;

  // 对话历史
  messages: Message[];

  // 压缩摘要（Anchored Iterative Summarization）
  summary: StructuredSummary;

  // Artifact索引
  artifactIndex: ArtifactIndex[];

  // 临时工作内存（scratchpad）
  workingMemory: {
    currentStep?: string;
    intermediateResults?: Record<string, any>;
    pendingActions?: string[];
  };

  // 元数据
  metadata: {
    totalTokens: number;
    llmCallsCount: number;
    skillCallsCount: number;
    lastCompressedAt?: Date;
  };
}

interface StructuredSummary {
  // 会话意图
  sessionIntent: string;

  // 当前任务目标
  currentTask: string;

  // 已完成的步骤
  completedSteps: string[];

  // 文件修改记录
  filesModified: FileModification[];

  // 关键决策
  decisionsMade: Decision[];

  // 当前状态
  currentStatus: string;

  // 下一步计划
  nextSteps: string[];

  // 错误和解决方案
  errorsAndSolutions: ErrorAndSolution[];

  // 技术细节
  technicalDetails: {
    functionNames?: string[];
    errorCodes?: string[];
    dependencies?: string[];
  };
}

interface FileModification {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  description: string;
  commitHash?: string;
  timestamp: Date;
}

interface Decision {
  topic: string;
  decision: string;
  reasoning: string;
  timestamp: Date;
}

interface ErrorAndSolution {
  error: string;
  solution: string;
  timestamp: Date;
}
```

### 4. ContextManager核心实现

**文件位置**：`src/core/context/manager.ts`

```typescript
import { TaskStore } from '../database/task-store';
import { LLMService } from '../llm/service';

export class ContextManager {
  private taskStore: TaskStore;
  private llmService: LLMService;

  constructor() {
    this.taskStore = new TaskStore();
    this.llmService = new LLMService();
  }

  /**
   * 创建新任务的上下文
   */
  async createTaskContext(taskId: string, sessionId: string, input: string): Promise<TaskContext> {
    const session = await this.taskStore.getSession(sessionId);

    return {
      taskId,
      sessionId,
      currentTurn: 0,
      messages: [],
      summary: {
        sessionIntent: session.metadata?.intent || '',
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
   * 添加消息到上下文
   */
  async addMessage(context: TaskContext, message: Message): Promise<TaskContext> {
    const newContext = { ...context };

    // 添加消息
    newContext.messages.push(message);
    newContext.currentTurn += 1;

    // 更新元数据
    if (message.metadata.tokens) {
      newContext.metadata.totalTokens += message.metadata.tokens;
    }
    if (message.metadata.llmCalls) {
      newContext.metadata.llmCallsCount += message.metadata.llmCalls;
    }
    if (message.metadata.skillCalls) {
      newContext.metadata.skillCallsCount += message.metadata.skillCalls.length;
    }

    // 检查是否需要压缩
    const session = await this.taskStore.getSession(context.sessionId);
    const maxTokens = session.preferences.maxContextTokens;

    if (newContext.metadata.totalTokens > maxTokens * session.preferences.compressionThreshold) {
      return await this.compressContext(newContext);
    }

    return newContext;
  }

  /**
   * 上下文压缩（Anchored Iterative Summarization）
   */
  private async compressContext(context: TaskContext): Promise<TaskContext> {
    const session = await this.taskStore.getSession(context.sessionId);
    const maxTokens = session.preferences.maxContextTokens;
    const targetTokens = maxTokens * 0.5;  // 压缩到50%

    // 1. 识别需要压缩的消息范围（保留最新的N条消息）
    const messagesToKeep = 20;  // 保留最近20条消息
    const messagesToCompress = context.messages.slice(0, -messagesToKeep);
    const truncatedMessageIds = messagesToCompress.map(m => m.id);

    // 2. 生成结构化摘要
    const newSummary = await this.generateStructuredSummary(
      context.summary,
      messagesToCompress
    );

    // 3. 保留最新消息
    const compressedContext = {
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

    // 4. 保存压缩历史
    await this.taskStore.saveCompressionHistory({
      taskId: context.taskId,
      compressedAt: new Date(),
      originalTokenCount: context.metadata.totalTokens,
      compressedTokenCount: compressedContext.metadata.totalTokens,
      compressionRatio: 1 - (compressedContext.metadata.totalTokens / context.metadata.totalTokens),
      summary: newSummary,
      truncatedMessageIds,
    });

    // 5. 更新Artifact索引
    await this.updateArtifactIndex(context.taskId, messagesToCompress);

    return compressedContext;
  }

  /**
   * 生成结构化摘要（增量合并）
   */
  private async generateStructuredSummary(
    existingSummary: StructuredSummary,
    newMessages: Message[]
  ): Promise<StructuredSummary> {
    // 构建压缩提示词
    const prompt = this.buildSummarizationPrompt(existingSummary, newMessages);

    // 调用LLM生成摘要
    const response = await this.llmService.complete({
      prompt,
      systemMessage: `You are an expert at maintaining structured summaries of coding sessions.
Always preserve technical details: file paths, function names, error codes, and decisions made.
Merge the new information into the existing summary sections, don't regenerate from scratch.`,
      temperature: 0.3,
    });

    // 解析LLM响应为StructuredSummary
    const newSections = this.parseSummaryResponse(response.content);

    // 增量合并到现有摘要
    return {
      ...existingSummary,
      sessionIntent: this.mergeSection(existingSummary.sessionIntent, newSections.sessionIntent),
      currentTask: this.mergeSection(existingSummary.currentTask, newSections.currentTask),
      completedSteps: [
        ...existingSummary.completedSteps,
        ...(newSections.completedSteps || []),
      ],
      filesModified: [
        ...existingSummary.filesModified,
        ...(newSections.filesModified || []),
      ],
      decisionsMade: [
        ...existingSummary.decisionsMade,
        ...(newSections.decisionsMade || []),
      ],
      currentStatus: newSections.currentStatus || existingSummary.currentStatus,
      nextSteps: newSections.nextSteps || existingSummary.nextSteps,
      errorsAndSolutions: [
        ...existingSummary.errorsAndSolutions,
        ...(newSections.errorsAndSolutions || []),
      ],
      technicalDetails: {
        functionNames: [
          ...(existingSummary.technicalDetails.functionNames || []),
          ...(newSections.technicalDetails?.functionNames || []),
        ],
        errorCodes: [
          ...(existingSummary.technicalDetails.errorCodes || []),
          ...(newSections.technicalDetails?.errorCodes || []),
        ],
        dependencies: [
          ...(existingSummary.technicalDetails.dependencies || []),
          ...(newSections.technicalDetails?.dependencies || []),
        ],
      },
    };
  }

  /**
   * 构建压缩提示词
   */
  private buildSummarizationPrompt(
    summary: StructuredSummary,
    messages: Message[]
  ): string {
    return `
You are maintaining a structured summary of a coding session.

## Current Summary
\`\`\`
${this.formatSummary(summary)}
\`\`\`

## New Messages to Compress
\`\`\`
${messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
\`\`\`

## Task
Update the summary by extracting new information from the messages above.
CRITICAL: Merge into existing sections, don't regenerate.
Preserve ALL technical details: file paths, function names, error codes.

## Output Format
Return updated summary in JSON format with these sections:
- sessionIntent
- currentTask
- completedSteps (array)
- filesModified (array with path, action, description, timestamp)
- decisionsMade (array with topic, decision, reasoning, timestamp)
- currentStatus
- nextSteps (array)
- errorsAndSolutions (array with error, solution, timestamp)
- technicalDetails (object with functionNames, errorCodes, dependencies arrays)
`;
  }

  /**
   * 格式化摘要为文本
   */
  private formatSummary(summary: StructuredSummary): string {
    return `
## Session Intent
${summary.sessionIntent}

## Current Task
${summary.currentTask}

## Completed Steps
${summary.completedSteps.join('\n')}

## Files Modified
${summary.filesModified.map(f => `- ${f.path}: ${f.action} - ${f.description}`).join('\n')}

## Decisions Made
${summary.decisionsMade.map(d => `- ${d.topic}: ${d.decision} (${d.reasoning})`).join('\n')}

## Current Status
${summary.currentStatus}

## Next Steps
${summary.nextSteps.join('\n')}

## Errors and Solutions
${summary.errorsAndSolutions.map(e => `- ${e.error} → ${e.solution}`).join('\n')}

## Technical Details
- Functions: ${summary.technicalDetails.functionNames?.join(', ') || 'none'}
- Error Codes: ${summary.technicalDetails.errorCodes?.join(', ') || 'none'}
- Dependencies: ${summary.technicalDetails.dependencies?.join(', ') || 'none'}
`;
  }

  /**
   * 解析LLM响应为StructuredSummary
   */
  private parseSummaryResponse(response: string): Partial<StructuredSummary> {
    try {
      // 尝试提取JSON
      const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/) ||
                       response.match(/\{[\s\S]+\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return parsed;
      }
    } catch (e) {
      console.error('Failed to parse summary response:', e);
    }

    return {};
  }

  /**
   * 合并摘要段落
   */
  private mergeSection(existing: string, newContent: string): string {
    if (!newContent) return existing;
    if (!existing) return newContent;

    // 简单的拼接策略（可以根据需要优化）
    return `${existing}\n${newContent}`;
  }

  /**
   * 更新Artifact索引
   */
  private async updateArtifactIndex(taskId: string, messages: Message[]): Promise<void> {
    // 使用LLM从消息中提取Artifact信息
    for (const message of messages) {
      if (message.role === 'assistant') {
        const artifacts = await this.extractArtifacts(message.content);

        for (const artifact of artifacts) {
          await this.taskStore.addArtifact({
            taskId,
            ...artifact,
            timestamp: message.metadata.timestamp,
          });
        }
      }
    }
  }

  /**
   * 从消息中提取Artifact
   */
  private async extractArtifacts(content: string): Promise<Omit<ArtifactIndex, 'taskId' | 'timestamp'>[]> {
    // 使用LLM提取
    const response = await this.llmService.complete({
      prompt: `
Extract all technical artifacts from this message:
${content}

Return JSON array of artifacts with:
- artifactType: "file" | "function" | "variable" | "error"
- action: "created" | "modified" | "read" | "deleted"
- path: file path or function/variable name
- description: brief description
`,
      systemMessage: 'You are a code artifact extractor. Output only JSON arrays.',
      temperature: 0.1,
    });

    try {
      return JSON.parse(response.content);
    } catch {
      return [];
    }
  }

  /**
   * 估算压缩后的token数
   */
  private estimateCompressedTokens(messages: Message[], summary: StructuredSummary): number {
    // 简单估算：消息token + 摘要token
    const messageTokens = messages.reduce((sum, m) => sum + (m.metadata.tokens || 1000), 0);
    const summaryTokens = JSON.stringify(summary).length / 4;  // 粗略估算

    return messageTokens + summaryTokens;
  }

  /**
   * 获取任务的完整上下文（用于LLM调用）
   */
  async getContextForLLM(taskId: string): Promise<string> {
    const task = await this.taskStore.getTask(taskId);

    if (!task?.context) {
      return '';
    }

    const ctx = task.context;

    // 构建上下文字符串
    const sections = [];

    // 1. 摘要部分
    sections.push(this.formatSummary(ctx.summary));

    // 2. Artifact索引
    if (ctx.artifactIndex.length > 0) {
      sections.push(`
## Artifact Index
${ctx.artifactIndex.map(a => `- ${a.artifactType}: ${a.path} (${a.action})`).join('\n')}
`);
    }

    // 3. 最近消息
    sections.push(`
## Recent Messages
${ctx.messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')}
`);

    return sections.join('\n---\n');
  }
}
```

### 5. 多轮对话上下文传递

**文件位置**：`steps/agents/task-chat.step.ts`

```typescript
import { z } from 'zod';
import { ContextManager } from '../../core/context/manager';

export const config = {
  type: 'api',
  name: 'task-chat',
  path: '/api/tasks/:id/chat',
  method: 'POST',
  emits: ['agent.task.chat'],
};

const chatSchema = z.object({
  message: z.string(),
  userId: z.string().optional(),
});

export const handler = async (request: any, { logger, emit, streams }) => {
  const contextManager = new ContextManager();
  const taskId = request.params.id;
  const body = await request.json();
  const { message, userId } = chatSchema.parse(body);

  try {
    // 1. 获取任务
    const task = await getTask(taskId);
    if (!task) {
      return { status: 404, body: { error: 'Task not found' } };
    }

    // 2. 添加用户消息
    const userMessage: Message = {
      id: generateId(),
      taskId,
      role: 'user',
      content: message,
      metadata: {
        timestamp: new Date(),
        userId,
      },
    };

    const updatedContext = await contextManager.addMessage(task.context, userMessage);

    // 3. 通过Stream发送用户消息
    await streams.taskExecution.set(taskId, taskId, {
      type: 'chat',
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // 4. 发送聊天事件给Agent
    await emit({
      topic: 'agent.task.chat',
      data: {
        taskId,
        sessionId: task.sessionId,
        message,
        context: updatedContext,
      },
    });

    // 5. 保存更新后的上下文
    await updateTaskContext(taskId, updatedContext);

    logger.info('User message added to task', { taskId, messageLength: message.length });

    return {
      status: 200,
      body: {
        success: true,
        messageId: userMessage.id,
        contextTurn: updatedContext.currentTurn,
      },
    };
  } catch (error) {
    logger.error('Failed to process chat message', { error, taskId });

    return {
      status: 500,
      body: { success: false, error: error.message },
    };
  }
};
```

### 6. Agent中集成上下文管理

**文件位置**：`steps/agents/master-agent.step.ts`（修改现有文件）

```typescript
import { ContextManager } from '../../core/context/manager';

export const handler = async (event: any, { logger, emit, streams }) => {
  const contextManager = new ContextManager();
  const { taskId, sessionId, task, context } = event.data;

  // 监听聊天消息
  if (event.topic === 'agent.task.chat') {
    // 处理多轮对话
    const fullContext = await contextManager.getContextForLLM(taskId);

    const llmResponse = await llmService.complete({
      prompt: `
Context:
${fullContext}

User Message: ${task}

Continue the conversation based on the context above.
`,
    });

    // 添加助手消息
    const assistantMessage: Message = {
      id: generateId(),
      taskId,
      role: 'assistant',
      content: llmResponse.content,
      metadata: {
        timestamp: new Date(),
        llmCalls: 1,
      },
    };

    const updatedContext = await contextManager.addMessage(context, assistantMessage);

    // 流式发送响应
    await streams.taskExecution.set(taskId, taskId, {
      type: 'chat',
      role: 'assistant',
      content: llmResponse.content,
      timestamp: new Date().toISOString(),
    });

    // 保存上下文
    await updateTaskContext(taskId, updatedContext);

    return;
  }

  // 原有的任务执行逻辑...
  // ...
};
```

## 数据流

```
用户发送消息
  ↓
POST /api/tasks/:id/chat
  ↓
task-chat.step.ts
  ├─ contextManager.addMessage(userMessage)
  ├─ streams.taskExecution.set(type='chat')
  └─ emit(agent.task.chat)
      ↓
master-agent.step.ts
  ├─ contextManager.getContextForLLM()
  │  └─ 返回摘要 + Artifact + 最近消息
  ├─ llmService.complete(prompt_with_context)
  └─ contextManager.addMessage(assistantMessage)
      ↓
前端实时收到Stream更新
  ├─ 用户消息
  └─ Agent响应（流式）
```

## 压缩触发策略

| 策略 | 触发条件 | 优点 | 缺点 |
|------|----------|------|------|
| **固定阈值**（推荐） | tokens > maxTokens * 0.8 | 简单可靠 | 可能在不需要时触发 |
| 滑动窗口 | 保留最近N条消息 | 可预测大小 | 可能丢失重要早期信息 |
| 任务边界 | 每个子任务完成后 | 摘要清晰 | 不可预测的触发时机 |

**推荐**：固定阈值 80%，保留最近 20 条消息

## Artifact完整性保证

### 专门的Artifact索引表
- 独立于摘要，避免丢失
- 记录每次文件/函数操作
- 支持时间线回溯

### 自动提取
- 从每条assistant消息中提取
- LLM辅助识别
- 结构化存储

### 按需查询
```typescript
// 获取某个文件的所有修改历史
const fileHistory = await taskStore.getArtifactHistory(taskId, 'auth.controller.ts');

// 获取所有创建的文件
const createdFiles = await taskStore.getArtifactsByType(taskId, 'file', 'created');
```

## 压缩质量评估

### Probe-based Evaluation

```typescript
// 压缩后自动验证
async function evaluateCompressionQuality(
  originalContext: TaskContext,
  compressedContext: TaskContext
): Promise<CompressionQuality> {
  const probes = [
    {
      type: 'recall',
      question: 'What was the original task?',
      expectedAnswer: originalContext.summary.currentTask,
    },
    {
      type: 'artifact',
      question: 'Which files were modified?',
      expectedAnswer: originalContext.artifactIndex.map(a => a.path),
    },
    {
      type: 'decision',
      question: 'What decisions were made?',
      expectedAnswer: originalContext.summary.decisionsMade.map(d => d.topic),
    },
  ];

  const results = await Promise.all(
    probes.map(async (probe) => {
      const response = await llmService.complete({
        prompt: `
Context:
${await contextManager.getContextForLLM(compressedContext.taskId)}

Question: ${probe.question}
`,
      });

      return {
        ...probe,
        actualAnswer: response.content,
        correct: evaluateCorrectness(probe.expectedAnswer, response.content),
      };
    })
  );

  return {
    probes: results,
    overallScore: results.filter(r => r.correct).length / results.length,
  };
}
```

## 实现优先级

1. ✅ **Phase 1**: 实现ContextManager基础功能
   - 创建/加载任务上下文
   - 添加消息
   - 简单的上下文获取

2. ⏳ **Phase 2**: 实现上下文压缩
   - Anchored Iterative Summarization
   - 结构化摘要生成
   - Artifact索引

3. ⏳ **Phase 3**: 多轮对话集成
   - task-chat API
   - Agent中集成上下文管理
   - 流式响应

4. ⏳ **Phase 4**: 高级功能
   - 压缩质量评估
   - Artifact查询API
   - 上下文可视化

## 相关文档

- [Skill Hook System](./skill-hook-system.md)
- [Motia Event Steps](../../.cursor/rules/motia/event-steps.mdc)
- [Context Compression Research](https://github.com/factory-ai/context-compression-research)

## 参考资料

- Factory Research: "Evaluating Context Compression for AI Agents" (December 2025)
- Netflix Engineering: "The Infinite Software Crisis" (AI Summit 2025)
- Zheng et al.: "Research on LLM-as-judge evaluation methodology" (2023)
