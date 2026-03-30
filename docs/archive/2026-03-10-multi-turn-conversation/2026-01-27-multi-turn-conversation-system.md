# 多轮对话系统完整实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 实现完整的多轮对话系统，支持前端Session管理、Agent Hook系统、上下文传递和聊天事件响应

**架构:**
- **前端:** React应用，通过API层与后端通信，使用WebSocket Stream接收实时更新
- **后端:** Motia事件驱动框架，实现Session-scoped Agent实例和Hook系统
- **存储:** Redis缓存 + PostgreSQL持久化，支持上下文压缩和恢复

**技术栈:**
- **前端:** React, Axios, Motia Stream SDK
- **后端:** TypeScript, Motia Framework, Zod
- **数据库:** PostgreSQL, Redis
- **测试:** Jest, Supertest

---

## 📋 总体任务概览

本计划分为4个阶段，共12个主要任务：

### Phase 0: 前置工作修复 (P0 - 关键)
- ✅ **任务1:** 修复前端Session ID传递
- ✅ **任务2:** 实现Agent Hook系统
- ℹ️ **任务3:** Agent常驻模式调研 (已确认低优先级)

### Phase 1: 修复多轮对话核心Bug (P0)
- ✅ **任务4:** 修复上下文传递给LLM
- ✅ **任务5:** 实现Agent监听聊天事件

### Phase 2: 添加测试覆盖 (P1)
- ✅ **任务6:** 多轮对话E2E测试
- ✅ **任务7:** 上下文压缩测试
- ✅ **任务8:** Agent Hook测试

### Phase 3: 性能和用户体验优化 (P2)
- ✅ **任务9:** 性能优化
- ✅ **任务10:** 前端用户体验优化

### Phase 4: 文档完善 (P2)
- ✅ **任务11:** 编写API文档
- ✅ **任务12:** 编写Hook开发指南

---

## Phase 0: 前置工作修复

### 任务1: 修复前端Session ID传递 ⚠️ **P0 - 关键**

**问题分析:**
- 前端在创建任务和发送聊天消息时都没有传递sessionId
- 每次对话都是独立的会话，无法利用上下文历史
- 需要在任务创建时生成sessionId，并在整个对话过程中保持一致

**影响的文件:**
- **修改:** `/Users/leo/workspace/myagent/motia-frontend/src/services/api.js`
- **修改:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/Home.jsx`
- **修改:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx`

#### Step 1: 安装UUID生成库

**命令:** `cd /Users/leo/workspace/myagent/motia-frontend && npm install uuid`

**预期输出:**
```
+ uuid@9.0.1
added 1 package
```

---

#### Step 2: 修改API服务层 - 添加sessionId参数

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/services/api.js`

**修改位置:** 第70-71行，修改sendChatMessage方法

**修改前:**
```javascript
sendChatMessage: (taskId, message) =>
  apiClient.post(`/api/tasks/${taskId}/chat`, { message })
```

**修改后:**
```javascript
sendChatMessage: (taskId, message, sessionId) =>
  apiClient.post(`/api/tasks/${taskId}/chat`, { message, sessionId })
```

**修改位置:** 第85行，修改submitTask方法

**修改前:**
```javascript
submitTask: (task) => apiClient.post('/agent/execute', { task }),
```

**修改后:**
```javascript
submitTask: (task, sessionId) => apiClient.post('/agent/execute', { task, sessionId }),
```

---

#### Step 3: 修改Home页面 - 生成并传递sessionId

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/Home.jsx`

**修改位置:** 第1行之后，添加UUID导入

**添加:**
```javascript
import { v4 as uuidv4 } from 'uuid'
```

**修改位置:** 第45-73行，修改handleSubmit函数

**修改前:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault()

  if (!taskContent.trim()) {
    setError('请输入任务内容')
    return
  }

  setSubmitting(true)
  setError('')

  try {
    const response = await tasksAPI.submitTask(taskContent.trim())

    if (response.data && response.data.taskId) {
      // 清空输入框
      setTaskContent('')
      // 跳转到任务详情页
      navigate(`/tasks/${response.data.taskId}`)
    } else {
      setError('任务提交成功，但返回数据格式不正确')
    }
  } catch (error) {
    console.error('Error submitting task:', error)
    setError('任务提交失败，请稍后重试')
  } finally {
    setSubmitting(false)
  }
}
```

**修改后:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault()

  if (!taskContent.trim()) {
    setError('请输入任务内容')
    return
  }

  setSubmitting(true)
  setError('')

  try {
    // 生成新的sessionId
    const sessionId = uuidv4()
    const response = await tasksAPI.submitTask(taskContent.trim(), sessionId)

    if (response.data && response.data.taskId) {
      // 保存sessionId到sessionStorage
      sessionStorage.setItem(`sessionId_${response.data.taskId}`, sessionId)

      // 清空输入框
      setTaskContent('')
      // 跳转到任务详情页
      navigate(`/tasks/${response.data.taskId}`)
    } else {
      setError('任务提交成功，但返回数据格式不正确')
    }
  } catch (error) {
    console.error('Error submitting task:', error)
    setError('任务提交失败，请稍后重试')
  } finally {
    setSubmitting(false)
  }
}
```

---

#### Step 4: 修改TaskDetail页面 - 管理sessionId

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx`

**修改位置:** 第1行之后，添加UUID导入

**添加:**
```javascript
import { v4 as uuidv4 } from 'uuid'
```

**修改位置:** 第14行之后，添加sessionId state

**添加:**
```javascript
const [sessionId, setSessionId] = useState('')
```

**修改位置:** 第107-182行的useEffect之后，添加新的useEffect来获取sessionId

**添加:**
```javascript
// 获取或生成sessionId
useEffect(() => {
  if (!id) return

  // 1. 尝试从sessionStorage获取
  const storedSessionId = sessionStorage.getItem(`sessionId_${id}`)
  if (storedSessionId) {
    setSessionId(storedSessionId)
    console.log('使用已存在的sessionId:', storedSessionId)
    return
  }

  // 2. 如果没有存储的sessionId，生成新的
  const newSessionId = uuidv4()
  setSessionId(newSessionId)
  sessionStorage.setItem(`sessionId_${id}`, newSessionId)
  console.log('生成新的sessionId:', newSessionId)
}, [id])
```

**修改位置:** 第184-209行，修改handleSendMessage函数

**修改前:**
```javascript
const handleSendMessage = async () => {
  if (!inputValue.trim()) return

  const userMessage = {
    type: 'chat',
    role: 'user',
    content: inputValue,
    timestamp: new Date().toISOString(),
    id: Date.now().toString() // 临时ID
  }

  // 立即显示在UI上（乐观更新）
  setMessages(prev => [...prev, userMessage])
  setChatMessages(prev => [...prev, userMessage])

  // 发送到后端
  try {
    await agentsAPI.sendChatMessage(id, inputValue)
  } catch (error) {
    console.error('发送消息失败:', error)
    alert('发送消息失败，请重试')
  } finally {
    setInputValue('')
  }
}
```

**修改后:**
```javascript
const handleSendMessage = async () => {
  if (!inputValue.trim() || !sessionId) {
    if (!sessionId) {
      console.error('sessionId未初始化')
      alert('会话未初始化，请刷新页面重试')
    }
    return
  }

  const userMessage = {
    type: 'chat',
    role: 'user',
    content: inputValue,
    timestamp: new Date().toISOString(),
    id: Date.now().toString() // 临时ID
  }

  // 立即显示在UI上（乐观更新）
  setMessages(prev => [...prev, userMessage])
  setChatMessages(prev => [...prev, userMessage])

  // 发送到后端，包含sessionId
  try {
    await agentsAPI.sendChatMessage(id, inputValue, sessionId)
    console.log('消息已发送，sessionId:', sessionId)
  } catch (error) {
    console.error('发送消息失败:', error)
    alert('发送消息失败，请重试')
  } finally {
    setInputValue('')
  }
}
```

---

#### Step 5: 验证Session ID传递

**测试步骤:**

1. **启动开发服务器**
   ```bash
   cd /Users/leo/workspace/myagent/motia-frontend
   npm run dev
   ```

2. **打开浏览器开发者工具**
   - 打开Console标签
   - 打开Network标签

3. **创建新任务**
   - 在首页输入任务内容："测试Session ID"
   - 点击提交

4. **验证sessionId生成**
   - 在Console中应该看到："生成新的sessionId: xxx-xxx-xxx"
   - 在Network标签中，查看`/agent/execute`请求的Payload
   - 确认请求体包含: `{"task":"测试Session ID","sessionId":"xxx-xxx-xxx"}`

5. **发送聊天消息**
   - 在任务详情页输入框输入："这是第一条消息"
   - 点击发送

6. **验证sessionId保持一致**
   - 在Network标签中，查看`/api/tasks/{taskId}/chat`请求的Payload
   - 确认请求体包含: `{"message":"这是第一条消息","sessionId":"xxx-xxx-xxx"}`
   - 确认sessionId与任务创建时生成的相同

7. **验证sessionStorage存储**
   - 在开发者工具中，进入Application > Session Storage
   - 确认存在键: `sessionId_{taskId}`
   - 刷新页面，sessionId应该保持不变

**预期结果:**
- ✅ 任务创建时生成新的sessionId
- ✅ sessionId保存到sessionStorage
- ✅ 聊天消息发送时使用相同的sessionId
- ✅ 刷新页面后sessionId保持不变

**如果不通过:**
- 检查Console日志中的错误信息
- 确认uuid库已正确安装
- 确认API请求格式正确

---

#### Step 6: 提交代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add motia-frontend/src/services/api.js motia-frontend/src/pages/Home.jsx motia-frontend/src/pages/TaskDetail.jsx motia-frontend/package.json motia-frontend/package-lock.json
git commit -m "feat: 添加前端Session ID管理和传递

- 在任务创建时生成唯一的sessionId
- 将sessionId保存到sessionStorage以保持会话连续性
- 修改API服务层，支持sessionId参数传递
- 在聊天消息发送时包含sessionId
- 添加uuid库依赖

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**预期输出:**
```
[main xxxxxx] feat: 添加前端Session ID管理和传递
 xxx files changed, xxx insertions(+), xxx deletions(-)
```

---

### 任务2: 实现Agent Hook系统 ⚠️ **P1 - 重要**

**设计目标:**
- Agent级别的生命周期管理
- 跨任务的Agent状态管理
- 会话级别的监控和干预
- 与Task Hook和Skill Hook协同工作

**三种Hook的职责划分:**
```
Task Hook (Session粒度)
  - 上下文的完整生命周期管理
  - 创建/加载/保存上下文
  - session级别的监控
         ↓
Agent Hook (Agent粒度) - 新增
  - Agent实例的生命周期管理
  - Agent级别的状态协调
  - 跨任务的Agent行为跟踪
         ↓
Skill Hook (Skill粒度)
  - 单个技能的执行干预
  - 无状态，轻量级
```

**需要新建的文件:**
- **创建:** `/Users/leo/workspace/myagent/src/core/agent/hooks/base.ts`
- **创建:** `/Users/leo/workspace/myagent/src/core/agent/hooks/manager.ts`
- **创建:** `/Users/leo/workspace/myagent/src/core/agent/hooks/monitoring.ts`
- **创建:** `/Users/leo/workspace/myagent/src/core/agent/hooks/context-sync.ts`
- **创建:** `/Users/leo/workspace/myagent/src/core/agent/hooks/progress-notify.ts`
- **修改:** `/Users/leo/workspace/myagent/src/core/agent/manager.ts`
- **修改:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

---

#### Step 1: 创建BaseAgentHook接口

**文件:** `/Users/leo/workspace/myagent/src/core/agent/hooks/base.ts` (新建)

**完整代码:**
```typescript
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

export interface AgentContext {
  agentId: string;
  sessionId: string;
  agentType: 'agent' | 'master';
  state: any;
  config: AgentConfig;
  taskCount: number;
  createdAt: number;
}

export type HookResult<T = any> = T | undefined | Promise<T | undefined>;

export abstract class BaseAgentHook {
  /**
   * Agent创建前调用
   * @param config Agent配置
   * @param sessionId 会话ID
   * @returns 可以返回{abort: true, reason: 'xxx'}来中止Agent创建
   */
  abstract onAgentCreate(
    config: AgentConfig,
    sessionId: string
  ): HookResult<{ abort?: boolean; reason?: string }>;

  /**
   * Agent获取时调用（可能复用现有Agent）
   * @param agent Agent实例
   * @param sessionId 会话ID
   */
  abstract onAgentAcquire(
    agent: Agent,
    sessionId: string
  ): HookResult<void>;

  /**
   * 任务执行前调用（在Task Hook之前）
   * @param task 任务描述
   * @param taskId 任务ID
   * @param context 任务上下文
   * @returns 可以返回{modifiedTask: 'xxx'}来修改任务
   */
  abstract onTaskStart(
    task: string,
    taskId: string,
    context: Partial<any>
  ): HookResult<{ modifiedTask?: string }>;

  /**
   * 任务执行完成后调用（在Task Hook之后）
   * @param result Agent执行结果
   * @param context 任务上下文
   */
  abstract onTaskComplete(
    result: AgentResult,
    context: any
  ): HookResult<void>;

  /**
   * 定期Agent状态检查
   * @param agent Agent实例
   */
  abstract onAgentStatusCheck(
    agent: Agent
  ): HookResult<void>;

  /**
   * Agent销毁前调用
   * @param sessionId 会话ID
   */
  abstract onAgentDestroy(
    sessionId: string
  ): HookResult<void>;
}
```

**验证:** 文件已创建，包含完整的BaseAgentHook抽象类定义

---

#### Step 2: 创建AgentHookManager

**文件:** `/Users/leo/workspace/myagent/src/core/agent/hooks/manager.ts` (新建)

**完整代码:**
```typescript
import { BaseAgentHook } from './base';

export class AgentHookManager {
  private hooks: BaseAgentHook[] = [];

  /**
   * 注册Hook
   */
  register(hook: BaseAgentHook): void {
    this.hooks.push(hook);
  }

  /**
   * 取消注册Hook
   */
  unregister(hook: BaseAgentHook): void {
    const index = this.hooks.indexOf(hook);
    if (index > -1) {
      this.hooks.splice(index, 1);
    }
  }

  /**
   * 执行所有Hook的指定方法
   */
  async executeHook<T>(
    methodName: keyof BaseAgentHook,
    ...args: any[]
  ): Promise<T | undefined> {
    let result: T | undefined;

    for (const hook of this.hooks) {
      try {
        const method = hook[methodName] as any;
        if (typeof method === 'function') {
          const hookResult = await method.apply(hook, args);
          if (hookResult !== undefined) {
            result = hookResult as T;
          }
        }
      } catch (error) {
        console.error(`Agent hook ${methodName} failed:`, error);
      }
    }

    return result;
  }

  /**
   * 获取所有注册的Hooks
   */
  getHooks(): BaseAgentHook[] {
    return [...this.hooks];
  }
}
```

**验证:** 文件已创建，包含AgentHookManager类实现

---

#### Step 3: 创建AgentMonitoringHook

**文件:** `/Users/leo/workspace/myagent/src/core/agent/hooks/monitoring.ts` (新建)

**完整代码:**
```typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

interface AgentMetrics {
  createdAt: number;
  taskCount: number;
  totalExecutionTime: number;
  errorCount: number;
  lastAcquiredAt?: number;
}

/**
 * Agent监控Hook
 * 职责：监控Agent的健康状态和性能指标
 */
export class AgentMonitoringHook extends BaseAgentHook {
  private metrics = new Map<string, AgentMetrics>();

  async onAgentCreate(config: AgentConfig, sessionId: string) {
    console.log(`[AgentMonitoring] Agent creating for session: ${sessionId}`);
    this.metrics.set(sessionId, {
      createdAt: Date.now(),
      taskCount: 0,
      totalExecutionTime: 0,
      errorCount: 0,
    });
  }

  async onAgentAcquire(agent: Agent, sessionId: string) {
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      metrics.lastAcquiredAt = Date.now();
      console.log(`[AgentMonitoring] Agent acquired for session: ${sessionId}, tasks completed: ${metrics.taskCount}`);
    }
  }

  async onTaskStart(task: string, taskId: string, context: any) {
    // 记录任务开始时间
    (context as any)._startTime = Date.now();
  }

  async onTaskComplete(result: AgentResult, context: any) {
    const sessionId = (context as any).sessionId;
    const metrics = this.metrics.get(sessionId);

    if (metrics) {
      metrics.taskCount++;
      const executionTime = (context as any)._startTime
        ? Date.now() - (context as any)._startTime
        : 0;
      metrics.totalExecutionTime += executionTime;

      if (!result.success) {
        metrics.errorCount++;
      }

      console.log(`[AgentMonitoring] Task completed for session: ${sessionId}, ` +
        `total tasks: ${metrics.taskCount}, errors: ${metrics.errorCount}`);

      // 如果超过错误阈值，可以考虑重启Agent
      if (metrics.errorCount > 5) {
        console.warn(`[AgentMonitoring] Agent error count exceeded threshold: ${sessionId}`);
      }
    }
  }

  async onAgentStatusCheck(agent: Agent) {
    // 定期健康检查
    const state = agent.getState();
    if (state.conversationHistory && state.conversationHistory.length > 1000) {
      console.warn('[AgentMonitoring] Agent conversation history too large:', state.conversationHistory.length);
    }
  }

  async onAgentDestroy(sessionId: string) {
    console.log(`[AgentMonitoring] Agent destroyed for session: ${sessionId}`);
    const metrics = this.metrics.get(sessionId);
    if (metrics) {
      console.log(`[AgentMonitoring] Final metrics for session ${sessionId}:`, {
        taskCount: metrics.taskCount,
        totalExecutionTime: metrics.totalExecutionTime,
        errorCount: metrics.errorCount,
      });
    }
    this.metrics.delete(sessionId);
  }

  /**
   * 获取Agent指标（用于测试和调试）
   */
  getMetrics(sessionId: string): AgentMetrics | undefined {
    return this.metrics.get(sessionId);
  }
}
```

**验证:** 文件已创建，包含Agent监控Hook实现

---

#### Step 4: 创建AgentContextSyncHook

**文件:** `/Users/leo/workspace/myagent/src/core/agent/hooks/context-sync.ts` (新建)

**完整代码:**
```typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

/**
 * Agent上下文同步Hook
 * 职责：确保Agent内存状态与数据库上下文同步
 */
export class AgentContextSyncHook extends BaseAgentHook {
  async onAgentCreate(config: AgentConfig, sessionId: string) {
    // Agent创建时不需要特殊处理
    console.log(`[AgentContextSync] Agent created for session: ${sessionId}`);
  }

  async onAgentAcquire(agent: Agent, sessionId: string) {
    // Agent获取时，确保从最新的上下文恢复
    console.log(`[AgentContextSync] Agent acquired for session: ${sessionId}`);
    // Task Hook的preExec会处理上下文加载
  }

  async onTaskStart(task: string, taskId: string, context: any) {
    // 任务开始前，不需要额外同步（Task Hook会处理）
    console.log(`[AgentContextSync] Task starting: ${taskId}`);
  }

  async onTaskComplete(result: AgentResult, context: any) {
    // 任务完成后，确保Agent状态已同步到数据库
    // Task Hook的postExec已经处理了conversationHistory同步
    console.log(`[AgentContextSync] Task completed: ${(context as any).taskId}`);
  }

  async onAgentStatusCheck(agent: Agent) {
    // 定期检查Agent状态与数据库一致性
    const state = agent.getState();
    const sessionId = agent.sessionId;

    if (sessionId && state.conversationHistory) {
      console.log(`[AgentContextSync] Status check for session ${sessionId}: ` +
        `${state.conversationHistory.length} messages in memory`);
    }
  }

  async onAgentDestroy(sessionId: string) {
    // Agent销毁前，确保所有状态已保存
    console.log(`[AgentContextSync] Agent destroyed for session: ${sessionId}`);
    // AgentManager会处理cleanup
  }
}
```

**验证:** 文件已创建，包含上下文同步Hook实现

---

#### Step 5: 创建AgentProgressNotifyHook

**文件:** `/Users/leo/workspace/myagent/src/core/agent/hooks/progress-notify.ts` (新建)

**完整代码:**
```typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

/**
 * Agent进度通知Hook
 * 职责：将Agent关键行动实时通过Stream反馈给前端
 */
export class AgentProgressNotifyHook extends BaseAgentHook {
  private streams: any;

  constructor(streams: any) {
    super();
    this.streams = streams;
  }

  async onAgentCreate(config: AgentConfig, sessionId: string) {
    await this.sendNotification(sessionId, {
      progressType: 'status',
      type: 'agent',
      message: `Agent created for session: ${sessionId}`,
      timestamp: Date.now(),
    });
  }

  async onAgentAcquire(agent: Agent, sessionId: string) {
    const agentInfo = agent.getInfo();
    await this.sendNotification(sessionId, {
      progressType: 'step',
      type: 'agent',
      message: `Agent acquired: ${agentInfo.agentType}`,
      data: {
        agentType: agentInfo.agentType,
        conversationLength: agent.getState().conversationHistory?.length || 0,
      },
      timestamp: Date.now(),
    });
  }

  async onTaskStart(task: string, taskId: string, context: any) {
    await this.sendNotification(taskId, {
      progressType: 'step',
      type: 'agent',
      message: 'Agent started processing task',
      data: {
        taskPreview: task.substring(0, 100) + (task.length > 100 ? '...' : ''),
        taskId,
      },
      timestamp: Date.now(),
    });
  }

  async onTaskComplete(result: AgentResult, context: any) {
    await this.sendNotification((context as any).taskId, {
      progressType: 'status',
      type: 'agent',
      message: 'Agent completed task',
      data: {
        success: result.success,
        hasResponse: !!(result.response || result.text),
        responseLength: result.response?.length || result.text?.length || 0,
      },
      timestamp: Date.now(),
    });
  }

  async onAgentStatusCheck(agent: Agent) {
    const state = agent.getState();
    const sessionId = agent.sessionId;

    // 只在长时间运行时发送心跳（避免过于频繁）
    const runningTime = Date.now() - (state.createdAt || Date.now());
    if (sessionId && runningTime > 30000) { // 超过30秒才开始发送心跳
      await this.sendNotification(sessionId, {
        progressType: 'heartbeat',
        type: 'agent',
        message: 'Agent is still processing',
        data: {
          conversationLength: state.conversationHistory?.length || 0,
          executionCount: state.executionHistory?.length || 0,
          runningTime,
        },
        timestamp: Date.now(),
      });
    }
  }

  async onAgentDestroy(sessionId: string) {
    await this.sendNotification(sessionId, {
      progressType: 'status',
      type: 'agent',
      message: 'Agent destroyed',
      data: {
        reason: 'cleanup',
      },
      timestamp: Date.now(),
    });
  }

  /**
   * 发送通知到Stream
   */
  private async sendNotification(targetId: string, data: any): Promise<void> {
    try {
      if (this.streams && this.streams.taskExecution) {
        const uniqueId = `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        await this.streams.taskExecution.set(targetId, uniqueId, {
          ...data,
          source: 'AgentProgressNotifyHook',
          timestamp: new Date(data.timestamp).toISOString(),
        });
      }
    } catch (error) {
      // 静默失败，不影响主流程
      console.error('[AgentProgressNotifyHook] Failed to send notification:', error);
    }
  }
}
```

**验证:** 文件已创建，包含进度通知Hook实现

---

#### Step 6: 修改AgentManager - 集成Hook系统

**文件:** `/Users/leo/workspace/myagent/src/core/agent/manager.ts`

**需要先读取文件了解当前实现:**

```bash
# 查看manager.ts的行数
wc -l /Users/leo/workspace/myagent/src/core/agent/manager.ts
```

**修改方案:**

**Step 6.1: 在文件开头添加导入**

**添加在现有导入之后:**
```typescript
import { AgentHookManager } from './hooks/manager';
import { AgentMonitoringHook } from './hooks/monitoring';
import { AgentContextSyncHook } from './hooks/context-sync';
import { AgentProgressNotifyHook } from './hooks/progress-notify';
```

**Step 6.2: 修改AgentManager类，添加hookManager属性**

**在AgentManager类的constructor中添加:**
```typescript
export class AgentManager {
  private sessions: Map<string, Agent> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private hookManager: AgentHookManager;
  private streams: any;

  constructor(streams?: any) {
    // 初始化Hook管理器
    this.hookManager = new AgentHookManager();
    this.streams = streams;

    // 注册默认Hooks
    this.hookManager.register(new AgentMonitoringHook());
    this.hookManager.register(new AgentContextSyncHook());

    // 如果提供了streams，注册进度通知Hook
    if (streams) {
      this.hookManager.register(new AgentProgressNotifyHook(streams));
    }
  }

  // 更新streams（用于在运行时设置）
  setStreams(streams: any): void {
    this.streams = streams;
    // 检查是否已注册AgentProgressNotifyHook，如果没有则注册
    const hooks = this.hookManager.getHooks();
    const hasProgressHook = hooks.some(
      (hook: any) => hook instanceof AgentProgressNotifyHook
    );
    if (!hasProgressHook) {
      this.hookManager.register(new AgentProgressNotifyHook(streams));
    }
  }

  getStreams(): any {
    return this.streams;
  }
}
```

**Step 6.3: 修改acquire方法，集成Agent Hooks**

**在acquire方法中添加Hook调用:**
```typescript
async acquire(sessionId: string, options: any = {}): Promise<Agent> {
  // 检查是否已有Agent实例
  let agent = this.sessions.get(sessionId);

  if (!agent) {
    // 1. 触发Agent Hook: onAgentCreate
    const createResult = await this.hookManager.executeHook(
      'onAgentCreate',
      options,
      sessionId
    );

    if (createResult?.abort) {
      throw new Error(`Agent creation aborted: ${createResult.reason}`);
    }

    // 2. 创建新Agent
    agent = this.createAgent(sessionId, options);
    this.sessions.set(sessionId, agent);

    console.log(`[AgentManager] Created new ${options.agentType || 'agent'} for session: ${sessionId}`);
  }

  // 3. 触发Agent Hook: onAgentAcquire
  await this.hookManager.executeHook('onAgentAcquire', agent, sessionId);

  // 4. 更新活跃时间
  this.lastActivity.set(sessionId, Date.now());

  return agent;
}
```

**Step 6.4: 修改release方法，集成Agent Hooks**

**在release方法中添加Hook调用:**
```typescript
async release(sessionId: string): Promise<void> {
  const agent = this.sessions.get(sessionId);
  if (agent) {
    // 触发Agent Hook: onAgentDestroy
    await this.hookManager.executeHook('onAgentDestroy', sessionId);

    // 清理Agent
    await agent.cleanup();
    this.sessions.delete(sessionId);
    this.lastActivity.delete(sessionId);

    console.log(`[AgentManager] Released agent for session: ${sessionId}`);
  }
}
```

**验证:** AgentManager已成功集成Agent Hook系统

---

#### Step 7: 修改MasterAgent Step - 使用Agent Hooks

**文件:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

**修改位置:** 第227-241行，在Agent获取之后添加Hook调用

**修改前:**
```typescript
// Get Agent or MasterAgent from Manager
// each session has independent Agent/MasterAgent instance
const agent = await agentManager.acquire(sessionId, {
  agentType,
});

// Verify agent type
const agentTypeName = agent.constructor.name;
logger.info('Agent acquired', {
  sessionId,
  agentType: agentTypeName,
  isMasterAgent: agentTypeName === 'MasterAgent',
});
```

**修改后:**
```typescript
// Get Agent or MasterAgent from Manager
// each session has independent Agent/MasterAgent instance
const agent = await agentManager.acquire(sessionId, {
  agentType,
});

// Verify agent type
const agentTypeName = agent.constructor.name;
logger.info('Agent acquired', {
  sessionId,
  agentType: agentTypeName,
  isMasterAgent: agentTypeName === 'MasterAgent',
});

// 确保AgentManager可以访问streams（用于进度通知）
if (!agentManager.getStreams()) {
  agentManager.setStreams(_streams);
}
```

**修改位置:** 第267-271行，在任务执行之前添加Agent Hook调用

**修改前:**
```typescript
// === Start progressing hooks ===
hookExecutor.startProgressingHooks(taskContext);
logger.info('Progressing hooks started', { taskId });

const result = await agent.run(taskContext.task, taskId, taskContext.context);
```

**修改后:**
```typescript
// === Start progressing hooks ===
hookExecutor.startProgressingHooks(taskContext);
logger.info('Progressing hooks started', { taskId });

// 触发Agent Hook: onTaskStart
const agentHookManager = (agent as any).hookManager;
if (agentHookManager) {
  const taskStartResult = await agentHookManager.executeHook(
    'onTaskStart',
    taskContext.task,
    taskId,
    taskContext
  );

  // 如果Hook修改了任务，使用修改后的任务
  if (taskStartResult?.modifiedTask) {
    taskContext.task = taskStartResult.modifiedTask;
    logger.info('Task modified by Agent Hook', { taskId, modifiedTask: taskStartResult.modifiedTask });
  }
}

const result = await agent.run(taskContext.task, taskId, taskContext.context);
```

**修改位置:** 第280-293行，在任务执行之后添加Agent Hook调用

**修改前:**
```typescript
// === Stop progressing hooks ===
hookExecutor.stopProgressingHooks();
logger.info('Progressing hooks stopped', { taskId });

// === Execute post-hooks ===
logger.info('Executing post-execution hooks', { taskId});
taskContext.status = result.success ? 'completed' : 'failed';
await hookExecutor.executePostHooks(taskContext, {
  success: result.success,
  executionTime: result.executionTime,
  output: result.output,
  error: result.error,
  metadata: result.metadata,
});
```

**修改后:**
```typescript
// === Stop progressing hooks ===
hookExecutor.stopProgressingHooks();
logger.info('Progressing hooks stopped', { taskId });

// 触发Agent Hook: onTaskComplete
if (agentHookManager) {
  await agentHookManager.executeHook(
    'onTaskComplete',
    result,
    taskContext
  );
}

// === Execute post-hooks ===
logger.info('Executing post-execution hooks', { taskId});
taskContext.status = result.success ? 'completed' : 'failed';
await hookExecutor.executePostHooks(taskContext, {
  success: result.success,
  executionTime: result.executionTime,
  output: result.output,
  error: result.error,
  metadata: result.metadata,
});
```

**验证:** MasterAgent已成功集成Agent Hook调用

---

#### Step 8: 测试Agent Hook系统

**测试代码文件:** `/Users/leo/workspace/myagent/tests/agent-hooks.test.ts` (新建)

**完整代码:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentHookManager } from '../src/core/agent/hooks/manager';
import { AgentMonitoringHook } from '../src/core/agent/hooks/monitoring';
import { BaseAgentHook } from '../src/core/agent/hooks/base';

describe('Agent Hook System', () => {
  describe('AgentHookManager', () => {
    it('should register and unregister hooks', () => {
      const hookManager = new AgentHookManager();
      const hook = new AgentMonitoringHook();

      hookManager.register(hook);
      expect(hookManager.getHooks()).toHaveLength(1);

      hookManager.unregister(hook);
      expect(hookManager.getHooks()).toHaveLength(0);
    });

    it('should execute hooks in order', async () => {
      const executionOrder: string[] = [];

      class TestHook extends BaseAgentHook {
        async onAgentCreate() {
          executionOrder.push('create');
        }
        async onAgentAcquire() {
          executionOrder.push('acquire');
        }
        async onTaskStart() {
          executionOrder.push('task-start');
        }
        async onTaskComplete() {
          executionOrder.push('task-complete');
        }
        async onAgentDestroy() {
          executionOrder.push('destroy');
        }
      }

      const hookManager = new AgentHookManager();
      hookManager.register(new TestHook());

      // 模拟Agent生命周期
      await hookManager.executeHook('onAgentCreate', {}, 'session-1');
      await hookManager.executeHook('onAgentAcquire', {}, 'session-1');
      await hookManager.executeHook('onTaskStart', 'test-task', 'task-1', {});
      await hookManager.executeHook('onTaskComplete', {}, {});
      await hookManager.executeHook('onAgentDestroy', 'session-1');

      expect(executionOrder).toEqual([
        'create', 'acquire', 'task-start', 'task-complete', 'destroy'
      ]);
    });
  });

  describe('AgentMonitoringHook', () => {
    let monitoringHook: AgentMonitoringHook;

    beforeEach(() => {
      monitoringHook = new AgentMonitoringHook();
    });

    it('should track agent metrics', async () => {
      await monitoringHook.onAgentCreate({}, 'session-1');
      await monitoringHook.onAgentAcquire({}, 'session-1');

      const context: any = { sessionId: 'session-1' };
      await monitoringHook.onTaskStart('task-1', 'task-1', context);

      context._startTime = Date.now();
      await monitoringHook.onTaskComplete({ success: true }, context);
      await monitoringHook.onTaskComplete({ success: false }, context);

      const metrics = monitoringHook.getMetrics('session-1');
      expect(metrics).toBeDefined();
      expect(metrics?.taskCount).toBe(2);
      expect(metrics?.errorCount).toBe(1);
    });

    it('should clean up metrics on destroy', async () => {
      await monitoringHook.onAgentCreate({}, 'session-1');
      await monitoringHook.onAgentDestroy('session-1');

      const metrics = monitoringHook.getMetrics('session-1');
      expect(metrics).toBeUndefined();
    });
  });
});
```

**运行测试:**
```bash
cd /Users/leo/workspace/myagent
npm test -- tests/agent-hooks.test.ts
```

**预期结果:** 所有测试通过

---

#### Step 9: 前端展示Agent进度消息

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx`

**修改位置:** 第626-781行，修改MessageBubble组件以支持Agent类型消息

**在MessageBubble组件中添加Agent消息处理:**

```javascript
// 在getTypeIcon函数中添加agent类型的处理
const getTypeIcon = () => {
  if (message.type === 'agent') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )
  }
  // ... 其他类型处理
}
```

**在MessageBubble的return语句中添加Agent消息样式处理:**

```javascript
// Agent消息的特殊处理
if (message.type === 'agent') {
  return (
    <div className="chat-bubble agent">
      <div className="chat-avatar">
        {typeIcon}
      </div>
      <div className="chat-content">
        <div className="chat-message-header">
          <span className="chat-status-badge" style={{
            color: '#8B5CF6',
            backgroundColor: '#EDE9FE'
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>Agent</span>
          </span>
          <span className="chat-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div className="chat-message">{message.message}</div>
        {message.data && (
          <div className="agent-details">
            {message.data.agentType && <span className="agent-badge">Type: {message.data.agentType}</span>}
            {message.data.conversationLength && (
              <span className="agent-badge">Messages: {message.data.conversationLength}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ... 其他消息类型处理
```

**在CSS文件中添加Agent消息样式:**

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.css`

**添加:**
```css
.chat-bubble.agent {
  background: linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%);
  border-left: 3px solid #8B5CF6;
}

.agent-details {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.agent-badge {
  padding: 2px 8px;
  background: #8B5CF6;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}
```

**验证:** 前端能够正确显示Agent进度消息

---

#### Step 10: 提交Agent Hook系统代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add src/core/agent/hooks/ src/core/agent/manager.ts steps/agents/master-agent.step.ts tests/agent-hooks.test.ts motia-frontend/src/pages/TaskDetail.jsx motia-frontend/src/pages/TaskDetail.css
git commit -m "feat: 实现Agent Hook系统

- 创建BaseAgentHook接口定义
- 实现AgentHookManager管理器
- 添加AgentMonitoringHook监控Agent健康状态
- 添加AgentContextSyncHook同步上下文状态
- 添加AgentProgressNotifyHook实时通知Agent进度
- 集成Agent Hook到AgentManager和MasterAgent
- 前端支持显示Agent类型消息
- 添加Agent Hook系统单元测试

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**预期输出:**
```
[main xxxxxx] feat: 实现Agent Hook系统
 xxx files changed, xxx insertions(+), xxx deletions(-)
```

---

## Phase 1: 修复多轮对话核心Bug

### 任务4: 修复上下文传递给LLM ⚠️ **P0**

**问题分析:**
- `ContextManager.getContextForLLM()`方法已实现但未被调用
- Agent执行任务时没有使用历史上下文
- 需要在agent.run()调用前获取上下文并添加到任务中

**影响的文件:**
- **修改:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

---

#### Step 1: 在MasterAgent中导入ContextManager

**文件:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

**修改位置:** 第18-26行，添加ContextManager导入

**修改前:**
```typescript
import {
  TaskHookExecutor,
  DefaultTaskHook,
  ContextManagerTaskHook,
  UserAllowTaskHook,
  MetricsCollectorTaskHook,
  TaskContext,
} from '../../src/core/task/hooks/index';
```

**修改后:**
```typescript
import {
  TaskHookExecutor,
  DefaultTaskHook,
  ContextManagerTaskHook,
  UserAllowTaskHook,
  MetricsCollectorTaskHook,
  TaskContext,
} from '../../src/core/task/hooks/index';
import { ContextManager } from '../../src/core/context/manager';
```

**验证:** ContextManager已导入

---

#### Step 2: 在agent.run()前获取上下文并添加到任务

**文件:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

**修改位置:** 第267-271行，在agent.run()调用之前

**修改前:**
```typescript
// === Start progressing hooks ===
hookExecutor.startProgressingHooks(taskContext);
logger.info('Progressing hooks started', { taskId });

// 触发Agent Hook: onTaskStart
const agentHookManager = (agent as any).hookManager;
if (agentHookManager) {
  const taskStartResult = await agentHookManager.executeHook(
    'onTaskStart',
    taskContext.task,
    taskId,
    taskContext
  );

  // 如果Hook修改了任务，使用修改后的任务
  if (taskStartResult?.modifiedTask) {
    taskContext.task = taskStartResult.modifiedTask;
    logger.info('Task modified by Agent Hook', { taskId, modifiedTask: taskStartResult.modifiedTask });
  }
}

const result = await agent.run(taskContext.task, taskId, taskContext.context);
```

**修改后:**
```typescript
// === Start progressing hooks ===
hookExecutor.startProgressingHooks(taskContext);
logger.info('Progressing hooks started', { taskId });

// === 获取历史上下文 ===
const contextManager = new ContextManager();
const contextStr = await contextManager.getContextForLLM(taskId);

// 将上下文添加到任务描述中
const taskWithContext = contextStr
  ? `## Conversation History\n${contextStr}\n\n## Current Task\n${taskContext.task}`
  : taskContext.task;

if (contextStr) {
  logger.info('Loaded conversation history for task', {
    taskId,
    contextLength: contextStr.length,
  });
}

// 触发Agent Hook: onTaskStart
const agentHookManager = (agent as any).hookManager;
if (agentHookManager) {
  const taskStartResult = await agentHookManager.executeHook(
    'onTaskStart',
    taskWithContext,
    taskId,
    taskContext
  );

  // 如果Hook修改了任务，使用修改后的任务
  if (taskStartResult?.modifiedTask) {
    taskContext.task = taskStartResult.modifiedTask;
    logger.info('Task modified by Agent Hook', { taskId, modifiedTask: taskStartResult.modifiedTask });
  }
}

const result = await agent.run(taskWithContext, taskId, taskContext.context);
```

**验证:** 上下文字符串已添加到任务中并传递给Agent

---

#### Step 3: 测试上下文传递

**测试步骤:**

1. **创建新任务**
   ```bash
   curl -X POST http://localhost:3000/agent/execute \
     -H "Content-Type: application/json" \
     -d '{"task": "我的名字是Leo", "sessionId": "test-context-1"}'
   ```

2. **等待任务完成**

3. **发送第一条聊天消息**
   ```bash
   curl -X POST http://localhost:3000/api/tasks/{taskId}/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "我叫什么名字?", "sessionId": "test-context-1"}'
   ```

4. **验证Agent回复**
   - Agent应该回复:"你的名字是Leo"
   - 检查日志，确认上下文被加载

**预期结果:**
- ✅ Agent回复包含历史对话信息
- ✅ 日志显示"Loaded conversation history for task"
- ✅ Agent能够回答基于上下文的问题

**如果不通过:**
- 检查ContextManager.getContextForLLM()实现
- 检查数据库中是否有上下文数据
- 检查日志中的错误信息

---

#### Step 4: 提交代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add steps/agents/master-agent.step.ts
git commit -m "fix: Agent执行时加载历史上下文

- 在agent.run()前调用ContextManager.getContextForLLM()
- 将上下文添加到任务描述中
- Agent现在可以访问对话历史并回答相关问题

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**预期输出:**
```
[main xxxxxx] fix: Agent执行时加载历史上下文
 1 file changed, xxx insertions(+), xxx deletions(-)
```

---

### 任务5: 实现Agent监听聊天事件 ⚠️ **P0**

**问题分析:**
- 当前chat API只发送消息到Stream，Agent不响应
- 需要让Agent监听chat事件并回复
- MasterAgent需要订阅agent.task.chat事件

**影响的文件:**
- **修改:** `/Users/leo/workspace/myagent/steps/api/task-chat-api.step.ts`
- **修改:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

---

#### Step 1: 修改task-chat-api发送事件

**文件:** `/Users/leo/workspace/myagent/steps/api/task-chat-api.step.ts`

**修改位置:** 第27行，添加emits配置

**修改前:**
```typescript
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'task-chat-api',
  description: 'API endpoint for sending chat messages to a specific task',

  /**
   * API route configuration.
   */
  path: '/api/tasks/:id/chat',
  method: 'POST',

  /**
   * No events emitted.
   */
  emits: [],
```

**修改后:**
```typescript
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'task-chat-api',
  description: 'API endpoint for sending chat messages to a specific task',

  /**
   * API route configuration.
   */
  path: '/api/tasks/:id/chat',
  method: 'POST',

  /**
   * Emit chat event for Agent to process.
   */
  emits: ['agent.task.chat'],
```

**修改位置:** 第55行，添加emit参数到handler函数

**修改前:**
```typescript
export const handler = async (request: any, { logger, streams }: any) => {
```

**修改后:**
```typescript
export const handler = async (request: any, { logger, streams, emit }: any) => {
```

**修改位置:** 第174-189行，在返回成功响应之前发送事件

**修改前:**
```typescript
    logger.info('Task Chat API: Message processing complete', { taskId, message });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Message sent successfully',
        data: {
          taskId,
          message,
          timestamp: new Date().toISOString(),
        },
      },
    };
```

**修改后:**
```typescript
    logger.info('Task Chat API: Message processing complete', { taskId, message });

    // 发送chat事件让Agent处理
    await emit({
      topic: 'agent.task.chat',
      data: {
        taskId,
        sessionId: request.body?.sessionId || '',
        message,
        timestamp: new Date().toISOString(),
      },
    });

    logger.info('Task Chat API: Chat event emitted', { taskId, message });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Message sent successfully',
        data: {
          taskId,
          message,
          timestamp: new Date().toISOString(),
        },
      },
    };
```

**验证:** task-chat-api现在会发送agent.task.chat事件

---

#### Step 2: MasterAgent订阅chat事件

**文件:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

**修改位置:** 第83-90行，添加chat事件订阅

**修改前:**
```typescript
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute'],
  emits: ['agent.task.completed', 'agent.task.failed'],
  flows: ['agent-workflow'],
};
```

**修改后:**
```typescript
export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute', 'agent.task.chat'],
  emits: ['agent.task.completed', 'agent.task.failed'],
  flows: ['agent-workflow'],
};
```

**验证:** MasterAgent现在订阅agent.task.chat事件

---

#### Step 3: 实现聊天消息处理逻辑

**文件:** `/Users/leo/workspace/myagent/steps/agents/master-agent.step.ts`

**修改位置:** 第101-107行，在handler函数开始处添加chat事件处理

**在现有的taskId和sessionId获取逻辑之后添加:**
```typescript
export const handler = async (
  input: _z.infer<typeof inputSchema>,
  { emit, logger, state: _state, streams: _streams }: any
) => {
  // === 处理聊天消息 ===
  if (input.topic === 'agent.task.chat') {
    const { taskId, sessionId, message } = input.data;

    logger.info('Master Agent: Processing chat message', {
      taskId,
      sessionId,
      message: message.substring(0, 50),
    });

    // 如果没有sessionId，返回错误
    if (!sessionId) {
      logger.error('Chat message missing sessionId', { taskId });
      return {
        success: false,
        error: 'Session ID is required for chat messages',
      };
    }

    try {
      // 获取Agent实例
      const agent = await agentManager.acquire(sessionId, {
        agentType: 'master',
      });

      logger.info('Agent acquired for chat', {
        sessionId,
        agentType: agent.constructor.name,
      });

      // 获取上下文
      const contextManager = new ContextManager();
      const context = await contextManager.getContext(taskId);
      const contextStr = await contextManager.getContextForLLM(taskId);

      logger.info('Context loaded for chat', {
        taskId,
        hasContext: !!contextStr,
        contextLength: contextStr?.length || 0,
      });

      // 构造聊天提示词
      const chatPrompt = contextStr
        ? `## Conversation History\n${contextStr}\n\n## User Message\n${message}`
        : message;

      // 触发Agent Hook: onTaskStart
      const agentHookManager = (agent as any).hookManager;
      if (agentHookManager) {
        await agentHookManager.executeHook(
          'onTaskStart',
          chatPrompt,
          taskId,
          context
        );
      }

      // 执行Agent回复
      logger.info('Agent starting chat response', { taskId, sessionId });
      const result = await agent.run(chatPrompt, taskId, context);

      logger.info('Agent chat response completed', {
        taskId,
        success: result.success,
        hasResponse: !!(result.response || result.text),
      });

      // 触发Agent Hook: onTaskComplete
      if (agentHookManager) {
        await agentHookManager.executeHook(
          'onTaskComplete',
          result,
          context
        );
      }

      // 发送回复到Stream
      const timestamp = Date.now();
      const uniqueId = `${taskId}-chat-${timestamp}-${Math.random().toString(36).substring(2, 9)}`;
      const responseContent = result.response || result.text || '抱歉，我没有生成回复。';

      await _streams.taskExecution.set(taskId, uniqueId, {
        progressType: 'chat',
        type: 'chat',
        role: 'assistant',
        content: responseContent,
        timestamp: new Date(timestamp).toISOString(),
      });

      logger.info('Chat response sent to stream', { taskId, uniqueId });

      // 保存用户消息到上下文
      await contextManager.addMessage(context, {
        role: 'user',
        content: message,
        metadata: { timestamp: new Date() },
      });

      // 保存Agent回复到上下文
      await contextManager.addMessage(context, {
        role: 'assistant',
        content: responseContent,
        metadata: { timestamp: new Date() },
      });

      logger.info('Chat messages saved to context', { taskId });

      return {
        success: true,
        taskId,
        sessionId,
        response: responseContent,
      };
    } catch (error: any) {
      logger.error('Chat processing failed', {
        error: error.message,
        stack: error.stack,
        taskId,
        sessionId,
      });

      // 发送错误消息到Stream
      const timestamp = Date.now();
      const uniqueId = `${taskId}-chat-error-${timestamp}`;
      await _streams.taskExecution.set(taskId, uniqueId, {
        progressType: 'chat',
        type: 'error',
        role: 'assistant',
        content: `抱歉，处理消息时出错: ${error.message}`,
        timestamp: new Date(timestamp).toISOString(),
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // === 处理正常任务执行（现有代码） ===
  // Get or create sessionId
  const sessionId = input.sessionId || uuidv4();
  // ... 继续现有代码
```

**注意:** 需要确保在chat事件处理分支中也初始化了必要的数据结构。

**验证:** MasterAgent现在可以处理聊天消息并回复

---

#### Step 4: 测试聊天事件响应

**测试步骤:**

1. **确保开发服务器运行**
   ```bash
   cd /Users/leo/workspace/myagent
   npm run dev
   ```

2. **创建新任务**
   ```bash
   curl -X POST http://localhost:3000/agent/execute \
     -H "Content-Type: application/json" \
     -d '{
       "task": "我是一个AI助手",
       "sessionId": "chat-test-1"
     }'
   ```

   保存返回的taskId。

3. **等待任务完成**

4. **发送第一条聊天消息**
   ```bash
   curl -X POST http://localhost:3000/api/tasks/{taskId}/chat \
     -H "Content-Type: application/json" \
     -d '{
       "message": "你好，请介绍一下你自己",
       "sessionId": "chat-test-1"
     }'
   ```

5. **检查前端Stream更新**
   - 打开浏览器开发者工具 > Network > WS标签
   - 查看WebSocket消息
   - 应该看到Agent的回复

6. **发送第二条聊天消息**
   ```bash
   curl -X POST http://localhost:3000/api/tasks/{taskId}/chat \
     -H "Content-Type: application/json" \
     -d '{
       "message": "你刚才说了什么?",
       "sessionId": "chat-test-1"
     }'
   ```

7. **验证上下文使用**
   - Agent应该记得第一条消息的内容
   - 回应该包含"我是一个AI助手"的信息

**预期结果:**
- ✅ 用户发送消息后Agent回复
- ✅ Agent回复通过Stream推送到前端
- ✅ 聊天消息保存到上下文历史
- ✅ Agent使用历史上下文进行回复

**如果不通过:**
- 检查MasterAgent日志，确认chat事件被接收
- 检查agentManager.acquire()是否成功
- 检查ContextManager是否正确加载上下文
- 检查Stream更新是否成功

---

#### Step 5: 提交代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add steps/api/task-chat-api.step.ts steps/agents/master-agent.step.ts
git commit -m "feat: 实现Agent聊天事件监听和回复

- task-chat-api现在发送agent.task.chat事件
- MasterAgent订阅并处理chat事件
- Agent使用上下文历史回复聊天消息
- 聊天消息保存到上下文
- 回复通过Stream推送到前端

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**预期输出:**
```
[main xxxxxx] feat: 实现Agent聊天事件监听和回复
 2 files changed, xxx insertions(+), xxx deletions(-)
```

---

## Phase 2: 添加测试覆盖

### 任务6: 多轮对话E2E测试 ⚠️ **P1**

**目标:** 验证多轮对话的完整流程

**文件:** `/Users/leo/workspace/myagent/tests/e2e-multi-turn-chat.test.ts` (新建)

---

#### Step 1: 创建测试辅助工具

**文件:** `/Users/leo/workspace/myagent/tests/helpers/index.ts` (新建)

**完整代码:**
```typescript
import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export async function createTask(options: {
  task: string;
  sessionId?: string;
}): Promise<{ id: string }> {
  const response = await axios.post(`${API_BASE_URL}/agent/execute`, {
    task: options.task,
    sessionId: options.sessionId || `test-${Date.now()}`,
  });

  return response.data;
}

export async function sendChatMessage(taskId: string, options: {
  message: string;
  sessionId: string;
}): Promise<void> {
  await axios.post(`${API_BASE_URL}/api/tasks/${taskId}/chat`, {
    message: options.message,
    sessionId: options.sessionId,
  });
}

export async function getTaskResult(taskId: string): Promise<any> {
  const response = await axios.get(`${API_BASE_URL}/agent/result`, {
    params: { id: taskId },
  });

  return response.data.result;
}

export async function getContext(taskId: string): Promise<any> {
  const response = await axios.get(`${API_BASE_URL}/api/context/${taskId}`);
  return response.data;
}

export async function waitForStreamMessage(
  taskId: string,
  matcher: (message: any) => boolean,
  timeout = 30000
): Promise<any> {
  const startTime = Date.now();

  // 这里需要实现WebSocket订阅逻辑
  // 简化版本：轮询Stream
  while (Date.now() - startTime < timeout) {
    const messages = await getStreamMessages(taskId);
    const matched = messages.find(matcher);

    if (matched) {
      return matched;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error('Timeout waiting for stream message');
}

async function getStreamMessages(taskId: string): Promise<any[]> {
  // 实现从Stream获取消息的逻辑
  // 这里简化为返回空数组
  return [];
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

#### Step 2: 创建E2E测试

**文件:** `/Users/leo/workspace/myagent/tests/e2e-multi-turn-chat.test.ts`

**完整代码:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createTask,
  sendChatMessage,
  waitForStreamMessage,
  getContext,
  sleep,
} from './helpers';

describe('Multi-turn Chat E2E Tests', () => {
  describe('Basic Multi-turn Conversation', () => {
    it('should handle multiple chat messages in a session', async () => {
      // 1. 创建任务
      const task = await createTask({
        task: '我的名字是Leo，是一名软件工程师',
        sessionId: 'test-session-1',
      });

      // 2. 等待任务完成
      await sleep(5000);

      // 3. 发送第一条聊天消息
      await sendChatMessage(task.id, {
        message: '我叫什么名字?',
        sessionId: 'test-session-1',
      });

      await sleep(3000);

      // 4. 发送第二条聊天消息
      await sendChatMessage(task.id, {
        message: '我的职业是什么?',
        sessionId: 'test-session-1',
      });

      await sleep(3000);

      // 5. 验证上下文已保存
      const context = await getContext(task.id);
      expect(context).toBeDefined();
      expect(context.messages.length).toBeGreaterThan(4); // 初始任务 + 2轮对话

      // 验证消息内容
      const userMessages = context.messages.filter((m: any) => m.role === 'user');
      expect(userMessages.length).toBe(3); // 初始任务 + 2条聊天
    }, 30000);

    it('should maintain context across different sessions', async () => {
      // 验证不同sessionId的隔离性
      const task1 = await createTask({
        task: '任务1',
        sessionId: 'session-a',
      });

      const task2 = await createTask({
        task: '任务2',
        sessionId: 'session-b',
      });

      await sleep(5000);

      await sendChatMessage(task1.id, {
        message: '这是session-a的消息',
        sessionId: 'session-a',
      });

      await sendChatMessage(task2.id, {
        message: '这是session-b的消息',
        sessionId: 'session-b',
      });

      await sleep(3000);

      // 验证两个session的上下文是隔离的
      const context1 = await getContext(task1.id);
      const context2 = await getContext(task2.id);

      expect(context1.sessionId).toBe('session-a');
      expect(context2.sessionId).toBe('session-b');
      expect(context1.messages).not.toEqual(context2.messages);
    }, 30000);
  });

  describe('Context Retention', () => {
    it('should remember information from previous turns', async () => {
      const task = await createTask({
        task: '我喜欢编程，特别是JavaScript和Python',
        sessionId: 'context-test-1',
      });

      await sleep(5000);

      await sendChatMessage(task.id, {
        message: '我喜欢什么编程语言?',
        sessionId: 'context-test-1',
      });

      await sleep(3000);

      const context = await getContext(task.id);

      // 验证上下文包含原始任务信息
      const hasJavaScript = JSON.stringify(context).includes('JavaScript');
      const hasPython = JSON.stringify(context).includes('Python');

      expect(hasJavaScript || hasPython).toBe(true);
    }, 30000);
  });
});
```

---

#### Step 3: 运行E2E测试

**命令:**
```bash
cd /Users/leo/workspace/myagent
npm test -- tests/e2e-multi-turn-chat.test.ts
```

**预期结果:** 所有测试通过

---

#### Step 4: 提交测试代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add tests/helpers/ tests/e2e-multi-turn-chat.test.ts
git commit -m "test: 添加多轮对话E2E测试

- 创建测试辅助工具
- 实现基本多轮对话测试
- 实现会话隔离测试
- 实现上下文保持测试

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### 任务7: 上下文压缩测试

**文件:** `/Users/leo/workspace/myagent/tests/context-compression.test.ts` (新建)

**完整代码:**
```typescript
import { describe, it, expect } from '@jest/globals';
import {
  createTask,
  sendChatMessage,
  getContext,
  sleep,
} from './helpers';

describe('Context Compression Tests', () => {
  it('should compress context when token limit exceeded', async () => {
    const sessionId = 'test-compression';
    const task = await createTask({
      task: '测试压缩',
      sessionId,
    });

    await sleep(5000);

    // 发送大量消息触发压缩
    for (let i = 0; i < 20; i++) {
      await sendChatMessage(task.id, {
        message: `消息 ${i}: 这是一条测试消息，用于触发上下文压缩机制。内容包括：测试数据、示例文本、长文本内容...`,
        sessionId,
      });

      await sleep(1000);
    }

    await sleep(5000);

    // 验证上下文已压缩
    const context = await getContext(task.id);

    // 应该有压缩历史
    expect(context).toBeDefined();

    // 消息数量应该受到限制
    expect(context.messages.length).toBeLessThan(100);

    // 应该有摘要
    expect(context.summary).toBeDefined();
  }, 120000);

  it('should preserve important information after compression', async () => {
    const task = await createTask({
      task: '我的名字是测试用户，我是一名QA工程师',
      sessionId: 'compression-test',
    });

    await sleep(5000);

    // 发送重要信息
    await sendChatMessage(task.id, {
      message: '记住：我叫测试用户，是一名QA工程师',
      sessionId: 'compression-test',
    });

    await sleep(2000);

    // 触发压缩
    for (let i = 0; i < 20; i++) {
      await sendChatMessage(task.id, {
        message: `填充消息 ${i}`,
        sessionId: 'compression-test',
      });

      await sleep(500);
    }

    await sleep(5000);

    // 验证摘要中包含重要信息
    const context = await getContext(task.id);

    const contextStr = JSON.stringify(context);
    const hasImportantInfo =
      contextStr.includes('测试用户') ||
      contextStr.includes('QA工程师') ||
      (context.summary &&
        (JSON.stringify(context.summary).includes('测试用户') ||
         JSON.stringify(context.summary).includes('QA工程师')));

    expect(hasImportantInfo).toBe(true);
  }, 120000);
});
```

**运行测试:**
```bash
npm test -- tests/context-compression.test.ts
```

---

### 任务8: Agent Hook测试

已在任务2的Step 8中完成。

---

## Phase 3: 性能和用户体验优化

### 任务9: 性能优化 ℹ️ **P2**

**文件:** `/Users/leo/workspace/myagent/src/core/context/manager.ts`

**优化1: 智能压缩触发**

**在ContextManager类中添加或修改shouldCompress方法:**

```typescript
private shouldCompress(context: TaskContext): boolean {
  const { totalTokens, lastCompressedAt } = context.metadata;

  // 条件1: Token数超过阈值
  if (totalTokens > 100000) return true;

  // 条件2: 最近一次压缩后超过50条新消息
  if (lastCompressedAt && context.messages.length > 50) {
    const messagesSinceCompression = context.messages.filter(
      m => new Date(m.metadata.timestamp) > new Date(lastCompressedAt)
    );
    if (messagesSinceCompression.length > 50) return true;
  }

  // 条件3: 任务状态为completed或failed时
  if (context.summary.currentStatus === 'completed' ||
      context.summary.currentStatus === 'failed') {
    return true;
  }

  return false;
}
```

**验证:** 智能压缩触发逻辑已实现

---

### 任务10: 前端用户体验优化 ℹ️ **P2**

**文件:** `/Users/leo/workspace/myagent/motia-frontend/src/pages/TaskDetail.jsx`

**优化1: 消息分组**

**添加消息分组函数:**

```javascript
// 在组件内部添加辅助函数
const groupMessagesByTime = (messages, groupInterval = 60000) => {
  if (!messages || messages.length === 0) return [];

  const groups = [];
  let currentGroup = [messages[0]];
  let lastTimestamp = new Date(messages[0].timestamp).getTime();

  for (let i = 1; i < messages.length; i++) {
    const currentTimestamp = new Date(messages[i].timestamp).getTime();

    if (currentTimestamp - lastTimestamp <= groupInterval) {
      currentGroup.push(messages[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [messages[i]];
      lastTimestamp = currentTimestamp;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
};
```

**优化2: 错误处理**

**修改handleSendMessage函数，添加错误处理:**

```javascript
const [errors, setErrors] = useState([]);
const [isSending, setIsSending] = useState(false);

const handleSendMessage = async () => {
  if (!inputValue.trim() || !sessionId) {
    if (!sessionId) {
      const error = {
        type: 'send',
        message: '会话未初始化，请刷新页面重试',
        timestamp: new Date(),
        id: Date.now(),
      };
      setErrors(prev => [...prev, error]);
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e.id !== error.id));
      }, 5000);
    }
    return
  }

  const userMessage = {
    type: 'chat',
    role: 'user',
    content: inputValue,
    timestamp: new Date().toISOString(),
    id: Date.now().toString()
  }

  // 立即显示在UI上（乐观更新）
  setMessages(prev => [...prev, userMessage])
  setChatMessages(prev => [...prev, userMessage])

  // 发送到后端，包含sessionId
  setIsSending(true)
  try {
    await agentsAPI.sendChatMessage(id, inputValue, sessionId)
    console.log('消息已发送，sessionId:', sessionId)
    // 清除之前的发送错误
    setErrors(prev => prev.filter(e => e.type !== 'send'))
  } catch (error) {
    console.error('发送消息失败:', error)
    const errorObj = {
      type: 'send',
      message: '发送消息失败，请重试',
      timestamp: new Date(),
      id: Date.now(),
      retry: () => handleSendMessage(),
    }
    setErrors(prev => [...prev, errorObj])
  } finally {
    setInputValue('')
    setIsSending(false)
  }
}
```

**在UI中添加错误显示:**

```jsx
{/* 错误显示 */}
{errors.length > 0 && (
  <div className="error-messages">
    {errors.map(error => (
      <div key={error.id} className="error-message-item">
        <span>{error.message}</span>
        {error.retry && (
          <button
            onClick={error.retry}
            className="error-retry-button"
          >
            重试
          </button>
        )}
      </div>
    ))}
  </div>
)}
```

**添加CSS样式:**

```css
.error-messages {
  padding: 10px;
  margin-bottom: 10px;
}

.error-message-item {
  background: #FEE2E2;
  color: #DC2626;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-retry-button {
  background: #DC2626;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.error-retry-button:hover {
  background: #B91C1C;
}
```

**验证:** 前端用户体验优化已完成

---

## Phase 4: 文档完善

### 任务11: 编写API文档 ℹ️ **P2**

**文件:** `/Users/leo/workspace/myagent/docs/api/multi-turn-chat-api.md` (新建)

**完整内容:**
```markdown
# 多轮对话API文档

## 概述

多轮对话API允许用户与Agent进行连续的对话，Agent会记住对话历史并提供上下文相关的回复。

## 核心概念

### Session ID

- **作用**: 标识一个对话会话
- **生成**: 在任务创建时由前端生成UUID
- **传递**: 在所有API调用中必须包含相同的sessionId
- **生命周期**: 与任务关联，保存在sessionStorage中

### 对话流程

```
1. 创建任务 (生成sessionId)
   ↓
2. Agent执行任务
   ↓
3. 用户发送聊天消息 (携带sessionId)
   ↓
4. Agent接收消息并回复
   ↓
5. 循环步骤3-4
```

---

## API端点

### 1. 创建任务

#### 端点
`POST /agent/execute`

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| task | string | 是 | 任务描述 |
| sessionId | string | 否 | 会话ID，不传则自动生成 |

#### 请求示例

\`\`\`json
{
  "task": "分析这个React项目的架构",
  "sessionId": "session-abc123"
}
\`\`\`

#### 响应

\`\`\`json
{
  "success": true,
  "taskId": "task-xyz789",
  "sessionId": "session-abc123",
  "output": {
    "result_type": "text",
    "content": {
      "text": "项目架构分析..."
    }
  }
}
\`\`\`

---

### 2. 发送聊天消息

#### 端点
`POST /api/tasks/:id/chat`

#### 路径参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务ID |

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息内容 |
| sessionId | string | 是 | 会话ID，必须与任务创建时的一致 |

#### 请求示例

\`\`\`bash
curl -X POST http://localhost:3000/api/tasks/task-xyz789/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "请详细说明组件结构",
    "sessionId": "session-abc123"
  }'
\`\`\`

#### 响应

\`\`\`json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "taskId": "task-xyz789",
    "message": "请详细说明组件结构",
    "timestamp": "2026-01-27T10:30:00Z"
  }
}
\`\`\`

---

### 3. 获取任务结果

#### 端点
`GET /agent/result`

#### 查询参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务ID |

#### 响应

\`\`\`json
{
  "success": true,
  "result": {
    "taskId": "task-xyz789",
    "task": "分析这个React项目的架构",
    "sessionId": "session-abc123",
    "status": "completed",
    "success": true,
    "output": {...},
    "timestamp": "2026-01-27T10:25:00Z"
  }
}
\`\`\`

---

## WebSocket Stream事件

### 聊天消息事件

Agent的回复会通过`taskExecution` Stream实时推送：

\`\`\`javascript
{
  "progressType": "chat",
  "type": "chat",
  "role": "assistant",
  "content": "这个项目的组件结构如下...",
  "timestamp": "2026-01-27T10:30:05Z"
}
\`\`\`

### Agent进度事件

Agent的关键行动会通过Stream推送：

\`\`\`javascript
{
  "progressType": "step",
  "type": "agent",
  "message": "Agent acquired: master",
  "data": {
    "agentType": "master",
    "conversationLength": 5
  },
  "timestamp": "2026-01-27T10:30:00Z"
}
\`\`\`

---

## 使用示例

### 完整的多轮对话流程

\`\`\`javascript
// 1. 创建任务
const response1 = await fetch('http://localhost:3000/agent/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: '我是一个React专家',
    sessionId: 'session-demo-1'
  })
});
const { taskId } = await response1.json();

// 保存sessionId到sessionStorage
sessionStorage.setItem(`sessionId_${taskId}`, 'session-demo-1');

// 2. 等待任务完成...

// 3. 发送第一条聊天消息
await fetch(`http://localhost:3000/api/tasks/${taskId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '请介绍一下React Hooks',
    sessionId: 'session-demo-1'
  })
});

// 4. Agent回复通过WebSocket Stream推送

// 5. 发送第二条聊天消息
await fetch(`http://localhost:3000/api/tasks/${taskId}/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: '那useEffect呢?',
    sessionId: 'session-demo-1'
  })
});

// Agent会记得之前在讨论React Hooks
\`\`\`

---

## 错误处理

### 常见错误

#### 1. Session ID缺失

\`\`\`json
{
  "success": false,
  "message": "Session ID is required for chat messages"
}
\`\`\`

**解决方案**: 确保在发送聊天消息时包含与任务创建时相同的sessionId。

#### 2. Session不匹配

\`\`\`json
{
  "success": false,
  "message": "Session not found"
}
\`\`\`

**解决方案**: 确保sessionId正确，并且任务尚未被清理。

#### 3. 消息格式错误

\`\`\`json
{
  "success": false,
  "message": "Invalid request body",
  "error": "message must be a string"
}
\`\`\`

**解决方案**: 确保message字段是非空字符串。

---

## 最佳实践

### 1. Session管理

- ✅ 使用UUID生成sessionId
- ✅ 将sessionId保存到sessionStorage
- ✅ 在整个对话过程中保持sessionId一致
- ❌ 不要在每次请求中生成新的sessionId

### 2. 错误处理

- ✅ 捕获网络错误并显示用户友好的消息
- ✅ 提供重试机制
- ✅ 记录错误日志用于调试

### 3. UI更新

- ✅ 使用乐观更新立即显示用户消息
- ✅ 通过WebSocket Stream接收Agent回复
- ✅ 显示Agent正在处理的状态指示器

---

## 性能考虑

### 上下文限制

- 最大消息数: 100条（超过会触发压缩）
- Token限制: 100,000 tokens
- 压缩后保留: 最近50条消息 + 摘要

### 建议

- 定期清理过期的session
- 使用上下文压缩减少token使用
- 监控上下文大小避免超出限制

---

## 相关文档

- [Agent Hook系统指南](/docs/guides/hook-development.md)
- [Context管理器文档](/docs/design/context-engineering.md)
- [多轮对话设计文档](/docs/design/multi-turn-conversation-system.md)
```

---

### 任务12: 编写Hook开发指南 ℹ️ **P2**

**文件:** `/Users/leo/workspace/myagent/docs/guides/hook-development.md` (新建)

**完整内容:**
```markdown
# Hook开发指南

## 概述

Motia项目使用三层Hook系统来在不同粒度上干预和扩展Agent的行为：

```
Task Hook (Session粒度)
    ↓
Agent Hook (Agent粒度)
    ↓
Skill Hook (Skill粒度)
```

本文档重点介绍**Agent Hook**的开发和使用。

---

## 三种Hook的职责

### Task Hook（Session粒度）

**文件位置**: `/src/core/task/hooks/`

**职责**:
- 上下文的完整生命周期管理
- 创建/加载/保存上下文
- Session级别的监控和指标收集

**示例Hooks**:
- `ContextManagerTaskHook`: 管理对话上下文
- `MetricsCollectorTaskHook`: 收集执行指标
- `UserAllowTaskHook`: 用户权限检查

**不负责**:
- Agent实例管理
- 跨任务的状态协调

---

### Agent Hook（Agent粒度）

**文件位置**: `/src/core/agent/hooks/`

**职责**:
- Agent实例的生命周期管理
- Agent级别的状态协调
- 跨任务的Agent行为跟踪
- Agent健康监控

**示例Hooks**:
- `AgentMonitoringHook`: 监控Agent健康状态
- `AgentContextSyncHook`: 同步上下文状态
- `AgentProgressNotifyHook`: 发送进度通知

**不负责**:
- 单个技能的执行
- 详细的任务执行逻辑

---

### Skill Hook（Skill粒度）

**文件位置**: `/skills/hooks/`

**职责**:
- 单个技能的执行干预
- 无状态，轻量级
- 技能级别的进度报告

**示例Hooks**:
- `WebSearchHook`: Web搜索技能Hook
- `FileSystemHook`: 文件系统操作Hook

**特点**:
- 无状态设计
- 每次技能执行时创建新实例
- 不适合维护长期状态

---

## Agent Hook开发

### BaseAgentHook接口

所有Agent Hook必须继承`BaseAgentHook`抽象类：

\`\`\`typescript
import { BaseAgentHook } from '@/core/agent/hooks/base';
import { Agent, AgentConfig, AgentResult } from '@/core/agent/types';

export class CustomAgentHook extends BaseAgentHook {
  // 1. Agent创建前调用
  async onAgentCreate(config: AgentConfig, sessionId: string) {
    console.log(\`Agent creating for session: \${sessionId}\`);
    // 可以返回{abort: true, reason: 'xxx'}来中止创建
  }

  // 2. Agent获取时调用（可能复用现有Agent）
  async onAgentAcquire(agent: Agent, sessionId: string) {
    console.log(\`Agent acquired for session: \${sessionId}\`);
  }

  // 3. 任务执行前调用（在Task Hook之前）
  async onTaskStart(task: string, taskId: string, context: any) {
    console.log(\`Task starting: \${task}\`);
    // 可以返回{modifiedTask: 'xxx'}来修改任务
  }

  // 4. 任务执行完成后调用（在Task Hook之后）
  async onTaskComplete(result: AgentResult, context: any) {
    console.log(\`Task completed\`);
  }

  // 5. 定期Agent状态检查
  async onAgentStatusCheck(agent: Agent) {
    // 定期健康检查
  }

  // 6. Agent销毁前调用
  async onAgentDestroy(sessionId: string) {
    console.log(\`Agent destroyed\`);
  }
}
\`\`\`

---

### Hook生命周期

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
            │ onAgentCreate (Hook 2)  │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │   创建新的Agent实例      │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentAcquire (Hook 1) │ ← 每次获取Agent时
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentAcquire (Hook 2) │
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
            │ onTaskStart (Hook 2)    │
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
            ┌─────────────────────────┐
            │ onTaskComplete (Hook 2) │
            └─────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  AgentManager.release(sessionId)                        │
└─────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentDestroy (Hook 1) │ ← Agent销毁时
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │ onAgentDestroy (Hook 2) │
            └─────────────────────────┘
                          ↓
            ┌─────────────────────────┐
            │   清理Agent实例          │
            └─────────────────────────┘
\`\`\`

---

### 开发示例

#### 示例1: Agent性能监控Hook

\`\`\`typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

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

      // 性能报告
      const avgTime = metrics.totalExecutionTime / metrics.taskCount;
      console.log(\`[Performance] Session \${sessionId}: avg=\${avgTime}ms, slow=\${metrics.slowTasks}\`);
    }
  }

  async onAgentDestroy(sessionId: string) {
    const metrics = this.performanceMetrics.get(sessionId);
    if (metrics) {
      console.log(\`[Performance] Final report for \${sessionId}:\`, metrics);
    }
    this.performanceMetrics.delete(sessionId);
  }

  // 其他方法...
}
\`\`\`

---

#### 示例2: Agent限流Hook

\`\`\`typescript
import { BaseAgentHook } from './base';
import { Agent, AgentConfig, AgentResult } from '../../agent/types';

export class AgentRateLimitHook extends BaseAgentHook {
  private requestCounts = new Map<string, {
    count: number;
    resetTime: number;
  }>();

  private readonly LIMIT = 100; // 每10分钟100个请求
  private readonly WINDOW = 10 * 60 * 1000; // 10分钟

  async onTaskStart(task: string, taskId: string, context: any) {
    const sessionId = (context as any).sessionId;
    const now = Date.now();

    let state = this.requestCounts.get(sessionId);

    // 初始化或重置
    if (!state || now > state.resetTime) {
      state = {
        count: 0,
        resetTime: now + this.WINDOW,
      };
      this.requestCounts.set(sessionId, state);
    }

    // 检查限流
    if (state.count >= this.LIMIT) {
      const waitTime = Math.ceil((state.resetTime - now) / 1000);
      throw new Error(\`Rate limit exceeded. Please wait \${waitTime} seconds.\`);
    }

    state.count++;
  }

  async onAgentDestroy(sessionId: string) {
    this.requestCounts.delete(sessionId);
  }

  // 其他方法...
}
\`\`\`

---

### 注册Hook

#### 在AgentManager中注册

\`\`\`typescript
import { AgentManager } from './manager';
import { CustomAgentHook } from './hooks/custom';

export class AgentManager {
  private hookManager: AgentHookManager;

  constructor() {
    this.hookManager = new AgentHookManager();

    // 注册自定义Hook
    this.hookManager.register(new CustomAgentHook());
  }
}
\`\`\`

#### 动态注册

\`\`\`typescript
// 在运行时注册Hook
const hook = new CustomAgentHook();
agentManager.registerHook(hook);

// 取消注册
agentManager.unregisterHook(hook);
\`\`\`

---

## Hook执行顺序

### 同一Hook类型的执行顺序

Hook按照注册顺序执行：

\`\`\`typescript
hookManager.register(new Hook1());
hookManager.register(new Hook2());
hookManager.register(new Hook3());

// 执行顺序: Hook1 → Hook2 → Hook3
\`\`\`

### 不同Hook类型的执行顺序

```
Task Hook (pre) → Agent Hook (onTaskStart) → Agent执行
                                        → Agent Hook (onTaskComplete) → Task Hook (post)
```

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

❌ **不好的设计**:
\`\`\`typescript
async onTaskStart(task: string, taskId: string, context: any) {
  // 直接抛出异常，中断整个流程
  throw new Error('Something went wrong');
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

❌ **不好的设计**:
\`\`\`typescript
async onAgentStatusCheck(agent: Agent) {
  // 每次都做昂贵的操作
  const fullAnalysis = this.performExpensiveAnalysis(agent);
  this.saveToDatabase(fullAnalysis);
}
\`\`\`

---

### 4. 状态管理

✅ **好的设计**:
\`\`\`typescript
export class AgentStateHook extends BaseAgentHook {
  private state = new Map<string, any>();

  async onAgentCreate(config: AgentConfig, sessionId: string) {
    this.state.set(sessionId, { /* 初始状态 */ });
  }

  async onAgentDestroy(sessionId: string) {
    this.state.delete(sessionId); // 清理状态
  }
}
\`\`\`

❌ **不好的设计**:
\`\`\`typescript
export class AgentLeakHook extends BaseAgentHook {
  private state: any[] = [];

  async onAgentCreate(config: AgentConfig, sessionId: string) {
    this.state.push({ /* 永不清理 */ });
  }
  // 内存泄漏！
}
\`\`\`

---

## 测试Hook

### 单元测试

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

## 调试Hook

### 启用调试日志

\`\`\`typescript
export class DebugAgentHook extends BaseAgentHook {
  async onAgentCreate(config: AgentConfig, sessionId: string) {
    console.log(\`[Hook] onAgentCreate called\`, { config, sessionId });
  }

  async onAgentAcquire(agent: Agent, sessionId: string) {
    console.log(\`[Hook] onAgentAcquire called\`, { sessionId });
  }

  // ... 其他方法
}
\`\`\`

---

## 相关文档

- [Task Hook系统](/docs/design/task-hook-system.md)
- [Skill Hook系统](/docs/design/skill-hook-system.md)
- [多轮对话系统](/docs/design/multi-turn-conversation-system.md)
- [Context工程](/docs/design/context-engineering.md)
```

---

## 提交文档代码

**命令:**
```bash
cd /Users/leo/workspace/myagent
git add docs/api/multi-turn-chat-api.md docs/guides/hook-development.md
git commit -m "docs: 添加多轮对话API文档和Hook开发指南

- 完整的多轮对话API文档
- Session管理最佳实践
- WebSocket Stream事件说明
- 错误处理指南
- Agent Hook开发完整指南
- Hook生命周期说明
- 开发示例和最佳实践
- 测试和调试方法

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 📊 验收标准总结

### P0任务验收（必须完成）

- [x] **前端Session ID**: 任务创建和聊天时sessionId正确传递
- [x] **Agent Hook系统**: BaseAgentHook接口实现，AgentMonitoringHook、AgentContextSyncHook和AgentProgressNotifyHook工作正常
- [x] **上下文传递**: Agent回复时使用历史上下文
- [x] **聊天事件响应**: 用户发送消息后Agent回复并通过Stream推送
- [x] **Agent进度通知**: Agent关键行动（创建、获取、任务开始/完成）通过Stream实时推送到前端

### P1任务验收（重要）

- [x] **测试覆盖**: 所有E2E测试通过
- [x] **上下文压缩**: 触发机制正常工作，保留关键信息
- [x] **性能优化**: 压缩触发和Artifact提取准确性提升

### P2任务验收（可延后）

- [x] **前端优化**: 消息分组、错误处理、输入体验改进
- [x] **文档完善**: API文档和Hook开发指南完成

---

## 🎯 最终验收测试场景

### 场景1: 基础多轮对话

```bash
1. 创建任务："分析React项目"
2. 等待任务完成
3. 发送聊天："重点讲解性能优化"
4. 验证：Agent回复包含性能优化内容
5. 发送聊天："那useMemo呢？"
6. 验证：Agent回复记得之前在讨论React性能
```

### 场景2: 上下文隔离

```bash
1. 创建两个任务，不同sessionId
2. 在两个任务中发送不同聊天
3. 验证：两个任务的对话历史是隔离的
```

### 场景3: Agent Hook监控

```bash
1. 创建任务并执行
2. 检查日志：看到AgentMonitoringHook的输出
3. 发送多条聊天消息
4. 验证：AgentHook正确跟踪任务数和执行时间
```

### 场景4: Agent进度通知

```bash
1. 打开任务详情页
2. 创建新任务
3. 验证前端进度流显示：
   - "Agent created for session: xxx"
   - "Agent acquired: master"
   - "Agent started processing task"
   - "Agent completed task"
4. 发送聊天消息
5. 验证前端实时显示Agent行动通知
6. 如果任务超过30秒，验证收到心跳通知
```

---

## 🎓 实施完成

恭喜！你已成功实现完整的多轮对话系统。

### 主要成果:

1. ✅ 前端Session管理系统
2. ✅ 完整的Agent Hook系统
3. ✅ 上下文传递和复用
4. ✅ 聊天事件监听和响应
5. ✅ 完善的测试覆盖
6. ✅ 性能优化
7. ✅ 完整的文档

### 下一步建议:

1. 监控生产环境性能指标
2. 收集用户反馈优化体验
3. 扩展更多Agent Hook（如限流、缓存等）
4. 优化上下文压缩算法
5. 添加更多测试场景

---

**生成于:** 2026-01-27
**版本:** 1.0.0
**作者:** Claude Sonnet 4.5
