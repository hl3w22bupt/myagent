#!/bin/bash

# Soul Agent Demo API Test Script
# 演示如何通过 HTTP API 调用 Soul Agent

BASE_URL="http://localhost:3000"
SOUL_ID="emotional-girlfriend-lively"
USER_ID="demo-user-123"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║       Soul Agent API 测试脚本                            ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# 1. 发送消息给 Soul Agent
echo "📨 测试 1: 发送消息给 Soul Agent"
echo "----------------------------------------"
curl -X POST "${BASE_URL}/api/demo/soul/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"soulId\": \"${SOUL_ID}\",
    \"userId\": \"${USER_ID}\",
    \"message\": \"我今天工作很累，想休息一下\"
  }" \
  -s | jq .

echo ""
echo ""

# 2. 查询 Soul 状态
echo "📊 测试 2: 查询 Soul 状态"
echo "----------------------------------------"
curl -X GET "${BASE_URL}/api/demo/soul/status/${SOUL_ID}/${USER_ID}" \
  -s | jq .

echo ""
echo ""

# 3. 查询对话上下文
echo "💬 测试 3: 查询对话上下文"
echo "----------------------------------------"
curl -X GET "${BASE_URL}/api/demo/soul/context/${SOUL_ID}/${USER_ID}" \
  -s | jq .

echo ""
echo ""

# 4. Cron 触发测试
echo "⏰ 测试 4: Cron 触发"
echo "----------------------------------------"
curl -X POST "${BASE_URL}/api/demo/soul/trigger" \
  -H "Content-Type: application/json" \
  -d "{
    \"soulId\": \"${SOUL_ID}\",
    \"userId\": \"${USER_ID}\",
    \"triggerType\": \"cron\",
    \"triggerData\": {
      \"type\": \"periodic_check\",
      \"current_hour\": 22,
      \"last_interaction_hours\": 25
    }
  }" \
  -s | jq .

echo ""
echo ""

# 5. 事件触发测试
echo "⚡ 测试 5: 事件触发（检测到用户情绪低落）"
echo "----------------------------------------"
curl -X POST "${BASE_URL}/api/demo/soul/trigger" \
  -H "Content-Type: application/json" \
  -d "{
    \"soulId\": \"${SOUL_ID}\",
    \"userId\": \"${USER_ID}\",
    \"triggerType\": \"event\",
    \"triggerData\": {
      \"type\": \"user_mood_change\",
      \"event_name\": \"user_mood_detected\",
      \"detected_mood\": \"sad\",
      \"confidence\": 0.85
    }
  }" \
  -s | jq .

echo ""
echo ""

# 6. 再发送一条消息
echo "📨 测试 6: 发送第二条消息"
echo "----------------------------------------"
curl -X POST "${BASE_URL}/api/demo/soul/chat" \
  -H "Content-Type: application/json" \
  -d "{
    \"soulId\": \"${SOUL_ID}\",
    \"userId\": \"${USER_ID}\",
    \"message\": \"我想吃火锅\"
  }" \
  -s | jq .

echo ""
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           API 测试完成！                                ║"
echo "╚══════════════════════════════════════════════════════════╝"
