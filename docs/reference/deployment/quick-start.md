# 快速部署

> 5 分钟启动 MyAgent 系统

**阅读时间**: 3 分钟 | **难度**: ⭐ beginner

---

## 🚀 快速开始

### 前置要求

- Node.js >= 18
- Python >= 3.10
- PostgreSQL >= 14

### 1. 安装依赖

```bash
git clone https://github.com/your-org/myagent.git
cd myagent
npm install
```

### 2. 配置环境

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必要的 API Key：

```bash
# 必需配置
LLM_API_KEY=sk-ant-xxx

# 数据库配置
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myagent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
```

### 3. 初始化数据库

```bash
npm run db:setup
```

### 4. 启动服务

```bash
npm run start
```

服务将在 http://localhost:3000 启动。

### 5. 测试

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "你好"}'
```

---

## ✅ 验证安装

```bash
# 健康检查
curl http://localhost:3000/health

# 应该返回
# {"status":"ok"}
```

---

## 📖 下一步

- [环境准备](environment-setup.md) - 详细环境配置
- [配置说明](configuration.md) - 135个配置项详解

---

**版本**: v1.0 | **更新日期**: 2026-03-29
