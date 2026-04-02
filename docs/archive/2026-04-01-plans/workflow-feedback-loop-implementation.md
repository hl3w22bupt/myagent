# 工作流反馈循环实施计划

> **创建时间**: 2026-04-01  
> **分支**: `feature/workflow-feedback-loop`  
> **方案**: 方案 B（工作流反馈循环优先）  
> **预计时间**: 6-9 天（人类）→ 11-17 小时（CC+gstack）

---

## 📋 目录

- [核心设计决策](#核心设计决策)
- [架构概览](#架构概览)
- [实施阶段](#实施阶段)
- [测试策略](#测试策略)
- [风险评估](#风险评估)
- [成功标准](#成功标准)

---

## 核心设计决策

### ✅ 统一术语：使用 HITL

**决定**：使用 **HITL**（Human-In-The-Loop）代替 Intervention

**理由**：
- HITL 是 AI/Agent 领域的标准术语
- MyAgent 代码库已在使用（`hitlState`、`HITLState`、`HITLWebhookHook`）
- 统一术语降低学习成本

### ✅ 复用现有 HITL 机制

**决定**：完全复用现有的 Agent HITL 机制

**复用组件**：
- `TaskContext.hitlState` - 存储 HITL 状态
- `pollHITLResult()` - 轮询检查逻辑
- `clearHITLState()` - 清除状态逻辑
- `/api/tasks/:taskId/hitl` - HITL API 端点

**不需要新增**：
- ❌ `intervention_requests` 表
- ❌ 新的 API 端点
- ❌ 新的数据模型

### ✅ 声明式配置

**决定**：通过 YAML 配置定义行为，不是代码硬编码

**配置字段**：
- `retry` - 重试策略
- `on_failure` - 失败处理策略
- `rollbackConfig` - 回滚配置
- `hitl` - HITL 配置

### ✅ 引擎轮询

**决定**：Workflow 引擎轮询检查 HITL 状态

**参数**：
- 轮询间隔：10 秒（可配置）
- 超时时间：7 天（可配置）
- 数据库负载：<0.1%（可忽略）

---

## 架构概览

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                   MyAgent 工作流反馈循环                         │
└─────────────────────────────────────────────────────────────────┘

现有组件（可重用）：
├─ WorkflowEngine (605 行)
├─ Retry Service (200 行)
├─ HITL Webhook (195 行)
└─ Hook System

新增组件：
├─ WorkflowStep 类型扩展
│  ├─ RetryConfig
│  ├─ FailureHandler (retry | skip | rollback | hitl)
│  ├─ RollbackConfig
│  └─ HITLConfig
│
└─ WorkflowEngine 增强
   ├─ executeStepWithRetry()
   ├─ handleStepFailure()
   ├─ handleRollback()
   └─ handleHITL()
```

### 数据流图

```
1. 正常执行路径
   WorkflowStep → executeStepWithRetry → executeStep → 成功 ✅

2. 失败处理路径
   executeStep → 失败 ❌ → handleStepFailure
                                │
                                ├─── [retry] ──→ retryOperation → 重新执行
                                │
                                ├─── [skip] ───→ 标记为 skipped → 继续
                                │
                                ├─── [rollback] → handleRollback → 恢复到指定步骤
                                │
                                └─── [hitl] ───→ handleHITL
                                                   │
                                                   保存 HITL 状态
                                                   ↓
                                            TaskContext.hitlState
                                                   │
                                            引擎轮询（10秒间隔）
                                                   │
                                    ┌──────────────────────────────┐
                                    │ 检查状态                    │
                                    │  - awaiting → 继续轮询     │
                                    │  - completed → executeHITLAction
                                    │  - timeout → 失败           │
                                    └──────────────────────────────┘

3. HITL 动作执行
   executeHITLAction → 根据响应执行
                        ├─ [retry] → 重新执行步骤
                        ├─ [skip] → 跳过步骤
                        ├─ [rollback] → 回滚
                        └─ [abort] → 抛出异常
```

---

## 实施阶段

### Phase 1: 类型扩展（1-2 天）

**文件**：`src/core/workflow/types.ts`

**任务**：
- [ ] 添加 `RetryConfig` 接口
- [ ] 添加 `FailureHandler` 类型
- [ ] 添加 `RollbackConfig` 接口
- [ ] 添加 `HITLConfig` 接口
- [ ] 添加 `HITLOption` 接口
- [ ] 更新 `WorkflowStep` 接口

**代码量**：约 120 行

---

### Phase 2: 工作流引擎增强（2-3 天）

**文件**：`src/core/workflow/engine.ts`

**任务**：
- [ ] 实现 `executeStepWithRetry()` 方法
- [ ] 实现 `handleStepFailure()` 方法
- [ ] 实现 `handleRollback()` 方法
- [ ] 实现 `handleHITL()` 方法
- [ ] 实现 `executeHITLAction()` 方法
- [ ] 实现 `getStepsFrom()` 辅助方法
- [ ] 更新 `execute()` 主方法

**代码量**：约 400 行

---

### Phase 3: 测试（1-2 天）

**新建文件**：
- `tests/workflow/types.test.ts`
- `tests/workflow/retry-logic.test.ts`
- `tests/workflow/hitl-logic.test.ts`
- `tests/workflow/rollback-logic.test.ts`
- `tests/integration/workflow-feedback-e2e.test.ts`

**代码量**：约 300 行

---

### Phase 4: 文档（0.5 天）

**更新文件**：
- `docs/reference/architecture/workflow-system.md`
- `docs/api/hitl-api.md`

**新建文件**：
- `workflows/examples/feedback-loop-workflow.yaml`

**代码量**：约 100 行

---

## 测试策略

### 单元测试覆盖

| 组件 | 测试内容 | 覆盖率目标 |
|------|---------|-----------|
| 重试逻辑 | 网络错误重试、语法错误不重试、指数退避 | >90% |
| 失败处理 | retry/skip/rollback/hitl 策略 | >90% |
| HITL 逻辑 | 状态保存、轮询、动作执行 | >90% |
| 回滚逻辑 | 回滚到指定步骤、上下文清理 | >90% |

### 集成测试场景

1. **重试成功场景** - 网络失败 → 重试 2 次 → 成功
2. **HITL 完整流程** - 失败 → 请求 HITL → 用户批准 → 继续执行
3. **回滚场景** - Step 3 失败 → 回滚到 Step 1 → 重新执行
4. **超时场景** - HITL 7 天无响应 → 自动中止

### 性能测试

- **轮询负载** - 10 个并发工作流，验证数据库负载 <0.1%
- **内存使用** - 24 小时运行，监控内存泄漏
- **并发测试** - 50 个并发工作流，验证无竞态条件

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 轮询导致数据库压力 | 高 | 低 | 10秒间隔，仅介入时轮询，<0.1% 负载 |
| HITL 状态丢失 | 高 | 低 | 持久化到 TaskContext，事务保护 |
| 回滚导致死循环 | 中 | 低 | 记录回滚次数，超阈值中止 |
| 长时间运行占用内存 | 中 | 中 | 7天超时，监控内存 |
| 并发工作流冲突 | 中 | 中 | taskId 独立，无共享状态 |
| 重试风暴 | 低 | 低 | 指数退避+抖动，智能分类 |

---

## 配置示例

### 简单重试

```yaml
steps:
  - id: fetch-data
    agent: developer
    retry:
      maxRetries: 2
      delayMs: 5000
```

### HITL 配置

```yaml
steps:
  - id: deploy-prod
    agent: developer
    on_failure: hitl
    hitl:
      timeout: 604800000  # 7天
      pollInterval: 10000  # 10秒
      options:
        - id: retry
          label: 重试部署
          action: retry
          style: primary
        - id: abort
          label: 中止部署
          action: abort
          style: danger
```

### 完整反馈循环

```yaml
steps:
  - id: analyze
    agent: analyzer
    retry:
      maxRetries: 2

  - id: develop
    agent: developer
    depends_on: [analyze]
    on_failure: rollback
    rollbackConfig:
      targetStepId: analyze

  - id: test
    agent: tester
    depends_on: [develop]
    on_failure: hitl
    hitl:
      options:
        - id: fix
          label: 修复后重试
          action: retry
        - id: skip
          label: 跳过测试
          action: skip
```

---

## API 文档

### HITL 请求格式

```bash
POST /api/tasks/:taskId/hitl
Content-Type: application/json

{
  "action": "retry" | "skip" | "rollback" | "abort",
  "reason": "Human decision reason",
  "params": {
    "targetStepId": "step-id"  # 仅 rollback 需要
  }
}
```

### HITL 状态结构

```typescript
TaskContext.hitlState = {
  stage: 'workflow_failure',
  status: 'awaiting' | 'completed',
  agentName: 'Workflow:workflow-name',
  question: '步骤 xxx 执行失败：...',
  options: ['重试', '跳过', '中止'],
  workflowName: 'workflow-name',
  stepId: 'step-id',
  failureReason: 'error message',
  retryAttempt: 0,
  createdAt: '2026-04-01T...'
}
```

---

## 成功标准

### 必须达成 ✅

- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 代码覆盖率 > 90%
- [ ] TypeScript 编译无错误
- [ ] ESLint 检查通过

### 应该达成 ⭐

- [ ] 至少 3 个真实工作流示例
- [ ] 文档完整（配置 + API + 架构）
- [ ] 代码审查通过
- [ ] 轮询性能验证 < 0.1%

### 可以达成 💡

- [ ] 性能基准测试
- [ ] 监控和告警配置
- [ ] 生产环境部署指南

---

## 实施检查清单

### Phase 1: 类型扩展
- [ ] 添加 `RetryConfig`
- [ ] 添加 `FailureHandler`
- [ ] 添加 `RollbackConfig`
- [ ] 添加 `HITLConfig`
- [ ] 添加 `HITLOption`
- [ ] 更新 `WorkflowStep`
- [ ] 编写类型测试

### Phase 2: 引擎增强
- [ ] `executeStepWithRetry()`
- [ ] `handleStepFailure()`
- [ ] `handleRollback()`
- [ ] `handleHITL()`
- [ ] `executeHITLAction()`
- [ ] `getStepsFrom()`
- [ ] 更新 `execute()`

### Phase 3: 测试
- [ ] 重试逻辑单元测试
- [ ] 失败处理单元测试
- [ ] HITL 逻辑单元测试
- [ ] 回滚逻辑单元测试
- [ ] 集成测试

### Phase 4: 文档
- [ ] 更新 workflow-system.md
- [ ] 更新 hitl-api.md
- [ ] 添加配置示例

---

**文档版本**: v1.0  
**最后更新**: 2026-04-01  
**下一步**: 开始 Phase 1 - 类型扩展
