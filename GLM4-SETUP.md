# 🎉 使用 GLM-4 / GLM-4.7 API Key 配置

## ✅ 是的，你可以使用 GLM 的 API key！

并且环境变量名可以继续使用 `ANTHROPIC_API_KEY`，我们已经做了完整的适配！

**支持两种配置方式：**
1. **Anthropic 兼容模式（推荐）** - 使用 GLM-4.7
2. **OpenAI 兼容模式** - 使用 GLM-4 系列

---

## 🚀 快速开始

### 1. 获取智谱 GLM-4 API Key

访问 [智谱AI开放平台](https://open.bigmodel.cn/)：
1. 注册/登录账号
2. 进入 API Keys 页面
3. 创建新的 API Key
4. 复制 API Key

### 2. 配置 `.env` 文件

#### 方式 1：GLM-4.7 Anthropic 兼容模式（推荐）

复制配置示例：

```bash
cp .env.glm4-anthropic.example .env
```

编辑 `.env` 文件：

```bash
ANTHROPIC_API_KEY=your_actual_glm_api_key_here
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=glm-4.7
LLM_BASE_URL=https://open.bigmodel.cn/api/anthropic
```

**优势**：
- ✅ 使用最新的 GLM-4.7 模型
- ✅ 完全兼容 Anthropic API
- ✅ 更好的错误处理和响应格式
- ✅ 与 Claude Code 配置一致

#### 方式 2：GLM-4 OpenAI 兼容模式

复制配置示例：

```bash
cp .env.glm4.example .env
```

编辑 `.env` 文件：

```bash
ANTHROPIC_API_KEY=your_actual_glm_api_key_here
DEFAULT_LLM_PROVIDER=openai-compatible
DEFAULT_LLM_MODEL=glm-4
```

**重要提示**：
- ✅ 环境变量名保持 `ANTHROPIC_API_KEY`
- ✅ 实际值是你的智谱 API key
- ✅ 根据模式选择 `DEFAULT_LLM_PROVIDER`

### 3. 测试配置

运行测试脚本验证配置：

```bash
npm run test:glm4
```

如果配置正确，你会看到：

```
=== GLM-4 Configuration Test ===

Configuration:
  Provider: openai-compatible
  Model: glm-4
  Base URL: https://open.bigmodel.cn/api/paas/v4/
  API Key: 8a74d5c2d3...

Creating LLM client...
✅ LLM client created

Sending test message...
✅ Message sent successfully!

Response:
---
你好！我是智谱AI开发的大型语言模型GLM-4...
---

✅ GLM-4 is working correctly!
```

---

## 📖 详细配置指南

完整配置指南请查看：

**[docs/glm4-setup-guide.md](docs/glm4-setup-guide.md)**

包含：
- 支持的所有 LLM 提供商
- GLM-4 模型选择（glm-4, glm-4-flash, glm-4-plus, glm-4-air）
- 故障排除
- 实际使用示例

---

## 🎯 支持的 GLM-4 模型

| 模型 | 特点 | 使用场景 |
|------|------|---------|
| **glm-4** | 主模型 | 通用任务，推荐使用 |
| **glm-4-flash** | 快速版 | 需要快速响应的任务 |
| **glm-4-plus** | 增强版 | 复杂推理任务 |
| **glm-4-air** | 轻量版 | 成本敏感型任务 |

配置示例：

```bash
# 使用快速版
DEFAULT_LLM_MODEL=glm-4-flash

# 使用增强版
DEFAULT_LLM_MODEL=glm-4-plus
```

---

## 🔄 切换回 Claude

如果你想切换回 Anthropic Claude：

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5
```

---

## 📊 GLM-4 vs Claude 对比

| 特性 | GLM-4 | Claude Sonnet 4.5 |
|------|-------|-------------------|
| **上下文长度** | 128K | 200K |
| **中文支持** | ⭐⭐⭐⭐⭐ 优秀 | ⭐⭐⭐⭐ 良好 |
| **代码生成** | ⭐⭐⭐⭐⭐ 优秀 | ⭐⭐⭐⭐⭐ 优秀 |
| **推理能力** | ⭐⭐⭐⭐ 良好 | ⭐⭐⭐⭐⭐ 优秀 |
| **响应速度** | ⭐⭐⭐⭐⭐ 更快 | ⭐⭐⭐⭐ 快 |
| **API 价格** | 💰 更低 | 💰💰 较高 |

---

## 🎨 代码示例

### 基础使用（自动从 .env 读取）

```typescript
import { Agent } from '@/core/agent/agent';

// Agent 会自动从 .env 读取配置
const agent = new Agent({
  systemPrompt: '你是一个中文助手。',
  availableSkills: ['summarize', 'code-analysis']
});

const result = await agent.run('请总结以下文章...');
console.log(result.output);
```

### 使用预设配置（推荐）

```typescript
import { LLMClient, LLMPresets } from '@/core/agent/llm-client';
import { PTCGenerator } from '@/core/agent/ptc-generator';

// 方式 1: GLM-4.7 Anthropic 兼容模式（推荐）
const llm = new LLMClient(LLMPresets.glm47Anthropic(process.env.GLM_API_KEY!));

// 方式 2: GLM-4 OpenAI 兼容模式
const llm = new LLMClient(LLMPresets.glm4OpenAI(process.env.GLM_API_KEY!));

// 方式 3: Claude (Anthropic)
const llm = new LLMClient(LLMPresets.claude(process.env.ANTHROPIC_API_KEY!));

// 方式 4: OpenAI
const llm = new LLMClient(LLMPresets.openai(process.env.OPENAI_API_KEY!));

// 使用 PTC Generator
const ptc = new PTCGenerator(llm, skills);
const code = await ptc.generate('创建一个网页...');
```

### 显式配置（完全自定义）

```typescript
// GLM-4.7 Anthropic 兼容模式
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.',
  availableSkills: ['web-search'],
  llm: {
    provider: 'anthropic',
    model: 'glm-4.7',
    apiKey: process.env.GLM_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/anthropic'
  }
});

// GLM-4 OpenAI 兼容模式
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.',
  availableSkills: ['web-search'],
  llm: {
    provider: 'openai-compatible',
    model: 'glm-4-flash',
    apiKey: process.env.GLM_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/'
  }
});
```

---

## 🛠️ 故障排除

### 问题：API 调用失败

```bash
❌ Error: 401 Unauthorized
```

**解决方案**：
1. 检查 API key 是否正确
2. 确认 `.env` 文件中的 API key
3. 验证 `DEFAULT_LLM_PROVIDER=openai-compatible`

### 问题：模型响应慢

**解决方案**：
使用 `glm-4-flash` 快速版：
```bash
DEFAULT_LLM_MODEL=glm-4-flash
```

### 问题：输出格式不符合预期

**解决方案**：
GLM-4 的输出格式可能与 Claude 略有不同。已在代码中做适配，如有问题请查看 `docs/glm4-setup-guide.md`。

---

## 📚 相关文档

- **[GLM-4 配置指南](docs/glm4-setup-guide.md)** - 完整配置说明
- **[智谱 GLM-4 API 文档](https://open.bigmodel.cn/dev/api)** - 官方 API 文档
- **[Phase 4.5 测试报告](docs/phase-4.5-final-report.md)** - 系统测试状态

---

## ✅ 验收检查清单

### 基础功能
- [x] 安装 OpenAI SDK (`npm install openai`)
- [x] 创建 LLMClient 统一接口
- [x] 更新 PTCGenerator 使用 LLMClient
- [x] 更新 Agent 使用 LLMClient
- [x] 更新 MasterAgent 使用 LLMClient
- [x] 环境变量名保持 `ANTHROPIC_API_KEY`

### 双模式支持
- [x] 支持 Anthropic 兼容模式（GLM-4.7）
- [x] 支持 OpenAI 兼容模式（GLM-4）
- [x] 创建 `.env.glm4-anthropic.example` 配置示例
- [x] 创建 `.env.glm4.example` 配置示例
- [x] 更新 `.env.example` 包含多种配置
- [x] 添加 LLMPresets 预设配置类

### 文档和测试
- [x] 创建测试脚本 (`npm run test:glm4`)
- [x] 创建配置指南文档
- [x] 更新 GLM4-SETUP.md 包含双模式说明
- [x] 添加代码示例和最佳实践

---

**状态**: ✅ 完全支持 GLM-4 和 GLM-4.7
**环境变量**: ✅ 保持 `ANTHROPIC_API_KEY`
**支持模式**:
  - ✅ Anthropic 兼容模式（GLM-4.7，推荐）
  - ✅ OpenAI 兼容模式（GLM-4 系列）
**最后更新**: 2025-01-09
