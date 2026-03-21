-- MyEcho 历史对话数据清理脚本
-- 方案C：新开始 - 删除所有历史对话，为 Soul Agent 准备干净的环境
-- 日期：2026-03-21

-- ========================================
-- ⚠️  执行前请注意
-- ========================================
--
-- 此脚本会删除以下数据：
-- 1. messages - 所有对话消息
-- 2. memories - 所有记忆
-- 3. chat_threads - 所有对话线程
-- 4. echoes - 所有 Echo 实例
--
-- 保留的数据：
-- - users - 用户账号
-- - characters - 角色配置
-- - avatars - 头像配置
--
-- 建议执行前先备份数据库！
--
-- ========================================

-- 备份提醒
SELECT '⚠️  准备删除数据，建议先备份！' as reminder;

-- 显示即将删除的数据量
SELECT '=== 删除前统计 ===' as info;

SELECT 'Messages:' as type, COUNT(*) as count FROM messages
UNION ALL
SELECT 'Memories:', COUNT(*) FROM memories
UNION ALL
SELECT 'Threads:', COUNT(*) FROM chat_threads
UNION ALL
SELECT 'Echoes:', COUNT(*) FROM echoes;

-- ========================================
-- 执行删除（按照外键依赖顺序）
-- ========================================

BEGIN;

-- 1. 删除对话消息
DELETE FROM messages;
SELECT '✓ Messages deleted' as status;

-- 2. 删除记忆
DELETE FROM memories;
SELECT '✓ Memories deleted' as status;

-- 3. 删除对话线程
DELETE FROM chat_threads;
SELECT '✓ Chat threads deleted' as status;

-- 4. 删除 Echo 实例
DELETE FROM echoes;
SELECT '✓ Echoes deleted' as status;

COMMIT;

-- ========================================
-- 验证删除结果
-- ========================================

SELECT '=== 删除后验证 ===' as info;

SELECT 'Messages:' as type, COUNT(*) as count FROM messages
UNION ALL
SELECT 'Memories:', COUNT(*) FROM memories
UNION ALL
SELECT 'Threads:', COUNT(*) FROM chat_threads
UNION ALL
SELECT 'Echoes:', COUNT(*) FROM echoes
UNION ALL
SELECT 'Users:', COUNT(*) FROM users
UNION ALL
SELECT 'Characters:', COUNT(*) FROM characters
UNION ALL
SELECT 'Avatars:', COUNT(*) FROM avatars;

-- ========================================
-- 数据库清理
-- ========================================

-- 可选：重置序列（如果有自增ID）
-- SELECT 'VACUUM FULL' as maintenance;
-- VACUUM FULL;

SELECT '🎉 清理完成！数据库已准备好为 Soul Agent 使用。' as status;
