# Soul Agent 实例清理功能设计文档

**日期**: 2026-03-22
**作者**: MyAgent Team
**状态**: 已批准

## 概述

自动清理停止超过 12 小时的 Soul Agent 实例，级联删除所有关联数据，保持数据库清洁。

## 需求

- 清理条件：`status = 'STOPPED'` 且 `last_activity` 距离现在 > 12 小时
- 执行频率：每小时执行一次
- 删除范围：`soul_states` + `soul_contexts` + `soul_notifications` + `soul_execution_history`
- 删除方式：硬删除（物理删除）

## 架构设计

### 组件

1. **SoulCleanupService** (`src/core/cleanup/soul-cleanup-service.ts`)
   - 查询符合条件的停止实例
   - 执行批量删除（事务保证）
   - 记录清理日志

2. **Cron Step** (`steps/cleanup/soul-cleanup-cron.step.ts`)
   - Motia 定时任务
   - Cron 表达式：`0 * * * *`（每小时）
   - 调用 SoulCleanupService

### 数据流

```
Cron 触发（每小时）
  ↓
查询 STOPPED 且 last_activity < 12小时前 的记录
  ↓
批量删除 soul_states 记录（事务）
  ↓
数据库自动级联删除关联数据
  ↓
记录清理日志
```

### 数据库操作

**查询**：
```sql
SELECT session_id, soul_id, last_activity
FROM soul_states
WHERE status = 'STOPPED'
  AND last_activity < NOW() - INTERVAL '12 hours'
ORDER BY last_activity ASC;
```

**删除**：
```sql
DELETE FROM soul_states
WHERE session_id = ANY($1::text[]);
```

**级联删除**：通过外键约束 `ON DELETE CASCADE` 自动删除关联表数据。

## 接口定义

```typescript
interface CleanupResult {
  deletedCount: number;
  sessionIds: string[];
  duration: number;
  timestamp: Date;
}

interface StoppedInstance {
  sessionId: string;
  soulId: string;
  stoppedAt: Date;
  stoppedDuration: number;
}
```

## 错误处理

- 使用数据库事务保证原子性
- 删除失败时回滚，记录错误日志
- 不中断服务，下次定时任务继续执行

## 日志记录

```
[SoulCleanup] Starting cleanup at 2026-03-22T10:00:00Z
[SoulCleanup] Found 3 stopped instances (> 12h)
[SoulCleanup] Deleted from soul_states: 3 records
[SoulCleanup] Cascade deleted from related tables
[SoulCleanup] Deleted 3 instances in 45ms
[SoulCleanup] Session IDs: soul-xxx-1, soul-xxx-2, soul-xxx-3
```

## 文件结构

```
src/core/cleanup/soul-cleanup-service.ts  # 清理服务
steps/cleanup/soul-cleanup-cron.step.ts   # 定时任务
tests/unit/cleanup/soul-cleanup.test.ts   # 单元测试
```

## 测试策略

### 单元测试
- 查询停止超过 12 小时的实例
- 批量删除功能
- 级联删除验证
- 空结果处理

### 手动测试
```typescript
// 1. 创建测试实例
// 2. 标记为 STOPPED，修改 last_activity
// 3. 运行清理
// 4. 验证数据库状态
```

## 未来扩展

- 可配置清理时长（目前硬编码 12 小时）
- 添加清理统计和监控
- 支持软删除（添加 deleted_at 字段）
- 归档功能（导出历史数据）

## 安全考虑

- 仅清理 `STOPPED` 状态，不影响活跃实例
- 使用事务避免部分删除
- 完整日志记录便于审计
