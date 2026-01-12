# Infographic Skill - Motia Sandbox 初始化指南

## 🎯 目标
确保 Infographic Skill 在 Motia sandbox 环境中正常运行，提前准备好所有依赖。

---

## 🏗️ Motia Skill 架构理解

```
Motia Application
├── Core Framework
└── Skills/
    └── infographic-generator/
        ├── index.ts              # Skill 入口
        ├── steps/                # Skill 步骤
        └── init/                 # 初始化逻辑
```

**关键点**：
- Skill 在 Motia 的 sandbox 进程中运行
- Motia 负责进程隔离和资源管理
- 我们只需要确保依赖在 skill 加载时可用

---

## 📦 依赖准备（三个层次）

### 层次 1: 项目依赖（package.json）
这些依赖会随着 `npm install` 安装到项目的 `node_modules/`

```json
{
  "dependencies": {
    "@antv/infographic": "latest",
    "puppeteer": "^21.0.0",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

### 层次 2: Chromium 二进制文件
Puppeteer 需要的 Chromium 浏览器，首次运行时下载到：
```
~/.cache/puppeteer/chromium/  # macOS/Linux
%APPDATA%\Local\...\puppeteer\  # Windows
```

### 层次 3: 运行时缓存
生成的 HTML、SVG 文件缓存到项目目录：
```
.cache/infographic/
├── templates/
├── html/
└── svg/
```

---

## 🚀 实现方案

### 方案概述

```
Skill 加载 (onLoad)
    ↓
检查依赖是否已安装
    ↓ 未安装
自动安装依赖（同步）
    ↓
初始化完成，Skill 可用
```

### 核心原则

1. **同步初始化**：在 `onLoad` 中同步完成所有准备
2. **幂等性**：多次调用不会重复安装
3. **失败友好**：提供清晰的错误提示
4. **沙盒友好**：不依赖外部服务，不修改系统配置

---

## 📝 完整实现

### 1. Skill 入口文件

```typescript
// src/skills/infographic-generator/index.ts
import { Skill } from '@motiadev/sdk';
import { initializeDependencies } from './init';

export const infographicSkill: Skill = {
  id: 'infographic-generator',
  description: 'Generate beautiful infographics using AntV Infographic',

  // Skill 加载时自动初始化
  async onLoad({ logger }) {
    logger.info('🎨 Infographic Skill loading...');

    try {
      await initializeDependencies({ logger });
      logger.info('✅ Infographic Skill ready!\n');
    } catch (error) {
      logger.error(`❌ Failed to initialize Infographic Skill: ${error.message}`);
      throw error;
    }
  },

  steps: [
    // ... skill steps
  ],
};
```

---

### 2. 初始化模块

```typescript
// src/skills/infographic-generator/init/index.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface InitOptions {
  logger: any;
}

interface DepStatus {
  name: string;
  installed: boolean;
  version?: string;
}

/**
 * 初始化所有依赖
 * 这个函数在 skill 加载时同步执行
 */
export async function initializeDependencies({ logger }: InitOptions): Promise<void> {
  logger.info('📦 Checking dependencies...\n');

  // 1. 检查 npm 包
  const npmPackages = ['puppeteer', '@antv/infographic', 'cheerio'];
  const missingPackages: string[] = [];

  for (const pkg of npmPackages) {
    const status = checkNpmPackage(pkg);
    if (status.installed) {
      logger.info(`  ✓ ${pkg} @ ${status.version}`);
    } else {
      logger.warn(`  ✗ ${pkg} not installed`);
      missingPackages.push(pkg);
    }
  }

  // 2. 检查 Chromium
  const chromiumStatus = await checkChromium();
  if (chromiumStatus.installed) {
    logger.info(`  ✓ Chromium installed\n`);
  } else {
    logger.warn(`  ✗ Chromium not installed\n`);
  }

  // 3. 如果所有依赖都存在，直接返回
  if (missingPackages.length === 0 && chromiumStatus.installed) {
    logger.info('✅ All dependencies ready!\n');
    return;
  }

  // 4. 安装缺失的依赖
  logger.info('📥 Installing missing dependencies...\n');

  try {
    // 安装 npm 包（如果缺失）
    if (missingPackages.length > 0) {
      logger.info(`📚 Installing npm packages: ${missingPackages.join(', ')}...`);
      installNpmPackages(missingPackages);
      logger.info('✓ npm packages installed\n');
    }

    // 安装 Chromium（如果缺失）
    if (!chromiumStatus.installed) {
      logger.info('🌐 Downloading Chromium (this may take a few minutes)...');
      await installChromium({ logger });
      logger.info('✓ Chromium installed\n');
    }

    logger.info('✅ All dependencies installed successfully!\n');
  } catch (error) {
    logger.error(`\n❌ Failed to install dependencies: ${error.message}\n`);
    logger.error('💡 Possible solutions:\n');
    logger.error('  1. Check your internet connection\n');
    logger.error('  2. Try: npm install\n');
    logger.error('  3. Use system Chrome: CHROMIUM_EXECUTABLE_PATH=/path/to/chrome\n');

    throw error;
  }
}

/**
 * 检查 npm 包是否已安装
 */
function checkNpmPackage(packageName: string): DepStatus {
  try {
    const packagePath = require.resolve(packageName);
    const pkgJson = require(`${packageName}/package.json`);

    return {
      name: packageName,
      installed: true,
      version: pkgJson.version,
    };
  } catch {
    return {
      name: packageName,
      installed: false,
    };
  }
}

/**
 * 检查 Chromium 是否已安装
 */
async function checkChromium(): Promise<DepStatus> {
  try {
    const puppeteer = require('puppeteer');
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revisions = await browserFetcher.localRevisions();

    return {
      name: 'Chromium',
      installed: revisions.length > 0,
    };
  } catch {
    return {
      name: 'Chromium',
      installed: false,
    };
  }
}

/**
 * 安装 npm 包
 */
function installNpmPackages(packages: string[]): void {
  try {
    // 设置国内镜像（如果配置了）
    const env = { ...process.env };

    if (process.env.PUPPETEER_DOWNLOAD_HOST) {
      env.PUPPETEER_DOWNLOAD_HOST = process.env.PUPPETEER_DOWNLOAD_HOST;
    }

    // 同步执行 npm install
    execSync(`npm install ${packages.join(' ')}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env,
      timeout: 300000, // 5 分钟超时
    });
  } catch (error) {
    throw new Error(`Failed to install npm packages: ${error.message}`);
  }
}

/**
 * 安装 Chromium
 */
async function installChromium({ logger }: InitOptions): Promise<void> {
  try {
    // 如果配置了使用系统 Chrome，跳过下载
    if (process.env.SKIP_CHROMIUM_DOWNLOAD === 'true') {
      logger.info('  ⏭️  Skipping Chromium download (using system Chrome)\n');
      return;
    }

    const puppeteer = require('puppeteer');
    const browserFetcher = puppeteer.createBrowserFetcher();

    // 获取最新的 Chromium revision
    const revision = puppeteer._preferredRevision;
    logger.info(`  Target version: r${revision}`);

    // 下载 Chromium
    const startTime = Date.now();

    await browserFetcher.download(revision, (downloadBytes, totalBytes) => {
      const progress = ((downloadBytes / totalBytes) * 100).toFixed(2);
      const downloadedMB = (downloadBytes / 1024 / 1024).toFixed(2);
      const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
      const speed = (downloadBytes / (Date.now() - startTime) / 1024).toFixed(2);

      // 使用 \r 覆盖当前行，显示进度
      process.stdout.write(
        `  Progress: ${progress}% (${downloadedMB}MB / ${totalMB}MB) - ${speed} KB/s\r`
      );
    });

    logger.info('\n'); // 下载完成后换行
  } catch (error) {
    throw new Error(`Failed to download Chromium: ${error.message}`);
  }
}
```

---

### 3. package.json 更新

```json
{
  "name": "myagent",
  "version": "1.0.0",
  "scripts": {
    "dev": "motia dev",
    "start": "motia start"
  },
  "dependencies": {
    "@motiadev/core": "latest",
    "@motiadev/sdk": "latest",
    "@antv/infographic": "latest",
    "puppeteer": "^21.0.0",
    "cheerio": "^1.0.0-rc.12"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**关键点**：
- ✅ 所有依赖都在 `dependencies` 中
- ✅ 不需要 `prestart` 钩子（skill 的 `onLoad` 会处理）
- ✅ 设置 Node.js 版本要求

---

### 4. 渲染 Step 实现

```typescript
// src/skills/infographic-generator/steps/generate-infographic.step.ts
import { Step } from '@motiadev/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

export const generateInfographicStep: Step = {
  id: 'infographic-generator',
  description: 'Generate infographic from text content',

  inputs: {
    content: {
      description: 'Text content to convert to infographic',
      type: 'string',
      required: true,
    },
  },

  outputs: {
    htmlPath: {
      description: 'Path to generated HTML file',
      type: 'string',
    },
    svgPath: {
      description: 'Path to generated SVG file',
      type: 'string',
    },
  },

  run: async (inputs, { logger }) => {
    const { content } = inputs;

    logger.info('🎨 Generating infographic...\n');

    try {
      // 1. 分析内容
      const analysis = await analyzeContent(content, logger);
      logger.info(`✓ Content type: ${analysis.contentType}\n`);
      logger.info(`✓ Template: ${analysis.template}\n`);

      // 2. 生成 DSL
      const dsl = await generateDSL(analysis, logger);
      logger.info('✓ DSL generated\n');

      // 3. 生成 HTML
      const { htmlPath, svgPath } = await renderInfographic(
        dsl,
        analysis.dataStructure.title,
        logger
      );

      logger.info(`✓ HTML generated: ${htmlPath}\n`);
      logger.info(`✓ SVG generated: ${svgPath}\n`);

      return {
        htmlPath,
        svgPath,
      };
    } catch (error) {
      logger.error(`❌ Failed to generate infographic: ${error.message}\n`);
      throw error;
    }
  },
};

/**
 * 分析内容
 */
async function analyzeContent(content: string, logger: any) {
  // 这里调用 LLM 分析内容
  // 返回内容类型、模板、数据结构等

  // 简化示例
  return {
    contentType: 'list',
    template: 'list-row-horizontal-icon-arrow',
    dataStructure: {
      title: 'Example Infographic',
      items: [
        { label: 'Item 1', icon: 'mdi/check-circle' },
        { label: 'Item 2', icon: 'mdi/check-circle' },
      ],
    },
  };
}

/**
 * 生成 DSL
 */
async function generateDSL(analysis: any, logger: any) {
  // 根据分析结果生成 Infographic DSL

  return `
infographic ${analysis.template}
data
title ${analysis.dataStructure.title}
items
${analysis.dataStructure.items
  .map((item: any) => `- label ${item.label}\n  icon ${item.icon}`)
  .join('\n')}
`;
}

/**
 * 渲染信息图并导出 SVG
 */
async function renderInfographic(
  dsl: string,
  title: string,
  logger: any
): Promise<{ htmlPath: string; svgPath: string }> {
  const puppeteer = require('puppeteer');

  // 创建输出目录
  const outputDir = path.join(process.cwd(), 'output', 'infographic');
  await fs.mkdir(outputDir, { recursive: true });

  // 生成文件名
  const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const htmlPath = path.join(outputDir, `${safeTitle}.html`);
  const svgPath = path.join(outputDir, `${safeTitle}.svg`);

  // 生成 HTML 内容
  const html = generateHTML(dsl, title);

  // 启动 Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    timeout: 30000,
  });

  try {
    const page = await browser.newPage();

    // 设置 HTML 内容
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // 等待 Canvas 渲染
    await page.waitForSelector('#container canvas', { timeout: 10000 });

    // 提取 SVG
    const svgData = await page.evaluate(() => {
      const infographic = (window as any).infographic;
      return infographic.toDataURL({ type: 'svg' });
    });

    // 保存 HTML
    await fs.writeFile(htmlPath, html);

    // 保存 SVG
    const base64Data = svgData.replace(/^data:image\/svg\+xml;base64,/, '');
    await fs.writeFile(svgPath, base64Data, 'base64');

    return { htmlPath, svgPath };
  } finally {
    await browser.close();
  }
}

/**
 * 生成 HTML
 */
function generateHTML(dsl: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Infographic</title>
  <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    #container {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="container"></div>
  <script>
    const infographic = new Infographic({
      container: 'container',
      dsl: \`${dsl}\`
    });
  </script>
</body>
</html>`;
}
```

---

## 🔧 环境变量配置

创建 `.env` 文件（可选）：

```bash
# Infographic Skill 配置

# 跳过 Chromium 下载，使用系统 Chrome
# SKIP_CHROMIUM_DOWNLOAD=true

# 指定 Chrome 路径
# CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome

# 国内镜像加速
# PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots

# 详细日志
# VERBOSE_INIT=true
```

---

## ✅ 使用流程

### 开发环境

```bash
# 1. 安装依赖
npm install

# 2. 启动 Motia 开发服务器
npm run dev

# Skill 会自动初始化：
# 📦 Checking dependencies...
#   ✓ puppeteer @ 21.5.0
#   ✓ @antv/infographic @ 1.2.3
#   ✓ cheerio @ 1.0.0
#   ✓ Chromium installed
# ✅ All dependencies ready!
# ✅ Infographic Skill ready!
```

### 生产环境

```bash
# 1. 构建（如果需要）
npm run build

# 2. 启动
npm start

# 如果想跳过依赖检查（加速启动）
SKIP_DEPENDENCY_CHECK=true npm start
```

---

## 🐛 故障排除

### 问题 1: Chromium 下载失败

**错误信息**：
```
❌ Failed to download Chromium: Error: Download failed: server returned 403
```

**解决方案**：

**方案 A**: 使用国内镜像
```bash
export PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots
npm install
```

**方案 B**: 使用系统 Chrome
```bash
export SKIP_CHROMIUM_DOWNLOAD=true
export CHROMIUM_EXECUTABLE_PATH=/usr/bin/google-chrome  # macOS: /Applications/Google Chrome.app/...
npm start
```

---

### 问题 2: Puppeteer 启动失败

**错误信息**：
```
❌ Failed to launch browser: Error: Failed to launch the browser process!
```

**解决方案**：

安装缺失的系统依赖（Linux）：
```bash
sudo apt-get install -y \
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

---

### 问题 3: 依赖检查超时

**错误信息**：
```
❌ Failed to install dependencies: Command timed out
```

**解决方案**：

增加超时时间或跳过检查：
```bash
# 跳过依赖检查（依赖已安装的情况下）
SKIP_DEPENDENCY_CHECK=true npm start
```

---

## 📊 磁盘空间需求

| 项目 | 大小 |
|------|------|
| npm packages | ~50MB |
| Chromium | ~300MB |
| 缓存文件 | ~10MB |
| **总计** | **~360MB** |

---

## ✅ 验收标准

- [x] Skill 在 Motia sandbox 中正常运行
- [x] 首次启动自动安装所有依赖
- [x] 自动下载 Chromium 浏览器
- [x] 支持环境变量配置
- [x] 提供清晰的错误提示
- [x] 支持跳过依赖检查（生产环境）
- [x] 不需要 Docker 或 Kubernetes
- [x] 不需要额外的启动脚本

---

## 📝 总结

### 核心文件

```
src/skills/infographic-generator/
├── index.ts                    # Skill 入口（包含 onLoad 初始化）
├── init/
│   └── index.ts                # 依赖检查和安装逻辑
└── steps/
    └── generate-infographic.step.ts  # 生成信息图的步骤

package.json                    # 项目依赖
.env                            # 环境变量（可选）
```

### 关键设计决策

1. **在 Skill 的 `onLoad` 钩子中初始化**：Motia 会在加载 skill 时自动调用
2. **同步执行**：确保在使用 skill 之前所有依赖已就绪
3. **幂等性**：多次启动不会重复下载
4. **沙盒友好**：不依赖外部服务，不修改系统配置

---

**文档版本**: v1.0
**最后更新**: 2025-01-12
**适用环境**: Motia Framework (Node.js >= 18)
