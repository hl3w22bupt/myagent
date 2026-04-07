# ExternalAgent 实现总结

## 📅 实施日期
2026-04-07

## 🎯 目标
让 MyAgent 能够通过 ACP（Agent Client Protocol）调用外部编码代理（Claude Code、Cursor 等），用于复杂的编码任务。

## ✅ 已完成的功能

### 1. ExternalAgent 核心实现

**文件**: `src/core/agent/external-agent.ts`

**功能**:
- ✅ 通过 ACP 协议调用外部 Claude Code
- ✅ 支持 per-task workspace 配置
- ✅ 文件正确创建在指定的 workspace 目录
- ✅ 捕获 tool_call 事件，记录文件操作信息
- ✅ 返回完整的 metadata（workspace, externalAgent, fileOperations）

**支持的 Agent 类型**:
- `claude` - Claude Code（通过 @agentclientprotocol/claude-agent-acp）
- `codex` - OpenAI Codex
- `cursor` - Cursor CLI
- `gemini` - Gemini CLI
- `pi` - Pi Coding Agent
- `openclaw` - OpenClaw ACP

### 2. Metadata 传递修复

**修改的文件**:
- `src/core/agent/master-agent.ts`（第 333、1294 行）
- `steps/api/context-api.step.ts`

**问题**: MasterAgent 和 Context API 没有正确传递子代理的 metadata

**修复**:
- MasterAgent 现在传递完整的 `result.metadata`
- Context API 合并 task 表和 context 表的 metadata

### 3. Workspace API

**文件**: `steps/api/workspace-api.step.ts`

**功能**:
- ✅ `GET /api/workspace/:taskId` - 获取任务的 workspace 文件列表
- ✅ 递归扫描目录（最大深度 5 层）
- ✅ 返回文件信息（名称、路径、大小、类型、修改时间）
- ✅ 路径安全验证（防止路径遍历攻击）

**响应示例**:
```json
{
  "success": true,
  "data": {
    "taskId": "task-1775573783066-1",
    "workspace": "/tmp/test-fileops",
    "files": [
      {
        "name": "file1.txt",
        "path": "/tmp/test-fileops/file1.txt",
        "size": 5,
        "type": "file",
        "modifiedTime": "2026-04-07T14:56:45.991Z",
        "relativePath": "file1.txt"
      }
    ],
    "summary": {
      "fileCount": 2,
      "dirCount": 0,
      "totalSize": 11
    }
  }
}
```

### 4. Configuration 和类型定义

**文件**: `src/core/agent/types.ts`

**新增类型**:
```typescript
export interface ExternalAgentConfig extends AgentConfig {
  externalAgent: {
    type: 'claude' | 'codex' | 'gemini' | 'cursor' | 'pi' | 'openclaw';
    protocol?: 'acp' | 'stdio';
    timeout?: number;
    workingDirectory?: string;
    args?: string[];
  };
}
```

**文件**: `subagents/claude-code-external/agent.yaml`

```yaml
name: claude-code-external
agent:
  external_agent:
    type: claude
    protocol: acp
    timeout: 300000
    working_directory: /Users/leo/workspace/myagent
  available_skills: []
```

## 📊 测试验证

### 测试任务列表

| 任务 ID | 描述 | Workspace | 状态 |
|---------|------|-----------|------|
| task-1775571797954-1 | 创建 final-success.txt | /tmp/test-workspace-final-success | ✅ |
| task-1775572754644-1 | 创建 hello.py | /tmp/test-complex | ✅ |
| task-1775573783066-1 | 创建 file1.txt, file2.txt | /tmp/test-fileops | ✅ |
| task-1775575000543-1 | 列出嵌套目录文件 | /tmp/test-nested | ✅ |

### Metadata 验证

所有任务都正确返回了 metadata：
```json
{
  "externalAgent": "claude",
  "workspace": "/tmp/test-fileops",
  "fileOperations": [...],
  "toolCallsCount": 8
}
```

### Workspace API 验证

- ✅ 简单文件列表
- ✅ 嵌套目录扫描
- ✅ 文件统计信息
- ✅ 路径安全验证

## 🔧 技术细节

### ACP 协议集成

**使用的库**: `acpx`（OpenClaw 的 ACP 运行时）

**关键方法**:
```typescript
import { createAcpRuntime, createAgentRegistry, createFileSessionStore } from 'acpx/runtime';

// 创建 runtime
const runtime = createAcpRuntime({
  cwd: workspace,
  sessionStore,
  agentRegistry,
  permissionMode: 'approve-all',
  timeoutMs: 300000,
  verbose: true,
});

// 确保 session
const handle = await runtime.ensureSession({
  sessionKey: sessionId,
  agent: 'claude',
  mode: 'oneshot',
  cwd: workspace,
});

// 执行任务
const events = await runtime.runTurn({
  handle,
  text: task,
  mode: 'prompt',
  requestId: taskId,
});
```

### 事件处理

**处理的事件类型**:
- `text_delta` - 文本输出
- `tool_call` - 工具调用（文件操作）
- `done` - 任务完成
- `error` - 错误

**tool_call 事件解析**:
```typescript
interface ToolCallEvent {
  type: 'tool_call';
  tag: 'tool_call' | 'tool_call_update';
  toolCallId: string;
  title: string;
  text: string;
  status?: 'pending' | 'completed';
}

// 解析为文件操作
interface FileOperation {
  type: 'write' | 'edit' | 'read' | 'create';
  path: string;
  status: string;
  toolCallId: string;
  title: string;
  rawText: string;
}
```

### Workspace 解析优先级

```typescript
1. context.environment.workspace（动态，per-task）
2. context.environment.workingDirectory（动态，per-task）
3. externalAgent.workingDirectory（静态，配置）
4. 自动创建临时目录（/tmp/myagent-workspaces/workspace-{timestamp}-{random})
```

## 📝 文档

创建的文档：
- ✅ `docs/external-agent.md` - ExternalAgent 完整文档
- ✅ `docs/workspace-api.md` - Workspace API 前端实现文档

## 🐛 已知问题和限制

### 1. tool_call 事件状态不完整

**问题**: 解析的 fileOperation.status 大部分是 "unknown"

**原因**: tool_call 事件的 status 字段只在最终完成时才出现

**影响**: 用户无法准确知道每个文件操作的完成状态

**解决方案**: 可以通过跟踪 toolCallId 来关联 pending 和 completed 事件

### 2. 残留进程

**问题**: 执行后会留下残留的 claude-agent-acp 进程

**临时方案**: `pkill -f "claude-agent-acp"`

**长期方案**: 在 ExternalAgent.cleanup() 中实现进程清理

### 3. 文件内容无法通过 API 访问

**当前**: 只能通过 API 知道创建了哪些文件，但无法读取文件内容

**建议**: 可以添加 `GET /api/workspace/:taskId/files/*` 接口来读取文件内容

## 🚀 下一步建议

### 前端实现
1. 在任务详情页添加 Workspace Tab
2. 实现文件列表显示（树形结构）
3. 添加文件内容预览功能
4. 显示 fileOperations 信息（让用户知道哪些文件被修改了）

### 后端优化
1. 实现文件内容读取 API
2. 添加文件下载功能
3. 实现 workspace 清理功能
4. 改进 tool_call 事件状态跟踪

### 功能增强
1. 支持更多外部 agent 类型
2. 实现 workspace 模板功能
3. 添加 workspace 共享功能
4. 支持 workspace 持久化（不要每次都删除）

## 📈 性能数据

**平均执行时间**: ~28 秒

**内存使用**: 正常

**并发支持**: 未测试

## 🔗 相关链接

- [ACP 规范](https://agentclientprotocol.com)
- [acpx GitHub](https://github.com/openclaw/acpx)
- [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)

## 👥 团队

**实施者**: Claude Code (Anthropic Sonnet 4.6)

**日期**: 2026-04-07

**版本**: v1.0.0
