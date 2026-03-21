#!/bin/bash

# Soul Agent 阶段1测试脚本
# 测试简化后的 Soul Agent 核心逻辑

echo "========================================="
echo "Soul Agent 阶段1测试"
echo "========================================="
echo ""

MYAGENT_URL="http://localhost:3000"
SOUL_ID="emotional-girlfriend-lively"
USER_ID="test-user-001"

echo "测试1：触发 Soul Agent（用户消息场景）"
echo "-------------------------------------------"

curl -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"user_message\",
      \"data\": {
        \"userRequest\": \"你好\"
      }
    }
  }
}" | jq '.'

echo ""
echo "测试2：触发 Soul Agent（定时唤醒场景）"
echo "-------------------------------------------"

curl -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"${USER_ID}\",
    \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"context\": {
      \"source\": \"soul_schedule\",
      \"data\": {
        \"type\": \"morning_greeting\"
      }
    }
  }
}" | jq '.'

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "验证点："
echo "✓ Soul Agent 被激活"
echo "✓ 调用 Agent.run() 执行"
echo "✓ 自动推送 stream（taskExecution + taskResult）"
echo "✓ 执行完成后回到 idle 状态"
echo ""
echo "检查方式："
echo "1. 查看 myagent 日志，确认 Soul Agent 执行"
echo "2. 检查 soul_states 表，确认状态为 IDLE"
echo "3. 检查 soul_execution_history 表，确认执行记录"
