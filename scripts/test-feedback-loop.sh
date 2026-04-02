#!/bin/bash

# Test Script for Workflow Feedback Loop
# 测试工作流反馈循环功能

set -e

BASE_URL="http://localhost:3000"
WORKFLOW_NAME="test-feedback-loop"

echo "================================"
echo "工作流反馈循环测试"
echo "================================"
echo ""

# 1. 检查服务是否运行
echo "1. 检查服务状态..."
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
  echo "❌ 服务未运行，请先启动: npm run start"
  exit 1
fi
echo "✅ 服务正在运行"
echo ""

# 2. 列出可用的工作流
echo "2. 列出可用的工作流..."
WORKFLOWS=$(curl -s "${BASE_URL}/api/workflows")
echo "$WORKFLOWS" | python3 -m json.tool 2>/dev/null || echo "$WORKFLOWS"
echo ""

# 3. 提交工作流任务
echo "3. 提交工作流任务..."
echo "   工作流: $WORKFLOW_NAME"
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/agent/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"task\": \"测试反馈循环功能\",
    \"workflow\": \"$WORKFLOW_NAME\",
    \"workflow_input\": {},
    \"sessionId\": \"test-feedback-$(date +%s)\"
  }")

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# 4. 提取 taskId
TASK_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('taskId', ''))" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
  echo "❌ 无法获取 taskId"
  exit 1
fi

echo "✅ 任务已提交"
echo "   taskId: $TASK_ID"
echo ""

# 5. 等待 HITL 状态
echo "4. 等待 HITL 状态（等待步骤失败）..."
echo ""

for i in {1..12}; do
  sleep 5
  echo "   检查第 $i 次..."

  # 获取任务上下文
  CONTEXT=$(curl -s "${BASE_URL}/api/contexts/${TASK_ID}")
  HITL_STATUS=$(echo "$CONTEXT" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('hitlState', {}).get('status', 'none'))" 2>/dev/null)

  if [ "$HITL_STATUS" = "awaiting" ]; then
    echo "✅ HITL 状态已触发！"
    echo ""
    echo "   HITL 状态详情："
    echo "$CONTEXT" | python3 -m json.tool 2>/dev/null | grep -A 20 "hitlState" || true
    echo ""

    # 6. 显示选项并请求用户输入
    echo "================================"
    echo "HITL 选项："
    echo "================================"
    echo "1) 重试 (retry)"
    echo "2) 跳过 (skip)"
    echo "3) 中止 (abort)"
    echo ""
    read -p "请选择操作 (1/2/3): " CHOICE

    case $CHOICE in
      1)
        ACTION="retry"
        ;;
      2)
        ACTION="skip"
        ;;
      3)
        ACTION="abort"
        ;;
      *)
        echo "无效选择，默认中止"
        ACTION="abort"
        ;;
    esac

    echo ""
    echo "5. 提交 HITL 响应..."
    echo "   action: $ACTION"

    HITL_RESPONSE=$(curl -s -X PUT "${BASE_URL}/api/tasks/${TASK_ID}/hitl" \
      -H "Content-Type: application/json" \
      -d "{
        \"decision\": \"{\\\"action\\\":\\\"${ACTION}\\\",\\\"params\\\":{}}\",
        \"feedback\": \"测试用户选择: ${ACTION}\"
      }")

    echo "$HITL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HITL_RESPONSE"
    echo ""

    if echo "$HITL_RESPONSE" | grep -q '"success":true'; then
      echo "✅ HITL 响应提交成功"
    else
      echo "❌ HITL 响应提交失败"
      exit 1
    fi

    break
  fi

  echo "   状态: $HITL_STATUS (等待中...)"
done

echo ""
echo "6. 等待工作流完成..."
echo ""

for i in {1..20}; do
  sleep 3
  echo "   检查第 $i 次..."

  RESULT=$(curl -s "${BASE_URL}/api/tasks/${TASK_ID}")
  STATUS=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'running'))" 2>/dev/null)

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    echo "✅ 工作流执行完成"
    echo ""
    echo "   最终状态: $STATUS"
    echo ""
    echo "   完整结果："
    echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"
    echo ""

    # 7. 获取工作流执行详情
    echo "7. 获取工作流执行详情..."
    echo ""

    WORKFLOW_RESULT=$(curl -s "${BASE_URL}/api/contexts/${TASK_ID}")
    echo "$WORKFLOW_RESULT" | python3 -m json.tool 2>/dev/null || echo "$WORKFLOW_RESULT"

    exit 0
  fi

  echo "   状态: $STATUS (运行中...)"
done

echo ""
echo "⏱ 超时：工作流执行时间过长"
echo "   请手动查看结果: curl ${BASE_URL}/api/tasks/${TASK_ID}"
