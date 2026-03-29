# Motia Tracing System - Complete Documentation

## Overview

The Motia Tracing System provides comprehensive execution tracing across three levels: **Task**, **Agent**, and **Skill**. Each level captures detailed execution information including inputs, outputs, errors, timing, and LLM usage.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Task Level                            │
│  TaskTraceHook: preExec → onProgressingNotify → postExec    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                ┌───────────▼──────────┐
                │   Agent Level       │
                │  AgentTraceHook:    │
                │  onTaskStart →      │
                │  onTaskComplete     │
                │                     │
                │  Internal Stages:   │
                │  • Intent Analysis  │
                │  • PTC Planning     │
                │  • LLM Reasoning    │
                └───────────┬─────────┘
                            │
                ┌───────────▼──────────┐
                │   Skill Level        │
                │  SkillTraceHook:     │
                │  pre_exec →          │
                │  post_exec           │
                │                     │
                │  Internal Stages:   │
                │  • LLM Reasoning    │
                │  • Skill Generation │
                └──────────────────────┘
```

## Trace Levels

### 1. Task Level (`level: "task"`)
**Trace ID Format:** `task-{taskId}-{timestamp}`

Captures the entire task execution lifecycle from start to completion.

**Stages:**
- `pre`: Before task execution starts
- `processing`: During task execution (progress updates)
- `post`: After task execution completes

**Tracked by:** `TaskTraceHook` (`src/core/task/hooks/trace-hook.ts`)

**Example Trace:**
```json
{
  "traceId": "task-task-123-1736618400000",
  "level": "task",
  "taskId": "task-123",
  "stage": "pre",
  "status": "started",
  "inputData": "{\"task\":\"Create a login page\",\"sessionId\":\"session-abc\"}",
  "timestamp": "2025-01-11T12:00:00Z",
  "metadata": {
    "sessionId": "session-abc",
    "llmCalls": 0,
    "skillCalls": 0,
    "totalTokens": 0
  }
}
```

### 2. Agent Level (`level: "agent"`)
**Trace ID Format:** `agent-{sessionId}-{stage}`

Captures agent-level execution with hierarchical relationship to parent task.

**Stages:**
- `pre`: Before agent starts task execution
- `post`: After agent completes task execution

**Tracked by:** `AgentTraceHook` (`src/core/agent/hooks/trace-hook.ts`)

**Example Trace:**
```json
{
  "traceId": "agent-session-abc-pre",
  "level": "agent",
  "taskId": "task-123",
  "agentId": "session-abc",
  "stage": "pre",
  "status": "started",
  "inputData": "{\"task\":\"Create a login page\",\"agentType\":\"Agent\"}",
  "timestamp": "2025-01-11T12:00:01Z"
}
```

### 3. Skill Level (`level: "skill"`)
**Trace ID Format:** `{taskId}-{skillName}-skill-{stage}`

Captures individual skill execution with input/output and error tracking.

**Stages:**
- `pre`: Before skill execution
- `post`: After skill execution

**Tracked by:** `SkillTraceHook` (`src/core/skill/hooks/trace_hook.py`)

**Example Trace:**
```json
{
  "traceId": "task-123-frontend-design-skill-pre",
  "level": "skill",
  "taskId": "task-123",
  "agentId": "session-abc",
  "skillName": "frontend-design",
  "stage": "pre",
  "status": "running",
  "inputData": "{\"skill_name\":\"frontend-design\",\"input_data\":{\"task\":\"Create a login page\"}}",
  "timestamp": "2025-01-11T12:00:02Z"
}
```

## Internal Trace Stages

### Agent Internal Traces (`level: "agent-internal"`)

#### Intent Analysis (`stage: "intent_analysis"`)
**Trace ID Format:** `intent-analysis-{taskId}-{timestamp}`

Captures the agent's intent analysis phase where it determines what type of task the user is requesting.

**Implementation:** `notifyIntentAnalysis()` in `src/core/agent/agent.ts`

**Example:**
```json
{
  "traceId": "intent-analysis-task-123-1736618401000",
  "level": "agent-internal",
  "taskId": "task-123",
  "agentId": "session-abc",
  "stage": "intent_analysis",
  "status": "completed",
  "inputData": "{\"task\":\"Create a login page\",\"agentType\":\"Agent\"}",
  "outputData": "{\"intent\":\"frontend_design\",\"reasoning\":\"User wants to create a UI component\",\"category\":\"creative\",\"confidence\":0.95}",
  "timestamp": "2025-01-11T12:00:01Z",
  "metadata": {
    "sessionId": "session-abc",
    "llmProvider": "anthropic",
    "llmModel": "claude-sonnet-4-5"
  }
}
```

#### PTC Planning (`stage: "ptc_planning"`)
**Trace ID Format:** `ptc-planning-{taskId}-{timestamp}`

Captures the PTC (Prompt-to-Code) planning phase where the agent generates execution code and selects skills.

**Implementation:** `notifyPTCPlanning()` in `src/core/agent/agent.ts`

**Example:**
```json
{
  "traceId": "ptc-planning-task-123-1736618402000",
  "level": "agent-internal",
  "taskId": "task-123",
  "agentId": "session-abc",
  "stage": "ptc_planning",
  "status": "completed",
  "inputData": "{\"task\":\"Create a login page\",\"agentType\":\"Agent\"}",
  "outputData": "{\"selectedSkills\":[\"frontend-design\"],\"reasoning\":\"Need to generate HTML/CSS for login page\",\"executionPlan\":\"Use frontend-design skill\",\"codeLength\":1250}",
  "timestamp": "2025-01-11T12:00:02Z",
  "metadata": {
    "sessionId": "session-abc",
    "llmProvider": "anthropic",
    "llmModel": "claude-sonnet-4-5"
  }
}
```

#### Agent LLM Reasoning (`stage: "llm_call"`)
**Trace ID Format:** `llm-agent-{taskId}-{timestamp}`

Captures LLM calls made by the agent (for intent analysis, PTC planning, etc.).

**Implementation:** `sendLLMTrace()` in `src/core/agent/llm-client.ts`

**Example:**
```json
{
  "traceId": "llm-agent-task-123-1736618401500",
  "level": "agent-internal",
  "taskId": "task-123",
  "agentId": "session-abc",
  "stage": "llm_call",
  "status": "completed",
  "executionTime": 1234,
  "timestamp": "2025-01-11T12:00:01.500Z",
  "metadata": {
    "sessionId": "session-abc",
    "llmProvider": "anthropic",
    "llmModel": "claude-sonnet-4-5",
    "llmRequest": {
      "messages": [{"role": "user", "content": "Analyze task: Create a login page"}],
      "maxTokens": 2000,
      "temperature": 0.7
    },
    "llmResponse": {
      "content": "The intent is frontend_design...",
      "promptTokens": 50,
      "completionTokens": 100,
      "totalTokens": 150
    },
    "data": {
      "totalTokens": 150
    }
  }
}
```

### Skill Internal Traces (`level: "skill-internal"`)

#### Skill LLM Reasoning (`stage: "llm_call"`)
**Trace ID Format:** `llm-skill-{skillName}-{taskId}-{timestamp}`

Captures LLM calls made during skill execution (for prompt-based skills).

**Implementation:** `_send_llm_trace()` in `src/core/skill/handlers/claude_skill_handler.py`

**Example:**
```json
{
  "traceId": "llm-skill-frontend-design-task-123-1736618403000",
  "level": "skill-internal",
  "taskId": "task-123",
  "agentId": "session-abc",
  "skillName": "frontend-design",
  "stage": "llm_call",
  "status": "completed",
  "executionTime": 3456,
  "timestamp": "2025-01-11T12:00:03Z",
  "metadata": {
    "sessionId": "session-abc",
    "llmProvider": "anthropic",
    "llmModel": "claude-3-5-sonnet-20241022",
    "llmRequest": {
      "prompt": "Create a login page with modern design...",
      "promptLength": 500
    },
    "llmResponse": {
      "content": "<!DOCTYPE html>...",
      "responseLength": 2000
    },
    "data": {
      "clientType": "anthropic_api",
      "totalTokens": 2500
    }
  }
}
```

## Implementation Notes

### Critical Components for Trace Collection

For trace collection to work properly, the following components must be configured:

1. **Streams Interface (`src/core/agent/hooks/progress-notify.ts`)**
   ```typescript
   interface Streams {
     taskExecution?: {
       set(groupId: string, entryId: string, value: any): Promise<void>;
     };
     executionTraces?: {  // ← Must be present for trace collection
       set(groupId: string, id: string, data: any): Promise<any>;
     };
   }
   ```

2. **Agent LLM Trace Configuration** (`master-agent.step.ts`)
   ```typescript
   // Must call before agent.run()
   agent.updateLLMTraceConfig(taskId);
   ```

3. **Trace API URL** (for Python handlers)
   ```bash
   # Set environment variable
   export MOTIA_TRACE_API_URL=http://localhost:3000/api/traces/submit
   ```

### Common Issues

**Issue: Traces not appearing in UI**
- **Check:** `Streams.executionTraces` is defined in `progress-notify.ts`
- **Check:** `setAgentStreams(_streams)` is called in `master-agent.step.ts`
- **Check:** `agent.updateLLMTraceConfig()` is called before `agent.run()`

**Issue: agent-internal traces missing**
- **Cause:** Traces API not handling `agent-internal` level
- **Fix:** Ensure `traces-api.step.ts` processes all trace levels

## Trace Schema Reference

### Complete Schema

```typescript
{
  // Identification
  traceId: string;              // Unique trace ID
  level: "task" | "agent" | "skill" | "agent-internal" | "skill-internal";
  taskId: string;               // Root task identifier
  agentId?: string;              // Agent/session ID (agent and skill levels)
  skillName?: string;            // Skill name (skill level only)
  parentTraceId?: string;        // Parent trace ID for hierarchical relationships

  // Execution Info
  stage: "pre" | "processing" | "post" | "intent_analysis" | "ptc_planning" | "llm_call" | "skill_generation";
  status: "started" | "running" | "completed" | "failed" | "retried";
  executionTime?: number;        // Execution time in milliseconds

  // Data
  inputData?: string;            // Input data (JSON stringified)
  outputData?: string;           // Output data (JSON stringified)
  error?: string;                // Error message
  errorStack?: string;           // Error stack trace
  retryCount?: number;           // Number of retry attempts
  maxRetries?: number;           // Maximum allowed retries

  // Timing
  timestamp: string;             // ISO 8601 timestamp
  startedAt?: string;            // Start timestamp (ISO 8601)
  completedAt?: string;          // Completion timestamp (ISO 8601)

  // Metadata
  metadata?: {
    // Counts
    llmCalls?: number;           // Number of LLM calls
    skillCalls?: number;         // Number of skill calls
    totalTokens?: number;        // Total tokens used

    // Context
    sessionId?: string;          // Session ID for multi-turn conversations

    // LLM Information (for llm_call traces)
    llmProvider?: string;        // "anthropic" | "openai-compatible" | etc.
    llmModel?: string;           // Model name

    // LLM Request Details
    llmRequest?: {
      messages?: Array<{          // Chat messages
        role: string;
        content: string;
      }>;
      maxTokens?: number;        // Max tokens for generation
      temperature?: number;      // Temperature setting
      prompt?: string;           // Raw prompt (skill level)
      promptLength?: number;     // Prompt length
    };

    // LLM Response Details
    llmResponse?: {
      content?: string;          // Response content
      responseLength?: number;   // Response length
      promptTokens?: number;     // Input tokens
      completionTokens?: number; // Output tokens
      totalTokens?: number;      // Total tokens
    };

    // Additional Data
    data?: any;                  // Any additional custom data
  };
}
```

## Implementation Components

### TypeScript Implementation

| Component | File | Purpose |
|-----------|------|---------|
| **Stream Schema** | `steps/streams/execution-traces.stream.ts` | Defines trace data structure |
| **Traces API** | `steps/api/traces-api.step.ts` | Fetches traces with hierarchy support |
| **Progress Notify Hook** | `src/core/agent/hooks/progress-notify.ts` | Streams interface with executionTraces |
| **Task Trace Hook** | `src/core/task/hooks/trace-hook.ts` | Task-level tracing |
| **Agent Trace Hook** | `src/core/agent/hooks/trace-hook.ts` | Agent-level tracing |
| **Agent Intent Analysis** | `src/core/agent/agent.ts:notifyIntentAnalysis()` | Intent analysis trace |
| **Agent PTC Planning** | `src/core/agent/agent.ts:notifyPTCPlanning()` | PTC planning trace |
| **Agent LLM Client** | `src/core/agent/llm-client.ts:sendLLMTrace()` | Agent LLM call trace |
| **Master Agent Integration** | `steps/agents/master-agent.step.ts` | Agent trace configuration |

**Important:** The `Streams` interface in `progress-notify.ts` MUST include `executionTraces`:
```typescript
interface Streams {
  taskExecution?: { set(...): Promise<void> };
  executionTraces?: { set(...): Promise<any> };  // Required for trace collection
}
```

### Python Implementation

| Component | File | Purpose |
|-----------|------|---------|
| **Skill Trace Hook** | `src/core/skill/hooks/trace_hook.py` | Skill-level tracing |
| **Skill Handler** | `src/core/skill/handlers/claude_skill_handler.py:_send_llm_trace()` | Skill LLM call trace |
| **Skill Executor** | `src/core/skill/executor.py` | Passes trace config to handlers |

## Trace Flow Example

Complete trace flow for a task "Create a login page":

```
1. TASK START (level: task, stage: pre)
   └─ traceId: task-task-123-xxx-pre

2. ACQUIRE AGENT (level: agent, stage: pre)
   └─ traceId: agent-session-abc-pre

3. INTENT ANALYSIS (level: agent-internal, stage: intent_analysis)
   ├─ LLM CALL (level: agent-internal, stage: llm_call)
   │  └─ traceId: llm-agent-task-123-xxx
   └─ traceId: intent-analysis-task-123-xxx

4. PTC PLANNING (level: agent-internal, stage: ptc_planning)
   ├─ LLM CALL (level: agent-internal, stage: llm_call)
   │  └─ traceId: llm-agent-task-123-xxx
   └─ traceId: ptc-planning-task-123-xxx

5. EXECUTE SKILL (level: skill, stage: pre)
   └─ traceId: task-123-frontend-design-skill-pre

6. SKILL LLM CALL (level: skill-internal, stage: llm_call)
   └─ traceId: llm-skill-frontend-design-task-123-xxx

7. SKILL COMPLETE (level: skill, stage: post)
   └─ traceId: task-123-frontend-design-skill-post

8. AGENT COMPLETE (level: agent, stage: post)
   └─ traceId: agent-session-abc-post

9. TASK COMPLETE (level: task, stage: post)
   └─ traceId: task-task-123-xxx-post
```

## API Endpoints

### Submit Trace
**Endpoint:** `POST /api/traces/submit`

**Request Body:** Trace object (see schema above)

**Example:**
```bash
curl -X POST http://localhost:3000/api/traces/submit \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "test-trace-123",
    "level": "task",
    "taskId": "task-123",
    "stage": "pre",
    "status": "started",
    "timestamp": "2025-01-11T12:00:00Z"
  }'
```

### Query Traces
Traces are stored in the `executionTraces` stream and can be queried via:
- **WebSocket:** Real-time stream updates
- **API:** `GET /api/tasks/:id/traces`

## Environment Variables

```bash
# Trace API URL (for Python handlers)
MOTIA_TRACE_API_URL=http://localhost:3000/api/traces/submit

# LLM Configuration (used in trace metadata)
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5
ANTHROPIC_API_KEY=your-api-key
```

## Viewing Traces

### Frontend Display
Traces are displayed in the Execution Traces panel:
- **Task Details Page** → "Execution Traces" tab
- **Inline View** → Collapsible trace sections within task details

### Trace Levels Display
- 🟦 **Task**: Top-level task execution
- 🟩 **Agent**: Agent execution and planning
- 🟨 **Skill**: Individual skill execution
- 🟪 **Agent Internal**: Intent analysis, PTC planning, LLM calls
- 🟧 **Skill Internal**: Skill-level LLM calls

### Frontend Rendering Guide

**Trace Data Structure:**
```typescript
interface Trace {
  id: string;              // Span ID (unique identifier for this trace)
  level: string;           // 'task' | 'agent' | 'skill' | 'agent-internal' | 'skill-internal'
  stage: string;           // 'pre' | 'post' | 'processing' (filtered out) | 'intent_analysis' | 'ptc_planning' | 'llm_call'
  status: string;          // 'started' | 'running' | 'completed' | 'failed'
  inputData?: string;      // JSON stringified input
  outputData?: string;     // JSON stringified output
  metadata?: {
    // LLM traces (llm_call stage)
    llmProvider?: string;
    llmModel?: string;
    llmRequest?: {         // Original LLM request (also in inputData)
      messages?: Array<{role: string; content: string}>;
      maxTokens?: number;
      temperature?: number;
      prompt?: string;
      promptLength?: number;
    };
    llmResponse?: {        // Original LLM response (also in outputData)
      content?: string;
      responseLength?: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    // Additional context
    sessionId?: string;
    data?: any;
  };
  executionTime?: number;  // Execution time in milliseconds
  timestamp: string;      // ISO 8601 timestamp
}
```

**Hierarchy Structure:**
```typescript
interface TraceHierarchy {
  task: Trace[];              // Task-level traces (pre, post)
  agents: Array<{
    agentId: string;
    traces: Trace[];           // Agent-level traces (pre, post)
    internalTraces: Trace[];    // Agent-internal traces (intent_analysis, ptc_planning, llm_call)
    skills: Array<{
      skillName: string;
      traces: Trace[];         // Skill-level traces (pre, post)
      internalTraces: Trace[];  // Skill-internal traces (llm_call)
    }>;
  }>;
}
```

**Rendering Tips:**
1. **Filter by stage**: Only show `pre` and `post` stage traces in main timeline
2. **Display metadata for LLM traces**: Show `metadata.llmRequest` and `metadata.llmResponse` with syntax highlighting
3. **Timeline view**: Sort traces by `timestamp` to show execution flow
4. **Token usage**: Display `metadata.llmResponse.totalTokens` for cost tracking

## Fix History

### 2026-02-11: Agent-Internal and Skill-Internal Trace Support

**Issues Fixed:**
1. Traces were appearing at task-level instead of proper agent/skill levels
2. LLM reasoning traces had no data (empty inputData/outputData)
3. agent-internal and skill-internal traces were missing from API response

**Root Causes:**
1. `Streams` interface in `progress-notify.ts` was missing `executionTraces` property
2. Interface method signature used incorrect arrow function syntax
3. Traces API (`traces-api.step.ts`) only handled `task`, `agent`, `skill` levels

**Changes Made:**

1. **`src/core/agent/hooks/progress-notify.ts`**
   - Added `executionTraces` to `Streams` interface
   - Fixed method signature syntax (changed from arrow function to standard method)

2. **`steps/api/traces-api.step.ts`**
   - Added handling for `agent-internal` and `skill-internal` trace levels
   - Extended hierarchy structure to include `internalTraces` array
   - Updated response structure to properly nest internal traces under their parent

**Result:**
- Traces now correctly categorized by level (task, agent, skill, agent-internal, skill-internal)
- LLM reasoning traces include full metadata (llmRequest, llmResponse, tokens)
- Agent-internal traces (intent_analysis, ptc_planning, llm_call) properly nested
- Skill-internal traces (llm_call) properly nested under skills

## Monitoring and Debugging

### Enable Trace Logging

```typescript
// Agent traces
console.log('[AgentTraceHook] Trace sent:', traceData);

// Skill traces (Python)
print("[SkillTraceHook] ✓ Trace sent: {traceId}");
```

### Common Issues

**Issue:** Traces not appearing in UI
- **Check:** `Streams.executionTraces` is defined in `progress-notify.ts`
- **Check:** `setAgentStreams(_streams)` is called in `master-agent.step.ts`
- **Check:** `agent.updateLLMTraceConfig()` is called before `agent.run()`

**Issue:** agent-internal traces appearing under Task level
- **Cause:** Fixed - agent-internal traces are now properly nested under `agents[].internalTraces`
- **Note:** `processing` stage traces are filtered out (they are progress updates, not actual traces)

**Issue:** LLM reasoning traces have no inputData/outputData
- **Cause:** Data is in metadata.llmRequest and metadata.llmResponse
- **Fix:** API now extracts these to inputData/outputData automatically
- **Note:** Original metadata is still preserved for additional context

**Issue:** Duplicate traceId field
- **Cause:** Both `id` and `traceId` fields exist with same value
- **Fix:** API response now only includes `id` field (span ID)
- **Note:** Stream schema still uses `traceId` for internal consistency

**Issue:** Missing LLM token counts
- **Check:** LLM provider response format
- **Verify:** Usage data is extracted correctly
- **Note:** Some providers may not return token counts

**Issue:** Duplicate traces
- **Cause:** Multiple hook registrations
- **Fix:** Check hook manager initialization

## Performance Considerations

### Trace Overhead
- **Network:** Each trace adds ~5-10ms (HTTP call)
- **Storage:** Traces are stored in memory streams
- **UI:** Real-time updates via WebSocket

### Optimization Tips
1. **Batching:** Consider batching multiple traces (future enhancement)
2. **Filtering:** Only send traces for specific levels/stages
3. **Sampling:** Sample traces in high-traffic scenarios

## Future Enhancements

1. **Trace Visualization:** Timeline view of execution flow
2. **Trace Comparison:** Compare traces across multiple runs
3. **Anomaly Detection:** Alert on unusual execution patterns
4. **Trace Export:** Export traces for analysis
5. **Cost Analysis:** Calculate LLM costs from token usage
6. **Performance Profiling:** Identify bottlenecks from execution times

## Related Documentation

- [Streams Documentation](./streams.md)
- [Hooks Documentation](./hooks.md)
- [Agent Architecture](./agent-architecture.md)
- [Skill System](./skill-system.md)
