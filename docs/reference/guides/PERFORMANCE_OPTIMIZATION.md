# Agent & Sandbox 性能优化思路

> **优先级**: 低
> **状态**: 设计阶段，待实施
> **创建时间**: 2026-01-09

---

## 📋 概述

本文档记录了 Agent 和 Sandbox 在 **session-per-instance** 模式下的性能优化思路。

**当前架构**：每个 session 有独立的 Agent 和 Sandbox 实例，确保并发安全。

**优化目标**：在保证并发安全的前提下，降低资源占用和提升性能。

---

## 🎯 优化策略总览

| 策略                   | 内存减少 | 性能提升     | 复杂度   | 优先级 |
| ---------------------- | -------- | ------------ | -------- | ------ |
| 分离重型资源和轻量状态 | 90%      | 100x（创建） | ⭐⭐     | 🔥 高  |
| Session 状态压缩       | 70-90%   | -            | ⭐⭐⭐   | 🔥 高  |
| 惰性加载和按需初始化   | 50%      | 10x（启动）  | ⭐⭐     | 中     |
| 分层存储               | 95%      | -            | ⭐⭐⭐⭐ | 低     |
| Session 共享和借用     | -        | 2x（并发）   | ⭐⭐     | 中     |

---

## 策略 1: 分离重型资源和轻量状态

### 核心思想

```
❌ 当前设计（每个 session）：
完整 Agent 实例 (~10MB)
  ├─ LLMClient (重)
  ├─ SandboxAdapter (重)
  ├─ PTCGenerator (重)
  └─ SessionState (轻，几 KB)

✅ 优化设计：
全局 ResourcePool (单例，共享)
  ├─ LLMClient
  ├─ SandboxAdapter
  └─ PTCGenerator

每个 SessionContext (~10KB)
  └─ SessionState (轻)
```

### 实现要点

```typescript
// 全局资源池
class AgentResourcePool {
  private static resources: {
    llm: LLMClient;
    sandbox: SandboxAdapter;
    ptcGenerator: PTCGenerator;
  };
}

// 轻量 SessionContext
class SessionContext {
  sessionId: string;
  state: SessionState; // 只包含状态，不包含资源

  async execute(task: string, resources: AgentResources) {
    // 使用共享资源执行
  }
}
```

### 效果

- ✅ 内存减少 90%（每个 session 从 10MB → 10KB）
- ✅ 创建速度提升 100x（创建 SessionContext 几乎瞬间）
- ✅ 资源复用（LLM/Sandbox 全局共享）

---

## 策略 2: Session 状态压缩

### 问题

长对话会导致 conversationHistory 无限增长：

```typescript
conversationHistory: [
  { role: 'user', content: '...', timestamp: ... },
  { role: 'assistant', content: '...', timestamp: ... },
  // ... 100 条消息，可能几 MB
]
```

### 优化方案

#### 2.1 按数量压缩

```typescript
// 保留最新的 N 条消息
if (history.length > maxHistoryItems) {
  const toCompress = history.slice(0, -keepCount);
  const summary = await generateSummary(toCompress);

  history = [{ role: 'system', content: `[Summary]: ${summary}` }, ...history.slice(-keepCount)];
}
```

#### 2.2 按 Token 数量压缩

```typescript
// 估算并限制总 token 数
const estimatedTokens = estimateTokens(history);
if (estimatedTokens > maxHistoryTokens) {
  // 压缩策略：保留最新的，旧的生成摘要
}
```

#### 2.3 滑动窗口

```typescript
// 滑动窗口：保留最近的 + 关键摘要
[
  system: "Previous summary: ...",  // 摘要
  user: "Question 1",
  assistant: "Answer 1",
  user: "Question 2",  // 最近的对话
  assistant: "Answer 2",
]
```

### 配置参数

```typescript
interface CompressionConfig {
  maxHistoryItems: number; // 最多保留 N 条消息
  maxHistoryTokens: number; // 最多保留 N 个 tokens
  compressionThreshold: number; // 达到阈值时触发压缩
  summarizeOldMessages: boolean; // 是否生成摘要
}
```

### 效果

- ✅ 内存减少 70-90%
- ✅ 保持上下文连续性
- ✅ 自动管理，无需手动干预

---

## 策略 3: 惰性加载和按需初始化

### 问题

某些功能可能不会被使用，但资源在初始化时就创建了：

```typescript
class Agent {
  llm: LLMClient; // 总是需要
  sandbox: SandboxAdapter; // 只在执行代码时需要
  vectorStore: VectorStore; // 只在 RAG 查询时需要
}
```

### 优化方案

```typescript
class LazyAgentResources {
  private cached: {
    llm?: LLMClient;
    sandbox?: SandboxAdapter;
    vectorStore?: VectorStore;
  } = {};

  getLLM(): LLMClient {
    if (!this.cached.llm) {
      this.cached.llm = new LLMClient(config);
    }
    return this.cached.llm;
  }

  getSandbox(): SandboxAdapter {
    if (!this.cached.sandbox) {
      this.cached.sandbox = new SandboxAdapter(config);
    }
    return this.cached.sandbox;
  }
}
```

### 预热选项

```typescript
// 应用启动时预热（可选）
await resources.warmup(); // 预创建常用资源
```

### 效果

- ✅ 启动速度快 10x
- ✅ 内存按需分配
- ✅ 可选预热（生产环境推荐）

---

## 策略 4: 分层存储

### 思想

将历史数据按热度分层存储：

```
┌─────────────────────────────────┐
│ 热数据（内存）                    │
│ - 最近 20 条消息                 │
│ - 访问速度: < 1ms                │
│ - 成本: 高                       │
└─────────────────────────────────┘
           ↓ 溢出时
┌─────────────────────────────────┐
│ 温数据（Redis）                  │
│ - 最近 500 条消息                │
│ - TTL: 24 小时                  │
│ - 访问速度: ~ 10ms               │
└─────────────────────────────────┘
           ↓ 过期时
┌─────────────────────────────────┐
│ 冷数据（数据库）                  │
│ - 所有历史                       │
│ - 访问速度: ~ 100ms              │
│ - 成本: 低                       │
└─────────────────────────────────┘
```

### 实现要点

```typescript
class TieredHistoryStorage {
  async addMessage(sessionId: string, message: any) {
    // 1. 添加到内存
    memory[sessionId].push(message);

    // 2. 内存溢出时移到 Redis
    if (memory[sessionId].length > memoryLimit) {
      const oldMessages = memory[sessionId].splice(0, -keepSize);
      await redis.lpush(sessionId, oldMessages);
    }

    // 3. Redis TTL 过期自动移到数据库（可选）
  }

  async getHistory(sessionId: string): Promise<any[]> {
    // 1. 从内存加载
    let result = memory[sessionId] || [];

    // 2. 不够时从 Redis 加载
    if (result.length < required) {
      const redisData = await redis.lrange(sessionId, 0, required);
      result = [...redisData, ...result];
    }

    // 3. 还不够时从数据库加载
    if (result.length < required) {
      const dbData = await db.query(sessionId);
      result = [...dbData, ...result];
    }

    return result;
  }
}
```

### 效果

- ✅ 内存减少 95%
- ✅ 完整历史保留
- ✅ 热数据快速访问

---

## 策略 5: Session 共享和借用

### 场景

多个并发请求使用同一个 session：

```
请求 A → SessionContext(sessionId="abc")
请求 B → SessionContext(sessionId="abc")  // 同一个 session
```

### 优化方案：引用计数

```typescript
class SessionPool {
  private sessions: Map<string, SessionContext>;
  private refCount: Map<string, number>;

  acquire(sessionId: string): SessionContext {
    // 增加引用计数
    this.refCount.set(sessionId, (this.refCount.get(sessionId) || 0) + 1);
    return this.sessions.get(sessionId);
  }

  release(sessionId: string) {
    const count = this.refCount.get(sessionId) - 1;

    if (count <= 0) {
      // 没有其他引用，可以清理
      this.sessions.delete(sessionId);
      this.refCount.delete(sessionId);
    } else {
      this.refCount.set(sessionId, count);
    }
  }
}
```

### 效果

- ✅ 提高并发能力
- ✅ 减少 SessionContext 创建
- ✅ 安全清理（引用计数）

---

## 📊 综合效果预估

### 当前架构（未优化）

```
10K 并发 sessions
├─ 每个 Agent: ~10MB
├─ 每个 Sandbox: ~5MB
├─ 总内存: 10K × 15MB = 150GB
└─ 创建时间: 100ms/session
```

### 优化后架构

```
10K 并发 sessions
├─ 全局资源池: ~15MB（单例）
├─ 每个 SessionContext: ~10KB
├─ 状态压缩后: ~2KB（平均）
├─ 总内存: 15MB + 10K × 2KB = 35MB
└─ 创建时间: 1ms/session
```

**对比**：

- 内存：150GB → 35MB（减少 99.97%）
- 创建速度：100ms → 1ms（提升 100x）

---

## 🚀 实施路线图

### Phase 1: 基础架构（当前）

- ✅ 实现 SessionContext（轻量）
- ✅ 实现 AgentManager（session 管理）
- ✅ 确保并发安全

### Phase 2: 资源池（优先级：高）

- [ ] 实现 AgentResourcePool（全局单例）
- [ ] 分离重型资源和轻量状态
- [ ] 测试性能提升

### Phase 3: 状态压缩（优先级：高）

- [ ] 实现历史压缩逻辑
- [ ] 添加 Token 估算
- [ ] 配置化压缩策略

### Phase 4: 惰性加载（优先级：中）

- [ ] 实现 LazyAgentResources
- [ ] 添加预热选项
- [ ] 启动性能测试

### Phase 5: 分层存储（优先级：低）

- [ ] 集成 Redis
- [ ] 实现数据库持久化
- [ ] 添加冷热数据迁移

### Phase 6: Session 共享（优先级：中）

- [ ] 实现引用计数
- [ ] 并发测试
- [ ] 性能基准测试

---

## 📝 待讨论问题

1. **状态压缩策略**
   - 摘要生成的 prompt 模板
   - 压缩触发阈值的选择
   - 是否保留原始消息（存储成本）

2. **分层存储**
   - Redis vs 其他缓存方案
   - 数据库选型（PostgreSQL, MongoDB）
   - 冷数据迁移策略

3. **Session 持久化**
   - 应用重启后如何恢复 session
   - 跨实例 session 共享（分布式场景）

4. **监控指标**
   - 内存使用趋势
   - Session 生命周期统计
   - 性能基准对比

---

## 🔗 相关文档

- [IMPLEMENTATION_WORKFLOW.md](../IMPLEMENTATION_WORKFLOW.md) - 完整实现流程
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计文档
- [Agent Manager 设计](../src/core/agent/manager.ts) - Manager 实现

---

**最后更新**: 2026-01-09
**维护者**: @leo
