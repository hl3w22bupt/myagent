# 上下文管理

> 对话上下文的组织、压缩和检索

**阅读时间**: 5 分钟 | **难度**: ⭐⭐ intermediate

---

## 📝 什么是上下文？

上下文是对话历史的集合，Agent 使用它来理解多轮对话。

---

## 🎯 核心功能

### 1. 对话历史管理

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: any;
}
```

### 2. 自动压缩

- **触发条件**: 超过 20 条消息
- **压缩策略**: 保留关键信息，去除冗余
- **压缩目标**: 保持上下文在合理大小

### 3. 上下文编排

从多个来源组装上下文：
- Session 对话历史
- 知识库检索结果
- 环境变量
- 系统提示

---

## 🔄 上下文生命周期

```
用户发送消息
      ↓
添加到 Session 上下文
      ↓
检查是否需要压缩（> 20 条）
      ↓
如果需要，压缩上下文
      ↓
组装完整上下文
      ↓
发送给 Agent
```

---

## 📊 上下文结构

```typescript
interface Context {
  sessionId: string;
  messages: Message[];
  variables: Map<string, any>;
  compressed: boolean;
  metadata: {
    messageCount: number;
    totalTokens: number;
    lastCompressedAt?: Date;
  };
}
```

---

## 🚀 使用示例

### 查询上下文

```bash
# 获取任务的上下文
curl http://localhost:3000/api/contexts/{taskId}

# 响应
{
  "sessionId": "user-123",
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好！有什么可以帮你的？" }
  ],
  "compressed": false
}
```

### 手动压缩

```bash
# 触发上下文压缩
curl -X POST http://localhost:3000/api/contexts/compress \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "user-123"}'
```

---

## 📖 相关文档

- [核心概念](core-concepts.md) - Session 和上下文
- [Agent 系统](agent-system.md) - Agent 如何使用上下文
- [Context API](../api/http-api/context-apis.md) - 上下文 API

---

**版本**: v1.0 | **更新日期**: 2026-03-29
