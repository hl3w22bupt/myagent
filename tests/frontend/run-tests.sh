#!/bin/bash

# Playwright 前端测试运行脚本
# 用于验证任务详情页的消息显示功能

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../motia-frontend" && pwd)"
cd "$FRONTEND_DIR"

echo "======================================"
echo "  前端消息显示测试 - Playwright"
echo "======================================"
echo ""

# 检查依赖
echo "📦 检查依赖..."
if [ ! -d "node_modules/playwright" ]; then
  echo "⚠️  Playwright 未安装，正在安装..."
  npx playwright install
fi

# 创建截图目录
echo "📁 创建截图目录..."
mkdir -p "$SCRIPT_DIR/screenshots"

# 设置环境变量
export BASE_URL=${BASE_URL:-"http://localhost:5173"}
export TASK_ID=${TASK_ID:-"task-1769754178517-1"}

echo ""
echo "⚙️  配置:"
echo "   BASE_URL: $BASE_URL"
echo "   TASK_ID: $TASK_ID"
echo ""

# 检查前端开发服务器是否运行
echo "🔍 检查前端服务器..."
if curl -s "$BASE_URL" > /dev/null 2>&1; then
  echo "✅ 前端服务器正在运行"
else
  echo "❌ 前端服务器未运行"
  echo "💡 请先启动前端服务器: cd motia-frontend && npm run dev"
  exit 1
fi

# 检查后端 API 是否运行
echo "🔍 检查后端 API..."
if curl -s "http://localhost:3000/api/health" > /dev/null 2>&1; then
  echo "✅ 后端 API 正在运行"
else
  echo "❌ 后端 API 未运行"
  echo "💡 请先启动后端服务器: npm run dev"
  exit 1
fi

echo ""
echo "🚀 开始运行测试..."
echo ""

# 运行测试
npx playwright test "$SCRIPT_DIR/message-display.spec.js" \
  --config="$SCRIPT_DIR/playwright.config.js" \
  --headed=${HEADED:-false} \
  "$@"

echo ""
echo "======================================"
echo "  测试完成"
echo "======================================"
echo ""
echo "📸 截图位置: $SCRIPT_DIR/screenshots/"
echo "📊 测试报告: $FRONTEND_DIR/playwright-report/index.html"
echo ""
echo "💡 查看测试报告:"
echo "   npx playwright show-report $FRONTEND_DIR/playwright-report"
echo ""
