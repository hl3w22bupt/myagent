# 第一个任务

> 5 分钟上手 MyAgent

**阅读时间**: 3 分钟 | **难度**: ⭐ beginner

---

## 🎯 目标

执行你的第一个 MyAgent 任务

---

## 📋 前提条件

✅ 已安装 MyAgent
✅ 服务正在运行（http://localhost:3000）

---

## 🚀 执行任务

### 1. 简单问候

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "你好，介绍一下你自己"}'
```

**响应**:
```json
{
  "taskId": "task-abc123",
  "result": "你好！我是 MyAgent，一个分布式 AI Agent 系统..."
}
```

---

### 2. 代码分析

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "分析这段 Python 代码的质量",
    "environment": {
      "code": "print('Hello World')",
      "language": "python"
    }
  }'
```

---

### 3. 使用知识库

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Python 有什么特点？",
    "environment": {
      "knowledgeCollection": "python-docs"
    }
  }'
```

---

## 📊 查询结果

```bash
# 查询任务状态
curl http://localhost:3000/api/contexts/task-abc123

# 查询任务输出
curl http://localhost:3000/api/contexts/outputs/task-abc123
```

---

## ✅ 恭喜！

你已经成功执行了第一个 MyAgent 任务。

## 📖 下一步

- [多轮对话](multi-turn-conversation.md) - 会话管理
- [使用知识库](using-knowledge-base.md) - RAG 实践

---

**版本**: v1.0 | **更新日期**: 2026-03-29
