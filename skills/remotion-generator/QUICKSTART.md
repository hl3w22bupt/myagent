# Remotion 技能快速开始指南

## 本地开发 (macOS)

```bash
# 1. 进入技能目录
cd skills/remotion-generator

# 2. 安装 Chrome Headless Shell（跨平台脚本）
bash scripts/install-chrome.sh

# 3. 验证安装
bash scripts/install-chrome.sh --verify
```

预期输出：
```
✓ Chrome 验证成功: Google Chrome for Testing 134.0.6998.35
✓ 安装路径: .../chrome-headless-shell-mac-x64/chrome-headless-shell
✓ Chrome 安装有效
```

---

## Linux 生产环境部署

### 自动部署（推荐）

```bash
cd skills/remotion-generator

# 一键部署脚本
bash scripts/deploy-linux.sh
```

该脚本会自动：
1. 检查系统依赖（Node.js, npm, curl, unzip）
2. 安装 Node.js 依赖
3. 安装 Chrome Headless Shell
4. 配置环境变量
5. 验证安装

### 手动部署

```bash
cd skills/remotion-generator

# 1. 安装 Node.js 依赖
cd template
npm install
cd ..

# 2. 安装 Chrome Headless Shell
bash scripts/install-chrome.sh

# 3. 验证
bash scripts/install-chrome.sh --verify
```

---

## 支持的平台

| 平台 | 架构 | 状态 |
|------|------|------|
| macOS | x64 (Intel) | ✅ |
| macOS | arm64 (Apple Silicon) | ✅ |
| Linux | x64 (amd64) | ✅ |
| Linux | arm64 (aarch64) | ✅ |
| Windows | - | ❌ (使用 WSL2) |

---

## 验证安装

### 快速验证 Chrome

```bash
bash skills/remotion-generator/scripts/install-chrome.sh --verify
```

### 完整验证（可选）

```bash
bash skills/remotion-generator/scripts/verify-setup.sh
```

---

## 故障排查

### Chrome 下载失败

```bash
# 手动安装
bash skills/remotion-generator/scripts/install-chrome.sh
```

### 权限错误

```bash
# 自动修复权限
bash skills/remotion-generator/scripts/install-chrome.sh --verify
```

### 依赖缺失

```bash
# 安装 Node.js 依赖
cd skills/remotion-generator/template
npm install
```

---

## 项目文档

- **部署指南：** `DEPLOYMENT.md`
- **完整文档：** `README.md`
- **修复总结：** `../../FIX_REMOTION_CHROME_SUMMARY.md`

---

## 关键改进

✅ **跨平台支持** - 自动检测平台并下载对应版本的 Chrome
✅ **简化部署** - 一键安装脚本
✅ **友好提示** - 清晰的错误信息
✅ **标准路径** - 使用 Remotion 4.0+ 官方推荐路径
