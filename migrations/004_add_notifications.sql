-- Migration 004: Add notifications support for Soul agents
-- This migration adds:
-- 1. soul_notifications table for storing push notifications
-- 2. Indexes for efficient querying

-- ============================================
-- Table: soul_notifications
-- Purpose: Store push notifications sent by Soul agents
-- ============================================
CREATE TABLE IF NOT EXISTS soul_notifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES soul_states(session_id) ON DELETE CASCADE,
  soul_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  -- Notification content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high')),

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  error_message TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes
-- ============================================

-- Index for querying pending notifications by user
CREATE INDEX IF NOT EXISTS idx_soul_notifications_user_status
ON soul_notifications(user_id, status, created_at DESC);

-- Index for querying notifications by session
CREATE INDEX IF NOT EXISTS idx_soul_notifications_session_id
ON soul_notifications(session_id, created_at DESC);

-- Index for querying notifications by urgency
CREATE INDEX IF NOT EXISTS idx_soul_notifications_urgency
ON soul_notifications(urgency, status, created_at DESC);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE soul_notifications IS 'Stores push notifications sent by Soul agents to users';
COMMENT ON COLUMN soul_notifications.id IS 'Unique notification identifier';
COMMENT ON COLUMN soul_notifications.session_id IS 'Associated Soul session';
COMMENT ON COLUMN soul_notifications.soul_id IS 'Soul agent that sent the notification';
COMMENT ON COLUMN soul_notifications.user_id IS 'Target user ID';
COMMENT ON COLUMN soul_notifications.title IS 'Notification title';
COMMENT ON COLUMN soul_notifications.body IS 'Notification body content';
COMMENT ON COLUMN soul_notifications.urgency IS 'Notification urgency level (low/medium/high)';
COMMENT ON COLUMN soul_notifications.status IS 'Delivery status (pending/sent/delivered/failed)';
COMMENT ON COLUMN soul_notifications.sent_at IS 'When notification was sent to push service';
COMMENT ON COLUMN soul_notifications.delivered_at IS 'When notification was delivered to user device';
COMMENT ON COLUMN soul_notifications.error_message IS 'Error message if delivery failed';
COMMENT ON COLUMN soul_notifications.metadata IS 'Additional notification metadata';

-- ============================================
-- Trigger: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_soul_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_soul_notifications_updated_at
BEFORE UPDATE ON soul_notifications
FOR EACH ROW
EXECUTE FUNCTION update_soul_notifications_updated_at();

-- ============================================
-- Verification
-- ============================================

-- Show table structure
\d soul_notifications

-- Show indexes
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'soul_notifications'
ORDER BY indexname;

-- Show triggers
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'soul_notifications';

-- Show row count
SELECT
  'soul_notifications' as table_name,
  (SELECT COUNT(*) FROM soul_notifications) as total_count;

-- Show sample data
SELECT * FROM soul_notifications LIMIT 0;
