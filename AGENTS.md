# MyAgent - AI开发助手快速指南

> **项目定位**: 分布式AI Agent系统 (4层架构: Motia集成 → Agent编排 → Sandbox执行 → Skill抽象)

## 🎯 核心信息

**这是什么**: 不是简单的Motia教程项目，而是完整的分布式Agent系统
**技术栈**: TypeScript (Node.js 20) + Python 3.12 + PostgreSQL + Motia
**核心能力**: PTC代码生成、多轮对话、上下文管理、实时流式通信

## 📚 文档导航

### 快速上手
- **本文档**: 项目概览和快速参考
- **TESTING_WORKFLOW.md**: 完整测试流程（必读！）
- **API_REFERENCE.md**: 所有API端点文档

### 架构文档
- **docs/ARCHITECTURE_OVERVIEW.md**: 完整4层架构说明
- **docs/SYSTEM_CONCEPTS_OVERVIEW.md**: 核心概念详解
- **docs/PROJECT_STRUCTURE.md**: 项目模块树

### Motia框架
- **.cursor/rules/motia/\***: Motia最佳实践（11个详细指南）

## 🚀 快速启动

### 环境准备
```bash
npm install               # Node.js依赖
npm run py:install        # Python依赖
npm run db:init          # PostgreSQL初始化（可选）
npm run generate-types    # 生成Motia类型
```

### 启动服务
```bash
# 后端（根目录）
npm run start            # 生产模式

# 前端（motia-frontend目录）
cd motia-frontend && npm run dev
```

**端口**: 后端3000，前端5173

### 代码修改后
```bash
npm run build            # TypeScript修改后
npm run generate-types   # Motia配置修改后
# 服务会自动重启
```

## 🤖 Subagents

项目提供2个专门subagent（使用 `/agents` 选择）：

| Agent | 用途 | 何时使用 |
|-------|------|----------|
| **myagent-developer** | 代码开发 | 编写Motia Step、Agent逻辑、Skill |
| **myagent-test-loop** | 自动化测试 | 验证功能、测试闭环、调试失败 |

**详细说明**: `.claude/agents/myagent-*-*.md`

## 🔑 核心概念

### 4层架构
```
Layer 1: Motia集成层 (事件驱动)
   ↓
Layer 2: Agent编排层 (Agent/MasterAgent, PTC生成)
   ↓
Layer 3: Sandbox执行层 (Python进程隔离)
   ↓
Layer 4: Skill抽象层 (可复用能力)
```

### Session vs Task
- **Session**: 会话（多轮对话），长生命周期，30分钟超时
- **Task**: 单次任务，短生命周期，继承Session上下文

### 关键设计
- **AgentManager**: 会话管理（每个sessionId → 一个Agent实例）
- **Hook系统**: AgentHook、TaskHook、SkillHook（生命周期扩展）
- **上下文压缩**: 20条消息后自动压缩，保留摘要

## 🧪 测试API（最常用）

```bash
# 1. 提交任务
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "搜索AI最新进展", "sessionId": "test-123"}'

# 2. 查看上下文
curl http://localhost:3000/api/contexts/{taskId}

# 3. 查看输出
curl http://localhost:3000/api/contexts/outputs/{taskId}

# 4. 健康检查
curl http://localhost:3000/health
```

**完整测试流程**: 参考 `TESTING_WORKFLOW.md`

## ⚠️ 常见坑（速查）

| 问题 | 解决 |
|------|------|
| Module not found | `npm run generate-types` |
| column "user_id" does not exist | `npm run db:reset` |
| 每次请求创建新session | 确保传递sessionId |
| LLM timeout | 增加src/index.ts中的timeout值 |

## 📦 关键文件

```
steps/agents/              # Agent端点
├── agent-api.step.ts      # /agent/execute
└── master-agent.step.ts   # Master-Agent事件处理

src/core/
├── agent/                 # Agent核心
│   ├── agent.ts           # Agent基类
│   ├── manager.ts         # AgentManager（会话管理）
│   └── ptc-generator.ts   # PTC代码生成
├── sandbox/               # Sandbox执行层
├── database/              # 数据持久化
└── context/               # 上下文管理
```

## 🎓 学习路径

**新手**:
1. 阅读本文档
2. 阅读 `TESTING_WORKFLOW.md`
3. 使用 `myagent-test-loop` 运行测试

**开发者**:
1. 阅读 `docs/ARCHITECTURE_OVERVIEW.md`
2. 阅读 `.cursor/rules/motia/*.mdc`
3. 使用 `myagent-developer` 编写代码

**调试**:
1. 阅读 `docs/SYSTEM_CONCEPTS_OVERVIEW.md`
2. 查看日志: `tail -f .motia/logs/motia.log`
3. 使用Context API分析任务

## 📞 获取帮助

- **完整测试流程**: `TESTING_WORKFLOW.md`
- **API文档**: `API_REFERENCE.md`
- **架构详解**: `docs/ARCHITECTURE_OVERVIEW.md`
- **Motia指南**: `.cursor/rules/motia/*.mdc`

**记住**: AGENTS.md只是导航，详细信息在其他文档！
