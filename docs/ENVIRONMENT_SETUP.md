# 环境配置指南

本文档说明了 Motia 项目所需的所有依赖和环境配置。

## 快速开始

一键安装所有依赖：

```bash
sudo bash scripts/setup-environment.sh
```

## 手动配置

如果自动脚本遇到问题，可以按照以下步骤手动配置：

### 1. 基础工具

```bash
sudo apt-get update
sudo apt-get install -y curl wget unzip postgresql-client redis-tools
```

### 2. Redis

#### 安装
```bash
sudo apt-get install -y redis-server
```

#### 启动
```bash
redis-server --daemonize yes
```

#### 验证
```bash
redis-cli ping
# 应返回: PONG
```

### 3. PostgreSQL

#### 安装
```bash
sudo apt-get install -y postgresql postgresql-contrib
```

#### 启动
```bash
sudo service postgresql start
```

#### 创建数据库和用户

编辑 `.env` 文件配置数据库：
```bash
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=myagent
PG_USER=leo
PG_PASSWORD=leo
```

创建数据库和用户：
```bash
# 创建数据库
sudo -u postgres createdb myagent

# 创建用户并授权
sudo -u postgres psql
```

在 psql 中执行：
```sql
CREATE USER leo WITH PASSWORD 'leo';
GRANT ALL PRIVILEGES ON DATABASE myagent TO leo;
\q
```

### 4. Chrome Headless Shell (Remotion 需要)

```bash
bash skills/remotion-generator/scripts/install-chrome.sh
```

### 5. Remotion 模板依赖

```bash
cd skills/remotion-generator/template
npm install
```

### 6. Python 虚拟环境

```bash
python3 -m venv python_modules
source python_modules/bin/activate
pip install -r requirements.txt  # 如果有
```

## 常见问题

### Q: Redis 连接失败
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
**解决:** 启动 Redis 服务
```bash
redis-server --daemonize yes
```

### Q: PostgreSQL 连接失败
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**解决:** 启动 PostgreSQL 服务
```bash
sudo service postgresql start
```

### Q: PostgreSQL 认证失败
```
password authentication failed for user "leo"
```
**解决:** 确保在 `.env` 中配置了正确的密码，并创建了对应用户

### Q: Chrome 未找到
```
Chrome Headless Shell not found
```
**解决:** 安装 Chrome Headless Shell
```bash
bash skills/remotion-generator/scripts/install-chrome.sh
```

### Q: Generators 模块导入失败
```
ModuleNotFoundError: No module named 'generators.llm_analyzer_v2'
```
**解决:** 确保已运行环境配置脚本，该脚本会修复 sys.path 配置

## 验证安装

运行以下命令验证所有依赖：

```bash
# Redis
redis-cli ping

# PostgreSQL
sudo -u postgres psql -c "SELECT version();"

# Chrome
ls skills/remotion-generator/template/node_modules/.remotion/chrome-headless-shell/

# 启动服务器
npm run dev
```

## Docker 方式（推荐用于生产环境）

如果不想手动配置，可以使用 Docker：

```bash
docker-compose up -d
```

这将启动：
- PostgreSQL
- Redis
- 应用服务器

## 系统要求

- **操作系统:** Ubuntu 22.04+ / WSL2
- **Node.js:** 20+
- **Python:** 3.11+
- **内存:** 至少 4GB RAM
- **磁盘:** 至少 10GB 可用空间

## 支持平台

- ✅ Linux (Ubuntu, Debian)
- ✅ WSL2 (Windows Subsystem for Linux)
- ✅ macOS (需要调整某些路径)

## 相关文档

- [开发指南](./DEVELOPMENT.md)
- [部署指南](./DEPLOYMENT.md)
- [故障排除](./TROUBLESHOOTING.md)
