-- ============================================================
-- MyAgent Soul Agent 支持 - 数据库迁移脚本
-- 版本: 003
-- 日期: 2026-03-19
-- 描述: 创建自主 Agent (Soul) 的相关表
-- ============================================================

-- ============================================================
-- Step 1: 创建 soul_states 表（Soul 运行状态）
-- ============================================================

CREATE TABLE IF NOT EXISTS soul_states (
  soul_id TEXT NOT NULL,
  session_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'HIBERNATED', 'IDLE', 'STOPPED')),
  current_task_id TEXT,
  last_activity TIMESTAMP,
  scheduled_wakeup TIMESTAMP,
  statistics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 添加索引
CREATE INDEX idx_soul_states_soul_id ON soul_states(soul_id);
CREATE INDEX idx_soul_states_status ON soul_states(status);
CREATE INDEX idx_soul_states_last_activity ON soul_states(last_activity);
CREATE INDEX idx_soul_states_scheduled_wakeup ON soul_states(scheduled_wakeup);

-- 添加注释
COMMENT ON TABLE soul_states IS '自主 Agent (Soul) 的运行状态表，记录 Soul 的生命周期状态';
COMMENT ON COLUMN soul_states.soul_id IS 'Soul 标识符，对应 soul.yaml 中的 soul_id';
COMMENT ON COLUMN soul_states.session_id IS '会话标识符，通常是用户相关的唯一 ID';
COMMENT ON COLUMN soul_states.status IS '当前状态：ACTIVE（活跃）、HIBERNATED（休眠）、IDLE（空闲）、STOPPED（停止）';
COMMENT ON COLUMN soul_states.current_task_id IS '当前正在执行的任务 ID';
COMMENT ON COLUMN soul_states.last_activity IS '最后活跃时间';
COMMENT ON COLUMN soul_states.scheduled_wakeup IS '预定的唤醒时间';
COMMENT ON COLUMN soul_states.statistics IS '统计信息（JSONB），包含 total_tasks、uptime 等';

-- ============================================================
-- Step 2: 创建 soul_contexts 表（Soul 上下文）
-- ============================================================

CREATE TABLE IF NOT EXISTS soul_contexts (
  session_id TEXT PRIMARY KEY,
  user_id TEXT,
  conversation_rounds JSONB DEFAULT '[]'::jsonb,
  user_profile JSONB DEFAULT '{}'::jsonb,
  relationship_state JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id) REFERENCES soul_states(session_id) ON DELETE CASCADE
);

-- 添加索引
CREATE INDEX idx_soul_contexts_user_id ON soul_contexts(user_id);
CREATE INDEX idx_soul_contexts_updated_at ON soul_contexts(updated_at);

-- 添加注释
COMMENT ON TABLE soul_contexts IS '自主 Agent (Soul) 的上下文表，存储对话历史、用户画像、关系状态等业务数据';
COMMENT ON COLUMN soul_contexts.session_id IS '会话标识符，关联 soul_states 表';
COMMENT ON COLUMN soul_contexts.user_id IS '用户标识符';
COMMENT ON COLUMN soul_contexts.conversation_rounds IS '对话轮次记录（JSONB 数组）';
COMMENT ON COLUMN soul_contexts.user_profile IS '用户画像（JSONB 对象）';
COMMENT ON COLUMN soul_contexts.relationship_state IS '关系状态（JSONB 对象），包含亲密度、最后互动时间等';

-- ============================================================
-- Step 3: 创建触发器自动更新 updated_at
-- ============================================================

-- soul_states 表的 updated_at 触发器
CREATE OR REPLACE FUNCTION update_soul_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_soul_states_updated_at
BEFORE UPDATE ON soul_states
FOR EACH ROW
EXECUTE FUNCTION update_soul_states_updated_at();

-- soul_contexts 表的 updated_at 触发器
CREATE OR REPLACE FUNCTION update_soul_contexts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_soul_contexts_updated_at
BEFORE UPDATE ON soul_contexts
FOR EACH ROW
EXECUTE FUNCTION update_soul_contexts_updated_at();

-- ============================================================
-- 验证迁移
-- ============================================================

-- 查看表结构
\d soul_states
\d soul_contexts

-- 查看索引
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('soul_states', 'soul_contexts')
ORDER BY tablename, indexname;

-- 查看触发器
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE event_object_table IN ('soul_states', 'soul_contexts');

-- 统计记录数
SELECT 'soul_states' as table_name, COUNT(*) as total_count FROM soul_states
UNION ALL
SELECT 'soul_contexts', COUNT(*) FROM soul_contexts;

-- 查看示例数据（如果有）
SELECT soul_id, session_id, status, last_activity
FROM soul_states
LIMIT 3;

SELECT session_id, user_id, updated_at
FROM soul_contexts
LIMIT 3;
