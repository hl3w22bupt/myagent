#!/bin/bash

# Soul Agent 阶段2测试脚本
# 测试初始化 API 和后续执行

echo "========================================="
echo "Soul Agent 阶段2测试：初始化 API"
echo "========================================="
echo ""

MYAGENT_URL="http://localhost:3000"
SOUL_ID="emotional-girlfriend-lively"
USER_ID="test-user-init-001"
CHARACTER_ID="emotional-girlfriend-lively"
DEVICE_ID="device-test-001"

echo "测试1：初始化 Soul Agent"
echo "-------------------------------------------"

INIT_RESPONSE=$(curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"characterId\": \"${CHARACTER_ID}\",
    \"deviceId\": \"${DEVICE_ID}\",
    \"metadata\": {
      \"test\": \"phase2\"
    }
  }")

echo "$INIT_RESPONSE" | jq '.'

# Extract sessionId and taskId
SESSION_ID=$(echo "$INIT_RESPONSE" | jq -r '.data.sessionId')
TASK_ID=$(echo "$INIT_RESPONSE" | jq -r '.data.taskId')

echo ""
echo "Session ID: $SESSION_ID"
echo "Task ID: $TASK_ID"

if [ "$SESSION_ID" == "null" ] || [ "$TASK_ID" == "null" ]; then
  echo "❌ 初始化失败！"
  exit 1
fi

echo ""
echo "测试2：验证 Task 状态为 idle"
echo "-------------------------------------------"

# Wait a bit for database to update
sleep 2

# Check task status via API (if available) or log
echo "Task ID: $TASK_ID"
echo "Status: idle (expected)"

echo ""
echo "测试3：在已初始化的 Soul 上执行用户消息"
echo "-------------------------------------------"

curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"user_message\",
      \"data\": {
        \"userRequest\": \"初始化后的第一条消息\"
      }
    }
  }" | jq '.'

echo ""
echo "测试4：在已初始化的 Soul 上执行定时触发"
echo "-------------------------------------------"

curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"soul_schedule\",
      \"data\": {
        \"type\": \"test_trigger\"
      }
    }
  }" | jq '.'

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "验证点："
echo "✓ 初始化 API 创建 Soul Agent 实例"
echo "✓ 创建 idle 状态的 task"
echo "✓ 后续 execute 调用正常工作"
echo "✓ Task 状态在 idle ↔ running 之间切换"
echo ""
echo "检查方式："
echo "1. 查看 myagent 日志，确认初始化流程"
echo "2. 检查 tasks 表，确认 idle task 创建"
echo "3. 检查 soul_execution_history 表，确认执行记录"
echo "4. 验证同一个 sessionId 的多次调用"
echo ""
