#!/bin/bash

echo "=== 测试 Soul Agent 造单模式 ==="
echo ""
echo "测试场景：早上 9 点，用户 48 小时未活跃"
echo "预期：Soul Agent 判断需要行动，主动问候"
echo ""

curl -X POST http://localhost:3000/api/soul/emotional-girlfriend-lively/execute \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-periodic",
    "trigger_time": "2026-03-22T09:00:00Z",
    "context": {
      "source": "periodic_check",
      "data": {
        "reason": "Periodic check - autonomous decision making",
        "last_interaction": "2026-03-20T09:00:00Z",
        "current_hour": 9
      }
    }
  }'

echo ""
echo ""
echo "✅ API 调用完成，请查看服务日志中的 Soul Agent 决策过程"
echo ""
echo "查看日志重点："
echo "1. [SoulAgent] 【造单模式】处理定时检查"
echo "2. [SoulAgent] Making decision based on context"
echo "3. [SoulAgent] action needed / no action needed"
echo "4. LLM 决策结果和任务执行"
