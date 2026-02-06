#!/bin/bash

###############################################################################
# Linux 生产环境部署脚本
# 用于在 Linux 服务器上部署 Remotion 视频生成技能
###############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否为 Linux
if [ "$(uname -s)" != "Linux" ]; then
    log_error "此脚本仅用于 Linux 环境"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Remotion 视频生成技能 - Linux 部署脚本"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""

###############################################################################
# 步骤 1: 检查系统依赖
###############################################################################

log_step "步骤 1/5: 检查系统依赖"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js 未安装"
    log_info "请安装 Node.js 18+ 版本"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js 版本过低: $(node -v)，需要 18+ 版本"
    exit 1
fi
log_info "✓ Node.js 版本: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    log_error "npm 未安装"
    exit 1
fi
log_info "✓ npm 版本: $(npm -v)"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    log_warn "Python3 未安装，可能需要安装"
fi

# 检查 curl 或 wget
if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    log_error "curl 或 wget 未安装"
    log_info "请安装: sudo apt-get install curl (Ubuntu/Debian)"
    log_info "        sudo yum install curl (CentOS/RHEL)"
    exit 1
fi
log_info "✓ 下载工具可用"

# 检查 unzip
if ! command -v unzip &> /dev/null; then
    log_warn "unzip 未安装，正在尝试安装..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y unzip
    elif command -v yum &> /dev/null; then
        sudo yum install -y unzip
    else
        log_error "无法自动安装 unzip，请手动安装"
        exit 1
    fi
fi
log_info "✓ unzip 可用"

log_info ""

###############################################################################
# 步骤 2: 安装 Node.js 依赖
###############################################################################

log_step "步骤 2/5: 安装 Node.js 依赖"

cd "$SKILL_DIR/template"

if [ ! -f "package.json" ]; then
    log_error "package.json 不存在于: $SKILL_DIR/template"
    exit 1
fi

log_info "运行 npm install..."
npm install

log_info "✓ Node.js 依赖安装完成"
log_info ""

###############################################################################
# 步骤 3: 安装 Chrome Headless Shell
###############################################################################

log_step "步骤 3/5: 安装 Chrome Headless Shell"

cd "$SKILL_DIR"
bash scripts/install-chrome.sh

log_info ""

###############################################################################
# 步骤 4: 配置环境变量（可选）
###############################################################################

log_step "步骤 4/5: 配置环境变量"

ENV_FILE="$SKILL_DIR/.env.production"

cat > "$ENV_FILE" << 'EOF'
# Remotion 生产环境配置
NODE_ENV=production

# Chrome 配置
CHROME_EXECUTABLE_PATH=
BROWSER_EXECUTABLE_PATH=
PUPPETEER_EXECUTABLE_PATH=

# 跳过 Chrome 下载
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_SKIP_DOWNLOAD=true
CHROME_SKIP_DOWNLOAD=true
EOF

log_info "✓ 已创建 .env.production 文件"
log_info "  路径: $ENV_FILE"
log_info "  提示: 如果需要自定义配置，请编辑此文件"
log_info ""

###############################################################################
# 步骤 5: 验证安装
###############################################################################

log_step "步骤 5/5: 验证安装"

# 验证 Chrome
log_info "验证 Chrome 安装..."
bash scripts/install-chrome.sh --verify

# 验证 Remotion CLI
log_info "验证 Remotion CLI..."
REMENTION_CLI="$SKILL_DIR/template/node_modules/.bin/remotion"
if [ -f "$REMENTION_CLI" ]; then
    log_info "✓ Remotion CLI 可用"
else
    log_warn "Remotion CLI 未找到，可能需要重新安装依赖"
fi

log_info ""

###############################################################################
# 完成
###############################################################################

log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "✓ 部署完成！"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info ""
log_info "系统信息:"
log_info "  操作系统: $(uname -s) $(uname -r)"
log_info "  架构: $(uname -m)"
log_info "  Node.js: $(node -v)"
log_info "  npm: $(npm -v)"
log_info ""
log_info "安装位置:"
log_info "  技能目录: $SKILL_DIR"
log_info "  Chrome: $(bash scripts/install-chrome.sh --verify 2>&1 | grep '安装路径' | cut -d' ' -f4-)"
log_info ""
log_info "下一步:"
log_info "  1. 测试视频生成功能"
log_info "  2. 配置你的 Agent 使用 remotion-generator skill"
log_info "  3. 监控磁盘空间（视频渲染可能产生临时文件）"
log_info ""
log_warn "注意:"
log_info "  - 确保有足够的磁盘空间（至少 1GB）"
log_info "  - 定期清理临时文件: rm -rf template/.cache"
log_info "  - 如果渲染失败，检查 Chrome 和 Remotion 日志"
log_info ""
