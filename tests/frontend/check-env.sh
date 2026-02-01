#!/bin/bash

# 环境检查脚本 - 验证测试前置条件

echo "======================================"
echo "  前端测试环境检查"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
  echo -e "${GREEN}✅ $1${NC}"
}

check_fail() {
  echo -e "${RED}❌ $1${NC}"
}

check_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

check_info() {
  echo -e "ℹ️  $1"
}

# 检查 Node.js
echo "📦 检查 Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  check_pass "Node.js 已安装: $NODE_VERSION"
else
  check_fail "Node.js 未安装"
  exit 1
fi

# 检查 npm
echo ""
echo "📦 检查 npm..."
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm -v)
  check_pass "npm 已安装: $NPM_VERSION"
else
  check_fail "npm 未安装"
  exit 1
fi

# 检查 Playwright
echo ""
echo "🎭 检查 Playwright..."
cd "$(dirname "$0")/../../motia-frontend"
if [ -d "node_modules/playwright" ]; then
  check_pass "Playwright 已安装"
else
  check_warn "Playwright 未安装"
  check_info "运行: npx playwright install"
fi

# 检查前端服务器
echo ""
echo "🌐 检查前端服务器..."
FRONTEND_URL=${BASE_URL:-"http://localhost:5173"}
if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
  check_pass "前端服务器正在运行: $FRONTEND_URL"
else
  check_fail "前端服务器未运行: $FRONTEND_URL"
  check_info "请启动: cd motia-frontend && npm run dev"
fi

# 检查后端 API
echo ""
echo "🔌 检查后端 API..."
BACKEND_URL="http://localhost:3000"
if curl -s "$BACKEND_URL/api/health" > /dev/null 2>&1; then
  check_pass "后端 API 正在运行: $BACKEND_URL"
elif curl -s "$BACKEND_URL" > /dev/null 2>&1; then
  check_pass "后端服务器正在运行: $BACKEND_URL"
else
  check_fail "后端 API 未运行: $BACKEND_URL"
  check_info "请启动: npm run dev"
fi

# 检查测试文件
echo ""
echo "📄 检查测试文件..."
TEST_DIR="$(dirname "$0")"
if [ -f "$TEST_DIR/message-display.spec.js" ]; then
  check_pass "测试文件存在: message-display.spec.js"
else
  check_fail "测试文件不存在: message-display.spec.js"
fi

if [ -f "$TEST_DIR/playwright.config.js" ]; then
  check_pass "配置文件存在: playwright.config.js"
else
  check_fail "配置文件不存在: playwright.config.js"
fi

# 检查截图目录
echo ""
echo "📁 检查截图目录..."
SCREENSHOT_DIR="$TEST_DIR/screenshots"
if [ -d "$SCREENSHOT_DIR" ]; then
  check_pass "截图目录存在: $SCREENSHOT_DIR"
else
  check_warn "截图目录不存在，将在首次运行时创建"
  mkdir -p "$SCREENSHOT_DIR"
  check_info "已创建截图目录"
fi

# 检查测试任务（可选）
echo ""
echo "🔍 检查测试任务数据..."
TASK_ID=${TASK_ID:-"task-1769754178517-1"}
TASK_API_URL="http://localhost:3000/api/tasks/$TASK_ID/stream-history"

if curl -s "$TASK_API_URL" > /dev/null 2>&1; then
  RESPONSE=$(curl -s "$TASK_API_URL")
  check_pass "任务数据可访问: $TASK_ID"

  # 尝试解析数据条目数
  if echo "$RESPONSE" | grep -q '"success":true'; then
    check_info "任务 API 返回成功"
  fi
else
  check_warn "无法访问任务数据: $TASK_ID"
  check_info "测试可能会失败，请确保任务存在"
fi

# 总结
echo ""
echo "======================================"
echo "  环境检查完成"
echo "======================================"
echo ""
echo "💡 如果所有检查都通过，可以运行测试："
echo "   tests/frontend/run-tests.sh"
echo ""
echo "💡 如果有检查失败，请按照提示修复后再运行测试"
echo ""
