# MyAgent 参考文档

> **MyAgent** 是一个分布式 AI Agent 系统，支持 PTC（Programmatic Tool Calling）代码生成、多轮对话、上下文管理和实时流式输出。

**阅读时间**: 5 分钟 | **难度**: ⭐ beginner

---

## 🎯 MyAgent 是什么？

MyAgent 是一个**AI Agent 中台系统**，让你能够：
- 🤖 **执行复杂任务**：通过自然语言描述任务，Agent 自动规划并执行
- 🔄 **多轮对话**：保持上下文的多轮对话能力
- 🧠 **知识库集成**：RAG（检索增强生成）支持，让 Agent 访问外部知识
- 🔌 **灵活扩展**：自定义 Agent、Skill、Subagent
- 📡 **实时输出**：流式输出任务执行过程

---

## 📚 文档导航

### 🏗️ 架构文档
理解 MyAgent 的系统设计和核心概念

- [系统架构](architecture/README.md) - 4层架构全景
- [核心概念](architecture/core-concepts.md) - Session、Task、Agent、Skill
- [Agent 系统](architecture/agent-system.md) - Agent 工作原理
- [知识库系统](architecture/knowledge-base.md) - RAG 检索增强生成
- [上下文管理](architecture/context-management.md) - 对话上下文管理
- [Hook 系统](architecture/hook-system.md) - 生命周期扩展

### 🔌 API 文档
完整的 HTTP API 和插件开发文档

- [API 总览](api/README.md) - 所有 API 端点分类
- [Agent API](api/http-api/agent-apis.md) - Agent 执行相关
- [Context API](api/http-api/context-apis.md) - 上下文查询相关
- [Knowledge API](api/http-api/knowledge-apis.md) - 知识库相关
- [插件开发](api/plugin-api/README.md) - 自定义 Agent、Skill、Subagent

### 🚀 部署文档
从零开始部署 MyAgent 系统

- [快速部署](deployment/quick-start.md) - 5分钟启动系统
- [环境准备](deployment/environment-setup.md) - Node.js、Python、PostgreSQL
- [配置说明](deployment/configuration.md) - 135个配置项详解

### 📖 使用指南
从入门到高级的使用教程

- [第一个任务](guides/getting-started/first-task.md) - 快速上手
- [多轮对话](guides/getting-started/multi-turn-conversation.md) - 对话管理
- [使用知识库](guides/getting-started/using-knowledge-base.md) - RAG 实践

### 🔧 故障排查
常见问题和解决方案

- [常见问题](troubleshooting/README.md) - 安装、运行时错误
- [性能问题](troubleshooting/common-issues/performance-issues.md) - 优化建议

---

## ⚡ 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境

```bash
cp .env.example .env
# 编辑 .env 文件，配置必要的 API Key
```

### 3. 启动服务

```bash
npm run start
```

### 4. 执行第一个任务

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "你好，介绍一下你自己", "sessionId": "test-123"}'
```

---

## 🏗️ 系统架构

MyAgent 采用 **4 层架构**设计：

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Motia Integration (事件驱动框架)                │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Agent Orchestration (Agent 编排和 PTC)         │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Sandbox Execution (Python 沙箱隔离执行)        │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Skill Abstraction (可复用技能抽象)             │
└─────────────────────────────────────────────────────────┘
```

**核心能力**：
- **Agent**: 任务执行的核心引擎
- **PTC Generator**: 自动生成工具调用代码
- **Sandbox**: 安全隔离的 Python 执行环境
- **Skill**: 可复用的技能组件

---

## 🎯 适用场景

MyAgent 适合以下场景：

- ✅ **智能客服**：多轮对话、知识库检索
- ✅ **代码助手**：代码分析、生成、重构
- ✅ **数据处理**：自动化数据处理流程
- ✅ **任务自动化**：复杂任务的自动化执行
- ✅ **AI Agent 开发**：快速开发和部署自定义 Agent

---

## 📖 下一步

- 新手：阅读 [系统架构](architecture/README.md) 了解系统设计
- 开发者：查看 [API 文档](api/README.md) 学习如何集成
- 运维：参考 [部署文档](deployment/quick-start.md) 部署系统

---

## 🆘 获取帮助

- 📖 [完整文档](../README.md)
- 💬 [问题反馈](https://github.com/your-org/myagent/issues)
- 📧 联系支持：support@myagent.dev

---

**版本**: v1.0 | **更新日期**: 2026-03-29
