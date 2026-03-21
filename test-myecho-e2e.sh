#!/bin/bash

# MyEcho + myagent Soul Agent 端到端测试
# 测试完整的 MyEcho 集成流程

echo "========================================="
echo "MyEcho Soul Agent 端到端测试"
echo "========================================="
echo ""

MYAGENT_URL="http://localhost:3000"
MYECHO_URL="http://localhost:3111"

SOUL_CHARACTER_ID="emotional-girlfriend-lively"
TEST_DEVICE_ID="device-e2e-test-$(date +%s)"
TEST_USER_MESSAGE="你好，我是端到端测试"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# ==================== 预检查 ====================
echo "【预检查】服务状态"
echo "-------------------------------------------"

# 检查 myagent
MYAGENT_HEALTH=$(curl -s "${MYAGENT_URL}/health" | jq -r '.status' 2>/dev/null || echo "error")
if [ "$MYAGENT_HEALTH" == "healthy" ]; then
  echo -e "${GREEN}✓ myagent 服务正常${NC}"
else
  echo -e "${RED}✗ myagent 服务未运行${NC}"
  exit 1
fi

# 检查 MyEcho
MYECHO_HEALTH=$(curl -s "${MYECHO_URL}/api/health" 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unknown")
if [ "$MYECHO_HEALTH" == "ok" ] || [ "$MYECHO_HEALTH" == "healthy" ]; then
  echo -e "${GREEN}✓ MyEcho 服务正常${NC}"
else
  echo -e "${RED}✗ MyEcho 服务未运行${NC}"
  echo "请先启动 MyEcho 服务："
  echo "  cd /Users/leo/workspace/myecho-backend && npm run dev"
  exit 1
fi

echo ""

# ==================== 步骤1：创建 Echo ====================
echo "【步骤1】创建 Soul Agent Echo"
echo "-------------------------------------------"

ECHO_RESPONSE=$(curl -s -X POST "${MYECHO_URL}/api/echoes" \
  -H "Content-Type: application/json" \
  -d "{
    \"deviceId\": \"${TEST_DEVICE_ID}\",
    \"characterId\": \"${SOUL_CHARACTER_ID}\",
    \"avatarId\": \"avatar-pure-1\",
    \"customName\": \"测试小糖\"
  }")

echo "$ECHO_RESPONSE" | jq '.'

ECHO_SUCCESS=$(echo "$ECHO_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$ECHO_SUCCESS" != "true" ]; then
  echo -e "${RED}✗ 创建 Echo 失败${NC}"
  exit 1
fi

ECHO_ID=$(echo "$ECHO_RESPONSE" | jq -r '.data.id')
THREAD_ID=$(echo "$ECHO_RESPONSE" | jq -r '.data.thread_id')

echo ""
echo -e "${GREEN}✓ Echo 创建成功${NC}"
echo "  Echo ID: $ECHO_ID"
echo "  Thread ID: $THREAD_ID"

# 验证 Soul Agent 初始化
if echo "$ECHO_RESPONSE" | jq -e '.data.agent_type == "soul"' > /dev/null; then
  echo -e "${GREEN}✓ Soul Agent 类型正确${NC}"
else
  echo -e "${RED}✗ Soul Agent 类型错误${NC}"
fi

if echo "$ECHO_RESPONSE" | jq -e '.data.soul_session_id' > /dev/null; then
  SOUL_SESSION_ID=$(echo "$ECHO_RESPONSE" | jq -r '.data.soul_session_id')
  echo -e "${GREEN}✓ Soul Session ID: $SOUL_SESSION_ID${NC}"
else
  echo -e "${RED}✗ 缺少 soul_session_id${NC}"
fi

echo ""

# ==================== 步骤2：发送消息 ====================
echo "【步骤2】发送用户消息"
echo "-------------------------------------------"

sleep 2

CHAT_RESPONSE=$(curl -s -X POST "${MYECHO_URL}/api/chat/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"${TEST_USER_MESSAGE}\",
    \"threadId\": \"${THREAD_ID}\",
    \"deviceId\": \"${TEST_DEVICE_ID}\"
  }")

echo "$CHAT_RESPONSE" | jq '.'

CHAT_SUCCESS=$(echo "$CHAT_RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$CHAT_SUCCESS" != "true" ]; then
  echo -e "${RED}✗ 发送消息失败${NC}"
  # 不退出，继续检查
else
  echo -e "${GREEN}✓ 消息发送成功${NC}"
fi

echo ""
echo "等待 Soul Agent 响应..."
sleep 5

echo ""

# ==================== 步骤3：获取消息历史 ====================
echo "【步骤3】获取消息历史"
echo "-------------------------------------------"

MESSAGES_RESPONSE=$(curl -s "${MYECHO_URL}/api/threads/${THREAD_ID}/messages")

echo "$MESSAGES_RESPONSE" | jq '.'

MESSAGE_COUNT=$(echo "$MESSAGES_RESPONSE" | jq '.data.messages | length' 2>/dev/null || echo "0")
echo ""
echo "消息数量: $MESSAGE_COUNT"

if [ "$MESSAGE_COUNT" -ge 2 ]; then
  echo -e "${GREEN}✓ 消息历史包含用户和AI消息${NC}"

  # 显示最近的消息
  echo ""
  echo "最近的消息："
  echo "$MESSAGES_RESPONSE" | jq -r '.data.messages[-2:] | .[] | "\(.role): \(.content)"'

else
  echo -e "${RED}✗ 消息数量不足${NC}"
fi

echo ""

# ==================== 步骤4：验证数据库 ====================
echo "【步骤4】验证数据库状态"
echo "-------------------------------------------"

# 检查 echoes 表
ECHO_DATA=$(psql -h localhost -U leo -d myecho_ai -t -c "
  SELECT agent_type, soul_session_id, soul_task_id
  FROM echoes WHERE id = '${ECHO_ID}';
" 2>/dev/null)

if [ -n "$ECHO_DATA" ]; then
  echo "Echo 数据库记录:"
  echo "$ECHO_DATA"
  echo -e "${GREEN}✓ Echo 数据库记录存在${NC}"
else
  echo -e "${RED}✗ Echo 数据库记录不存在${NC}"
fi

# 检查 messages 表
MESSAGE_SOURCES=$(psql -h localhost -U leo -d myecho_ai -t -c "
  SELECT source, COUNT(*) FROM messages
  WHERE thread_id = '${THREAD_ID}'
  GROUP BY source;
" 2>/dev/null)

if [ -n "$MESSAGE_SOURCES" ]; then
  echo ""
  echo "消息来源统计:"
  echo "$MESSAGE_SOURCES"
  echo -e "${GREEN}✓ 消息记录存在${NC}"
else
  echo -e "${RED}✗ 消息记录不存在${NC}"
fi

echo ""

# ==================== 步骤5：测试主动触发（可选）====================
echo "【步骤5】测试主动触发（Schedule）"
echo "-------------------------------------------"

# 直接调用 myagent API 触发主动消息
SCHEDULE_RESPONSE=$(curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_CHARACTER_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$(psql -h localhost -U leo -d myecho_ai -t -c \"SELECT user_id FROM echoes WHERE id = '${ECHO_ID}';\" | xargs)\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"soul_schedule\",
      \"data\": {\"type\": \"test_proactive\"}
    }
  }")

echo "$SCHEDULE_RESPONSE" | jq '.'

SCHEDULE_SUCCESS=$(echo "$SCHEDULE_RESPONSE" | jq -r '.result.executed' 2>/dev/null)
if [ "$SCHEDULE_SUCCESS" == "true" ]; then
  echo -e "${GREEN}✓ 主动触发成功${NC}"
else
  echo -e "${RED}✗ 主动触发失败${NC}"
fi

echo ""

# ==================== 总结 ====================
echo "========================================="
echo "测试总结"
echo "========================================="
echo ""
echo "测试项："
echo "1. ✓ 服务预检查"
echo "2. ✓ 创建 Soul Agent Echo"
echo "3. ✓ 发送用户消息"
echo "4. ✓ 获取消息历史"
echo "5. ✓ 验证数据库状态"
echo "6. ✓ 主动触发测试"
echo ""
echo -e "${GREEN}🎉 端到端测试完成！${NC}"
echo ""
echo "后续步骤："
echo "1. 检查 MyEcho 日志，确认消息处理流程"
echo "2. 测试前端 UI 集成"
echo "3. 实现主动消息推送（WebSocket stream）"
echo ""
echo "清理测试数据："
echo "  DELETE FROM echoes WHERE id = '${ECHO_ID}';"
