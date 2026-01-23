# Task Hooks Usage Guide

## Overview

TaskHooks allow you to inject custom logic at key points in the Agent task lifecycle:
- **Before task execution**: `preExec()` - Initialize, validate, modify task
- **During task execution**: `onProgressingNotify()` - Send progress, heartbeat
- **After task execution**: `postExec()` - Cleanup, log results, save state

## Creating a Custom TaskHook

### Step 1: Extend BaseTaskHook

```typescript
import { BaseTaskHook, TaskContext, PreExecResult } from './base';

export class MyCustomHook extends BaseTaskHook {
  async preExec(context: TaskContext): PreExecResult {
    // Your logic here
    // Return undefined to continue
    // Return {stop: true, reason: '...'} to abort task
    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // Your cleanup logic here
  }

  // Optional: Override for custom progress reporting
  async onProgressingNotify(context: TaskContext): Promise<void> {
    await super.onProgressingNotify(context); // Send default heartbeat
    // Add your custom progress logic here
  }
}
```

### Step 2: Register in master-agent

In `steps/agents/master-agent.step.ts`:

```typescript
import { MyCustomHook } from '../../src/core/task/hooks/my-custom';

// In handler function:
const hookExecutor = new TaskHookExecutor();
hookExecutor.registerHook(new MyCustomHook());
```

## Available Context Properties

```typescript
interface TaskContext {
  taskId: string;           // Unique task ID
  sessionId: string;         // Session this task belongs to
  task: string;              // Task description/prompt
  status: string;            // Current status
  context: any;              // Task context data (managed by ContextManager)
  metadata: {
    createdAt: Date;         // When task was created
    llmCalls: number;        // Number of LLM calls made
    skillCalls: number;      // Number of Skills called
    totalTokens: number;     // Total tokens consumed
  };
  services: {
    streams: any;            // Motia Stream service
    logger: any;              // Logger service
    emit: any;                // Event emitter
  };
}
```

## Common Patterns

### Abort Task Based on Condition

```typescript
async preExec(context: TaskContext): PreExecResult {
  if (someCondition) {
    return { stop: true, reason: 'Condition not met' };
  }
  return undefined;
}
```

### Modify Task Before Execution

```typescript
async preExec(context: TaskContext): PreExecResult {
  return { modifiedTask: 'Enhanced: ' + context.task };
}
```

### Send Custom Progress Updates

```typescript
async onProgressingNotify(context: TaskContext): Promise<void> {
  const progress = calculateProgress(context.metadata);
  await context.services.streams.taskExecution.set(context.taskId, context.taskId, {
    type: 'progress',
    percentage: progress,
    message: `${progress}% complete`,
  });
}
```

### Collect Metrics

```typescript
private startTime: number = 0;

async preExec(context: TaskContext): Promise<void> {
  this.startTime = Date.now();
}

async postExec(context: TaskContext, result: any): Promise<void> {
  const duration = Date.now() - this.startTime;
  // Send to metrics system
}
```

## Examples

See existing hooks:
- `src/core/task/hooks/default.ts` - Status management
- `src/core/task/hooks/context-manager.ts` - Context lifecycle
- `src/core/task/hooks/user-allow.ts` - User permission checking
- `src/core/task/hooks/metrics.ts` - Metrics collection

## Configuration

Edit `config/task-hooks.config.yaml` to enable/disable hooks:

```yaml
hooks:
  enabled:
    - DefaultTaskHook
    - MyCustomHook
```
