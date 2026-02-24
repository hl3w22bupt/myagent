#!/bin/bash

###############################################################################
# Chrome Headless Shell 安装脚本
# 用于 Remotion 视频渲染
# 支持：macOS (x64/arm64), Linux (x64/arm64)
###############################################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Chrome Headless Shell 版本（与 Remotion 4.0.227 匹配）
CHROME_VERSION="134.0.6998.35"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(dirname "$SCRIPT_DIR")"

# 安装目标目录（安装到 template/node_modules，而不是技能根目录）
INSTALL_DIR="$TEMPLATE_DIR/template/node_modules/.remotion/chrome-headless-shell"

# 下载基地址
DOWNLOAD_BASE="https://storage.googleapis.com/chrome-for-testing-public"

###############################################################################
# 辅助函数
###############################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检测操作系统和架构
detect_platform() {
    local os
    local arch

    # 检测操作系统
    case "$(uname -s)" in
        Darwin)
            os="mac"
            ;;
        Linux)
            os="linux"
            ;;
        *)
            log_error "不支持的操作系统: $(uname -s)"
            exit 1
            ;;
    esac

    # 检测架构
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            log_error "不支持的系统架构: $(uname -m)"
            exit 1
            ;;
    esac

    # 生成平台标识
    if [ "$os" = "mac" ]; then
        if [ "$arch" = "arm64" ]; then
            echo "mac-arm64"
        else
            echo "mac-x64"
        fi
    else
        if [ "$arch" = "arm64" ]; then
            echo "linux-arm64"
        else
            echo "linux64"
        fi
    fi
}

# 获取 Chrome 子目录名
get_chrome_subdir() {
    local platform=$1
    case "$platform" in
        mac-x64)
            echo "chrome-headless-shell-mac-x64"
            ;;
        mac-arm64)
            echo "chrome-headless-shell-mac-arm64"
            ;;
        linux64)
            echo "chrome-headless-shell-linux64"
            ;;
        linux-arm64)
            echo "chrome-headless-shell-linux-arm64"
            ;;
        *)
            echo ""
            ;;
    esac
}

# 验证安装
verify_installation() {
    local platform=$1
    local chrome_binary
    local subdir

    subdir=$(get_chrome_subdir "$platform")

    if [ -z "$subdir" ]; then
        log_error "未知平台: $platform"
        return 1
    fi

    # Chrome 解压后直接在 INSTALL_DIR 下
    chrome_binary="$INSTALL_DIR/$subdir/chrome-headless-shell"

    if [ ! -f "$chrome_binary" ]; then
        log_error "Chrome 二进制文件不存在: $chrome_binary"
        return 1
    fi

    if [ ! -x "$chrome_binary" ]; then
        log_warn "Chrome 二进制文件不可执行，正在设置权限..."
        chmod +x "$chrome_binary"
    fi

    # 尝试运行 Chrome 以验证
    local version_output
    version_output=$("$chrome_binary" --version 2>&1 || true)

    if [ -n "$version_output" ]; then
        log_info "✓ Chrome 验证成功: $version_output"
        log_info "✓ 安装路径: $chrome_binary"
        return 0
    else
        log_error "Chrome 验证失败"
        return 1
    fi
}

###############################################################################
# 主安装流程
###############################################################################

install_chrome() {
    local platform
    local download_url
    local zip_file
    local temp_dir

    log_info "开始安装 Chrome Headless Shell..."
    log_info "目标目录: $INSTALL_DIR"

    # 检测平台
    platform=$(detect_platform)
    log_info "检测到平台: $platform"

    # 创建安装目录
    mkdir -p "$INSTALL_DIR"

    # 构建下载 URL
    download_url="$DOWNLOAD_BASE/$CHROME_VERSION/$platform/chrome-headless-shell-$platform.zip"
    log_info "下载地址: $download_url"

    # 创建临时目录
    temp_dir=$(mktemp -d)
    zip_file="$temp_dir/chrome-headless-shell.zip"

    # 下载 Chrome
    log_info "正在下载 Chrome Headless Shell..."
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$zip_file" "$download_url" --retry 3 --retry-delay 5
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$zip_file" "$download_url" --tries=3 --waitretry=5
    else
        log_error "未找到 curl 或 wget 命令"
        exit 1
    fi

    # 解压到目标目录
    log_info "正在解压..."
    unzip -q "$zip_file" -d "$INSTALL_DIR"

    # 设置可执行权限
    log_info "设置可执行权限..."
    find "$INSTALL_DIR" -type f -name "chrome-headless-shell" -exec chmod +x {} \;

    # 清理临时文件
    rm -rf "$temp_dir"

    log_info "✓ 下载完成"
}

###############################################################################
# 主程序
###############################################################################

main() {
    # 解析命令行参数
    local verify_only=false
    local platform=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --verify)
                verify_only=true
                shift
                ;;
            --platform)
                platform="$2"
                shift 2
                ;;
            --help|-h)
                echo "用法: $0 [选项]"
                echo ""
                echo "选项:"
                echo "  --verify    仅验证安装，不下载"
                echo "  --platform   指定平台（mac-x64, mac-arm64, linux64, linux-arm64）"
                echo "  --help, -h   显示此帮助信息"
                echo ""
                echo "示例:"
                echo "  $0                    # 自动检测并安装"
                echo "  $0 --verify           # 验证当前安装"
                echo "  $0 --platform linux64 # 指定平台安装"
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                echo "使用 --help 查看帮助"
                exit 1
                ;;
        esac
    done

    # 如果未指定平台，则自动检测
    if [ -z "$platform" ]; then
        platform=$(detect_platform)
    fi

    # 验证模式
    if [ "$verify_only" = true ]; then
        log_info "验证 Chrome 安装..."
        if verify_installation "$platform"; then
            log_info "✓ Chrome 安装有效"
            exit 0
        else
            log_error "✗ Chrome 安装无效或不存在"
            exit 1
        fi
    fi

    # 安装模式
    # 先检查是否已安装
    if verify_installation "$platform"; then
        log_info "Chrome 已安装，跳过安装步骤"
        chrome_binary="$INSTALL_DIR/$(get_chrome_subdir "$platform")/chrome-headless-shell"
        log_info "当前版本: $("$(readlink -f "$chrome_binary")" --version 2>&1)"
    else
        log_info "Chrome 未安装，开始安装..."
        install_chrome
    fi

    # 验证安装
    log_info "验证安装..."
    if verify_installation "$platform"; then
        log_info ""
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "✓ Chrome Headless Shell 安装成功！"
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info ""
        log_info "平台: $platform"
        log_info "版本: $CHROME_VERSION"
        log_info "目录: $INSTALL_DIR"
        log_info ""
        log_info "现在可以使用 Remotion 生成视频了！"
        log_info ""
    else
        log_error "✗ Chrome 安装验证失败"
        exit 1
    fi
}

# 运行主程序
main "$@"
