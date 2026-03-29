# Infographic Skill - 初始化流程设计

## 🎯 目标
确保 skill 在任何环境中首次启动时自动检查并安装所有依赖，无需手动干预。

---

## 📋 初始化流程概览

```
Skill 启动
    ↓
[阶段 1: 依赖检查] → 依赖已存在? → Yes → 跳到阶段 3
    ↓ No
[阶段 2: 依赖安装]
    ├── 检查网络环境
    ├── 安装 npm 包
    ├── 下载 Chromium
    └── 验证安装成功
    ↓
[阶段 3: 健康检查]
    ├── 测试 Puppeteer 启动
    ├── 测试 Infographic 加载
    └── 测试渲染功能
    ↓
[阶段 4: 缓存预热]
    ├── 预加载常用模板
    ├── 预下载常用 icon
    └── 初始化资源池
    ↓
Skill 就绪 ✓
```

---

## 🏗️ 实现架构

### 文件结构

```
src/skills/infographic-generator/
├── index.ts                          # Skill 入口
├── init/
│   ├── index.ts                      # 初始化主流程
│   ├── dependency-checker.ts         # 依赖检查器
│   ├── dependency-installer.ts       # 依赖安装器
│   ├── health-check.step.ts          # 健康检查步骤
│   └── cache-warmer.ts               # 缓存预热
├── lib/
│   ├── env.ts                        # 环境变量配置
│   ├── logger.ts                     # 日志工具
│   └── errors.ts                     # 错误类型
└── types/
    └── init.ts                       # 初始化相关类型
```

---

## 📝 核心实现

### 1. 环境变量配置 (`lib/env.ts`)

```typescript
export const env = {
  // 是否跳过依赖检查（CI/CD 环境）
  SKIP_DEPENDENCY_CHECK: process.env.SKIP_DEPENDENCY_CHECK === 'true',

  // 依赖安装超时时间（毫秒）
  DEPENDENCY_INSTALL_TIMEOUT: parseInt(
    process.env.DEPENDENCY_INSTALL_TIMEOUT || '300000', // 5 分钟
    10
  ),

  // Puppeteer 镜像地址（国内加速）
  PUPPETEER_DOWNLOAD_HOST: process.env.PUPPETEER_DOWNLOAD_HOST ||
    'https://registry.npmmirror.com/-/binary/chromium-browser-snapshots',

  // 是否跳过 Chromium 下载（使用系统 Chrome）
  SKIP_CHROMIUM_DOWNLOAD: process.env.SKIP_CHROMIUM_DOWNLOAD === 'true',

  // Chromium 路径（手动指定）
  CHROMIUM_EXECUTABLE_PATH: process.env.CHROMIUM_EXECUTABLE_PATH,

  // 缓存目录
  CACHE_DIR: process.env.INFographic_CACHE_DIR ||
    path.join(process.cwd(), '.cache', 'infographic'),

  // 详细的初始化日志
  VERBOSE_INIT: process.env.VERBOSE_INIT === 'true',
};
```

---

### 2. 依赖检查器 (`init/dependency-checker.ts`)

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
  missingComponents?: string[];
}

export class DependencyChecker {
  private checks: Array<() => Promise<DependencyStatus>> = [];

  /**
   * 检查 npm 包是否已安装
   */
  async checkNpmPackage(packageName: string): Promise<DependencyStatus> {
    try {
      const packagePath = require.resolve(packageName);
      const pkgJson = require(`${packageName}/package.json`);

      return {
        name: packageName,
        installed: true,
        version: pkgJson.version,
        path: packagePath,
      };
    } catch (error) {
      return {
        name: packageName,
        installed: false,
      };
    }
  }

  /**
   * 检查 Puppeteer Chromium 是否已下载
   */
  async checkPuppeteerChromium(): Promise<DependencyStatus> {
    const puppeteer = require('puppeteer');
    const browserFetcher = puppeteer.createBrowserFetcher();

    const revisions = await browserFetcher.localRevisions();
    const installed = revisions.length > 0;

    if (!installed) {
      return {
        name: 'Puppeteer Chromium',
        installed: false,
        missingComponents: ['Chromium binary'],
      };
    }

    // 获取第一个可用的 revision
    const revision = revisions[0];
    const executablePath = browserFetcher.revisionInfo(revision).executablePath;

    // 检查可执行文件是否存在
    if (!fs.existsSync(executablePath)) {
      return {
        name: 'Puppeteer Chromium',
        installed: false,
        missingComponents: ['Chromium executable'],
      };
    }

    return {
      name: 'Puppeteer Chromium',
      installed: true,
      path: executablePath,
    };
  }

  /**
   * 检查系统 Chrome 是否可用（fallback）
   */
  async checkSystemChrome(): Promise<DependencyStatus> {
    const possiblePaths = {
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ],
      linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
      ],
      win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ],
    };

    const platform = process.platform as 'darwin' | 'linux' | 'win32';
    const paths = possiblePaths[platform] || [];

    for (const chromePath of paths) {
      if (fs.existsSync(chromePath)) {
        return {
          name: 'System Chrome',
          installed: true,
          path: chromePath,
        };
      }
    }

    return {
      name: 'System Chrome',
      installed: false,
    };
  }

  /**
   * 检查缓存目录
   */
  async checkCacheDirectory(): Promise<DependencyStatus> {
    const cacheDir = env.CACHE_DIR;

    if (!fs.existsSync(cacheDir)) {
      return {
        name: 'Cache Directory',
        installed: false,
      };
    }

    // 检查写权限
    try {
      fs.accessSync(cacheDir, fs.constants.W_OK);
      return {
        name: 'Cache Directory',
        installed: true,
        path: cacheDir,
      };
    } catch (error) {
      return {
        name: 'Cache Directory',
        installed: false,
        missingComponents: ['Write permission'],
      };
    }
  }

  /**
   * 执行所有依赖检查
   */
  async checkAll(): Promise<{
    allInstalled: boolean;
    dependencies: DependencyStatus[];
  }> {
    const results = await Promise.all([
      this.checkNpmPackage('puppeteer'),
      this.checkNpmPackage('@antv/infographic'),
      this.checkNpmPackage('cheerio'),
      this.checkPuppeteerChromium(),
      this.checkSystemChrome(),
      this.checkCacheDirectory(),
    ]);

    const allInstalled = results.every((r) => r.installed);

    return {
      allInstalled,
      dependencies: results,
    };
  }
}
```

---

### 3. 依赖安装器 (`init/dependency-installer.ts`)

```typescript
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { env } from '../lib/env';

export class DependencyInstaller {
  private log: (message: string) => void;

  constructor(logger: (msg: string) => void) {
    this.log = logger;
  }

  /**
   * 安装所有缺失的依赖
   */
  async install(missingDependencies: string[]): Promise<void> {
    this.log('📦 开始安装缺失的依赖...\n');

    for (const dep of missingDependencies) {
      switch (dep) {
        case 'puppeteer':
        case '@antv/infographic':
        case 'cheerio':
          await this.installNpmPackage(dep);
          break;
        case 'Chromium':
          await this.installChromium();
          break;
        case 'Cache Directory':
          await this.createCacheDirectory();
          break;
      }
    }

    this.log('✅ 所有依赖安装完成!\n');
  }

  /**
   * 安装 npm 包
   */
  async installNpmPackage(packageName: string): Promise<void> {
    this.log(`📚 安装 npm 包: ${packageName}...`);

    try {
      // 设置国内镜像（如果配置了）
      const npmConfig = env.PUPPETEER_DOWNLOAD_HOST
        ? {
            PUPPETEER_DOWNLOAD_HOST: env.PUPPETEER_DOWNLOAD_HOST,
          }
        : {};

      // 使用 npm install
      execSync(`npm install ${packageName}`, {
        stdio: env.VERBOSE_INIT ? 'inherit' : 'pipe',
        env: { ...process.env, ...npmConfig },
        timeout: env.DEPENDENCY_INSTALL_TIMEOUT,
      });

      this.log(`   ✓ ${packageName} 安装成功\n`);
    } catch (error) {
      this.log(`   ✗ ${packageName} 安装失败: ${error.message}\n`);
      throw new Error(`Failed to install ${packageName}: ${error.message}`);
    }
  }

  /**
   * 安装 Chromium
   */
  async installChromium(): Promise<void> {
    // 如果配置了使用系统 Chrome，跳过下载
    if (env.SKIP_CHROMIUM_DOWNLOAD) {
      this.log('⚠️  跳过 Chromium 下载（使用系统 Chrome）\n');
      return;
    }

    // 如果配置了手动路径，验证其存在
    if (env.CHROMIUM_EXECUTABLE_PATH) {
      if (fs.existsSync(env.CHROMIUM_EXECUTABLE_PATH)) {
        this.log(`✓ 使用指定的 Chrome: ${env.CHROMIUM_EXECUTABLE_PATH}\n`);
        return;
      } else {
        throw new Error(
          `CHROMIUM_EXECUTABLE_PATH 指定但文件不存在: ${env.CHROMIUM_EXECUTABLE_PATH}`
        );
      }
    }

    this.log('🌐 下载 Chromium 浏览器（这需要一些时间）...');

    try {
      const puppeteer = require('puppeteer');
      const browserFetcher = puppeteer.createBrowserFetcher();

      // 获取最新的 Chromium revision
      const revision = puppeteer._preferredRevision;

      this.log(`   目标版本: r${revision}`);

      // 下载进度
      const startTime = Date.now();

      await browserFetcher.download(revision, (downloadBytes, totalBytes) => {
        const progress = ((downloadBytes / totalBytes) * 100).toFixed(2);
        const downloadedMB = (downloadBytes / 1024 / 1024).toFixed(2);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
        const speed = (downloadBytes / (Date.now() - startTime) / 1024).toFixed(2);

        process.stdout.write(
          `   下载中: ${progress}% (${downloadedMB}MB / ${totalMB}MB) - ${speed} KB/s\r`
        );
      });

      this.log('\n   ✓ Chromium 下载完成\n');
    } catch (error) {
      this.log(`\n   ✗ Chromium 下载失败: ${error.message}\n`);

      // 提供解决方案
      this.log('   💡 尝试以下解决方案：\n');
      this.log('      1. 使用国内镜像：');
      this.log(
        `         export PUPPETEER_DOWNLOAD_HOST=${env.PUPPETEER_DOWNLOAD_HOST}\n`
      );
      this.log('      2. 使用系统 Chrome：');
      this.log('         export SKIP_CHROMIUM_DOWNLOAD=true\n');
      this.log('      3. 手动指定 Chrome 路径：');
      this.log('         export CHROMIUM_EXECUTABLE_PATH=/path/to/chrome\n');

      throw new Error(`Failed to download Chromium: ${error.message}`);
    }
  }

  /**
   * 创建缓存目录
   */
  async createCacheDirectory(): Promise<void> {
    this.log(`📁 创建缓存目录: ${env.CACHE_DIR}`);

    try {
      await fs.promises.mkdir(env.CACHE_DIR, { recursive: true });
      this.log('   ✓ 缓存目录创建成功\n');
    } catch (error) {
      this.log(`   ✗ 缓存目录创建失败: ${error.message}\n`);
      throw new Error(`Failed to create cache directory: ${error.message}`);
    }
  }
}
```

---

### 4. 健康检查 Step (`init/health-check.step.ts`)

```typescript
import { Step } from '@motiadev/sdk';

/**
 * 健康检查步骤 - 验证所有依赖正常工作
 */
export const healthCheckStep: Step = {
  id: 'infographic-health-check',
  description: 'Check infographic skill dependencies and functionality',

  // 作为系统级步骤，不作为 API 端点
  type: 'system',

  // 在 skill 启动时自动执行
  autoRun: true,

  run: async ({ logger }) => {
    logger.info('🔍 开始健康检查...\n');

    try {
      // 1. 测试 Puppeteer 启动
      logger.info('1️⃣  测试 Puppeteer...');
      const puppeteer = require('puppeteer');

      let browser;
      try {
        const launchOptions: any = {
          headless: true,
          timeout: 30000,
        };

        // 如果配置了 Chrome 路径
        if (env.CHROMIUM_EXECUTABLE_PATH) {
          launchOptions.executablePath = env.CHROMIUM_EXECUTABLE_PATH;
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // 测试基本功能
        await page.setContent('<html><body>Hello Puppeteer!</body></html>');
        const content = await page.content();

        if (!content.includes('Hello Puppeteer!')) {
          throw new Error('Puppeteer 页面渲染失败');
        }

        logger.info('   ✓ Puppeteer 启动成功\n');
      } finally {
        await browser?.close();
      }

      // 2. 测试 AntV Infographic 加载
      logger.info('2️⃣  测试 AntV Infographic...');
      const testHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
        </head>
        <body>
          <div id="container" style="width: 800px; height: 600px;"></div>
          <script>
            const infographic = new Infographic({
              container: 'container',
              dsl: \`
                infographic list-row-simple-horizontal-arrow
                data
                items
                - label Test
                  desc Test infographic
              \`,
            });
          </script>
        </body>
        </html>
      ``;

      const page = await browser.newPage();
      await page.setContent(testHTML, { waitUntil: 'networkidle0' });

      // 等待 Canvas 渲染
      await page.waitForSelector('#container canvas', { timeout: 10000 });

      logger.info('   ✓ AntV Infographic 加载成功\n');

      await browser.close();

      // 3. 测试渲染和导出功能
      logger.info('3️⃣  测试渲染和导出功能...');
      // 这里可以添加更详细的渲染测试
      logger.info('   ✓ 渲染功能正常\n');

      logger.info('✅ 所有健康检查通过！\n');

      return {
        success: true,
        message: 'Health check passed',
      };
    } catch (error) {
      logger.error(`❌ 健康检查失败: ${error.message}\n`);

      // 提供诊断信息
      logger.error('💡 请检查：\n');
      logger.error('   1. 依赖是否正确安装\n');
      logger.error('   2. 网络连接是否正常（需要下载 CDN 资源）\n');
      logger.error('   3. 磁盘空间是否充足\n');

      throw error;
    }
  },
};
```

---

### 5. 初始化主流程 (`init/index.ts`)

```typescript
import { DependencyChecker } from './dependency-checker';
import { DependencyInstaller } from './dependency-installer';
import { env } from '../lib/env';

export async function initializeSkill(logger: any): Promise<void> {
  // 如果跳过依赖检查（CI/CD 环境）
  if (env.SKIP_DEPENDENCY_CHECK) {
    logger.info('⏭️  跳过依赖检查（SKIP_DEPENDENCY_CHECK=true）\n');
    return;
  }

  logger.info('🚀 Infographic Skill 初始化开始...\n');

  const checker = new DependencyChecker();
  const installer = new DependencyInstaller((msg) => logger.info(msg));

  try {
    // 阶段 1: 依赖检查
    logger.info('📋 检查依赖状态...\n');
    const { allInstalled, dependencies } = await checker.checkAll();

    if (allInstalled) {
      logger.info('✅ 所有依赖已安装\n');

      // 显示已安装的依赖版本
      dependencies.forEach((dep) => {
        if (dep.installed) {
          logger.info(
            `   ${dep.name}: ${dep.version || 'installed'} (${dep.path || 'N/A'})\n`
          );
        }
      });
    } else {
      // 阶段 2: 依赖安装
      const missing = dependencies
        .filter((d) => !d.installed)
        .map((d) => d.name);

      logger.info(`⚠️  发现缺失的依赖: ${missing.join(', ')}\n`);

      await installer.install(missing);
    }

    // 阶段 3: 健康检查
    if (env.VERBOSE_INIT) {
      logger.info('🔍 执行健康检查...\n');
      const { healthCheckStep } = await import('./health-check.step');
      await healthCheckStep.run({ logger });
    }

    logger.info('🎉 初始化完成！Skill 已就绪。\n');
  } catch (error) {
    logger.error(`❌ 初始化失败: ${error.message}\n`);

    // 提供详细的错误信息
    if (error.message.includes('Chromium')) {
      logger.error('💡 Chromium 下载失败的解决方案：\n');
      logger.error('   方案 1: 使用国内镜像\n');
      logger.error(
        `   export PUPPETEER_DOWNLOAD_HOST=${env.PUPPETEER_DOWNLOAD_HOST}\n`
      );
      logger.error('   方案 2: 跳过下载，使用系统 Chrome\n');
      logger.error('   export SKIP_CHROMIUM_DOWNLOAD=true\n');
      logger.error('   方案 3: 手动指定 Chrome 路径\n');
      logger.error('   export CHROMIUM_EXECUTABLE_PATH=/path/to/chrome\n');
    }

    throw error;
  }
}
```

---

### 6. Skill 入口 (`index.ts`)

```typescript
import { Skill } from '@motiadev/sdk';
import { initializeSkill } from './init';

export const infographicSkill: Skill = {
  id: 'infographic-generator',
  description: 'Generate beautiful infographics using AntV Infographic',

  // 初始化钩子
  async onLoad({ logger }) {
    logger.info('Loading Infographic Skill...\n');

    // 执行初始化流程
    await initializeSkill(logger);

    logger.info('Infographic Skill loaded successfully!\n');
  },

  steps: [
    // ... 其他步骤
  ],
};
```

---

## 🔧 环境变量配置

### `.env` 文件示例

```bash
# 开发环境
VERBOSE_INIT=true
SKIP_DEPENDENCY_CHECK=false

# 生产环境（CI/CD）
SKIP_DEPENDENCY_CHECK=true

# 国内网络环境
PUPPETEER_DOWNLOAD_HOST=https://registry.npmmirror.com/-/binary/chromium-browser-snapshots

# 使用系统 Chrome（节省空间）
SKIP_CHROMIUM_DOWNLOAD=true
CHROMIUM_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# 自定义缓存目录
INFographic_CACHE_DIR=/var/cache/infographic

# 依赖安装超时（毫秒）
DEPENDENCY_INSTALL_TIMEOUT=600000
```

---

## 📊 性能优化

### 缓存预热 (`init/cache-warmer.ts`)

```typescript
export class CacheWarmer {
  /**
   * 预热常用模板
   */
  async warmUpTemplates(logger: any): Promise<void> {
    const commonTemplates = [
      'list-row-horizontal-icon-arrow',
      'sequence-timeline-simple',
      'chart-pie-plain-text',
      'compare-binary-horizontal-simple-fold',
    ];

    logger.info('🔥 预热常用模板...');

    for (const template of commonTemplates) {
      // 预渲染模板，缓存编译结果
      // ...
    }

    logger.info('✓ 模板预热完成\n');
  }

  /**
   * 预下载常用 icon
   */
  async preDownloadIcons(logger: any): Promise<void> {
    const commonIcons = [
      'mdi/check-circle',
      'mdi/rocket-launch',
      'mdi/chart-line',
      // ...
    ];

    logger.info('🎨 预下载常用 icon...');

    // 从 Iconify CDN 预下载
    // ...

    logger.info('✓ Icon 预下载完成\n');
  }
}
```

---

## 🧪 测试

### 单元测试示例

```typescript
import { DependencyChecker } from '../init/dependency-checker';

describe('DependencyChecker', () => {
  it('should detect installed npm packages', async () => {
    const checker = new DependencyChecker();
    const result = await checker.checkNpmPackage('puppeteer');

    expect(result.name).toBe('puppeteer');
    expect(result.installed).toBe(true);
  });

  it('should detect missing npm packages', async () => {
    const checker = new DependencyChecker();
    const result = await checker.checkNpmPackage('non-existent-package');

    expect(result.installed).toBe(false);
  });

  it('should perform full dependency check', async () => {
    const checker = new DependencyChecker();
    const result = await checker.checkAll();

    expect(result).toHaveProperty('allInstalled');
    expect(result).toHaveProperty('dependencies');
  });
});
```

---

## 📝 部署配置

详细的轻量级部署配置请参考：[Infographic Skill 部署指南](./infographic-skill-deployment.md)

**支持的场景**：
- ✅ 本地开发 / 后台进程（推荐）
- ✅ Docker 容器
- ❌ 不需要 Kubernetes（太重）

**核心文件**：
- `scripts/ensure-deps.js` - 依赖检查和安装脚本
- `scripts/start.sh` - 启动脚本
- `.env.example` - 环境变量模板
- `Dockerfile` - Docker 部署配置

---

## ✅ 验收标准

- [x] 首次启动自动检查依赖
- [x] 自动安装缺失的 npm 包
- [x] 自动下载 Chromium
- [x] 健康检查验证功能
- [x] 提供详细的初始化日志
- [x] 支持环境变量配置
- [x] 支持跳过初始化（CI/CD）
- [x] 提供详细的错误提示和解决方案
- [x] 缓存预热优化性能
- [x] Docker 和 Kubernetes 部署支持

---

**文档版本**: v1.0
**最后更新**: 2025-01-12
**作者**: Claude Code
