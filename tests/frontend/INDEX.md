# 前端自动化测试

本目录包含使用 Playwright 进行前端自动化测试的脚本和配置。

## 目录结构

```
tests/frontend/
├── message-display.spec.js     # 主测试文件
├── playwright.config.js         # Playwright 配置
├── run-tests.sh                # 测试运行脚本
├── check-env.sh                # 环境检查脚本
├── prepare-test-data.sh        # 测试数据准备脚本
├── README.md                   # 详细文档
├── QUICKSTART.md               # 快速开始指南
├── screenshots/                # 测试截图目录（自动创建）
└── INDEX.md                    # 本文件
```

## 快速链接

- 📖 [详细文档](README.md) - 完整的测试文档
- 🚀 [快速开始](QUICKSTART.md) - 一分钟上手指南
- 🎭 [Playwright 官方文档](https://playwright.dev/)

## 测试概览

### message-display.spec.js

验证前端任务详情页的消息显示功能：

**测试用例：**
1. ✅ 应该显示任务详情页面并加载消息
2. ✅ 应该正确处理 fetchStreamHistory API 调用
3. ✅ 应该实时更新消息（WebSocket）

**验证内容：**
- 页面正确加载
- 进度流面板显示消息
- 消息内容完整（任务记录、技能消息、用户聊天、助手回复）
- API 调用正确
- WebSocket 实时更新

## 使用方法

### 方式 1: npm 脚本（推荐）

```bash
# 在 motia-frontend 目录
cd motia-frontend

# 环境检查
npm run test:check-env

# 准备测试数据
bash ../tests/frontend/prepare-test-data.sh

# 运行测试
npm run test:message-display

# 显示浏览器运行
npm run test:message-display:headed

# 查看报告
npm run test:report
```

### 方式 2: 直接运行脚本

```bash
# 环境检查
tests/frontend/check-env.sh

# 准备测试数据
tests/frontend/prepare-test-data.sh

# 运行测试
tests/frontend/run-tests.sh

# 显示浏览器运行
HEADED=true tests/frontend/run-tests.sh
```

### 方式 3: 直接使用 Playwright

```bash
cd motia-frontend

# 运行测试
npx playwright test ../tests/frontend/message-display.spec.js

# 显示浏览器
npx playwright test ../tests/frontend/message-display.spec.js --headed

# 调试模式
npx playwright test ../tests/frontend/message-display.spec.js --debug
```

## 前置条件

### 1. 安装依赖

```bash
cd motia-frontend
npm install
npx playwright install
```

### 2. 启动后端服务器

```bash
# 项目根目录
npm run dev
```

确保后端运行在 `http://localhost:3000`

### 3. 启动前端服务器

```bash
cd motia-frontend
npm run dev
```

确保前端运行在 `http://localhost:5173`

### 4. 准备测试数据

```bash
tests/frontend/prepare-test-data.sh
```

确保数据库中有任务 `task-1769754178517-1` 的执行数据。

## 输出结果

### 1. 终端输出

详细的执行日志和测试结果：

```
Running 3 tests using 1 worker

✓ [chromium] › message-display.spec.js:15:3 › 应该显示任务详情页并加载消息 (12.5s)
✓ [chromium] › message-display.spec.js:189:3 › 应该正确处理 fetchStreamHistory API 调用 (8.3s)
✓ [chromium] › message-display.spec.js:227:3 › 应该实时更新消息（WebSocket） (15.2s)

3 passed (36.0s)
```

### 2. 截图

自动保存到 `tests/frontend/screenshots/`：

- `message-display-01-initial.png` - 初始加载状态
- `message-display-02-after-load.png` - 消息加载后
- `message-display-03-final.png` - 最终状态
- `message-display-04-websocket.png` - WebSocket 测试后
- `message-display-error-*.png` - 错误状态（如果有）

### 3. HTML 报告

```bash
npm run test:report
```

在浏览器中打开交互式测试报告。

### 4. JSON 报告

```bash
cat motia-frontend/test-results.json | jq .
```

## 脚本说明

### check-env.sh

检查测试环境是否配置正确：

- Node.js 和 npm
- Playwright 安装
- 前端服务器状态
- 后端 API 状态
- 测试文件存在
- 测试数据可用

### prepare-test-data.sh

准备和验证测试数据：

- 检查任务是否存在
- 检查任务状态
- 验证 Stream 历史数据
- 显示 API 响应

### run-tests.sh

运行 Playwright 测试的主脚本：

- 环境检查
- 依赖验证
- 服务器状态检查
- 执行测试
- 生成报告

## 常用命令

```bash
# 环境检查
npm run test:check-env

# 运行所有测试
npm run test

# 运行消息显示测试
npm run test:message-display

# 显示浏览器运行
npm run test:message-display:headed

# 调试模式
npm run test:debug

# UI 模式
npm run test:ui

# 查看报告
npm run test:report

# 安装 Playwright
npm run test:install
```

## 自定义测试

### 修改任务 ID

```bash
export TASK_ID="task-your-id"
npm run test:message-display
```

### 修改前端 URL

```bash
export BASE_URL="http://localhost:3001"
npm run test:message-display
```

### 运行特定测试用例

```bash
# 只测试消息显示
npx playwright test ../tests/frontend/message-display.spec.js -g "应该显示任务详情页面"

# 只测试 API
npx playwright test ../tests/frontend/message-display.spec.js -g "应该正确处理 fetchStreamHistory"
```

## 故障排除

### 前端服务器未运行

```bash
cd motia-frontend
npm run dev
```

### 后端 API 未运行

```bash
npm run dev
```

### Playwright 未安装

```bash
cd motia-frontend
npx playwright install
```

### 测试数据不存在

```bash
# 检查任务数据
tests/frontend/prepare-test-data.sh

# 或使用其他任务 ID
export TASK_ID="another-task-id"
npm run test:message-display
```

## 维护指南

### 添加新的测试用例

在 `message-display.spec.js` 中添加：

```javascript
test('新测试用例', async ({ page }) => {
  await page.goto(TASK_URL);
  // 测试逻辑
});
```

### 修改测试配置

编辑 `playwright.config.js`：

- 超时时间
- 浏览器选项
- 截图和视频设置
- 并发数量

### 添加新的测试文件

1. 创建 `tests/frontend/your-test.spec.js`
2. 使用现有的测试模式
3. 运行测试

## 相关资源

- [前端代码: TaskDetail.jsx](../../motia-frontend/src/pages/TaskDetail.jsx)
- [多轮对话系统文档](../../docs/implementation/2026-01-27-multi-turn-conversation-system.md)
- [API 文档](../../docs/api/multi-turn-chat-api.md)
- [Playwright 文档](https://playwright.dev/)

## 贡献

如果发现问题或需要改进：

1. 检查现有的测试覆盖
2. 添加新的测试用例
3. 更新文档
4. 提交 Pull Request

## 许可

与主项目相同。
