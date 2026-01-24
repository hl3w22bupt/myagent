# Task Hook System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现TaskHook系统，用于管理Agent任务的整个生命周期，包括任务前、任务后和任务执行中的Hook机制。

**Architecture:** TaskHook运行在Motia体系中（TypeScript），直接访问Motia服务（streams、logger、emit），与Python Sandbox中的SkillHook形成双层Hook架构。TaskHook负责任务级别的初始化、权限验证、上下文管理、指标收集等。

**Tech Stack:** TypeScript, Motia Framework, Node.js, Jest

---

## Prerequisites

**Before starting this plan:**
- Read `docs/design/task-hook-system.md` for complete design
- Read `docs/design/skill-hook-system.md` to understand SkillHook vs TaskHook differences
- Read `.cursor/rules/motia/event-steps.mdc` for Motia Event Steps pattern
- Ensure Motia dev server runs: `npm run dev`

**Key concepts to understand:**
- TaskHook runs in TypeScript (Motia system), NOT in Python Sandbox
- SkillHook runs in Python Sandbox, communicates via HTTP
- TaskHook has full access to Motia services (streams, logger, emit)
- Three hook methods: `preExec()` (task start), `postExec()` (task end), `onProgressingNotify()` (during execution)

---

## Task 1: Create BaseTaskHook Interface and Types

**Files:**
- Create: `src/core/task/hooks/base.ts`
- Create: `src/core/task/hooks/types.ts`
- Test: `tests/core/task/hooks/base.test.ts`

**Why:** Foundation for entire TaskHook system. Define the contract all TaskHooks must follow.

**Step 1: Write the type definitions**

Create: `src/core/task/hooks/types.ts`

```typescript
/**
 * Task execution context passed to all TaskHooks
 */
export interface TaskContext {
  // Task identification
  taskId: string;
  sessionId: string;
  task: string;

  // Execution state
  status: 'pending' | 'running' | 'completed' | 'failed';

  // Task context data (for ContextManager, etc.)
  context: any;

  // Execution metadata
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
    userId?: string;
  };

  // Motia service references
  services: {
    streams: any;
    logger: any;
    emit: any;
  };
}

/**
 * Result from preExec hook
 */
export type PreExecResult = void | { stop?: boolean; reason?: string; modifiedTask?: string };
```

**Step 2: Write the BaseTaskHook abstract class**

Create: `src/core/task/hooks/base.ts`

```typescript
import { TaskContext, PreExecResult } from './types';

/**
 * Abstract base class for all TaskHooks
 * All TaskHooks must extend this class and implement preExec and postExec
 */
export abstract class BaseTaskHook {
  /**
   * Called before task execution starts
   *
   * Use for:
   * - Task initialization
   * - Permission validation
   * - Task configuration
   * - Sending initial status to frontend
   *
   * @param context - Task execution context
   * @returns undefined to continue, {stop: true, reason: '...'} to abort, or {modifiedTask: '...'} to change task
   */
  abstract preExec(context: TaskContext): Promise<PreExecResult>;

  /**
   * Called after task execution completes (success or failure)
   *
   * Use for:
   * - Cleanup resources
   * - Record execution statistics
   * - Send completion notifications
   * - Update task status in database
   *
   * @param context - Task execution context
   * @param result - Task execution result
   */
  abstract postExec(context: TaskContext, result: any): Promise<void>;

  /**
   * Called periodically during task execution (every 30s by default)
   *
   * Use for:
   * - Send heartbeat signals
   * - Report overall progress
   * - Monitor task health
   *
   * Default implementation sends heartbeat to Stream.
   * Override to add custom progress monitoring.
   *
   * @param context - Task execution context
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    const { taskId, services } = context;

    // Default: send heartbeat
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'heartbeat',
      message: 'Task is still running...',
      timestamp: new Date().toISOString(),
    });
  }
}
```

**Step 3: Write failing tests**

Create: `tests/core/task/hooks/base.test.ts`

```typescript
import { BaseTaskHook } from '../../../src/core/task/hooks/base';
import { TaskContext } from '../../../src/core/task/hooks/types';

class TestTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return undefined;
  }

  async postExec(context: TaskContext, result: any) {
    // Do nothing
  }
}

describe('BaseTaskHook', () => {
  it('should require preExec implementation', () => {
    // This test documents the abstract class requirement
    const hook = new TestTaskHook();
    expect(hook).toBeInstanceOf(BaseTaskHook);
  });

  it('should require postExec implementation', () => {
    // This test documents the abstract class requirement
    const hook = new TestTaskHook();
    expect(hook.postExec).toBeDefined();
  });

  it('should have default onProgressingNotify implementation', async () => {
    const hook = new TestTaskHook();
    const mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'running' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };

    await hook.onProgressingNotify(mockContext);

    expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
      'test-1',
      'test-1',
      expect.objectContaining({
        type: 'heartbeat',
        message: 'Task is still running...',
      })
    );
  });
});
```

**Step 4: Run tests to verify setup**

```bash
cd /Users/leo/workspace/myagent/.worktree/task-hook-system
npm tests/core/task/hooks/base.test.ts
```

Expected: Tests fail with "Cannot find module '../../../src/core/task/hooks/base'"

**Step 5: Commit**

```bash
git add src/core/task/hooks/ tests/core/task/hooks/
git commit -m "feat(task-hooks): add BaseTaskHook interface and types"
```

---

## Task 2: Implement TaskHookExecutor

**Files:**
- Create: `src/core/task/hooks/executor.ts`
- Modify: `src/core/task/hooks/index.ts` (export barrel)
- Test: `tests/core/task/hooks/executor.test.ts`

**Why:** TaskHookExecutor manages multiple TaskHooks, executes them in order, and manages progressing hooks lifecycle.

**Step 1: Write the TaskHookExecutor class**

Create: `src/core/task/hooks/executor.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

/**
 * Manages and executes TaskHooks
 * - Registers hooks
 * - Executes preExec hooks in order
 * - Executes postExec hooks in order
 * - Manages progressing hooks lifecycle (start/stop)
 */
export class TaskHookExecutor {
  private hooks: BaseTaskHook[] = [];
  private progressingInterval: NodeJS.Timeout | null = null;

  /**
   * Register a TaskHook
   * @param hook - TaskHook instance to register
   */
  registerHook(hook: BaseTaskHook): void {
    this.hooks.push(hook);
  }

  /**
   * Execute all preExec hooks in registration order
   * Stops at first hook that returns {stop: true}
   * Applies modifiedTask from hooks
   *
   * @param context - Task execution context
   * @returns {stop: boolean, reason?: string, modifiedTask?: string}
   */
  async executePreHooks(context: TaskContext): Promise<{ stop: boolean; reason?: string; modifiedTask?: string }> {
    for (const hook of this.hooks) {
      try {
        const result = await hook.preExec(context);

        if (result && result.stop) {
          return {
            stop: true,
            reason: result.reason || 'Stopped by task hook',
          };
        }

        if (result && result.modifiedTask) {
          context.task = result.modifiedTask;
        }
      } catch (error) {
        // Log error but continue with next hook
        context.services.logger.error('TaskHook preExec failed', {
          error,
          hookName: hook.constructor.name,
          taskId: context.taskId,
        });
      }
    }

    return { stop: false };
  }

  /**
   * Execute all postExec hooks in registration order
   * Continues even if individual hooks fail
   *
   * @param context - Task execution context
   * @param result - Task execution result
   */
  async executePostHooks(context: TaskContext, result: any): Promise<void> {
    for (const hook of this.hooks) {
      try {
        await hook.postExec(context, result);
      } catch (error) {
        // Log error but continue with next hook
        context.services.logger.error('TaskHook postExec failed', {
          error,
          hookName: hook.constructor.name,
          taskId: context.taskId,
        });
      }
    }
  }

  /**
   * Start progressing hooks (background execution)
   * Calls onProgressingNotify() every 30 seconds
   *
   * @param context - Task execution context
   */
  startProgressingHooks(context: TaskContext): void {
    this.progressingInterval = setInterval(async () => {
      for (const hook of this.hooks) {
        try {
          await hook.onProgressingNotify(context);
        } catch (error) {
          // Silent failure, don't interrupt task
          context.services.logger.warn('TaskHook progressing failed', {
            error,
            hookName: hook.constructor.name,
            taskId: context.taskId,
          });
        }
      }
    }, 30000); // 30 second interval
  }

  /**
   * Stop progressing hooks
   * Clears the interval timer
   */
  stopProgressingHooks(): void {
    if (this.progressingInterval) {
      clearInterval(this.progressingInterval);
      this.progressingInterval = null;
    }
  }

  /**
   * Get registered hooks count
   */
  getHookCount(): number {
    return this.hooks.length;
  }
}
```

**Step 2: Create index.ts barrel file**

Create: `src/core/task/hooks/index.ts`

```typescript
export { BaseTaskHook } from './base';
export { TaskHookExecutor } from './executor';
export * from './types';
```

**Step 3: Write tests for TaskHookExecutor**

Create: `tests/core/task/hooks/executor.test.ts`

```typescript
import { TaskHookExecutor } from '../../../src/core/task/hooks/executor';
import { BaseTaskHook, TaskContext } from '../../../src/core/task/hooks/base';

class MockHook extends BaseTaskHook {
  preExecCalled = false;
  postExecCalled = false;
  progressingCalled = false;

  async preExec(context: TaskContext) {
    this.preExecCalled = true;
    return undefined;
  }

  async postExec(context: TaskContext, result: any) {
    this.postExecCalled = true;
  }

  async onProgressingNotify(context: TaskContext): Promise<void> {
    this.progressingCalled = true;
    await super.onProgressingNotify(context);
  }
}

class StoppingHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return { stop: true, reason: 'Test stop' };
  }

  async postExec(context: TaskContext, result: any) {
    // Do nothing
  }
}

class ModifyingHook extends BaseTaskHook {
  async preExec(context: TaskContext) {
    return { modifiedTask: 'Modified task' };
  }

  async postExec(context: TaskContext, result: any) {
    // Do nothing
  }
}

describe('TaskHookExecutor', () => {
  let executor: TaskHookExecutor;
  let mockContext: TaskContext;

  beforeEach(() => {
    executor = new TaskHookExecutor();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'original task',
      status: 'pending' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('registerHook', () => {
    it('should register a hook', () => {
      const hook = new MockHook();
      executor.registerHook(hook);

      expect(executor.getHookCount()).toBe(1);
    });

    it('should register multiple hooks', () => {
      executor.registerHook(new MockHook());
      executor.registerHook(new MockHook());
      executor.registerHook(new MockHook());

      expect(executor.getHookCount()).toBe(3);
    });
  });

  describe('executePreHooks', () => {
    it('should execute all preExec hooks in order', async () => {
      const hook1 = new MockHook();
      const hook2 = new MockHook();
      executor.registerHook(hook1);
      executor.registerHook(hook2);

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(hook1.preExecCalled).toBe(true);
      expect(hook2.preExecCalled).toBe(true);
    });

    it('should stop at first hook that returns stop: true', async () => {
      executor.registerHook(new MockHook());
      executor.registerHook(new StoppingHook());
      const lastHook = new MockHook();
      executor.registerHook(lastHook);

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(true);
      expect(result.reason).toBe('Test stop');
      expect(lastHook.preExecCalled).toBe(false);
    });

    it('should apply modifiedTask from hooks', async () => {
      executor.registerHook(new ModifyingHook());

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(mockContext.task).toBe('Modified task');
    });

    it('should handle hook errors gracefully', async () => {
      class FailingHook extends BaseTaskHook {
        async preExec() {
          throw new Error('Hook error');
        }
        async postExec() {}
      }

      executor.registerHook(new FailingHook());
      executor.registerHook(new MockHook());

      const result = await executor.executePreHooks(mockContext);

      expect(result.stop).toBe(false);
      expect(mockContext.services.logger.error).toHaveBeenCalled();
    });
  });

  describe('executePostHooks', () => {
    it('should execute all postExec hooks', async () => {
      const hook1 = new MockHook();
      const hook2 = new MockHook();
      executor.registerHook(hook1);
      executor.registerHook(hook2);

      await executor.executePostHooks(mockContext, { success: true });

      expect(hook1.postExecCalled).toBe(true);
      expect(hook2.postExecCalled).toBe(true);
    });

    it('should handle hook errors gracefully', async () => {
      class FailingHook extends BaseTaskHook {
        async preExec() { return undefined; }
        async postExec() {
          throw new Error('Post hook error');
        }
      }

      executor.registerHook(new FailingHook());
      executor.registerHook(new MockHook());

      await executor.executePostHooks(mockContext, { success: true });

      expect(mockContext.services.logger.error).toHaveBeenCalled();
    });
  });

  describe('progressing hooks lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start progressing hooks', () => {
      const hook = new MockHook();
      executor.registerHook(hook);

      executor.startProgressingHooks(mockContext);

      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);

      expect(hook.progressingCalled).toBe(true);
    });

    it('should stop progressing hooks', () => {
      executor.startProgressingHooks(mockContext);

      const stopCount = jest.spyOn(executor, 'stopProgressingHooks');
      executor.stopProgressingHooks();

      expect(stopCount).toHaveBeenCalled();
    });
  });
});
```

**Step 4: Run tests**

```bash
cd /Users/leo/workspace/myagent/.worktree/task-hook-system
npm test -- tests/core/task/hooks/executor.test.ts
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add src/core/task/hooks/ tests/core/task/hooks/
git commit -m "feat(task-hooks): implement TaskHookExecutor with lifecycle management"
```

---

## Task 3: Implement DefaultTaskHook

**Files:**
- Create: `src/core/task/hooks/default.ts`
- Test: `tests/core/task/hooks/default.test.ts`

**Why:** DefaultTaskHook provides basic status management and progress notification for all tasks.

**Step 1: Write DefaultTaskHook implementation**

Create: `src/core/task/hooks/default.ts`

```typescript
import { BaseTaskHook, TaskContext, PreExecResult } from './base';

/**
 * Default TaskHook implementation
 * Provides:
 * - Send initial status to Stream on task start
 * - Send completion status to Stream on task end
 * - Send heartbeat every 30 seconds during execution
 * - Log task lifecycle events
 */
export class DefaultTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): PreExecResult {
    const { taskId, task, services } = context;

    // 1. Send initial status to Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status: 'running',
      message: 'Task started',
      timestamp: new Date().toISOString(),
    });

    // 2. Log task start
    services.logger.info('Task started', { taskId, task });

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    // 1. Determine final status
    const status = result.success ? 'completed' : 'failed';

    // 2. Send completion status to Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status,
      message: result.success ? 'Task completed successfully' : 'Task failed',
      timestamp: new Date().toISOString(),
      data: result,
    });

    // 3. Log task completion
    services.logger.info('Task completed', {
      taskId,
      status,
      executionTime: result.executionTime,
    });
  }

  async onProgressingNotify(context: TaskContext): Promise<void> {
    // Call parent class to send heartbeat
    await super.onProgressingNotify(context);

    // Add custom progress monitoring
    const { services, metadata } = context;
    services.logger.debug('Task progress', {
      taskId: context.taskId,
      llmCalls: metadata.llmCalls,
      skillCalls: metadata.skillCalls,
      totalTokens: metadata.totalTokens,
    });
  }
}
```

**Step 2: Write tests**

Create: `tests/core/task/hooks/default.test.ts`

```typescript
import { DefaultTaskHook } from '../../../src/core/task/hooks/default';
import { TaskContext } from '../../../src/core/task/hooks/base';

describe('DefaultTaskHook', () => {
  let hook: DefaultTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    hook = new DefaultTaskHook();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 5,
        skillCalls: 3,
        totalTokens: 1000,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('preExec', () => {
    it('should send running status to stream', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'running',
          message: 'Task started',
        })
      );
    });

    it('should log task start', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task started',
        { taskId: 'test-1', task: 'test task' }
      );
    });

    it('should return undefined to continue execution', async () => {
      const result = await hook.preExec(mockContext);

      expect(result).toBeUndefined();
    });
  });

  describe('postExec', () => {
    it('should send completed status on success', async () => {
      const result = { success: true, executionTime: 5000 };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'completed',
          message: 'Task completed successfully',
          data: result,
        })
      );
    });

    it('should send failed status on failure', async () => {
      const result = { success: false, error: 'Test error' };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'status',
          status: 'failed',
          message: 'Task failed',
          data: result,
        })
      );
    });

    it('should log task completion with execution time', async () => {
      const result = { success: true, executionTime: 5000 };

      await hook.postExec(mockContext, result);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task completed',
        { taskId: 'test-1', status: 'completed', executionTime: 5000 }
      );
    });
  });

  describe('onProgressingNotify', () => {
    it('should send heartbeat via parent class', async () => {
      await hook.onProgressingNotify(mockContext);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'heartbeat',
          message: 'Task is still running...',
        })
      );
    });

    it('should log progress metrics', async () => {
      await hook.onProgressingNotify(mockContext);

      expect(mockContext.services.logger.debug).toHaveBeenCalledWith(
        'Task progress',
        {
          taskId: 'test-1',
          llmCalls: 5,
          skillCalls: 3,
          totalTokens: 1000,
        }
      );
    });
  });
});
```

**Step 3: Run tests**

```bash
npm test -- tests/core/task/hooks/default.test.ts
```

Expected: All tests pass

**Step 4: Update index.ts**

Modify: `src/core/task/hooks/index.ts`

```typescript
export { BaseTaskHook } from './base';
export { TaskHookExecutor } from './executor';
export { DefaultTaskHook } from './default';
export * from './types';
```

**Step 5: Commit**

```bash
git add src/core/task/hooks/ tests/core/task/hooks/
git commit -m "feat(task-hooks): implement DefaultTaskHook with status management"
```

---

## Task 4: Simplified ContextManagerTaskHook (Placeholder)

**Files:**
- Create: `src/core/task/hooks/context-manager.ts`
- Test: `tests/core/task/hooks/context-manager.test.ts`

**Why:** Manage task context lifecycle. For now, implement as placeholder - full ContextManager implementation is in separate plan (see context-engineering.md).

**Step 1: Write placeholder implementation**

Create: `src/core/task/hooks/context-manager.ts`

```typescript
import { BaseTaskHook, TaskContext, PreExecResult } from './base';

/**
 * Context Manager TaskHook
 * Manages task context lifecycle (creation, saving, compression)
 *
 * NOTE: This is a placeholder implementation.
 * Full ContextManager will be implemented in a separate plan.
 * See: docs/design/context-engineering.md
 */
export class ContextManagerTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): PreExecResult {
    const { taskId, services } = context;

    // TODO: Implement ContextManager.createTaskContext()
    // For now, create empty context object
    context.context = {
      messages: [],
      summary: null,
      artifactIndex: [],
    };

    // Send initialization message
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'step',
      message: 'Context initialized (placeholder)',
      currentStep: 'context_init',
      timestamp: new Date().toISOString(),
    });

    services.logger.info('Task context initialized (placeholder)', { taskId });

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    // TODO: Implement ContextManager.saveContext() and compression
    // For now, just log

    services.logger.info('Task context saved (placeholder)', {
      taskId,
      hasContext: !!context.context,
    });
  }
}
```

**Step 2: Write tests**

Create: `tests/core/task/hooks/context-manager.test.ts`

```typescript
import { ContextManagerTaskHook } from '../../../src/core/task/hooks/context-manager';
import { TaskContext } from '../../../src/core/task/hooks/base';

describe('ContextManagerTaskHook', () => {
  let hook: ContextManagerTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    hook = new ContextManagerTaskHook();
    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('preExec', () => {
    it('should initialize empty context object', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.context).toEqual({
        messages: [],
        summary: null,
        artifactIndex: [],
      });
    });

    it('should send initialization message to stream', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.streams.taskExecution.set).toHaveBeenCalledWith(
        'test-1',
        'test-1',
        expect.objectContaining({
          type: 'step',
          currentStep: 'context_init',
          message: 'Context initialized (placeholder)',
        })
      );
    });

    it('should log initialization', async () => {
      await hook.preExec(mockContext);

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context initialized (placeholder)',
        { taskId: 'test-1' }
      );
    });
  });

  describe('postExec', () => {
    it('should log context save', async () => {
      mockContext.context = { test: 'data' };

      await hook.postExec(mockContext, { success: true });

      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context saved (placeholder)',
        { taskId: 'test-1', hasContext: true }
      );
    });
  });
});
```

**Step 3: Run tests**

```bash
npm test -- tests/core/task/hooks/context-manager.test.ts
```

Expected: All tests pass

**Step 4: Update index.ts**

Modify: `src/core/task/hooks/index.ts`

```typescript
export { BaseTaskHook } from './base';
export { TaskHookExecutor } from './executor';
export { DefaultTaskHook } from './default';
export { ContextManagerTaskHook } from './context-manager';
export * from './types';
```

**Step 5: Commit**

```bash
git add src/core/task/hooks/ tests/core/task/hooks/
git commit -m "feat(task-hooks): add placeholder ContextManagerTaskHook"
```

---

## Task 5: Create Mock UserAllowTaskHook and MetricsCollectorTaskHook (Optional)

**Files:**
- Create: `src/core/task/hooks/user-allow.ts`
- Create: `src/core/task/hooks/metrics.ts`
- Create: `tests/core/task/hooks/user-allow.test.ts`
- Create: `tests/core/task/hooks/metrics.test.ts`

**Why:** Provide example implementations for common use cases (user permission checking, metrics). These are simple placeholders - full implementation depends on your permission/metrics infrastructure.

**Step 1: Write UserAllowTaskHook**

Create: `src/core/task/hooks/user-allow.ts`

```typescript
import { BaseTaskHook, TaskContext, PreExecResult } from './base';

/**
 * User Allow TaskHook
 * Checks if user is allowed to execute the task based on required skills/subagents
 *
 * Permission logic:
 * - Analyze task to determine which skills/subagents will be needed
 * - Check if user has permission for all required skills/subagents
 * - If any required skill/subagent is NOT allowed, reject the task
 *
 * NOTE: This is a simple placeholder implementation.
 * Initial version: Allow all tasks (no permission checking)
 * Future version: Implement actual permission validation
 */
export class UserAllowTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): PreExecResult {
    const { task, services, metadata } = context;
    const userId = metadata?.userId;

    // TODO: Implement actual permission checking
    // Future implementation should:
    // 1. Analyze task to identify required skills/subagents
    // 2. Query user permissions for each required skill/subagent
    // 3. If any required skill/subagent is not allowed, return {stop: true, reason: '...'}
    //
    // Example future implementation:
    // const requiredSkills = await analyzeRequiredSkills(task);
    // const userPermissions = await getUserPermissions(userId);
    // const hasAllPermissions = requiredSkills.every(skill => userPermissions.allowedSkills.includes(skill));
    // if (!hasAllPermissions) {
    //   return { stop: true, reason: 'User lacks permission for required skills' };
    // }

    // Current implementation: Allow all tasks (no permission checking)
    if (!userId) {
      services.logger.warn('No userId in task metadata', { taskId: context.taskId });
      // Don't block, just warn
    }

    services.logger.debug('User allow check passed (allow-all mode)', { userId, task });
    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // No cleanup needed for permission checking
  }
}
```

**Step 2: Write MetricsCollectorTaskHook**

Create: `src/core/task/hooks/metrics.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

/**
 * Metrics Collector TaskHook
 * Collects and reports task execution metrics
 *
 * NOTE: This is a simple placeholder implementation.
 * Full metrics integration depends on your monitoring system (Prometheus, DataDog, etc.)
 */
export class MetricsCollectorTaskHook extends BaseTaskHook {
  private startTime: number = 0;

  async preExec(context: TaskContext): Promise<void> {
    // Record start time
    this.startTime = Date.now();
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const executionTime = Date.now() - this.startTime;

    const metrics = {
      taskId: context.taskId,
      executionTime,
      llmCalls: context.metadata.llmCalls,
      skillCalls: context.metadata.skillCalls,
      totalTokens: context.metadata.totalTokens,
      success: result.success,
    };

    // Log metrics (TODO: send to actual monitoring system)
    context.services.logger.info('Task metrics', metrics);
  }
}
```

**Step 3: Write simple tests**

Create: `tests/core/task/hooks/user-allow.test.ts`

```typescript
import { UserAllowTaskHook } from '../../../src/core/task/hooks/user-allow';
import { TaskContext } from '../../../src/core/task/hooks/base';

describe('UserAllowTaskHook', () => {
  it('should allow task execution (placeholder)', async () => {
    const hook = new UserAllowTaskHook();
    const mockContext: TaskContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: { taskExecution: { set: jest.fn() } },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        emit: jest.fn(),
      },
    };

    const result = await hook.preExec(mockContext);

    expect(result).toBeUndefined();
  });
});
```

Create: `tests/core/task/hooks/metrics.test.ts`

```typescript
import { MetricsCollectorTaskHook } from '../../../src/core/task/hooks/metrics';
import { TaskContext } from '../../../src/core/task/hooks/base';

describe('MetricsCollectorTaskHook', () => {
  it('should collect and log metrics', async () => {
    const hook = new MetricsCollectorTaskHook();
    const mockContext: TaskContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending' as const,
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 5,
        skillCalls: 3,
        totalTokens: 1000,
      },
      services: {
        streams: { taskExecution: { set: jest.fn() } },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        emit: jest.fn(),
      },
    };

    await hook.preExec(mockContext);
    await hook.postExec(mockContext, { success: true });

    expect(mockContext.services.logger.info).toHaveBeenCalledWith(
      'Task metrics',
      expect.objectContaining({
        taskId: 'test-1',
        llmCalls: 5,
        skillCalls: 3,
        success: true,
      })
    );
  });
});
```

**Step 4: Run tests**

```bash
npm test -- tests/core/task/hooks/user-allow.test.ts tests/core/task/hooks/metrics.test.ts
```

Expected: All tests pass

**Step 5: Update index.ts**

Modify: `src/core/task/hooks/index.ts`

```typescript
export { BaseTaskHook } from './base';
export { TaskHookExecutor } from './executor';
export { DefaultTaskHook } from './default';
export { ContextManagerTaskHook } from './context-manager';
export { UserAllowTaskHook } from './user-allow';
export { MetricsCollectorTaskHook } from './metrics';
export * from './types';
```

**Step 6: Commit**

```bash
git add src/core/task/hooks/ tests/core/task/hooks/
git commit -m "feat(task-hooks): add UserAllowTaskHook and MetricsCollectorTaskHook placeholders"
```

---

## Task 6: Integrate TaskHook into Master-Agent

**Files:**
- Modify: `steps/agents/master-agent.step.ts`
- Test: Manual testing through dev server

**Why:** Connect TaskHook system to actual task execution. This is where hooks get called during real task lifecycle.

**IMPORTANT:** Read existing master-agent.step.ts first to understand current implementation!

**Step 1: Read existing master-agent**

```bash
cd /Users/leo/workspace/myagent/.worktree/task-hook-system
cat steps/agents/master-agent.step.ts
```

Note the structure: event handler, imports, existing task execution logic.

**Step 2: Add TaskHook imports at top**

Add to existing imports in `steps/agents/master-agent.step.ts`:

```typescript
import { TaskHookExecutor } from '../../core/task/hooks/executor';
import { DefaultTaskHook } from '../../core/task/hooks/default';
import { ContextManagerTaskHook } from '../../core/task/hooks/context-manager';
import { UserAllowTaskHook } from '../../core/task/hooks/user-allow';
import { MetricsCollectorTaskHook } from '../../core/task/hooks/metrics';
```

**Step 3: Create helper function to build TaskContext**

Add before the handler function:

```typescript
/**
 * Build TaskContext from event data and Motia services
 */
function buildTaskContext(eventData: any, services: any): any {
  return {
    taskId: eventData.taskId,
    sessionId: eventData.sessionId,
    task: eventData.task,
    status: 'pending',
    context: null,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      llmCalls: 0,
      skillCalls: 0,
      totalTokens: 0,
    },
    services,
  };
}
```

**Step 4: Wrap existing handler logic with TaskHook calls**

Modify the handler function to integrate hooks. The key changes:

1. Create TaskHookExecutor at start
2. Register hooks
3. Build TaskContext
4. Execute pre-hooks BEFORE task logic
5. Start progressing hooks
6. Execute task logic (existing code)
7. Stop progressing hooks
8. Execute post-hooks AFTER task logic

Pseudo-code for modification:

```typescript
export const handler = async (event: any, { logger, emit, streams }) => {
  const { taskId, sessionId, task } = event.data;

  // === NEW: TaskHook setup ===
  const hookExecutor = new TaskHookExecutor();
  hookExecutor.registerHook(new DefaultTaskHook());
  hookExecutor.registerHook(new ContextManagerTaskHook());
  hookExecutor.registerHook(new UserAllowTaskHook());
  hookExecutor.registerHook(new MetricsCollectorTaskHook());

  const taskContext = buildTaskContext(event.data, { streams, logger, emit });

  try {
    // === NEW: Execute pre-hooks ===
    const preResult = await hookExecutor.executePreHooks(taskContext);

    if (preResult.stop) {
      await emit({
        topic: 'agent.task.failed',
        data: { taskId, error: preResult.reason },
      });
      return;
    }

    // === NEW: Update task if modified ===
    taskContext.task = preResult.modifiedTask || task;
    taskContext.status = 'running';

    // === NEW: Start progressing hooks ===
    hookExecutor.startProgressingHooks(taskContext);

    // === EXISTING: Task execution logic ===
    // ... keep existing task execution code here ...
    // Just make sure to update taskContext.metadata.llmCalls etc.

    // === NEW: Stop progressing hooks ===
    hookExecutor.stopProgressingHooks();

    // === NEW: Update status ===
    const result = { success: true, /* existing result */ };
    taskContext.status = result.success ? 'completed' : 'failed';

    // === NEW: Execute post-hooks ===
    await hookExecutor.executePostHooks(taskContext, result);

    // === EXISTING: Emit completion event ===
    await emit({
      topic: result.success ? 'agent.task.completed' : 'agent.task.failed',
      data: { taskId, sessionId, result },
    });

  } catch (error) {
    // === NEW: Clean up hooks on error ===
    hookExecutor.stopProgressingHooks();

    taskContext.status = 'failed';

    await hookExecutor.executePostHooks(taskContext, {
      success: false,
      error: error.message,
    });

    await emit({
      topic: 'agent.task.failed',
      data: { taskId, error: error.message },
    });
  }
};
```

**Step 5: Test manually**

```bash
# Start dev server in worktree
cd /Users/leo/workspace/myagent/.worktree/task-hook-system
npm run dev

# In another terminal, submit a test task
curl -X POST http://localhost:3000/api/tasks/create \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-key" \
  -d '{
    "task": "test task",
    "sessionId": "test-session"
  }'

# Check logs for:
# - "Task started" (DefaultTaskHook.preExec)
# - "Context initialized" (ContextManagerTaskHook.preExec)
# - "Task completed" (DefaultTaskHook.postExec)
# - "Task metrics" (MetricsCollectorTaskHook.postExec)
```

Expected: All hooks execute, logs show hook activity

**Step 6: Commit**

```bash
git add steps/agents/master-agent.step.ts
git commit -m "feat(task-hooks): integrate TaskHook system into master-agent"
```

---

## Task 7: Create TaskHook Configuration File

**Files:**
- Create: `config/task-hooks.config.yaml`

**Why:** Enable/disable hooks via configuration without code changes.

**Step 1: Create configuration file**

Create: `config/task-hooks.config.yaml`

```yaml
# TaskHook global configuration
hooks:
  # Default enabled TaskHooks
  enabled:
    - DefaultTaskHook
    - ContextManagerTaskHook
    - UserAllowTaskHook
    - MetricsCollectorTaskHook

  # Individual Hook configurations
  DefaultTaskHook:
    heartbeatInterval: 30000  # milliseconds

  ContextManagerTaskHook:
    autoCompression: true
    compressionThreshold: 0.8
    maxContextTokens: 100000

  UserAllowTaskHook:
    allowAllMode: true  # Initial implementation: allow all tasks
    strictMode: false  # Future: fail closed on permission errors
    logAttempts: true

  MetricsCollectorTaskHook:
    reportToPrometheus: false
    reportToLogger: true
    includeDetailedTimings: true
```

**Step 2: Commit**

```bash
git add config/task-hooks.config.yaml
git commit -m "feat(task-hooks): add TaskHook configuration file"
```

---

## Task 8: Write Integration Documentation

**Files:**
- Create: `docs/task-hooks-usage.md`
- Modify: `README.md` (add reference)

**Why:** Document how to use TaskHook system for future developers.

**Step 1: Write usage documentation**

Create: `docs/task-hooks-usage.md`

```markdown
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
import { MyCustomHook } from '../../core/task/hooks/my-custom';

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
```

**Step 2: Update README**

Modify: `README.md`

Add to "Features" or "Architecture" section:

```markdown
## Task Hooks

The system supports **Task Hooks** for injecting custom logic into the Agent task lifecycle.

- **preExec**: Before task starts (validation, initialization)
- **postExec**: After task completes (cleanup, logging)
- **onProgressingNotify**: During execution (heartbeat, progress)

See [docs/task-hooks-usage.md](docs/task-hooks-usage.md) for details.
```

**Step 3: Commit**

```bash
git add docs/
git commit -m "docs(task-hooks): add TaskHook usage guide"
```

---

## Task 9: Add TypeScript Type Definitions Export

**Files:**
- Modify: `src/core/task/hooks/index.ts`

**Why:** Make types easily importable for external usage.

**Step 1: Ensure types are exported**

Modify: `src/core/task/hooks/index.ts`

```typescript
// Classes
export { BaseTaskHook } from './base';
export { TaskHookExecutor } from './executor';
export { DefaultTaskHook } from './default';
export { ContextManagerTaskHook } from './context-manager';
export { UserAllowTaskHook } from './user-allow';
export { MetricsCollectorTaskHook } from './metrics';

// Types
export * from './types';
```

**Step 2: Commit**

```bash
git add src/core/task/hooks/index.ts
git commit -m "chore(task-hooks): ensure types are exported"
```

---

## Task 10: Final Integration Test and Validation

**Files:**
- Manual testing through dev server
- Test: `tests/integration/task-hooks.integration.test.ts`

**Why:** End-to-end validation that TaskHook system works correctly with real task execution.

**Step 1: Create integration test**

Create: `tests/integration/task-hooks.integration.test.ts`

```typescript
/**
 * Integration test for TaskHook system
 * Tests actual task execution with hooks
 */

describe('TaskHook Integration', () => {
  it('should execute all hooks during task lifecycle', async () => {
    // This test requires a running Motia dev server
    // Submit a test task and verify hooks execute in order
    // Check logs for hook execution markers
  });
});
```

**Step 2: Run full test suite**

```bash
cd /Users/leo/workspace/myagent/.worktree/task-hook-system
npm test
```

Expected: All tests pass

**Step 3: Manual validation checklist**

- [ ] Start dev server: `npm run dev`
- [ ] Submit test task via API or frontend
- [ ] Verify logs show:
  - [ ] "Task started" (DefaultTaskHook.preExec)
  - [ ] "Context initialized" (ContextManagerTaskHook.preExec)
  - [ ] Progress updates during execution
  - [ ] "Task completed" (DefaultTaskHook.postExec)
  - [ ] "Task metrics" (MetricsCollectorTaskHook.postExec)
- [ ] Verify frontend receives status updates in Stream
- [ ] Test hook error handling (comment out a hook, verify others still run)

**Step 4: Final commit**

```bash
git add .
git commit -m "test(task-hooks): add integration tests and validation"
```

---

## Post-Implementation Checklist

After completing all tasks:

- [ ] All tests pass: `npm test`
- [ ] Manual integration test passes
- [ ] No TypeScript compilation errors
- [ ] Code follows existing patterns (check master-agent.step.ts)
- [ ] Documentation is clear and complete
- [ ] Git history shows clean, logical commits

## Next Steps

After this plan is complete:

1. **Implement full ContextManager** - See `docs/design/context-engineering.md`
2. **Implement SkillHook system** - See `docs/design/skill-hook-system.md`
3. **Implement Notify API** - Bridge for Skill → Motia communication
4. **Add more TaskHook examples** - Caching, rate limiting, retry logic
5. **Add Hook configuration loading** - Read from config/task-hooks.config.yaml

## Related Documentation

- `docs/design/task-hook-system.md` - Complete design document
- `docs/design/skill-hook-system.md` - Skill-level hooks (Python Sandbox)
- `docs/design/context-engineering.md` - Context management design
- `docs/design/multi-turn-conversation-system.md` - Overall system design
- `.cursor/rules/motia/event-steps.mdc` - Motia Event Steps pattern

---

## Notes for Implementation

- **TaskHook runs in TypeScript/Motia system**, NOT in Python Sandbox
- **SkillHook runs in Python Sandbox**, communicates via HTTP to Notify API
- TaskHook has direct access to Motia services (streams, logger, emit)
- Error handling: Hook errors should NOT stop task execution
- Progressing hooks run every 30 seconds by default (configurable)
- Always commit after each task (frequent commits principle)
- Tests first, then implementation (TDD principle)
