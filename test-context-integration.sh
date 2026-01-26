#!/bin/bash

# 上下文工程集成测试脚本
# 测试 ContextManagerHook 是否正常工作

echo "======================================"
echo "上下文工程集成测试"
echo "======================================"
echo ""

# 步骤 1: 发送任务请求
echo "📤 步骤 1: 发送任务请求..."
RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "创建一个简单的 TypeScript 函数，计算两个数字的和",
    "sessionId": "test-session-001",
    "useDelegation": false
  }')

echo "请求响应:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# 提取 taskId
TASK_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('taskId', ''))" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
  echo "❌ 无法获取 taskId，请检查服务是否正常运行"
  exit 1
fi

echo "✅ 获取到 taskId: $TASK_ID"
echo ""

# 步骤 2: 等待任务完成
echo "⏳ 步骤 2: 等待任务执行完成 (5秒)..."
sleep 5
echo ""

# 步骤 3: 查询上下文
echo "📊 步骤 3: 查询任务上下文..."
CONTEXT_RESPONSE=$(curl -s http://localhost:3000/api/contexts/$TASK_ID)

echo "上下文数据:"
echo "$CONTEXT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CONTEXT_RESPONSE"
echo ""

# 步骤 4: 验证关键数据
echo "🔍 步骤 4: 验证上下文关键数据..."

# 检查上下文是否存在
HAS_CONTEXT=$(echo "$CONTEXT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print('success' if data.get('success') else 'error')" 2>/dev/null)

if [ "$HAS_CONTEXT" = "error" ]; then
  echo "❌ 上下文查询失败"
  exit 1
fi

# 检查消息数量
MESSAGE_COUNT=$(echo "$CONTEXT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(len(data.get('context', {}).get('messages', [])))" 2>/dev/null)
echo "✅ 消息数量: $MESSAGE_COUNT"

# 检查是否有摘要
HAS_SUMMARY=$(echo "$CONTEXT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print('yes' if data.get('context', {}).get('summary') else 'no')" 2>/dev/null)
echo "✅ 有摘要: $HAS_SUMMARY"

# 检查当前回合数
CURRENT_TURN=$(echo "$CONTEXT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('context', {}).get('currentTurn', 0))" 2>/dev/null)
echo "✅ 当前回合: $CURRENT_TURN"

# 检查 token 总数
TOTAL_TOKENS=$(echo "$CONTEXT_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('context', {}).get('metadata', {}).get('totalTokens', 0))" 2>/dev/null)
echo "✅ Token 总数: $TOTAL_TOKENS"

echo ""
echo "======================================"
echo "✅ 测试完成！"
echo "======================================"
echo ""
echo "💡 提示:"
echo "  - 查看完整上下文: curl http://localhost:3000/api/contexts/$TASK_ID"
echo "  - 查看 Artifacts: curl http://localhost:3000/api/contexts/$TASK_ID/artifacts"
echo "  - 查看压缩历史: curl http://localhost:3000/api/contexts/$TASK_ID/compression-history"
