# 前端消息显示测试 - 使用总结

## 📋 测试概述

已创建完整的 Playwright 测试套件，用于验证前端任务详情页的消息显示功能。

### 测试目标

验证以下功能点：

1. ✅ 打开 `http://localhost:5173/tasks/task-1769754178517-1`
2. ✅ 检查左侧进度流面板显示消息
3. ✅ 验证消息内容包括：
   - 任务开始记录
   - remotion-generator 技能消息
   - 用户聊天消息："动画过程中增加一些公式计算过程讲解"
   - 助手回复："抱歉，我没有生成回复。"
4. ✅ 确认没有"暂无任务执行数据"的提示
5. ✅ 验证 `fetchStreamHistory` 函数被调用
6. ✅ 验证 API 响应正确处理
7. ✅ 验证 messages state 正确更新

## 📁 已创建的文件

```
tests/frontend/
├── message-display.spec.js     # 主测试文件（3个测试用例）
├── playwright.config.js         # Playwright 配置
├── run-tests.sh                # 测试运行脚本
├── check-env.sh                # 环境检查脚本
├── prepare-test-data.sh        # 测试数据准备脚本
├── README.md                   # 详细文档（5.5KB）
├── QUICKSTART.md               # 快速开始指南（4.7KB）
├── INDEX.md                    # 测试目录索引（6.3KB）
└── screenshots/                # 测试截图目录（运行时创建）
```

## 🚀 快速开始

### 步骤 1: 环境检查

```bash
cd motia-frontend
npm run test:check-env
```

这会检查：
- Node.js 和 npm 版本
- Playwright 是否已安装
- 前端服务器是否运行
- 后端 API 是否运行
- 测试文件是否存在
- 测试数据是否可用

### 步骤 2: 准备测试数据

```bash
bash ../tests/frontend/prepare-test-data.sh
```

这会验证：
- 任务 `task-1769754178517-1` 是否存在
- Stream 历史数据是否可用
- API 响应是否正确

### 步骤 3: 运行测试

#### 选项 A: 无头模式（快速）

```bash
npm run test:message-display
```

#### 选项 B: 显示浏览器（调试）

```bash
npm run test:message-display:headed
```

#### 选项 C: 调试模式（逐步执行）

```bash
npm run test:debug ../tests/frontend/message-display.spec.js
```

### 步骤 4: 查看结果

#### 终端输出

```
Running 3 tests using 1 worker

✓ [chromium] › 应该显示任务详情页并加载消息 (12.5s)
✓ [chromium] › 应该正确处理 fetchStreamHistory API 调用 (8.3s)
✓ [chromium] › 应该实时更新消息（WebSocket） (15.2s)

3 passed (36.0s)
```

#### HTML 报告

```bash
npm run test:report
```

#### 截图

查看 `tests/frontend/screenshots/` 目录：
- `message-display-01-initial.png`
- `message-display-02-after-load.png`
- `message-display-03-final.png`
- `message-display-04-websocket.png`

## 📊 测试用例详情

### 测试 1: 应该显示任务详情页面并加载消息

**步骤：**
1. 导航到任务详情页面
2. 检查页面基本元素（任务详情容器、任务ID等）
3. 检查进度流面板是否存在
4. 等待消息加载（5秒）
5. 检查消息计数
6. 验证是否有"暂无数据"提示
7. 遍历所有消息气泡，检查内容：
   - 任务开始记录
   - remotion-generator 技能消息
   - 用户聊天消息
   - 助手回复
8. 保存截图（初始、加载后、最终）

**断言：**
- 进度流面板存在
- 找到至少 1 个消息气泡
- 没有显示"暂无数据"

### 测试 2: 应该正确处理 fetchStreamHistory API 调用

**步骤：**
1. 监听网络请求和响应
2. 导航到任务详情页面
3. 等待 API 调用
4. 验证 API 被调用
5. 验证 API 响应格式
6. 检查响应数据

**断言：**
- `fetchStreamHistory` API 被调用
- API 返回 `success: true`
- 响应中包含 `data` 字段

### 测试 3: 应该实时更新消息（WebSocket）

**步骤：**
1. 导航到任务详情页面
2. 等待初始消息加载
3. 记录初始消息数量
4. 等待 5 秒（观察 WebSocket 更新）
5. 检查消息数量是否增加
6. 保存截图

**断言：**
- 初始消息数量 >= 0
- 如果有新消息，数量应该增加

## 🛠️ 可用的 npm 脚本

在 `motia-frontend/package.json` 中已添加：

```json
{
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug",
    "test:ui": "playwright test --ui",
    "test:report": "playwright show-report",
    "test:install": "playwright install",
    "test:message-display": "playwright test ../tests/frontend/message-display.spec.js",
    "test:message-display:headed": "playwright test ../tests/frontend/message-display.spec.js --headed",
    "test:check-env": "bash ../tests/frontend/check-env.sh"
  }
}
```

## 🔧 自定义测试

### 修改任务 ID

```bash
export TASK_ID="task-your-custom-id"
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

# 只测试 API 调用
npx playwright test ../tests/frontend/message-display.spec.js -g "应该正确处理 fetchStreamHistory"
```

## 🐛 调试技巧

### 1. 查看浏览器控制台日志

测试已配置监听控制台，会自动输出：
- `[Stream History]` 日志
- `[Stream]` 日志
- `[TaskDetail]` 日志
- 所有错误和警告

### 2. 监听网络请求

测试会输出：
- 所有 API 请求
- WebSocket 连接
- 响应状态码

### 3. 使用调试模式

```bash
npm run test:debug ../tests/frontend/message-display.spec.js
```

这会打开 Playwright Inspector，可以：
- 逐步执行测试
- 检查页面元素
- 查看选择器
- 手动执行 JavaScript

### 4. 显示浏览器运行

```bash
npm run test:message-display:headed
```

可以看到实际的浏览器操作过程。

## 📖 相关文档

- **详细文档**: `tests/frontend/README.md` - 完整的测试文档
- **快速开始**: `tests/frontend/QUICKSTART.md` - 一分钟上手指南
- **目录索引**: `tests/frontend/INDEX.md` - 测试目录概览
- **前端代码**: `motia-frontend/src/pages/TaskDetail.jsx` - 被测试的页面
- **系统文档**: `docs/implementation/2026-01-27-multi-turn-conversation-system.md` - 多轮对话系统

## ⚠️ 常见问题

### Q: 测试失败，提示"找不到任务详情容器"

**A**: 前端服务器未启动或端口错误

```bash
# 检查前端
curl http://localhost:5173

# 启动前端
cd motia-frontend && npm run dev
```

### Q: 测试失败，提示"没有找到任何消息气泡"

**A**: 后端 API 未运行或没有测试数据

```bash
# 检查后端
curl http://localhost:3000/api/health

# 检查任务数据
curl http://localhost:3000/api/tasks/task-1769754178517-1/stream-history

# 准备测试数据
bash tests/frontend/prepare-test-data.sh
```

### Q: Playwright 浏览器未安装

**A**: 安装 Playwright 浏览器

```bash
cd motia-frontend
npx playwright install
```

### Q: 测试超时

**A**: 网络延迟或服务器响应慢

修改测试超时配置（在 `message-display.spec.js` 中）：
```javascript
page.setDefaultTimeout(60000); // 增加到 60 秒
```

## ✅ 检查清单

在运行测试前，确保：

- [ ] Node.js 已安装（v20+）
- [ ] npm 已安装
- [ ] Playwright 已安装
- [ ] 后端服务器正在运行（`npm run dev`）
- [ ] 前端服务器正在运行（`cd motia-frontend && npm run dev`）
- [ ] 测试任务存在（`task-1769754178517-1`）
- [ ] Stream 历史数据可用

使用环境检查脚本一键验证：
```bash
npm run test:check-env
```

## 🎯 下一步

1. **运行环境检查**
   ```bash
   npm run test:check-env
   ```

2. **准备测试数据**
   ```bash
   bash tests/frontend/prepare-test-data.sh
   ```

3. **运行测试**
   ```bash
   npm run test:message-display
   ```

4. **查看结果**
   ```bash
   npm run test:report
   ```

## 📞 支持

如有问题：
1. 查看 `tests/frontend/README.md`
2. 运行 `npm run test:check-env` 检查环境
3. 查看浏览器控制台日志
4. 查看测试截图
5. 查看 HTML 测试报告

---

**测试文件位置**: `/Users/leo/workspace/myagent/.worktree/feature/multi-turn-conversation/tests/frontend/`

**前端代码位置**: `/Users/leo/workspace/myagent/.worktree/feature/multi-turn-conversation/motia-frontend/src/pages/TaskDetail.jsx`
