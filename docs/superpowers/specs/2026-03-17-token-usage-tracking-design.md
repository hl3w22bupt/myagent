# Token Usage Tracking & Dashboard Design

**Date:** 2026-03-17
**Status:** Design Approved
**Branch:** `feature/token-usage-tracking`

---

## Overview

Build a comprehensive token usage tracking and analytics system for the MyAgent platform. The system tracks LLM token consumption across all tasks, provides real-time task-level statistics, and offers a dashboard for overall usage insights.

**Key Goals:**
- Track token usage for all LLM calls (TypeScript Agent + Python Skills)
- Real-time task-level token statistics
- Aggregated analytics by model, skill, and time
- Extensible storage abstraction for future data lake migration

---

## Architecture

### System Design

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LLM Call Occurs                               │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │  TS LLM Client  │    │  Python Skills  │                         │
│  └────────┬────────┘    └────────┬────────┘                         │
│           │                      │                                   │
│           └──────────┬───────────┘                                   │
│                      ▼                                               │
│              executionTraces.set()                                   │
│              (token data in metadata.llmResponse)                    │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Event Step: TokenUsageExtractor     │
          │  Listens: execution_trace_created    │
          │  Filters: level contains 'internal'  │
          │  Extracts: metadata.llmResponse      │
          │  Emits: 'token_usage_recorded'       │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Event Step: TokenUsageWriter        │
          │  Listens: token_usage_recorded       │
          │  Writes: token_usage_by_task (real-time)│
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Cron Step: TokenUsageAggregator     │
          │  Schedule: Every hour               │
          │  Aggregates: model, skill, trends    │
          │  Writes: token_usage_* stats tables  │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │     Storage Abstraction Layer        │
          │  - PostgresTokenUsageStorage         │
          │  - Ready for data lake migration     │
          └──────────────────────────────────────┘
```

### Key Design Decisions

**1. Event-Driven Architecture (Stream Processing)**
- Real-time token tracking via Event Steps
- Language-agnostic (works for TS and Python LLM calls)
- Decoupled from LLM Client implementation

**2. Storage Abstraction**
- Interface-based design for easy migration
- Current: PostgreSQL
- Future: Data lake (Snowflake, Databricks, ClickHouse)

**3. No Cost Calculation**
- Track raw token counts only
- Cost estimation deferred to future iteration

---

## Database Schema

### Real-time Tables (Event Step Writes)

```sql
-- Task-level token usage (real-time updates)
CREATE TABLE token_usage_by_task (
  task_id VARCHAR PRIMARY KEY,
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  first_call_at TIMESTAMP,
  last_call_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_token_task_updated ON token_usage_by_task(updated_at DESC);
```

### Aggregated Tables (Cron Step Writes)

```sql
-- Aggregated by model (hourly)
CREATE TABLE token_usage_by_model (
  id SERIAL PRIMARY KEY,
  model VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model, date, hour)
);

-- Aggregated by skill (hourly)
CREATE TABLE token_usage_by_skill (
  id SERIAL PRIMARY KEY,
  skill_name VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(skill_name, date, hour)
);

-- Indexes for query performance
CREATE INDEX idx_token_model_date ON token_usage_by_model(date DESC, hour DESC);
CREATE INDEX idx_token_skill_date ON token_usage_by_skill(date DESC, hour DESC);
```

---

## Components

### 1. Storage Layer

**Interface:** `TokenUsageStorage`
```typescript
interface TokenUsageStorage {
  // Real-time task-level updates
  saveTaskUsage(data: TaskTokenUsage): Promise<void>;

  // Aggregated queries
  getTaskUsage(taskId: string): Promise<TaskTokenUsage | null>;
  getAggregateByModel(timeRange: TimeRange): Promise<ModelUsage[]>;
  getAggregateBySkill(timeRange: TimeRange): Promise<SkillUsage[]>;
  getTotalUsage(timeRange: TimeRange): Promise<TotalUsage>;
  getUsageTrends(timeRange: TimeRange): Promise<UsageTrend[]>;
}
```

**Implementation:** `PostgresTokenUsageStorage`

### 2. Event Steps

**TokenUsageExtractor**
```typescript
export const tokenUsageExtractor = createEventStep({
  type: 'execution_trace_created',
  handler: async (event, { logger, emit }) => {
    // Filter: Only LLM calls
    if (!event.trace.level?.includes('internal')) return;

    // Extract token data from trace
    const llmResponse = event.trace.metadata?.llmResponse;
    if (!llmResponse || !llmResponse.totalTokens) return;

    // Emit token usage event
    await emit('token_usage_recorded', {
      taskId: event.trace.taskId,
      agentId: event.trace.agentId,
      skillName: event.trace.skillName,
      model: event.trace.metadata?.llmModel,
      provider: event.trace.metadata?.llmProvider,
      promptTokens: llmResponse.promptTokens || 0,
      completionTokens: llmResponse.completionTokens || 0,
      totalTokens: llmResponse.totalTokens,
      timestamp: event.trace.timestamp,
    });
  }
});
```

**TokenUsageWriter**
```typescript
export const tokenUsageWriter = createEventStep({
  type: 'token_usage_recorded',
  handler: async (event, { logger, state }) => {
    await state.tokenUsage.saveTaskUsage({
      taskId: event.taskId,
      promptTokens: event.promptTokens,
      completionTokens: event.completionTokens,
      totalTokens: event.totalTokens,
      llmCallsCount: 1,
      timestamp: event.timestamp,
    });
  }
});
```

### 3. Cron Step

**TokenUsageAggregator**
```typescript
export const tokenUsageAggregator = createCronStep({
  cron: '0 * * * *',  // Every hour
  handler: async (_, { logger, state }) => {
    const lastHour = new Date(Date.now() - 3600000);

    // Aggregate from execution traces
    await state.tokenUsage.aggregateByModel(lastHour);
    await state.tokenUsage.aggregateBySkill(lastHour);
  }
});
```

---

## API Design

### Task Token Usage
```
GET /api/tasks/:taskId/token-usage

Response:
{
  "totalTokens": 12345,
  "promptTokens": 8000,
  "completionTokens": 4345,
  "llmCallsCount": 15,
  "timeline": [
    { "timestamp": "2026-03-17T10:00:00Z", "totalTokens": 1234, "model": "claude-sonnet-4-5" }
  ],
  "bySkill": [
    { "skillName": "code-analysis", "totalTokens": 8000, "calls": 10 }
  ],
  "byModel": [
    { "model": "claude-sonnet-4-5", "totalTokens": 12345, "calls": 15 }
  ]
}
```

### Global Summary
```
GET /api/token-usage/summary?timeRange=24h

Response:
{
  "totalTokens": 1234567,
  "promptTokens": 800000,
  "completionTokens": 434567
}
```

### Usage Trends
```
GET /api/token-usage/trends?timeRange=7d

Response:
{
  "timeline": [
    { "timestamp": "2026-03-17T10:00:00Z", "totalTokens": 12345 }
  ]
}
```

---

## Frontend Design

### 1. New Navigation Menu Item
```jsx
{
  path: '/analytics',
  label: '用量分析',
  icon: <ChartIcon />
}
```

### 2. Task Detail Page - New Token Tab
```jsx
<Tabs>
  <Tab label="详情">...</Tab>
  <Tab label="PTC">...</Tab>
  <Tab label="Traces">...</Tab>
  <Tab label="Artifacts">...</Tab>
  <Tab label="Sandbox Logs">...</Tab>
  <Tab label="Token Usage">
    <TokenUsageTab taskId={taskId} />
  </Tab>
</Tabs>
```

**TokenUsageTab Content:**
- Total token count (Prompt + Completion)
- LLM call count
- Average tokens per call
- Token usage timeline
- Detailed LLM call list (time, model, skill, tokens)
- Grouped by skill
- Grouped by model
- Token usage trend chart

### 3. New Analytics Page (Simple Dashboard)
```jsx
function Analytics() {
  return (
    <div className="analytics">
      <h1>Token Usage Analytics</h1>
      <TimeRangeFilter
        options={['1h', '24h', '7d', '30d', 'custom']}
      />
      <TotalTokenUsage value={1234567} />
      <Breakdown
        prompt={800000}
        completion={434567}
      />
    </div>
  );
}
```

---

## File Structure

```
myagent/
├── src/
│   └── steps/
│       ├── token-usage/
│       │   ├── token-usage-extractor.step.ts
│       │   ├── token-usage-writer.step.ts
│       │   └── token-usage-aggregator.step.ts
│       └── token-usage/
│           ├── storage/
│           │   ├── token-storage.interface.ts
│           │   └── postgres-token-storage.ts
│           └── types.ts
├── motia-frontend/
│   └── src/
│       ├── pages/
│       │   └── Analytics.jsx
│       ├── components/
│       │   └── TokenUsageTab.jsx
│       └── services/
│           └── api.js (extended)
└── scripts/
    └── init-token-tables.ts
```

---

## Implementation Phases

### Phase 1: Backend Foundation
1. Create storage abstraction layer
2. Implement PostgresTokenUsageStorage
3. Create TokenUsageExtractor Event Step
4. Create TokenUsageWriter Event Step
5. Create TokenUsageAggregator Cron Step
6. Initialize database tables

### Phase 2: API Layer
7. Extend task API with token usage endpoint
8. Add analytics API endpoints
9. Implement time range filtering

### Phase 3: Frontend Implementation
10. Create Analytics page (simple dashboard)
11. Create TokenUsageTab component
12. Integrate TokenUsageTab into task detail page
13. Add navigation menu item
14. Implement time range filter
15. Add token usage trend chart

---

## Data Retention

**Current:** Retain all historical records
**Future:** Consider data archiving for very old records

---

## Future Enhancements

1. **Cost Calculation** - Multiply by provider pricing
2. **Export Functionality** - CSV/JSON export
3. **Comparison Features** - Compare tasks
4. **Anomaly Detection** - Detect unusual usage spikes
5. **Data Lake Migration** - Migrate to specialized analytics DB

---

## Testing Strategy

- Unit tests for storage layer
- Integration tests for Event/Cron Steps
- E2E tests for API endpoints
- Frontend component tests

---

## Dependencies

- **Motia:** Event Steps, Cron Steps, State Management
- **PostgreSQL:** Primary storage
- **Frontend:** React, Recharts (for charts)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| High volume of LLM calls affecting performance | Use async Event Steps, optimize DB indexes |
| Trace data structure changes | Version the extraction logic |
| Storage costs grow over time | Plan data archiving strategy |

---

## Glossary

- **Token Usage:** Number of tokens consumed by LLM calls
- **Prompt Tokens:** Input tokens sent to LLM
- **Completion Tokens:** Output tokens received from LLM
- **Total Tokens:** Sum of prompt and completion tokens
- **Event Step:** Motia step that reacts to events
- **Cron Step:** Motia step that runs on schedule
- **Stream Processing:** Real-time data processing
- **Batch Processing:** Periodic data aggregation
