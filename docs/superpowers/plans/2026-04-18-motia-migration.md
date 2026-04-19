# Motia 0.17.x → 1.0.x Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 73 step files from Motia 0.17.11-beta API to Motia 1.0.x-rc API, achieving feature parity.

**Architecture:** Replace all `ApiRouteConfig`/`EventConfig`/`CronConfig` with unified `StepConfig` + `triggers` pattern. Convert `emit()` to `enqueue()`. Convert `streams.xxx` context injection to direct `Stream` class imports. Convert `state` context injection to `stateManager` import.

**Tech Stack:** Motia 1.0.4-rc.1, iii-sdk 0.11.0, TypeScript, config.yaml

**Reference:** `/Users/leo/workspace/myrd` — working Motia 1.0.x project for comparison.

---

## Key Migration Patterns Reference

These patterns apply across ALL tasks. Refer back to this section when implementing.

### Pattern A: API Step Config (most common — 52 files)

```typescript
// BEFORE (0.17.x)
import { ApiRouteConfig } from 'motia';
export const config: ApiRouteConfig = {
  type: 'api', name: 'xxx', path: '/api/xxx', method: 'GET',
  emits: [], virtualSubscribes: [], flows: ['xxx'],
};
export const handler = async (request: any, { logger, streams, emit, state }: any) => {
  const q = request.queryParams;
  const b = request.body;
  return { status: 200, body: {} };
};

// AFTER (1.0.x)
import { type Handlers, type StepConfig, logger } from 'motia';
export const config = {
  name: 'xxx',
  description: 'Description of this endpoint',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/xxx' }],
  enqueues: [] as const,
} as const satisfies StepConfig;
export const handler: Handlers<typeof config> = async (context) => {
  const q = context.query;
  const b = context.body;
  return { status: 200, body: {} };
};
```

Key changes:
- Remove `type: 'api'`, `virtualSubscribes`, `flows`
- `path` + `method` → inside `triggers[0]`
- `emits` → `enqueues`
- `ApiRouteConfig` → `satisfies StepConfig`
- `handler(request, { logger })` → `handler: Handlers<typeof config> = async (context)`
- `request.queryParams` → `context.query`
- `request.body` → `context.body`
- `request.params` → `context.params` (for route params)
- `logger` from import, not from context

### Pattern B: Event Step Config (7 files)

```typescript
// BEFORE (0.17.x)
import type { EventConfig } from 'motia';
export const config: EventConfig = {
  type: 'event', name: 'xxx',
  subscribes: ['topic.name'],
  emits: ['output.topic'],
};
export const handler = async (input: any, { emit, logger, streams }: any) => {
  await emit({ topic: 'output.topic', data: {} });
};

// AFTER (1.0.x)
import { type Handlers, type StepConfig, logger, enqueue, queue } from 'motia';
export const config = {
  name: 'xxx',
  description: 'Description',
  triggers: [queue('topic.name')],
  enqueues: ['output.topic'] as const,
} as const satisfies StepConfig;
export const handler: Handlers<typeof config> = async (input) => {
  await enqueue({ topic: 'output.topic', data: {} });
};
```

Key changes:
- `type: 'event'` + `subscribes` → `triggers: [queue('topic')]`
- `emit({ topic, data })` → `enqueue({ topic, data })`
- `emit`/`logger` from import, not from context

### Pattern C: Cron Step Config (3 files)

```typescript
// BEFORE (0.17.x)
import type { CronConfig } from 'motia';
export const config: CronConfig = {
  type: 'cron', name: 'xxx',
  cron: '0 21 * * *',       // 5-field
  emits: ['topic.name'],
};

// AFTER (1.0.x)
import { type Handlers, type StepConfig, logger, enqueue, cron } from 'motia';
export const config = {
  name: 'xxx',
  description: 'Description',
  triggers: [cron('0 0 21 * * * *')],  // 7-field (prefix "0 0 ")
  enqueues: ['topic.name'] as const,
} as const satisfies StepConfig;
export const handler: Handlers<typeof config> = async (_) => { ... };
```

### Pattern D: Stream Config (3 files)

```typescript
// BEFORE (0.17.x)
import { StreamConfig } from 'motia';
export const config: StreamConfig = {
  name: 'taskExecution', schema: taskExecutionSchema as any,
  baseConfig: { storageType: 'default' },
};

// AFTER (1.0.x)
import { Stream, type StreamConfig } from 'motia';
export const config: StreamConfig = {
  name: 'taskExecution', schema: taskExecutionSchema as any,
  baseConfig: { storageType: 'default' },
};
// Export a Stream instance for direct import by step handlers
export const taskExecutionStream = new Stream(config);
```

### Pattern E: Using Streams in Step Handlers

```typescript
// BEFORE (0.17.x) — streams injected via context
export const handler = async (request: any, { streams }: any) => {
  await streams.taskExecution.set(groupId, itemId, data);
  const items = await streams.taskExecution.getGroup(groupId);
};

// AFTER (1.0.x) — import Stream instance directly
import { taskExecutionStream } from '../streams/task-execution.stream';
export const handler: Handlers<typeof config> = async (context) => {
  await taskExecutionStream.set(groupId, itemId, data);
  const items = await taskExecutionStream.list(groupId);  // getGroup → list
};
```

Key changes:
- `streams.xxx.set()` → `importedStream.set()`
- `streams.xxx.getGroup()` → `importedStream.list()`
- `streams.xxx.get()` → `importedStream.get()`

### Pattern F: State Access

```typescript
// BEFORE (0.17.x) — state injected via context
export const handler = async (request: any, { state }: any) => {
  const val = await state.get('scope', 'key');
};

// AFTER (1.0.x) — import stateManager
import { stateManager } from 'motia';
export const handler: Handlers<typeof config> = async (context) => {
  const val = await stateManager.get('scope', 'key');
};
```

---

## File Structure Map

```
Files created:
  config.yaml                                    — iii engine configuration

Files modified:
  package.json                                   — dependency changes
  motia.config.ts                                — simplified config
  steps/streams/task-execution.stream.ts         — add Stream instance export
  steps/streams/task-result.stream.ts            — add Stream instance export
  steps/streams/execution-traces.stream.ts       — add Stream instance export
  steps/health/health-check.step.ts              — Pattern A + F
  steps/api/*.step.ts (52 files)                  — Pattern A (most), A+E (some), A+B (few)
  steps/agents/agent-api.step.ts                 — Pattern A + B (has emit)
  steps/agents/master-agent.step.ts              — Pattern B + E (complex)
  steps/agents/task-result-handler.step.ts       — Pattern B + E (has streams)
  steps/agents/failure-handler.step.ts           — Pattern B
  steps/agents/agent-result-retry.step.ts        — Pattern B
  steps/agents/agent-result.step.ts              — Pattern A
  steps/agents/agent-results.step.ts             — Pattern A
  steps/agents/agent-tasks-delete.step.ts        — Pattern A + B
  steps/agents/soul-agent-executor.step.ts       — Pattern B
  steps/streams/notify-api.step.ts               — Pattern A + E
  steps/streams/output-history-tracker.step.ts   — Pattern B
  steps/cron/user-profile-analysis.step.ts       — Pattern C + B
  steps/cron/soul-periodic-check.step.ts         — Pattern C + B
  steps/cleanup/soul-cleanup-cron.step.ts        — Pattern C
  steps/token-usage/token-usage-extractor.step.ts — Pattern B
  steps/token-usage/token-usage-writer.step.ts   — Pattern B
  steps/web/media-serve.step.ts                  — Pattern A
```

---

## Task 1: Update Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove old Motia packages and install new ones**

```bash
npm remove @motiadev/core @motiadev/adapter-bullmq-events @motiadev/plugin-bullmq @motiadev/plugin-endpoint @motiadev/plugin-logs @motiadev/plugin-observability @motiadev/plugin-states
npm install motia@^1.0.4-rc.1 iii-sdk@latest
npm install -D esbuild
```

- [ ] **Step 2: Verify installation**

Run: `npm ls motia iii-sdk`
Expected: Shows `motia@1.0.x-rc.x` and `iii-sdk@0.x.x` without errors

- [ ] **Step 3: Update npm scripts in package.json**

Change `postinstall` script from `motia install && npm run precompile:knowledge` to `npm run precompile:knowledge` (remove `motia install` if it no longer exists in 1.0.x — verify first). Keep other scripts as-is for now; they'll be updated in later tasks.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: update motia to 1.0.x-rc and add iii-sdk dependency"
```

---

## Task 2: Create config.yaml and Simplify motia.config.ts

**Files:**
- Create: `config.yaml`
- Modify: `motia.config.ts`

- [ ] **Step 1: Create config.yaml based on myrd**

Copy the structure from `/Users/leo/workspace/myrd/config.yaml`, adjusting:
- Port: keep or adjust `III_PORT` default
- Stream module: file-based adapter with path `./data/streams_store`
- State module: file-based adapter with path `./data/state_store.db`
- REST API module: keep port and CORS settings
- Queue module: builtin adapter
- Cron module: KvCronAdapter
- Observability module: keep settings
- Remove the ExecModule (we use `motia dev` / `motia start`)

```yaml
port: ${III_PORT:49234}
modules:
  - class: modules::stream::StreamModule
    config:
      port: ${STREAMS_PORT:3012}
      host: 127.0.0.1
      adapter:
        class: modules::stream::adapters::KvStore
        config:
          store_method: file_based
          file_path: ./data/streams_store

  - class: modules::state::StateModule
    config:
      adapter:
        class: modules::state::adapters::KvStore
        config:
          store_method: file_based
          file_path: ./data/state_store.db

  - class: modules::api::RestApiModule
    config:
      port: 4111
      host: 127.0.0.1
      default_timeout: 30000
      concurrency_request_limit: 1024
      cors:
        allowed_origins:
          - "*"
        allowed_methods:
          - GET
          - POST
          - PUT
          - DELETE
          - OPTIONS

  - class: modules::observability::OtelModule
    config:
      enabled: ${OTEL_ENABLED:false}
      service_name: ${OTEL_SERVICE_NAME:myagent-engine}
      service_version: ${SERVICE_VERSION:1.0.0}
      service_namespace: ${SERVICE_NAMESPACE:production}
      exporter: ${OTEL_EXPORTER_TYPE:memory}
      endpoint: ${OTEL_EXPORTER_OTLP_ENDPOINT:http://localhost:4317}
      sampling_ratio: 1.0
      memory_max_spans: ${OTEL_MEMORY_MAX_SPANS:10000}
      metrics_enabled: true
      metrics_exporter: ${OTEL_METRICS_EXPORTER:memory}
      metrics_retention_seconds: 3600
      metrics_max_count: 10000
      logs_enabled: ${OTEL_LOGS_ENABLED:true}
      logs_exporter: ${OTEL_LOGS_EXPORTER:memory}
      logs_max_count: ${OTEL_LOGS_MAX_COUNT:1000}
      logs_retention_seconds: ${OTEL_LOGS_RETENTION_SECONDS:3600}
      logs_sampling_ratio: ${OTEL_LOGS_SAMPLING_RATIO:1.0}

  - class: modules::queue::QueueModule
    config:
      adapter:
        class: modules::queue::BuiltinQueueAdapter

  - class: modules::pubsub::PubSubModule
    config:
      adapter:
        class: modules::pubsub::LocalAdapter

  - class: modules::cron::CronModule
    config:
      adapter:
        class: modules::cron::KvCronAdapter
```

- [ ] **Step 2: Simplify motia.config.ts**

Replace the entire file:

```typescript
import { defineConfig } from 'motia';

export default defineConfig({});
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc motia.config.ts --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing errors in other files)

- [ ] **Step 4: Commit**

```bash
git add config.yaml motia.config.ts
git commit -m "chore: add config.yaml for iii engine and simplify motia.config.ts"
```

---

## Task 3: Migrate Stream Configs (3 files)

**Files:**
- Modify: `steps/streams/task-execution.stream.ts`
- Modify: `steps/streams/task-result.stream.ts`
- Modify: `steps/streams/execution-traces.stream.ts`

- [ ] **Step 1: Migrate task-execution.stream.ts**

Change the import and add a Stream instance export:

```typescript
// Replace: import { StreamConfig } from 'motia';
// With:
import { Stream, type StreamConfig } from 'motia';

// Keep the existing config as-is (StreamConfig type is compatible)
// Add at the bottom of the file:
export const taskExecutionStream = new Stream(config);
```

- [ ] **Step 2: Migrate task-result.stream.ts**

Read the file first, then apply the same pattern:
- Change import to `import { Stream, type StreamConfig } from 'motia';`
- Add `export const taskResultStream = new Stream(config);` at bottom

- [ ] **Step 3: Migrate execution-traces.stream.ts**

Read the file first, then:
- Change import to `import { Stream, type StreamConfig } from 'motia';`
- Add `export const executionTracesStream = new Stream(config);` at bottom

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc steps/streams/*.stream.ts --noEmit --skipLibCheck 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add steps/streams/
git commit -m "refactor: migrate stream configs to Motia 1.0.x Stream class"
```

---

## Task 4: Migrate Health Check Step (First Validation)

**Files:**
- Modify: `steps/health/health-check.step.ts`

This is the first step to validate the migration works end-to-end. It uses Pattern A + Pattern F (state access).

- [ ] **Step 1: Rewrite health-check.step.ts**

Replace the file content with:

```typescript
/**
 * Health Check API Step.
 *
 * Provides system health status and metrics.
 */

import { z } from 'zod';
import { type Handlers, type StepConfig, logger, stateManager } from 'motia';

/**
 * Response schema for health check.
 */
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  services: z.object({
    api: z.boolean(),
    agent: z.boolean(),
    sandbox: z.boolean(),
    llm: z.boolean(),
  }),
  metrics: z
    .object({
      totalTasks: z.number(),
      successfulTasks: z.number(),
      failedTasks: z.number(),
      averageExecutionTime: z.number(),
    })
    .optional(),
});
void healthResponseSchema;

export const config = {
  name: 'health-check',
  description: 'Health check and system status endpoint',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/health' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (context) => {
  const _startTime = Date.now();
  void _startTime;

  try {
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();
    const version = '1.0.0';

    const services = {
      api: true,
      agent: true,
      sandbox: true,
      llm: (process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY) ? true : false,
    };

    let metrics;
    try {
      const history: any[] = await stateManager.list('agent:execution') || [];

      const successfulTasks = history.filter((entry: any) => entry.success).length;
      const failedTasks = history.filter((entry: any) => !entry.success).length;

      const execTimes = history
        .filter((entry: any) => entry.metadata?.executionTime)
        .map((entry: any) => entry.metadata.executionTime);

      const averageExecutionTime =
        execTimes.length > 0
          ? execTimes.reduce((a: number, b: number) => a + b, 0) / execTimes.length
          : 0;

      metrics = {
        totalTasks: history.length,
        successfulTasks,
        failedTasks,
        averageExecutionTime: Math.round(averageExecutionTime),
      };
    } catch {
      metrics = {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageExecutionTime: 0,
      };
    }

    const allServicesHealthy = Object.values(services).every((v) => v === true);
    const status = allServicesHealthy ? 'healthy' : services.api ? 'degraded' : 'unhealthy';

    logger.info('Health check performed', {
      status,
      uptime: Math.round(uptime),
      services,
    });

    return {
      status: status === 'healthy' ? 200 : 503,
      body: {
        status,
        version,
        uptime: Math.round(uptime),
        timestamp,
        services,
        metrics,
      },
    };
  } catch (error: any) {
    logger.error('Health check failed', {
      error: error.message,
    });

    return {
      status: 503,
      body: {
        status: 'unhealthy',
        version: '1.0.0',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {
          api: false,
          agent: false,
          sandbox: false,
          llm: false,
        },
      },
    };
  }
};
```

Changes from original:
- `import { ApiRouteConfig } from 'motia'` → `import { type Handlers, type StepConfig, logger, stateManager } from 'motia'`
- Config: `ApiRouteConfig` → `satisfies StepConfig` with `triggers`
- Handler: `(request: any, { logger, state }: any)` → `Handlers<typeof config>` with `(context)`
- `state.get('agent:execution', 'history')` → `stateManager.list('agent:execution')` (state API change: no longer nested key, just scope)
- `logger` from import, not from context

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit 2>&1 | grep "health-check"`
Expected: No errors for health-check.step.ts

- [ ] **Step 3: Commit**

```bash
git add steps/health/health-check.step.ts
git commit -m "refactor: migrate health-check step to Motia 1.0.x API"
```

---

## Task 5: Migrate Simple API Steps (No streams, no emit) — Batch 1

**Files (24 files with `emits: []` and no streams/emit usage):**
- `steps/api/skills-api.step.ts`
- `steps/api/skill-details-api.step.ts`
- `steps/api/context-api.step.ts`
- `steps/api/context-outputs-api.step.ts`
- `steps/api/context-compression-api.step.ts`
- `steps/api/context-failure-experience-api.step.ts`
- `steps/api/context-artifacts-api.step.ts`
- `steps/api/context-skill-execution-api.step.ts`
- `steps/api/context-tool-usage-api.step.ts`
- `steps/api/get-session.step.ts`
- `steps/api/get-user-sessions.step.ts`
- `steps/api/get-user.step.ts`
- `steps/api/system-api.step.ts`
- `steps/api/favorites-api.step.ts`
- `steps/api/favorites-add-api.step.ts`
- `steps/api/favorites-remove-api.step.ts`
- `steps/api/knowledge-collections-api.step.ts`
- `steps/api/knowledge-table-schema-api.step.ts`
- `steps/api/apps-list-api.step.ts`
- `steps/api/app-knowledge-collections-api.step.ts`
- `steps/api/app-knowledge-collections-add-api.step.ts`
- `steps/api/app-knowledge-collections-batch-api.step.ts`
- `steps/api/app-knowledge-collections-remove-api.step.ts`
- `steps/api/app-knowledge-collections-update-api.step.ts`

- [ ] **Step 1: Apply Pattern A transformation to each file**

For each file, apply these mechanical changes:

1. Replace `import { ApiRouteConfig } from 'motia';` with `import { type Handlers, type StepConfig, logger } from 'motia';`
2. Replace config format:
   - Remove `type: 'api'`, `virtualSubscribes`, `flows`
   - Move `path` + `method` into `triggers: [{ type: 'http', method: '...', path: '...' }]`
   - `emits: []` → `enqueues: [] as const`
   - Add `as const satisfies StepConfig`
3. Replace handler signature:
   - `export const handler = async (request: any, { logger }: any)` → `export const handler: Handlers<typeof config> = async (context)`
4. Replace request property access:
   - `request.queryParams` → `context.query`
   - `request.body` → `context.body`
   - `request.params` → `context.params`
5. `logger` is now imported from 'motia', not from context. Remove `logger` from destructured context params. If the handler doesn't use logger, still import it but don't use it.

**Example transformation (skills-api.step.ts):**

```typescript
import { z } from 'zod';
import { type Handlers, type StepConfig, logger } from 'motia';
import {
  loadAllSkills,
  filterByTags,
  filterBySource,
  UnifiedSkillMetadata
} from '../../src/core/skill/skill-loader';

export const querySchema = z.object({
  tags: z.string().optional().describe('Comma-separated tags to filter skills'),
  source: z.enum(['native', 'claude', 'openclaw']).optional().describe('Filter by skill source'),
});

export const config = {
  name: 'skills-api',
  description: 'API endpoint for querying available skills',
  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/skills' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (context) => {
  logger.info('Skills API: Received request');

  try {
    const queryParams: Record<string, any> = context.query || {};
    const validationResult = querySchema.safeParse(queryParams);

    if (!validationResult.success) {
      throw new Error(`Invalid query parameters: ${validationResult.error.message}`);
    }

    const { tags, source } = validationResult.data as any;

    let skills: UnifiedSkillMetadata[] = loadAllSkills();

    if (source) {
      skills = filterBySource(skills, source);
    }

    if (tags) {
      skills = filterByTags(skills, tags);
    }

    const nativeCount = skills.filter((s) => s.source === 'native').length;
    const claudeCount = skills.filter((s) => s.source === 'claude').length;
    const openclawCount = skills.filter((s) => s.source === 'openclaw').length;

    return {
      status: 200,
      body: {
        success: true,
        count: skills.length,
        nativeCount,
        claudeCount,
        openclawCount,
        skills,
      },
    };
  } catch (error: any) {
    logger.error('Skills API: Error', { error: error.message });

    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to retrieve skills',
        error: error.message,
      },
    };
  }
};
```

- [ ] **Step 2: Verify TypeScript for all modified files**

Run: `npx tsc --noEmit 2>&1 | grep "steps/api/" | head -20`
Expected: No errors for the migrated files

- [ ] **Step 3: Commit**

```bash
git add steps/api/skills-api.step.ts steps/api/skill-details-api.step.ts steps/api/context-api.step.ts steps/api/context-outputs-api.step.ts steps/api/context-compression-api.step.ts steps/api/context-failure-experience-api.step.ts steps/api/context-artifacts-api.step.ts steps/api/context-skill-execution-api.step.ts steps/api/context-tool-usage-api.step.ts steps/api/get-session.step.ts steps/api/get-user-sessions.step.ts steps/api/get-user.step.ts steps/api/system-api.step.ts steps/api/favorites-api.step.ts steps/api/favorites-add-api.step.ts steps/api/favorites-remove-api.step.ts steps/api/knowledge-collections-api.step.ts steps/api/knowledge-table-schema-api.step.ts steps/api/apps-list-api.step.ts steps/api/app-knowledge-collections-api.step.ts steps/api/app-knowledge-collections-add-api.step.ts steps/api/app-knowledge-collections-batch-api.step.ts steps/api/app-knowledge-collections-remove-api.step.ts steps/api/app-knowledge-collections-update-api.step.ts
git commit -m "refactor: migrate 24 simple API steps to Motia 1.0.x (Pattern A)"
```

---

## Task 6: Migrate Knowledge Datasource API Steps — Batch 2

**Files (7 files):**
- `steps/api/knowledge-datasources-add-api.step.ts`
- `steps/api/knowledge-datasources-delete-api.step.ts`
- `steps/api/knowledge-datasources-discover-api.step.ts`
- `steps/api/knowledge-datasources-list-api.step.ts`
- `steps/api/knowledge-datasources-test-api.step.ts`
- `steps/api/knowledge-datasources-update-apps-api.step.ts`

These follow Pattern A but may have additional complexity. Read each file first to verify.

- [ ] **Step 1: Apply Pattern A transformation to each file**

Same transformation as Task 5. Read each file first to check for special cases.

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "datasource" | head -10`

- [ ] **Step 3: Commit**

```bash
git add steps/api/knowledge-datasources-*.step.ts
git commit -m "refactor: migrate knowledge datasource API steps to Motia 1.0.x"
```

---

## Task 7: Migrate API Steps with Streams — Batch 3

**Files (files using `streams.xxx` in handler):**
- `steps/api/stream-history-api.step.ts`
- `steps/api/traces-api.step.ts`
- `steps/api/traces-submit-api.step.ts`
- `steps/api/task-token-usage-api.step.ts`
- `steps/api/task-chat-api.step.ts`
- `steps/api/soul-initialize-api.step.ts`
- `steps/streams/notify-api.step.ts`

These follow Pattern A + Pattern E (stream access). Key differences:
1. Import the stream instance from the `.stream.ts` file
2. Replace `streams.xxx.set()` → `importedStream.set()`
3. Replace `streams.xxx.getGroup()` → `importedStream.list()`
4. Replace `streams.xxx.get()` → `importedStream.get()`

- [ ] **Step 1: Migrate stream-history-api.step.ts**

Read the file, then apply Pattern A + E:
- Import `taskExecutionStream` from `../streams/task-execution.stream`
- Replace `streams.taskExecution.getGroup(taskId)` → `taskExecutionStream.list(taskId)`
- Convert handler signature

- [ ] **Step 2: Migrate traces-api.step.ts**

Read the file, then:
- Import `executionTracesStream` from `../streams/execution-traces.stream`
- Replace `streams.executionTraces.getGroup(taskId)` → `executionTracesStream.list(taskId)`

- [ ] **Step 3: Migrate traces-submit-api.step.ts**

Read the file, then:
- Import `executionTracesStream`
- Replace `streams.executionTraces.set(...)` → `executionTracesStream.set(...)`

- [ ] **Step 4: Migrate task-token-usage-api.step.ts**

Read the file, then:
- Import `executionTracesStream`
- Replace `streams.executionTraces.getGroup(taskId)` → `executionTracesStream.list(taskId)`

- [ ] **Step 5: Migrate task-chat-api.step.ts**

This is a complex file. Read it fully, then:
- Import `taskExecutionStream`
- Replace all `streams.taskExecution.set()` → `taskExecutionStream.set()`
- Replace all `streams.taskExecution` null checks appropriately
- Also convert `emit()` → `enqueue()` if present
- Apply Pattern A config + handler transformation

- [ ] **Step 6: Migrate soul-initialize-api.step.ts**

Read the file, then:
- Import `taskExecutionStream`
- Replace `streams.taskExecution.set()` → `taskExecutionStream.set()`

- [ ] **Step 7: Migrate notify-api.step.ts**

Read the file, then:
- Import `taskExecutionStream`
- Replace `streams.taskExecution.set()` → `taskExecutionStream.set()`

- [ ] **Step 8: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -E "stream-history|traces|token-usage|task-chat|soul-init|notify" | head -10`

- [ ] **Step 9: Commit**

```bash
git add steps/api/stream-history-api.step.ts steps/api/traces-api.step.ts steps/api/traces-submit-api.step.ts steps/api/task-token-usage-api.step.ts steps/api/task-chat-api.step.ts steps/api/soul-initialize-api.step.ts steps/streams/notify-api.step.ts
git commit -m "refactor: migrate stream-dependent API steps to Motia 1.0.x (Pattern A+E)"
```

---

## Task 8: Migrate Remaining API Steps — Batch 4

**Files (remaining API steps not yet migrated):**
- `steps/api/soul-api.step.ts` (has `emit`)
- `steps/api/soul-config.step.ts`
- `steps/api/soul-agents-status.step.ts`
- `steps/api/soul-execution-history.step.ts`
- `steps/api/soul-session-delete.step.ts`
- `steps/api/soul-session-stop.step.ts`
- `steps/api/task-ptc-code-api.step.ts`
- `steps/api/task-hitl-result-api.step.ts`
- `steps/api/tasks-pin-api.step.ts`
- `steps/api/tasks-pinned-list-api.step.ts`
- `steps/api/tasks-unpin-api.step.ts`
- `steps/api/token-usage-api.step.ts`
- `steps/api/workflow-detail-api.step.ts`
- `steps/api/workflows-list-api.step.ts`
- `steps/api/workspace-api.step.ts`
- `steps/api/agents-api.step.ts`

For `soul-api.step.ts`: has `emit()` calls → also apply Pattern B (`emit` → `enqueue`).
All others: Pattern A only.

- [ ] **Step 1: Read and migrate each file**

For each file: read, apply Pattern A transformation, check for `emit()` usage (convert to `enqueue`), check for `streams` usage (convert to stream instance import), check for `state` usage (convert to `stateManager`).

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "steps/api/" | head -20`

- [ ] **Step 3: Commit**

```bash
git add steps/api/
git commit -m "refactor: migrate remaining API steps to Motia 1.0.x"
```

---

## Task 9: Migrate Agent API Step (emit + complex)

**Files:**
- Modify: `steps/agents/agent-api.step.ts`

This is a critical step — it's the main task submission endpoint that uses `emit()`.

- [ ] **Step 1: Migrate agent-api.step.ts**

Apply Pattern A + B:
- `ApiRouteConfig` → `StepConfig` with `triggers: [{ type: 'http', method: 'POST', path: '/agent/execute' }]`
- `emits: [{ topic: 'agent.task.execute', label: '...' }]` → `enqueues: ['agent.task.execute'] as const`
- `import { emit, logger } from 'motia'` (add `enqueue`)
- `emit({ topic: 'agent.task.execute', data: {...} })` → `enqueue({ topic: 'agent.task.execute', data: {...} })`
- Handler: `(request: any, { emit, logger }: any)` → `Handlers<typeof config> = async (context)`
- `request.body` → `context.body`

```typescript
import { z } from 'zod';
import { type Handlers, type StepConfig, logger, enqueue } from 'motia';
import { getDataStore, TaskStatus } from '../../src/core/database/data-store';
import { MessageIdGenerator } from '../../src/utils/message-id-generator';

// ... (keep bodySchema as-is) ...

export const config = {
  name: 'agent-api',
  description: 'REST API endpoint for agent task execution',
  triggers: [{ type: 'http' as const, method: 'POST' as const, path: '/agent/execute' }],
  enqueues: ['agent.task.execute'] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (context) => {
  const validationResult = bodySchema.safeParse(context.body);
  if (!validationResult.success) {
    throw new Error(`Invalid request: ${validationResult.error.message}`);
  }

  // ... (keep all the business logic as-is) ...

  // Replace emit() with enqueue()
  await enqueue({
    topic: 'agent.task.execute',
    data: {
      taskId, task, sessionId: finalSessionId, messageId,
      systemPrompt, availableSkills, useDelegation, delegateTo,
      app: appIdentifier, environment, userId, userContext, subagent,
      agentType, rewriteRequest, workflow, workflowInput: workflow_input,
    },
  });

  return {
    status: 200,
    body: { success: true, message: '...', taskId, messageId, task, sessionId: finalSessionId, useDelegation, availableSkills, userId, subagent, agentType, rewriteRequest },
  };
};
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "agent-api"`

- [ ] **Step 3: Commit**

```bash
git add steps/agents/agent-api.step.ts
git commit -m "refactor: migrate agent-api step to Motia 1.0.x with enqueue"
```

---

## Task 10: Migrate Remaining Non-Agent Step Files

**Files:**
- `steps/agents/agent-result.step.ts` (Pattern A)
- `steps/agents/agent-results.step.ts` (Pattern A)
- `steps/agents/agent-tasks-delete.step.ts` (Pattern A + B, has emit)
- `steps/web/media-serve.step.ts` (Pattern A)
- `steps/streams/output-history-tracker.step.ts` (Pattern B, event step)

- [ ] **Step 1: Migrate agent-result.step.ts**

Pattern A. Read file, apply config + handler transformation.

- [ ] **Step 2: Migrate agent-results.step.ts**

Pattern A. Read file, apply config + handler transformation.

- [ ] **Step 3: Migrate agent-tasks-delete.step.ts**

Pattern A + B (has `emit`). Convert `emit()` → `enqueue()`.

- [ ] **Step 4: Migrate media-serve.step.ts**

Pattern A. Read file, apply config + handler transformation.

- [ ] **Step 5: Migrate output-history-tracker.step.ts**

Pattern B (event step):
- `EventConfig` with `subscribes: ['agent.task.completed']` → `triggers: [queue('agent.task.completed')]`
- `emit()` in handler → `enqueue()`

- [ ] **Step 6: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -E "agent-result|agent-tasks|media-serve|output-history" | head -10`

- [ ] **Step 7: Commit**

```bash
git add steps/agents/agent-result.step.ts steps/agents/agent-results.step.ts steps/agents/agent-tasks-delete.step.ts steps/web/media-serve.step.ts steps/streams/output-history-tracker.step.ts
git commit -m "refactor: migrate remaining simple agent and stream steps to Motia 1.0.x"
```

---

## Task 11: Migrate Master Agent Step (Most Complex)

**Files:**
- Modify: `steps/agents/master-agent.step.ts`

This is the most complex step (~1200 lines). It uses Pattern B + E (event subscriber + streams + emit).

- [ ] **Step 1: Migrate config**

```typescript
// Replace:
import type { EventConfig } from 'motia';
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  subscribes: ['agent.task.execute', 'agent.task.chat'],
  emits: ['agent.task.completed', 'agent.task.failed', 'execution.trace.created'],
  flows: ['agent-workflow'],
};

// With:
import { type Handlers, type StepConfig, logger, enqueue, queue } from 'motia';
import { taskExecutionStream } from '../streams/task-execution.stream';
export const config = {
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  triggers: [
    queue('agent.task.execute'),
    queue('agent.task.chat'),
  ],
  enqueues: ['agent.task.completed', 'agent.task.failed', 'execution.trace.created'] as const,
} as const satisfies StepConfig;
```

- [ ] **Step 2: Migrate handler signature and emit calls**

```typescript
// Replace:
export const handler = async (
  input: any,
  { emit, logger, state: _state, streams: _streams }: any
) => {

// With:
export const handler: Handlers<typeof config> = async (input) => {
```

Then throughout the handler body:
- Replace ALL `await emit({ topic: 'xxx', data: {...} })` → `await enqueue({ topic: 'xxx', data: {...} })`
- Replace ALL `_streams.taskExecution.set(taskId, uniqueId, {...})` → `await taskExecutionStream.set(taskId, uniqueId, {...})`
- Remove `{ emit, logger, state: _state, streams: _streams }` destructuring from handler params
- `logger` is now imported from 'motia'

Note: The handler has many references to `_streams` and `emit`. Each must be updated. Search for:
- `emit({` → `enqueue({`
- `_streams.taskExecution.set(` → `taskExecutionStream.set(`
- `{ emit, logger, state: _state, streams: _streams }: any` → remove

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "master-agent" | head -10`

- [ ] **Step 4: Commit**

```bash
git add steps/agents/master-agent.step.ts
git commit -m "refactor: migrate master-agent step to Motia 1.0.x"
```

---

## Task 12: Migrate Task Result Handler Step

**Files:**
- Modify: `steps/agents/task-result-handler.step.ts`

Pattern B + E. Uses `streams.taskResult` and `emit`.

- [ ] **Step 1: Migrate config and imports**

```typescript
import { type Handlers, type StepConfig, logger, enqueue, queue } from 'motia';
import { taskResultStream } from '../streams/task-result.stream';

export const config = {
  name: 'task-result-handler',
  description: 'Handles agent task completion/failure events and processes results',
  triggers: [
    queue('agent.task.completed'),
    queue('agent.task.failed'),
  ],
  enqueues: [] as const,
} as const satisfies StepConfig;
```

- [ ] **Step 2: Migrate handler**

- Handler signature: `(input: any, { logger, emit, streams }: any)` → `Handlers<typeof config> = async (input)`
- `streams.taskResult.set(...)` → `taskResultStream.set(...)`
- `emit({ topic: 'xxx', data })` → `enqueue({ topic: 'xxx', data })`
- `logger` from import

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "task-result-handler" | head -10`

- [ ] **Step 4: Commit**

```bash
git add steps/agents/task-result-handler.step.ts
git commit -m "refactor: migrate task-result-handler step to Motia 1.0.x"
```

---

## Task 13: Migrate Event Steps (failure-handler, agent-result-retry, soul-agent-executor)

**Files:**
- `steps/agents/failure-handler.step.ts` (Pattern B, no emit, no streams)
- `steps/agents/agent-result-retry.step.ts` (Pattern B, has emit)
- `steps/agents/soul-agent-executor.step.ts` (Pattern B, has emit)

- [ ] **Step 1: Migrate failure-handler.step.ts**

```typescript
import { type Handlers, type StepConfig, logger, queue } from 'motia';

export const config = {
  name: 'failure-handler',
  description: 'Handles agent task failures and logs them for monitoring',
  triggers: [queue('agent.task.failed')],
  enqueues: [] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (input) => {
  // ... keep existing logic, remove { logger } from params
  // logger is now imported from 'motia'
};
```

- [ ] **Step 2: Migrate agent-result-retry.step.ts**

Read file, apply Pattern B:
- `EventConfig` → `StepConfig` with `triggers: [queue('xxx')]`
- `emit()` → `enqueue()`

- [ ] **Step 3: Migrate soul-agent-executor.step.ts**

Read file, apply Pattern B:
- `subscribes: ['soul.agent.execute']` → `triggers: [queue('soul.agent.execute')]`
- `emit()` → `enqueue()`

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -E "failure-handler|agent-result-retry|soul-agent" | head -10`

- [ ] **Step 5: Commit**

```bash
git add steps/agents/failure-handler.step.ts steps/agents/agent-result-retry.step.ts steps/agents/soul-agent-executor.step.ts
git commit -m "refactor: migrate event handler steps to Motia 1.0.x"
```

---

## Task 14: Migrate Cron Steps

**Files:**
- `steps/cron/user-profile-analysis.step.ts` (Pattern C + B, has emit)
- `steps/cron/soul-periodic-check.step.ts` (Pattern C + B, has emit)
- `steps/cleanup/soul-cleanup-cron.step.ts` (Pattern C)

- [ ] **Step 1: Migrate user-profile-analysis.step.ts**

```typescript
import { type Handlers, type StepConfig, logger, enqueue, cron } from 'motia';

export const config = {
  name: 'UserProfileAnalysis',
  description: 'AI-powered user profile analysis running daily at 9 PM',
  triggers: [cron('0 0 21 * * * *')],  // 5-field "0 21 * * *" → 7-field "0 0 21 * * * *"
  enqueues: ['user.profile.analyzed'] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (_) => {
  // ... keep existing logic ...
  // Replace emit({ topic: 'user.profile.analyzed', data }) → enqueue({ topic: 'user.profile.analyzed', data })
  // logger from import, not from { logger }
};
```

- [ ] **Step 2: Migrate soul-periodic-check.step.ts**

Read file, apply Pattern C:
- Convert `CronConfig` to `StepConfig` with `triggers: [cron('...')]`
- Convert `emit()` → `enqueue()`
- Convert 5-field cron to 7-field

- [ ] **Step 3: Migrate soul-cleanup-cron.step.ts**

Read file, apply Pattern C:
- Convert cron expression to 7-field
- Convert handler signature

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -E "user-profile|soul-periodic|soul-cleanup" | head -10`

- [ ] **Step 5: Commit**

```bash
git add steps/cron/ steps/cleanup/
git commit -m "refactor: migrate cron steps to Motia 1.0.x with 7-field expressions"
```

---

## Task 15: Migrate Token Usage Steps

**Files:**
- `steps/token-usage/token-usage-extractor.step.ts` (Pattern B)
- `steps/token-usage/token-usage-writer.step.ts` (Pattern B)

- [ ] **Step 1: Migrate token-usage-extractor.step.ts**

```typescript
import { type Handlers, type StepConfig, logger, enqueue, queue } from 'motia';

export const config = {
  name: 'token-usage-extractor',
  description: 'Extracts token usage data from execution traces',
  triggers: [queue('execution.trace.created')],
  enqueues: ['token_usage_recorded'] as const,
} as const satisfies StepConfig;

export const handler: Handlers<typeof config> = async (trace) => {
  // ... keep logic, replace emit() with enqueue(), logger from import
};
```

- [ ] **Step 2: Migrate token-usage-writer.step.ts**

Read file, apply Pattern B.

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep "token-usage" | head -10`

- [ ] **Step 4: Commit**

```bash
git add steps/token-usage/
git commit -m "refactor: migrate token usage steps to Motia 1.0.x"
```

---

## Task 16: Update types.d.ts and Verify Full Build

**Files:**
- Modify: `types.d.ts` (if needed — remove old Motia type references)
- All modified files

- [ ] **Step 1: Update types.d.ts**

Read `types.d.ts`. If it imports from `@motiadev/core` or old Motia packages, update the imports to `motia` (1.0.x).

- [ ] **Step 2: Full TypeScript build**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: No errors related to Motia API changes. Pre-existing errors in test files are OK.

- [ ] **Step 3: Fix any remaining `from 'motia'` issues**

Run: `grep -rn "from '@motiadev" --include="*.ts" steps/ src/`
Expected: No results (all old imports removed)

- [ ] **Step 4: Commit**

```bash
git add types.d.ts
git commit -m "refactor: update types.d.ts for Motia 1.0.x"
```

---

## Task 17: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the server**

Run: `npm run start`
Expected: Server starts without errors, iii engine connects

- [ ] **Step 2: Test health check**

Run: `curl http://localhost:3000/health`
Expected: `{ "status": "healthy", ... }`

- [ ] **Step 3: Test task submission**

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "hello world", "sessionId": "migration-test-1"}'
```
Expected: `{ "success": true, "taskId": "task-xxx", ... }`

- [ ] **Step 4: Test API endpoints**

```bash
curl http://localhost:3000/api/skills
curl http://localhost:3000/api/contexts/migration-test-1
curl http://localhost:3000/api/workflows
```
Expected: All return 200 with expected data

- [ ] **Step 5: Test task execution chain**

Wait for the task to complete, then:
```bash
curl http://localhost:3000/agent/result?taskId=<taskId-from-step-3>
```
Expected: Task result with status and output

---

## Task 18: Update NPM Scripts and Documentation

**Files:**
- Modify: `package.json` (scripts section)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update package.json scripts**

Verify these scripts work with Motia 1.0.x:
- `dev`: `motia dev` (should still work)
- `start`: `motia start` (should still work)
- `build`: `tsc && motia build` (verify `motia build` exists in 1.0.x)
- `generate-types`: verify `motia generate-types` exists in 1.0.x

If `motia build` or `motia generate-types` don't exist, replace with appropriate alternatives.

- [ ] **Step 2: Update CLAUDE.md**

Update:
- Motia version reference from 0.17.x to 1.0.x
- Remove references to old plugins
- Add config.yaml documentation
- Update architecture section if needed

- [ ] **Step 3: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "docs: update npm scripts and CLAUDE.md for Motia 1.0.x"
```

---

## Task 19: Final Cleanup

**Files:**
- Remove: `motia-workbench.json` (if exists)
- Verify: No `@motiadev` references remain

- [ ] **Step 1: Remove obsolete files**

```bash
rm -f motia-workbench.json
```

- [ ] **Step 2: Verify no old package references**

```bash
grep -rn "@motiadev" --include="*.ts" --include="*.json" --include="*.yaml" .
grep -rn "ApiRouteConfig\|EventConfig\|CronConfig\|subscribes:" --include="*.step.ts" steps/
```
Expected: No results

- [ ] **Step 3: Verify all files import from 'motia' correctly**

```bash
grep -rn "from 'motia'" --include="*.ts" steps/ | wc -l
```
Expected: Same count as original (~69 files)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: cleanup old Motia 0.17.x artifacts"
```
