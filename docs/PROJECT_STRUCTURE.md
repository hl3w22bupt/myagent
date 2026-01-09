# Motia Distributed Agent System

A distributed agent system built on Motia framework with Programmatic Tool Calling (PTC) support.

## 🏗️ Project Structure

```
myagent/
├── steps/                        # Motia Steps (Agent execution entry points)
│   ├── agents/                   # Agent steps
│   └── workflows/                # Other business workflows
│
├── subagents/                    # Subagent configurations
│   ├── code-reviewer/           # Code review specialist
│   ├── data-analyst/            # Data analysis specialist
│   └── security-auditor/        # Security audit specialist
│
├── skills/                       # Python skill implementations
│   ├── web-search/              # Web search capability
│   ├── code-analysis/           # Code analysis capability
│   └── summarize/               # Text summarization capability
│
├── core/                         # Core system components
│   ├── agent/                   # Agent SDK (TypeScript)
│   │   ├── agent.ts             # Base Agent class
│   │   ├── master-agent.ts      # Master Agent (delegation)
│   │   ├── ptc-generator.ts     # PTC code generator
│   │   └── types.ts             # Type definitions
│   │
│   ├── sandbox/                 # Sandbox abstraction (TypeScript)
│   │   ├── interface.ts         # SandboxAdapter interface
│   │   ├── factory.ts           # Adapter factory
│   │   └── adapters/            # Sandbox implementations
│   │       ├── local.ts         # Local process sandbox
│   │       ├── daytona.ts       # Daytona adapter (TODO)
│   │       ├── e2b.ts           # E2B adapter (TODO)
│   │       └── modal.ts         # Modal adapter (TODO)
│   │
│   └── skill/                   # Skill core (Python)
│       ├── executor.py          # SkillExecutor class
│       ├── registry.py          # SkillRegistry
│       └── types.py             # Type definitions
│
├── config/                       # Configuration files
│   ├── sandbox.config.yaml      # Sandbox configuration
│   └── agents.config.yaml       # Agent global configuration (TODO)
│
├── tests/                        # Test suites
│   ├── unit/                    # Unit tests
│   ├── integration/             # Integration tests
│   ├── e2e/                     # End-to-end tests
│   └── performance/             # Performance benchmarks
│
├── scripts/                      # Utility scripts
│   └── test-standalone.sh       # Standalone test runner
│
├── prompts/                      # System prompts
│   └── master-system.txt        # Master agent system prompt
│
├── docs/                         # Documentation
│
├── motia.config.ts              # Motia framework configuration
├── package.json                 # Node.js dependencies
├── requirements.txt             # Python dependencies
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest test configuration
└── types.d.ts                   # Auto-generated Motia types
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.8+
- Anthropic API key

### Installation

```bash
# Install dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Generate Motia types
npm run generate-types
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Run standalone tests (Phase 4.5)
npm run test:standalone

# Build for production
npm run build
```

## 📚 Implementation Phases

This project is implemented in phases:

1. ✅ **Phase 1**: Project Foundation (COMPLETED)
2. ⏳ **Phase 2**: Skill Subsystem (Python)
3. ⏳ **Phase 3**: Sandbox Layer (TypeScript)
4. ⏳ **Phase 4**: Agent Layer (TypeScript)
5. ⏳ **Phase 4.5**: Agent + Skill Standalone Testing
6. ⏳ **Phase 5**: Motia Integration
7. ⏳ **Phase 6**: Master Agent Implementation
8. ⏳ **Phase 7**: Examples & Testing
9. ⏳ **Phase 8**: Optimization & Production

See `IMPLEMENTATION_WORKFLOW.md` for detailed implementation guide.

## 🏗️ Architecture

### Four-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  Motia Integration Layer (TypeScript)          │
│  - Event-driven execution                       │
│  - Observability & tracing                      │
│  - State management                             │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────────┐
│  Agent Orchestration Layer (TypeScript)        │
│  - MasterAgent (with delegation)                │
│  - Subagents (specialized)                      │
│  - PTC Generation                               │
└──────────────┬──────────────────────────────────┘
               │ sandbox.execute(ptcCode)
               ↓
┌─────────────────────────────────────────────────┐
│  Sandbox Execution Layer (TypeScript + Python) │
│  - Local / Daytona / E2B / Modal                │
│  - Isolated PTC code execution                  │
│  - Skill Executor integration                   │
└──────────────┬──────────────────────────────────┘
               │ executor.execute(skill_name, input)
               ↓
┌─────────────────────────────────────────────────┐
│  Skill Abstraction Layer (Python)               │
│  - Reusable capability units                    │
│  - Three types: pure-prompt, pure-script, hybrid│
└─────────────────────────────────────────────────┘
```

## 🔑 Key Concepts

### Skills

Skills are reusable capability units implemented in Python:
- **pure-prompt**: Template-based, LLM-only
- **pure-script**: Code-only, no LLM
- **hybrid**: Code + LLM combination

### Agents

- **Agent**: Base class with PTC generation and skill execution
- **MasterAgent**: Extends Agent with subagent delegation

### PTC (Programmatic Tool Calling)

Two-step code generation:
1. **Planning**: Select appropriate skills for the task
2. **Implementation**: Generate Python code using selected skills

## 📖 Documentation

- `IMPLEMENTATION_WORKFLOW.md` - Complete implementation guide
- `CLAUDE.md` - Motia project guide
- `AGENTS.md` - Agent system overview
- `docs/TROUBLESHOOTING_STANDALONE.md` - Troubleshooting guide (Phase 4.5)

## 🤝 Contributing

This is a reference implementation for Motia-based agent systems. Feel free to use it as a starting point for your own projects.

## 📄 License

MIT

---

**Status**: Phase 1 Complete ✅
**Next Phase**: Phase 2 - Skill Subsystem Implementation
