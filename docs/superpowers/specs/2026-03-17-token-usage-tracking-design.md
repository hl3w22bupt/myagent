# Token Usage Tracking & Dashboard Design

**Date:** 2026-03-17
**Status:** Design (Revision 3)
**Branch:** `feature/token-usage-tracking`
**Revision History:**
- v1.0: Initial design
- v1.1: Fixed event filtering, stream integration, state management, added error handling
- v1.2: Fixed SQL dialect compatibility, added timezone handling, clarified timeline implementation, added transaction support
- v1.3: Architecture redesign - use independent workflow (zero changes to agent core)

---

## Overview

Build a comprehensive token usage tracking and analytics system for the MyAgent platform. The system tracks LLM token consumption across all tasks, provides real-time task-level statistics, and offers a dashboard for overall usage insights.

**Key Goals:**
- Track token usage for all LLM calls (TypeScript Agent + Python Skills)
- Real-time task-level token statistics
- Aggregated analytics by model, skill, and time
- Extensible storage abstraction for future data lake migration

---

## Architecture

### ⭐ 独立 Workflow 设计（零侵入主 Agent Runtime）

**重要架构决策：** Token usage tracking 作为**独立 Workflow** 运行，不修改主 agent core 库。

**优势：**
- ✅ **零改动** - 不需要修改 `src/core/agent/` 下的任何代码
- ✅ **完全解耦** - 与主 agent runtime 独立运行
- ✅ **独立部署** - 可以单独启动、停止、扩展
- ✅ **只读集成** - 通过订阅 execution-traces stream 获取数据（无侵入）
- ✅ **故障隔离** - Token tracking 系统故障不影响主 agent

**Workflow 配置：**
```yaml
# workflows/token-usage-tracking.workflow.ts
export default createWorkflow({
  workflowId: 'token-usage-tracking',

  // Workflow 内的 Step 只监听 stream，不修改 agent 行为
  steps: [
    tokenUsageExtractor,  // Event Step
    tokenUsageWriter,     // Event Step
    tokenUsageAggregator  // Cron Step
  ],

  // 独立的 execution context
  context: {
    database: getDatabase(),
    streams: {
      executionTraces: getStream('execution-traces')
    }
  }
});
```

---

### System Design

### System Design

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LLM Call Occurs                               │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │  TS LLM Client  │    │  Python Skills  │                         │
│  └────────┬────────┘    └────────┬────────┘                         │
│           │                      │                                   │
│           └──────────┬───────────┘                                   │
│                      ▼                                               │
│              executionTraces.set()                                   │
│              (token data in metadata.llmResponse)                    │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Stream: execution-traces            │  ← 已有
          │  - 存储 LLM 调用的 trace 数据        │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Event Step: TokenUsageExtractor     │  ← 新建
          │  - 订阅 execution-traces stream      │
          │  - 监听新 trace 写入                 │
          │  - 过滤: metadata.llmResponse 存在   │
          │  - 去重: 使用 traceId 作为幂等键      │
          │  - 发送: 'token_usage_recorded'      │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Event Step: TokenUsageWriter        │  ← 新建
          │  - 监听: token_usage_recorded        │
          │  - 写入: token_usage_by_task (实时)  │
          │  - 使用 getDataStore() 访问存储      │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │  Cron Step: TokenUsageAggregator     │  ← 新建
          │  - 定时: 每小时                       │
          │  - 聚合: 从 token_usage_by_task      │
          │  - 避免: 重复聚合同个小时            │
          │  - 写入: token_usage_* 统计表        │
          └──────────────────────────────────────┘
                       │
                       ▼
          ┌──────────────────────────────────────┐
          │     Storage Abstraction Layer        │  ← 新建
          │  - PostgresTokenUsageStorage         │
          │  - 集成现有 DatabaseFactory          │
          │  - 便于未来迁移到数据湖               │
          └──────────────────────────────────────┘
```

### Key Design Decisions

**1. 独立 Workflow 架构（零改动主 Agent Runtime）** ⭐
- Token usage tracking 作为独立 workflow 运行
- **不修改主 agent core 库**（`src/core/agent/` 完全不动）
- 通过订阅 execution-traces stream 获取数据（只读，无侵入）
- 可独立部署、扩展、重启
- 与主 agent runtime 完全解耦

**2. Stream-to-Event Bridge Pattern**
- Subscribe to `execution-traces` stream changes
- Emit `token_usage_recorded` event for downstream processing
- Language-agnostic (works for TS and Python LLM calls)
- Decoupled from LLM Client implementation

**3. Storage Abstraction with Existing Integration**
- Interface-based design for easy migration
- Integrate with existing `DatabaseFactory` pattern
- Support both SQLite (dev) and PostgreSQL (production)
- Future: Data lake (Snowflake, Databricks, ClickHouse)

**4. Idempotency and Error Handling**
- Use `traceId` as idempotency key
- Track processed hours to avoid duplicate aggregation
- Graceful degradation if writer fails

**5. No Cost Calculation**
- Track raw token counts only
- Cost estimation deferred to future iteration

---

## Database Schema

### Real-time Table (Event Step Writes)

```sql
-- Task-level token usage (real-time updates)
CREATE TABLE token_usage_by_task (
  task_id VARCHAR NOT NULL,
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  first_call_at TIMESTAMP,
  last_call_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id)
);

-- 处理过的 trace 记录（去重）
CREATE TABLE token_usage_processed_traces (
  trace_id VARCHAR PRIMARY KEY,
  processed_at TIMESTAMP DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_token_task_updated ON token_usage_by_task(updated_at DESC);
CREATE INDEX idx_token_task_first_call ON token_usage_by_task(first_call_at DESC);
CREATE INDEX idx_token_processed_traces ON token_usage_processed_traces(processed_at DESC);
```

### Aggregated Tables (Cron Step Writes)

```sql
-- 聚合状态跟踪（避免重复聚合）
CREATE TABLE token_usage_aggregation_state (
  aggregation_type VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  last_processed_at TIMESTAMP,
  PRIMARY KEY (aggregation_type, date, hour)
);

-- 按模型聚合（每小时）
CREATE TABLE token_usage_by_model (
  id SERIAL PRIMARY KEY,
  model VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model, date, hour)
);

-- 按技能聚合（每小时）
CREATE TABLE token_usage_by_skill (
  id SERIAL PRIMARY KEY,
  skill_name VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(skill_name, date, hour)
);

-- 索引优化
CREATE INDEX idx_token_model_date ON token_usage_by_model(date DESC, hour DESC);
CREATE INDEX idx_token_skill_date ON token_usage_by_skill(date DESC, hour DESC);
CREATE INDEX idx_token_agg_state ON token_usage_aggregation_state(date DESC, hour DESC);
```

---

## TypeScript Interfaces

```typescript
/**
 * Token 使用量基础类型
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * 任务级别的 token 使用统计
 */
export interface TaskTokenUsage extends TokenUsage {
  taskId: string;
  llmCallsCount: number;
  firstCallAt: Date | null;
  lastCallAt: Date | null;
  updatedAt: Date;
}

/**
 * Token 使用记录事件（从 trace 提取）
 */
export interface TokenUsageRecordedEvent {
  traceId: string;           // 幂等键
  taskId: string;
  agentId?: string;
  skillName?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string;
}

/**
 * 模型聚合统计
 */
export interface ModelUsage extends TokenUsage {
  model: string;
  date: string;  // YYYY-MM-DD
  hour: number;  // 0-23
  llmCallsCount: number;
}

/**
 * 技能聚合统计
 */
export interface SkillUsage extends TokenUsage {
  skillName: string;
  date: string;
  hour: number;
  llmCallsCount: number;
}

/**
 * 时间范围类型
 */
export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'custom';

/**
 * 总使用量统计
 */
export interface TotalUsage extends TokenUsage {}

/**
 * 使用趋势数据点
 */
export interface UsageTrend {
  timestamp: string;  // ISO 8601
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
}
```

---

## Components

### 1. Storage Layer

**Interface:** `TokenUsageStorage`
```typescript
import { Database } from '@/core/database';

export interface TokenUsageStorage {
  // 初始化数据库表
  initializeTables(): Promise<void>;

  // 实时任务级别更新（幂等）
  saveTaskUsage(taskId: string, usage: TokenUsageRecordedEvent): Promise<void>;

  // 查询任务使用情况
  getTaskUsage(taskId: string): Promise<TaskTokenUsage | null>;

  // 检查 trace 是否已处理（幂等性）
  isTraceProcessed(traceId: string): Promise<boolean>;

  // 标记 trace 为已处理
  markTraceProcessed(traceId: string): Promise<void>;

  // 聚合查询
  getAggregateByModel(startDate: Date, endDate: Date): Promise<ModelUsage[]>;
  getAggregateBySkill(startDate: Date, endDate: Date): Promise<SkillUsage[]>;
  getTotalUsage(startDate: Date, endDate: Date): Promise<TotalUsage>;
  getUsageTrends(startDate: Date, endDate: Date, granularity: 'hour' | 'day'): Promise<UsageTrend[]>;

  // 聚合相关
  aggregateByModel(date: Date, hour: number): Promise<void>;
  aggregateBySkill(date: Date, hour: number): Promise<void>;
  isAggregationProcessed(type: 'model' | 'skill', date: Date, hour: number): Promise<boolean>;
  markAggregationProcessed(type: 'model' | 'skill', date: Date, hour: number): Promise<void>;
}
```

**Implementation:** `PostgresTokenUsageStorage`
```typescript
import { Database } from '@/core/database/database-factory';

/**
 * Token Usage 存储实现
 * 支持双后端：PostgreSQL（生产）和 SQLite（开发）
 */
export class PostgresTokenUsageStorage implements TokenUsageStorage {
  private db: Database;
  private isPostgres: boolean;

  constructor(db: Database) {
    this.db = db;
    // 检测数据库类型
    this.isPostgres = this.detectDatabaseType();
  }

  private detectDatabaseType(): boolean {
    // 通过检查 PostgreSQL 特性来判断
    try {
      // PostgreSQL 支持 NOW() 但 SQLite 使用 datetime('now')
      // 更可靠的方法是检查 connection 类型或配置
      const config = this.db.config;
      return config?.dialect === 'postgres' || config?.client === 'pg';
    } catch {
      // 默认假设是 PostgreSQL（生产环境）
      return true;
    }
  }

  /**
   * 初始化数据库表
   * 根据数据库类型使用相应的 SQL 语法
   */
  async initializeTables(): Promise<void> {
    if (this.isPostgres) {
      await this.initializePostgresTables();
    } else {
      await this.initializeSQLiteTables();
    }
  }

  private async initializePostgresTables(): Promise<void> {
    const schema = `
      -- 任务级别 token 使用统计
      CREATE TABLE IF NOT EXISTS token_usage_by_task (
        task_id VARCHAR PRIMARY KEY,
        prompt_tokens BIGINT DEFAULT 0,
        completion_tokens BIGINT DEFAULT 0,
        total_tokens BIGINT DEFAULT 0,
        llm_calls_count INT DEFAULT 0,
        first_call_at TIMESTAMP,
        last_call_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- 已处理的 trace 记录（幂等性）
      CREATE TABLE IF NOT EXISTS token_usage_processed_traces (
        trace_id VARCHAR PRIMARY KEY,
        processed_at TIMESTAMP DEFAULT NOW()
      );

      -- 聚合状态跟踪
      CREATE TABLE IF NOT EXISTS token_usage_aggregation_state (
        aggregation_type VARCHAR NOT NULL,
        date DATE NOT NULL,
        hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
        last_processed_at TIMESTAMP,
        PRIMARY KEY (aggregation_type, date, hour)
      );

      -- 按模型聚合
      CREATE TABLE IF NOT EXISTS token_usage_by_model (
        id SERIAL PRIMARY KEY,
        model VARCHAR NOT NULL,
        date DATE NOT NULL,
        hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens BIGINT DEFAULT 0,
        completion_tokens BIGINT DEFAULT 0,
        total_tokens BIGINT DEFAULT 0,
        llm_calls_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(model, date, hour)
      );

      -- 按技能聚合
      CREATE TABLE IF NOT EXISTS token_usage_by_skill (
        id SERIAL PRIMARY KEY,
        skill_name VARCHAR NOT NULL,
        date DATE NOT NULL,
        hour INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens BIGINT DEFAULT 0,
        completion_tokens BIGINT DEFAULT 0,
        total_tokens BIGINT DEFAULT 0,
        llm_calls_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(skill_name, date, hour)
      );

      -- 索引
      CREATE INDEX IF NOT EXISTS idx_token_task_updated ON token_usage_by_task(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_task_first_call ON token_usage_by_task(first_call_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_processed_traces ON token_usage_processed_traces(processed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_model_date ON token_usage_by_model(date DESC, hour DESC);
      CREATE INDEX IF NOT EXISTS idx_token_skill_date ON token_usage_by_skill(date DESC, hour DESC);
      CREATE INDEX IF NOT EXISTS idx_token_agg_state ON token_usage_aggregation_state(date DESC, hour DESC);
    `;
    await this.db.exec(schema);
  }

  private async initializeSQLiteTables(): Promise<void> {
    const schema = `
      -- 任务级别 token 使用统计
      CREATE TABLE IF NOT EXISTS token_usage_by_task (
        task_id TEXT PRIMARY KEY,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        llm_calls_count INTEGER DEFAULT 0,
        first_call_at TEXT,
        last_call_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- 已处理的 trace 记录（幂等性）
      CREATE TABLE IF NOT EXISTS token_usage_processed_traces (
        trace_id TEXT PRIMARY KEY,
        processed_at TEXT DEFAULT (datetime('now'))
      );

      -- 聚合状态跟踪
      CREATE TABLE IF NOT EXISTS token_usage_aggregation_state (
        aggregation_type TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        last_processed_at TEXT,
        PRIMARY KEY (aggregation_type, date, hour)
      );

      -- 按模型聚合
      CREATE TABLE IF NOT EXISTS token_usage_by_model (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        llm_calls_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(model, date, hour)
      );

      -- 按技能聚合
      CREATE TABLE IF NOT EXISTS token_usage_by_skill (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        llm_calls_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(skill_name, date, hour)
      );

      -- 索引
      CREATE INDEX IF NOT EXISTS idx_token_task_updated ON token_usage_by_task(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_task_first_call ON token_usage_by_task(first_call_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_processed_traces ON token_usage_processed_traces(processed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_token_model_date ON token_usage_by_model(date DESC, hour DESC);
      CREATE INDEX IF NOT EXISTS idx_token_skill_date ON token_usage_by_skill(date DESC, hour DESC);
      CREATE INDEX IF NOT EXISTS idx_token_agg_state ON token_usage_aggregation_state(date DESC, hour DESC);
    `;
    await this.db.exec(schema);
  }

  /**
   * 保存任务级别 token 使用统计（幂等）
   */
  async saveTaskUsage(taskId: string, usage: TokenUsageRecordedEvent): Promise<void> {
    if (this.isPostgres) {
      await this.saveTaskUsagePostgres(taskId, usage);
    } else {
      await this.saveTaskUsageSQLite(taskId, usage);
    }
  }

  private async saveTaskUsagePostgres(taskId: string, usage: TokenUsageRecordedEvent): Promise<void> {
    const timestamp = new Date(usage.timestamp);
    await this.db.run(`
      INSERT INTO token_usage_by_task (
        task_id, prompt_tokens, completion_tokens, total_tokens,
        llm_calls_count, first_call_at, last_call_at, updated_at
      ) VALUES ($1, $2, $3, $4, 1,
        COALESCE((SELECT first_call_at FROM token_usage_by_task WHERE task_id = $1), $5),
        $5,
        NOW()
      )
      ON CONFLICT (task_id) DO UPDATE SET
        prompt_tokens = token_usage_by_task.prompt_tokens + excluded.prompt_tokens,
        completion_tokens = token_usage_by_task.completion_tokens + excluded.completion_tokens,
        total_tokens = token_usage_by_task.total_tokens + excluded.total_tokens,
        llm_calls_count = token_usage_by_task.llm_calls_count + 1,
        last_call_at = excluded.last_call_at,
        updated_at = NOW()
    `, [taskId, usage.promptTokens, usage.completionTokens, usage.totalTokens, timestamp]);
  }

  private async saveTaskUsageSQLite(taskId: string, usage: TokenUsageRecordedEvent): Promise<void> {
    const timestamp = new Date(usage.timestamp).toISOString();
    await this.db.run(`
      INSERT INTO token_usage_by_task (
        task_id, prompt_tokens, completion_tokens, total_tokens,
        llm_calls_count, first_call_at, last_call_at, updated_at
      ) VALUES (?, ?, ?, ?, 1,
        COALESCE((SELECT first_call_at FROM token_usage_by_task WHERE task_id = ?), ?),
        ?,
        datetime('now')
      )
      ON CONFLICT (task_id) DO UPDATE SET
        prompt_tokens = token_usage_by_task.prompt_tokens + excluded.prompt_tokens,
        completion_tokens = token_usage_by_task.completion_tokens + excluded.completion_tokens,
        total_tokens = token_usage_by_task.total_tokens + excluded.total_tokens,
        llm_calls_count = token_usage_by_task.llm_calls_count + 1,
        last_call_at = excluded.last_call_at,
        updated_at = datetime('now')
    `, [taskId, usage.promptTokens, usage.completionTokens, usage.totalTokens,
        taskId, timestamp, timestamp]);
  }

  async isTraceProcessed(traceId: string): Promise<boolean> {
    const result = await this.db.get(
      'SELECT 1 FROM token_usage_processed_traces WHERE trace_id = ?',
      [traceId]
    );
    return !!result;
  }

  async markTraceProcessed(traceId: string): Promise<void> {
    if (this.isPostgres) {
      await this.db.run(
        'INSERT INTO token_usage_processed_traces (trace_id) VALUES ($1) ON CONFLICT (trace_id) DO NOTHING',
        [traceId]
      );
    } else {
      await this.db.run(
        'INSERT OR IGNORE INTO token_usage_processed_traces (trace_id) VALUES (?)',
        [traceId]
      );
    }
  }

  // ... 其他方法实现（类似的双后端支持）
}
```

### 2. Event Steps

**Stream Event Structure:**
```typescript
// Motia execution-traces stream 事件格式
interface StreamUpdatedEvent {
  type: 'stream-updated';
  data: {
    streamId: string;  // 'execution-traces'
    groupId: string;   // taskId
    id: string;        // traceId
    data: any;         // trace 数据
  };
}

// execution-traces stream 中的 trace 数据结构
interface ExecutionTrace {
  id: string;              // traceId (唯一)
  taskId: string;
  agentId?: string;
  skillName?: string;
  level: string;           // 'task', 'agent', 'skill', 'tool-call', 'agent-internal', 'skill-internal'
  stage: string;           // 'llm_call', 'tool_call', etc.
  status: string;          // 'started', 'completed', 'failed'
  timestamp: string;       // ISO 8601
  executionTime?: number;
  metadata?: {
    llmProvider?: string;
    llmModel?: string;
    llmRequest?: {
      messages: LLMMessage[];
      maxTokens: number;
      temperature: number;
    };
    llmResponse?: {
      content: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
}
```

**TokenUsageExtractor**（订阅 Stream，提取 token 数据）
```typescript
import { createEventStep } from '@motioai/events';

export const tokenUsageExtractor = createEventStep({
  type: 'stream-updated', // Motia 的 stream 更新事件
  filter: { streamId: 'execution-traces' }, // 只监听 execution-traces
  handler: async (event, { logger, emit }) => {
    // event.data 结构: { streamId, groupId, id, data }
    const { id: traceId, data: trace } = event.data;

    // 过滤：只处理 LLM 调用（检查 stage 和 metadata.llmResponse）
    if (trace.stage !== 'llm_call') {
      return;
    }

    const llmResponse = trace.metadata?.llmResponse;
    if (!llmResponse || !llmResponse.totalTokens || llmResponse.totalTokens === 0) {
      return; // 没有 token 数据
    }

    // 输入验证：确保 token 数值合法
    const promptTokens = Math.max(0, llmResponse.promptTokens ?? 0);
    const completionTokens = Math.max(0, llmResponse.completionTokens ?? 0);
    const totalTokens = Math.max(0, llmResponse.totalTokens);

    // 验证一致性
    if (totalTokens !== promptTokens + completionTokens) {
      logger.warn(`[TokenUsage] Token count mismatch for trace ${traceId}: ` +
        `total=${totalTokens}, prompt=${promptTokens}, completion=${completionTokens}`);
      // 使用 totalTokens 作为可信值
    }

    logger.info(`[TokenUsage] Extracting token data from trace: ${traceId}`);

    // 发送 token usage 事件
    await emit('token_usage_recorded', {
      traceId, // 幂等键
      taskId: trace.taskId,
      agentId: trace.agentId,
      skillName: trace.skillName,
      model: trace.metadata?.llmModel || 'unknown',
      provider: trace.metadata?.llmProvider || 'unknown',
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: trace.timestamp,
    });
  }
});
```

**TokenUsageWriter**（写入数据库）
```typescript
import { createEventStep } from '@motioai/events';
import { PostgresTokenUsageStorage } from '@/steps/token-usage/storage/postgres-token-storage';

export const tokenUsageWriter = createEventStep({
  type: 'token_usage_recorded',
  handler: async (event, { logger, getDataStore }) => {
    const { traceId, taskId, promptTokens, completionTokens, totalTokens, timestamp } = event.data;

    // 获取 storage 实例（使用 getDataStore）
    const db = getDataStore() as Database; // 类型断言确保类型正确
    const storage = new PostgresTokenUsageStorage(db);

    try {
      // 幂等性检查：避免重复处理同一个 trace
      const alreadyProcessed = await storage.isTraceProcessed(traceId);
      if (alreadyProcessed) {
        logger.debug(`[TokenUsage] Trace ${traceId} already processed, skipping`);
        return;
      }

      // 写入任务级别统计
      await storage.saveTaskUsage(taskId, {
        traceId,
        taskId,
        promptTokens,
        completionTokens,
        totalTokens,
        timestamp
      });

      // 标记 trace 为已处理
      await storage.markTraceProcessed(traceId);

      logger.info(`[TokenUsage] Recorded ${totalTokens} tokens for task ${taskId}`);
    } catch (error) {
      logger.error(`[TokenUsage] Failed to save token usage:`, error);
      // 不抛出异常，避免阻塞事件流
    }
  }
});
```

### 3. Cron Step

**TokenUsageAggregator**（定时聚合）
```typescript
import { createCronStep } from '@motioai/cron';
import { PostgresTokenUsageStorage } from '@/steps/token-usage/storage/postgres-token-storage';

export const tokenUsageAggregator = createCronStep({
  cron: '0 * * * *',  // 每小时执行
  handler: async (_, { logger, getDataStore }) => {
    const db = getDataStore() as Database;
    const storage = new PostgresTokenUsageStorage(db);

    // 聚合上一个小时的数据（使用 UTC 避免时区问题）
    const now = new Date();
    const utcNow = new Date(now.toISOString()); // 转换为 UTC
    const lastHour = new Date(utcNow.getTime() - 3600000);
    const utcLastHour = new Date(lastHour.toISOString());

    // 使用 UTC 时间计算日期和小时
    const date = new Date(utcLastHour.toISOString().slice(0, 10)); // YYYY-MM-DD (UTC)
    const hour = utcLastHour.getUTCHours(); // 0-23 (UTC)

    logger.info(`[TokenUsage] Starting aggregation for ${date.toISOString()} UTC hour ${hour}`);

    try {
      // 检查是否已经聚合过（避免重复）
      const modelProcessed = await storage.isAggregationProcessed('model', date, hour);
      const skillProcessed = await storage.isAggregationProcessed('skill', date, hour);

      if (!modelProcessed) {
        // 使用事务确保原子性
        await storage.withTransaction(async () => {
          await storage.aggregateByModel(date, hour);
          await storage.markAggregationProcessed('model', date, hour);
        });
        logger.info(`[TokenUsage] Completed model aggregation for hour ${hour}`);
      } else {
        logger.debug(`[TokenUsage] Model aggregation already completed for hour ${hour}`);
      }

      if (!skillProcessed) {
        // 使用事务确保原子性
        await storage.withTransaction(async () => {
          await storage.aggregateBySkill(date, hour);
          await storage.markAggregationProcessed('skill', date, hour);
        });
        logger.info(`[TokenUsage] Completed skill aggregation for hour ${hour}`);
      } else {
        logger.debug(`[TokenUsage] Skill aggregation already completed for hour ${hour}`);
      }
    } catch (error) {
      logger.error(`[TokenUsage] Aggregation failed:`, error);
      // 不抛出异常，允许下次重试
    }
  }
});
```

**Storage Interface Extension**（添加事务支持）:
```typescript
export interface TokenUsageStorage {
  // ... 现有方法

  /**
   * 在事务中执行操作
   * 确保聚合和状态标记的原子性
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
```

---

## API Design

### Task Token Usage
```
GET /api/tasks/:taskId/token-usage

Response:
{
  "totalTokens": 12345,
  "promptTokens": 8000,
  "completionTokens": 4345,
  "llmCallsCount": 15,
  "timeline": [
    {
      "timestamp": "2026-03-17T10:00:00Z",
      "totalTokens": 1234,
      "model": "claude-sonnet-4-5",
      "skillName": "code-analysis"
    }
  ],
  "bySkill": [
    { "skillName": "code-analysis", "totalTokens": 8000, "calls": 10 }
  ],
  "byModel": [
    { "model": "claude-sonnet-4-5", "totalTokens": 12345, "calls": 15 }
  ]
}
```

**数据来源说明：**
- `totalTokens`, `promptTokens`, `completionTokens`, `llmCallsCount`: 从 `token_usage_by_task` 表读取（预聚合，快速）
- `timeline`: 从 `execution-traces` stream 实时计算（详细数据，按时间排序）
- `bySkill`: 从 `token_usage_by_task` 和 execution traces 计算得出
- `byModel`: 从 execution traces 按 model 分组统计

**实现策略：**
```typescript
async function getTaskTokenUsage(taskId: string) {
  // 从预聚合表读取基础统计
  const baseStats = await storage.getTaskUsage(taskId);

  // 从 execution-traces stream 读取详细 timeline
  const traces = await streams.executionTraces.get(taskId);
  const llmTraces = traces.filter(t => t.stage === 'llm_call');

  const timeline = llmTraces.map(t => ({
    timestamp: t.timestamp,
    totalTokens: t.metadata.llmResponse.totalTokens,
    model: t.metadata.llmModel,
    skillName: t.skillName
  }));

  // 按技能分组
  const bySkill = groupBy(llmTraces, 'skillName');

  // 按模型分组
  const byModel = groupBy(llmTraces, 'metadata.llmModel');

  return { ...baseStats, timeline, bySkill, byModel };
}
```

### Global Summary
```
GET /api/token-usage/summary?timeRange=24h

Response:
{
  "totalTokens": 1234567,
  "promptTokens": 800000,
  "completionTokens": 434567
}
```

### Usage Trends
```
GET /api/token-usage/trends?timeRange=7d

Response:
{
  "timeline": [
    { "timestamp": "2026-03-17T10:00:00Z", "totalTokens": 12345 }
  ]
}
```

---

## Frontend Design

### 1. New Navigation Menu Item
```jsx
{
  path: '/analytics',
  label: '用量分析',
  icon: <ChartIcon />
}
```

### 2. Task Detail Page - New Token Tab
```jsx
<Tabs>
  <Tab label="详情">...</Tab>
  <Tab label="PTC">...</Tab>
  <Tab label="Traces">...</Tab>
  <Tab label="Artifacts">...</Tab>
  <Tab label="Sandbox Logs">...</Tab>
  <Tab label="Token Usage">
    <TokenUsageTab taskId={taskId} />
  </Tab>
</Tabs>
```

**TokenUsageTab Content:**
- 总 token 数（Prompt + Completion）
- LLM 调用次数
- 平均每次调用的 token 数
- Token 使用时间线
- 详细 LLM 调用列表（时间、模型、skill、token 数）
- 按技能分组统计
- 按模型分组统计
- Token 使用趋势图

### 3. New Analytics Page (Simple Dashboard)
```jsx
function Analytics() {
  return (
    <div className="analytics">
      <h1>Token Usage Analytics</h1>
      <TimeRangeFilter
        options={['1h', '24h', '7d', '30d', 'custom']}
      />
      <TotalTokenUsage value={1234567} />
      <Breakdown
        prompt={800000}
        completion={434567}
      />
    </div>
  );
}
```

---

## File Structure

```
myagent/
├── workflows/
│   └── token-usage-tracking.workflow.ts     ← 新建：独立 workflow 定义
├── src/
│   └── steps/
│       └── token-usage/
│           ├── token-usage-extractor.step.ts
│           ├── token-usage-writer.step.ts
│           ├── token-usage-aggregator.step.ts
│           ├── storage/
│           │   ├── token-storage.interface.ts
│           │   └── postgres-token-storage.ts
│           └── types.ts
├── motia-frontend/
│   └── src/
│       ├── pages/
│       │   └── Analytics.jsx
│       ├── components/
│       │   └── TokenUsageTab.jsx
│       └── services/
│           └── api.js (扩展)
└── scripts/
    └── init-token-tables.ts
```

**注意：** `workflows/` 是新建目录，与现有的 `src/` 和 `steps/` 目录平行，体现完全解耦的设计。

---

## Implementation Phases

### Phase 1: Backend Foundation
1. 创建 TypeScript 接口定义
2. 实现 PostgresTokenUsageStorage（集成现有 DatabaseFactory）
3. 创建 TokenUsageExtractor Event Step（订阅 stream）
4. 创建 TokenUsageWriter Event Step（使用 getDataStore）
5. 创建 TokenUsageAggregator Cron Step（幂等聚合）
6. 初始化数据库表（迁移脚本）

### Phase 2: API Layer
7. 扩展 task API，添加 token usage endpoint
8. 添加 analytics API endpoints
9. 实现时间范围过滤逻辑

### Phase 3: Frontend Implementation
10. 创建 Analytics 页面（简单版 dashboard）
11. 创建 TokenUsageTab 组件
12. 集成 TokenUsageTab 到任务详情页
13. 添加导航菜单项
14. 实现时间范围过滤器
15. 添加 token usage 趋势图

---

## Security & Access Control

**Authorization:**
- Token usage 数据遵循现有任务的访问控制
- 用户只能查看自己有权限的任务的 token 使用情况
- 全局 dashboard 仅显示当前用户有权限的任务的汇总数据

**Authentication:**
- 使用现有的认证机制
- API endpoints 需要有效的 session token

---

## Data Retention

**Current:** 保留所有历史记录
**Future:** 考虑为旧记录添加归档策略

---

## Error Handling & Idempotency

**幂等性保证：**
1. 使用 `traceId` 作为幂等键，避免重复处理同一个 LLM 调用
2. 聚合任务记录处理状态，避免重复聚合同个小时
3. UPSERT 操作确保并发写入的正确性

**错误恢复：**
1. Writer Step 失败不阻塞事件流，记录错误日志
2. Aggregator Step 检查处理状态，支持重试
3. 数据库操作使用事务保证一致性

**监控：**
1. 记录处理失败的事件 ID
2. 监控聚合任务的执行状态
3. 定期检查数据一致性

---

## Performance Considerations

**写入优化：**
1. 使用 UPSERT 减少查询次数
2. 批量写入聚合数据
3. 异步处理避免阻塞主流程

**查询优化：**
1. 合理使用索引（task_id, date, hour）
2. 聚合表预计算，避免实时聚合
3. 时间范围查询使用时间索引

**扩展性：**
1. 数据库连接池
2. 可考虑使用消息队列解耦写入
3. 数据量大时可分表或分区

---

## Testing Strategy

**单元测试：**
1. Storage 层测试（CRUD 操作、幂等性）
2. Event/Cron Step 逻辑测试
3. 时间范围计算测试

**集成测试：**
1. Stream 订阅和事件发送
2. 数据库写入和读取
3. API 端点测试

**E2E 测试：**
1. 完整的 token 追踪流程
2. 聚合任务执行
3. Frontend 和 API 集成

**边缘情况测试：**
1. Token 数据缺失
2. 零或负数的 token 数
3. 并发写入场景
4. 数据库连接失败
5. 大数值处理（BIGINT）

---

## Future Enhancements

1. **Cost Calculation** - 按提供商定价计算成本
2. **Export Functionality** - 导出 CSV/JSON
3. **Comparison Features** - 任务对比
4. **Anomaly Detection** - 检测异常使用峰值
5. **Data Lake Migration** - 迁移到专业分析数据库
6. **Real-time Dashboard** - WebSocket 实时更新
7. **Alerts** - 使用量阈值告警

---

## Dependencies

- **Motia:** Event Steps, Cron Steps, Streams, getDataStore
- **PostgreSQL:** 主存储（生产环境）
- **SQLite:** 本地开发存储
- **Frontend:** React, Recharts（图表）

---

## Risks & Mitigations

| 风险 | 缓解措施 |
|------|---------|
| 高频 LLM 调用影响性能 | 异步 Event Steps，优化数据库索引 |
| Trace 数据结构变化 | 版本化提取逻辑 |
| 存储成本增长 | 规划数据归档策略 |
| Stream 订阅失败 | 重试机制 + 错误日志 |
| 聚合任务漏跑 | 支持补跑历史数据 |

---

## Glossary

- **Token Usage:** LLM 调用消耗的 token 数量
- **Prompt Tokens:** 发送给 LLM 的输入 token
- **Completion Tokens:** 从 LLM 接收的输出 token
- **Total Tokens:** Prompt 和 Completion token 的总和
- **Event Step:** 响应事件的 Motia Step
- **Cron Step:** 定时执行的 Motia Step
- **Stream:** Motia 的数据流机制
- **流处理:** 实时数据处理
- **批处理:** 定期数据聚合
- **幂等性:** 同一操作多次执行结果一致
