# Task Hook System Design

## 概述

本文档描述了Motia框架的Task Hook系统设计，用于管理整个Agent任务的生命周期。与SkillHook不同，TaskHook运行在Motia体系中（TypeScript），可以直接访问所有Motia服务。

## 设计目标

1. **任务生命周期管理**：在任务开始前、结束后、执行中注入自定义逻辑
2. **直接访问Motia服务**：无需跨进程通信，直接调用streams、logger、emit等
3. **进度监控**：支持定时心跳和整体进度报告
4. **上下文集成**：与ContextManager无缝集成，自动管理任务上下文

## 核心架构

### 1. TaskHook基类

**文件位置**：`src/core/task/hooks/base.ts`

```typescript
import { TaskContext } from './types';

export interface TaskContext {
  // 任务基础信息
  taskId: string;
  sessionId: string;
  task: string;

  // 执行状态
  status: 'pending' | 'running' | 'completed' | 'failed';

  // 上下文数据
  context: any;

  // 元数据
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
  };

  // Motia服务引用
  services: {
    streams: any;
    logger: any;
    emit: any;
  };
}

export abstract class BaseTaskHook {
  /**
   * 任务开始前调用
   *
   * 用途：
   * - 初始化任务环境
   * - 验证任务权限
   * - 设置任务配置
   * - 发送初始状态到前端
   *
   * 返回值：
   * - undefined: 继续执行
   * - {stop: true, reason: '...'}: 中断任务
   * - {modifiedTask: '...'}: 修改任务描述
   */
  abstract preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string; modifiedTask?: string }>;

  /**
   * 任务结束后调用
   *
   * 用途：
   * - 清理任务资源
   * - 记录执行统计
   * - 发送完成通知
   * - 更新任务状态
   */
  abstract postExec(context: TaskContext, result: any): Promise<void>;

  /**
   * 任务执行过程中的进度通知（可选）
   *
   * 用途：
   * - 定期发送心跳
   * - 报告整体进度
   * - 监控任务健康状态
   *
   * 默认实现：每30秒发送心跳
   */
  async onProgressingNotify(context: TaskContext): Promise<void> {
    const { taskId, services } = context;

    // 发送心跳到Stream
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'heartbeat',
      message: 'Task is still running...',
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 2. TaskHook执行器

**文件位置**：`src/core/task/hooks/executor.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

export class TaskHookExecutor {
  private hooks: BaseTaskHook[] = [];
  private progressingInterval: NodeJS.Timeout | null = null;

  /**
   * 注册TaskHook
   */
  registerHook(hook: BaseTaskHook): void {
    this.hooks.push(hook);
  }

  /**
   * 执行所有Pre-Exec Hook
   */
  async executePreHooks(context: TaskContext): Promise<{ stop: boolean; reason?: string; modifiedTask?: string }> {
    for (const hook of this.hooks) {
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
    }

    return { stop: false };
  }

  /**
   * 执行所有Post-Exec Hook
   */
  async executePostHooks(context: TaskContext, result: any): Promise<void> {
    for (const hook of this.hooks) {
      await hook.postExec(context, result);
    }
  }

  /**
   * 启动进度Hook（后台运行）
   */
  startProgressingHooks(context: TaskContext): void {
    // 每30秒执行一次进度Hook
    this.progressingInterval = setInterval(async () => {
      for (const hook of this.hooks) {
        try {
          await hook.onProgressingNotify(context);
        } catch (error) {
          context.services.logger.warn('TaskHook progressing failed', { error, taskId: context.taskId });
        }
      }
    }, 30000); // 30秒间隔
  }

  /**
   * 停止进度Hook
   */
  stopProgressingHooks(): void {
    if (this.progressingInterval) {
      clearInterval(this.progressingInterval);
      this.progressingInterval = null;
    }
  }
}
```

### 3. 具体TaskHook实现示例

#### 3.1 默认TaskHook

**文件位置**：`src/core/task/hooks/default.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

/**
 * 默认的TaskHook实现
 * 负责基本的状态管理和进度通知
 */
export class DefaultTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): Promise<void | { stop?: boolean; reason?: string }> {
    const { taskId, task, services } = context;

    // 1. 发送初始状态
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status: 'running',
      message: 'Task started',
      timestamp: new Date().toISOString(),
    });

    // 2. 记录日志
    services.logger.info('Task started', { taskId, task });

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const { taskId, services } = context;

    // 1. 发送完成状态
    const status = result.success ? 'completed' : 'failed';
    await services.streams.taskExecution.set(taskId, taskId, {
      type: 'status',
      status,
      message: result.success ? 'Task completed successfully' : 'Task failed',
      timestamp: new Date().toISOString(),
      data: result,
    });

    // 2. 记录日志
    services.logger.info('Task completed', {
      taskId,
      status,
      executionTime: result.executionTime,
    });
  }

  async onProgressingNotify(context: TaskContext): Promise<void> {
    // 调用基类的心跳实现
    await super.onProgressingNotify(context);

    // 可以添加额外的进度监控逻辑
    const { services, metadata } = context;
    services.logger.debug('Task progress', {
      taskId: context.taskId,
      llmCalls: metadata.llmCalls,
      skillCalls: metadata.skillCalls,
    });
  }
}
```

#### 3.2 上下文管理TaskHook

**文件位置**：`src/core/task/hooks/context-manager.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';
import { ContextManager } from '../../context/manager';

/**
 * 上下文管理TaskHook
 * 负责初始化和保存任务上下文
 */
export class ContextManagerTaskHook extends BaseTaskHook {
  private contextManager: ContextManager;

  constructor() {
    super();
    this.contextManager = new ContextManager();
  }

  async preExec(context: TaskContext): Promise<void> {
    // 1. 创建任务上下文
    const taskContext = await this.contextManager.createTaskContext(
      context.taskId,
      context.sessionId,
      context.task
    );

    // 2. 保存到context中供后续使用
    context.context = taskContext;

    // 3. 发送上下文初始化完成的消息
    await context.services.streams.taskExecution.set(context.taskId, context.taskId, {
      type: 'step',
      message: 'Context initialized',
      currentStep: 'context_init',
      timestamp: new Date().toISOString(),
    });
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // 1. 保存最终的上下文状态
    if (context.context) {
      await this.contextManager.saveContext(context.taskId, context.context);
    }

    // 2. 生成任务摘要
    const summary = await this.contextManager.generateTaskSummary(context.taskId);

    // 3. 记录到日志
    context.services.logger.info('Task context saved', {
      taskId: context.taskId,
      summary,
    });
  }
}
```

#### 3.3 权限验证TaskHook

**文件位置**：`src/core/task/hooks/auth.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

/**
 * 权限验证TaskHook
 * 负责验证用户是否有权限执行任务
 */
export class AuthTaskHook extends BaseTaskHook {
  private userPermissions: Map<string, string[]>;

  constructor() {
    super();
    this.userPermissions = new Map();
    // 从数据库或配置加载权限
    this.loadPermissions();
  }

  private async loadPermissions(): Promise<void> {
    // 加载用户权限配置
    // ...
  }

  async preExec(context: TaskContext): Promise<void | { stop: boolean; reason: string }> {
    const { task, services } = context;
    const userId = context.metadata?.userId;

    if (!userId) {
      return {
        stop: true,
        reason: 'User not authenticated',
      };
    }

    // 检查权限
    const permissions = this.userPermissions.get(userId) || [];
    const hasPermission = await this.checkPermission(task, permissions);

    if (!hasPermission) {
      services.logger.warn('Permission denied', { userId, task });
      return {
        stop: true,
        reason: 'Permission denied: insufficient privileges',
      };
    }

    return undefined;
  }

  private async checkPermission(task: string, permissions: string[]): Promise<boolean> {
    // 实现权限检查逻辑
    // 可以基于任务类型、资源等
    return true;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // Post-exec不需要做任何事
    return Promise.resolve();
  }
}
```

#### 3.4 指标收集TaskHook

**文件位置**：`src/core/task/hooks/metrics.ts`

```typescript
import { BaseTaskHook, TaskContext } from './base';

/**
 * 指标收集TaskHook
 * 负责收集和上报任务执行指标
 */
export class MetricsCollectorTaskHook extends BaseTaskHook {
  private metrics: Map<string, any> = new Map();

  async preExec(context: TaskContext): Promise<void> {
    // 记录任务开始时间
    this.metrics.set(context.taskId, {
      startTime: Date.now(),
      llmCalls: 0,
      skillCalls: 0,
      errors: [],
    });
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    const taskMetrics = this.metrics.get(context.taskId);
    if (!taskMetrics) return;

    // 计算执行时间
    const executionTime = Date.now() - taskMetrics.startTime;

    // 收集指标
    const metrics = {
      taskId: context.taskId,
      executionTime,
      llmCalls: context.metadata.llmCalls,
      skillCalls: context.metadata.skillCalls,
      totalTokens: context.metadata.totalTokens,
      success: result.success,
      error: result.error,
    };

    // 上报到监控系统
    await this.reportMetrics(metrics);

    // 记录到日志
    context.services.logger.info('Task metrics collected', metrics);
  }

  private async reportMetrics(metrics: any): Promise<void> {
    // 上报到监控系统（如Prometheus、DataDog等）
    // ...
  }
}
```

### 4. 在Master-Agent中集成TaskHook

**文件位置**：`steps/agents/master-agent.step.ts`

```typescript
import { TaskHookExecutor } from '../../core/task/hooks/executor';
import { DefaultTaskHook } from '../../core/task/hooks/default';
import { ContextManagerTaskHook } from '../../core/task/hooks/context-manager';
import { AuthTaskHook } from '../../core/task/hooks/auth';
import { MetricsCollectorTaskHook } from '../../core/task/hooks/metrics';

export const handler = async (event: any, { logger, emit, streams }) => {
  const { taskId, sessionId, task } = event.data;

  // 1. 创建TaskHook执行器
  const hookExecutor = new TaskHookExecutor();

  // 2. 注册TaskHook
  hookExecutor.registerHook(new DefaultTaskHook());
  hookExecutor.registerHook(new ContextManagerTaskHook());
  hookExecutor.registerHook(new AuthTaskHook());
  hookExecutor.registerHook(new MetricsCollectorTaskHook());

  // 3. 创建TaskContext
  const taskContext: TaskContext = {
    taskId,
    sessionId,
    task,
    status: 'pending',
    context: null,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      llmCalls: 0,
      skillCalls: 0,
      totalTokens: 0,
    },
    services: {
      streams,
      logger,
      emit,
    },
  };

  try {
    // 4. 执行Pre-Exec Hooks
    const preResult = await hookExecutor.executePreHooks(taskContext);

    if (preResult.stop) {
      await emit({
        topic: 'agent.task.failed',
        data: {
          taskId,
          error: preResult.reason,
        },
      });
      return;
    }

    // 5. 更新任务状态
    taskContext.status = 'running';
    taskContext.task = preResult.modifiedTask || task;

    // 6. 启动进度Hooks
    hookExecutor.startProgressingHooks(taskContext);

    // 7. 执行主任务逻辑
    const result = await executeTask(taskContext, hookExecutor);

    // 8. 停止进度Hooks
    hookExecutor.stopProgressingHooks();

    // 9. 更新任务状态
    taskContext.status = result.success ? 'completed' : 'failed';

    // 10. 执行Post-Exec Hooks
    await hookExecutor.executePostHooks(taskContext, result);

    // 11. 发送完成事件
    await emit({
      topic: result.success ? 'agent.task.completed' : 'agent.task.failed',
      data: {
        taskId,
        sessionId,
        result,
      },
    });

  } catch (error) {
    // 错误处理
    hookExecutor.stopProgressingHooks();

    taskContext.status = 'failed';

    await hookExecutor.executePostHooks(taskContext, {
      success: false,
      error: error.message,
    });

    await emit({
      topic: 'agent.task.failed',
      data: {
        taskId,
        error: error.message,
      },
    });
  }
};

async function executeTask(
  taskContext: TaskContext,
  hookExecutor: TaskHookExecutor
): Promise<any> {
  const { task, services, taskId } = taskContext;

  // 发送步骤进度
  await services.streams.taskExecution.set(taskId, taskId, {
    type: 'step',
    message: 'Generating PTC code...',
    currentStep: 'ptc_generation',
    timestamp: new Date().toISOString(),
  });

  // 更新元数据
  taskContext.metadata.llmCalls += 1;

  // ... 原有的任务执行逻辑
  // ...

  return { success: true, output: '...' };
}
```

### 5. TaskHook配置

**文件位置**：`config/task-hooks.config.yaml`

```yaml
# TaskHook全局配置
hooks:
  # 默认启用的TaskHook
  enabled:
    - DefaultTaskHook
    - ContextManagerTaskHook
    - AuthTaskHook
    - MetricsCollectorTaskHook

  # TaskHook配置
  DefaultTaskHook:
    heartbeatInterval: 30000  # 心跳间隔（毫秒）

  ContextManagerTaskHook:
    autoCompression: true
    compressionThreshold: 0.8
    maxContextTokens: 100000

  AuthTaskHook:
    strictMode: true  # 严格模式：权限不足直接拒绝
    logAttempts: true  # 记录所有权限检查尝试

  MetricsCollectorTaskHook:
    reportToPrometheus: false
    reportToLogger: true
    includeDetailedTimings: true
```

### 6. TaskHook与SkillHook的协作

```
任务开始
  ↓
[TaskHook] preExec()
  ├─ DefaultTaskHook: 发送状态到Stream
  ├─ ContextManagerTaskHook: 初始化上下文
  ├─ AuthTaskHook: 验证权限
  └─ MetricsCollectorTaskHook: 记录开始时间
  ↓
执行主任务
  ├─ LLM生成PTC代码
  ├─ 调用Skill 1
  │   ↓
  │   [SkillHook] pre_exec()
  │   ├─ 验证参数
  │   └─ 准备执行环境
  │   ↓
  │   Skill执行
  │   ├─ executor.report_progress()
  │   │   ↓
  │   │   HTTP POST /api/notify
  │   │   ↓
  │   │   Stream → 前端
  │   ↓
  │   [SkillHook] post_exec()
  │   └─ 处理结果
  ├─ 调用Skill 2
  │   └─ (同样的流程)
  │
  ├─ [TaskHook] onProgressingNotify() (每30秒)
  │   └─ DefaultTaskHook: 发送心跳
  │
  └─ ...
  ↓
任务完成
  ↓
[TaskHook] postExec()
  ├─ DefaultTaskHook: 发送完成状态
  ├─ ContextManagerTaskHook: 保存和压缩上下文
  ├─ AuthTaskHook: (无需操作)
  └─ MetricsCollectorTaskHook: 上报指标
```

## TaskHook vs SkillHook 对比

| 特性 | TaskHook | SkillHook |
|------|-----------|----------|
| **作用域** | 整个Agent任务 | 单个Skill调用 |
| **运行位置** | Motia体系（Node.js） | Python Sandbox |
| **实现语言** | TypeScript | Python |
| **访问权限** | 可访问所有Motia服务 | 只能访问Skill内部数据 |
| **进度报告** | 直接调用Motia Stream | 通过HTTP调用Notify API |
| **典型用途** | 上下文管理、权限验证、指标收集 | 参数验证、结果后处理 |
| **通信方式** | 直接函数调用 | stdout/stderr + HTTP |
| **生命周期** | 任务开始→任务结束 | Skill调用前→Skill调用后 |

## 常见使用场景

### 1. 任务级别的权限控制

```typescript
class AdminOnlyTaskHook extends BaseTaskHook {
  async preExec(context: TaskContext): Promise<void | { stop: boolean; reason: string }> {
    const userId = context.metadata?.userId;
    const isAdmin = await this.checkAdmin(userId);

    if (!isAdmin) {
      return {
        stop: true,
        reason: 'This task requires admin privileges',
      };
    }

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // 无需操作
  }
}
```

### 2. 任务超时控制

```typescript
class TimeoutTaskHook extends BaseTaskHook {
  private timeout: number = 300000; // 5分钟
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  async preExec(context: TaskContext): Promise<void> {
    // 设置超时定时器
    const timeoutHandle = setTimeout(async () => {
      await context.services.emit({
        topic: 'agent.task.failed',
        data: {
          taskId: context.taskId,
          error: 'Task timeout',
        },
      });
    }, this.timeout);

    this.timeoutHandles.set(context.taskId, timeoutHandle);
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // 清除超时定时器
    const timeoutHandle = this.timeoutHandles.get(context.taskId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(context.taskId);
    }
  }
}
```

### 3. 任务结果缓存

```typescript
class CacheTaskHook extends BaseTaskHook {
  private cache: Map<string, any> = new Map();

  async preExec(context: TaskContext): Promise<void | { stop: boolean; modifiedTask: string }> {
    // 检查缓存
    const cacheKey = this.getCacheKey(context.task);
    const cachedResult = this.cache.get(cacheKey);

    if (cachedResult) {
      context.services.logger.info('Cache hit', { taskId: context.taskId });
      context.context = { cachedResult };
      return {
        stop: true,
        reason: 'Task result retrieved from cache',
      };
    }

    return undefined;
  }

  async postExec(context: TaskContext, result: any): Promise<void> {
    // 缓存结果
    if (result.success) {
      const cacheKey = this.getCacheKey(context.task);
      this.cache.set(cacheKey, result);
    }
  }

  private getCacheKey(task: string): string {
    // 生成缓存键
    return `task:${task}`;
  }
}
```

## 错误处理

1. **Hook错误不影响任务执行**
   - PreHook错误：记录日志，继续执行下一个Hook
   - PostHook错误：记录日志，不影响任务结果
   - ProgressingHook错误：静默失败，不中断任务

2. **优雅降级**
   - 如果某个Hook失败，其他Hook仍会执行
   - 任务不会因为单个Hook失败而中断
   - 所有错误都会被记录到日志

## 实现优先级

1. ✅ **Phase 1**: 实现BaseTaskHook和TaskHookExecutor
2. ✅ **Phase 2**: 实现DefaultTaskHook
3. ⏳ **Phase 3**: 实现ContextManagerTaskHook
4. ⏳ **Phase 4**: 在Master-Agent中集成TaskHook
5. ⏳ **Phase 5**: 实现其他高级TaskHook（Auth、Metrics等）
6. ⏳ **Phase 6**: 支持YAML配置

## 相关文档

- [Skill Hook系统设计](./skill-hook-system.md) - Skill级别的Hook系统
- [上下文工程设计](./context-engineering.md) - 任务上下文管理
- [多轮对话系统](./multi-turn-conversation-system.md) - 整体系统设计

## 参考资料

- Motia Framework Documentation
- Design Patterns: Hooks and Middleware
- Netflix Engineering: "Resilience Engineering in Distributed Systems"
