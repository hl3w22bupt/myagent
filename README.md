# myagent

A cloud-native distributed AI agent platform — built on a production-grade **agent harness** that manages the full lifecycle of AI agents, from intent analysis and context assembly to sandboxed execution and real-time observability.

## What is myagent?

**myagent** is a distributed AI agent platform that provides a complete **agent harness** — a pluggable runtime framework orchestrating everything from intent analysis to code generation and sandboxed execution. Designed for both cloud-scale deployment and local development, it powers multi-agent orchestration, autonomous agents, workflow-driven task pipelines, and deep observability.

### Core Design Concepts

**🧩 Agent Harness** — A runtime framework that orchestrates the full agent execution pipeline: intent analysis, context assembly, skill selection, PTC (Programmatic Tool Calling) code generation, sandboxed execution, result processing, and streaming observability. The harness is extensible via three levels of hooks (Agent, Task, Skill).

**🤖 Multi-Agent Architecture** — Four agent types serving different orchestration patterns:

| Agent Type | Role |
|---|---|
| **Agent** | Base class — intent analysis → PTC codegen → sandbox execution |
| **MasterAgent** | Delegates subtasks to specialized subagents with confidence-based planning |
| **SoulAgent** | Autonomous agent with hibernate/wakeup lifecycle and built-in primitives |
| **ExternalAgent** | Bridges to external coding agents (Claude Code, Codex, Gemini) via ACP protocol |

**🔌 Three-Level Hook System** — Lifecycle hooks at every layer:
- **Agent hooks**: create, acquire, task start/complete, destroy, HITL, health check
- **Task hooks**: pre-execution, post-execution, heartbeat, configurable webhooks
- **Skill hooks**: pre/post execution, context injection, workspace management

**📋 PTC (Programmatic Tool Calling)** — Instead of function-calling, the LLM generates Python code that orchestrates skill calls, processes results, and handles control flow — executed in an isolated sandbox with structured output collection.

**🔄 Session & Context Management** — Multi-turn conversations with context compression, multi-source context orchestration (history + knowledge base + user profile + failure experience), and automatic session lifecycle management.

**🧪 Sandbox Execution** — Isolated Python environments for safe code execution, with structured output parsing, artifact extraction, and extensible adapter pattern (local, with Daytone/E2B/Modal adapters defined).

**🔭 Observability First** — Real-time streaming via two dedicated channels (`taskExecution` + `executionTraces`), hierarchical trace visualization, token usage tracking, and full execution history persistence.

**⚙️ Workflow Engine** — Define multi-step pipelines with agent/subagent invocations, parallel execution, conditional branching, HITL breakpoints, retry policies, and failure handlers.

Built on the **iii engine** — a high-performance Rust runtime for event-driven backend systems.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Presentation Layer                                │
│        React Frontend (9 pages: Dashboard, Tasks, Agents, Workflows,        │
│        Knowledge, Autonomous Agents, Skills, Settings, Terminal)             │
└──────────────────────────────────────────────────┬───────────────────────────┘
                                                    │ HTTP / WebSocket / SSE
┌──────────────────────────────────────────────────┴───────────────────────────┐
│                              API Layer (iii Steps)                               │
│   /agent/execute  /api/contexts  /workflows/*  /api/souls/*  /api/skills/*   │
│   /api/knowledge/*  /api/traces/*  /api/token-usage/*  /api/sessions/*       │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                                    │
┌──────────────────────────────────┴───────────────────────────────────────────┐
│                     Agent Layer (src/core/agent/)                           │
│                                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Agent    │  │ MasterAgent  │  │  SoulAgent   │  │ExternalAgent │      │
│  │ (base)     │  │ (delegation) │  │ (autonomous)  │  │ (ACP bridge) │      │
│  └────────────┘  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                                              │
│  AgentManager (session lifecycle, LRU eviction)                             │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                                    │
┌──────────────────────────────────┴───────────────────────────────────────────┐
│                      Hook System (3 layers)                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │  Agent Hooks    │  │   Task Hooks     │  │  Skill Hooks     │           │
│  │  • Create/Delete │  │  • preExec      │  │  • Pre-execution  │           │
│  │  • Task lifecycle│  │  • postExec     │  │  • Post-execution │           │
│  │  • HITL notify  │  │  • Heartbeat    │  │  • Context inject │           │
│  │  • Health check │  │  • Configurable │  │  • Trace capture  │           │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘           │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                                    │
┌──────────────────────────────────┴───────────────────────────────────────────┐
│                  Context & Knowledge Layer                                   │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐   │
│  │ ContextOrchestrator│  │  Knowledge Base    │  │   Session Manager   │   │
│  │ • History          │  │  • PostgreSQL v     │  │  • 30min timeout    │   │
│  │ • User profile     │  │  • LanceDB         │  │  • Conv compression │   │
│  │ • Knowledge ret.   │  │  • Auto dimension   │  │  • HITL state       │   │
│  │ • Failure exp.     │  │  • Multi-model      │  │  • Variable store   │   │
│  └────────────────────┘  └────────────────────┘  └──────────────────────┘   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                                    │
┌──────────────────────────────────┴───────────────────────────────────────────┐
│                      Execution Layer                                        │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────────┐   │
│  │   Sandbox Manager  │  │  Workflow Engine   │  │  PTC Generator      │   │
│  │  • Local adapter   │  │  • Step orche.     │  │  • Skill selection  │   │
│  │  • Adapter pattern │  │  • Parallel exec   │  │  • Code generation  │   │
│  │  • Structured out  │  │  • HITL breakpoints│  │  • Retry logic      │   │
│  │  • Artifact extract│  │  • Retry/rollback  │  │  • DB persistence   │   │
│  └────────────────────┘  └────────────────────┘  └──────────────────────┘   │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                                    │
┌──────────────────────────────────┴───────────────────────────────────────────┐
│                        Persistence Layer                                     │
│         SQLite (local dev) / PostgreSQL (production) + Redis (cache)         │
│  TaskContext | SessionState | ExecutionTraces | TokenUsage | WorkflowState   │
│  KnowledgeCollections | VectorEmbeddings | SoulState | Artifacts             │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Screenshots

### Agent Chat Interface
Multi-turn conversations with AI Agent with real-time streaming output.

![Agent Chat Interface](images/20260531-180449.jpg)

### Execution Trace
Full-chain tracing via multi-level hooks — see exactly what's happening behind the scenes.

![Execution Trace](images/20260531-180510.jpg)

### Task Context Monitoring
Inspect multi-level task context and outputs for any agent execution.

![Task Context Detail](images/20260531-180518.jpg)

### Token Usage
Clear visibility into token consumption for cost control.

![Token Observability](images/20260531-180522.jpg)

### Workflow Orchestration
Pre-define workflows to orchestrate complex tasks with human-in-the-loop.

![Workflow Orchestration](images/20260531-180525.jpg)

### Autonomous Agent
A persistent agent instance with goals and autonomy — not just a passive responder.

![Autonomous Agent](images/20260531-180529.jpg)

### Workspace
Every task runs in its own isolated workspace environment.

![Workspace](images/20260531-180655.jpg)

### Web Terminal
Interact directly with the workspace environment via Web Terminal — ideal for coding agent scenarios.

![Web Terminal](images/20260531-180659.jpg)

## Key Features

### 🧩 Agent Runtime

The core execution framework that powers all agent types:

- **Full lifecycle management** — Intent analysis → context assembly → skill selection → PTC code generation → sandbox execution → result processing → streaming observability
- **PTC (Programmatic Tool Calling)** — LLM generates Python code that orchestrates skill invocations, handles control flow, and processes results. Generated code is persisted to database for debugging and replay
- **Skill selection gate** — LLM decides whether to use skills (code generation mode) or respond directly (conversational mode), based on available skills and task requirements
- **HITL (Human-in-the-Loop)** — Intent clarification before execution, approval checkpoints during workflow steps, and async HITL state management with polling
- **Retry & resilience** — Configurable retry with exponential backoff, failure classification (transient vs permanent), and error isolation across hooks

### 🤖 Multi-Agent Orchestration

Four agent types for different orchestration patterns:

- **Agent** — Base class with PTC codegen + sandbox execution. Handles intent analysis, skill planning, code generation (up to 3 retries), sandbox execution, artifact extraction, and structured output parsing
- **MasterAgent** — Delegates subtasks to specialized subagents. Uses LLM-driven delegation planning with confidence scoring (0–100, threshold 70). Supports dynamic subagent discovery from YAML configs and skill intersection filtering
- **SoulAgent** — Autonomous persistent agents with hibernate/wakeup lifecycle. Three execution modes: user message (interrupt current task), periodic check (LLM decides whether to act), heartbeat (lightweight status check). Built-in primitive tools: `send_message`, `send_notification`, `hibernate`, `complete`
- **ExternalAgent** — Bridges to external coding agents (Claude Code, Codex, Gemini, Cursor) via ACP protocol. Maintains its own workspace and runtime connection

### ⚙️ Workflow Engine

Multi-step task orchestration with enterprise-grade controls:

- **Step orchestration** — Define sequences of agent/subagent/subworkflow/HITL steps with dependency management
- **Parallel execution** — Run steps concurrently with configurable iteration patterns
- **Conditional branching** — Skip or route execution based on step outputs (`condition` field)
- **HITL breakpoints** — Pause execution for human approval, with async polling and resume
- **Failure handlers** — Per-step retry/skip/rollback strategies and global failure handling
- **Input/output mapping** — Flexible data transformation between steps using template expressions (`{{ step.output }}`)
- **Git clone steps** — Built-in step type for cloning repositories into workspace

### 🔌 Three-Level Hook System

Observability and extensibility at every layer:

- **Agent Hooks** (5 built-in implementations):
  - `AgentMonitoringHook` — Health and statistics collection
  - `AgentContextSyncHook` — State synchronization across sessions
  - `AgentProgressNotifyHook` — Real-time progress events to `taskExecution` stream
  - `AgentTraceHook` — Execution trace capture to `executionTraces` stream
  - Hook manager with isolation (one failure doesn't stop others) and sequential execution

- **Task Hooks** (7+ built-in implementations):
  - `preExec/postExec` lifecycle with abort capability via `{stop: true}`
  - Context assembly, metrics tracking, trace capture, user profile accumulation
  - Configurable webhook integration, workspace management per task
  - Heartbeat mechanism for long-running tasks

- **Skill Hooks** (Python-level):
  - Pre/post execution hooks for every skill invocation
  - Context injection, workspace preparation, trace recording
  - Composite hook execution with ordered chain

### 🧠 Context & Knowledge

- **ContextOrchestrator** — Assembles context from multiple sources: conversation history, user profile, user context, environment variables, knowledge base retrieval, recent skill executions, and failure experiences
- **RAG Knowledge Base** — PostgreSQL with pgvector extension (or LanceDB adapter) for vector similarity search. Supports auto dimension detection and multi-model embedding (768D Ollama → 1536D OpenAI)
- **Session Management** — Multi-turn conversations with configurable timeout (default 30 min), context compression after configurable threshold, and conversation round tracking with structured summaries
- **Context inheritance** — New tasks inherit conversation history from the most recent session task, enabling coherent multi-turn interactions

### 🧪 Sandbox Execution

- **Local adapter** — Isolated Python subprocess execution with venv detection, PYTHONPATH setup, and structured output parsing via `[STRUCTURED_OUTPUT]` markers
- **Adapter pattern** — `SandboxAdapter` interface with Daytone/E2B/Modal adapters defined and ready for implementation
- **Artifact extraction** — Automatically extracts videos, images, audio, code, documents, and data from sandbox output
- **Error classification** — Classifies ModuleNotFoundError, ImportError, syntax errors, and timeouts for targeted retry strategies

### 🔭 Observability & Streaming

- **Dual stream channels** — `taskExecution` stream for real-time progress events (intent_analysis, ptc_planning, delegation_planning, soul_execution, etc.) and `executionTraces` stream for hierarchical execution trace trees
- **Trace system** — Captures pre/post state at each agent invocation level, linking child agent traces to parent tasks with timestamps and subject metadata
- **Token usage tracking** — Per-LLM-call token accounting across the entire agent hierarchy, exposed via REST API and frontend visualization
- **Frontend dashboard** — 9 pages including real-time task monitoring with streaming output, execution trace tree view, token usage charts, and artifact browsers

### 🗄️ Persistence

- **Dual database support** — SQLite (sql.js) for local development, PostgreSQL for production, selected via `DATABASE_BACKEND` env var
- **Data stores** — TaskContext with full conversation rounds, HITL states, artifact index, skill/tool usage history, and working memory. Execution traces, token usage records, workflow states, soul agent states
- **Working memory** — Per-task persistent key-value store that survives across conversation rounds within the same task

## Quick Start

```bash
# Install dependencies
npm install

# Start production server (recommended)
npm run start

# Start development server (with hot reload)
npm run dev
```

**Services**:
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173` (run `cd motia-frontend && npm run dev`)

## Test the API

```bash
# Submit a task with knowledge base retrieval
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Python装饰器是什么？怎么使用装饰器？",
    "sessionId": "test-session"
  }'

# Check task context
curl http://localhost:3000/api/contexts/{taskId}

# Check task output
curl http://localhost:3000/api/contexts/outputs/{taskId}
```

## Architecture

```
Layer 1: iii Engine (event-driven runtime)
   ↓
Layer 2: Agent Orchestration (Agent/MasterAgent, PTC)
   ↓
Layer 3: Sandbox Execution (Python process isolation)
   ↓
Layer 4: Skill Abstraction (reusable capabilities)
```

## Configuration

### Environment Variables

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myagent
POSTGRES_USER=leo
POSTGRES_PASSWORD=your_password

# LLM Provider
DEFAULT_LLM_PROVIDER=anthropic  # or 'openai-compatible'
DEFAULT_LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=sk-xxx

# Knowledge Base (RAG)
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: for OpenAI-compatible APIs
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# Ollama (for 768D vectors)
OLLAMA_BASE_URL=http://localhost:11434
```

### Knowledge Base Setup

```bash
# Create a knowledge table with specific dimensions
npm run setup:knowledge-base -- --execute --dimensions 1536

# For 768D vectors (ollama)
npm run setup:knowledge-base -- --execute --dimensions 768
```

## Development

**Project Structure**:
```
steps/           # iii steps (API, Event, Cron)
├── agents/      # Agent endpoints
├── api/         # HTTP API routes
└── cron/        # Scheduled tasks

src/core/        # Core system
├── agent/       # Agent orchestration
├── context/     # Context management
├── knowledge/   # Knowledge base integration
└── sandbox/     # Python sandbox

motia-frontend/  # React UI
docs/            # Documentation
.cursor/rules/   # Development best practices
```

**Testing**:
```bash
# Run tests
npm test

# Test knowledge base retrieval
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Your question here", "sessionId": "test"}'
```

**After code changes**:
```bash
npm run build            # TypeScript changes
```

## Documentation

- **CLAUDE.md** - Project guide for Claude Code & Claude AI
- **TESTING_WORKFLOW.md** - Complete testing guide
- **API_REFERENCE.md** - All API endpoints
- **docs/reference/** - Comprehensive architecture documentation:
  - `architecture/` - System design and components
  - `api/` - HTTP API reference
  - `guides/` - Getting started guides
  - `deployment/` - Configuration and setup

## Contributing

See `.cursor/rules/` for development best practices covering configuration, steps, state management, streaming, architecture, error handling, and more.

## License

MIT

## Learn More

- [iii Engine Documentation](https://iii.dev/docs) - Complete guides and API reference
- [CLAUDE.md](./CLAUDE.md) - Project development guide
- [API Reference](./API_REFERENCE.md) - All API endpoints
- [Testing Workflow](./TESTING_WORKFLOW.md) - Complete testing guide

---

**Built with the iii engine** — A high-performance Rust runtime for distributed backend systems
