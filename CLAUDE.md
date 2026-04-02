# Motia Project Guide for Claude Code & Claude AI

> **Project**: Distributed AI Agent System (4-Layer Architecture)
> **Tech Stack**: TypeScript + PostgreSQL + Motia

---

## 🎯 Project Overview

**What it is**: Distributed Agent system for task orchestration and execution
**Core capabilities**: PTC code generation, multi-turn conversations, context management, real-time streaming

## 📚 Quick Links

**Development Guides**:
- `.cursor/rules/motia/` - Motia best practices (11 detailed guides)
- `TESTING_WORKFLOW.md` - Complete testing flow
- `API_REFERENCE.md` - All API endpoints
- `docs/reference/architecture/README.md` - Architecture overview
- `docs/reference/architecture/agent-system.md` - Agent system details
- `docs/reference/architecture/workflow-system.md` - Workflow system & feedback loop

**For Claude Code**: Use `/agents` → `myagent-developer` subagent (auto-loads cursor rules)

## 🚀 Quick Start

```bash
npm install               # Dependencies
npm run generate-types    # Generate Motia types
npm run start            # Start server (port 3000) - Recommended
```

**Service Management**:
```bash
# 后端服务（端口 3000）- 推荐使用生产模式
npm run start            # Start production mode (recommended)
npm run dev              # Start dev mode (hot reload, slower)

# 前端服务（端口 5173）
cd motia-frontend && npm run dev

# 停止服务
pkill -f "motia start"   # Stop backend
pkill -f "vite"          # Stop frontend
```

**After code changes**:
```bash
npm run build            # TypeScript changes
npm run generate-types   # Motia config changes
```

## 🤖 Test API (Most Used)

```bash
# 1. Submit task
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "搜索AI最新进展", "sessionId": "test-123"}'

# 2. Check context
curl http://localhost:3000/api/contexts/{taskId}

# 3. Check output
curl http://localhost:3000/api/contexts/outputs/{taskId}

# 4. Health check
curl http://localhost:3000/health
```

**Full testing flow**: See `TESTING_WORKFLOW.md`

## 🏗️ Architecture (4 Layers)

```
Layer 1: Motia Integration (event-driven)
   ↓
Layer 2: Agent Orchestration (Agent/MasterAgent, PTC)
   ↓
Layer 3: Sandbox Execution (Python process isolation)
   ↓
Layer 4: Skill Abstraction (reusable capabilities)
```

**Key Concepts**:
- **Session**: Multi-turn conversation, 30min timeout
- **Task**: Single task, inherits session context
- **AgentManager**: Session management (one Agent per sessionId)
- **Hook System**: AgentHook, TaskHook, SkillHook (lifecycle extension)
- **Context Compression**: Auto-compress after 20 messages

## ⚠️ Common Issues

| Problem | Solution |
|---------|----------|
| Module not found | `npm run generate-types` |
| Column "user_id" missing | `npm run db:reset` |
| Creating new session every time | Ensure `sessionId` is passed |
| LLM timeout | Increase timeout in `src/index.ts` |

## 📦 Key Files

```
steps/agents/              # Agent endpoints
├── agent-api.step.ts      # /agent/execute
└── master-agent.step.ts   # MasterAgent event handling

src/core/
├── agent/                 # Agent core
│   ├── agent.ts           # Agent base class
│   ├── manager.ts         # AgentManager
│   └── ptc-generator.ts   # PTC generation
├── sandbox/               # Sandbox execution
├── database/              # Data persistence
└── context/               # Context management
```

## 🔧 Available Subagents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **myagent-developer** | Code development | Write Motia Steps, Agent logic, Skills |
| **myagent-test-loop** | Automated testing | Verify features, test loops, debug failures |

**Details**: `.claude/agents/myagent-*-*.md`

## 📝 Task Submission (with Knowledge Base)

**Using `/agent/execute` endpoint with knowledge collection**:

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Python有什么特点？",
    "sessionId": "test-session",
    "environment": {
      "knowledgeCollection": "python-docs"
    }
  }'
```

**The `knowledgeCollection` in `environment` triggers RAG retrieval.**

## 🎓 Learning Path

**Newcomers**:
1. Read `TESTING_WORKFLOW.md`
2. Use `myagent-test-loop` for testing

**Developers**:
1. Read `docs/AGENT_PLATFORM_ARCHITECTURE.md`
2. Read `.cursor/rules/motia/*.mdc`
3. Use `myagent-developer` for coding

**Debugging**:
1. Read `docs/reference/architecture/core-concepts.md`
2. Check logs: `tail -f .motia/logs/motia.log`
3. Use Context API for task analysis

## 💡 Knowledge Base (RAG)

**Configuration**:
```typescript
knowledgeBase: {
  db: { /* PostgreSQL config */ },
  apiKey: 'your-api-key',
  baseURL: 'https://...',  // Optional: for OpenAI-compatible APIs
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
}
```

**Supported APIs**:
- OpenAI (default)
- Any OpenAI-compatible API (set `baseURL` and `apiKey`)
- **Dynamic model selection**: Automatically switches between models based on detected vector dimensions (768D → ollama, 1536D → OpenAI)

**Setup**:
```bash
# Create knowledge table
npm run setup:knowledge-base -- --execute --dimensions 1536

# For different dimensions (e.g., Zhipu AI: 1024)
npm run setup:knowledge-base -- --execute --dimensions 1024
```

**Features**:
- **Auto-dimension detection**: Automatically detects vector dimensions when associating knowledge bases
- **Per-collection configuration**: Each app-collection mapping can have custom field mappings and thresholds
- **Multi-dimension support**: Seamlessly work with knowledge tables of different dimensions

**Documentation**: `docs/reference/architecture/knowledge-base.md`

## ⚡ Motia Development

**Comprehensive guides in `.cursor/rules/motia/`**:
- Configuration, API/Event/Cron steps
- State management, middlewares, streaming
- Virtual steps, UI steps
- Architecture, error handling

**Before writing Motia code**, read the relevant guide from `.cursor/rules/`.

---

**Remember**:
- The `.cursor/rules/` directory is your primary Motia reference
- AGENTS.md (this file) is now merged into CLAUDE.md for auto-injection
- See `docs/reference/` for detailed architecture documentation
