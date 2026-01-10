#!/bin/bash
# GitHub Actions CI 本地验证脚本
# 使用方法: ./scripts/ci-check.sh

set -e

echo "🔍 运行 GitHub Actions CI 检查..."
echo ""

PASSED=0
FAILED=0
WARNINGS=0

# TypeScript 类型检查
echo -n "1. TypeScript 类型检查... "
if npx tsc --noEmit 2>&1 > /dev/null; then
  echo "✅"
  ((PASSED++))
else
  echo "❌"
  ((FAILED++))
fi

# ESLint 检查
echo -n "2. ESLint 检查... "
if npm run lint 2>&1 | grep -q "0 errors"; then
  echo "✅"
  ((PASSED++))
else
  echo "⚠️  (有警告)"
  ((WARNINGS++))
fi

# Prettier 检查
echo -n "3. Prettier 格式检查... "
if npx prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}" 2>&1 | grep -q "All matched files"; then
  echo "✅"
  ((PASSED++))
else
  echo "⚠️  (需要格式化)"
  ((WARNINGS++))
fi

# console.log 检查
echo -n "4. console.log 检查... "
if ! grep -r "console\.log" src/ --include="*.ts" --include="*.tsx" > /dev/null 2>&1; then
  echo "✅"
  ((PASSED++))
else
  echo "❌"
  ((FAILED++))
fi

# TODO 检查
echo -n "5. TODO 注释检查... "
if ! grep -r "TODO\|FIXME\|XXX" src/ --include="*.ts" --include="*.tsx" > /dev/null 2>&1; then
  echo "✅"
  ((PASSED++))
else
  echo "⚠️  (有 TODO)"
  ((WARNINGS++))
fi

# 构建检查
echo -n "6. 构建检查... "
if npm run build:ts > /dev/null 2>&1; then
  echo "✅"
  ((PASSED++))
else
  echo "❌"
  ((FAILED++))
fi

# Motia 类型生成
echo -n "7. Motia 类型生成... "
if npm run generate-types > /dev/null 2>&1; then
  echo "✅"
  ((PASSED++))
else
  echo "❌"
  ((FAILED++))
fi

echo ""
echo "════════════════════════════════════"
echo "  通过: $PASSED  |  警告: $WARNINGS  |  失败: $FAILED"
echo "════════════════════════════════════"

if [ $FAILED -eq 0 ]; then
  echo "✅ CI 检查通过！可以推送代码。"
  exit 0
else
  echo "❌ CI 检查失败！请修复问题后再推送。"
  exit 1
fi
