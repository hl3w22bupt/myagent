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

### 2. 默认实现 (`src/core/context/default-orchestrator.ts`)

实现了 `DefaultContextOrchestrator` 类，提供基本的上下文组装逻辑：

- **优先级顺序**（对话历史）：
  1. `context.context.workingMemory.conversationHistory`
  2. `context.conversationHistory`
  3. `state.conversationHistory`

- **用户画像提取**：
  1. `context.context.workingMemory.userProfile`
  2. `context.workingMemory.userProfile`

### 3. Agent 层修改 (`src/core/agent/agent.ts`)

1. **在 `run()` 方法中**：添加用户画像的提取和注入

```typescript
// Extract and inject user profile from workingMemory
const userProfile = context?.context?.workingMemory?.userProfile
  || context?.workingMemory?.userProfile;
if (userProfile) {
  ptcOptions.userProfile = userProfile;
}
```

2. **新增辅助方法**：`getUserProfileText(context)` - 供其他 LLM 调用使用

```typescript
/**
 * 获取格式化后的用户画像文本
 * 用于其他 LLM 调用（如 Summarizer、RequestRewriter 等）
 */
protected getUserProfileText(context: any): string {
  const userProfile = context?.context?.workingMemory?.userProfile
    || context?.workingMemory?.userProfile;
  if (!userProfile) return '';
  const contextManager = new ContextManager();
  return contextManager.formatUserProfile(userProfile);
}
```

### 4. PTCGenerator 修改 (`src/core/agent/ptc-generator.ts`)

在 `generateCode()` 方法中添加了用户画像的处理：

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

### 5. 类型定义更新 (`src/core/agent/types.ts`)

在 `PTCGenerationOptions` 接口中添加了 `userProfile` 字段：

```typescript
export interface PTCGenerationOptions {
  // ... existing fields ...
  userProfile?: any;
}
```

## 数据流向

```
UserProfileAccumulatorHook.preExec()
  ↓ 加载用户画像到 context.workingMemory.userProfile
  ↓
Agent.run()
  ↓ 提取 userProfile
  ↓
PTCGenerator.generateCode(task, skills, { userProfile })
  ↓
生成带用户画像的 system prompt
  ↓
LLM 调用使用增强的 prompt
```

## 为其他 LLM 调用预留接口

Agent 类新增 `getUserProfileText(context)` 方法，可用于：
- Summarizer
- RequestRewriter
- 意图分析
- 其他 LLM 调用

使用示例：
```typescript
// 在任何需要 LLM 调用的地方
const profileText = this.getUserProfileText(context);
const systemPrompt = `${baseSystemPrompt}\n${profileText}`;
```

## 测试

创建了 `tests/unit/core/context/default-orchestrator.test.ts`，包含 11 个测试用例，全部通过：

- ✓ 对话历史提取（3 个优先级测试）
- ✓ 变量提取
- ✓ 原始任务提取
- ✓ 用户画像提取（2 个来源）
- ✓ 配置开关测试（enableUserProfile）
- ✓ 优先级顺序测试（2 个）

**运行结果**: 22 个测试套件，213 个测试全部通过。

## 设计决策

1. **userContext 暂不注入**：userContext 是应用特定的（如 MyEcho 的 AI 角色设定），暂时保留接口供未来扩展

2. **userProfile 在所有 LLM 调用中可用**：通过 `getUserProfileText()` 方法，任何需要 LLM 调用的地方都可以获取格式化的用户画像

3. **向后兼容**：无画像时行为不变

## 下一步（未来扩展）

- [ ] 在 Summarizer 中使用用户画像
- [ ] 在 RequestRewriter 中使用用户画像
- [ ] 实现智能化的编排器（根据任务类型过滤相关内容）
- [ ] userContext 的应用（等待具体应用场景需求）
