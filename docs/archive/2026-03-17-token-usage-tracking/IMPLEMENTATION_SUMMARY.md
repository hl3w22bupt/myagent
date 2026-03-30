# Token Usage Tracking - 实现总结

**提案日期**: 2026-03-17
**实现日期**: 2026-03-26
**状态**: ✅ 已完成并合并到主分支

---

## 📋 实现概述

构建了一个完整的 token 使用追踪和分析系统，追踪所有 LLM 调用的 token 消耗，提供实时任务级统计和聚合分析。

### 核心功能

- ✅ 追踪所有 LLM 调用的 token 消耗（TypeScript Agent + Python Skills）
- ✅ 实时任务级 token 统计
- ✅ 按模型、技能、时间聚合分析
- ✅ 独立 workflow 架构（零改动主 agent runtime）
- ✅ API endpoints: 任务级 token 使用情况、全局汇总、趋势分析
- ✅ Frontend: Dashboard 页面 + 任务详情页 Token Usage Tab

---

## 🔄 相关 Commits

| Commit | 描述 | 日期 |
|--------|------|------|
| `ab0e724` | feat: complete token usage tracking implementation | 完整实现 |
| `2aea864` | feat: add token usage tracking feature with task-level analytics | 功能增强 |
| `5515c71` | fix: emit execution.trace.created events for token usage tracking | 事件修复 |
| `9f29385` | fix: complete token usage tracking implementation | 完善 |
| `a38e36f` | fix: use local timezone for token usage trends display | 时区修复 |
| `a974d8a` | Merge pull request #69 from hl3w22bupt/fix/issue-66-token-usage-tracking | 合并 PR |
| `a210fdc` | fix: resolve token usage data inconsistency between summary and breakdown | 数据一致性 |
| `c93d878` | fix: add task count to token usage summary | 统计完善 |
| `25fc27c` | refactor: rename Analytics to Dashboard | UI 优化 |
| `05be170` | feat: add token usage trends charts | 图表功能 |
| `13a2659` | design: optimize dashboard UI/UX with Swiss Modernism 2.0 style | UI 设计 |

---

## 📁 实现文件

### 1. Event Steps
**文件**:
- `steps/token-usage/token-usage-extractor.step.ts`
- `steps/token-usage/token-usage-writer.step.ts`

**功能**:
- `TokenUsageExtractor`: 订阅 `execution-traces` stream，提取 token 数据
- `TokenUsageWriter`: 写入任务级 token 统计到数据库

### 2. API Steps
**文件**:
- `steps/api/token-usage-api.step.ts`
- `steps/api/task-token-usage-api.step.ts`

**功能**:
- 全局 token 使用汇总 API
- 任务级 token 使用详情 API

### 3. Frontend
**文件**:
- `motia-frontend/src/pages/Dashboard.jsx`
- `motia-frontend/src/components/TokenUsageTab.jsx`

**功能**:
- Dashboard: 展示全局 token 使用统计
- TokenUsageTab: 任务详情页的 token 使用 Tab

### 4. Scripts
**文件**:
- `scripts/backfill-token-usage.mjs`

**功能**:
- 回填历史 token 数据（从 execution traces）

---

## 🎯 与设计文档的差异

### 设计文档架构（v1.3）
- 独立 workflow 架构（零改动主 agent）
- Event Steps 订阅 stream
- Cron Step 定时聚合
- Storage 抽象层

### 实际实现
- ✅ 独立 workflow 架构已实现
- ✅ Event Steps 订阅 `execution-traces` stream
- ✅ 使用 `getDataStore()` 访问存储
- ⚠️ Cron Step（定时聚合）可能未实现或简化

### 关键差异
1. **简化实现**: 可能跳过了复杂的 Cron Step 聚合，直接在 API 查询时聚合
2. **数据库集成**: 使用现有的 `DatabaseFactory`，而非独立的 Storage 抽象层
3. **UI 优先**: 重点实现了 Dashboard 和任务详情页的 token 使用展示

---

## 🗄️ 数据库表

### 实时表
```sql
CREATE TABLE token_usage_by_task (
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

CREATE TABLE token_usage_processed_traces (
  trace_id VARCHAR PRIMARY KEY,
  processed_at TIMESTAMP DEFAULT NOW()
);
```

### 聚合表（可能已实现或简化）
```sql
CREATE TABLE token_usage_by_model (
  id SERIAL PRIMARY KEY,
  model VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL,
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(model, date, hour)
);

CREATE TABLE token_usage_by_skill (
  id SERIAL PRIMARY KEY,
  skill_name VARCHAR NOT NULL,
  date DATE NOT NULL,
  hour INT NOT NULL,
  prompt_tokens BIGINT DEFAULT 0,
  completion_tokens BIGINT DEFAULT 0,
  total_tokens BIGINT DEFAULT 0,
  llm_calls_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(skill_name, date, hour)
);
```

---

## 🔌 API Endpoints

### 1. 任务级 Token 使用
```
GET /api/tasks/:taskId/token-usage

Response:
{
  "totalTokens": 12345,
  "promptTokens": 8000,
  "completionTokens": 4345,
  "llmCallsCount": 15,
  "timeline": [...],
  "bySkill": [...],
  "byModel": [...]
}
```

### 2. 全局 Token 使用汇总
```
GET /api/token-usage/summary?timeRange=24h

Response:
{
  "totalTokens": 1234567,
  "promptTokens": 800000,
  "completionTokens": 434567
}
```

### 3. Token 使用趋势
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

## 🎨 Frontend 实现

### 1. Dashboard 页面
**路由**: `/dashboard`

**功能**:
- 展示全局 token 使用统计
- 时间范围过滤器（1h, 24h, 7d, 30d）
- Token 使用趋势图表
- 按模型/技能分组的统计

### 2. Token Usage Tab
**位置**: 任务详情页

**功能**:
- 总 token 数（Prompt + Completion）
- LLM 调用次数
- 平均每次调用的 token 数
- Token 使用时间线
- 详细 LLM 调用列表
- 按技能/模型分组统计

---

## 🧪 测试验证

### 单元测试
- [ ] Storage 层测试（CRUD、幂等性）
- [ ] Event/Cron Step 逻辑测试
- [ ] 时间范围计算测试

### 集成测试
- [ ] Stream 订阅和事件发送
- [ ] 数据库写入和读取
- [ ] API endpoints 测试

### 边缘情况测试
- [ ] Token 数据缺失
- [ ] 零或负数的 token 数
- [ ] 并发写入场景
- [ ] 大数值处理（BIGINT）

---

## 🔮 未来增强

根据设计文档，未来可能的增强：

1. **Cost Calculation** - 按提供商定价计算成本
2. **Export Functionality** - 导出 CSV/JSON
3. **Comparison Features** - 任务对比
4. **Anomaly Detection** - 检测异常使用峰值
5. **Data Lake Migration** - 迁移到专业分析数据库（Snowflake, Databricks）
6. **Real-time Dashboard** - WebSocket 实时更新
7. **Alerts** - 使用量阈值告警

---

## 📚 相关文档

- **设计文档**: `01-design.md`（本文件）
- **实现代码**:
  - Event Steps: `steps/token-usage/*.step.ts`
  - API Steps: `steps/api/token-usage*.step.ts`
  - Frontend: `motia-frontend/src/pages/Dashboard.jsx`, `motia-frontend/src/components/TokenUsageTab.jsx`
  - Scripts: `scripts/backfill-token-usage.mjs`

---

## ✅ 验证清单

- [x] Token 追踪功能正常工作
- [x] API endpoints 可访问
- [x] Frontend Dashboard 可展示
- [x] 任务详情页 Token Usage Tab 可用
- [x] 数据库表正确创建
- [x] Stream 订阅正常
- [ ] 幂等性验证
- [ ] 性能测试（高频 LLM 调用场景）
- [ ] 边缘情况处理

---

**总结**: Token Usage Tracking 功能已成功实现并部署。实现了从设计文档中的独立 workflow 架构，通过订阅 execution-traces stream 实时提取 token 数据，提供完整的分析和可视化功能。部分高级功能（如 Cron Step 定时聚合）可能进行了简化实现，但核心功能完整可用。
