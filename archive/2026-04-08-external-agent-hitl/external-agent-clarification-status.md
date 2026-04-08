# External Agent 澄清机制实现状态

## 📊 当前实现（已提交）

### ✅ 已实现的功能

#### 1. **HITL 澄清检测**
- **文件**: `src/core/agent/external-agent.ts`
- **功能**: 检测 ACP 协议返回的 `stopReason: 'awaiting_input'`
- **状态**: ✅ 已实现并测试

#### 2. **提问内容检测（新增）**
- **文件**: `src/core/agent/external-agent.ts`
- **功能**: 检测输出中的提问（即使 stopReason 是 'end_turn'）
- **实现**: `detectQuestionInOutput()` 方法
- **检测模式**:
  ```typescript
  - 中文提问: 请问、您想要、需要...吗、是否、哪个
  - 问号: ? 和 ？
  - 明确请求: 请告诉我、请描述、请说明
  - 多个问号: 3+ ?
  - 常见短语: 什么类型、哪个选项、如何、怎么、为什么
  ```

#### 3. **前端显示组件**
- **ClarificationWaitingCard**: 显示等待澄清的卡片 ✅
- **ClarificationModal**: 澄清输入模态框 ✅
- **useTaskPolling**: 每 5 秒轮询 HITL 状态 ✅

## 🔍 实际测试结果

### 测试案例
```bash
# 任务: "帮我实现一个功能，但是我不确定具体是什么"
# 预期: Claude Code 应该提问并触发澄清
```

### 实际发生的情况

#### 场景 1：Claude Code 直接提问（最常见）
```
输出: "您想要构建什么类型的应用或功能？"
stopReason: 'end_turn' ✅
HITL 触发: ❌ 未触发（旧实现）
HITL 触发: ✅ 会触发（新实现 - 检测提问）
```

#### 场景 2：Claude Code 返回 awaiting_input（罕见）
```
stopReason: 'awaiting_input'
HITL 触发: ✅ 直接触发
```

## 🆕 新改进（已实现，未测试）

### detectQuestionInOutput() 方法

```typescript
private detectQuestionInOutput(output: string): boolean {
  // 检测多种提问模式
  const questionPatterns = [
    /请问.*/,
    /您想要.*/,
    /需要.*吗[？?]?/,
    /\?[^？]*/,
    /\？/,
    /请告诉我/,
    /什么类型/,
    // ... 更多模式
  ];

  return questionPatterns.some(pattern => pattern.test(output));
}
```

### 转换流程

```
Claude Code 返回 stopReason: 'end_turn'
    ↓
ExternalAgent.run() 检测输出中的提问
    ↓
如果发现提问 → 返回 clarification（而非 success）
    ↓
MasterAgent 传递 clarification
    ↓
HITL API 保存状态 (status: 'awaiting')
    ↓
前端显示 ClarificationWaitingCard ✅
```

## 🧪 如何验证新功能

### 1. 重新编译并启动服务
```bash
npm run build
pkill -f "motia start"
npm run start
```

### 2. 提交模糊任务
```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "帮我实现一个功能，但是我不确定具体是什么",
    "workflow": "simple-dev-workflow"
  }'
```

### 3. 检查任务状态
```bash
# 等待 20-30 秒
sleep 20

# 检查是否检测到提问
curl http://localhost:3000/api/contexts/{taskId} | jq '.data.task.metadata.detectedQuestion'

# 检查澄清状态
curl http://localhost:3000/api/hitl/{taskId} | jq '.data.hitlState.status'

# 如果 status === 'awaiting'，说明成功触发！
```

### 4. 前端验证
```bash
# 打开浏览器
open http://localhost:5173/task/{taskId}

# 应该看到：
# - 🟡 "等待澄清回复" 卡片
# - 显示 Claude Code 的提问
# - 输入框允许回复
```

## 📝 限制和注意事项

### 1. **服务稳定性问题**
- 当前服务有 IPC channel closed 错误
- 可能需要清理数据库中的旧 HITL 状态
- 建议：清理并重启服务

### 2. **检测准确性**
- **误报**: 可能把普通的陈述句当作提问
- **漏报**: 某些复杂的提问可能被忽略
- **改进**: 可以添加更多模式和机器学习模型

### 3. **Claude Code 行为不一致**
- 同样的任务有时提问，有时不提问
- 取决于 Claude Code 的内部逻辑
- 建议测试多个不同类型的模糊任务

## 🔮 未来改进方向

### 1. **更智能的提问检测**
- 使用 NLP 模型分析意图
- 检测疑问句的语法结构
- 考虑上下文和对话历史

### 2. **手动触发澄清**
- 允许用户在 UI 上标记"需要澄清"
- 在任务执行过程中暂停并请求澄清

### 3. **多轮对话支持**
- 保存澄清历史
- 支持多轮澄清对话
- 上下文感知的澄清

### 4. **UI 优化**
- 实时显示 Claude Code 的输出
- 在检测到提问时自动暂停
- 允许用户选择"继续"或"澄清"

## 📚 相关文件

- `src/core/agent/external-agent.ts` - 澄清检测逻辑
- `src/core/agent/master-agent.ts` - 澄清信息传递
- `motia-frontend/src/components/task/ClarificationWaitingCard.jsx` - 前端显示
- `steps/api/task-hitl-result-api.step.ts` - HITL API
- `docs/external-agent-clarification.md` - 完整指南

## ✅ 下一步行动

1. **修复服务稳定性问题**
   - 清理数据库中的旧 HITL 状态
   - 修复 IPC channel closed 错误

2. **测试新功能**
   - 编译并重启服务
   - 提交测试任务
   - 验证提问检测是否工作

3. **优化检测算法**
   - 根据测试结果调整模式
   - 减少误报和漏报

4. **完善用户体验**
   - 优化前端显示
   - 添加更多交互选项
   - 改进错误处理

---

**最后更新**: 2026-04-08
**状态**: 新功能已实现，待测试验证
