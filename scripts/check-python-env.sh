#!/bin/bash
# Python 环境检查和自动安装脚本

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_MODULES="$PROJECT_ROOT/python_modules"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Python 环境检查${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查 python_modules 是否存在
if [ ! -d "$PYTHON_MODULES" ]; then
    echo -e "${YELLOW}⚠ Python 虚拟环境不存在，正在创建...${NC}"
    python3 -m venv "$PYTHON_MODULES"
    echo -e "${GREEN}✓ 虚拟环境创建完成${NC}"
else
    echo -e "${GREEN}✓ Python 虚拟环境已存在${NC}"
fi

# 检查 Python 可执行文件
PYTHON_BIN="$PYTHON_MODULES/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    echo -e "${RED}✗ Python 可执行文件不存在: $PYTHON_BIN${NC}"
    exit 1
fi

# 检查关键依赖
echo -e "${YELLOW}检查 Python 依赖...${NC}"

MISSING_DEPS=0

# 检查 yaml 模块（关键依赖，如果缺失会导致 sandbox 执行失败）
if ! $PYTHON_BIN -c "import yaml" 2>/dev/null; then
    echo -e "${RED}✗ 缺少依赖: pyyaml${NC}"
    MISSING_DEPS=1
else
    echo -e "${GREEN}✓ pyyaml 已安装${NC}"
fi

# 检查其他关键依赖
KEY_DEPS=("pydantic" "anthropic" "httpx" "aiohttp" "psycopg2" "dotenv")
for dep in "${KEY_DEPS[@]}"; do
    if $PYTHON_BIN -c "import $dep" 2>/dev/null; then
        echo -e "${GREEN}✓ $dep 已安装${NC}"
    else
        echo -e "${YELLOW}⚠ 缺少依赖: $dep${NC}"
        MISSING_DEPS=1
    fi
done

echo ""

# 如果缺少依赖，自动安装
if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${YELLOW}正在安装 Python 依赖...${NC}"
    "$PYTHON_MODULES/bin/pip" install --upgrade pip
    "$PYTHON_MODULES/bin/pip" install -r "$PROJECT_ROOT/requirements.txt"
    echo -e "${GREEN}✓ 依赖安装完成${NC}"
else
    echo -e "${GREEN}✓ 所有依赖已安装${NC}"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ Python 环境检查完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Python 路径: $PYTHON_BIN"
echo "版本: $($PYTHON_BIN --version)"
echo ""
