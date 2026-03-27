# Motia Project Guide for Claude Code & Claude AI

This project uses **Motia** - a framework for building event-driven, type-safe backend systems.

## 📚 Important: Read the Comprehensive Guides

This project has detailed development guides in **`.cursor/rules/`** directory. These markdown files (`.mdc`) contain complete patterns, examples, and type definitions.

**Before writing any Motia code, read the relevant guides from `.cursor/rules/`**

### For Claude Code Users

**A pre-configured subagent is ready!**

The `myagent-developer` subagent in `.claude/agents/` automatically references all 11 cursor rules when coding.

Use it: `/agents` → select `myagent-developer`

Learn more: [Claude Code Subagents Docs](https://docs.claude.com/en/docs/claude-code/sub-agents)

### For Claude AI Assistant (Chat)

Explicitly reference cursor rules in your prompts:

```
Read .cursor/rules/motia/api-steps.mdc and create an API endpoint
for user registration following the patterns shown.
```

## Available Guides (11 Comprehensive Files)

All guides in `.cursor/rules/` with **TypeScript, JavaScript, and Python** examples:

**Configuration** (`.cursor/rules/motia/`):

- `motia-config.mdc` - Essential project setup, package.json requirements, plugin naming

**Step Types** (`.cursor/rules/motia/`):

- `api-steps.mdc`, `event-steps.mdc`, `cron-steps.mdc`

**Features** (`.cursor/rules/motia/`):

- `state-management.mdc`, `middlewares.mdc`, `realtime-streaming.mdc`
- `virtual-steps.mdc`, `ui-steps.mdc`

**Architecture** (`.cursor/architecture/`):

- `architecture.mdc`, `error-handling.mdc`

## Quick Reference

See `AGENTS.md` in this directory for a quick overview and links to specific guides.

**Important**: Motia discovers steps from both `/src` and `/steps` folders. Modern projects use `/src` for a familiar structure.

## Key Commands

```bash
npm run dev              # Start development server (with hot reload)
npm run start            # Start production server (without hot reload)
npx motia generate-types # Regenerate TypeScript types
```

---

**Remember**: The `.cursor/rules/` directory is your primary reference. Read the relevant guide before implementing any Motia pattern.

## Skill & Tool Execution History System

The system tracks all skill and tool executions to help the Agent learn from past executions and make better decisions.

### Features

1. **Execution History Tracking**
   - Records all skill executions (success + failure)
   - Records all tool usage (success + failure)
   - Stores in TaskContext with retention policies (200 skills, 500 tools)

2. **Failure Experience Extraction**
   - Automatically extracts lessons from failed executions
   - Stores in TaskContext.summary.errorsAndSolutions
   - Retrieval based on keyword matching and frequency

3. **LLM Prompt Injection**
   - Recent executions shown to Agent before code generation
   - Failure experiences injected to help avoid repeating mistakes
   - Helps Agent make better decisions based on past context

### Configuration

**Environment Variables:**
```bash
# Context API URL for execution history tracking
MOTIA_CONTEXT_API_URL=http://localhost:3000/api/context

# Enable/disable features (via orchestrator config)
enableRecentSkillExecutions=true
enableFailureExperiences=true
```

**Retention Policies:**
- Skill executions: 200 records (FIFO)
- Tool usage: 500 records (FIFO)
- Failure experiences: 100 records (FIFO)

### API Endpoints

- `POST /api/context/skill-execution` - Receive skill execution records
- `POST /api/context/tool-usage` - Receive tool usage records
- `POST /api/context/failure-experience` - Receive failure experiences

### Monitoring

The system logs all executions and failures:
- `[ContextHook] ✓/✗ Skill execution recorded: {skillName} ({duration}ms)`
- `[ContextHook] ✓ Failure experience collected: {skillName}`
- `[Agent] Injecting recent skill executions into PTC generation`
