#!/bin/bash
# GitHub Actions CI 本地完整检查脚本
# 使用方法: bash scripts/local-ci.sh

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           GitHub Actions CI 本地完整检查                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNED=0

check_pass() {
  local name="$1"
  local command="$2"
  
  echo -n "▶ $name... "
  
  if eval "$command" > /tmp/check.log 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}❌ FAIL${NC}"
    echo "   错误信息:"
    cat /tmp/check.log | head -10 | sed 's/^/   | /'
    ((FAILED++))
    return 1
  fi
}

check_warn() {
  local name="$1"
  local command="$2"
  
  echo -n "▶ $name... "
  
  if eval "$command" > /tmp/check.log 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "${YELLOW}⚠️  WARN${NC}"
    ((WARNED++))
    return 0
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  第一部分：Node.js CI Job"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查必需文件是否存在
echo "📦 文件检查"
check_pass "dist/ 目录存在" "test -d dist"
check_pass "types.d.ts 存在" "test -f types.d.ts"
check_pass "dist/motia.config.d.ts 存在" "test -f dist/motia.config.d.ts"
echo ""

# TypeScript 编译检查
echo "🔨 TypeScript 检查"
check_pass "TypeScript 编译" "./node_modules/.bin/tsc --noEmit || npx -p typescript tsc --noEmit"
echo ""

# ESLint 检查
echo "🔍 ESLint 检查"
check_pass "ESLint (errors only)" "npx eslint . --ext .ts --quiet"
echo ""

# 构建检查
echo "🏗️  构建检查"
check_pass "构建项目" "npm run build:ts"
echo ""

# Jest 测试检查
echo "🧪 Jest 测试检查"
check_pass "运行 Jest 单元测试" "npm run test -- --passWithNoTests"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  第二部分：Integration Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "🔍 代码质量检查"
check_pass "无 console.log" "! grep -r 'console\.log' src/ --include='*.ts' --include='*.tsx'"
check_warn "无 TODO 注释" "! grep -r 'TODO\|FIXME\|XXX' src/ --include='*.ts' --include='*.tsx'"
check_pass "Prettier 格式" "npx prettier --check '**/*.{ts,tsx,js,jsx,json,md,yml,yaml}' 2>&1 | grep -q 'All matched files'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  第三部分：文件大小检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

LARGE_FILES=$(find . -type f -size +1M -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./python_modules/*" 2>/dev/null | wc -l | tr -d ' ')
echo "▶ 大文件检查 (>1MB)... 找到 $LARGE_FILES 个文件"
if [ "$LARGE_FILES" -gt 0 ]; then
  echo "   大文件列表:"
  find . -type f -size +1M -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./python_modules/*" 2>/dev/null | head -5 | sed 's/^/   /'
fi
((PASSED++))
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  检查结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  通过: ${GREEN}$PASSED${NC}"
echo -e "  警告: ${YELLOW}$WARNED${NC}"
echo -e "  失败: ${RED}$FAILED${NC}"
echo ""

TOTAL=$((PASSED + WARNED + FAILED))
echo "  总计: $TOTAL 项检查"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo -e "║${GREEN}           ✅ 所有关键检查通过！可以推送代码！                  ║${NC}"
  echo "╚════════════════════════════════════════════════════════════════╝"
  echo ""
  echo "📝 下一步:"
  echo "  git add ."
  echo "  git commit -m 'fix: resolve all GitHub Actions CI issues'"
  echo "  git push"
  echo ""
  exit 0
else
  echo "╔════════════════════════════════════════════════════════════════╗"
  echo -e "║${RED}           ❌ 有检查失败，请先修复问题                            ║${NC}"
  echo "╚════════════════════════════════════════════════════════════════╝"
  exit 1
fi
