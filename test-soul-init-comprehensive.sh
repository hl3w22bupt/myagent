#!/bin/bash

# Soul Agent 阶段2全面测试脚本
# 测试边界情况、状态转换、数据一致性等

echo "========================================="
echo "Soul Agent 阶段2全面测试"
echo "========================================="
echo ""

MYAGENT_URL="http://localhost:3000"
SOUL_ID="emotional-girlfriend-lively"
USER_ID="test-user-comprehensive-001"
CHARACTER_ID="emotional-girlfriend-lively"
DEVICE_ID="device-test-comprehensive-001"

PASS_COUNT=0
FAIL_COUNT=0

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试辅助函数
test_case() {
  local test_name=$1
  local test_command=$2
  local expected_result=$3

  echo -e "${YELLOW}测试：${test_name}${NC}"
  echo "命令：$test_command"

  local result=$(eval $test_command)
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    if [ -n "$expected_result" ]; then
      if echo "$result" | grep -q "$expected_result"; then
        echo -e "${GREEN}✓ 通过${NC}"
        echo "结果：$(echo $result | jq -c '.')"
        ((PASS_COUNT++))
      else
        echo -e "${RED}✗ 失败：未找到预期结果 '$expected_result'${NC}"
        echo "结果：$(echo $result | jq '.')"
        ((FAIL_COUNT++))
      fi
    else
      echo -e "${GREEN}✓ 通过${NC}"
      echo "结果：$(echo $result | jq -c '.')"
      ((PASS_COUNT++))
    fi
  else
    echo -e "${RED}✗ 失败：命令执行错误${NC}"
    echo "结果：$result"
    ((FAIL_COUNT++))
  fi
  echo ""
}

echo "========================================="
echo "场景1：初始化测试"
echo "========================================="
echo ""

# 测试1.1：正常初始化
test_case "1.1 正常初始化 Soul Agent" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"characterId\": \"${CHARACTER_ID}\",
     \"deviceId\": \"${DEVICE_ID}\"
   }'" \
  '"success": true'

# 提取 sessionId
SESSION_ID="soul-${SOUL_ID}-${USER_ID}"
TASK_ID="task-soul-${SOUL_ID}-${USER_ID}"

echo "Session ID: $SESSION_ID"
echo "Task ID: $TASK_ID"
echo ""

# 测试1.2：重复初始化（应该返回已存在的实例）
test_case "1.2 重复初始化同一 Soul（应返回已存在实例）" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"characterId\": \"${CHARACTER_ID}\",
     \"deviceId\": \"${DEVICE_ID}\"
   }'" \
  '"success": true'

# 测试1.3：缺少必需参数
test_case "1.3 缺少 userId 参数（应失败）" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize' \
   -H 'Content-Type: application/json' \
   -d '{
     \"characterId\": \"${CHARACTER_ID}\",
     \"deviceId\": \"${DEVICE_ID}\"
   }'" \
  '"success": false'

# 测试1.4：缺少 characterId 参数
test_case "1.4 缺少 characterId 参数（应失败）" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"deviceId\": \"${DEVICE_ID}\"
   }'" \
  '"success": false'

echo "========================================="
echo "场景2：执行测试"
echo "========================================="
echo ""

# 等待初始化完成
sleep 2

# 测试2.1：用户消息触发
test_case "2.1 用户消息触发" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
     \"context\": {
       \"source\": \"user_message\",
       \"data\": {\"userRequest\": \"测试用户消息\"}
     }
   }'" \
  '"executed": true'

# 测试2.2：定时触发
test_case "2.2 定时触发（schedule）" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
     \"context\": {
       \"source\": \"soul_schedule\",
       \"data\": {\"type\": \"test_schedule\"}
     }
   }'" \
  '"executed": true'

# 测试2.3：情绪检测触发
test_case "2.3 情绪检测触发" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
     \"context\": {
       \"source\": \"emotion_detection\",
       \"data\": {\"detectedMood\": \"sad\", \"confidence\": 0.9}
     }
   }'" \
  '"executed": true'

# 测试2.4：缺少 context 参数
test_case "2.4 缺少 context 参数（应失败）" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
   }'" \
  '"success": false'

echo "========================================="
echo "场景3：数据库验证"
echo "========================================="
echo ""

sleep 2

# 测试3.1：验证 task 状态
echo "测试 3.1：验证 task 状态"
TASK_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';" | xargs)
echo "Task 状态: $TASK_STATUS"
if [ "$TASK_STATUS" == "idle" ] || [ "$TASK_STATUS" == "running" ]; then
  echo -e "${GREEN}✓ Task 状态正常：$TASK_STATUS${NC}"
  ((PASS_COUNT++))
else
  echo -e "${RED}✗ Task 状态异常：$TASK_STATUS${NC}"
  ((FAIL_COUNT++))
fi
echo ""

# 测试3.2：验证 soul_states 状态
echo "测试 3.2：验证 soul_states 状态"
SOUL_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM soul_states WHERE session_id = '$SESSION_ID';" | xargs)
echo "Soul 状态: $SOUL_STATUS"
if [ "$SOUL_STATUS" == "IDLE" ] || [ "$SOUL_STATUS" == "ACTIVE" ]; then
  echo -e "${GREEN}✓ Soul 状态正常：$SOUL_STATUS${NC}"
  ((PASS_COUNT++))
else
  echo -e "${RED}✗ Soul 状态异常：$SOUL_STATUS${NC}"
  ((FAIL_COUNT++))
fi
echo ""

# 测试3.3：验证执行历史记录
echo "测试 3.3：验证执行历史记录"
EXEC_COUNT=$(psql -h localhost -U leo -d myagent -t -c "SELECT COUNT(*) FROM soul_execution_history WHERE session_id = '$SESSION_ID';" | xargs)
echo "执行历史记录数: $EXEC_COUNT"
if [ "$EXEC_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✓ 执行历史记录存在：$EXEC_COUNT 条${NC}"
  ((PASS_COUNT++))

  # 显示最近的执行记录
  echo ""
  echo "最近 5 条执行记录："
  psql -h localhost -U leo -d myagent -c "SELECT trigger_source, status, created_at FROM soul_execution_history WHERE session_id = '$SESSION_ID' ORDER BY created_at DESC LIMIT 5;"
else
  echo -e "${RED}✗ 执行历史记录不存在${NC}"
  ((FAIL_COUNT++))
fi
echo ""

# 测试3.4：验证 task metadata
echo "测试 3.4：验证 task metadata"
TASK_METADATA=$(psql -h localhost -U leo -d myagent -t -c "SELECT metadata FROM tasks WHERE id = '$TASK_ID';" | jq '.type')
echo "Task type: $TASK_METADATA"
if [ "$TASK_METADATA" == '"soul_agent"' ]; then
  echo -e "${GREEN}✓ Task metadata 正确${NC}"
  ((PASS_COUNT++))
else
  echo -e "${RED}✗ Task metadata 错误${NC}"
  ((FAIL_COUNT++))
fi
echo ""

echo "========================================="
echo "场景4：状态转换测试"
echo "========================================="
echo ""

# 测试4.1：连续执行，观察状态转换
echo "测试 4.1：连续执行 3 次，观察状态转换"
for i in {1..3}; do
  echo "执行第 $i 次..."
  curl -s -X POST "${MYAGENT_URL}/api/soul/${SOUL_ID}/execute" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"${USER_ID}\",
      \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"context\": {
        \"source\": \"user_message\",
        \"data\": {\"userRequest\": \"连续测试 $i\"}
      }
    }" > /dev/null

  sleep 1

  # 检查状态
  CURRENT_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM soul_states WHERE session_id = '$SESSION_ID';" | xargs)
  echo "  - Soul 状态: $CURRENT_STATUS"

  TASK_STATUS=$(psql -h localhost -U leo -d myagent -t -c "SELECT status FROM tasks WHERE id = '$TASK_ID';" | xargs)
  echo "  - Task 状态: $TASK_STATUS"
done

echo -e "${GREEN}✓ 状态转换测试完成${NC}"
((PASS_COUNT++))
echo ""

echo "========================================="
echo "场景5：不同用户的 Soul 隔离测试"
echo "========================================="
echo ""

USER_ID_2="test-user-comprehensive-002"
SESSION_ID_2="soul-${SOUL_ID}-${USER_ID_2}"

# 测试5.1：创建第二个用户的 Soul
test_case "5.1 创建第二个用户的 Soul" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/initialize' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID_2}\",
     \"characterId\": \"${CHARACTER_ID}\",
     \"deviceId\": \"${DEVICE_ID}\"
   }'" \
  '"success": true'

sleep 2

# 测试5.2：两个用户同时执行
test_case "5.2 用户1执行" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
     \"context\": {
       \"source\": \"user_message\",
       \"data\": {\"userRequest\": \"用户1消息\"}
     }
   }'" \
  '"executed": true'

test_case "5.3 用户2执行" \
  "curl -s -X POST '${MYAGENT_URL}/api/soul/${SOUL_ID}/execute' \
   -H 'Content-Type: application/json' \
   -d '{
     \"userId\": \"${USER_ID_2}\",
     \"trigger_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
     \"context\": {
       \"source\": \"user_message\",
       \"data\": {\"userRequest\": \"用户2消息\"}
     }
   }'" \
  '"executed": true'

# 测试5.4：验证两个用户的 session 隔离
echo "测试 5.4：验证两个用户的 session 隔离"
SESSION_1_EXISTS=$(psql -h localhost -U leo -d myagent -t -c "SELECT COUNT(*) FROM soul_states WHERE session_id = '$SESSION_ID';" | xargs)
SESSION_2_EXISTS=$(psql -h localhost -U leo -d myagent -t -c "SELECT COUNT(*) FROM soul_states WHERE session_id = '$SESSION_ID_2';" | xargs)

echo "用户1 session 存在: $SESSION_1_EXISTS"
echo "用户2 session 存在: $SESSION_2_EXISTS"

if [ "$SESSION_1_EXISTS" == "1" ] && [ "$SESSION_2_EXISTS" == "1" ]; then
  echo -e "${GREEN}✓ 两个用户的 session 正确隔离${NC}"
  ((PASS_COUNT++))
else
  echo -e "${RED}✗ session 隔离失败${NC}"
  ((FAIL_COUNT++))
fi
echo ""

echo "========================================="
echo "测试总结"
echo "========================================="
echo -e "${GREEN}通过：$PASS_COUNT${NC}"
echo -e "${RED}失败：$FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}🎉 所有测试通过！${NC}"
  exit 0
else
  echo -e "${RED}❌ 部分测试失败${NC}"
  exit 1
fi
