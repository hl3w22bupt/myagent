-- ============================================================
-- MyAgent Soul Agent 支持 - 数据库迁移脚本
-- 版本: 006
-- 日期: 2026-03-31
-- 描述: 为 soul_states 表添加 app 字段，用于标识应用来源
-- ============================================================

-- ============================================================
-- Step 1: 添加 app 字段到 soul_states 表
-- ============================================================

ALTER TABLE soul_states ADD COLUMN IF NOT EXISTS app TEXT DEFAULT 'myecho';

-- 为已有的记录设置默认值
UPDATE soul_states SET app = 'myecho' WHERE app IS NULL;

-- 添加注释
COMMENT ON COLUMN soul_states.app IS '应用标识符，用于标识 Soul Agent 所属的应用（如 myecho、其他应用）';

-- ============================================================
-- Step 2: 添加 active_since 字段（如果不存在）
-- ============================================================

-- 检查并添加 active_since 字段（用于记录 Soul 激活时间，支持 uptime 统计）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'soul_states' AND column_name = 'active_since'
  ) THEN
    ALTER TABLE soul_states ADD COLUMN active_since TIMESTAMP;

    -- 为已有的活跃实例设置 active_since（使用 last_activity 或当前时间）
    UPDATE soul_states
    SET active_since = COALESCE(last_activity, CURRENT_TIMESTAMP)
    WHERE status IN ('ACTIVE', 'IDLE', 'HIBERNATED') AND active_since IS NULL;

    COMMENT ON COLUMN soul_states.active_since IS 'Soul 激活时间，用于计算运行时长（uptime）';
  END IF;
END $$;

-- ============================================================
-- 验证迁移
-- ============================================================

-- 查看表结构
\d soul_states

-- 查看新添加的列
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'soul_states'
  AND column_name IN ('app', 'active_since')
ORDER BY column_name;

-- 查看示例数据
SELECT
  soul_id,
  session_id,
  status,
  app,
  active_since,
  last_activity
FROM soul_states
LIMIT 5;

-- 统计各 app 的实例数量
SELECT
  app,
  COUNT(*) as instance_count
FROM soul_states
GROUP BY app
ORDER BY instance_count DESC;
