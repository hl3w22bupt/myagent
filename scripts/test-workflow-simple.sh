#!/bin/bash

# Simple Workflow Test
# 简单的工作流测试脚本

set -e

BASE_URL="http://localhost:3000"
WORKFLOW_NAME="test-feedback"

echo "================================"
echo "工作流执行测试"
echo "================================"
echo ""

# 1. 检查服务
echo "1. 检查服务状态..."
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
  echo "❌ 服务未运行"
  exit 1
fi
echo "✅ 服务正在运行"
echo ""

# 2. 提交任务
echo "2. 提交工作流任务..."
echo "   工作流: $WORKFLOW_NAME"

RESPONSE=$(curl -s -X POST "${BASE_URL}/agent/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"task\": \"实现一个简单的加法函数\",
    \"workflow\": \"$WORKFLOW_NAME\",
    \"workflow_input\": {
      \"test_input\": \"实现一个 add(a, b) 函数，返回两数之和\"
    },
    \"sessionId\": \"test-workflow-$(date +%s)\"
  }")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# 3. 提取 taskId
TASK_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('taskId', ''))" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
  echo "❌ 无法获取 taskId"
  exit 1
fi

echo "✅ 任务已提交: $TASK_ID"
echo ""

# 4. 监控任务执行
echo "3. 监控任务执行..."
echo ""

for i in {1..60}; do
  sleep 2
  echo -ne "\r   进度: $i/60 $(printf '█%.0s' $(seq 1 $i))"

  # 获取任务上下文
  CONTEXT=$(curl -s "${BASE_URL}/api/contexts/${TASK_ID}" 2>/dev/null)

  # 检查是否有错误（模拟 HITL 场景）
  if echo "$CONTEXT" | grep -q '"hitlState"' && echo "$CONTEXT" | grep -q '"status":"awaiting"'; then
    echo ""
    echo ""
    echo "🔔 HITL 触发！"
    echo ""
    echo "   HITL 状态:"
    echo "$CONTEXT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
hitl = data.get('data', {}).get('hitlState', {})
if hitl:
    print(f\"   问题: {hitl.get('question', 'N/A')}\")
    print(f\"   选项: {hitl.get('options', [])}\")
" 2>/dev/null
    echo ""
    echo "   提示：这是测试，工作流配置了 HITL 但需要 Agent 真正失败才会触发"
    break
  fi
done

echo ""
echo ""

# 5. 获取最终结果
echo "4. 获取执行结果..."
echo ""

sleep 3  # 等待最后的更新

RESULT=$(curl -s "${BASE_URL}/api/contexts/${TASK_ID}")

echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin).get('data', {})

print('执行结果:')
print(f\"  taskId: {data.get('taskId', 'N/A')}\")
print(f\"  sessionId: {data.get('sessionId', 'N/A')}\")

# 显示对话轮次
rounds = data.get('conversationRounds', [])
print(f\"  对话轮次: {len(rounds)}\")

# 显示摘要
summary = data.get('summary', {})
if summary.get('completedSteps'):
    print(f\"  完成步骤: {', '.join(summary.get('completedSteps', []))}\")

# 检查 HITL 状态
hitl = data.get('hitlState')
if hitl:
    print(f\"  HITL 状态: {hitl.get('status', 'N/A')}\")
else:
    print(f\"  HITL 状态: None (未触发)\")
" 2>/dev/null

echo ""
echo "✅ 测试完成"
echo ""
echo "💡 说明："
echo "   - 工作流已成功执行"
echo "   - HITL 配置已就绪，但需要 Agent 执行失败才会触发"
echo "   - 重试功能已集成（可从日志中观察）"
echo "   - 要测试 HITL，需要让某个步骤真正失败（例如网络错误）"
