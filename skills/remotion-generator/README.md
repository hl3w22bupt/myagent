# Remotion Generator - Setup Guide

## ⚠️ 重要：首次使用需要设置Template目录

Remotion技能需要一个预安装的template目录才能工作。这个目录包含Remotion CLI、Node.js依赖和浏览器配置。

## 📦 快速设置

### 方法1：自动安装（推荐）

```bash
cd skills/remotion-generator
npm install
```

这将自动创建template目录并安装所有必需的依赖。

### 方法2：手动设置

如果自动安装失败，按照以下步骤手动设置：

#### 1. 创建template目录结构

```bash
cd skills/remotion-generator
mkdir -p template
cd template
```

#### 2. 初始化Remotion项目

```bash
npm init -y
npm install remotion@^4.0 @remotion/cli@^4.0
```

#### 3. 创建基础Remotion配置

创建`package.json`:
```json
{
  "name": "remotion-template",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "remotion": "^4.0.0",
    "@remotion/cli": "^4.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

创建`src/index.ts`:
```typescript
import {Composition} from 'remotion';
import {MinimalVideo} from './MinimalVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MinimalVideo"
        component={MinimalVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
```

创建`src/MinimalVideo.tsx`:
```typescript
import {AbsoluteFill} from 'remotion';

export const MinimalVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: 'white'}} />
  );
};
```

创建`remotion.config.ts`:
```typescript
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

#### 4. 安装 Chrome Headless Shell（必需）

Remotion 需要浏览器来渲染视频。我们使用 Chrome Headless Shell（专为自动化设计的轻量级 Chrome）。

**方法1：自动安装（推荐）**

```bash
cd skills/remotion-generator
bash scripts/install-chrome.sh
```

安装脚本会自动：
- ✅ 检测你的操作系统和架构
- ✅ 下载对应版本的 Chrome Headless Shell
- ✅ 安装到正确的位置：`template/node_modules/.remotion/chrome-headless-shell/`
- ✅ 设置可执行权限
- ✅ 验证安装成功

**支持的平台：**
- macOS (Intel x64 & Apple Silicon arm64)
- Linux (x64 & arm64)

**验证安装：**
```bash
bash scripts/install-chrome.sh --verify
```

**方法2：手动安装（备选）**

如果自动安装失败，可以手动下载：

1. 访问 [Chrome for Testing 下载页面](https://googlechromelabs.github.io/chrome-for-testing/)
2. 找到对应平台的下载链接（版本：134.0.6998.35）
3. 下载并解压到：
   ```
   template/node_modules/.remotion/chrome-headless-shell/
   ├── mac-x64/chrome-headless-shell-mac-x64/chrome-headless-shell
   ├── mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell
   ├── linux64/chrome-headless-shell-linux64/chrome-headless-shell
   └── linux-arm64/chrome-headless-shell-linux-arm64/chrome-headless-shell
   ```
4. 设置可执行权限：`chmod +x chrome-headless-shell`

**直接下载链接：**
- Mac (x64): [chrome-headless-shell-mac-x64.zip](https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.35/mac-x64/chrome-headless-shell-mac-x64.zip)
- Mac (arm64): [chrome-headless-shell-mac-arm64.zip](https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.35/mac-arm64/chrome-headless-shell-mac-arm64.zip)
- Linux (x64): [chrome-headless-shell-linux64.zip](https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.35/linux64/chrome-headless-shell-linux64.zip)
- Linux (arm64): [chrome-headless-shell-linux-arm64.zip](https://storage.googleapis.com/chrome-for-testing-public/134.0.6998.35/linux-arm64/chrome-headless-shell-linux-arm64.zip)

## ✅ 验证安装

运行测试脚本：

```bash
python3 scripts/test-composition-code.py
```

如果成功，你应该看到：
```
✅ 成功!
结果: {'success': True, 'video_path': '...'}
```

## 📁 目录结构

设置完成后，你的目录应该如下：

```
skills/remotion-generator/
├── __init__.py
├── handler.py
├── skill.yaml
├── template/              # ← 需要创建
│   ├── node_modules/      # ← npm install 后生成
│   ├── package.json
│   ├── remotion.config.ts
│   └── src/
│       ├── index.ts
│       └── Root.tsx
└── README.md              # ← 本文件
```

## 🐛 故障排查

### 错误：Chrome Headless Shell not found

**原因**：Chrome Headless Shell 未安装或路径不正确
**解决**：
```bash
bash skills/remotion-generator/scripts/install-chrome.sh
```

如果仍然失败，检查：
1. 你使用的平台是否被支持
2. 网络连接是否正常（需要访问 Google Storage）
3. 是否有足够的磁盘空间

### 错误：Template directory not found

**原因**：template目录不存在
**解决**：运行 `cd skills/remotion-generator && npm install`

### 错误：Chrome binary is not executable

**原因**：Chrome 二进制文件没有可执行权限
**解决**：
```bash
# 自动修复
bash skills/remotion-generator/scripts/install-chrome.sh --verify

# 或手动设置权限
chmod +x template/node_modules/.remotion/chrome-headless-shell/*/chrome-headless-shell-*/chrome-headless-shell
```

### 错误：Cannot find module 'remotion'

**原因**：Node.js依赖未安装
**解决**：`npm install` in template directory

### 错误：Downloading Chrome failed (will retry): read ECONNRESET

**原因**：网络连接失败，无法自动下载 Chrome
**解决**：使用我们的安装脚本手动安装 Chrome Headless Shell
```bash
bash skills/remotion-generator/scripts/install-chrome.sh
```

### 错误：Platform not supported

**原因**：你的平台不在支持列表中
**解决**：
- 支持的平台：macOS (x64/arm64), Linux (x64/arm64)
- Windows 用户可以考虑使用 WSL2 环境

## 📝 注意事项

1. **不要提交template/node_modules到git**：这个目录应该在`.gitignore`中
2. **template目录是本地开发环境**：每个开发者需要独立设置
3. **定期更新依赖**：`npm update` in template directory

## 🎯 下一步

设置完成后，你可以：

1. 测试基础功能：`python3 scripts/test-composition-code.py`
2. 运行golden sample：`python3 scripts/test-golden-sample.py`
3. 在你的Agent中使用remotion-generator skill

## 📚 相关文档

- [Remotion官方文档](https://www.remotion.dev/docs)
- [技能设计文档](../../docs/REMOTION_SKILL_DESIGN.md)
- [技能使用指南](../../docs/REMOTION_SKILL_README.md)
