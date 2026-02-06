# Remotion 技能部署指南

## 本地开发环境 (macOS)

### 快速开始

```bash
cd skills/remotion-generator

# 1. 安装 Node.js 依赖
npm install

# 2. 安装 Chrome Headless Shell
bash scripts/install-chrome.sh

# 3. 验证安装
bash scripts/install-chrome.sh --verify
```

---

## 生产环境 (Linux 服务器)

### 自动部署（推荐）

```bash
cd skills/remotion-generator

# 运行自动部署脚本
bash scripts/deploy-linux.sh
```

部署脚本会自动完成：
1. ✅ 检查系统依赖（Node.js, npm, curl, unzip）
2. ✅ 安装 Node.js 依赖
3. ✅ 安装 Chrome Headless Shell（检测平台并下载）
4. ✅ 配置环境变量
5. ✅ 验证安装

### 手动部署

如果自动脚本无法运行，按以下步骤手动部署：

#### 1. 检查系统要求

```bash
# Node.js 版本 >= 18
node -v

# npm 可用
npm -v

# curl 或 wget（用于下载 Chrome）
curl --version
# 或
wget --version

# unzip（用于解压 Chrome）
unzip -v
```

如果缺少依赖，请安装：

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y nodejs npm curl unzip
```

**CentOS/RHEL:**
```bash
sudo yum install -y nodejs npm curl unzip
```

#### 2. 安装 Node.js 依赖

```bash
cd skills/remotion-generator/template
npm install
```

#### 3. 安装 Chrome Headless Shell

```bash
cd skills/remotion-generator
bash scripts/install-chrome.sh
```

#### 4. 验证安装

```bash
bash scripts/install-chrome.sh --verify
```

---

## 支持的平台

### 开发环境
- ✅ macOS (Intel x64)
- ✅ macOS (Apple Silicon arm64)

### 生产环境
- ✅ Linux (x86_64/amd64)
- ✅ Linux (arm64/aarch64)

**不支持：**
- ❌ Windows（建议使用 WSL2）

---

## 目录结构

安装后的目录结构：

```
skills/remotion-generator/
├── scripts/
│   ├── install-chrome.sh        # Chrome 安装脚本
│   └── deploy-linux.sh          # Linux 部署脚本
├── template/
│   ├── node_modules/
│   │   └── .remotion/
│   │       └── chrome-headless-shell/
│   │           ├── chrome-headless-shell-mac-x64/
│   │           ├── chrome-headless-shell-mac-arm64/
│   │           ├── chrome-headless-shell-linux64/
│   │           └── chrome-headless-shell-linux-arm64/
│   └── ... (Remotion 项目文件)
└── README.md
```

---

## 环境变量

生产环境可选配置（`.env.production`）：

```bash
# Node.js 环境
NODE_ENV=production

# Chrome 路径（可选，脚本会自动检测）
# CHROME_EXECUTABLE_PATH=/path/to/chrome-headless-shell

# 跳过 Chrome 下载
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_SKIP_DOWNLOAD=true
CHROME_SKIP_DOWNLOAD=true
```

---

## 故障排查

### 1. Chrome 下载失败

**错误：** `Downloading Chrome failed (will retry): read ECONNRESET`

**原因：** 网络连接问题

**解决：**
```bash
# 使用安装脚本手动安装
bash scripts/install-chrome.sh

# 或手动下载并解压（参见 README.md）
```

### 2. 权限错误

**错误：** `Chrome binary is not executable`

**解决：**
```bash
# 自动修复
bash scripts/install-chrome.sh --verify

# 或手动设置权限
chmod +x template/node_modules/.remotion/chrome-headless-shell/*/chrome-headless-shell
```

### 3. 磁盘空间不足

**错误：** `No space left on device`

**解决：**
```bash
# 检查磁盘空间
df -h

# 清理临时文件
rm -rf template/.cache
rm -rf template/node_modules/.cache

# 清理 npm 缓存
npm cache clean --force
```

### 4. 平台不匹配

**错误：** `Exec format error` 或 `cannot execute binary file`

**原因：** Chrome 版本与系统架构不匹配

**解决：**
```bash
# 检查系统架构
uname -m

# 重新安装对应平台的 Chrome
bash scripts/install-chrome.sh --platform linux64  # x86_64
bash scripts/install-chrome.sh --platform linux-arm64  # arm64
```

---

## 性能优化建议

### 1. 并发控制

默认使用 `--concurrency=1` 避免内存问题。如有需要可以调整：

```python
# 在 handler.py 的 _render_with_remotion() 方法中
"--concurrency=2",  # 增加并发数
```

### 2. 磁盘空间

视频渲染会产生临时文件，建议：

```bash
# 定期清理
crontab -e
# 添加：0 2 * * * rm -rf /path/to/template/.cache/*
```

### 3. 内存限制

如果渲染大视频时内存不足，考虑：

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB
```

---

## 监控和日志

### 查看 Chrome 版本

```bash
bash scripts/install-chrome.sh --verify
```

### 查看 Remotion 版本

```bash
cd template
npm list remotion
```

### 测试视频生成

```python
# 使用测试脚本
python skills/remotion-generator/scripts/test-composition-code.py
```

---

## 更新和维护

### 更新 Chrome

```bash
cd skills/remotion-generator
bash scripts/install-chrome.sh  # 重新运行安装脚本
```

### 更新 Remotion

```bash
cd template
npm update remotion @remotion/cli
```

---

## 安全建议

1. **不要提交敏感文件到 Git**
   - ✅ 在 `.gitignore` 中包含：`template/node_modules/`

2. **限制访问权限**
   - Chrome 二进制文件应该只对需要的用户可执行

3. **定期更新**
   - 保持 Chrome 和 Remotion 版本更新以修复安全漏洞

---

## 联系和支持

如有问题，请检查：
1. [Remotion 官方文档](https://www.remotion.dev/docs)
2. [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/)
3. 项目 README 和故障排查部分
