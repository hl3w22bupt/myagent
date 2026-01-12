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

#### 4. 设置Chrome（可选，用于渲染）

Remotion需要浏览器来渲染视频。你需要：

**选项A：使用系统Chrome**
```bash
# macOS
which "Google Chrome"  # 查找Chrome路径
```

**选项B：使用Puppeteer**
```bash
npm install puppeteer
```

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

### 错误：Template directory not found

**原因**：template目录不存在
**解决**：运行 `cd skills/remotion-generator && npm install`

### 错误：Chrome not found

**原因**：Remotion找不到浏览器
**解决**：
- 安装Chrome/Chromium
- 或安装Puppeteer: `npm install puppeteer`

### 错误：Cannot find module 'remotion'

**原因**：Node.js依赖未安装
**解决**：`npm install` in template directory

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
