# Quick Start Guide - Motia Agent System

Get the Motia Agent System up and running in 5 minutes.

---

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+ (for sandbox)
- API key for GLM-4 or Anthropic Claude

---

## Installation

### 1. Clone and Install

```bash
# Clone repository (if applicable)
cd myagent

# Install dependencies
npm install

# Generate types
npm run generate-types
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env
```

Add your API key:

```bash
# For GLM-4
ANTHROPIC_API_KEY=your_glm_api_key_here
DEFAULT_LLM_PROVIDER=openai-compatible
DEFAULT_LLM_MODEL=glm-4

# Or for Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5
```

### 3. Start Development Server

```bash
npm run dev
```

Server will start on `http://localhost:3000`

---

## Quick Test

### Test Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "api": true,
    "agent": true,
    "sandbox": true,
    "llm": true
  }
}
```

### Test Agent Execution

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is 2 + 2?"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Task submitted for execution",
  "taskId": "task-1234567890",
  "task": "What is 2 + 2?"
}
```

---

## Using the API

### Basic Request

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Your task here"}'
```

### With Session ID (Multi-turn Conversation)

```bash
# First message
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "My name is Alice", "sessionId": "user-123"}'

# Follow-up
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is my name?", "sessionId": "user-123"}'
```

### With Specific Skills

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Search and summarize AI news",
    "availableSkills": ["web-search", "summarize"]
  }'
```

---

## Project Structure

```
myagent/
├── steps/              # Motia steps
│   ├── agents/
│   │   ├── master-agent.step.ts
│   │   ├── agent-api.step.ts
│   │   └── result-logger.step.ts
│   └── health/
│       └── health-check.step.ts
│
├── src/                # Source code
│   ├── core/
│   │   ├── agent/      # Agent implementation
│   │   └── sandbox/    # Sandbox implementation
│   └── middleware/
│       └── api-security.ts
│
├── tests/              # Tests
│   ├── integration/
│   └── manual/
│
├── docs/               # Documentation
│   ├── API-DOCUMENTATION.md
│   ├── phase-*-completion.md
│   └── PROJECT-SUMMARY.md
│
└── motia.config.ts     # Motia configuration
```

---

## Available Skills

| Skill | Description |
|-------|-------------|
| `web-search` | Search the web for information |
| `summarize` | Summarize text content |
| `code-analysis` | Analyze code quality and patterns |

---

## Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=your_api_key_here
```

### Optional

```bash
DEFAULT_LLM_PROVIDER=openai-compatible  # or 'anthropic'
DEFAULT_LLM_MODEL=glm-4                 # or 'claude-sonnet-4-5'
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/

# Security (Phase 6)
API_KEY=your_secret_api_key            # Enable authentication

# Rate Limiting (Phase 6)
RATE_LIMIT_WINDOW_MS=60000             # 60 seconds
RATE_LIMIT_MAX_REQUESTS=100            # 100 requests

# Sandbox
SANDBOX_TYPE=local
SANDBOX_PYTHON_PATH=python3
```

---

## Development

### Run Tests

```bash
# All tests
npm test

# Integration tests
npm run test:integration

# Unit tests
npm run test:unit

# With coverage
npm run test:coverage
```

### Build

```bash
# TypeScript compilation
npm run build:ts

# Full build
npm run build
```

### Type Generation

```bash
npm run generate-types
```

---

## Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

### View Logs

Logs are printed to console with structured format:

```
[INFO] master-agent Master Agent: Starting task execution
[INFO] master-agent Master Agent: Task execution completed successfully
[INFO] result-logger === Agent Task Completed ===
```

### Execution History

Access via state (in code):

```javascript
const history = await state.get('agent:execution:history');
console.log(`Total tasks: ${history.length}`);
```

---

## Security (Optional)

### Enable API Key Authentication

```bash
export API_KEY=your-secret-key
```

Then include in requests:

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-key" \
  -d '{"task": "Hello"}'
```

### Rate Limiting

By default: 100 requests per minute per IP.

Configure via environment:

```bash
export RATE_LIMIT_MAX_REQUESTS=200
```

---

## Troubleshooting

### Port Already in Use

If port 3000 is occupied, Motia will automatically use port 3001, 3002, etc.

Check the logs for the actual port:

```
🚀 Server ready and listening on port 3001
```

### API Key Not Working

Ensure the header is `X-API-Key` (not `Authorization`):

```bash
# Correct
-H "X-API-Key: your-key"

# Wrong
-H "Authorization: Bearer your-key"
```

### Task Fails Immediately

Check:
1. API key is set correctly
2. LLM service is accessible
3. Logs for specific error messages

### Sandbox Not Working

Ensure Python 3.8+ is installed:

```bash
python3 --version
```

---

## Next Steps

### Learn More

- **API Documentation**: `docs/API-DOCUMENTATION.md`
- **Project Summary**: `docs/PROJECT-SUMMARY.md`
- **Phase Reports**: `docs/phase-*-completion.md`

### Advanced Features

- **Multi-Agent**: Master agent with subagents
- **Streaming**: Real-time output streaming
- **Multi-Modal**: Image, audio, video processing
- **Skills**: Create custom skills

### Production Deployment

See Phase 6 completion report for production hardening features:

- Health checks
- Rate limiting
- Authentication
- Monitoring
- Testing

---

## Getting Help

- **Documentation**: Check `/docs` directory
- **Examples**: See `/tests/manual` directory
- **Issues**: Create issue in repository
- **Motia Docs**: https://docs.motia.dev

---

## Summary

In 5 minutes, you should have:

✅ Server running on `http://localhost:3000`
✅ Health check working
✅ Agent executing tasks
✅ Events flowing through the system

**You're ready to build!** 🚀

---

**Last Updated**: 2026-01-08
**Version**: 1.0.0
