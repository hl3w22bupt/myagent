# Sandbox System 详解

> Layer 3: 隔离执行环境 - Python 代码安全执行

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 Sandbox System 是什么？

**Sandbox System** 是 MyAgent 的**第 3 层架构**，提供隔离的 Python 代码执行环境，用于安全运行 PTC（Programmatic Tool Calling）生成的代码。

### 核心能力

- ✅ **进程隔离**: 每个 Session 独立的 Python 进程
- ✅ **连接池管理**: SandboxManager 管理 Session 生命周期
- ✅ **多适配器支持**: Local、Daytona、E2B、 Modal
- ✅ **超时控制**: 可配置的执行超时
- ✅ **结构化输出**: 支持 UnifiedOutput Schema
- ✅ **调试支持**: 保存执行脚本供调试

---

## 🏗️ 架构设计

### 在 4 层架构中的位置

```
Layer 1: Motia Integration (事件驱动)
   ↓
Layer 2: Agent Orchestration (Agent/MasterAgent, PTC)
   ↓
Layer 3: Sandbox Execution (Python 进程隔离) ← 当前层级
   ↓
Layer 4: Skill Abstraction (可复用能力)
```

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│  SandboxManager (会话管理)                              │
│  - Session 隔离                                         │
│  - 连接池管理                                           │
│  - 自动清理                                             │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  SandboxFactory (适配器工厂)                            │
│  - Local (已实现)                                       │
│  - Daytona (未来)                                       │
│  - E2B (未来)                                           │
│  - Modal (未来)                                         │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  SandboxAdapter Interface                               │
│  - execute(code, options)                               │
│  - cleanup(sessionId)                                   │
│  - healthCheck()                                        │
│  - getInfo()                                            │
└─────────────────────────────────────────────────────────┘
```

---

## 🎛️ SandboxManager

### 职责

管理多个 Sandbox Session 的生命周期：

```typescript
interface SandboxManagerConfig {
  sessionTimeout: number;      // Session 超时时间（毫秒）
  maxSessions: number;         // 最大 Session 数量
  sandboxConfig: SandboxAdapterConfig;
}

class SandboxManager {
  // 获取或创建 Session 的 Sandbox
  async acquire(sessionId: string): Promise<SandboxAdapter>

  // 释放 Session 并清理资源
  async release(sessionId: string): Promise<void>

  // 清理过期的 Session（每分钟自动执行）
  private async cleanupExpiredSessions(): Promise<void>

  // LRU 淘汰最旧的 Session
  private async evictOldestSession(): Promise<void>

  // 关闭管理器，清理所有 Session
  async shutdown(): Promise<void>
}
```

### Session 隔离

```
Session A → Sandbox Instance A → Python Process A
Session B → Sandbox Instance B → Python Process B
Session C → Sandbox Instance C → Python Process C
```

**特点**:
- 每个 Session 有独立的 Sandbox 实例
- Session 之间完全隔离（状态、变量、文件系统）
- 并发安全（不同 Session 可同时执行）

---

## 🔌 Sandbox Adapters

### 1. Local Adapter（已实现）

**特点**:
- ✅ 本地 Python 进程执行
- ✅ 支持 venv 隔离
- ✅ 最简单、最便携

**配置** (`config/sandbox.config.yaml`):
```yaml
adapters:
  local:
    type: local
    pythonPath: /path/to/python3  # 默认: python_modules/bin/python3
    timeout: 300000               # 5 分钟
    workspace: /tmp/motia-sandbox  # 临时文件目录
    maxSessions: 10               # 最大并发 Session
```

**实现细节**:
```typescript
class LocalSandboxAdapter implements SandboxAdapter {
  async execute(code: string, options: SandboxOptions): Promise<SandboxResult> {
    // 1. 检查 Session 限制
    if (this.activeSessions.size >= this.maxSessions) {
      throw new Error('Maximum sessions limit reached');
    }

    // 2. 包装 PTC 代码（注入 SkillExecutor）
    const wrappedCode = this.wrapCode(code, options);

    // 3. 写入临时文件
    const scriptPath = join(this.workspace, `script_${sessionId}.py`);
    await writeFile(scriptPath, wrappedCode);

    // 4. 启动 Python 进程
    const childProcess = spawn(this.pythonPath, [scriptPath], {
      env: {
        MOTIA_TRACE_ID: sessionId,
        MOTIA_TASK_ID: options.metadata?.taskId,
        MOTIA_SKILL_PATH: skillPath,
        PYTHONPATH: pythonPaths.join(':'),
      },
      timeout: options.timeout || 300000,
    });

    // 5. 收集输出（stdout、stderr）
    const result = await this.collectResult(childProcess, timeout);

    // 6. 保存调试脚本
    await writeFile(join(this.workspace, `debug_${sessionId}.py`), wrappedCode);

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: !success ? { type: 'execution', message: result.stderr } : undefined,
      executionTime: Date.now() - startTime,
      sessionId,
      structuredOutput,  // 统一输出格式
    };
  }
}
```

---

### 2. Daytona Adapter（未来）

**用途**: 云端开发环境

**配置**:
```yaml
daytona:
  type: daytona
  apiKey: ${DAYTONA_API_KEY}
  template: python-311
```

**优势**:
- ☁️ 云端执行，不占用本地资源
- 🔒 完全隔离的容器环境
- 📦 预装常用依赖

---

### 3. E2B Adapter（未来）

**用途**: 交互式代码执行环境

**配置**:
```yaml
e2b:
  type: e2b
  apiKey: ${E2B_API_KEY}
  template: python3.11-pandas
```

**优势**:
- 🎯 专为 AI 代码执行设计
- 🌐 支持多种编程语言
- 🔄 自动环境恢复

---

### 4. Modal Adapter（未来）

**用途**: Serverless 函数执行

**配置**:
```yaml
modal:
  type: modal
  token: ${MODAL_TOKEN}
  functionId: motia-sandbox-runner
```

**优势**:
- ⚡ 按需执行，无空闲成本
- 🚀 自动扩展
- 💰 只为执行时间付费

---

## 🔒 安全隔离机制

### 1. 进程隔离

```
Main Process (Node.js)
    ↓
  spawn()
    ↓
Python Process 1 (Session A)
Python Process 2 (Session B)
Python Process 3 (Session C)
```

**隔离保证**:
- 每个 Session 独立进程
- 进程崩溃不影响其他 Session
- 内存隔离（不共享状态）

---

### 2. 超时控制

```typescript
// 默认 5 分钟超时
const timeout = options.timeout || 300000;

// 超时后自动终止进程
const timeoutTimer = setTimeout(() => {
  process.kill();
  resolve({ exitCode: -1, stderr: 'Execution timeout' });
}, timeout);
```

**配置**:
```yaml
# 全局默认超时
timeout: 300000  # 5 分钟

# 单次执行覆盖
await sandbox.execute(code, { timeout: 60000 });  # 1 分钟
```

---

### 3. 资源限制

```typescript
interface LocalSandboxConfig {
  maxSessions: number;  // 最大并发 Session 数（默认 10）
}
```

**限制**:
- 最多 10 个并发 Session
- 超过限制时 LRU 淘汰最旧 Session
- 防止资源耗尽

---

### 4. 文件系统隔离

```typescript
workspace: /tmp/motia-sandbox  // 临时文件目录
```

**隔离**:
- 每个执行使用临时脚本文件
- 执行后自动清理
- 调试脚本保存为 `debug_${sessionId}.py`

---

## 📊 输出处理

### 结构化输出

Sandbox 支持统一的输出格式（UnifiedOutput Schema）：

```python
# Skill 执行后生成结构化输出
output = {
    'result_type': 'report',
    'success': True,
    'content': {
        'type': 'code_analysis',
        'title': '代码质量分析',
        'data': {...}
    },
    'metadata': {
        'execution_time': 1234
    }
}

# 写入临时文件
output_file = f'/tmp/motia-sandbox/structured_outputs/{task_id}.json'
with open(output_file, 'w') as f:
    json.dump(output, f)

# 打印标记，让 LocalSandboxAdapter 知道读取文件
print(f'[STRUCTURED_OUTPUT] {output_file}')
```

**解析**:
```typescript
// LocalSandboxAdapter 从 stdout 中提取标记
const outputMatches = result.stdout.matchAll(/\[STRUCTURED_OUTPUT\]\s+(.+)(?:\n|$|\[STRUCTURED_OUTPUT\])/g);

for (const match of outputMatches) {
  const outputFile = match[1]?.trim();
  const jsonContent = await readFile(outputFile, 'utf-8');
  const parsed = JSON.parse(jsonContent);
  structuredOutputs.push(parsed);
}
```

---

## 🔧 配置

### 完整配置文件

```yaml
# config/sandbox.config.yaml
default_adapter: local

adapters:
  local:
    type: local
    pythonPath: /path/to/python3
    timeout: 300000
    workspace: /tmp/motia-sandbox
    maxSessions: 10

  # 未来适配器（注释掉）
  # daytona:
  #   type: daytona
  #   apiKey: ${DAYTONA_API_KEY}
  #   template: python-311
```

### 环境变量

```bash
# Sandbox 可用的环境变量
MOTIA_TRACE_ID=trace-123          # 追踪 ID
MOTIA_TASK_ID=task-456            # 任务 ID
MOTIA_SKILL_PATH=/path/to/skills  # Skill 路径
MOTIA_NOTIFY_API_URL=http://...   # 通知 API URL
MOTIA_TRACE_API_URL=http://...    # 追踪 API URL
PYTHONPATH=/path/to/lib           # Python 模块路径
```

---

## 💡 使用示例

### 示例 1: 基础执行

```typescript
// 获取 Session 的 Sandbox
const sandbox = await sandboxManager.acquire('session-123');

// 执行 PTC 代码
const result = await sandbox.execute(`
async def main():
    result = await executor.execute('code-analysis', {
        'code': 'def foo(): pass',
        'language': 'python'
    })
    print(result)
`, {
  skills: skillManifests,
  sessionId: 'session-123',
  timeout: 60000
});

console.log(result.success);  // true
console.log(result.structuredOutput);  // 统一输出格式
```

---

### 示例 2: Session 复用

```typescript
// 第一次执行
const sandbox1 = await sandboxManager.acquire('session-123');
await sandbox1.execute(code1, options);

// 第二次执行（复用同一个 Sandbox）
const sandbox2 = await sandboxManager.acquire('session-123');
await sandbox2.execute(code2, options);  // 共享状态

// 释放 Session
await sandboxManager.release('session-123');
```

---

### 示例 3: 调试支持

```typescript
// 执行失败后查看调试脚本
const result = await sandbox.execute(code, options);

if (!result.success) {
  console.error('Execution failed');
  // 查看: /tmp/motia-sandbox/debug_session-123.py
  console.error('Debug script:', '/tmp/motia-sandbox/debug_' + result.sessionId + '.py');
}
```

---

## 🚨 错误处理

### 常见错误类型

#### 1. 超时错误

```typescript
{
  success: false,
  error: {
    type: 'timeout',
    message: 'Execution timeout'
  }
}
```

**原因**: 代码执行超过配置的超时时间

**解决**: 增加 `timeout` 参数或优化代码

---

#### 2. 依赖缺失

```python
ModuleNotFoundError: No module named 'pandas'
```

**解决**:
```bash
npm run check:python-env  # 检查 Python 环境
pip install pandas  # 安装缺失的依赖
```

---

#### 3. Session 限制

```typescript
Error: Maximum sessions limit reached: 10
```

**原因**: 并发 Session 超过 `maxSessions` 限制

**解决**:
- 等待现有 Session 完成
- 增加 `maxSessions` 配置
- 手动释放不需要的 Session

---

## 📈 性能优化

### 1. 连接池复用

```typescript
// 复用 Session 避免 Sandbox 重复创建
const sandbox = await sandboxManager.acquire(sessionId);
for (const task of tasks) {
  await sandbox.execute(task.code, options);
}
```

---

### 2. 适当超时

```typescript
// 根据任务类型设置超时
const quickTaskTimeout = 30000;   // 30 秒（简单任务）
const longTaskTimeout = 300000;   // 5 分钟（复杂任务）
const videoTaskTimeout = 600000;  // 10 分钟（视频渲染）
```

---

### 3. Python 环境优化

```bash
# 使用 venv 隔离依赖
python3 -m venv python_modules
source python_modules/bin/activate
pip install -r requirements.txt

# 配置 Sandbox 使用 venv
pythonPath: /path/to/python_modules/bin/python3
```

---

## 🔍 调试和监控

### 查看活跃 Session

```typescript
console.log('Active sessions:', sandboxManager.getSessionCount());
console.log('Session IDs:', sandboxManager.getActiveSessions());
```

### 健康检查

```typescript
const isHealthy = await sandbox.healthCheck();
console.log('Sandbox health:', isHealthy);
```

### 查看调试脚本

```bash
# 查看 Sandbox 执行的代码
ls -la /tmp/motia-sandbox/debug_*.py

# 查看特定 Session 的脚本
cat /tmp/motia-sandbox/debug_session-123.py
```

---

## 🚀 未来优化方向

### 1. 云端适配器

```
当前: 仅 Local Adapter
未来: 支持 Daytona、E2B、 Modal
```

### 2. 资源配额

```typescript
interface ResourceQuota {
  maxMemory: number;    // 最大内存（MB）
  maxCpuTime: number;   // 最大 CPU 时间（秒）
  maxDiskIO: number;    // 最大磁盘 IO（MB）
}
```

### 3. 优雅关闭

```typescript
// 正在执行的任务完成后才关闭
await sandboxManager.gracefulShutdown();
```

### 4. Session 持久化

```typescript
// 保存 Session 状态到数据库
// 重启后恢复 Session
await sandboxManager.persist();
await sandboxManager.restore();
```

---

## 📖 相关文档

- [Agent 系统](./agent-system.md) - Agent 如何使用 Sandbox
- [PTC Generator](./ptc-generator.md) - PTC 代码生成
- [Output Schema](./output-schema.md) - 统一输出格式
- [Skill 开发](../api/plugin-api/custom-skill.md) - Skill 在 Sandbox 中执行

---

**版本**: v1.0 | **更新日期**: 2026-03-29
