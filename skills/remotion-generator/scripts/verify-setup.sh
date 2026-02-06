#!/bin/bash

###############################################################################
# Remotion 技能验证脚本
# 用于验证所有组件是否正确安装和配置
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 统计变量
PASS_COUNT=0
FAIL_COUNT=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Remotion 技能验证${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

###############################################################################
# 1. 检查脚本文件
###############################################################################

echo -e "${BLUE}[1/6] 检查脚本文件${NC}"

if [ -f "$SCRIPT_DIR/install-chrome.sh" ]; then
    check_pass "安装脚本存在: install-chrome.sh"
    if [ -x "$SCRIPT_DIR/install-chrome.sh" ]; then
        check_pass "安装脚本可执行"
    else
        check_fail "安装脚本无执行权限"
    fi
else
    check_fail "安装脚本不存在: install-chrome.sh"
fi

if [ -f "$SCRIPT_DIR/deploy-linux.sh" ]; then
    check_pass "部署脚本存在: deploy-linux.sh"
    if [ -x "$SCRIPT_DIR/deploy-linux.sh" ]; then
        check_pass "部署脚本可执行"
    else
        check_fail "部署脚本无执行权限"
    fi
else
    check_fail "部署脚本不存在: deploy-linux.sh"
fi

if [ -f "$SCRIPT_DIR/verify-setup.sh" ]; then
    check_pass "验证脚本存在: verify-setup.sh"
fi

echo ""

###############################################################################
# 2. 检查文档文件
###############################################################################

echo -e "${BLUE}[2/6] 检查文档文件${NC}"

if [ -f "$SKILL_DIR/README.md" ]; then
    check_pass "README.md 存在"
    if grep -q "install-chrome.sh" "$SKILL_DIR/README.md"; then
        check_pass "README.md 包含安装说明"
    else
        check_warn "README.md 可能缺少安装说明"
    fi
else
    check_fail "README.md 不存在"
fi

if [ -f "$SKILL_DIR/DEPLOYMENT.md" ]; then
    check_pass "DEPLOYMENT.md 存在"
else
    check_warn "DEPLOYMENT.md 不存在（可选）"
fi

echo ""

###############################################################################
# 3. 检查系统依赖
###############################################################################

echo -e "${BLUE}[3/6] 检查系统依赖${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    check_pass "Node.js 已安装: $NODE_VERSION"

    # 检查版本
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        check_pass "Node.js 版本符合要求 (>= 18)"
    else
        check_fail "Node.js 版本过低 (< 18)"
    fi
else
    check_fail "Node.js 未安装"
fi

if command -v npm &> /dev/null; then
    check_pass "npm 已安装: $(npm -v)"
else
    check_fail "npm 未安装"
fi

if command -v python3 &> /dev/null; then
    check_pass "Python3 已安装: $(python3 --version)"
else
    check_warn "Python3 未安装（可能需要）"
fi

if command -v curl &> /dev/null || command -v wget &> /dev/null; then
    check_pass "下载工具可用 (curl 或 wget)"
else
    check_fail "curl 或 wget 未安装"
fi

if command -v unzip &> /dev/null; then
    check_pass "unzip 已安装"
else
    check_fail "unzip 未安装"
fi

echo ""

###############################################################################
# 4. 检查 Node.js 依赖
###############################################################################

echo -e "${BLUE}[4/6] 检查 Node.js 依赖${NC}"

TEMPLATE_DIR="$SKILL_DIR/template"

if [ -d "$TEMPLATE_DIR" ]; then
    check_pass "Template 目录存在"

    if [ -f "$TEMPLATE_DIR/package.json" ]; then
        check_pass "package.json 存在"
    else
        check_fail "package.json 不存在"
    fi

    if [ -d "$TEMPLATE_DIR/node_modules" ]; then
        check_pass "node_modules 目录存在"

        if [ -d "$TEMPLATE_DIR/node_modules/remotion" ]; then
            REMOTION_VERSION=$(cd "$TEMPLATE_DIR" && npm list remotion 2>/dev/null | grep remotion | head -1 | awk '{print $2}' || echo "未知")
            check_pass "Remotion 已安装: $REMOTION_VERSION"
        else
            check_fail "Remotion 未安装"
        fi

        if [ -f "$TEMPLATE_DIR/node_modules/.bin/remotion" ]; then
            check_pass "Remotion CLI 可用"
        else
            check_warn "Remotion CLI 未找到"
        fi
    else
        check_fail "node_modules 不存在，需要运行 npm install"
    fi
else
    check_fail "Template 目录不存在"
fi

echo ""

###############################################################################
# 5. 检查 Chrome Headless Shell
###############################################################################

echo -e "${BLUE}[5/6] 检查 Chrome Headless Shell${NC}"

# 检测平台
if [ "$(uname -s)" = "Darwin" ]; then
    if [ "$(uname -m)" = "arm64" ]; then
        CHROME_SUBDIR="chrome-headless-shell-mac-arm64"
    else
        CHROME_SUBDIR="chrome-headless-shell-mac-x64"
    fi
else
    if [ "$(uname -m)" = "aarch64" ]; then
        CHROME_SUBDIR="chrome-headless-shell-linux-arm64"
    else
        CHROME_SUBDIR="chrome-headless-shell-linux64"
    fi
fi

CHROME_DIR="$TEMPLATE_DIR/node_modules/.remotion/chrome-headless-shell"
CHROME_BINARY="$CHROME_DIR/$CHROME_SUBDIR/chrome-headless-shell"

if [ -f "$CHROME_BINARY" ]; then
    check_pass "Chrome Headless Shell 存在"

    if [ -x "$CHROME_BINARY" ]; then
        check_pass "Chrome 二进制文件可执行"
    else
        check_fail "Chrome 二进制文件无执行权限"
    fi

    # 验证版本
    CHROME_VERSION=$("$CHROME_BINARY" --version 2>&1 || echo "无法获取版本")
    if [ -n "$CHROME_VERSION" ]; then
        check_pass "Chrome 版本: $CHROME_VERSION"
    else
        check_warn "无法验证 Chrome 版本"
    fi
else
    check_fail "Chrome Headless Shell 不存在"
    check_info "请运行: bash $SCRIPT_DIR/install-chrome.sh"
fi

echo ""

###############################################################################
# 6. 检查 handler.py
###############################################################################

echo -e "${BLUE}[6/6] 检查 handler.py${NC}"

HANDLER_FILE="$SKILL_DIR/handler.py"

if [ -f "$HANDLER_FILE" ]; then
    check_pass "handler.py 存在"

    if grep -q "import platform" "$HANDLER_FILE"; then
        check_pass "handler.py 导入 platform 模块"
    else
        check_fail "handler.py 未导入 platform 模块"
    fi

    if grep -q "_check_chrome_installation" "$HANDLER_FILE"; then
        check_pass "handler.py 包含 Chrome 检查方法"
    else
        check_fail "handler.py 缺少 Chrome 检查方法"
    fi

    if grep -q "self._chrome_binary" "$HANDLER_FILE"; then
        check_pass "handler.py 使用 Chrome 路径变量"
    else
        check_fail "handler.py 未使用 Chrome 路径变量"
    fi
else
    check_fail "handler.py 不存在"
fi

echo ""

###############################################################################
# 总结
###############################################################################

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}验证总结${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${GREEN}✓ 通过: $PASS_COUNT${NC}"
echo -e "${RED}✗ 失败: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}所有检查通过！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "下一步:"
    echo -e "  1. 测试视频生成功能"
    echo -e "  2. 在 Agent 中使用 remotion-generator skill"
    echo ""
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}发现 $FAIL_COUNT 个问题，请修复后再继续${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "常用修复命令:"
    echo -e "  bash $SCRIPT_DIR/install-chrome.sh          # 安装 Chrome"
    echo -e "  cd $TEMPLATE_DIR && npm install            # 安装 Node.js 依赖"
    echo -e "  bash $SCRIPT_DIR/deploy-linux.sh           # Linux 部署"
    echo ""
    exit 1
fi
