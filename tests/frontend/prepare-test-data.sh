#!/bin/bash

# 测试数据准备脚本
# 确保任务存在且有执行数据

set -e

TASK_ID="task-1769754178517-1"
API_BASE="http://localhost:3000"

echo "======================================"
echo "  测试数据准备"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
  echo -e "${RED}❌ $1${NC}"
}

check_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# 检查后端 API
echo "🔍 检查后端 API..."
if ! curl -s "$API_BASE/api/health" > /dev/null 2>&1; then
  if ! curl -s "$API_BASE" > /dev/null 2>&1; then
    check_fail "后端 API 未运行"
    echo "💡 请先启动后端: npm run dev"
    exit 1
  fi
fi
check_pass "后端 API 正在运行"

# 检查任务是否存在
echo ""
echo "🔍 检查任务: $TASK_ID"

TASK_RESPONSE=$(curl -s "$API_BASE/api/tasks/$TASK_ID" 2>&1)
TASK_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/tasks/$TASK_ID" 2>&1)

if [ "$TASK_HTTP_CODE" = "200" ]; then
  check_pass "任务存在"

  # 解析任务状态
  if echo "$TASK_RESPONSE" | grep -q '"status":"completed"'; then
    check_pass "任务已完成"
  elif echo "$TASK_RESPONSE" | grep -q '"status":"running"'; then
    check_warn "任务正在运行中"
  elif echo "$TASK_RESPONSE" | grep -q '"status":"started"'; then
    check_warn "任务已开始"
  else
    check_warn "任务状态未知"
  fi
elif [ "$TASK_HTTP_CODE" = "404" ]; then
  check_fail "任务不存在 (404)"
  echo ""
  echo "💡 需要先创建任务或使用其他任务 ID"
  echo ""
  echo "可用选项："
  echo "1. 修改测试中的 TASK_ID"
  echo "2. 创建测试任务"
  echo "3. 使用数据库中已有的任务 ID"
  echo ""
  exit 1
else
  check_fail "无法检查任务 (HTTP $TASK_HTTP_CODE)"
  exit 1
fi

# 检查 Stream 历史数据
echo ""
echo "🔍 检查 Stream 历史数据..."

STREAM_RESPONSE=$(curl -s "$API_BASE/api/tasks/$TASK_ID/stream-history" 2>&1)
STREAM_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/tasks/$TASK_ID/stream-history" 2>&1)

if [ "$STREAM_HTTP_CODE" = "200" ]; then
  check_pass "Stream API 可访问"

  # 检查响应格式
  if echo "$STREAM_RESPONSE" | grep -q '"success":true'; then
    check_pass "API 响应格式正确"

    # 尝试获取数据条目数
    if echo "$STREAM_RESPONSE" | grep -q '"data"'; then
      # 简单检查是否有数据数组
      if echo "$STREAM_RESPONSE" | grep -E '\[\s*\{' | grep -q 'timestamp'; then
        check_pass "Stream 数据存在"

        # 尝试计算条目数（简单方法）
        ENTRY_COUNT=$(echo "$STREAM_RESPONSE" | grep -o '"timestamp"' | wc -l | tr -d ' ')
        echo "📊 数据条目数: $ENTRY_COUNT"

        if [ "$ENTRY_COUNT" -gt 0 ]; then
          check_pass "有 $ENTRY_COUNT 条 Stream 数据"
        else
          check_warn "Stream 数据为空"
        fi
      else
        check_warn "Stream 数据格式异常"
      fi
    else
      check_warn "API 响应中没有 data 字段"
    fi
  else
    check_warn "API 响应格式不符合预期"
  fi
elif [ "$STREAM_HTTP_CODE" = "404" ]; then
  check_warn "Stream 历史数据不存在 (404)"
  echo "💡 任务可能还没有执行记录"
else
  check_warn "无法获取 Stream 历史数据 (HTTP $STREAM_HTTP_CODE)"
fi

# 显示 API 响应（用于调试）
echo ""
echo "📋 Stream API 响应预览："
echo "$STREAM_RESPONSE" | head -c 500
echo "..."
echo ""

# 总结
echo "======================================"
echo "  数据准备检查完成"
echo "======================================"
echo ""

if [ "$TASK_HTTP_CODE" = "200" ] && [ "$STREAM_HTTP_CODE" = "200" ]; then
  check_pass "测试数据已就绪"
  echo ""
  echo "💡 可以运行测试："
  echo "   npm run test:message-display"
  echo ""
else
  check_warn "测试数据可能不完整"
  echo ""
  echo "💡 建议："
  echo "1. 检查任务是否已执行完成"
  echo "2. 检查 Stream 是否正确写入"
  echo "3. 查看后端日志了解详情"
  echo ""
fi

# 显示快速命令
echo "🚀 快速命令："
echo ""
echo "查看任务详情："
echo "  curl $API_BASE/api/tasks/$TASK_ID"
echo ""
echo "查看 Stream 历史："
echo "  curl $API_BASE/api/tasks/$TASK_ID/stream-history"
echo ""
echo "打开前端页面："
echo "  open http://localhost:5173/tasks/$TASK_ID"
echo ""
