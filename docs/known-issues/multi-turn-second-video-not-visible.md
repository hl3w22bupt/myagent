# 多轮对话 - 第二轮视频不可见问题

**问题ID**: MULTI-TURN-SECOND-VIDEO
**发现日期**: 2026-02-01
**状态**: 待调查
**优先级**: 高

## 问题描述

在多轮对话中，第二轮生成的视频文件已经存在于 `outputs/videos` 目录中，但前端无法显示该视频。

## 复现步骤

1. 在 `feature/multi-turn-conversation` 分支上启动服务
2. 创建一个多轮对话任务（任务ID: `task-1769882139325-1`）
3. 访问任务详情页：http://localhost:5173/tasks/task-1769882139325-1
4. 观察第一轮和第二轮的视频显示情况

## 观察到的现象

### 后端文件存在

```bash
$ ls -lh outputs/videos | grep task-1769882139325-1
-rw-r--r--@ 1 leo  staff   723K  2  1 01:59 task-1769882139325-1_video_1.mp4
-rw-r--r--@ 1 leo  staff   616K  2  1 02:08 task-1769882139325-1_video_2.mp4
```

- ✅ 第一轮视频：`task-1769882139325-1_video_1.mp4` (723KB)
- ✅ 第二轮视频：`task-1769882139325-1_video_2.mp4` (616KB)
- 两个文件都存在且文件大小正常

### 前端表现

- ✅ 第一轮视频：正常显示
- ❌ 第二轮视频：不可见（可能显示错误或不显示）

## 可能的原因

### 1. 前端视频路径问题

**假设**：第二轮视频的路径可能不正确

**需要检查**：
- 前端如何构建视频 URL
- 视频路径是否包含正确的轮次标识
- 路径模板是否正确处理多轮场景

### 2. 输出结果格式问题

**假设**：多轮对话的输出结果格式可能不包含第二轮视频信息

**需要检查**：
- `output-history-tracker.step.ts` 是否正确记录所有轮次的输出
- 任务数据库记录是否包含所有视频路径
- API 响应是否返回完整的视频列表

### 3. 前端渲染逻辑问题

**假设**：前端可能只渲染第一轮的视频

**需要检查**：
- `TaskDetail.jsx` 中的视频渲染逻辑
- 是否正确遍历所有轮次的结果
- 视频组件的条件渲染是否正确

### 4. SSE 流式更新问题

**假设**：第二轮视频的 SSE 事件可能没有正确发送或接收

**需要检查**：
- 第二轮完成时是否发送了 SSE 事件
- 前端是否正确处理第二轮的 SSE 事件
- 事件类型和数据格式是否正确

## 相关代码位置

### 后端
- `steps/streams/output-history-tracker.step.ts` - 输出历史追踪
- `steps/api/stream-history-api.step.ts` - 流式历史 API
- `steps/api/task-chat-api.step.ts` - 任务聊天 API
- `skills/remotion-generator/handler.py` - Remotion 生成器

### 前端
- `motia-frontend/src/pages/TaskDetail.jsx` - 任务详情页
- `motia-frontend/src/services/api.js` - API 服务
- `motia-frontend/src/pages/TaskDetail.css` - 样式文件

## 调查步骤

### 第一步：检查数据库记录

```bash
# 查看任务的完整输出
sqlite3 data/tasks.db "SELECT id, output, updated_at FROM tasks WHERE id = 'task-1769882139325-1';"
```

**检查点**：
- output 字段是否包含两个视频的路径
- 视频路径格式是否正确

### 第二步：检查 API 响应

```bash
# 获取任务详情
curl http://localhost:3000/api/tasks/task-1769882139325-1

# 获取流式历史
curl http://localhost:3000/api/stream-history/task-1769882139325-1
```

**检查点**：
- API 响应是否包含两个视频的信息
- 视频路径是否正确
- 数据结构是否符合前端预期

### 第三步：检查前端渲染逻辑

在 `TaskDetail.jsx` 中添加调试日志：

```javascript
// 在渲染视频的地方
console.log('All video results:', videoResults);
console.log('Video count:', videoResults.length);
```

**检查点**：
- 前端是否接收到两个视频的数据
- 渲染循环是否正确执行
- DOM 元素是否正确创建

### 第四步：检查浏览器控制台

打开浏览器开发者工具，检查：

**Network 标签**：
- 第二个视频文件的请求是否发出
- 请求状态码（200/404/其他）
- 请求 URL 是否正确

**Console 标签**：
- 是否有 JavaScript 错误
- 是否有视频加载错误
- SSE 事件是否正确接收

### 第五步：检查 SSE 流

```bash
# 监听 SSE 流
curl -N http://localhost:3000/api/tasks/stream/task-1769882139325-1
```

**检查点**：
- 第二轮完成时是否发送了事件
- 事件数据是否包含视频路径
- 事件类型是否正确

## 临时解决方案

如果急需查看第二轮视频，可以：

1. 直接访问视频文件：
   ```
   http://localhost:3000/outputs/videos/task-1769882139325-1_video_2.mp4
   ```

2. 或者从文件系统直接播放：
   ```bash
   open outputs/videos/task-1769882139325-1_video_2.mp4
   ```

## 修复建议

### 修复1：确保输出历史包含所有轮次

在 `output-history-tracker.step.ts` 中：

```typescript
// 确保每一轮的输出都被记录
const roundOutput = {
  round: currentRound,
  videos: [videoPath],
  timestamp: Date.now()
};

await appendToHistory(taskId, roundOutput);
```

### 修复2：前端正确渲染多轮视频

在 `TaskDetail.jsx` 中：

```javascript
// 遍历所有轮次的视频
{taskHistory.map((round, index) => (
  <div key={index} className="round-result">
    <h3>第 {round.round} 轮</h3>
    {round.videos.map(video => (
      <video key={video} src={video} controls />
    ))}
  </div>
))}
```

### 修复3：添加第二轮完成事件

在第二轮完成时发送特定的 SSE 事件：

```typescript
await publishToStream(taskId, {
  type: 'round.completed',
  data: {
    round: 2,
    videos: [secondVideoPath]
  }
});
```

## 测试用例

```javascript
// motia-frontend/tests/multi-turn-chat.spec.js
describe('多轮对话视频显示', () => {
  it('应该显示所有轮次的视频', async () => {
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/tasks/task-1769882139325-1');

    // 等待第一轮视频加载
    await page.waitForSelector('video[src*="video_1"]');

    // 等待第二轮视频加载
    await page.waitForSelector('video[src*="video_2"]');

    const videos = await page.$$('video');
    expect(videos.length).toBe(2);
  });
});
```

## 相关 Issue

- 前端任务详情页 Posthook 完成后需要刷新
- 任务状态更新问题
- Agent Hook 进度通知问题

## 参考资料

- 多轮对话实现文档
- Remotion 视频生成文档
- SSE 流式传输文档

---

**记录人**: Leo
**最后更新**: 2026-02-01
**相关任务**: task-1769882139325-1
**测试环境**: feature/multi-turn-conversation 分支
