# Infographic Skill - 依赖项分析

## 📋 核心依赖项清单

### 1. **@antv/infographic** (必需)
**用途**: AntV Infographic 核心库，用于解析 DSL 并渲染信息图

**版本**: `latest` 或 `^1.0.0`

**安装方式**:
```bash
npm install @antv/infographic
```

**为什么需要**:
- 解析 Infographic DSL 语法
- 在浏览器/Node.js 环境中渲染信息图
- 提供导出为 SVG 的 API

**注意事项**:
- 该库通过 CDN 加载: `https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js`
- HTML 文件中需要引用此脚本
- 服务端渲染可能需要 Node.js 版本

---

### 2. **puppeteer** (必需)
**用途**: 无头浏览器，用于服务端渲染 HTML 并导出 SVG

**版本**: `^21.0.0` 或更高

**安装方式**:
```bash
npm install puppeteer
```

**为什么需要**:
- 在服务端运行完整的浏览器环境
- 执行 HTML 中的 JavaScript 代码
- 等待 Infographic 渲染完成
- 提取渲染后的 SVG 数据

**重要说明**:
⚠️ **Puppeteer 需要下载 Chromium**
- 首次安装时会自动下载 Chromium（约 150-300MB）
- 如果下载失败，可以使用环境变量指定镜像：
  ```bash
  PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots npm install puppeteer
  ```

**系统要求**:
- Node.js >= 14
- 需要足够的磁盘空间（> 500MB）
- Linux 系统可能需要安装额外的依赖库：
  ```bash
  # Ubuntu/Debian
  apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2
  ```

**替代方案**:
如果 Puppeteer 太重，可以考虑：
1. **playwright** (更现代，API 更友好)
   ```bash
   npm install playwright
   npx playwright install chromium
   ```
2. **jsdom** (轻量级，但功能有限)
   ```bash
   npm install jsdom
   ```

---

### 3. **cheerio** (可选)
**用途**: HTML 解析和操作，用于验证生成的 HTML 结构

**版本**: `^1.0.0-rc.12`

**安装方式**:
```bash
npm install cheerio
```

**为什么需要**:
- 验证生成的 HTML 结构是否正确
- 提取特定元素（如容器、脚本标签）
- 单元测试中的 HTML 断言

**是否必需**: ❌ 可选
- 如果不做 HTML 验证，可以不安装
- 建议在开发环境安装用于测试

---

### 4. **@types/puppeteer** (TypeScript 项目必需)
**用途**: Puppeteer 的 TypeScript 类型定义

**版本**: `^21.0.0`

**安装方式**:
```bash
npm install -D @types/puppeteer
```

**是否必需**: ✅ TypeScript 项目必需

---

## 🎯 Motia 框架依赖（隐式）

基于您的项目是 Motia 框架，以下依赖应该已经安装：

### 必需的 Motia 依赖
```json
{
  "@motiadev/core": "latest",
  "@motiadev/sdk": "latest"
}
```

### 检查是否已安装
```bash
# 查看 package.json 中的 Motia 依赖
cat package.json | grep motia
```

---

## 🔍 其他可选依赖

### 开发和测试依赖

#### 1. **@types/node** (TypeScript 项目)
```bash
npm install -D @types/node
```

#### 2. **vitest** 或 **jest** (测试框架)
```bash
npm install -D vitest
```

#### 3. **prettier** (代码格式化)
```bash
npm install -D prettier
```

---

## 📦 完整的 package.json 示例

```json
{
  "name": "infographic-generator-skill",
  "version": "1.0.0",
  "description": "Generate infographics using AntV Infographic",
  "main": "dist/index.js",
  "scripts": {
    "dev": "motia dev",
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@antv/infographic": "latest",
    "@motiadev/core": "latest",
    "@motiadev/sdk": "latest",
    "cheerio": "^1.0.0-rc.12",
    "puppeteer": "^21.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/puppeteer": "^21.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 🚀 安装步骤

### 方案 A: 一次性安装所有依赖

```bash
# 1. 安装核心依赖
npm install @antv/infographic puppeteer cheerio

# 2. 安装 TypeScript 类型定义（如果使用 TypeScript）
npm install -D @types/puppeteer

# 3. 验证 Puppeteer 是否正确安装
npx puppeteer browsers install chrome
```

### 方案 B: 使用 Playwright 替代 Puppeteer

```bash
# 1. 安装 Playwright
npm install playwright

# 2. 安装 Chromium 浏览器
npx playwright install chromium

# 3. 安装 TypeScript 类型定义（如果使用 TypeScript）
npm install -D @types/playwright
```

---

## ⚠️ 常见问题

### Q1: Puppeteer 安装失败怎么办？
**A**: 使用国内镜像：
```bash
export PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots
npm install puppeteer
```

### Q2: Chromium 下载太慢？
**A**: 跳过 Chromium 下载，使用系统安装的 Chrome：
```bash
npm install puppeteer
# 在代码中指定 Chrome 路径
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' // macOS
});
```

### Q3: Linux 环境缺少图形库？
**A**: 安装必要的系统依赖（参见上文 Puppeteer 系统要求）

### Q4: Docker 容器中如何使用？
**A**: 使用 Puppeteer 的 Docker 镜像或安装必要的依赖：
```dockerfile
FROM node:20-slim

# 安装 Puppeteer 依赖
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2

# 安装依赖
COPY package*.json ./
RUN npm install

# 跳过 Chromium 下载，使用 Debian 的 chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

### Q5: AntV Infographic 需要 Node.js 环境吗？
**A**: 不需要。AntV Infographic 主要在浏览器环境中运行。但在服务端导出 SVG 时，需要 Puppeteer/Playwright 来模拟浏览器环境。

---

## 💾 磁盘空间需求

- **Puppeteer**: ~300MB (包括 Chromium)
- **Playwright**: ~400MB (包括 Chromium)
- **@antv/infographic**: ~5MB
- **node_modules 总计**: ~500MB - 1GB

---

## 🔄 依赖项更新策略

```bash
# 检查过时的依赖
npm outdated

# 更新所有依赖（谨慎使用）
npm update

# 更新特定依赖
npm install @antv/infographic@latest

# 使用 npm-check-updates 检查更新
npx npm-check-updates -u
npm install
```

---

## ✅ 安装验证

运行以下命令验证所有依赖是否正确安装：

```bash
# 验证 Puppeteer
node -e "const puppeteer = require('puppeteer'); console.log('Puppeteer version:', puppeteer.version);"

# 验证 Cheerio
node -e "const cheerio = require('cheerio'); console.log('Cheerio loaded successfully');"

# 验证 Motia
npm run dev --version
```

---

## 📊 依赖项风险等级

| 依赖项 | 风险等级 | 说明 |
|--------|---------|------|
| @antv/infographic | 🟢 低 | 官方维护，API 稳定 |
| puppeteer | 🟡 中 | 定期更新，可能有 breaking changes |
| cheerio | 🟢 低 | 非常成熟稳定 |
| playwright | 🟡 中 | 替代方案，API 较新 |

---

## 🎓 推荐安装顺序

1. **先安装 Puppeteer**（最复杂，可能需要调整系统配置）
2. **验证 Puppeteer 可以启动浏览器**
3. **安装 @antv/infographic**
4. **安装开发依赖**（TypeScript 类型、测试框架等）
5. **运行验证脚本**确保所有依赖正常

---

**文档版本**: v1.0
**最后更新**: 2025-01-12
**适用环境**: Node.js >= 14, macOS/Linux/Windows
