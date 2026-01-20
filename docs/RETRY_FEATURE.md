# Retry 功能文档

## 概述

Motia Agent System 现在支持智能重试机制，当任务执行失败时可以自动重试，提高系统的可靠性和容错能力。

**实现版本**: v1.2
**更新日期**: 2026-01-20
**功能状态**: ✅ 已实现并测试通过

---

## 功能特性

### ✅ 核心特性

1. **智能错误分类**：自动区分可重试和不可重试的错误
2. **指数退避**：使用指数退避策略避免过度重试
3. **随机抖动**：添加随机性避免"雷鸣群效应"
4. **可配置性**：支持自定义重试策略和错误判断
5. **透明性**：详细的日志记录和重试信息追踪

### 🎯 适用场景

**适合重试的错误**：
- 网络超时（timeout, ETIMEDOUT, ESOCKETTIMEDOUT）
- 网络错误（ECONNREFUSED, ECONNRESET, ENOTFOUND）
- 临时性错误（temporary unavailable, service unavailable）
- 速率限制（rate limit, too many requests）

**不适合重试的错误**：
- 语法错误（syntax error, type error）
- 权限错误（permission denied, access denied, unauthorized）
- 验证错误（validation failed, invalid input）
- 文件不存在（ENOENT）

---

## 配置方式

### 1. 环境变量配置

在 `.env` 文件中配置：

```bash
# 重试配置
MAX_RETRIES=3                    # 最大重试次数（默认：3）
RETRY_BASE_DELAY=1000            # 基础延迟毫秒（默认：1000）
RETRY_MAX_DELAY=30000            # 最大延迟毫秒（默认：30000）
RETRY_EXPONENTIAL_BACKOFF=true   # 是否使用指数退避（默认：true）
```

### 2. 代码配置

在 `src/index.ts` 中配置：

```typescript
agentConfig: {
  constraints: {
    retry: {
      maxRetries: 3,              // 最大重试次数
      baseDelay: 1000,            // 基础延迟：1秒
      maxDelay: 30000,            // 最大延迟：30秒
      exponentialBackoff: true,   // 使用指数退避
      isRetryable: (error: Error) => boolean, // 自定义错误判断
    },
  },
}
```

---

## 使用示例

### 默认配置

```typescript
// 使用默认配置（3次重试，指数退避）
const agent = await agentManager.acquire(sessionId);
const result = await agent.run('执行可能失败的任务');

// 检查重试信息
if (result.metadata.retries) {
  console.log(`重试次数: ${result.metadata.retries.attempts}`);
  console.log(`总延迟: ${result.metadata.retries.totalDelay}ms`);
  console.log(`是否恢复: ${result.metadata.retries.recovered}`);
}
```

### 禁用重试

```typescript
// 方法 1：设置 maxRetries 为 0
constraints: {
  retry: {
    maxRetries: 0,
  },
}

// 方法 2：不设置 retry 配置
constraints: {
  // 不包含 retry 字段
}
```

### 自定义重试策略

```typescript
constraints: {
  retry: {
    maxRetries: 5,              // 增加重试次数
    baseDelay: 2000,            // 更长的初始延迟
    maxDelay: 60000,            // 更长的最大延迟
    exponentialBackoff: false,  // 使用线性退避
    isRetryable: (error) => {
      // 只重试超时错误
      return error.message.includes('timeout');
    },
  },
}
```

---

## 重试行为详解

### 指数退避示例

假设 `baseDelay = 1000ms`，`maxRetries = 3`：

| 尝试次数 | 延迟计算 | 实际延迟 | 累计延迟 |
|---------|---------|---------|---------|
| 1       | 1000 × 2⁰ | 1000ms  | 0ms     |
| 2       | 1000 × 2¹ | 2000ms  | 1000ms  |
| 3       | 1000 × 2² | 4000ms  | 3000ms  |
| 4       | 1000 × 2³ | 8000ms  | 7000ms  |

### 线性退避示例

假设 `baseDelay = 1000ms`，`maxRetries = 3`：

| 尝试次数 | 延迟计算 | 实际延迟 | 累计延迟 |
|---------|---------|---------|---------|
| 1       | 1000 × 1 | 1000ms  | 0ms     |
| 2       | 1000 × 2 | 2000ms  | 1000ms  |
| 3       | 1000 × 3 | 3000ms  | 3000ms  |
| 4       | 1000 × 4 | 4000ms  | 6000ms  |

---

## 执行结果

### AgentResult.metadata.retries

成功或失败的任务结果都会包含重试信息：

```typescript
{
  success: true,
  output: "任务结果",
  metadata: {
    llmCalls: 1,
    skillCalls: 2,
    totalTokens: 1000,
    retries: {
      attempts: 3,           // 总尝试次数
      totalDelay: 3000,       // 总重试延迟（毫秒）
      recovered: true        // 是否通过重试恢复
    }
  }
}
```

**注意**：`retries` 字段仅在发生重试时出现（`attempts > 1`）。

---

## 日志示例

### 重试成功

```
[Agent] Executing PTC code in sandbox
[Agent] Retrying sandbox execution {
  attempt: 1,
  error: 'ETIMEDOUT: Operation timed out',
  delay: 1000,
  maxRetries: 3
}
[Agent] Retrying sandbox execution {
  attempt: 2,
  error: 'ETIMEDOUT: Operation timed out',
  delay: 2000,
  maxRetries: 3
}
[Agent] Sandbox execution recovered after retries {
  attempts: 3,
  totalDelay: 3000
}
[Agent] Sandbox execution completed { success: true }
```

### 重试失败（非重试错误）

```
[Agent] Executing PTC code in sandbox
[Agent] Sandbox execution completed { success: false }
```

**注意**：语法错误等不可重试的错误不会触发重试。

---

## 高级用法

### 自定义错误判断

```typescript
import { isDefaultRetryableError } from './core/agent/retry';

constraints: {
  retry: {
    maxRetries: 5,
    isRetryable: (error: Error) => {
      // 首先检查默认规则
      if (!isDefaultRetryableError(error)) {
        return false;
      }

      // 自定义规则：不重试包含"critical"的错误
      if (error.message.toLowerCase().includes('critical')) {
        return false;
      }

      return true;
    },
  },
}
```

### 重试回调

```typescript
constraints: {
  retry: {
    maxRetries: 3,
    onRetry: (attempt, error, delay) => {
      // 发送监控事件
      console.log(`Retry attempt ${attempt} after ${delay}ms`, {
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      // 记录到外部监控系统
      monitoringService.incrementCounter('retry.attempts', {
        attempt: attempt,
        errorType: error.name,
      });
    },
  },
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **合理设置重试次数**：3-5次通常足够，过多可能导致资源浪费
2. **使用指数退避**：避免过快的重试导致系统压力
3. **监控重试率**：高重试率可能表示系统问题
4. **区分错误类型**：只为临时性错误启用重试
5. **设置合理的超时**：超时应与重试延迟相匹配

### ⚠️ 注意事项

1. **不要重试所有错误**：语法错误、权限错误等不应重试
2. **避免无限重试**：始终设置 `maxRetries` 上限
3. **考虑资源消耗**：每次重试都会消耗 LLM 配额和时间
4. **记录重试日志**：便于问题诊断和性能分析
5. **测试重试逻辑**：确保重试机制按预期工作

---

## 性能影响

### 时间成本

| 场景 | 无重试 | 有重试（3次） |
|------|--------|--------------|
| 首次成功 | 1s | 1s |
| 第2次成功 | - | 1s + 1s = 2s |
| 第3次成功 | - | 1s + 1s + 2s = 4s |
| 第4次成功 | - | 1s + 1s + 2s + 4s = 8s |

### 资源消耗

- **LLM 调用**：每次重试都会重新生成 PTC 代码
- **沙箱执行**：每次重试都会重新启动 Python 进程
- **内存占用**：重试期间会保存所有执行步骤

**建议**：根据实际业务需求权衡重试次数和资源消耗。

---

## 故障排查

### 问题 1：重试没有生效

**检查**：
- 确认 `retry.maxRetries` 大于 0
- 确认错误类型在可重试列表中
- 查看日志是否有 "Retrying sandbox execution" 消息

```typescript
// 调试日志
console.log('[Retry] Config:', this.config.constraints?.retry);
console.log('[Retry] Error:', error.message);
console.log('[Retry] Is retryable:', isDefaultRetryableError(error));
```

### 问题 2：所有请求都重试

**原因**：可能是自定义的 `isRetryable` 函数返回值不正确

**解决**：检查 `isRetryable` 函数逻辑

```typescript
isRetryable: (error) => {
  // 确保返回 boolean 类型
  const shouldRetry = /* 你的逻辑 */;
  console.log('[Retry] Decision:', shouldRetry, 'for error:', error.message);
  return shouldRetry;
}
```

### 问题 3：重试延迟过长

**调整**：减小 `baseDelay` 或 `maxDelay`

```typescript
retry: {
  maxRetries: 3,
  baseDelay: 500,      // 减小基础延迟
  maxDelay: 10000,     // 减小最大延迟
  exponentialBackoff: false, // 使用线性退避
}
```

---

## 测试验证

### 单元测试

运行重试功能的单元测试：

```bash
npm test -- tests/unit/agent/retry.test.ts
```

**测试覆盖**：
- ✅ 线性退避和指数退避计算
- ✅ 错误分类判断
- ✅ 重试成功场景
- ✅ 重试失败场景
- ✅ 自定义重试策略
- ✅ 实际场景集成测试

**测试结果**：18/18 通过

### 集成测试

重试功能已集成到所有现有的 Agent 测试中，确保不影响现有功能。

```bash
npm test
```

**测试结果**：164 passed, 38 skipped

---

## 相关文件

### 核心实现

- **`src/core/agent/retry.ts`** - Retry 服务实现
- **`src/core/agent/agent.ts`** - Agent 集成重试逻辑
- **`src/core/agent/types.ts`** - 类型定义扩展
- **`src/index.ts`** - 默认配置

### 测试文件

- **`tests/unit/agent/retry.test.ts`** - Retry 功能单元测试

### 文档

- **`docs/RETRY_FEATURE.md`** - 本文档
- **`docs/ARCHITECTURE_OVERVIEW.md`** - 架构文档（待更新）

---

## 更新日志

### v1.2 (2026-01-20)

**新增**：
- ✅ RetryService 智能重试服务
- ✅ 指数退避和线性退避策略
- ✅ 可配置的错误分类
- ✅ 重试信息追踪
- ✅ 完整的单元测试（18个测试用例）

**改进**：
- ✅ Agent.run() 集成重试逻辑
- ✅ 扩展 AgentResult 包含重试信息
- ✅ 环境变量配置支持

**文档**：
- ✅ 创建本功能文档
- ✅ 添加使用示例和最佳实践

---

## 贡献者

- 实现者：Claude Code
- 审核者：待定
- 测试者：Claude Code (18个测试用例全部通过)

---

## 许可证

本功能作为 Motia Agent System 的一部分，遵循项目许可证。
