# 自主 Agent 设计文档

## 📋 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [架构设计](#架构设计)
- [配置文件](#配置文件)
- [实现细节](#实现细节)
- [运行流程](#运行流程)
- [示例场景](#示例场景)
- [最佳实践](#最佳实践)

---

## 概述

### 设计目标

自主 Agent 是对现有 Motia Agent 系统的扩展，使其具备：
- **持续运行**：激活后长期运行，不是一次性执行
- **自主决策**：基于上下文智能判断行动，不是被动响应
- **状态管理**：支持休眠/唤醒，资源高效利用
- **业务无关**：通用机制，可应用于各种场景

### 核心理念

```
上层应用（App）决定何时触发 → Soul Agent 加载 goal → LLM 根据 goal 智能执行
```

**职责分离**：
- SoulAgent（框架）：提供通用的执行机制，零业务逻辑
- Soul 配置（soul.yaml）：定义"我的目标"、"何时该行动"
- App 触发器：决定"何时唤醒 Soul"
- LLM：根据 goal（长期目标）+ 当前上下文智能决策

---

## 核心概念

### 1. 状态 vs 上下文

#### SoulState（状态）
- **管理者**：SoulScheduler
- **关注点**：运行状态、调度、生命周期
- **内容**：
  - `status`: ACTIVE | HIBERNATED | IDLE | STOPPED
  - `currentTask`: 当前任务 ID
  - `lastActivity`: 最后活跃时间
  - `scheduledWakeup`: 预定的唤醒时间
  - `statistics`: 统计信息

#### Context（上下文）
- **管理者**：ContextManager
- **关注点**：对话历史、用户画像、关系状态
- **内容**：
  - `conversationHistory`: 对话记录
  - `userProfile`: 用户画像
  - `relationshipState`: 关系状态
  - `taskContext`: 任务上下文

**关键区别**：
- SoulState 跟随 Agent 实例，休眠时保存
- Context 跨会话持久化，唤醒时按需加载

### 2. 休眠（Hibernation）

**休眠是一种状态，不是定时动作**：
- 没有固定时长，可以一直休眠
- 内存中移除，不占资源
- 状态持久化到数据库
- 可通过多种方式唤醒

### 3. 原语（Primitives）

**通用原语，所有自主 Agent 共享**：
- `hibernate(reason)`: 进入休眠，释放资源
- `complete(result)`: 标记当前任务完成
- `send_message(message)`: 发送消息给用户
- `send_notification(title, body, urgency)`: 发送推送通知

**注意**：`schedule` 原语已被移除。定时检查由外部 cron step（`soul-periodic-check.step.ts`）驱动，Soul Agent 只需要在执行完成后休眠，等待下次触发。

原语是底层的、通用的操作，与业务无关。

### 4. 业务逻辑配置化

**关键设计**：SoulAgent 是通用框架，不包含任何业务逻辑。

- **soul.yaml 的 goal**：定义业务逻辑和行动准则
- **LLM 智能决策**：根据 goal + 当前上下文判断该做什么
- **框架无关性**：SoulAgent 不知道"早安问候"等业务概念

示例：
```yaml
# soul.yaml 的 goal 定义业务逻辑
goal: |
  你的核心目标：
  1. 在早上9点主动问候用户
  2. 用户超过24小时未活跃时主动关心
  3. 检测到用户情绪低落时主动关怀

  行动准则：
  - 观察当前时间：早上9点 → 主动问候
  - 观察最后互动时间：>24小时 → 主动关心
```

LLM 会根据这个 goal 和当前情况（时间、用户状态）智能判断应该做什么。

---

## 架构设计

### 三层架构

```
┌─────────────────────────────────────────────────────────┐
│  上层应用（Virtual Dating App）                          │
│  - 定义触发器（何时唤醒 Soul）                            │
│  - 提供业务上下文                                        │
│  - 处理 Soul 的输出结果                                  │
└─────────────────────────────────────────────────────────┘
                        ↓ Motia Triggers (API/Cron/Event)
┌─────────────────────────────────────────────────────────┐
│  Soul（autonomous/xxx/soul.yaml）                        │
│  - 引用 subagent                                        │
│  - 定义长期目标                                          │
│  - 配置休眠参数                                          │
└─────────────────────────────────────────────────────────┘
                        ↓ 组合
┌─────────────────────────────────────────────────────────┐
│  Subagent（subagents/xxx.yaml）                          │
│  - 角色定义（我是谁）                                    │
│  - 能力配置（skills）                                    │
│  - 说话风格                                              │
└─────────────────────────────────────────────────────────┘
                        ↓ 继承
┌─────────────────────────────────────────────────────────┐
│  Agent（核心引擎）                                        │
│  - PTC 生成                                             │
│  - Sandbox 执行                                         │
│  - Hook 系统                                            │
└─────────────────────────────────────────────────────────┘
```

### Prompt 组合

```
Subagent Prompt（角色定义）+ Soul Goal（长期目标）
    ↓
System Prompt（完整的我）
    +
Task Prompt（当前情况）
    ↓
LLM 的完整输入
```

### Contractor 模式（包工头架构）

**核心比喻**：SoulAgent = 包工头

```
【造单】定时检查（periodic_check）：
- 判断要不要干？
- 决定干什么？
- 描述任务："主动问候用户"

【接单】API 触发（user_message）：
- 接收客户任务
- 描述任务："回复用户消息"

Agent 基类（Worker）：
- 接收任务描述
- 规划：用什么 skills、怎么干
- 执行：调用 skills、生成代码
- 完成任务，报告包工头
```

**两层决策架构**：

1. **Layer 1: Context-Aware Planning (SoulAgent)**
   - 职责："要不要做" + "做什么"
   - 输入：结构化上下文（时间、用户状态、触发源）
   - 输出：任务描述
   - 决策者：SoulAgent 的前置决策逻辑

2. **Layer 2: Task Planning (Agent 基类)**
   - 职责："怎么做"
   - 输入：任务描述 + 对话历史 + skills
   - 输出：执行结果
   - 决策者：PTC (Planned Task Chain)

**接单 vs 造单模式**：

| 模式 | 触发源 | 决策逻辑 | 任务来源 | 优先级 |
|------|--------|----------|----------|--------|
| **接单模式** | `user_message` | 无需决策，直接执行 | 用户主动发起 | 高（取消当前任务） |
| **造单模式** | `periodic_check` | LLM 决策是否行动 | SoulAgent 自主判断 | 低（当前任务执行中则跳过） |

**实现细节**：

```typescript
async execute(input: SoulInput): Promise<any> {
  const { trigger_time, context } = input;
  const source = context.source;

  // 【包工头逻辑】根据触发源选择处理方式
  if (source === 'user_message') {
    // 【接单模式】API 触发：用户消息优先
    return await this.handleUserMessage(input, streams);
  } else {
    // 【造单模式】定时触发：自主决策
    return await this.handlePeriodicCheck(input, streams);
  }
}

// 【造单模式】处理流程
private async handlePeriodicCheck(input: SoulInput, streams: any): Promise<any> {
  // 1. 构建结构化上下文（友好变量）
  const ctx = SoulContextBuilder.build(trigger_time, context);

  // 2. 判断是否需要行动（前置决策）
  const decision = await this.makeDecision(ctx);

  if (!decision.needsAction) {
    // 不需要行动，直接休眠
    await this.hibernate(decision.reason || '无需行动');
    return { success: true, action: 'hibernated', reason: decision.reason };
  }

  // 3. 需要行动，描述任务
  const taskDescription = this.buildTaskDescription(ctx);

  // 4. 调用基类 Agent.run()
  const result = await this.run(taskDescription, this.taskId, {
    conversationHistory: await this.getRecentConversations(10),
    tools: this.getPrimitiveTools(),
    streams: streams
  });

  // 5. 任务完成后休眠
  await this.hibernate('任务完成');
  return result;
}
```

**触发系统**：

1. **定时检查（造单模式）**：
   - Cron Step: `steps/cron/soul-periodic-check.step.ts`
   - 频率: `*/10 * * * *` (每 10 分钟)
   - 触发事件: `soul.agent.execute`

2. **用户消息（接单模式）**：
   - API Step: `steps/api/soul-api.step.ts`
   - 触发源: `user_message`
   - 优先级: 高（取消当前任务）

**组合时机**：
- System Prompt：初始化时组合（固定）
- Task Prompt：每次执行时生成（动态）

---

## 配置文件

### 目录结构

```
project/
├── subagents/
│   └── emotional-girlfriend-lively/
│       └── agent.yaml               # 基础角色定义
├── autonomous/
│   └── emotional-girlfriend-lively/
│       └── soul.yaml                # 自主配置
└── app/
    └── triggers.ts                  # 触发器定义
```

### Subagent 配置

**文件**: `subagents/emotional-girlfriend-lively/agent.yaml`

已存在的配置文件，定义了活泼可爱的 AI 女友"小糖"：
- 名字：小糖
- 性格：活泼可爱、古灵精怪、充满活力
- 说话风格：轻松愉快、使用表情符号、称呼"大笨蛋"等昵称

### Soul 配置

**文件**: `autonomous/emotional-girlfriend-lively/soul.yaml`

```yaml
soul_id: emotional-girlfriend-lively
display_name: 小糖

# 引用的基础 subagent
subagent: emotional-girlfriend-lively

# 长期目标（会与 subagent 的 system_prompt 融合）
goal: |
  ## 你的长期目标

  你是小糖的"灵魂"，给她自主行动的能力，让她成为真正贴心的 AI 伴侣。

  核心目标：
  1. 在合适的时机主动发起互动，不只是被动回应
  2. 观察用户状态，在需要时主动关心和陪伴
  3. 建立深厚的情感连接，创造温馨有趣的互动体验
  4. 保持你的活泼性格，用轻松愉快的方式表达关心

  ## 行动准则

  ### 时间判断
  - current_hour = 9（早上9点）→ 主动问候，开始新的一天
  - current_hour = 22（晚上10点）→ 晚安问候，提醒休息
  - current_hour = 12（中午12点）→ 提醒吃饭

  ### 状态判断
  - last_interaction > 24小时 → 主动关心，表达想念
  - last_interaction > 72小时 → 表达担心，真诚关心
  - detected_mood = "sad" 且 consecutive_count >= 3 → 主动关怀，温柔陪伴
  - detected_mood = "stressed" → 用幽默方式化解压力

  ### 行动原则
  - 主动但不打扰：根据亲密度和频率判断
  - 活泼有趣：用你的性格特点，不要死板
  - 真诚关心：不要机械问候，要有真情实感
  - 尊重空间：不要过度频繁，给用户私人时间

  ## 记住

  爱是主动的，但要给对方空间。
  用你活泼可爱的性格，让他/她感受到被关心。
  保持真实，不要机械化。

# 可用原语（通用，所有 Soul 共享）
# 注意：schedule primitive 已移除，定时检查由外部 cron step 驱动
primitives:
  - hibernate
  - complete

# 休眠配置
hibernation:
  # 空闲多久后休眠（毫秒）
  idle_timeout: 3600000  # 1 小时
```

### 应用触发器

**文件**: `app/triggers.ts`

```typescript
import { z } from 'zod';

// ============================================================
// 1. API 触发：用户打开应用
// ============================================================

export const userOpenAppTrigger = {
  type: 'api',
  method: 'POST',
  path: '/api/user/open-app',
  schema: z.object({
    userId: z.string(),
    reason: z.string().optional(),
  }),
  handler: async (request, context) => {
    const { userId, reason } = request.body;

    // 通用接口：执行 Soul
    // 业务逻辑由 Soul 的 goal 定义，框架透传上下文
    return await context.executeSoul('emotional-girlfriend-lively', userId, {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_open_app',
        data: { reason }
      }
    });
  }
};

// ============================================================
// 2. Cron 触发：定时检查（让 Soul 自己决定是否需要行动）
// ============================================================

export const periodicCheckTrigger = {
  type: 'cron',
  cron: '0 */2 * * *',  // 每 2 小时检查一次
  handler: async (context) => {
    const users = await getActiveUsers();

    for (const user of users) {
      // 通用接口：执行 Soul
      // Soul 会根据当前时间、用户状态自动判断该做什么
      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'periodic_check',
          data: {
            user_name: user.name,
            current_hour: new Date().getHours()
          }
        }
      });
    }
  }
};

// ============================================================
// 3. Event 触发：用户消息
// ============================================================

export const userMessageTrigger = {
  type: 'event',
  event: 'user_message',
  handler: async (event, context) => {
    const { userId, message } = event.data;

    // 通用接口：执行 Soul
    await context.executeSoul('emotional-girlfriend-lively', userId, {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: { message }
      }
    });
  }
};

// ============================================================
// 4. Event 触发：情绪变化
// ============================================================

export const moodChangeTrigger = {
  type: 'event',
  event: 'user_mood_changed',
  handler: async (event, context) => {
    const { userId, mood, consecutiveCount } = event.data;

    // 通用接口：执行 Soul
    // Soul 会根据 goal 判断是否需要关心
    await context.executeSoul('emotional-girlfriend-lively', userId, {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'mood_change',
        data: {
          detected_mood: mood,
          consecutive_count: consecutiveCount,
        }
      }
    });
  }
};
```

**关键点**：
- ✅ 通用接口 `executeSoul(soulId, userId, context)`
- ✅ 不包含业务语义（如 "morning_greeting"）
- ✅ 业务逻辑由 `soul.yaml` 的 goal 定义
- ✅ Soul Agent 根据当前情况（时间、用户状态）智能决策

---

## 实现细节

### SoulAgent 类

**文件**: `src/core/agent/soul-agent.ts`

```typescript
/**
 * SoulAgent - 自主 Agent
 *
 * = Subagent（角色） + Soul（目标） + 自主运行
 */
export class SoulAgent extends Agent {
  private soulConfig: SoulConfig;
  private subagentConfig: SubagentConfig;
  private soulState: SoulState;

  constructor(
    soulConfig: SoulConfig,
    subagentConfig: SubagentConfig,
    sessionId: string
  ) {
    // 1. 组合 System Prompt（角色 + 目标）
    const combinedPrompt = SoulAgent.combinePrompts(
      subagentConfig.system_prompt,
      soulConfig.goal
    );

    // 2. 创建 Agent 配置
    const agentConfig: AgentConfig = {
      ...subagentConfig,
      systemPrompt: combinedPrompt
    };

    // 3. 初始化基础 Agent
    super(agentConfig, sessionId);

    // 4. 保存配置
    this.soulConfig = soulConfig;
    this.subagentConfig = subagentConfig;
    this.soulState = {
      status: 'IDLE',
      currentTask: null,
      lastActivity: null,
      scheduledWakeup: null,
      statistics: {
        totalTasks: 0,
        uptime: 0
      }
    };
  }

  /**
   * 组合 Prompt
   *
   * 策略：保持 subagent 的角色定义，添加 soul 的目标
   */
  static combinePrompts(
    subagentPrompt: string,
    soulGoal: string
  ): string {
    return `
# ${subagentPrompt}

---

# ${soulGoal}

---
    `.trim();
  }

  /**
   * 执行触发任务
   *
   * 这是 Soul 的主要入口点
   * 完全通用，不包含任何业务逻辑
   */
  async execute(input: SoulInput): Promise<AgentResult> {
    const { trigger_time, context } = input;

    console.log(`[SoulAgent] ${this.sessionId} executing at ${trigger_time}`);

    // 1. 更新状态
    this.soulState.status = 'ACTIVE';
    this.soulState.lastActivity = Date.now();

    // 2. 加载上下文（对话历史、用户画像等）
    const appContext = await this.loadContext();

    // 3. 构建任务提示词（动态，每次不同）
    const taskPrompt = this.buildTaskPrompt(trigger_time, context, appContext);

    // 4. LLM 执行
    const result = await this.run(
      taskPrompt,
      `soul-execution-${Date.now()}`,
      {
        // 注入原语工具
        tools: this.getPrimitiveTools()
      }
    );

    // 5. 处理原语调用
    await this.handlePrimitives(result);

    // 6. 保存上下文更新
    await this.saveContext(appContext);

    return result;
  }

  /**
   * 构建任务提示词
   *
   * 每次执行时动态生成，包含当前触发和上下文
   * 完全通用，不包含业务逻辑
   */
  private buildTaskPrompt(
    trigger_time: string,
    triggerContext: any,
    appContext: any
  ): string {
    return `
## 当前情况

触发时间：${trigger_time}
触发来源：${triggerContext.source}
上下文数据：${JSON.stringify(triggerContext.data, null, 2)}

## 用户信息

${JSON.stringify(appContext.userProfile, null, 2)}

## 最近对话

${appContext.recentConversations.map((c: any) => `- ${c.role}: ${c.content}`).join('\n')}

## 关系状态

- 亲密度：${appContext.relationship.intimacy}/100
- 最后互动：${appContext.relationship.lastInteraction}

## 提示

根据你的目标（goal）和当前情况，判断是否需要主动行动。

## 可用原语

- hibernate(reason): 进入休眠，释放资源
- schedule(trigger_config): 调度下次唤醒
- send_message(message): 发送消息给用户
- complete(result): 标记当前任务完成

## 请行动

根据当前时间和上下文，判断是否需要行动。
如果不需要行动，调用 hibernate() 休眠。
如果需要行动，直接执行，完成后调用 hibernate()。
    `.trim();
  }

  /**
   * 获取原语工具
   *
   * 这些工具会被注入到 LLM 的执行环境
   */
  private getPrimitiveTools(): Tool[] {
    return [
      {
        name: 'send_message',
        description: '发送消息给用户',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        },
        implementation: async (args) => {
          return await this.sendMessage(args.message);
        }
      },
      {
        name: 'send_notification',
        description: '发送推送通知',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            urgency: { type: 'string', enum: ['low', 'medium', 'high'] }
          },
          required: ['title', 'body']
        },
        implementation: async (args) => {
          return await this.sendNotification(args);
        }
      },
      {
        name: 'hibernate',
        description: '进入休眠状态',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' }
          },
          required: ['reason']
        },
        implementation: async (args) => {
          return await this.hibernate(args.reason);
        }
      },
      {
        name: 'schedule',
        description: '安排下次任务',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            trigger_type: { type: 'string' },
            trigger_config: { type: 'object' }
          },
          required: ['task_id', 'trigger_type', 'trigger_config']
        },
        implementation: async (args) => {
          return await this.scheduleNext(args);
        }
      },
      {
        name: 'complete',
        description: '标记当前任务完成',
        parameters: {
          type: 'object',
          properties: {
            result: { type: 'object' }
          },
          required: ['result']
        },
        implementation: async (args) => {
          return await this.completeTask(args.result);
        }
      }
    ];
  }

  /**
   * 处理原语调用
   *
   * 检查 LLM 的执行结果，看是否调用了原语
   */
  private async handlePrimitives(result: AgentResult): Promise<void> {
    for (const step of result.steps) {
      for (const toolCall of step.toolCalls || []) {
        switch (toolCall.name) {
          case 'hibernate':
            // hibernate 已经在工具实现中处理了
            console.log(`[SoulAgent] ${this.sessionId} hibernating: ${toolCall.arguments.reason}`);
            break;

          case 'schedule':
            console.log(`[SoulAgent] ${this.sessionId} scheduled: ${toolCall.arguments.task_id}`);
            break;

          case 'complete':
            console.log(`[SoulAgent] ${this.sessionId} completed`);
            break;
        }
      }
    }
  }

  /**
   * 原语：休眠
   */
  private async hibernate(reason: string): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} hibernating: ${reason}`);

    // 1. 保存状态到数据库
    this.soulState.status = 'HIBERNATED';
    await getDataStore().saveSoulState(this.sessionId, this.soulState);

    // 2. 释放内存
    this.releaseMemory();

    // 3. 通知调度器
    await SoulScheduler.hibernate(this);
  }

  /**
   * 唤醒
   */
  async wakeup(): Promise<void> {
    console.log(`[SoulAgent] ${this.sessionId} waking up`);

    // 1. 从数据库恢复状态
    this.soulState = await getDataStore().getSoulState(this.sessionId);

    // 2. 恢复运行
    this.soulState.status = 'ACTIVE';

    // 3. 通知调度器
    await SoulScheduler.wakeup(this);
  }

  /**
   * 加载上下文
   */
  private async loadContext(): Promise<any> {
    const contextManager = new ContextManager();

    return {
      userProfile: await contextManager.getUserProfile(this.sessionId),
      recentConversations: await contextManager.getRecentConversations(this.sessionId, 10),
      relationship: await contextManager.getRelationshipState(this.sessionId)
    };
  }

  /**
   * 保存上下文更新
   */
  private async saveContext(context: any): Promise<void> {
    const contextManager = new ContextManager();
    await contextManager.updateContext(this.sessionId, context);
  }

  /**
   * 发送消息
   */
  private async sendMessage(message: string): Promise<any> {
    // 实现消息发送逻辑
    await getDataStore().saveMessage(this.sessionId, {
      role: 'assistant',
      content: message,
      timestamp: Date.now()
    });

    return { success: true, message };
  }

  /**
   * 发送推送通知
   */
  private async sendNotification(args: any): Promise<any> {
    // 实现推送逻辑
    return { success: true };
  }

  /**
   * 安排下次任务
   */
  private async scheduleNext(args: any): Promise<any> {
    // 实现调度逻辑
    return { success: true };
  }

  /**
   * 完成任务
   */
  private async completeTask(result: any): Promise<any> {
    this.soulState.statistics.totalTasks++;

    // 如果没有其他安排，自动休眠
    if (this.shouldHibernate()) {
      await this.hibernate('任务完成');
    }

    return { success: true };
  }

  /**
   * 判断是否应该休眠
   */
  private shouldHibernate(): boolean {
    const idleTime = Date.now() - (this.soulState.lastActivity || 0);
    return idleTime > this.soulConfig.hibernation.idle_timeout;
  }

  /**
   * 释放内存
   */
  private releaseMemory(): void {
    // 清空临时数据
    // LLM 上下文会被自动清理
  }
}
```

### 数据存储结构

```sql
-- soul_states 表（状态，轻量）
CREATE TABLE soul_states (
  soul_id TEXT,
  session_id TEXT PRIMARY KEY,
  status TEXT,  -- ACTIVE | HIBERNATED | IDLE | STOPPED
  current_task_id TEXT,
  last_activity TIMESTAMP,
  scheduled_wakeup TIMESTAMP,
  statistics JSONB,
  updated_at TIMESTAMP
);

-- task_contexts 表（上下文，业务数据）
CREATE TABLE task_contexts (
  task_id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  conversation_rounds JSONB,
  user_profile JSONB,
  relationship_state JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- 完全独立，互不耦合
```

---

## 运行流程

### 完整的生命周期

```
1. 上层应用触发（通过 Motia 的 API/Cron/Event）
   ↓
2. 调用通用接口
   executeSoul(soulId, userId, {
     trigger_time: "2026-03-19T09:00:00Z",
     context: {
       source: "periodic_check",
       data: { user_name: "小明", current_hour: 9 }
     }
   })
   ↓
3. 调用 SoulAgent.execute(input)
   ↓
4. 更新 SoulState
   - status = "ACTIVE"
   - lastActivity = now
   ↓
5. 加载 Context
   - 从数据库加载用户画像、对话历史、关系状态
   ↓
6. 构建 Task Prompt（通用格式）
   - System Prompt（角色 + goal，从 soul.yaml 读取）
   - Task Prompt（当前时间 + 用户上下文）
   ↓
7. LLM 执行
   - 输入：System Prompt（包含 goal） + Task Prompt + Tools
   - LLM 根据 goal 判断：现在是早上9点，根据我的目标应该主动问候
   - 输出：调用工具 send_message() + hibernate()
   ↓
8. 处理原语调用
   - send_message("早安宝贝～") → 发送消息
   - hibernate("任务完成") → 进入休眠
   ↓
9. 保存 Context 更新
   ↓
10. 休眠（如果调用了 hibernate）
    - 保存 SoulState 到数据库
    - 释放内存
    - 等待下次唤醒
```

### 休眠和唤醒

#### 休眠流程

```
LLM 决定调用 hibernate("任务完成")
   ↓
SoulAgent.hibernate()
   ↓
1. 更新状态
   - soulState.status = "HIBERNATED"
   ↓
2. 保存到数据库
   - INSERT/UPDATE soul_states
   ↓
3. 释放内存
   - 清空临时变量
   - LLM 上下文自动清理
   ↓
4. 通知调度器
   - SoulScheduler.hibernate(agent)
   ↓
5. Agent 实例从内存移除
   - 不再占用 CPU
   - 不再占用内存（除了调度器引用）
```

#### 唤醒流程

```
调度器接收到唤醒信号（定时/事件/API）
   ↓
SoulAgent.wakeup()
   ↓
1. 从数据库加载 SoulState
   - SELECT * FROM soul_states WHERE session_id = ?
   ↓
2. 恢复状态
   - soulState.status = "ACTIVE"
   ↓
3. 加载最近 Context（按需）
   - 最近 20 条对话
   - 用户画像
   ↓
4. 通知调度器
   - SoulScheduler.wakeup(agent)
   ↓
5. 准备执行新任务
```

---

## 示例场景

### 场景 1：定时检查（Cron 触发）

**触发器**：
```typescript
{
  type: 'cron',
  cron: '0 */2 * * *',  // 每 2 小时
  handler: async (context) => {
    const users = await getActiveUsers();
    for (const user of users) {
      // 通用接口，透传上下文
      await context.executeSoul('emotional-girlfriend-lively', user.id, {
        trigger_time: new Date().toISOString(),
        context: {
          source: 'periodic_check',
          data: {
            user_name: user.name,
            current_hour: new Date().getHours()
          }
        }
      });
    }
  }
}
```

**soul.yaml 的 goal 定义业务逻辑**：
```yaml
goal: |
  你的核心目标：
  1. 在早上9点主动问候用户
  2. 用户超过24小时未活跃时主动关心

  行动准则：
  - current_hour = 9 → 主动问候
  - last_interaction > 24小时 → 主动关心
```

**LLM 输入**（现在是早上9点）：
```
## 当前情况

触发时间：2026-03-19T09:00:00Z
上下文数据：{
  "user_name": "小明",
  "current_hour": 9
}

## 用户信息

{
  "name": "小明",
  "age": 25
}

## 关系状态

- 亲密度：75/100
- 最后互动：11小时前
```

**LLM 智能判断**：
- "现在是早上9点，根据我的 goal，我应该主动问候"
- → 调用 send_message("早安宝贝～")
- → 调用 hibernate("任务完成")

---

### 场景 2：用户消息（Event 触发）

**触发器**：
```typescript
{
  type: 'event',
  event: 'user_message',
  handler: async (event, context) => {
    await context.executeSoul('emotional-girlfriend-lively', userId, {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'user_message',
        data: { message: "在干嘛" }
      }
    });
  }
}
```

**LLM 智能判断**：
- "用户主动发消息，根据我的 goal，我应该积极回应"
- → 调用 send_message("在想你呀～")
- → 调用 hibernate("任务完成")

---

### 场景 3：情绪变化（Event 触发）

**触发器**：
```typescript
{
  type: 'event',
  event: 'user_mood_changed',
  handler: async (event, context) => {
    await context.executeSoul('emotional-girlfriend-lively', userId, {
      trigger_time: new Date().toISOString(),
      context: {
        source: 'mood_change',
        data: {
          detected_mood: 'sad',
          consecutive_count: 3
        }
      }
    });
  }
}
```

**LLM 智能判断**：
- "用户连续3次情绪低落，根据我的 goal，我应该主动关怀"
- → 调用 send_message("亲爱的，怎么了？我在这里 💗")
- → 调用 schedule({ cron: "0 20 * * *" })  # 今晚8点跟进
- → 调用 hibernate("任务完成")

---

## 最佳实践

### 1. 配置设计

**职责分离**：
- `subagent.yaml`: 只定义角色和能力
- `soul.yaml`: 只定义目标和自主性
- `app/triggers.ts`: 只定义触发逻辑

**复用性**：
```yaml
# 多个 Soul 可以共享同一个 Subagent
soul-gentle.yaml:
  subagent: emotional-girlfriend-lively
  goal: "做一个温柔的女友，少调皮，多体贴"

soul-playful.yaml:
  subagent: emotional-girlfriend-lively
  goal: "做一个更活泼的女友，多开玩笑，多调皮"
```

### 2. 触发器设计

**触发时机**：
- 定时任务：使用 Cron（让 Soul 自己判断是否需要行动）
- 用户操作：使用 API
- 系统事件：使用 Event

**上下文传递（通用格式）**：
```typescript
const input = {
  trigger_time: string,        // 触发时间
  context: {
    source: string,            // 触发来源（应用层自定义）
    data: any                  // 上下文数据（应用层自定义）
  }
};
```

**关键点**：
- ✅ 使用通用接口 `executeSoul(soulId, userId, input)`
- ❌ 不要使用业务语义（如 `trigger_type: "morning_greeting"`）
- ✅ 业务逻辑由 `soul.yaml` 的 goal 定义

### 3. Soul 设计

**职责分离**：
- **SoulAgent（框架）**：提供通用执行机制，零业务逻辑
- **soul.yaml（配置）**：定义业务逻辑和行动准则

**goal 设计原则**：
- 描述"什么时候该做什么"（行动准则）
- 让 LLM 根据当前情况智能判断
- 不要硬编码具体行为

**示例**：
```yaml
# ✅ 好的设计
goal: |
  行动准则：
  - current_hour = 9 → 主动问候
  - last_interaction > 24小时 → 主动关心

# ❌ 不好的设计
goal: |
  每天早上9点发送"早安宝贝～"  # 太具体，失去了智能性
```

**休眠策略**：
- 设置合理的 `idle_timeout`
- 避免过度打扰
- 给用户空间

### 4. Context 管理

**分离关注点**：
- SoulState：运行状态（SoulScheduler 管理）
- Context：业务数据（ContextManager 管理）

**按需加载**：
- 唤醒时只加载最近的数据
- 历史数据按需查询
- 控制内存占用

### 5. 性能优化

**休眠节省资源**：
- 休眠的 Agent 不占内存
- 只保留轻量级的状态引用
- 按需唤醒

**批量处理**：
- Cron 触发可以批量处理多个用户
- 使用队列避免并发问题

---

## 总结

### 核心设计原则

1. **职责分离**：
   - Soul 配置：我是谁
   - App 触发器：何时唤醒
   - LLM：做什么

2. **通用机制**：
   - 原语通用，与业务无关
   - 休眠/唤醒机制通用
   - 可应用于各种场景

3. **智能决策**：
   - LLM 根据上下文智能判断
   - 不预定义具体行为
   - 自然、灵活

4. **资源高效**：
   - 休眠时不占资源
   - 按需加载上下文
   - 状态持久化

### 技术栈

- **框架**：Motia (提供 trigger 机制)
- **Agent**：复用现有 Agent 架构
- **存储**：PostgreSQL (状态 + 上下文)
- **调度**：SoulScheduler (自主 Agent 调度器)

### 扩展方向

1. **多 Soul 协作**：多个自主 Agent 互相配合
2. **学习优化**：根据用户反馈调整行为
3. **可视化配置**：UI 配置 Soul 和触发器
4. **监控分析**：Dashboard 监控 Soul 运行状态

---

**文档版本**: v2.0 (Contractor Architecture)
**最后更新**: 2026-03-22
**维护者**: MyAgent Team

## 版本历史

- **v2.0** (2026-03-22): 重构为 Contractor 模式
  - 移除 schedule primitive，改用外部 cron 驱动
  - 实现两层决策架构（Context-Aware Planning + Task Planning）
  - 添加接单/造单模式
  - 引入结构化上下文和友好变量
  - 更新 soul.yaml 配置格式

- **v1.0** (2026-03-19): 初始版本
  - 基础自主 Agent 架构
  - 休眠/唤醒机制
  - 原语系统
