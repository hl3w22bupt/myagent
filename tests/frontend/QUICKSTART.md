# 快速开始：前端消息显示测试

## 一分钟快速测试

```bash
# 1. 检查环境
npm run test:check-env

# 2. 运行测试（无头模式）
npm run test:message-display

# 3. 查看测试报告
npm run test:report
```

## 详细步骤

### 步骤 1: 确保服务运行

```bash
# 终端 1: 启动后端
cd /path/to/myagent
npm run dev

# 终端 2: 启动前端
cd /path/to/myagent/motia-frontend
npm run dev
```

### 步骤 2: 环境检查

```bash
# 在 motia-frontend 目录
npm run test:check-env
```

预期输出：
```
======================================
  前端测试环境检查
======================================

📦 检查 Node.js...
✅ Node.js 已安装: v20.x.x

📦 检查 npm...
✅ npm 已安装: 10.x.x

🎭 检查 Playwright...
✅ Playwright 已安装

🌐 检查前端服务器...
✅ 前端服务器正在运行: http://localhost:5173

🔌 检查后端 API...
✅ 后端 API 正在运行: http://localhost:3000

📄 检查测试文件...
✅ 测试文件存在: message-display.spec.js
✅ 配置文件存在: playwright.config.js

📁 检查截图目录...
✅ 截图目录存在

🔍 检查测试任务数据...
✅ 任务数据可访问: task-1769754178517-1
```

### 步骤 3: 运行测试

#### 选项 A: 无头模式（推荐用于 CI/CD）

```bash
npm run test:message-display
```

#### 选项 B: 显示浏览器（推荐用于调试）

```bash
npm run test:message-display:headed
```

#### 选项 C: 调试模式

```bash
npm run test:debug ../tests/frontend/message-display.spec.js
```

### 步骤 4: 查看结果

测试运行完成后会看到：

```
Running 3 tests using 1 worker

✓ tests/frontend/message-display.spec.js:15:3 › 应该显示任务详情页并加载消息 (12.5s)
✓ tests/frontend/message-display.spec.js:189:3 › 应该正确处理 fetchStreamHistory API 调用 (8.3s)
✓ tests/frontend/message-display.spec.js:227:3 › 应该实时更新消息（WebSocket） (15.2s)

3 passed (36.0s)
```

### 步骤 5: 查看详细报告

```bash
npm run test:report
```

这会自动在浏览器中打开 HTML 报告。

## 测试验证内容

测试会自动验证：

✅ **页面加载**
  - 任务详情页正常显示
  - 进度流面板存在

✅ **消息显示**
  - 没有显示"暂无任务执行数据"
  - 消息气泡正确渲染
  - 消息数量大于 0

✅ **消息内容**
  - 任务开始记录
  - remotion-generator 技能消息
  - 用户聊天消息
  - 助手回复消息

✅ **API 调用**
  - fetchStreamHistory 被调用
  - API 返回正确格式
  - 数据被正确解析

✅ **状态更新**
  - messages state 被更新
  - UI 正确响应状态变化

## 截图位置

测试会自动保存截图到：
```
tests/frontend/screenshots/
├── message-display-01-initial.png
├── message-display-02-after-load.png
├── message-display-03-final.png
├── message-display-04-websocket.png
└── message-display-error-no-data.png (如果失败)
```

## 常用命令

```bash
# 检查环境
npm run test:check-env

# 运行所有测试
npm run test

# 运行特定测试
npm run test:message-display

# 显示浏览器运行
npm run test:message-display:headed

# 调试模式
npm run test:debug

# UI 模式
npm run test:ui

# 查看报告
npm run test:report

# 安装 Playwright 浏览器
npm run test:install
```

## 故障排除

### 问题：测试失败 - 前端服务器未运行

```bash
# 启动前端服务器
cd motia-frontend
npm run dev
```

### 问题：测试失败 - 后端 API 未运行

```bash
# 启动后端服务器
npm run dev
```

### 问题：Playwright 浏览器未安装

```bash
# 安装 Playwright 浏览器
npm run test:install
```

### 问题：测试数据不存在

确保数据库中有任务 `task-1769754178517-1` 的数据。

可以手动验证：
```bash
curl http://localhost:3000/api/tasks/task-1769754178517-1/stream-history
```

## 自定义测试

### 修改任务 ID

```bash
TASK_ID="task-your-id" npm run test:message-display
```

### 修改前端 URL

```bash
BASE_URL="http://localhost:3001" npm run test:message-display
```

### 运行单个测试用例

```bash
# 只测试消息显示
npx playwright test ../tests/frontend/message-display.spec.js -g "应该显示任务详情页面"

# 只测试 API 调用
npx playwright test ../tests/frontend/message-display.spec.js -g "应该正确处理 fetchStreamHistory"
```

## 相关文件

- **测试文件**: `tests/frontend/message-display.spec.js`
- **配置文件**: `tests/frontend/playwright.config.js`
- **运行脚本**: `tests/frontend/run-tests.sh`
- **环境检查**: `tests/frontend/check-env.sh`
- **详细文档**: `tests/frontend/README.md`

## 支持

如有问题，请查看：
1. 终端输出的错误信息
2. 浏览器控制台日志
3. 截图文件
4. HTML 测试报告
