#!/bin/bash
# 环境依赖自动安装脚本
# 解决所有常见的环境配置问题

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}   Motia 项目环境自动配置脚本${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用 sudo 运行此脚本${NC}"
    exit 1
fi

# =============================================
# 1. 安装基础工具
# =============================================
echo -e "${YELLOW}[1/6] 安装基础工具...${NC}"
apt-get update -qq
apt-get install -y -qq curl wget unzip postgresql-client redis-tools > /dev/null 2>&1
echo -e "${GREEN}✓ 基础工具安装完成${NC}"
echo ""

# =============================================
# 2. Redis 安装和启动
# =============================================
echo -e "${YELLOW}[2/6] 配置 Redis...${NC}"
if ! command -v redis-server &> /dev/null; then
    apt-get install -y -qq redis-server > /dev/null 2>&1
    echo -e "${GREEN}✓ Redis 安装完成${NC}"
else
    echo -e "${GREEN}✓ Redis 已安装${NC}"
fi

if ! pgrep -x "redis-server" > /dev/null; then
    redis-server --daemonize yes
    echo -e "${GREEN}✓ Redis 已启动${NC}"
else
    echo -e "${GREEN}✓ Redis 已在运行${NC}"
fi

# 测试 Redis 连接
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Redis 连接正常${NC}"
else
    echo -e "${RED}✗ Redis 连接失败${NC}"
    exit 1
fi
echo ""

# =============================================
# 3. PostgreSQL 安装和配置
# =============================================
echo -e "${YELLOW}[3/6] 配置 PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    apt-get install -y -qq postgresql postgresql-contrib > /dev/null 2>&1
    echo -e "${GREEN}✓ PostgreSQL 安装完成${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL 已安装${NC}"
fi

# 启动 PostgreSQL
if ! pgrep -x "postgres" > /dev/null; then
    service postgresql start
    echo -e "${GREEN}✓ PostgreSQL 已启动${NC}"
else
    echo -e "${GREEN}✓ PostgreSQL 已在运行${NC}"
fi

# 读取 .env 配置
DB_NAME=$(grep "^PG_DATABASE=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2)
DB_USER=$(grep "^PG_USER=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2)
DB_PASS=$(grep "^PG_PASSWORD=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2)

# 设置默认值
DB_NAME=${DB_NAME:-myagent}
DB_USER=${DB_USER:-leo}
DB_PASS=${DB_PASS:-leo}

# 创建数据库和用户
echo -e "${YELLOW}  创建数据库和用户...${NC}"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo -e "${GREEN}  ✓ 数据库 $DB_NAME 已存在${NC}"

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null || echo -e "${GREEN}  ✓ 用户 $DB_USER 已存在${NC}"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null

echo -e "${GREEN}✓ PostgreSQL 配置完成${NC}"
echo "  数据库: $DB_NAME"
echo "  用户: $DB_USER"
echo ""

# =============================================
# 4. Chrome Headless Shell (Remotion 需要)
# =============================================
echo -e "${YELLOW}[4/6] 安装 Chrome Headless Shell...${NC}"
CHROME_SCRIPT="$PROJECT_ROOT/skills/remotion-generator/scripts/install-chrome.sh"
if [ -f "$CHROME_SCRIPT" ]; then
    bash "$CHROME_SCRIPT" > /dev/null 2>&1
    echo -e "${GREEN}✓ Chrome Headless Shell 安装完成${NC}"
else
    echo -e "${YELLOW}⚠ Chrome 安装脚本未找到，跳过${NC}"
fi
echo ""

# =============================================
# 5. Remotion 模板依赖
# =============================================
echo -e "${YELLOW}[5/6] 安装 Remotion 模板依赖...${NC}"
TEMPLATE_DIR="$PROJECT_ROOT/skills/remotion-generator/template"
if [ -d "$TEMPLATE_DIR" ]; then
    cd "$TEMPLATE_DIR"
    if [ ! -d "node_modules" ]; then
        npm install --silent
        echo -e "${GREEN}✓ Remotion 依赖安装完成${NC}"
    else
        echo -e "${GREEN}✓ Remotion 依赖已安装${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Remotion 模板目录未找到，跳过${NC}"
fi
echo ""

# =============================================
# 6. Python 依赖
# =============================================
echo -e "${YELLOW}[6/6] 检查 Python 依赖...${NC}"
PYTHON_MODULES="$PROJECT_ROOT/python_modules"
if [ ! -d "$PYTHON_MODULES" ]; then
    echo -e "${YELLOW}⚠ Python 虚拟环境未找到，运行: python3 -m venv python_modules${NC}"
else
    echo -e "${GREEN}✓ Python 虚拟环境已存在${NC}"
fi
echo ""

# =============================================
# 完成
# =============================================
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ 环境配置完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "现在可以运行:"
echo "  npm run dev"
echo ""
echo "访问:"
echo "  http://localhost:3000 - API 服务器"
echo "  http://localhost:5173 - 前端界面"
echo ""
