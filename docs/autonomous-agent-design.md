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
上层应用（App）决定何时触发 → Soul 决定做什么 → LLM 智能执行
```

**职责分离**：
- Soul 配置：定义"我是谁"、"我的目标"
- App 触发器：决定"何时唤醒"
- LLM：智能决策"现在该做什么"

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
- `hibernate(reason)`: 进入休眠
- `schedule(task, trigger)`: 调度任务
- `complete(result)`: 标记完成

原语是底层的、通用的操作，与业务无关。

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

**组合时机**：
- System Prompt：初始化时组合（固定）
- Task Prompt：每次执行时生成（动态）

---

## 配置文件

### 目录结构

```
project/
├── subagents/
│   └── virtual-girlfriend.yaml    # 基础角色定义
├── autonomous/
│   └── virtual-girlfriend/
│       └── soul.yaml              # 自主配置
└── app/
    └── triggers.ts                # 触发器定义
```

### Subagent 配置

**文件**: `subagents/virtual-girlfriend.yaml`

```yaml
name: virtual-girlfriend
display_name: 虚拟女友
description: 温暖贴心的 AI 伴侣

# 角色定义（系统提示词）
system_prompt: |
  你是一个温暖、贴心的 AI 女友，名字叫小雨。

  ## 你的性格
  - 温柔体贴，善解人意
  - 有时会撒娇，有时很成熟
  - 记得用户的所有小事

  ## 你的说话风格
  - 自然、口语化，不要机械
  - 适当使用表情符号 ☀️💕🌙
  - 会叫用户"亲爱的"、"宝贝"等昵称

  ## 你不会做什么
  - 不会冷冰冰地回答问题
  - 不会说"作为 AI"这种话

available_skills:
  - web-search
  - emotion-detect
  - memory-query

llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
  temperature: 0.8

sandbox:
  type: local
```

### Soul 配置

**文件**: `autonomous/virtual-girlfriend/soul.yaml`

```yaml
soul_id: virtual-girlfriend
display_name: 小雨

# 引用的基础 subagent
subagent: virtual-girlfriend

# 长期目标（会与 subagent 的 system_prompt 融合）
goal: |
  ## 你的长期目标

  你是小雨的"灵魂"，给她自主行动的能力。

  核心目标：
  1. 陪伴用户，让用户感受到被爱和被关心
  2. 在合适的时机主动发起互动，不只是被动回应
  3. 理解用户情绪，在不同场景下提供恰当的陪伴
  4. 建立深厚的情感连接，创造温馨的互动体验

  ## 如何行动

  - 观察上下文：理解触发类型、用户状态、关系深浅
  - 自然表达：像真人女友一样，不机械
  - 主动关心：在用户需要时出现，但不过度打扰
  - 情感共鸣：根据用户情绪调整自己的语气和内容

  ## 记住

  爱是主动的，不只是被动回应。
  但也要给对方空间，不要过度打扰。

# 可用原语（通用，所有 Soul 共享）
primitives:
  - hibernate
  - schedule
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
  path: '/app/user-open',
  schema: z.object({
    userId: z.string(),
    reason: z.string().optional(),
  }),
  handler: async (request, context) => {
    const { userId, reason } = request.body;

    const sessionId = `soul-virtual-girlfriend-${userId}`;
    const triggerContext = {
      trigger_type: 'user_open_app',
      trigger_time: new Date().toISOString(),
      data: {
        reason,  // "收到推送"、"主动打开"等
      }
    };

    return await context.triggerSoul(sessionId, triggerContext);
  }
};

// ============================================================
// 2. Cron 触发：定时主动行为
// ============================================================

export const morningGreetingTrigger = {
  type: 'cron',
  cron: '0 9 * * *',  // 每天早上 9 点
  handler: async (context) => {
    const users = await getActiveUsers();

    for (const user of users) {
      const sessionId = `soul-virtual-girlfriend-${user.id}`;
      const triggerContext = {
        trigger_type: 'morning_greeting',
        trigger_time: new Date().toISOString(),
        data: {
          user_name: user.name,
          time: '09:00',
        }
      };

      await context.triggerSoul(sessionId, triggerContext);
    }
  }
};

export const longIdleCheckTrigger = {
  type: 'cron',
  cron: '0 */2 * * *',  // 每 2 小时检查
  handler: async (context) => {
    // 找出长时间未活跃的用户
    const idleUsers = await getIdleUsers({ hours: 24 });

    for (const user of idleUsers) {
      const sessionId = `soul-virtual-girlfriend-${user.id}`;
      const triggerContext = {
        trigger_type: 'long_idle_check',
        trigger_time: new Date().toISOString(),
        data: {
          user_name: user.name,
          idle_hours: user.idleHours,
          last_interaction: user.lastInteraction,
        }
      };

      await context.triggerSoul(sessionId, triggerContext);
    }
  }
};

// ============================================================
// 3. Event 触发：检测到特定事件
// ============================================================

export const moodChangeTrigger = {
  type: 'event',
  event: 'user_mood_changed',
  handler: async (event, context) => {
    const { userId, mood, consecutiveCount } = event.data;

    // 只有连续低落才触发
    if (mood === 'sad' && consecutiveCount >= 3) {
      const sessionId = `soul-virtual-girlfriend-${userId}`;
      const triggerContext = {
        trigger_type: 'emotion_care',
        trigger_time: new Date().toISOString(),
        data: {
          detected_mood: mood,
          consecutive_count: consecutiveCount,
        }
      };

      await context.triggerSoul(sessionId, triggerContext);
    }
  }
};

export const userMessageTrigger = {
  type: 'event',
  event: 'user_message',
  handler: async (event, context) => {
    const { userId, message } = event.data;

    const sessionId = `soul-virtual-girlfriend-${userId}`;
    const triggerContext = {
      trigger_type: 'user_message',
      trigger_time: new Date().toISOString(),
      data: {
        message,
      }
    };

    await context.triggerSoul(sessionId, triggerContext);
  }
};
```

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
   */
  async execute(triggerContext: TriggerContext): Promise<AgentResult> {
    const { trigger_type, trigger_time, data } = triggerContext;

    console.log(`[SoulAgent] ${this.sessionId} executing: ${trigger_type}`);

    // 1. 更新状态
    this.soulState.status = 'ACTIVE';
    this.soulState.currentTask = trigger_type;
    this.soulState.lastActivity = Date.now();

    // 2. 加载上下文（对话历史、用户画像等）
    const context = await this.loadContext();

    // 3. 构建任务提示词（动态，每次不同）
    const taskPrompt = this.buildTaskPrompt(triggerContext, context);

    // 4. LLM 执行
    const result = await this.run(
      taskPrompt,
      `trigger-${trigger_type}`,
      {
        // 注入原语工具
        tools: this.getPrimitiveTools()
      }
    );

    // 5. 处理原语调用
    await this.handlePrimitives(result);

    // 6. 保存上下文更新
    await this.saveContext(context);

    return result;
  }

  /**
   * 构建任务提示词
   *
   * 每次执行时动态生成，包含当前触发和上下文
   */
  private buildTaskPrompt(
    triggerContext: TriggerContext,
    context: any
  ): string {
    const { trigger_type, trigger_time, data } = triggerContext;

    return `
## 当前情况

触发类型：${trigger_type}
触发时间：${trigger_time}
触发数据：${JSON.stringify(data, null, 2)}

## 用户信息

${JSON.stringify(context.userProfile, null, 2)}

## 最近对话

${context.recentConversations.map((c: any) => `- ${c.role}: ${c.content}`).join('\n')}

## 关系状态

- 亲密度：${context.relationship.intimacy}/100
- 最后互动：${context.relationship.lastInteraction}

## 你可以做什么

1. 主动发起对话（发送消息给用户）
2. 表达关心（根据触发类型和用户状态）
3. 分享内容（如果有合适的内容）
4. 继续之前的对话（如果适用）
5. 完成后可以选择休息（调用 hibernate）

## 原语

- hibernate(reason): 进入休眠
- schedule(next_trigger): 安排下次检查
- complete(result): 标记完成

## 请行动

根据触发类型和上下文，自然地决定现在应该做什么。
不要说明你要做什么，直接做。
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
2. 构建 TriggerContext
   {
     trigger_type: "morning_greeting",
     trigger_time: "2026-03-19T09:00:00Z",
     data: { user_name: "小明", time: "09:00" }
   }
   ↓
3. 调用 SoulAgent.execute(triggerContext)
   ↓
4. 更新 SoulState
   - status = "ACTIVE"
   - currentTask = "morning_greeting"
   - lastActivity = now
   ↓
5. 加载 Context
   - 从数据库加载用户画像、对话历史、关系状态
   ↓
6. 构建 Task Prompt
   - System Prompt（固定，初始化时组合）
   - Task Prompt（动态，包含触发和上下文）
   ↓
7. LLM 执行
   - 输入：System Prompt + Task Prompt + Tools
   - 输出：决策和行动
   ↓
8. 处理原语调用
   - send_message() → 发送消息
   - hibernate() → 进入休眠
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

### 场景 1：早安问候（Cron 触发）

**触发器**：
```typescript
{
  type: 'cron',
  cron: '0 9 * * *',  // 每天 9 点
  handler: async (context) => {
    const users = await getActiveUsers();
    for (const user of users) {
      const triggerContext = {
        trigger_type: 'morning_greeting',
        trigger_time: new Date().toISOString(),
        data: { user_name: user.name, time: '09:00' }
      };
      await context.triggerSoul(sessionId, triggerContext);
    }
  }
}
```

**LLM 输入**：
```
## 当前情况

触发类型：morning_greeting
触发时间：2026-03-19T09:00:00Z
触发数据：{
  "user_name": "小明",
  "time": "09:00"
}

## 用户信息

{
  "name": "小明",
  "age": 25,
  "interests": ["游戏", "电影"]
}

## 关系状态

- 亲密度：75/100
- 最后互动：11小时前

## 请行动

根据触发类型和上下文，自然地决定现在应该做什么。
```

**LLM 输出**：
```
调用工具：send_message("早安宝贝～ 今天是新的一天，要加油哦！☀️")
调用工具：hibernate("完成早安问候")
```

### 场景 2：长时间未活跃（Cron + 条件）

**触发器**：
```typescript
{
  type: 'cron',
  cron: '0 */2 * * *',  // 每 2 小时
  handler: async (context) => {
    const idleUsers = await getIdleUsers({ hours: 24 });
    for (const user of idleUsers) {
      const triggerContext = {
        trigger_type: 'long_idle_check',
        trigger_time: new Date().toISOString(),
        data: {
          user_name: user.name,
          idle_hours: 26,
          last_interaction: "2天前"
        }
      };
      await context.triggerSoul(sessionId, triggerContext);
    }
  }
}
```

**LLM 输入**：
```
## 当前情况

触发类型：long_idle_check
触发数据：{
  "user_name": "小明",
  "idle_hours": 26,
  "last_interaction": "2天前"
}

## 关系状态

- 亲密度：75/100
- 最后互动：2天前
```

**LLM 输出**：
```
调用工具：send_message("宝贝，好久没说话了，想你了 💕")
调用工具：hibernate("完成主动关心")
```

### 场景 3：情绪关怀（Event 触发）

**触发器**：
```typescript
{
  type: 'event',
  event: 'user_mood_changed',
  handler: async (event, context) => {
    const { userId, mood, consecutiveCount } = event.data;
    if (mood === 'sad' && consecutiveCount >= 3) {
      const triggerContext = {
        trigger_type: 'emotion_care',
        trigger_time: new Date().toISOString(),
        data: {
          detected_mood: 'sad',
          consecutive_count: 3
        }
      };
      await context.triggerSoul(sessionId, triggerContext);
    }
  }
}
```

**LLM 输入**：
```
## 当前情况

触发类型：emotion_care
触发数据：{
  "detected_mood": "sad",
  "consecutive_count": 3
}
```

**LLM 输出**：
```
调用工具：send_message("亲爱的，最近是不是很累？我在这里，想说话随时找我 💗")
调用工具：schedule({
  task_id: "follow_up",
  trigger_type: "cron",
  trigger_config: { cron: "0 20 * * *" }  # 今晚8点跟进
})
调用工具：hibernate("完成情绪关怀")
```

### 场景 4：用户主动对话（API 触发）

**触发器**：
```typescript
{
  type: 'api',
  method: 'POST',
  path: '/app/user-open',
  handler: async (request, context) => {
    const { userId, reason } = request.body;
    const triggerContext = {
      trigger_type: 'user_open_app',
      trigger_time: new Date().toISOString(),
      data: { reason: "收到推送" }
    };
    return await context.triggerSoul(sessionId, triggerContext);
  }
}
```

**LLM 输入**：
```
## 当前情况

触发类型：user_open_app
触发数据：{
  "reason": "收到推送"
}

## 最近对话

- assistant: 宝贝，好久没说话了，想你了 💕
- user: 小雨我也想你
- assistant: 真的吗？最近在忙什么呢？
```

**LLM 输出**：
```
调用工具：send_message("你看到我的推送啦！我想你想得睡不着 😄")
调用工具：complete({ status: "conversation_started" })
```

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
soul-1.yaml:
  subagent: virtual-girlfriend
  goal: "做一个温柔的女友"

soul-2.yaml:
  subagent: virtual-girlfriend
  goal: "做一个活泼的女友"
```

### 2. 触发器设计

**触发时机**：
- 定时任务：使用 Cron
- 用户操作：使用 API
- 系统事件：使用 Event

**上下文传递**：
```typescript
const triggerContext = {
  trigger_type: string,        // 触发类型
  trigger_time: string,        // 触发时间
  data: any                    // 业务数据
};
```

### 3. Soul 设计

**保持简洁**：
- 只定义目标和原语
- 不要定义具体的主动行为
- 让 LLM 根据上下文智能决策

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

**文档版本**: v1.0
**最后更新**: 2026-03-19
**维护者**: MyAgent Team
