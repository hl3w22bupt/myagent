# Agent API Documentation

## Overview

The Motia Agent System provides a RESTful API for executing AI-powered tasks using Programmatic Tool Calling (PTC).

**Base URL**: `http://localhost:3000`

**Version**: 1.0.0

---

## Authentication

### API Key Authentication (Optional)

If API key authentication is enabled, include your API key in the request header:

```
X-API-Key: your-api-key-here
```

To enable authentication, set the `API_KEY` environment variable:

```bash
export API_KEY=your-secret-api-key
```

---

## Endpoints

### 1. Execute Agent Task

Executes a task using the Agent system with PTC code generation.

**Endpoint**: `POST /agent/execute`

**Request Headers**:
```
Content-Type: application/json
X-API-Key: your-api-key (optional, if auth enabled)
```

**Request Body**:

```typescript
{
  task: string,              // Required: Task description
  sessionId?: string,        // Optional: Session ID for multi-turn conversations
  systemPrompt?: string,     // Optional: Custom system prompt
  availableSkills?: string[] // Optional: List of available skills
}
```

**Example Request**:

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Search for the latest AI news and summarize it",
    "sessionId": "session-123",
    "availableSkills": ["web-search", "summarize"]
  }'
```

**Response** (200 OK):

```json
{
  "success": true,
  "message": "Task submitted for execution",
  "taskId": "task-1234567890",
  "task": "Search for the latest AI news and summarize it",
  "sessionId": "session-123"
}
```

**Error Responses**:

*   **400 Bad Request**: Invalid request body
    ```json
    {
      "error": "Invalid request: Task is required"
    }
    ```

*   **401 Unauthorized**: Missing API key (if auth enabled)
    ```json
    {
      "error": "API key required",
      "message": "Please provide X-API-Key header"
    }
    ```

*   **403 Forbidden**: Invalid API key (if auth enabled)
    ```json
    {
      "error": "Invalid API key",
      "message": "The provided API key is not valid"
    }
    ```

*   **429 Too Many Requests**: Rate limit exceeded
    ```json
    {
      "error": "Too many requests",
      "retryAfter": 60
    }
    ```

---

### 2. Health Check

Check system health status and metrics.

**Endpoint**: `GET /health`

**Example Request**:

```bash
curl http://localhost:3000/health
```

**Response** (200 OK):

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "timestamp": "2026-01-08T12:00:00.000Z",
  "services": {
    "api": true,
    "agent": true,
    "sandbox": true,
    "llm": true
  },
  "metrics": {
    "totalTasks": 100,
    "successfulTasks": 95,
    "failedTasks": 5,
    "averageExecutionTime": 150
  }
}
```

**Status Values**:
- `healthy`: All services operational
- `degraded`: Some services degraded but system functional
- `unhealthy`: Critical failures

---

## Event Flow

When you submit a task via `/agent/execute`, the following event flow occurs:

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ POST /agent/execute
       ▼
┌─────────────────────────┐
│  Agent API Step         │
│  (agent-api.step.ts)    │
└──────┬──────────────────┘
       │ emit('agent.task.execute')
       ▼
┌─────────────────────────┐
│  Master Agent Step      │
│  (master-agent.step.ts) │
└──────┬──────────────────┘
       │
       ├─► emit('agent.step.started')
       ├─► Execute task (generate PTC code, run in sandbox)
       ├─► Store in state
       ├─► emit('agent.task.completed')
       └─► emit('agent.step.completed')
       │
       ▼
┌─────────────────────────┐
│  Result Logger Step     │
│  (result-logger.step.ts)│
└─────────────────────────┘
```

---

## Rate Limiting

API requests are rate limited to prevent abuse:

*   **Default Limit**: 100 requests per minute per IP
*   **Rate Limit Headers**:
    *   `X-RateLimit-Limit`: Maximum requests per window
    *   `X-RateLimit-Remaining`: Remaining requests in current window
    *   `X-RateLimit-Reset`: Unix timestamp when limit resets

**Example**:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704700800
```

To configure rate limiting, set environment variables:

```bash
export RATE_LIMIT_WINDOW_MS=60000    # 60 seconds
export RATE_LIMIT_MAX_REQUESTS=100   # 100 requests
```

---

## Session Management

Use `sessionId` for multi-turn conversations:

```bash
# First message
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "My name is Alice", "sessionId": "user-123"}'

# Follow-up message (agent remembers context)
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is my name?", "sessionId": "user-123"}'
```

Session history is stored in Motia state and includes:
*   Task history
*   Execution results
*   Metadata (LLM calls, skill calls, tokens)

---

## Available Skills

The agent can use the following skills:

| Skill Name | Description |
|------------|-------------|
| `web-search` | Search the web for information |
| `summarize` | Summarize text content |
| `code-analysis` | Analyze code quality and patterns |

To specify which skills the agent should use:

```json
{
  "task": "Your task here",
  "availableSkills": ["web-search", "summarize"]
}
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```json
{
  "error": "Error type",
  "message": "Human-readable error message"
}
```

### Common Errors

| Error | Status Code | Description |
|-------|-------------|-------------|
| `Invalid request` | 400 | Request body validation failed |
| `API key required` | 401 | Missing API key |
| `Invalid API key` | 403 | API key authentication failed |
| `Too many requests` | 429 | Rate limit exceeded |
| `Internal server error` | 500 | Unexpected server error |

---

## SDK Examples

### JavaScript/TypeScript

```typescript
async function executeTask(task: string) {
  const response = await fetch('http://localhost:3000/agent/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.API_KEY // Optional
    },
    body: JSON.stringify({ task })
  });

  const data = await response.json();

  if (data.success) {
    console.log('Task submitted:', data.taskId);
  }
}
```

### Python

```python
import requests

def execute_task(task: str, session_id: str = None):
    url = 'http://localhost:3000/agent/execute'
    headers = {'Content-Type': 'application/json'}

    data = {'task': task}
    if session_id:
        data['sessionId'] = session_id

    response = requests.post(url, json=data, headers=headers)
    return response.json()
```

### cURL

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "Your task here"}'
```

---

## Monitoring

### Metrics

The system tracks the following metrics:

*   **Total Tasks**: Total number of tasks executed
*   **Successful Tasks**: Number of successful executions
*   **Failed Tasks**: Number of failed executions
*   **Average Execution Time**: Mean execution time in milliseconds

### Logs

Agent execution logs are structured and include:

```
[INFO] master-agent Master Agent: Starting task execution
[INFO] master-agent Master Agent: Emitting start event
[INFO] master-agent Master Agent: Processing task
[INFO] result-logger === Agent Task Completed ===
[INFO] result-logger ✅ Task Execution Successful
```

---

## Best Practices

### 1. Use Session IDs for Conversations

Always provide a `sessionId` for multi-turn conversations:

```json
{
  "task": "Follow-up question",
  "sessionId": "user-session-unique-id"
}
```

### 2. Specify Available Skills

Limit skills to what's needed for better performance:

```json
{
  "task": "Search and summarize",
  "availableSkills": ["web-search", "summarize"]
}
```

### 3. Handle Errors Gracefully

Always check for errors in responses:

```typescript
const response = await fetch('/agent/execute', {...});
const data = await response.json();

if (response.ok && data.success) {
  // Handle success
} else {
  // Handle error
  console.error(data.error || data.message);
}
```

### 4. Respect Rate Limits

Check rate limit headers and implement backoff:

```typescript
const remaining = response.headers.get('X-RateLimit-Remaining');
if (parseInt(remaining) < 10) {
  // Implement backoff
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

---

## Troubleshooting

### Task Takes Too Long

*   Check if the LLM API is responsive
*   Verify sandbox is working: `curl http://localhost:3000/health`
*   Check logs for errors

### Rate Limited

*   Wait for the rate limit window to reset
*   Implement exponential backoff in your client
*   Contact admin to increase rate limit

### Authentication Failed

*   Verify API key is correct
*   Check `X-API-Key` header is set
*   Ensure API key hasn't expired

---

## Changelog

### Version 1.0.0 (2026-01-08)

*   Initial release
*   `/agent/execute` endpoint
*   `/health` endpoint
*   Event-driven architecture
*   Rate limiting
*   API key authentication (optional)
*   Session management
*   Result logging

---

## Support

For issues, questions, or contributions:

*   **Documentation**: See `/docs` directory
*   **Issues**: Create issue in repository
*   **Tests**: Run `npm test`

---

**Last Updated**: 2026-01-08
**API Version**: 1.0.0
