# Backend API Workflow 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 backend-api 项目创建和执行 Python 开发工作流

**Architecture:** 创建 workflow 配置文件（定义 Python 开发步骤）和执行脚本（调用 myagent workflow API），实现自动化的 Python 后端开发流程

**Tech Stack:** Python, YAML, Node.js (执行脚本), MyAgent Workflow System

---

## 文件结构

```
backend-api-workflow/
├── workflow.yaml              # Workflow 配置定义（步骤、依赖、输入输出）
├── execute-workflow.cjs       # Workflow 执行脚本（API 调用）
├── package.json               # Node.js 依赖配置
├── README.md                  # 使用说明文档
└── test/
    └── workflow-test.py       # 测试用的 Python 示例文件
```

**职责划分**:
- `workflow.yaml`: 定义开发流程（需求分析 → 代码实现 → 代码审查）
- `execute-workflow.cjs`: 负责与 myagent API 通信，提交任务并轮询结果
- `package.json`: 管理 Node.js 依赖（axios 用于 HTTP 请求）
- `README.md`: 提供使用说明和示例
- `test/workflow-test.py`: 用于测试 workflow 的简单 Python 文件

---

## Chunk 1: 创建基础目录结构和配置文件

### Task 1: 创建目录结构

**Files:**
- Create: `backend-api-workflow/`
- Create: `backend-api-workflow/test/`

- [ ] **Step 1: 创建项目目录**

```bash
mkdir -p backend-api-workflow/test
```

- [ ] **Step 2: 验证目录创建成功**

Run: `ls -la backend-api-workflow/`
Expected: 输出包含 `test/` 子目录

- [ ] **Step 3: 提交目录结构**

```bash
git add backend-api-workflow/
git commit -m "feat: create backend-api-workflow directory structure"
```

---

### Task 2: 创建 package.json

**Files:**
- Create: `backend-api-workflow/package.json`

- [ ] **Step 1: 编写 package.json**

```json
{
  "name": "backend-api-workflow",
  "version": "1.0.0",
  "description": "Python backend API workflow execution client",
  "main": "execute-workflow.cjs",
  "scripts": {
    "start": "node execute-workflow.cjs",
    "test": "node execute-workflow.cjs --test"
  },
  "dependencies": {
    "axios": "^1.6.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `cat backend-api-workflow/package.json | node -e "console.log('Valid JSON')"`
Expected: 输出 `Valid JSON`

- [ ] **Step 3: 提交 package.json**

```bash
git add backend-api-workflow/package.json
git commit -m "feat: add package.json with axios dependency"
```

---

## Chunk 2: 创建 Workflow 配置

### Task 3: 编写 workflow.yaml

**Files:**
- Create: `backend-api-workflow/workflow.yaml`

- [ ] **Step 1: 创建 workflow 配置文件**

```yaml
name: "backend-api-python"
description: "Python 后端 API 开发工作流：需求分析 -> 代码实现 -> 代码审查"

# 输入 Schema
input_schema:
  requirement:
    type: string
    required: true
    description: "功能需求描述"
  language:
    type: string
    default: "python"
    description: "编程语言"
  framework:
    type: string
    default: "fastapi"
    description: "Web 框架（fastapi/flask/django）"

# 输出 Schema
output_schema:
  plan:
    type: object
    description: "开发计划"
  implementation:
    type: object
    description: "代码实现"
  review:
    type: object
    description: "代码审查结果"

# 步骤定义
steps:
  # Step 1: 需求分析和计划制定
  - id: analyze
    name: "需求分析"
    agent: developer-engineer
    input:
      task: "分析以下 Python 后端 API 需求，制定详细的开发计划：\n\n需求：{{ input.requirement }}\n\n语言：{{ input.language }}\n框架：{{ input.framework }}\n\n请提供：\n1. API 端点设计\n2. 数据模型\n3. 依赖库\n4. 实现步骤"
      language: "{{ input.language }}"
      framework: "{{ input.framework }}"
    output:
      planResult: "structuredOutput"

  # Step 2: 代码实现
  - id: implement
    name: "代码实现"
    agent: developer-engineer
    depends_on: [analyze]
    input:
      task: "基于以下开发计划，实现完整的 Python 后端 API 代码：\n\n计划：\n{{ planResult }}\n\n请提供：\n1. 完整的 API 代码\n2. 数据模型定义\n3. 依赖配置（requirements.txt）\n4. 简单的使用示例"
      language: "{{ input.language }}"
      framework: "{{ input.framework }}"
      plan: "{{ planResult }}"
    output:
      implementationResult: "structuredOutput"

  # Step 3: 代码审查
  - id: review
    name: "代码审查"
    agent: code-reviewer
    depends_on: [implement]
    input:
      task: "审查以下 Python 后端 API 代码的实现质量：\n\n实现：\n{{ implementationResult }}\n\n请检查：\n1. 代码结构和组织\n2. 错误处理\n3. 安全性（SQL 注入、XSS 等）\n4. 性能考虑\n5. 最佳实践遵循\n6. 潜在的 bug 和改进建议"
      language: "{{ input.language }}"
      code: "{{ implementationResult }}"
    output:
      reviewResult: "structuredOutput"

# 最终输出映射
output:
  plan:
    from: "planResult"
  implementation:
    from: "implementationResult"
  review:
    from: "reviewResult"
```

- [ ] **Step 2: 验证 YAML 格式正确**

Run: `python3 -c "import yaml; yaml.safe_load(open('backend-api-workflow/workflow.yaml'))"; echo "Valid YAML"`
Expected: 输出 `Valid YAML`

- [ ] **Step 3: 提交 workflow 配置**

```bash
git add backend-api-workflow/workflow.yaml
git commit -m "feat: add backend-api-python workflow configuration"
```

---

## Chunk 3: 创建执行脚本

### Task 4: 编写 execute-workflow.cjs

**Files:**
- Create: `backend-api-workflow/execute-workflow.cjs`

- [ ] **Step 1: 创建执行脚本框架**

```javascript
#!/usr/bin/env node

/**
 * Backend API Workflow Execution Client
 *
 * 用于执行 backend-api-python workflow 的客户端脚本
 */

const axios = require('axios');

// 配置
const API_BASE_URL = process.env.MYAGENT_API_URL || 'http://localhost:3000';
const WORKFLOW_NAME = 'backend-api-python';

/**
 * 提交 workflow 执行任务
 */
async function submitWorkflow(requirement, options = {}) {
  const {
    language = 'python',
    framework = 'fastapi',
    sessionId,
  } = options;

  try {
    console.log('📤 Submitting workflow...');
    console.log(`   Workflow: ${WORKFLOW_NAME}`);
    console.log(`   Requirement: ${requirement.substring(0, 50)}...`);

    const response = await axios.post(`${API_BASE_URL}/agent/execute`, {
      task: requirement,
      workflow: WORKFLOW_NAME,
      workflow_input: {
        requirement,
        language,
        framework,
      },
      sessionId,
      app: 'backend-api-workflow',
    });

    if (response.data.success) {
      console.log('✅ Workflow submitted successfully!');
      console.log(`   Task ID: ${response.data.taskId}`);
      console.log(`   Session ID: ${response.data.sessionId}`);
      return {
        taskId: response.data.taskId,
        sessionId: response.data.sessionId,
      };
    } else {
      throw new Error(`Failed to submit workflow: ${response.data.message}`);
    }
  } catch (error) {
    console.error('❌ Error submitting workflow:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * 查询任务状态
 */
async function getTaskStatus(taskId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/agent/result/${taskId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return { status: 'not_found' };
    }
    throw error;
  }
}

/**
 * 获取任务输出
 */
async function getTaskOutput(taskId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/contexts/outputs/${taskId}`);
    return response.data;
  } catch (error) {
    console.warn('⚠️  Could not fetch task output:', error.message);
    return null;
  }
}

/**
 * 轮询任务直到完成
 */
async function waitForCompletion(taskId, options = {}) {
  const {
    interval = 5000,    // 轮询间隔（毫秒）
    timeout = 300000,   // 超时时间（毫秒，5分钟）
  } = options;

  const startTime = Date.now();
  let lastStatus = 'unknown';

  console.log('⏳ Waiting for workflow to complete...');
  console.log(`   Polling interval: ${interval}ms`);
  console.log(`   Timeout: ${timeout}ms`);

  while (Date.now() - startTime < timeout) {
    const result = await getTaskStatus(taskId);

    if (result.status !== lastStatus) {
      console.log(`   Status: ${result.status}`);
      lastStatus = result.status;
    }

    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for task ${taskId} to complete`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  // 解析命令行参数
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node execute-workflow.cjs [options] <requirement>

Options:
  --help, -h          显示帮助信息
  --test              运行测试模式
  --language <lang>   编程语言（默认：python）
  --framework <fw>    Web 框架（默认：fastapi）
  --session-id <id>   会话 ID（用于多轮对话）

Examples:
  node execute-workflow.cjs "创建用户认证 API"
  node execute-workflow.cjs --test
  node execute-workflow.cjs --language python --framework flask "创建图书管理 API"
    `);
    process.exit(0);
  }

  // 测试模式
  if (args.includes('--test')) {
    console.log('🧪 Running in test mode...\n');
    const testRequirement = '创建一个简单的用户 CRUD API，包括创建、读取、更新、删除用户的功能';
    const result = await submitWorkflow(testRequirement, {
      sessionId: 'test-backend-api-session',
    });
    console.log('\nTest task submitted:', result.taskId);
    console.log('Check status manually with:');
    console.log(`  curl http://localhost:3000/agent/result/${result.taskId}`);
    return;
  }

  // 解析选项
  const options = {};
  const flags = [];
  const positionalArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      if (flagName === 'language' || flagName === 'framework' || flagName === 'session-id') {
        options[flagName === 'session-id' ? 'sessionId' : flagName] = args[++i];
      } else {
        flags.push(arg);
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  const requirement = positionalArgs.join(' ');
  if (!requirement) {
    console.error('❌ Error: No requirement provided');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  try {
    // 提交 workflow
    const { taskId, sessionId } = await submitWorkflow(requirement, options);

    // 等待完成
    const result = await waitForCompletion(taskId);

    if (result.status === 'completed') {
      console.log('\n✅ Workflow completed successfully!');

      // 获取输出
      const output = await getTaskOutput(taskId);
      if (output) {
        console.log('\n📄 Output:');
        console.log(JSON.stringify(output, null, 2));
      }
    } else {
      console.log('\n❌ Workflow failed');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 2: 设置执行权限**

Run: `chmod +x backend-api-workflow/execute-workflow.cjs`

- [ ] **Step 3: 验证脚本语法正确**

Run: `node -c backend-api-workflow/execute-workflow.cjs`
Expected: 无输出（语法正确）

- [ ] **Step 4: 提交执行脚本**

```bash
git add backend-api-workflow/execute-workflow.cjs
git commit -m "feat: add workflow execution client script"
```

---

## Chunk 4: 创建文档和测试文件

### Task 5: 编写 README.md

**Files:**
- Create: `backend-api-workflow/README.md`

- [ ] **Step 1: 创建 README 文档**

```markdown
# Backend API Workflow

Python 后端 API 开发的自动化工作流。

## 功能特性

- 🚀 **自动化开发流程**：需求分析 → 代码实现 → 代码审查
- 🐍 **Python 专用**：针对 Python 后端开发优化
- 🔧 **多框架支持**：FastAPI, Flask, Django
- 📊 **结构化输出**：提供开发计划、代码实现、审查结果

## 安装

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 配置 MyAgent 服务

确保 MyAgent 服务运行在 `http://localhost:3000`，或设置环境变量：

\`\`\`bash
export MYAGENT_API_URL="http://your-myagent-server:3000"
\`\`\`

### 3. 注册 Workflow

将 `workflow.yaml` 复制到 MyAgent 项目的 `workflows/backend-api-python/` 目录：

\`\`\`bash
cp workflow.yaml /path/to/myagent/workflows/backend-api-python/
\`\`\`

然后重启 MyAgent 服务。

## 使用方法

### 基本用法

\`\`\`bash
npm start "创建用户认证 API"
\`\`\`

### 指定框架

\`\`\`bash
npm start -- --framework flask "创建博客 API"
\`\`\`

### 多轮对话

\`\`\`bash
npm start -- --session-id my-session "创建第一个功能"
npm start -- --session-id my-session "添加第二个功能"
\`\`\`

### 测试模式

\`\`\`bash
npm test
\`\`\`

## Workflow 步骤

### 1. 需求分析（analyze）

- 分析功能需求
- 设计 API 端点
- 定义数据模型
- 列出依赖库
- 制定实现步骤

### 2. 代码实现（implement）

- 实现完整的 API 代码
- 定义数据模型
- 生成依赖配置
- 提供使用示例

### 3. 代码审查（review）

- 检查代码结构
- 验证错误处理
- 安全性检查
- 性能分析
- 最佳实践建议

## 输出示例

\`\`\`json
{
  "plan": {
    "endpoints": ["/users", "/users/{id}"],
    "models": ["User"],
    "dependencies": ["fastapi", "sqlalchemy"],
    "steps": [...]
  },
  "implementation": {
    "main.py": "...",
    "models.py": "...",
    "requirements.txt": "..."
  },
  "review": {
    "structure": "✅ Good",
    "security": "✅ No issues",
    "suggestions": [...]
  }
}
\`\`\`

## API 端点

- `GET /api/workflows` - 列出所有可用的工作流
- `GET /api/workflows/:name` - 获取工作流详情
- `POST /agent/execute` - 执行工作流

## 故障排除

### Workflow 未找到

\`\`\`bash
# 检查 workflow 是否已注册
curl http://localhost:3000/api/workflows
\`\`\`

### 任务超时

增加超时时间：

\`\`\`javascript
// 在 execute-workflow.cjs 中修改
const timeout = 600000;  // 10 分钟
\`\`\`

### 查看任务状态

\`\`\`bash
curl http://localhost:3000/agent/result/{taskId}
\`\`\`

## 许可证

MIT
```

- [ ] **Step 2: 提交 README**

```bash
git add backend-api-workflow/README.md
git commit -m "docs: add comprehensive README"
```

---

### Task 6: 创建测试文件

**Files:**
- Create: `backend-api-workflow/test/workflow-test.py`

- [ ] **Step 1: 创建测试 Python 文件**

```python
"""
简单的 FastAPI 测试应用

用于测试 backend-api-python workflow
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Test API", version="1.0.0")


class User(BaseModel):
    """用户模型"""
    id: int
    name: str
    email: str


# 模拟数据库
users_db = []
next_id = 1


@app.get("/")
async def root():
    """根路径"""
    return {"message": "Hello World"}


@app.get("/users")
async def list_users():
    """获取所有用户"""
    return {"users": users_db}


@app.get("/users/{user_id}")
async def get_user(user_id: int):
    """获取单个用户"""
    for user in users_db:
        if user["id"] == user_id:
            return user
    return {"error": "User not found"}, 404


@app.post("/users")
async def create_user(user: User):
    """创建用户"""
    global next_id
    user_data = user.dict()
    user_data["id"] = next_id
    next_id += 1
    users_db.append(user_data)
    return user_data


@app.put("/users/{user_id}")
async def update_user(user_id: int, user: User):
    """更新用户"""
    for i, u in enumerate(users_db):
        if u["id"] == user_id:
            users_db[i] = user.dict()
            return users_db[i]
    return {"error": "User not found"}, 404


@app.delete("/users/{user_id}")
async def delete_user(user_id: int):
    """删除用户"""
    for i, u in enumerate(users_db):
        if u["id"] == user_id:
            users_db.pop(i)
            return {"message": "User deleted"}
    return {"error": "User not found"}, 404


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

- [ ] **Step 2: 提交测试文件**

```bash
git add backend-api-workflow/test/workflow-test.py
git commit -m "test: add sample FastAPI application for testing"
```

---

## Chunk 5: 集成和部署

### Task 7: 注册 Workflow 到 MyAgent

**Files:**
- Modify: `/Users/leo/workspace/myagent/workflows/`

- [ ] **Step 1: 创建 workflow 目录**

```bash
mkdir -p /Users/leo/workspace/myagent/workflows/backend-api-python
```

- [ ] **Step 2: 复制 workflow 配置**

```bash
cp backend-api-workflow/workflow.yaml /Users/leo/workspace/myagent/workflows/backend-api-python/
```

- [ ] **Step 3: 验证 workflow 已注册**

```bash
curl http://localhost:3000/api/workflows
```

Expected: 输出包含 `backend-api-python` workflow

- [ ] **Step 4: 提交到 MyAgent 仓库**

```bash
cd /Users/leo/workspace/myagent
git add workflows/backend-api-python/
git commit -m "feat: add backend-api-python workflow"
```

---

### Task 8: 安装依赖和测试

**Files:**
- Execute: `npm install`

- [ ] **Step 1: 安装 Node.js 依赖**

```bash
cd backend-api-workflow
npm install
```

Expected: 成功安装 `axios` 依赖

- [ ] **Step 2: 验证脚本可以运行**

```bash
node execute-workflow.cjs --help
```

Expected: 显示帮助信息

- [ ] **Step 3: 运行测试模式**

```bash
npm test
```

Expected: 任务成功提交，返回 taskId

- [ ] **Step 4: 检查任务状态**

```bash
# 从测试输出中获取 taskId，然后查询
curl http://localhost:3000/agent/result/{taskId}
```

Expected: 返回任务状态（pending/completed/failed）

- [ ] **Step 5: 提交依赖文件**

```bash
git add backend-api-workflow/package-lock.json
git commit -m "chore: add package-lock.json"
```

---

## Chunk 6: 端到端测试

### Task 9: 执行完整的 Workflow

**Files:**
- Test: `backend-api-workflow/execute-workflow.cjs`

- [ ] **Step 1: 提交真实的开发任务**

```bash
cd backend-api-workflow
node execute-workflow.cjs "创建一个待办事项 API，支持创建、读取、更新、删除待办事项"
```

Expected: 任务提交成功，返回 taskId 和 sessionId

- [ ] **Step 2: 监控任务执行**

```bash
# 使用返回的 taskId
watch -n 5 "curl -s http://localhost:3000/agent/result/{taskId} | jq '.status'"
```

Expected: 状态从 `pending` → `running` → `completed`

- [ ] **Step 3: 获取任务输出**

```bash
curl http://localhost:3000/api/contexts/outputs/{taskId} | jq '.'
```

Expected: 返回包含 `plan`, `implementation`, `review` 的输出

- [ ] **Step 4: 验证输出质量**

检查输出是否包含：
- ✅ 详细的 API 设计（plan）
- ✅ 完整的 Python 代码（implementation）
- ✅ 代码审查结果（review）

- [ ] **Step 5: 测试多轮对话**

```bash
node execute-workflow.cjs --session-id test-todo-api "为待办事项 API 添加用户认证"
```

Expected: 使用相同的 sessionId，能够基于之前的上下文继续开发

- [ ] **Step 6: 记录测试结果**

创建 `backend-api-workflow/TEST_RESULTS.md`：

\`\`\`markdown
# 测试结果

## 测试环境
- MyAgent 版本: [版本号]
- Node.js 版本: [版本号]
- 测试日期: 2026-04-06

## 测试用例

### 1. 基本功能测试
- [ ] Workflow 提交成功
- [ ] 任务执行完成
- [ ] 输出格式正确

### 2. 输出质量测试
- [ ] Plan 包含 API 设计
- [ ] Implementation 包含完整代码
- [ ] Review 包含审查意见

### 3. 多轮对话测试
- [ ] Session ID 正常工作
- [ ] 上下文正确传递

### 4. 不同框架测试
- [ ] FastAPI（默认）
- [ ] Flask
- [ ] Django

## 已知问题
- 无

## 改进建议
- 无
\`\`\`

- [ ] **Step 7: 提交测试结果**

```bash
git add backend-api-workflow/TEST_RESULTS.md
git commit -m "test: add end-to-end test results"
```

---

## 验收标准

### 功能完整性
- ✅ Workflow 配置正确定义三个步骤
- ✅ 执行脚本能够提交任务并轮询结果
- ✅ README 提供清晰的使用说明
- ✅ 测试文件可用于验证功能

### 代码质量
- ✅ 所有代码通过语法检查
- ✅ 遵循项目最佳实践
- ✅ 包含适当的错误处理
- ✅ 提供详细的注释和文档

### 集成测试
- ✅ Workflow 成功注册到 MyAgent
- ✅ 执行脚本能够成功提交任务
- ✅ 任务能够完整执行并返回结果
- ✅ 输出符合预期的结构

### 用户体验
- ✅ 命令行界面友好
- ✅ 错误信息清晰
- ✅ 提供帮助文档
- ✅ 支持多种配置选项

---

## 下一步

完成本计划后，可以考虑：

1. **扩展功能**
   - 添加更多 Python 框架支持（Tornado, Sanic）
   - 支持数据库迁移脚本生成
   - 添加 API 文档生成

2. **优化性能**
   - 实现增量开发（只修改部分代码）
   - 添加缓存机制
   - 优化轮询策略

3. **增强体验**
   - 添加进度条显示
   - 支持 Web 界面
   - 集成 CI/CD 流程
