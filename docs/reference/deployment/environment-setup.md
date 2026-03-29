# 环境准备

> 详细的环境配置指南

**阅读时间**: 5 分钟 | **难度**: ⭐ beginner

---

## 📦 依赖安装

### Node.js

```bash
# macOS
brew install node@18

# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证
node --version  # 应该 >= 18
npm --version
```

### Python

```bash
# macOS
brew install python@3.10

# Ubuntu
sudo apt-get update
sudo apt-get install python3.10 python3-pip

# 验证
python3 --version  # 应该 >= 3.10
```

### PostgreSQL

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu
sudo apt-get install postgresql-14

# 验证
psql --version  # 应该 >= 14
```

---

## 🗄️ 数据库设置

### 创建数据库

```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE myagent;

# 创建用户
CREATE USER myagent WITH PASSWORD 'your-password';

# 授权
GRANT ALL PRIVILEGES ON DATABASE myagent TO myagent;

# 退出
\q
```

---

## 🔧 系统依赖

### macOS

```bash
# 安装 pgvector
brew install pgvector
```

### Ubuntu

```bash
# 安装构建工具
sudo apt-get install build-essential

# 安装 pgvector
git clone --branch v0.5.0 https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install
```

---

## 🔐 权限设置

```bash
# 给予 Python 脚本执行权限
chmod +x scripts/*.sh

# 给予 Python 模块访问权限
chmod -R 755 python_modules/
```

---

## 📖 下一步

- [配置说明](configuration.md) - 详细配置指南
- [快速部署](quick-start.md) - 启动系统

---

**版本**: v1.0 | **更新日期**: 2026-03-29
