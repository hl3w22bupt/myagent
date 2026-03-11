# Coding-Agent Subagent

Expert coding agent that delegates to external CLI tools (Claude Code, Codex, Pi).

## Overview

This subagent implements the **External Coding Agent Integration** design from the skill system enhancement plan. It follows a **responsibility separation** approach:

- **MyAgent (this subagent)**: Understanding, context gathering, tool selection, result verification
- **External CLI tools**: Execution, completion, returning results

## Architecture

```
User Request
    ↓
coding-agent subagent
    ├─ Understand requirements (with clarification)
    ├─ Gather context (files, structure, dependencies)
    ├─ Choose appropriate tool (Claude/Codex/Pi)
    ├─ Prepare complete task description
    └─ Execute via tool-bash
        ↓
    External CLI Tool
    ├─ claude (Claude Code)
    ├─ codex (OpenAI Codex)
    └─ pi (Pi Coding Agent)
        ↓
    Result Verification
    └─ Report to user
```

## External Tools

### Claude Code
- **Binary**: `claude`
- **Best for**: Medium tasks (100-1000 lines)
- **Use cases**: Bug fixes, new features, refactoring
- **Requires**: `ANTHROPIC_API_KEY`

Example:
```bash
claude "Refactor the authentication module to use OAuth 2.0" --model claude-sonnet-4-6
```

### Codex
- **Binary**: `codex`
- **Best for**: Large refactoring (1000+ lines)
- **Use cases**: Architecture changes, multi-file modifications
- **Requires**: `OPENAI_API_KEY`

Example:
```bash
codex "Redesign the entire data layer with proper abstraction" --model gpt-5.2-codex
```

### Pi
- **Binary**: `pi`
- **Best for**: Small tasks (<100 lines)
- **Use cases**: Quick fixes, simple transformations
- **Requires**: None

Example:
```bash
pi "Rename all occurrences of 'foo' to 'bar' in utils.ts"
```

## Task Complexity Guidelines

| Lines | Complexity | Tool | Time |
|-------|-----------|------|------|
| <100 | Small | Pi | ~10s |
| 100-1000 | Medium | Claude Code | ~30s |
| 1000+ | Large | Codex | ~2-5min |

## Usage

### Via Agent API

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Fix the authentication bug in login module",
    "subagent": "coding-agent"
  }'
```

### Via MasterAgent Delegation

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Implement OAuth 2.0 authentication",
    "useDelegation": true,
    "delegateTo": ["coding-agent"]
  }'
```

## Configuration

### External Tool Installation

Install the CLI tools:

```bash
# Claude Code (Anthropic)
npm install -g @anthropic-ai/claude-code

# Codex (OpenAI)
npm install -g openai-codex

# Pi (Pi Coding Agent)
npm install -g pi-coding-agent
```

### API Keys

Set required environment variables:

```bash
# For Claude Code
export ANTHROPIC_API_KEY="sk-ant-..."

# For Codex
export OPENAI_API_KEY="sk-..."

# Pi doesn't require API key
```

## Development

### Testing the Subagent

```bash
# Run directly
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Create a simple hello world function in Python",
    "subagent": "coding-agent"
  }'

# Or via MasterAgent
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Refactor user service to use dependency injection",
    "useDelegation": true,
    "delegateTo": ["coding-agent"]
  }'
```

## Design Principles

1. **One-Shot Execution**: External tools receive complete context and execute autonomously
2. **Responsibility Separation**: MyAgent understands, external tools execute
3. **Complete Context First**: Gather all information before calling external tool
4. **Result Verification**: Always verify and report results after execution

## Related Documentation

- Design: `docs/design/skill-system-enhancement-plan.md` (Section: External Coding Agent Integration)
- Issue: #52 - Integration with Third-Party External Coding Agents

## Future Enhancements

- [ ] Add support for more external tools (Kimi CLI, etc.)
- [ ] Implement automatic tool selection based on task analysis
- [ ] Add cost estimation per tool
- [ ] Support for streaming results from external tools
- [ ] Integration with distributed skill execution (Phase 4+)
