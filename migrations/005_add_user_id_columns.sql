-- Migration: Add user_id columns to sessions and tasks tables
-- Description: Fix Issue #65 - Add user isolation for sessions and tasks
-- This migration adds user_id columns to enable proper data isolation between users

-- Add user_id column to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add user_id column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

-- Backfill user_id for existing Soul Agent sessions
-- Soul Agent session_id format: soul-{soulId}-{userId}-{threadId}
UPDATE sessions
SET user_id = SUBSTR(session_id, INSTR(session_id, '-', INSTR(session_id, '-') + 1) + 1, INSTR(session_id, '-', INSTR(session_id, '-', INSTR(session_id, '-') + 1) + 1) - INSTR(session_id, '-', INSTR(session_id, '-') + 1) - 1)
WHERE session_id LIKE 'soul-%-%-%'
  AND user_id IS NULL;

-- For PostgreSQL, use a simpler regex-based approach
-- Note: The SQLite syntax above uses SUBSTR/INSTR, PostgreSQL will need different syntax
-- This migration file focuses on SQLite, PostgreSQL will be handled separately

-- Verify backfill
-- SELECT session_id, user_id FROM sessions WHERE session_id LIKE 'soul-%' LIMIT 10;
