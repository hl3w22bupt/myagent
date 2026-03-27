# Agent通信协议设计思路

> **讨论时间**: 2026-03-27
> **状态**: 设计思考中，待有合适场景再实现

## 📖 背景知识

### ACP (Agent Communication Protocol) 是什么？

**定义**: FIPA（智能物理代理基金会）标准化的Agent通信协议，类似于Agent领域的"HTTP"。

### ACP核心概念

```
Agent A                    Agent B
  │                          │
  ├───REQUEST ───────────────>│  请求执行动作
  │                          │
  │<─────AGREE/REFUSE────────┤  同意/拒绝
  │                          │
  ├───INFORM ────────────────>│  提供信息
  │                          │
  │<─────RESULT ──────────────┤  返回结果
```

### ACP消息类型（Performative）

| 类型 | 含义 | 示例 |
|------|------|------|
| **REQUEST** | 请求执行动作 | "请帮我分析代码" |
| **CFP** | Call for Proposal | "谁能做这个任务？" |
| **PROPOSE** | 提出方案 | "我可以用web-search做" |
| **AGREE** | 同意请求 | "好的，我来处理" |
| **REFUSE** | 拒绝请求 | "我不支持这个技能" |
| **INFORM** | 提供信息 | "搜索结果如下" |
| **QUERY** | 查询信息 | "你支持什么技能？" |
| **CANCEL** | 取消请求 | "取消之前的请求" |

### ACP优缺点

**优点**:
- ✅ 标准化，不同系统的Agent可互操作
- ✅ 语义明确，意图清晰
- ✅ 支持复杂的对话流程

**缺点**:
- ❌ 复杂，学习成本高
- ❌ 重量级，对简单协作过度设计
- ❌ 实现成本高，需要完整协议栈

## 🔍 MyAgent现状分析

### 当前协作模式

```typescript
// MasterAgent直接委托SubAgent（同步调用）
const masterAgent = new MasterAgent(config);

// 委托任务：直接调用run方法
const result = await subagent.run(subtask, context);

// 特点：
// - 简单直接
// - 同步调用
// - 共享内存空间
// - 无需通信协议
```

**优势**:
- 性能好（方法调用比消息传递快）
- 调试简单（调用栈清晰）
- 实现简单

**局限**:
- 无法跨进程/跨机器协作
- 无法异步处理
- Agent间紧密耦合

## 💡 Inbox方案设计

### 核心思想

每个Agent有自己的inbox，Agent间通过向指定Agent ID的inbox发送消息来通信。

```
┌────────────────┐         ┌────────────────┐
│   Agent A      │         │   Agent B      │
│                │         │                │
│ ┌────────────┐ │         │ ┌────────────┐ │
│ │   Inbox    │ │         │ │   Inbox    │ │
│ └────────────┘ │         │ └────────────┘ │
└────────────────┘         └────────────────┘
       ▲                           │
       │                           │
       └─────────Message───────────┘
```

### 方案优势

| 优势 | 说明 |
|------|------|
| ✅ **简单直观** | 类似email系统，易于理解 |
| ✅ **解耦** | Agent只需知道ID，无需地址 |
| ✅ **异步** | 发送后立即返回，不用等待 |
| ✅ **可扩展** | 新Agent只需注册ID和inbox |
| ✅ **持久化** | 消息天然存储，可追溯 |
| ✅ **容错** | Agent离线时消息堆积在inbox |

### 实现草案

#### 1. 消息格式定义

```typescript
// 简化版消息格式（无需完整ACP）
interface Message {
  id: string;                    // 消息唯一ID
  from: string;                  // 发送者Agent ID
  to: string;                    // 接收者Agent ID
  timestamp: number;             // 发送时间戳
  type: MessageType;             // 消息类型
  data: any;                     // 消息数据
  correlationId?: string;        // 用于请求-响应匹配
  status?: 'pending' | 'delivered' | 'processed';
}

enum MessageType {
  REQUEST = 'request',           // 请求
  RESPONSE = 'response',         // 响应
  INFORM = 'inform',             // 通知
  ERROR = 'error',               // 错误
  CANCEL = 'cancel'              // 取消
}
```

#### 2. Agent Inbox接口

```typescript
interface AgentInbox {
  agentId: string;

  // 推送消息到inbox
  push(message: Message): Promise<void>;

  // 拉取待处理消息
  poll(limit?: number): Promise<Message[]>;

  // 标记消息已处理
  acknowledge(messageId: string): Promise<void>;

  // 获取未处理消息数
  getUnreadCount(): Promise<number>;
}
```

#### 3. Message Router（消息路由器）

```typescript
class MessageRouter {
  private inboxes: Map<string, AgentInbox>;

  // 注册Agent inbox
  register(agentId: string, inbox: AgentInbox): void {
    this.inboxes.set(agentId, inbox);
  }

  // 发送消息
  async send(message: Message): Promise<void> {
    const inbox = this.inboxes.get(message.to);
    if (!inbox) {
      throw new Error(`Agent ${message.to} not found`);
    }
    await inbox.push(message);
  }

  // 广播消息（发送给所有Agent）
  async broadcast(message: Omit<Message, 'to'>): Promise<void> {
    const promises = Array.from(this.inboxes.entries()).map(
      async ([agentId, inbox]) => {
        await inbox.push({ ...message, to: agentId });
      }
    );
    await Promise.all(promises);
  }
}
```

#### 4. Agent集成

```typescript
class Agent {
  private agentId: string;
  private inbox: AgentInbox;
  private router: MessageRouter;

  constructor(config: AgentConfig, sessionId: string) {
    this.agentId = config.agentId || `agent-${uuidv4()}`;
    this.inbox = new MemoryInbox(this.agentId);  // 或持久化inbox
    this.router = config.messageRouter;

    // 注册到路由器
    this.router.register(this.agentId, this.inbox);

    // 启动inbox处理循环
    this.startInboxProcessor();
  }

  // 发送消息给其他Agent
  async sendMessage(
    toAgentId: string,
    type: MessageType,
    data: any
  ): Promise<string> {
    const message: Message = {
      id: uuidv4(),
      from: this.agentId,
      to: toAgentId,
      timestamp: Date.now(),
      type,
      data,
      correlationId: uuidv4()  // 用于匹配响应
    };

    await this.router.send(message);
    return message.correlationId;
  }

  // 处理inbox消息（后台循环）
  private async startInboxProcessor(): Promise<void> {
    setInterval(async () => {
      const messages = await this.inbox.poll(10);
      for (const msg of messages) {
        try {
          await this.handleMessage(msg);
          await this.inbox.acknowledge(msg.id);
        } catch (error) {
          // 处理失败，消息保留在inbox重试
          this.logger.error('Failed to handle message', {
            messageId: msg.id,
            error: (error as Error).message
          });
        }
      }
    }, 1000);  // 每秒检查一次
  }

  // 处理单个消息
  private async handleMessage(message: Message): Promise<void> {
    this.logger.info('Processing message', {
      from: message.from,
      type: message.type,
      data: message.data
    });

    switch (message.type) {
      case MessageType.REQUEST:
        await this.handleRequest(message);
        break;

      case MessageType.RESPONSE:
        await this.handleResponse(message);
        break;

      case MessageType.INFORM:
        await this.handleInform(message);
        break;

      case MessageType.CANCEL:
        await this.handleCancel(message);
        break;

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  // 处理请求消息
  private async handleRequest(message: Message): Promise<void> {
    // 1. 检查是否能够处理
    if (!this.canHandle(message.data)) {
      await this.sendResponse(
        message.from,
        message.correlationId!,
        MessageType.REFUSE,
        { reason: 'Unsupported task type' }
      );
      return;
    }

    // 2. 处理任务
    try {
      const result = await this.executeTask(message.data);

      // 3. 返回结果
      await this.sendResponse(
        message.from,
        message.correlationId!,
        MessageType.INFORM,
        result
      );
    } catch (error) {
      // 4. 返回错误
      await this.sendResponse(
        message.from,
        message.correlationId!,
        MessageType.ERROR,
        { error: (error as Error).message }
      );
    }
  }

  // 发送响应
  private async sendResponse(
    toAgentId: string,
    correlationId: string,
    type: MessageType,
    data: any
  ): Promise<void> {
    await this.router.send({
      id: uuidv4(),
      from: this.agentId,
      to: toAgentId,
      timestamp: Date.now(),
      type,
      data,
      correlationId  // 关联到原请求
    });
  }
}
```

#### 5. 与Motia集成

**使用Motia State作为inbox存储后端**:

```typescript
// 实现：基于Motia State的Inbox
class MotiaStateInbox implements AgentInbox {
  constructor(
    private agentId: string,
    private states: any  // Motia states plugin
  ) {}

  async push(message: Message): Promise<void> {
    await this.states.set(`inbox:${this.agentId}`, {
      key: `msg:${message.id}`,
      value: message
    });
  }

  async poll(limit: number = 10): Promise<Message[]> {
    const result = await this.states.getRange(
      `inbox:${this.agentId}`,
      0,
      limit
    );
    return result.map(item => item.value);
  }

  async acknowledge(messageId: string): Promise<void> {
    await this.states.remove(`inbox:${this.agentId}`, `msg:${messageId}`);
  }

  async getUnreadCount(): Promise<number> {
    const all = await this.states.getRange(`inbox:${this.agentId}`, 0, -1);
    return all.length;
  }
}
```

## 🎯 渐进式实施建议

### Phase 1: 基于现有Motia Event（最简单）

**适用场景**: 同步协作，无需跨进程

```typescript
// Agent A 发送
emit('agent.task.delegate', {
  from: 'master-agent',
  to: 'code-reviewer',
  taskId: 'task-123',
  task: '审查这段代码'
});

// Agent B 接收（Motia Event Step）
export const config = {
  type: 'event',
  name: 'code-reviewer',
  subscribes: ['agent.task.delegate'],
};

export const handler = async (input) => {
  // 处理任务
  const result = await agent.run(input.task);
  return result;
};
```

**优点**: 无需改动，直接使用现有系统

### Phase 2: 引入Inbox（异步协作）

**适用场景**: 需要异步处理、解耦Agent

```typescript
// 1. 使用Motia State作为inbox存储
const inbox = new MotiaStateInbox(agentId, states);

// 2. Agent定期轮询inbox
setInterval(async () => {
  const messages = await inbox.poll(10);
  for (const msg of messages) {
    await handleMessage(msg);
    await inbox.acknowledge(msg.id);
  }
}, 1000);

// 3. 发送消息
await states.set(`inbox:${targetAgentId}`, {
  key: `msg:${uuidv4()}`,
  value: { from, to, type, data, timestamp }
});
```

**优点**: 复用现有设施，增加inbox概念

### Phase 3: 完整ACP标准（如需互操作）

**适用场景**: 需要与外部Agent系统互操作

- 实现完整FIPA ACL语义
- 支持复杂的对话协议
- 提供标准化接口

**何时考虑**:
- 需要跨系统集成
- 需要标准化Agent协作
- 需要复杂的多轮协商

**不建议**: 仅内部使用时，完整ACP是过度设计

## 📊 方案对比总结

| 方案 | 复杂度 | 性能 | 可扩展性 | 异步支持 | 耦合度 | 适用场景 |
|------|--------|------|----------|----------|--------|----------|
| **直接调用** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ❌ | 紧耦合 | 当前MyAgent |
| **Motia Event** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 部分 | 松耦合 | 简单异步 |
| **Inbox方案** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | 完全解耦 | 复杂协作 |
| **完整ACP** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | 完全解耦 | 开放系统 |

## 🚦 实施检查点

在实施inbox方案前，确认是否满足以下条件：

- [ ] 需要跨进程/跨机器协作
- [ ] 需要异步处理，不能阻塞
- [ ] Agent数量较多，需要解耦
- [ ] 需要消息持久化和重试
- [ ] 当前Motia Event无法满足需求

**如果以上条件都不满足，建议继续使用当前方案！**

## 💡 关键设计决策

### 1. 消息格式选择

**建议**: 使用简化的消息格式，而非完整ACP

**原因**:
- ACP的20+种performative大部分用不上
- 简化格式更易理解和调试
- 后续可扩展

**推荐格式**:
```typescript
{
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'inform' | 'error' | 'cancel';
  data: any;
  correlationId?: string;
  timestamp: number;
}
```

### 2. Inbox存储选择

**方案对比**:

| 存储方案 | 优点 | 缺点 | 适用场景 |
|---------|------|------|----------|
| **内存** | 性能最好 | 进程重启丢失 | 临时调试 |
| **Motia State** | 复用现有 | 受限于Motia | 开发测试 |
| **Redis** | 高性能分布式 | 需要额外依赖 | 生产环境 |
| **PostgreSQL** | 持久化可靠 | 性能较低 | 需要强持久化 |

**建议**: 从Motia State开始，生产环境升级到Redis

### 3. 消息处理模型

**Pull模型**（推荐）:
```typescript
// Agent定期拉取消息
setInterval(() => {
  const messages = await inbox.poll();
  // 处理消息
}, 1000);
```

**Push模型**（备选）:
```typescript
// 路由器主动推送
inbox.on('message', (msg) => {
  // 处理消息
});
```

**建议**: 使用Pull模型，简单且可控

## 📝 待解决问题

1. **消息顺序保证**: 如何确保消息按序处理？
2. **死信处理**: Agent长期离线，消息如何处理？
3. **性能优化**: 大量Agent时的消息路由性能？
4. **监控调试**: 如何追踪消息流？
5. **安全认证**: 如何防止Agent冒充？

## 🔗 相关资料

- **FIPA ACP Spec**: http://www.fipa.org/specs/fipa00023/
- **Agent Communication Literature**: 学术论文
- **Message Queue Systems**: RabbitMQ, Kafka等

---

**记录人**: Claude Code + Leo
**最后更新**: 2026-03-27
**状态**: 设计思考中，待有合适场景再实现
