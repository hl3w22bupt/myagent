# GLM-4 配置指南

## 🎯 使用 GLM-4 替代 Claude

本指南展示如何使用智谱 GLM-4 模型替代 Anthropic Claude，同时保持环境变量名为 `ANTHROPIC_API_KEY`。

---

## 📋 前提条件

1. 智谱AI API Key
2. Node.js 项目依赖已安装（包括 `openai` 包）
3. Python 虚拟环境已配置

---

## 🔧 配置步骤

### 1. 安装依赖

OpenAI SDK 应该已经安装（支持 GLM-4）：

```bash
npm install openai
```

### 2. 配置环境变量

创建或编辑 `.env` 文件：

```bash
# LLM Configuration
# 使用智谱 GLM-4 的 API Key
ANTHROPIC_API_KEY=your_glm_api_key_here

# 使用 OpenAI 兼容模式（智谱 GLM-4 兼容 OpenAI API）
DEFAULT_LLM_PROVIDER=openai-compatible

# 模型名称
DEFAULT_LLM_MODEL=glm-4

# 可选：自定义 API 地址（智谱 GLM-4）
# LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
```

**注意**：
- 环境变量名保持 `ANTHROPIC_API_KEY`，但实际值是智谱的 API key
- `DEFAULT_LLM_PROVIDER` 设置为 `openai-compatible` 以使用 OpenAI SDK
- `LLM_BASE_URL` 默认为智谱的 API 地址，可选

---

## 🎯 支持的 LLM 提供商

### 1. 智谱 GLM-4（推荐）

```bash
ANTHROPIC_API_KEY=your_glm_api_key
DEFAULT_LLM_PROVIDER=openai-compatible
DEFAULT_LLM_MODEL=glm-4
# LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
```

**可用模型**：
- `glm-4` - GLM-4 主模型
- `glm-4-flash` - GLM-4 Flash（快速版）
- `glm-4-plus` - GLM-4 Plus（增强版）
- `glm-4-air` - GLM-4 Air（轻量版）

### 2. Anthropic Claude（原版）

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5
# LLM_BASE_URL=https://api.anthropic.com
```

**可用模型**：
- `claude-sonnet-4-5` - Claude Sonnet 4.5
- `claude-opus-4-5` - Claude Opus 4.5
- `claude-haiku-4-5` - Claude Haiku 4.5

### 3. 其他 OpenAI 兼容的模型

```bash
ANTHROPIC_API_KEY=your_api_key
DEFAULT_LLM_PROVIDER=openai-compatible
DEFAULT_LLM_MODEL=your_model_name
LLM_BASE_URL=https://your-api-endpoint
```

---

## 🔍 代码架构

### LLM 客户端统一接口

新增了 `LLMClient` 类，提供统一的接口：

```typescript
import { LLMClient } from '@/core/agent/llm-client';

const client = new LLMClient({
  provider: 'openai-compatible',  // 或 'anthropic'
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
  model: 'glm-4'
});

// 统一的调用接口
const response = await client.messagesCreate([
  { role: 'user', content: 'Hello!' }
]);

console.log(response.content);
```

### Agent 配置

```typescript
import { Agent } from '@/core/agent/agent';

// Agent 会自动从环境变量读取配置
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.',
  availableSkills: ['summarize', 'code-analysis'],
  // LLM 配置会自动从环境变量读取：
  // - ANTHROPIC_API_KEY
  // - DEFAULT_LLM_PROVIDER
  // - DEFAULT_LLM_MODEL
  // - LLM_BASE_URL
});
```

---

## ✅ 验证配置

运行测试验证配置是否正确：

```bash
# 运行集成测试
npm test -- tests/integration/agent-skill-standalone.test.ts

# 运行性能测试
npm test -- tests/performance/agent-performance.test.ts
```

如果配置正确，测试应该能够使用 GLM-4 模型生成 PTC 代码。

---

## 📊 GLM-4 vs Claude 对比

| 特性 | GLM-4 | Claude Sonnet 4.5 |
|------|-------|-------------------|
| **上下文长度** | 128K tokens | 200K tokens |
| **响应速度** | 更快 | 快 |
| **中文支持** | 优秀 | 良好 |
| **代码生成** | 优秀 | 优秀 |
| **推理能力** | 良好 | 优秀 |
| **API 价格** | 更低 | 较高 |
| **API 兼容性** | OpenAI 格式 | Anthropic 格式 |

---

## 🎨 实际使用示例

### 示例 1: 使用 GLM-4

```typescript
const agent = new Agent({
  systemPrompt: '你是一个中文助手。',
  availableSkills: ['summarize']
});

const result = await agent.run('请总结以下内容：...');
console.log(result.output);
```

### 示例 2: 编程时切换模型

```typescript
// 使用 GLM-4（中文任务）
process.env.DEFAULT_LLM_PROVIDER = 'openai-compatible';
process.env.DEFAULT_LLM_MODEL = 'glm-4';
const chineseAgent = new Agent({...});

// 使用 Claude（复杂推理）
process.env.DEFAULT_LLM_PROVIDER = 'anthropic';
process.env.DEFAULT_LLM_MODEL = 'claude-opus-4-5';
const reasoningAgent = new Agent({...});
```

### 示例 3: 显式配置（覆盖环境变量）

```typescript
const agent = new Agent({
  systemPrompt: 'You are a helpful assistant.',
  availableSkills: ['web-search'],
  llm: {
    provider: 'openai-compatible',
    model: 'glm-4-flash',  // 使用快速版
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/'
  }
});
```

---

## 🐛 故障排除

### 问题 1: API 调用失败

**症状**: `Error: 401 Unauthorized` 或 `Error: Incorrect API key provided`

**解决方案**:
1. 检查 `ANTHROPIC_API_KEY` 是否正确
2. 确认 API key 有效且有足够配额
3. 检查 `DEFAULT_LLM_PROVIDER` 是否为 `openai-compatible`

### 问题 2: 模型不响应

**症状**: 请求超时或返回空响应

**解决方案**:
1. 检查网络连接到 `open.bigmodel.cn`
2. 验证 `LLM_BASE_URL` 配置
3. 尝试使用不同的模型（如 `glm-4-flash`）

### 问题 3: JSON 解析失败

**症状**: `Error: Failed to parse plan from LLM response`

**解决方案**:
1. GLM-4 的输出格式可能与 Claude 略有不同
2. 调整 prompt 模板以适应 GLM-4
3. 使用更明确的输出格式要求

---

## 📚 相关文档

- [智谱 GLM-4 API 文档](https://open.bigmodel.cn/dev/api)
- [OpenAI SDK 文档](https://github.com/openai/openai-node)
- [Agent 类型定义](../core/agent/types.ts)
- [LLM 客户端实现](../core/agent/llm-client.ts)

---

## 🎉 总结

✅ **可以使用 GLM-4 的 API key**
✅ **保持环境变量名为 `ANTHROPIC_API_KEY`**
✅ **通过 `DEFAULT_LLM_PROVIDER` 切换提供商**
✅ **统一的 LLM 客户端接口**

---

**最后更新**: 2025-01-08
**状态**: ✅ 支持 GLM-4
