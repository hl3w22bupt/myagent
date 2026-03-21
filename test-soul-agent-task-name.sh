#!/bin/bash

# Soul Agent Task Name 测试脚本
# 测试新的 task name 和 app 功能

set -e

echo "========================================"
echo "🧹 Soul Agent Task Name 测试脚本"
echo "========================================"

# 1. 清理 MyEcho 旧的测试数据
echo ""
echo "📋 步骤 1: 清理 MyEcho 旧的测试数据..."
psql -U leo -d myecho_ai << 'EOF'
-- 删除线程（会级联删除消息）
DELETE FROM chat_threads WHERE echo_id IN (
  SELECT id FROM echoes WHERE agent_type = 'soul'
);

-- 删除 Soul Agent echoes
DELETE FROM echoes WHERE agent_type = 'soul';

-- 验证删除结果
SELECT '✓ MyEcho 清理完成' as status,
       (SELECT COUNT(*) FROM echoes WHERE agent_type = 'soul') as soul_echos,
       (SELECT COUNT(*) FROM chat_threads) as threads;
EOF

# 2. 清理 MyAgent 中旧的 Soul Agent task
echo ""
echo "📋 步骤 2: 清理 MyAgent 中旧的 Soul Agent task..."
psql -U leo -d myagent << 'EOF'
-- 删除测试创建的 Soul Agent tasks
DELETE FROM tasks WHERE app = 'soul-agent' AND id LIKE 'task-soul-%';

-- 验证删除结果
SELECT '✓ MyAgent 清理完成' as status,
       (SELECT COUNT(*) FROM tasks WHERE app = 'soul-agent') as soul_agent_tasks,
       (SELECT COUNT(*) FROM tasks WHERE app = 'myecho') as myecho_tasks;
EOF

# 3. 测试创建新的 Soul Agent Echo
echo ""
echo "📋 步骤 3: 测试创建新的 Soul Agent Echo..."
echo ""
echo "发送请求到 MyEcho 创建 Echo API..."

# 获取一个可用的 character ID 和 avatar ID
CHARACTER_ID="char-energetic-girlfriend"
AVATAR_ID="avatar-pure-1"
DEVICE_ID="test-device-soul-agent-task-name"
CUSTOM_NAME="测试女友-任务名称"

# 调用创建 Echo API
echo "POST http://localhost:3111/api/echoes"
echo "Body: {"
echo "  \"deviceId\": \"$DEVICE_ID\","
echo "  \"characterId\": \"$CHARACTER_ID\","
echo "  \"avatarId\": \"$AVATAR_ID\","
echo "  \"customName\": \"$CUSTOM_NAME\""
echo "}"

RESPONSE=$(curl -s -X POST http://localhost:3111/api/echoes \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"$DEVICE_ID\",
    \"characterId\": \"$CHARACTER_ID\",
    \"avatarId\": \"$AVATAR_ID\",
    \"customName\": \"$CUSTOM_NAME\"
  }")

echo ""
echo "📨 响应:"
echo "$RESPONSE" | jq '.'

# 提取 echo ID 和 thread ID
ECHO_ID=$(echo "$RESPONSE" | jq -r '.data.id // empty')
THREAD_ID=$(echo "$RESPONSE" | jq -r '.data.threadId // empty')

if [ -z "$ECHO_ID" ] || [ -z "$THREAD_ID" ]; then
  echo ""
  echo "❌ 创建 Echo 失败：无法提取 ID"
  echo "完整响应: $RESPONSE"
  exit 1
fi

echo ""
echo "✅ Echo 创建成功!"
echo "   Echo ID: $ECHO_ID"
echo "   Thread ID: $THREAD_ID"

# 4. 验证 MyEcho 数据库
echo ""
echo "📋 步骤 4: 验证 MyEcho 数据库..."
psql -U leo -d myecho_ai << EOF
-- 查询创建的 echo 和 thread
SELECT
  'Echo 信息:' as info,
  e.id as echo_id,
  e.agent_type,
  e.soul_session_id,
  e.soul_task_id
FROM echoes e
WHERE e.id = '$ECHO_ID'

UNION ALL

SELECT
  'Thread 信息:' as info,
  t.id as thread_id,
  t.is_soul_thread::text,
  e.agent_type,
  t.created_at::text
FROM chat_threads t
INNER JOIN echoes e ON e.id = t.echo_id
WHERE t.id = '$THREAD_ID';
EOF

# 5. 验证 MyAgent 数据库
echo ""
echo "📋 步骤 5: 验证 MyAgent 数据库中的 Task..."
psql -U leo -d myagent << EOF
-- 查询创建的 Soul Agent task
SELECT
  id as task_id,
  session_id,
  task as task_name,
  status,
  app,
  created_at
FROM tasks
WHERE id = (
  SELECT soul_task_id FROM echoes WHERE id = '$ECHO_ID'
);
EOF

# 6. 发送测试消息
echo ""
echo "📋 步骤 6: 发送测试消息..."
sleep 2

MESSAGE="你好，在测试 task name 功能"

echo "发送消息: $MESSAGE"
echo "POST http://localhost:3111/api/chat/send"
echo "Body: {"
echo "  \"message\": \"$MESSAGE\","
echo "  \"threadId\": \"$THREAD_ID\","
echo "  \"deviceId\": \"$DEVICE_ID\""
echo "}"

CHAT_RESPONSE=$(curl -s -X POST http://localhost:3111/api/chat/send \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"$MESSAGE\",
    \"threadId\": \"$THREAD_ID\",
    \"deviceId\": \"$DEVICE_ID\"
  }")

echo ""
echo "📨 聊天响应:"
echo "$CHAT_RESPONSE" | jq '.'

# 7. 等待任务状态更新
echo ""
echo "⏳ 等待 3 秒，让任务状态更新..."
sleep 3

# 8. 验证任务状态更新
echo ""
echo "📋 步骤 7: 验证任务状态是否更新..."
psql -U leo -d myagent << EOF
-- 查询任务状态
SELECT
  id as task_id,
  task as task_name,
  status,
  app,
  updated_at
FROM tasks
WHERE id = (
  SELECT soul_task_id FROM echoes WHERE id = '$ECHO_ID'
);
EOF

# 9. 测试总结
echo ""
echo "========================================"
echo "✅ 测试完成！"
echo "========================================"
echo ""
echo "🎯 验证清单:"
echo ""
echo "1. 打开 MyAgent WebApp: http://localhost:3000"
echo "   - 查看任务列表，应该能看到 task name='对话 thread-xxx'"
echo "   - app 应该显示为 'myecho'"
echo "   - 任务卡片应该可以点击进入详情"
echo ""
echo "2. 发送消息后："
echo "   - 任务状态应该从 'idle' 变为 'running'"
echo "   - 完成后应该回到 'idle'"
echo "   - task 字段应该更新为用户消息内容"
echo ""
echo "📊 测试数据:"
echo "   - Echo ID: $ECHO_ID"
echo "   - Thread ID: $THREAD_ID"
echo "   - Device ID: $DEVICE_ID"
echo ""
echo "🗑️  清理命令（如需重新测试）:"
echo "   bash $0"
echo ""
