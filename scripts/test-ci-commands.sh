#!/bin/bash
# 本地 CI 测试脚本 - 验证所有 GitHub Actions 命令在本地能够正常运行

set -e

echo "🚀 开始本地 CI 测试..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
PASSED=0
FAILED=0

# 测试函数
test_command() {
    local name="$1"
    local command="$2"

    echo -n "测试: $name... "

    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 通过${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ 失败${NC}"
        ((FAILED++))
        return 1
    fi
}

# 1. TypeScript 类型检查
echo "📝 TypeScript 检查"
test_command "TypeScript 类型检查" "npx tsc --noEmit"
echo ""

# 2. ESLint 检查
echo "🔍 ESLint 检查"
test_command "ESLint" "npm run lint"
echo ""

# 3. Jest 测试
echo "🧪 Jest 测试"
test_command "Jest 测试套件" "npm run test -- --passWithNoTests --maxWorkers=1"
echo ""

# 4. TypeScript 构建
echo "🏗️  TypeScript 构建"
test_command "TypeScript 构建" "npm run build:ts"
echo ""

# 5. Motia 类型生成
echo "⚙️  Motia 配置"
test_command "Motia 类型生成" "npm run generate-types"
echo ""

# 6. 清理构建文件
echo "🧹 清理..."
rm -rf dist
echo "✓ 清理完成"
echo ""

# 总结
echo "================================"
echo "测试总结:"
echo -e "${GREEN}通过: $PASSED${NC}"
echo -e "${RED}失败: $FAILED${NC}"
echo "================================"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 所有 CI 测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 有 $FAILED 个测试失败${NC}"
    exit 1
fi
