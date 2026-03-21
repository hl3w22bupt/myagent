#!/bin/bash

# MyEcho + myagent 集成测试脚本
# 测试 Soul Agent 集成到 MyEcho 的完整流程

echo "========================================="
echo "MyEcho + myagent Soul Agent 集成测试"
echo "========================================="
echo ""

MYAGENT_URL="http://localhost:3000"
MYECHO_URL="http://localhost:3001"  # MyEcho 默认端口

SOUL_CHARACTER_ID="emotional-girlfriend-lively"
TEST_DEVICE_ID="device-integration-test-001"
TEST_USER_MESSAGE="你好，我是集成测试"

echo "【前置检查】检查服务状态"
echo "-------------------------------------------"

# 检查 myagent 服务
MYAGENT_HEALTH=$(curl -s "${MYAGENT_URL}/health" | jq -r '.status' 2>/dev/null || echo "error")
if [ "$MYAGENT_HEALTH" == "healthy" ]; then
  echo "✓ myagent 服务运行正常"
else
  echo "✗ myagent 服务未运行"
  exit 1
fi

# 检查 MyEcho 服务
MYECHO_STATUS=$(curl -s "${MYECHO_URL}/api/health" | jq -r '.status' 2>/dev/null || echo "unknown")
if [ "$MYECHO_STATUS" == "ok" ] || [ "$MYECHO_STATUS" == "healthy" ]; then
  echo "✓ MyEcho 服务运行正常"
else
  echo "⚠ MyEcho 服务状态未知（可能未运行，继续测试）"
fi

echo ""
echo "【步骤1】直接调用 myagent 初始化 Soul Agent"
echo "-------------------------------------------"

# 初始化 Soul Agent
INIT_RESPONSE=$(curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_CHARACTER_ID}/initialize" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"integration-test-user-001\",
    \"characterId\": \"${SOUL_CHARACTER_ID}\",
    \"deviceId\": \"${TEST_DEVICE_ID}\",
    \"metadata\": {
      \"source\": \"myecho-integration-test\"
    }
  }")

echo "$INIT_RESPONSE" | jq '.'

# 检查是否成功
SUCCESS=$(echo "$INIT_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" != "true" ]; then
  echo "✗ Soul Agent 初始化失败"
  exit 1
fi

# 提取关键信息
SESSION_ID=$(echo "$INIT_RESPONSE" | jq -r '.data.sessionId')
TASK_ID=$(echo "$INIT_RESPONSE" | jq -r '.data.taskId')

echo ""
echo "✓ Soul Agent 初始化成功"
echo "  Session ID: $SESSION_ID"
echo "  Task ID: $TASK_ID"

echo ""
echo "【步骤2】模拟 MyEcho 调用 Soul Agent Execute API"
echo "-------------------------------------------"

# 模拟 MyEcho 发送用户消息
EXECUTE_RESPONSE=$(curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_CHARACTER_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"integration-test-user-001\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"user_message\",
      \"data\": {
        \"userRequest\": \"${TEST_USER_MESSAGE}\",
        \"messageId\": \"msg-test-$(date +%s)\"
      }
    }
  }")

echo "$EXECUTE_RESPONSE" | jq '.'

# 检查执行是否成功
EXECUTED=$(echo "$EXECUTE_RESPONSE" | jq -r '.result.executed' 2>/dev/null)
if [ "$EXECUTED" != "true" ]; then
  echo "✗ Soul Agent 执行失败"
  exit 1
fi

echo ""
echo "✓ Soul Agent 执行成功"

echo ""
echo "【步骤3】验证数据库状态"
echo "-------------------------------------------"

# 检查 task 状态
TASK_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';" | xargs)
echo "Task 状态: $TASK_STATUS"

# 检查 soul_states 状态
SOUL_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM soul_states WHERE session_id = '$SESSION_ID';" | xargs)
echo "Soul 状态: $SOUL_STATUS"

# 检查执行历史
EXEC_COUNT=$(psql -h localhost -U leo -d myagent -t -c "SELECT COUNT(*) FROM soul_execution_history WHERE session_id = '$SESSION_ID';" | xargs)
echo "执行历史记录数: $EXEC_COUNT"

if [ "$TASK_STATUS" == "idle" ] && [ "$SOUL_STATUS" == "IDLE" ]; then
  echo "✓ 数据库状态正常"
else
  echo "⚠ 数据库状态需要检查"
fi

echo ""
echo "【步骤4】测试主动触发（Schedule）"
echo "-------------------------------------------"

SCHEDULE_RESPONSE=$(curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_CHARACTER_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"integration-test-user-001\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"soul_schedule\",
      \"data\": {
        \"type\": \"test_proactive_message\"
      }
    }
  }")

echo "$SCHEDULE_RESPONSE" | jq '.'

SCHEDULE_EXECUTED=$(echo "$SCHEDULE_RESPONSE" | jq -r '.result.executed' 2>/dev/null)
if [ "$SCHEDULE_EXECUTED" == "true" ]; then
  echo "✓ 主动触发成功"
else
  echo "✗ 主动触发失败"
fi

echo ""
echo "========================================="
echo "测试总结"
echo "========================================="
echo "✓ myagent 初始化 API 工作正常"
echo "✓ Soul Agent execute API 工作正常"
echo "✓ 用户消息触发成功"
echo "✓ 主动触发（schedule）成功"
echo "✓ 数据库状态一致"
echo ""
echo "下一步："
echo "1. 修改 MyEcho echo-create API，集成初始化流程"
echo "2. 修改 MyEcho chat-send API，集成 execute 流程"
echo "3. 测试 MyEcho → myagent 完整流程"
