# Agent Hook开发指南

## 概述

Agent Hook系统提供了在Agent生命周期中的干预点，用于监控、状态管理和进度通知。

## 三种Hook的职责

### Task Hook（Session粒度）
- 上下文的完整生命周期管理
- 创建/加载/保存上下文
- Session级别的监控

### Agent Hook（Agent粒度）
- Agent实例的生命周期管理
- Agent级别的状态协调
- 跨任务的Agent行为跟踪

### Skill Hook（Skill粒度）
- 单个技能的执行干预
- 无状态，轻量级

---

## BaseAgentHook接口

所有Agent Hook必须继承`BaseAgentHook`抽象类：

\`\`\`typescript
import { BaseAgentHook } from '@/core/agent/hooks/base';
import { Agent, AgentConfig, AgentResult } from '@/core/agent/types';

export class CustomAgentHook extends BaseAgentHook {
  // Agent创建前调用
  async onAgentCreate(config: AgentConfig, sessionId: string) {
    console.log(\`Agent creating for session: \${sessionId}\`);
  }

  // Agent获取时调用
  async onAgentAcquire(agent: Agent, sessionId: string) {
    console.log(\`Agent acquired for session: \${sessionId}\`);
  }

  // 任务执行前调用
  async onTaskStart(task: string, taskId: string, context: any) {
    console.log(\`Task starting: \${task}\`);
  }

  // 任务执行完成后调用
  async onTaskComplete(result: AgentResult, context: any) {
    console.log(\`Task completed\`);
  }

  // 定期状态检查
  async onAgentStatusCheck(agent: Agent) {
    // 定期健康检查
  }

  // Agent销毁前调用
  async onAgentDestroy(sessionId: string) {
    console.log(\`Agent destroyed\`);
  }
}
\`\`\`

---

## Hook生命周期

\`\`\`
┌─────────────────────────────────────────────────────────┐
│  AgentManager.acquire(sessionId, options)              │
└─────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentCreate (Hook 1)  │ ← Agent不存在时
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentAcquire (Hook 2) │ ← 每次获取Agent时
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │   返回Agent实例          │
            └─────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  agent.run(task, taskId, context)                      │
└─────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onTaskStart (Hook 1)    │ ← 任务开始前
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │   Agent执行任务          │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onTaskComplete (Hook 1) │ ← 任务完成后
            └─────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  AgentManager.release(sessionId)                        │
└─────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentDestroy (Hook 1) │ ← Agent销毁时
            └─────────────────────────┘
\`\`\`

---

## 开发示例

### 示例1: Agent性能监控Hook

\`\`\`typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../types';

export class AgentPerformanceHook extends BaseAgentHook {
  private performanceMetrics = new Map<string, {
    taskCount: number;
    totalExecutionTime: number;
    slowTasks: number;
  }>();

  async onAgentCreate(config: AgentConfig, sessionId: string) {
    this.performanceMetrics.set(sessionId, {
      taskCount: 0,
      totalExecutionTime: 0,
      slowTasks: 0,
    });
  }

  async onTaskStart(task: string, taskId: string, context: any) {
    (context as any)._startTime = Date.now();
  }

  async onTaskComplete(result: AgentResult, context: any) {
    const sessionId = (context as any).sessionId;
    const metrics = this.performanceMetrics.get(sessionId);

    if (metrics) {
      const executionTime = Date.now() - (context as any)._startTime;

      metrics.taskCount++;
      metrics.totalExecutionTime += executionTime;

      // 慢任务阈值：超过30秒
      if (executionTime > 30000) {
        metrics.slowTasks++;
        console.warn(\`[Performance] Slow task detected: \${executionTime}ms\`);
      }
    }
  }

  async onAgentDestroy(sessionId: string) {
    const metrics = this.performanceMetrics.get(sessionId);
    if (metrics) {
      console.log(\`[Performance] Final report for \${sessionId}:\`, metrics);
    }
    this.performanceMetrics.delete(sessionId);
  }
}
\`\`\`

---

## 注册Hook

### 在AgentManager中注册

\`\`\`typescript
import { AgentManager } from './manager';
import { CustomHook } from './hooks/custom';

export class AgentManager {
  private hookManager: AgentHookManager;

  constructor() {
    this.hookManager = new AgentHookManager();

    // 注册自定义Hook
    this.hookManager.register(new CustomHook());
  }
}
\`\`\`

---

## 最佳实践

### 1. Hook职责单一

✅ **好的设计**:
\`\`\`typescript
// 每个Hook只做一件事
class AgentMonitoringHook { /* 只负责监控 */ }
class AgentCacheHook { /* 只负责缓存 */ }
class AgentAuthHook { /* 只负责认证 */ }
\`\`\`

❌ **不好的设计**:
\`\`\`typescript
// 一个Hook做太多事情
class AgentEverythingHook {
  // 监控 + 缓存 + 认证 + 日志...
}
\`\`\`

---

### 2. 错误处理

✅ **好的设计**:
\`\`\`typescript
async onTaskStart(task: string, taskId: string, context: any) {
  try {
    // Hook逻辑
  } catch (error) {
    console.error('Hook failed:', error);
    // 不抛出异常，避免影响其他Hook
  }
}
\`\`\`

---

### 3. 性能考虑

✅ **好的设计**:
\`\`\`typescript
async onAgentStatusCheck(agent: Agent) {
  // 定期检查，但不要太频繁
  const state = agent.getState();
  if (state.conversationHistory.length > 1000) {
    console.warn('Conversation history too large');
  }
}
\`\`\`

---

## 测试Hook

\`\`\`typescript
import { AgentHookManager } from '../manager';
import { CustomHook } from '../custom';

describe('CustomHook', () => {
  it('should execute onTaskStart', async () => {
    const hook = new CustomHook();
    const manager = new AgentHookManager();
    manager.register(hook);

    const context = { sessionId: 'test-1' };
    await manager.executeHook('onTaskStart', 'test-task', 'task-1', context);

    // 验证Hook的行为
    expect(hook['someMethod']).toHaveBeenCalled();
  });
});
\`\`\`

---

## 相关文档

- [Task Hook系统](/docs/design/task-hook-system.md)
- [Skill Hook系统](/docs/design/skill-hook-system.md)
- [多轮对话系统](/docs/design/multi-turn-conversation-system.md)
