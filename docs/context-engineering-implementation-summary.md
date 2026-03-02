# 编排层架子和跨会话画像应用实现完成

## 实现日期
2026-03-02

## 实现内容

### 1. 编排层接口 (`src/core/context/orchestrator.ts`)

创建了 `ContextOrchestrator` 接口，定义了编排层的核心能力：

```typescript
export interface ContextOrchestrator {
  getContext(context: any, state: SessionState): Promise<OrchestratedContext>;
}
```

**`OrchestratedContext`** 包含：
- `history`: 对话历史
- `variables`: 可用变量
- `originalTask`: 原始任务（多轮对话）
- `userProfile`: 用户画像（跨会话累积）
- `userContext`: 应用特定上下文（如 AI 女友的角色设定） ✅ 新增

### 2. 默认实现 (`src/core/context/default-orchestrator.ts`)

实现了 `DefaultContextOrchestrator` 类，提供基本的上下文组装逻辑：

- **对话历史**：直接从 `state.conversationHistory` 获取
- **变量**：直接从 `state.variables` 获取
- **用户画像提取**：
  1. `context.context.workingMemory.userProfile`
  2. `context.workingMemory.userProfile`
- **应用上下文提取** ✅ 新增：
  1. `context.context.workingMemory.userContext`
  2. `context.workingMemory.userContext`

### 3. Agent 层修改 (`src/core/agent/agent.ts`)

1. **Handlebars 模板渲染** ✅ 新增：
   - 安装 `handlebars` 依赖
   - 实现 `buildEnhancedSystemPrompt()` 方法
   - 支持在 system prompt 中使用 `{{userContext.xxx}}` 和 `{{userProfile.xxx}}`

2. **在 `run()` 方法中**：通过编排器获取统一上下文

```typescript
const orchestratedContext = await this.orchestrator.getContext(context, this.state);

const ptcOptions = {
  history: orchestratedContext.history,
  variables: orchestratedContext.variables,
  originalTask: orchestratedContext.originalTask,
  userProfile: orchestratedContext.userProfile,
  userContext: orchestratedContext.userContext,  // ✅ 新增
};
```

3. **Intent Analysis 增强** ✅ 新增：
   - 添加对话历史上下文
   - 添加用户画像支持
   - 移除硬编码的意图类型限制

4. **新增辅助方法**：
   - `getUserProfileText(context)` - 获取格式化后的用户画像文本
   - `buildEnhancedSystemPrompt(context)` - 构建 Handlebars 渲染的 system prompt

### 4. PTCGenerator 修改 (`src/core/agent/ptc-generator.ts`)

1. **Handlebars 模板渲染** ✅ 新增：
   - 支持在 systemPrompt 中使用模板变量
   - 自动注入 `userContext` 和 `userProfile`

2. **用户画像处理**：
```typescript
// Add user profile section for personalization
if (options?.userProfile) {
  const contextManager = new ContextManager();
  const profileText = contextManager.formatUserProfile(options.userProfile);
  if (profileText) {
    userProfileSection = `${profileText}
    CRITICAL - USER PREFERENCE GUIDELINES:
    ...`;
  }
}
```

### 5. MasterAgent 修改 (`src/core/agent/master-agent.ts`)

**修复上下文传递** ✅ 关键修复：

**修改前**：只传递部分字段，导致 userProfile 和 userContext 丢失
```typescript
const delegationContext = {
  originalUserTask: originalTask,
  ...(context?.originalTask && { originalTask: context.originalTask }),
  // ❌ 缺少 workingMemory，导致 userProfile/userContext 丢失
};
```

**修改后**：展开完整 context，保留所有数据
```typescript
const delegationContext = {
  ...context,  // ✅ 包含 workingMemory.userProfile 和 workingMemory.userContext
  originalUserTask: originalTask,
};
```

### 6. API 层修改 (`steps/agents/master-agent.step.ts`)

**userContext 复制** ✅ 新增：

```typescript
// 将 API 传入的 userContext 复制到 workingMemory
if (input.userContext) {
  (taskContext.context as any).workingMemory.userContext = input.userContext;
}
```

### 7. 类型定义更新 (`src/core/agent/types.ts`)

在 `PTCGenerationOptions` 接口中添加了：
- `userProfile?: any` - 用户画像
- `userContext?: any` - 应用特定上下文 ✅ 新增

## 数据流向

```
API 请求 (userContext)
  ↓
master-agent.step.ts
  ↓ 复制 userContext 到 workingMemory
  ↓
UserProfileAccumulatorHook.preExec()
  ↓ 加载 userProfile 到 workingMemory
  ↓
Agent.run()
  ↓ 通过 orchestrator.getContext() 获取统一上下文
  ↓
  ├─ history (从 state)
  ├─ variables (从 state)
  ├─ userProfile (从 workingMemory)
  └─ userContext (从 workingMemory) ✅ 新增
  ↓
Agent.buildEnhancedSystemPrompt()
  ↓ Handlebars 渲染模板 ✅ 新增
  ↓
PTCGenerator.generateCode()
  ↓ 再次渲染模板并生成代码
  ↓
LLM 调用使用增强的 prompt
```

## 关于 userContext vs userProfile

| 类型 | 说明 | 来源 | 注入位置 |
|------|------|------|----------|
| **userProfile** | 通用用户画像（preferences, habits, tags）<br>由 UserProfileAccumulatorHook 自动累积 | 数据库（users 表） | ✅ 所有 LLM 调用 |
| **userContext** | 应用特定的上下文（如 AI 角色设定）<br>由应用层通过 API 传入 | API 请求参数 | ✅ Subagent 模板 |

## 为其他 LLM 调用预留接口

Agent 类新增方法，可用于任何 LLM 调用：

```typescript
// 获取格式化后的用户画像文本
const profileText = this.getUserProfileText(context);

// 构建带模板渲染的 system prompt
const systemPrompt = this.buildEnhancedSystemPrompt(context);
```

**可用于**：
- Summarizer
- RequestRewriter
- Intent Analysis（已实现）
- 其他 LLM 调用

## 测试

创建了 `tests/unit/core/context/default-orchestrator.test.ts`，包含 11 个测试用例，全部通过：

- ✓ 对话历史提取
- ✓ 变量提取
- ✓ 原始任务提取
- ✓ 用户画像提取（2 个来源）
- ✓ 应用上下文提取（2 个来源）✅ 新增
- ✓ 配置开关测试
- ✓ 优先级顺序测试

**运行结果**: 所有测试通过。

## 设计决策

1. **userContext 现已支持** ✅：应用层可以通过 API 传入特定上下文（如 AI 女友的角色设定），subagent 模板可以访问

2. **简化模板渲染** ✅：移除 `hasHandlebars` 检查，因为 Handlebars.compile() 对非模板字符串也能正常工作

3. **向后兼容**：无画像/无上下文时行为不变

4. **统一注入**：userProfile 和 userContext 通过统一的编排层接口获取

## 前端修复

**Context Tab 加载问题** ✅ 修复：
- 修复直接点击 User Context tab 会无限加载的问题
- 添加自动加载逻辑：切换到 Session/User tab 时，如果没有 sessionId，先获取 Task Context

**Icon 优化** ✅ 修复：
- 用户偏好：心形 icon (preference)
- 用户习惯：时钟 icon (habit)
- 用户标签：标签 icon (tag)
- 关联会话：用户组 icon (session)
- 行为数据：柱状图 icon (behavior)

## 下一步（未来扩展）

- [ ] 在 Summarizer 中使用用户画像
- [ ] 在 RequestRewriter 中使用用户画像
- [ ] 实现智能化的编排器（根据任务类型过滤相关内容）
- [ ] 向量检索集成（语义搜索）
- [ ] 缓存层优化
