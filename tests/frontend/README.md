# 前端消息显示测试 - Playwright

## 测试目的

验证前端任务详情页（`http://localhost:5173/tasks/task-1769754178517-1`）的消息显示功能，确保：

1. ✅ 左侧进度流面板正确显示消息
2. ✅ 消息内容包括：
   - 任务开始记录
   - remotion-generator 技能消息
   - 用户聊天消息："动画过程中增加一些公式计算过程讲解"
   - 助手回复："抱歉，我没有生成回复。"
3. ✅ 没有显示"暂无任务执行数据"的提示
4. ✅ `fetchStreamHistory` 函数被正确调用
5. ✅ API 响应被正确处理
6. ✅ messages state 被正确更新

## 前置条件

### 1. 启动后端服务器

```bash
# 在项目根目录
npm run dev
```

确保后端运行在 `http://localhost:3000`

### 2. 启动前端开发服务器

```bash
# 在 motia-frontend 目录
cd motia-frontend
npm run dev
```

确保前端运行在 `http://localhost:5173`

### 3. 确保有测试数据

确保数据库中有任务 `task-1769754178517-1` 的执行数据。

## 运行测试

### 方式 1：使用运行脚本（推荐）

```bash
# 无头模式运行（不显示浏览器）
tests/frontend/run-tests.sh

# 显示浏览器运行（用于调试）
HEADED=true tests/frontend/run-tests.sh
```

### 方式 2：直接使用 Playwright

```bash
# 在 motia-frontend 目录
cd motia-frontend

# 无头模式
npx playwright test ../tests/frontend/message-display.spec.js

# 显示浏览器
npx playwright test ../tests/frontend/message-display.spec.js --headed

# 调试模式（打开 Playwright Inspector）
npx playwright test ../tests/frontend/message-display.spec.js --debug
```

### 方式 3：运行特定测试

```bash
# 只运行第一个测试
npx playwright test ../tests/frontend/message-display.spec.js -g "应该显示任务详情页面并加载消息"

# 只运行 API 测试
npx playwright test ../tests/frontend/message-display.spec.js -g "应该正确处理 fetchStreamHistory"
```

## 测试文件说明

- **message-display.spec.js**: 主测试文件，包含 3 个测试用例
  - `应该显示任务详情页面并加载消息`: 完整的消息显示验证
  - `应该正确处理 fetchStreamHistory API 调用`: API 调用验证
  - `应该实时更新消息（WebSocket）`: WebSocket 实时更新验证

- **playwright.config.js**: Playwright 配置文件

- **run-tests.sh**: 测试运行脚本

## 输出结果

### 1. 终端输出

测试运行时会显示详细的执行日志：

```
====== 测试开始：打开任务详情页 ======
📍 步骤1: 导航到任务详情页面
✅ 页面加载成功
📍 步骤2: 检查页面基本元素
✅ 任务详情容器存在
...
```

### 2. 截图

测试过程中会保存截图到 `tests/frontend/screenshots/`：

- `message-display-01-initial.png`: 初始加载状态
- `message-display-02-after-load.png`: 消息加载后
- `message-display-03-final.png`: 最终状态
- `message-display-error-no-data.png`: 错误状态（如果有）

### 3. HTML 测试报告

```bash
# 查看测试报告
cd motia-frontend
npx playwright show-report playwright-report
```

报告会包含：
- 测试用例执行结果
- 失败截图（如果有）
- 执行时间统计
- 错误堆栈（如果有）

### 4. JSON 报告

```bash
# 查看 JSON 报告
cat motia-frontend/test-results.json | jq .
```

## 调试技巧

### 1. 使用调试模式

```bash
npx playwright test ../tests/frontend/message-display.spec.js --debug
```

这会打开 Playwright Inspector，可以逐步执行测试。

### 2. 显示浏览器运行

```bash
HEADED=true tests/frontend/run-tests.sh
```

可以看到实际的浏览器操作。

### 3. 查看控制台日志

测试已经配置监听浏览器控制台，会自动输出：
- 错误消息
- 警告消息
- `[Stream History]` 相关日志
- `[Stream]` 相关日志
- `[TaskDetail]` 相关日志

### 4. 检查网络请求

测试会监听并输出：
- API 请求
- WebSocket 连接
- 响应状态码

## 常见问题

### Q1: 测试失败，提示"找不到任务详情容器"

**原因**: 前端服务器未启动或端口错误

**解决**:
```bash
# 检查前端服务器
curl http://localhost:5173

# 如果未运行，启动前端
cd motia-frontend && npm run dev
```

### Q2: 测试失败，提示"没有找到任何消息气泡"

**原因**: 后端 API 未运行或没有测试数据

**解决**:
```bash
# 检查后端 API
curl http://localhost:3000/api/health

# 手动测试 API
curl http://localhost:3000/api/tasks/task-1769754178517-1/stream-history
```

### Q3: Playwright 浏览器未安装

**解决**:
```bash
cd motia-frontend
npx playwright install
```

### Q4: 测试超时

**原因**: 网络延迟或服务器响应慢

**解决**: 修改测试超时配置：
```javascript
// 在 message-display.spec.js 中
page.setDefaultTimeout(60000); // 增加到 60 秒
```

## 自定义测试

### 修改测试任务 ID

```bash
export TASK_ID="task-your-custom-id"
tests/frontend/run-tests.sh
```

### 修改前端 URL

```bash
export BASE_URL="http://localhost:3001"
tests/frontend/run-tests.sh
```

### 添加新的测试用例

在 `message-display.spec.js` 中添加：

```javascript
test('我的自定义测试', async ({ page }) => {
  await page.goto(TASK_URL);
  // 你的测试逻辑
});
```

## 相关文档

- [Playwright 官方文档](https://playwright.dev/)
- [前端代码: TaskDetail.jsx](../../motia-frontend/src/pages/TaskDetail.jsx)
- [多轮对话系统文档](../../docs/implementation/2026-01-27-multi-turn-conversation-system.md)

## 维护者

如有问题，请查看：
1. 测试日志输出
2. 截图文件
3. HTML 测试报告
4. 浏览器控制台日志
