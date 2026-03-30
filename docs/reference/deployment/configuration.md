# 配置说明

> .env 文件的 135 个配置项详解

**阅读时间**: 10 分钟 | **难度**: ⭐⭐ intermediate

---

## 📋 配置概览

`.env` 文件包含 5 大类配置：

| 类别 | 配置项数量 | 说明 |
|------|-----------|------|
| **LLM 配置** | 15 | 大模型配置 |
| **数据库配置** | 20 | PostgreSQL 配置 |
| **沙箱配置** | 25 | Python 沙箱配置 |
| **知识库配置** | 35 | RAG 系统配置 |
| **系统配置** | 40 | 其他系统配置 |

---

## 🤖 LLM 配置

### 必需配置

```bash
# API Key
ANTHROPIC_API_KEY=sk-ant-xxx

# LLM 提供商
DEFAULT_LLM_PROVIDER=anthropic  # anthropic | openai-compatible

# LLM 模型
DEFAULT_LLM_MODEL=claude-sonnet-4-6
```

### 可选配置

```bash
# OpenAI 兼容 API
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# GLM-4 配置
GLM4_API_KEY=xxx
GLM4_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

---

## 🗄️ 数据库配置

### 基础配置

```bash
# PostgreSQL 连接
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=myagent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# 连接池
POSTGRES_POOL_MIN=2
POSTGRES_POOL_MAX=10
```

### 知识库数据库

```bash
# 独立的知识库数据库
KNOWLEDGE_POSTGRES_HOST=localhost
KNOWLEDGE_POSTGRES_DB=myagent_kb
```

---

## 🐍 沙箱配置

### 本地沙箱

```bash
DEFAULT_SANDBOX_ADAPTER=local
PYTHON_PATH=python3
SANDBOX_TIMEOUT=30000
SANDBOX_WORKSPACE=/tmp/motia-sandbox
```

### Daytona 沙箱

```bash
DAYTONA_API_KEY=xxx
DAYTONA_WORKSPACE=/workspace
```

---

## 🧠 知识库配置

### Embedding 配置

```bash
# OpenAI Embedding
OPENAI_API_KEY=sk-xxx
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_BASE_URL=https://api.openai.com/v1
```

### 数据源配置

```bash
# 默认数据源类型
DEFAULT_DATASOURCE_TYPE=postgres

# LanceDB 配置
LANCEDB_URI=./lancedb-data
```

---

## ⚙️ 系统配置

### 服务配置

```bash
# 服务端口
PORT=3000

# 日志级别
LOG_LEVEL=info

# 环境模式
NODE_ENV=production
```

### Agent 配置

```bash
# 最大对话消息数
MAX_CONVERSATION_MESSAGES=50

# 上下文压缩阈值
CONTEXT_COMPRESSION_THRESHOLD=20
```

---

## 📖 完整配置文件

参考 `.env.example` 文件查看所有 135 个配置项。

---

## 📖 下一步

- [快速部署](quick-start.md) - 启动系统
- [环境准备](environment-setup.md) - 安装依赖

---

**版本**: v1.0 | **更新日期**: 2026-03-29
