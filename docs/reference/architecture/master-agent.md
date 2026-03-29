# MasterAgent 详解

> 多 Subagent 协作的编排系统

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 MasterAgent 是什么？

**MasterAgent** 是 MyAgent 的**任务编排系统**，能够智能地将复杂任务分解并委派给专门的 Subagent。

### 核心能力

- ✅ **智能委派**: LLM 分析任务，自动选择最合适的 Subagent
- ✅ **显式委派**: 绕过 LLM，直接指定 Subagent
- ✅ **多轮对话增强**: RequestRewriter 自动补全上下文
- ✅ **委派缓存**: 缓存委派计划，减少 LLM 调用
- ✅ **Subagent 管理**: 动态加载和管理 8 个专门 Subagent

---

## 🏗️ 架构设计

### 执行流程

```
┌─────────────────────────────────────────────────────────────┐
│  MasterAgent (编排器)                                       │
│                                                              │
│  1. 接收任务                                                │
│  2. 多轮对话增强 (RequestRewriter)                           │
│  3. 分析并委派 (2 种模式)                                     │
│  4. 整合结果                                                  │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
        ┌�─────────────────────┴──────────────────────┐
        │  委派模式选择                                 │
        │  a. 显式委派 (delegateTo)                     │
        │  b. LLM 智能委派                              │
        └──────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────┐
│  Subagents (专门 Agent)                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐        │
│  │code-review│  │data-analyst│  │security-auditor│        │
│  └──────────┘  └───────────┘  └──────────────┘        │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐        │
│  │developer │  │system-guide│  │emotional-*   │        │
│  └──────────┘  └───────────┘  └──────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎭 可用的 Subagents

### 1. code-reviewer（代码审查专家）

**职责**: 分析代码质量、安全性、可维护性

**System Prompt**:
```
You are a code review expert with deep knowledge of software engineering best practices.

Responsibilities:
- Analyze code for quality, security, and maintainability
- Identify bugs, anti-patterns, and potential issues
- Provide actionable feedback for improvement
```

**可用技能**:
- `code-analysis`: 代码分析
- `tool-read`: 读取文件
- `tool-grep`: 搜索模式
- `tool-glob`: 查找文件

---

### 2. data-analyst（数据分析专家）

**职责**: 数据分析、统计、可视化

**可用技能**:
- 数据查询和分析
- 统计计算
- 图表生成

---

### 3. security-auditor（安全审计专家）

**职责**: 安全漏洞扫描、安全最佳实践

**可用技能**:
- `security-check`: 安全检查
- 漏洞扫描

---

### 4. developer-engineer（开发工程师）

**职责**: 代码实现、重构、功能开发

---

### 5. myagent-system-guide（系统指南）

**职责**: MyAgent 系统使用指导

---

### 6. emotional-girlfriend-*（AI 女朋友系列）

**变体**:
- `emotional-girlfriend-gentle`（温柔型）
- `emotional-girlfriend-lively`（活泼型）
- `emotional-girlfriend-sweet`（甜美型）

**职责**: 情感陪伴、主动关心

---

## 🔄 两种委派模式

### 模式 1: 显式委派（Explicit Delegation）

**特点**:
- ⚡ **快速**: 绕过 LLM 分析，直接执行
- 🎯 **精准**: 明确指定哪些 Subagent
- 📊 **可预测**: 执行顺序固定

**使用场景**:
- 确定需要哪些 Subagent
- 需要特定执行顺序
- 性能要求高

**示例**:
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "审查这段代码的安全性和质量",
    "useDelegation": true,
    "delegateTo": ["code-reviewer", "security-auditor"]
  }'
```

**执行顺序**:
```
1. code-reviewer（代码审查）
2. security-auditor（安全审计）
```

---

### 模式 2: LLM 智能委派

**特点**:
- 🧠 **智能**: LLM 分析任务，自动选择 Subagent
- 🎯 **灵活**: 根据任务动态调整
- 🔄 **缓存**: 缓存委派计划，减少重复调用

**使用场景**:
- 任务复杂，不确定需要哪些 Subagent
- 需要智能判断
- 首次执行某类任务

**示例**:
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "分析这个项目的代码质量，并给出改进建议",
    "useDelegation": true
  }'
```

**LLM 分析**:
```
LLM 思考：
- 需要 code-analysis → code-reviewer
- 需要 security-check → security-auditor
- 可能需要数据统计 → data-analyst

委派计划：
["code-reviewer", "security-auditor"]
```

---

## 🔄 RequestRewriter：多轮对话增强

### 功能

自动补全多轮对话的上下文，让 Subagent 能够理解完整对话历史。

### 工作流程

```
用户消息: "这个 bug 怎么修？"
  ↓
MasterAgent 接收
  ↓
RequestRewriter 分析对话历史
  ↓
重写任务: "根据前面的讨论，这个 bug 应该用 XXX 方法修复。请实现修复。"
  ↓
发送给 Subagent
```

### 配置

```typescript
// 启用多轮对话增强（默认开启）
{
  "useDelegation": true,
  "environment": {
    "rewriteRequest": true  // 默认 true
  }
}
```

---

## 💾 委派缓存

### 缓存机制

```typescript
// 缓存配置
private delegationPlansCache = Map<string, {
  plan: DelegationPlan,      // 委派计划
  timestamp: number,         // 缓存时间
  cacheVersion: string       // 缓存版本
}>;

// 缓存参数
MAX_CACHE_SIZE = 100        // 最多缓存 100 个
CACHE_TTL = 30 * 60 * 1000   // 30 分钟过期
```

### 缓存 Key

```
${sessionId}:${taskHash}
```

### 缓存命中

```typescript
// 检查缓存
const cached = this.delegationPlansCache.get(cacheKey);

if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
  console.log('[MasterAgent] Cache hit, using cached plan');
  return cached.plan;
}
```

---

## 🎯 使用示例

### 示例 1: 显式委派（代码审查 + 安全审计）

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "审查这个 Pull Request",
    "useDelegation": true,
    "delegateTo": ["code-reviewer", "security-auditor"]
  }'
```

**执行流程**:
```
1. MasterAgent 接收任务
2. 跳过 LLM 分析（delegateTo 指定了）
3. 依次执行:
   - code-reviewer: 审查代码质量
   - security-auditor: 审查安全问题
4. 整合结果返回
```

---

### 示例 2: LLM 智能委派（复杂任务）

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  - d '{
    "task": "分析这个项目，找出性能瓶颈并给出优化建议",
    "useDelegation": true
  }'
```

**执行流程**:
```
1. MasterAgent 接收任务
2. LLM 分析任务，决定:
   - code-reviewer: 分析代码结构
   - data-analyst: 分析性能数据
3. 并行执行（如果可以）
4. 整合结果返回
```

---

### 示例 3: 多轮对话 + 委派

```bash
# 第一轮
curl -X POST http://localhost:3000/agent/execute \
  -d '{"task": "帮我看看登录功能的代码", "sessionId": "conv-1"}'

# 第二轮（引用前面内容）
curl -X POST http://localhost:3000/agent/execute \
  -d '{"task": "刚才的代码有什么问题？", "sessionId": "conv-1"}'
```

**RequestRewriter 自动补全**:
```
原始任务: "刚才的代码有什么问题？"

重写任务: "根据对话历史，你刚才帮我查看了登录功能的代码。
现在请分析这段代码有什么问题，并给出修复建议。"
```

---

## ⚙️ 配置

### 基础配置

```typescript
// config/master-agent.config.yaml
master_agent:
  # 可用的 Subagents
  subagents:
    - code-reviewer
    - security-auditor
    - data-analyst
    - developer-engineer

  # 默认配置
  default_timeout: 60000
  max_parallel_delegates: 3

  # 缓存配置
  cache:
    enabled: true
    ttl: 1800  # 30 minutes
    max_size: 100
```

### API 配置

```bash
# 使用 MasterAgent
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "复杂任务",
    "useDelegation": true,
    "delegateTo": ["subagent1", "subagent2"],
    "sessionId": "session-123"
  }'
```

---

## 💡 最佳实践

### 1. 选择合适的委派模式

**使用显式委派** 当:
- ✅ 知道需要哪些 Subagent
- ✅ 执行顺序很重要
- ✅ 性能要求高

**使用 LLM 委派** 当:
- ✅ 任务复杂，不确定需要哪些 Subagent
- ✅ 需要智能判断
- ✅ 首次执行某类任务

---

### 2. 利用缓存提升性能

```typescript
// 相似任务会命中缓存
// 第一次：LLM 分析，生成委派计划
// 第二次：直接使用缓存，跳过 LLM 分析
```

---

### 3. 多轮对话优化

```typescript
// 启用 RequestRewriter
{
  "environment": {
    "rewriteRequest": true  // 默认开启
  }
}
```

---

### 4. 合理使用 Subagent

- ✅ 选择最专业的 Subagent
- ✅ 避免过度委派（性能开销）
- ✅ 考虑 Subagent 的能力范围

---

## 🔍 调试和监控

### 查看委派计划

```typescript
// MasterAgent 会打印日志
console.log('[MasterAgent] Delegation plan:', plan);

// 输出示例
{
  "selectedSubagents": ["code-reviewer", "security-auditor"],
  "reasoning": "任务涉及代码审查，需要安全检查",
  "executionOrder": "sequential"
}
```

### 查看 Stream 追踪

```bash
# 查询任务的执行追踪
curl http://localhost:3000/api/traces/{taskId}

# 响应包含所有 Agent 和 Skill 的执行记录
```

---

## 📈 性能优化

### 1. 使用显式委派

```typescript
// 显式委派：跳过 LLM 分析，直接执行
delegateTo: ["code-reviewer"]
// 比 LLM 委派快 2-3 秒
```

### 2. 利用缓存

```typescript
// 委派计划缓存 30 分钟
// 相似任务直接使用缓存
```

### 3. 并行执行

```typescript
// 未来可能支持
{
  "delegateTo": ["code-reviewer", "data-analyst"],
  "parallel": true  // 并行执行
}
```

---

## 📖 相关文档

- [Agent 系统](./agent-system.md) - Agent 基础
- [Subagent 开发](../api/plugin-api/custom-subagent.md) - 创建 Subagent
- [扩展方式选择](./extension-guide.md) - Hook vs Skill vs Subagent
- [Workflow 系统](./workflow-system.md) - Workflow 编排

---

**版本**: v1.0 | **更新日期**: 2026-03-29
