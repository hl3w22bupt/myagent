-- ============================================================
-- MyAgent MessageId 支持 - 数据库迁移脚本
-- 版本: 002
-- 日期: 2026-03-11
-- 描述: 在 outputs 和 artifacts 表中增加 message_id 字段
-- ============================================================

-- ============================================================
-- Step 1: outputs 表增加 message_id
-- ============================================================

-- 添加 message_id 列
ALTER TABLE outputs
ADD COLUMN message_id TEXT;

-- 添加索引
CREATE INDEX idx_outputs_message_id ON outputs(message_id);

-- 添加注释
COMMENT ON COLUMN outputs.message_id IS '关联的 message ID，用于追溯是哪个 message 产生的输出。

-- ============================================================
-- Step 2: artifacts 表增加 message_id
-- ============================================================

-- 添加 message_id 列
ALTER TABLE artifacts
ADD COLUMN message_id TEXT;

-- 添加索引
CREATE INDEX idx_artifacts_message_id ON artifacts(message_id);

-- 添加注释
COMMENT ON COLUMN artifacts.message_id IS '关联的 message ID，用于追溯是哪个 message 产生的 artifact';

-- ============================================================
-- Step 3: 确保 messages 表有正确的索引
-- ============================================================

-- messages 表已有 id 字段作为主键，确保有 task_id 索引
-- 如果没有则创建：
-- CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);

-- ============================================================
-- 验证迁移
-- ============================================================

-- 查看 outputs 表结构
\d outputs

-- 查看 artifacts 表结构
\d artifacts

-- 统计记录数
SELECT 'outputs' as table_name, COUNT(*) as total_count FROM outputs
UNION ALL
SELECT 'artifacts', COUNT(*) FROM artifacts;

-- 查看示例数据（如果有）
SELECT id, task_id, session_id, round, message_id,
       LEFT(output, 50) as output_preview
FROM outputs
LIMIT 3;

SELECT id, task_id, artifact_type, message_id, path
FROM artifacts
LIMIT 3;
