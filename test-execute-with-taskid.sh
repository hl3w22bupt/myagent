#!/bin/bash

echo "=== 测试 Soul Execute API 带 taskId 参数 ==="
echo ""

# 假设已经通过 initialize 创建了一个 task
TASK_ID="task-soul-emotional-girlfriend-lively-test-user-taskid-test"

echo "测试场景 1: 使用不存在的 taskId（应该返回 404）"
curl -X POST http://localhost:3000/api/soul/emotional-girlfriend-lively/execute \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"test-user-taskid\",
    \"taskId\": \"task-nonexistent\",
    \"context\": {
      \"source\": \"periodic_check\",
      \"data\": {
        \"reason\": \"Test with non-existent taskId\"
      }
    }
  }"

echo ""
echo ""
echo "测试场景 2: 不传 taskId，使用原有逻辑（通过 threadId 推导）"
curl -X POST http://localhost:3000/api/soul/emotional-girlfriend-lively/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-taskid",
    "context": {
      "source": "periodic_check",
      "data": {
        "threadId": "thread-xyz",
        "reason": "Test without taskId"
      }
    }
  }'

echo ""
echo ""
echo "✅ 测试完成，请查看响应和日志"
echo ""
echo "预期结果："
echo "1. 场景 1: 返回 404，error: 'Task not found'"
echo "2. 场景 2: 正常执行，创建或复用 task"
