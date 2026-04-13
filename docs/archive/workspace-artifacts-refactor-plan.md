# Workspace 和 Artifacts 重构计划

## 设计原则

### 1. 统一的 Workspace 标准

```
Task Level Workspace（所有 Agent 和 Skill 共享）
├── 默认: /tmp/myagent-workspace/{task-id}/
├── 自定义: {user-specified-path}/
└── 生命周期: 随 task 创建，task 结束后根据规则清理
```

**优先级**:
1. context.environment.workspace（最高）
2. context.environment.workingDirectory（向后兼容）
3. Agent 配置的 workingDirectory（Agent 默认值）
4. /tmp/myagent-workspace/{task-id}/（系统默认）

**清理规则**:
- 默认 workspace：自动清理
- 指定 workspace：保留（用户代码仓库等）

---

### 2. 统一的 Artifacts 标准（核心设计点）

#### ⚠️ 重要：所有 Agent 必须返回 artifacts 字段

```typescript
interface AgentResult {
  success: boolean,
  output: string,
  artifacts: AgentArtifacts | undefined,  // ⭐ 必须有此字段，可以为 undefined
  metadata: {
    workspace?: string,
    // ...
  }
}

interface AgentArtifacts {
  workspace: string,
  files: { [type: string]: FileArtifact[] },
  allFiles: FileArtifact[],
  summary: {
    counts: Record<string, number>,
    totalFiles: number,
    totalSize: number,
  }
}
```

#### 三种情况

**情况1: SubAgent 调用 Skills，有产物**
```typescript
return {
  success: true,
  output: "...",
  artifacts: {
    workspace: "/tmp/myagent-workspace/task-123/",
    allFiles: [
      { path: "...", relativePath: "src/main.ts", ... }
    ],
    // ...
  }
};
```

**情况2: SubAgent 不调用 Skills，纯对话，无产物**
```typescript
return {
  success: true,
  output: "这是你的回答...",
  artifacts: undefined,  // ✅ 字段存在，但为空
  metadata: {
    workspace: "/tmp/myagent-workspace/task-123/",
  }
};
```

**情况3: ExternalAgent，有产物**
```typescript
return {
  success: true,
  output: "...",
  artifacts: {
    workspace: "/tmp/myagent-workspace/task-123/",
    allFiles: [...],
  },
  metadata: {
    workspace: "/tmp/myagent-workspace/task-123/",
    fileOperations: [...],
  }
};
```

#### ⭐ 关键设计点

1. **字段必须有**：`artifacts: AgentArtifacts | undefined`
2. **值可以为空**：`undefined` 表示无产物
3. **不能省略字段**：不能因为无产物就不返回 `artifacts` 字段
4. **metadata.workspace 始终有值**：即使没有产物，也要记录使用的 workspace

#### 为什么这样设计？

- **统一接口**：调用方不需要判断字段是否存在，只需要判断值是否为空
- **类型安全**：TypeScript 类型检查能保证一致性
- **易于扩展**：未来需要添加产物元数据时，不会破坏现有代码
- **便于调试**：明确知道某个 Agent 是否产生了产物

---

## 执行链路分析

### 当前执行链路（有问题）

```
用户请求
  ↓
WorkflowEngine.execute()
  ↓
Agent.run(task, taskId, context)  ← context 没有 workspace
  ↓
Sandbox.execute(code, metadata)  ← metadata 没有 workspace
  ↓
Python Skills 执行
  ↓
tool-write()  →  保存到 outputs/codes/
tool-read()   →  从 ./tmp-workspace/... 读取 (❌ 错误!)
  ↓
Agent 返回结果
  ↓
{ metadata: { skillNames: [...] }, output: "..." }  ← ❌ 没有 artifacts!
  ↓
WorkflowEngine 处理结果
  ↓
尝试从 fileOperations 构建 artifacts  ← ❌ SubAgent 没有 fileOperations!
  ↓
下一步 step 收到的产物信息不完整或错误
```

### 目标执行链路

```
用户请求
  ↓
WorkflowEngine.execute()
  ↓
创建/获取 workspace: /tmp/myagent-workspace/{taskId}/
  ↓
Agent.run(task, taskId, context = { environment: { workspace } })
  ↓
Sandbox.execute(code, metadata = { workspace })
  ↓
Python Skills 执行 (环境变量: MOTIA_TASK_WORKSPACE)
  ↓
tool-write()  →  保存到 {workspace}/src/main.ts
tool-read()   →  从 {workspace}/src/main.ts 读取
  ↓
Agent 返回结果
  ↓
{
  metadata: { workspace, skillNames },
  artifacts: {  // ✅ 必须有此字段
    workspace: "/tmp/myagent-workspace/{taskId}/",
    allFiles: [
      { path: "...", relativePath: "src/main.ts", ... }
    ]
  }  // 或 undefined（无产物时）
}
  ↓
WorkflowEngine 处理结果
  ↓
下一步 step 收到完整的产物信息
  ↓
Agent 可以正确读取上一步的文件
```

---

## 需要修改的环节

### 环节 1: Workspace 创建和传递

**问题**: 没有统一创建 Task Level workspace，没有传递给 Agent

**修改**:
- WorkflowEngine 创建 workspace
- 传递给 Agent (`context.environment.workspace`)
- Agent 传递给 Sandbox (`metadata.workspace`)
- Sandbox 传递给 Python (`MOTIA_TASK_WORKSPACE` 环境变量)

---

### 环节 2: Workspace 路径定义

**问题**: 路径不统一
- WorkspaceManager: `tmp-workspace/{taskId}/{skillName}/`（相对路径）
- ExternalAgent: `/tmp/myagent-workspace`（没有 taskId）

**修改**:
- 统一为 `/tmp/myagent-workspace/{taskId}/`（绝对路径）
- 所有组件使用同一个常量

---

### 环节 3: Agent 返回 artifacts

**问题**: SubAgent 没有返回 artifacts

**修改**:
- Agent 从 output_files 构建 artifacts
- 包含 workspace 和 relativePath
- **所有 Agent 统一返回 artifacts 字段**（可为 undefined）
- metadata.workspace 始终有值

---

### 环节 4: Python Skills 文件操作

**问题**:
- tool-write 保存到 `outputs/codes/`
- tool-read 从 `./tmp-workspace/...` 读取

**修改**:
- 从环境变量获取 workspace
- 保存到 `{workspace}/path/to/file`
- 从 `{workspace}/path/to/file` 读取

---

### 环节 5: WorkflowEngine 产物传递

**问题**:
- 尝试从 fileOperations 构建（只适用于 ExternalAgent）
- 注入的产物信息不完整

**修改**:
- 从 Agent.artifacts 获取产物（支持 undefined）
- 注入 workspace + relativePath
- 下一步 step 可以正确读取文件

---

### 环节 6: Workspace 清理

**问题**: 没有清理默认 workspace

**修改**:
- WorkflowEngine 执行完毕后清理
- 只清理 `/tmp/myagent-workspace/` 下的
- 保留用户指定的 workspace

---

## 修改计划

### Phase 1: 基础设施（核心，必须先完成）

**目标**: 建立 workspace 标准和传递机制

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 1.1 | 定义 workspace 常量 `/tmp/myagent-workspace` | 新建 `src/core/workspace/constants.ts` |
| 1.2 | 重构 WorkspaceManager 为 Task Level | `src/core/skill/hooks/workspace_manager.py` |
| 1.3 | Agent 计算 workspace 并传递给 Sandbox | `src/core/agent/agent.ts` |
| 1.4 | Sandbox 通过环境变量传递 workspace | `src/core/sandbox/adapters/local.ts` |

**验收标准**:
- Python Skills 能获取到 `MOTIA_TASK_WORKSPACE` 环境变量
- 值为 `/tmp/myagent-workspace/{taskId}/`

---

### Phase 2: 产物信息（核心）

**目标**: 所有 Agent 统一返回 artifacts 字段（可为 undefined）

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 2.1 | Agent 从 output_files 构建 artifacts | `src/core/agent/agent.ts` |
| 2.2 | Agent 始终返回 artifacts 字段（有产物时填充，无产物时为 undefined） | `src/core/agent/agent.ts` |
| 2.3 | Agent 始终返回 metadata.workspace | `src/core/agent/agent.ts` |
| 2.4 | WorkflowEngine 从 Agent.artifacts 获取产物（处理 undefined） | `src/core/workflow/engine.ts` |

**验收标准**:
- Agent 返回结果包含 `artifacts: AgentArtifacts | undefined`
- 无产物时 `artifacts = undefined`，有产物时填充数据
- metadata.workspace 始终有值

---

### Phase 3: Skills 适配（重要）

**目标**: Python Skills 使用 workspace 读写文件

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 3.1 | tool-write 保存到 workspace | `skills/tool-write/handler.py` |
| 3.2 | tool-read 从 workspace 读取 | `skills/tool-read/handler.py` |
| 3.3 | tool-bash 使用 workspace 作为工作目录 | `skills/tool-bash/handler.py` |

**验收标准**:
- tool-write 保存文件到 `/tmp/myagent-workspace/{taskId}/xxx`
- tool-read 能正确读取上一步创建的文件

---

### Phase 4: Workflow 产物传递（重要）

**目标**: 下一步 step 能读取上一步的文件

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 4.1 | WorkflowEngine 传递 workspace 给 Agent | `src/core/workflow/engine.ts` |
| 4.2 | WorkflowEngine 注入完整的产物信息 | `src/core/workflow/engine.ts` |
| 4.3 | 构建正确的任务描述（workspace + relativePath） | `src/core/workflow/engine.ts` |

**验收标准**:
- 第二个 step 收到的任务描述包含 workspace 信息
- LLM 能正确构建文件路径

---

### Phase 5: 清理逻辑（可选）

**目标**: 自动清理默认 workspace

| 步骤 | 内容 | 涉及文件 |
|------|------|---------|
| 5.1 | WorkflowEngine 清理默认 workspace | `src/core/workflow/engine.ts` |
| 5.2 | 更新 TaskWorkspaceHook 清理逻辑 | `src/core/task/hooks/task-workspace-hook.ts` |

**验收标准**:
- Workflow 执行完毕后清理 `/tmp/myagent-workspace/{taskId}/`
- 用户指定的 workspace 不被清理

---

## 修改文件列表

### TypeScript 文件（8个）

| 文件 | 修改类型 | 优先级 | Phase |
|------|---------|-------|-------|
| `src/core/workspace/constants.ts` | 新建 | P0 | 1 |
| `src/core/agent/agent.ts` | 修改 | P0 | 1, 2 |
| `src/core/workflow/engine.ts` | 修改 | P0 | 2, 4, 5 |
| `src/core/sandbox/adapters/local.ts` | 修改 | P1 | 1 |
| `src/core/task/hooks/task-workspace-hook.ts` | 修改 | P2 | 5 |
| `src/core/agent/external-agent.ts` | 修改 | P2 | 2 |
| `src/core/agent/master-agent.ts` | 修改 | P2 | 2 |
| `src/core/agent/artifact-collector.ts` | 修改 | P2 | 2 |

### Python 文件（5个）

| 文件 | 修改类型 | 优先级 | Phase |
|------|---------|-------|-------|
| `src/core/skill/hooks/workspace_manager.py` | 修改 | P0 | 1 |
| `skills/tool-write/handler.py` | 修改 | P1 | 3 |
| `skills/tool-read/handler.py` | 修改 | P1 | 3 |
| `skills/tool-bash/handler.py` | 修改 | P1 | 3 |
| 其他 skills（可选） | 修改 | P2 | 3 |

---

## 依赖关系

```
Phase 1（基础设施）
    ↓
Phase 2（产物信息）← 依赖 Phase 1
    ↓
Phase 3（Skills）← 依赖 Phase 1
    ↓
Phase 4（Workflow）← 依赖 Phase 1, 2
    ↓
Phase 5（清理）← 可选
```

**建议**: 按顺序实施，每个 Phase 完成后测试验收。

---

## 测试场景

### 场景1: SubAgent 调用 Skills，有产物

```
Workflow:
  Step 1: 创建计划文档
  Step 2: 根据计划实现代码

验证:
  ✓ Step 1 创建的文件在 /tmp/myagent-workspace/{taskId}/plan.md
  ✓ Step 2 能读取到 plan.md
  ✓ Step 2 artifacts 包含所有创建的文件
```

### 场景2: SubAgent 纯对话，无产物

```
Task: 解释一段代码

验证:
  ✓ Agent 返回 artifacts: undefined
  ✓ Agent 返回 metadata.workspace（有值）
  ✓ 不会报错"artifacts 字段不存在"
```

### 场景3: 自定义 workspace

```
Task: 在当前代码仓库中添加功能

验证:
  ✓ workspace = /Users/leo/project-myagent/
  ✓ 文件保存到指定路径
  ✓ Task 结束后 workspace 不被清理
```

---

## 创建日期

2026-04-11
