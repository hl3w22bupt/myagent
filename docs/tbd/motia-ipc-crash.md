# TBD: Motia IPC Channel Crash 问题

> **状态**: 待解决 | **优先级**: 高 | **创建日期**: 2026-04-11

---

## 问题描述

Motia 进程在执行任务时偶尔发生 `ERR_IPC_CHANNEL_CLOSED` 错误，导致所有后续任务无法执行，需要重启服务才能恢复。

## 复现场景

1. 提交一个包含 ExternalAgent 的 workflow 任务
2. ExternalAgent 进入 HITL 等待状态（`pollHITLResult()` 轮询）
3. 轮询过程阻塞 Motia event handler（最长 10 分钟）
4. Motia 父进程认为子进程无响应，关闭 IPC channel
5. 所有新的任务请求失败，服务不可用

## 根因分析

**核心问题**: `pollHITLResult()` 是同步阻塞轮询（while 循环 + sleep），运行在 Motia event handler 线程中。

- Motia 使用 IPC (Inter-Process Communication) 进行进程间通信
- Event handler 在子进程中执行，需要响应父进程的心跳/消息
- 长时间阻塞（10 分钟）导致 IPC channel 超时关闭
- 一旦 IPC 断开，整个子进程不可用，所有任务受影响

**影响范围**:
- 不仅影响当前任务，阻塞期间所有提交到同一 Motia 实例的任务都会失败
- 前端表现为任务一直 pending，无任何输出
- 后端日志中会出现 `ERR_IPC_CHANNEL_CLOSED` 错误

## 临时规避

- 及时回复 HITL 澄清请求，避免长时间轮询
- 监控任务状态，发现卡住时重启服务

## 可能的解决方案

### 方案 1: 非阻塞轮询

将 HITL 轮询从同步改为异步事件驱动：

```typescript
// 替代 while 循环 + sleep 的方式
// 使用事件监听或回调机制
class HITLWatcher {
  private emitter = new EventEmitter();

  async waitForResponse(taskId: string): Promise<string> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('(timeout)'), 10 * 60 * 1000);
      this.emitter.once(`hitl:${taskId}`, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
  }

  notifyResponse(taskId: string, response: string) {
    this.emitter.emit(`hitl:${taskId}`, response);
  }
}
```

### 方案 2: 将 HITL 轮询移到 Motia 外部

- 在 Motia event handler 中只保存 HITL 状态，立即返回
- 由独立的 watcher 进程负责轮询
- 轮询到结果后通过 Motia event 触发后续流程

### 方案 3: 使用 Motia Cron Step

- 将 HITL 轮询改为 Motia cron step（定时检查）
- 每个 cron 周期检查是否有 HITL 状态需要处理
- 不阻塞 event handler

## 相关文件

- `src/core/agent/agent.ts` — `pollHITLResult()` 实现
- `src/core/agent/external-agent.ts` — `pollHITLResultInternal()` 实现
- `src/core/workflow/engine.ts` — Workflow HITL 轮询

## 历史记录

| 日期 | 事件 |
|------|------|
| 2026-04-11 | 首次发现，task-1775027582785-1 HITL 轮询阻塞导致崩溃 |
| 2026-04-11 | 第二次复现，task-1775905150959-1 再次崩溃 |

---

**注意**: 此问题在 ExternalAgent 场景下更容易复现（因为 ExternalAgent 更频繁触发 HITL），但理论上任何长时间阻塞 Motia event handler 的操作都可能触发。
