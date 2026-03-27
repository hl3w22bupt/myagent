# MyAgent 开发测试闭环指南

> 完整的从编码到测试到调试的工作流程

## 🚀 快速开始

### 一键启动测试环境

```bash
# 启动后端（根目录）
cd /Users/leo/workspace/myagent
npm run start &

# 启动前端
cd motia-frontend
npm run dev &

# 验证服务
curl http://localhost:3000/health  # 后端
curl http://localhost:5173          # 前端
```

## 📋 完整测试流程

### Step 1: 提交测试任务

```bash
# 简单测试
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "搜索AI最新进展", "sessionId": "test-123"}')

# 提取taskId
TASK_ID=$(echo $TASK_RESPONSE | jq -r '.taskId')
echo "Task ID: $TASK_ID"
```

### Step 2: 监控任务状态

```bash
# 轮询直到完成
MAX_WAIT=600
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(curl -s http://localhost:3000/api/contexts/$TASK_ID | jq -r '.status')
  echo "Status: $STATUS (${ELAPSED}s)"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
```

### Step 3: 验证结果

```bash
# 检查输出
curl -s http://localhost:3000/api/contexts/outputs/$TASK_ID | jq '.'

# 检查产物
curl -s http://localhost:3000/api/contexts/artifacts/$TASK_ID | jq '.'

# 检查Skill执行
curl -s http://localhost:3000/api/contexts/skill-execution/$TASK_ID | jq '.'
```

### Step 4: 调试失败

```bash
# 查看完整上下文
curl -s http://localhost:3000/api/contexts/$TASK_ID | jq '.'

# 查看日志
tail -n 100 /Users/leo/workspace/myagent/.motia/logs/motia.log | \
  grep -E "ERROR|WARN|$TASK_ID"
```

## 🔍 关键API端点

| 端点 | 用途 |
|------|------|
| `POST /agent/execute` | 提交任务 |
| `GET /api/contexts/:id` | 获取任务上下文 |
| `GET /api/contexts/outputs/:id` | 获取输出 |
| `GET /api/contexts/artifacts/:id` | 获取产物 |
| `GET /api/contexts/skill-execution/:id` | 获取Skill执行记录 |
| `GET /health` | 健康检查 |

## 📝 多轮对话测试

```bash
# 第1轮
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "记住数字42", "sessionId": "multi-turn"}'

# 第2轮（使用相同sessionId）
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "我刚才让你记住的数字是多少？", "sessionId": "multi-turn"}'
```

## ✅ 测试检查清单

- [ ] 后端运行在 3000 端口
- [ ] 前端运行在 5173 端口
- [ ] 成功提交任务并获得 taskId
- [ ] 任务状态达到 "completed"
- [ ] 至少有 2 个输出（user + assistant）
- [ ] Skills 成功执行
- [ ] 上下文中没有错误
- [ ] 多轮对话保持上下文
- [ ] 日志中没有相关错误

## 🤖 使用Subagents自动化

### myagent-developer（开发）

```bash
/agents
→ 选择 myagent-developer
→ "帮我添加一个新的API端点用于获取任务历史"
```

### myagent-test-loop（测试）

```bash
/agents
→ 选择 myagent-test-loop
→ "运行完整的测试循环，验证web-search skill"
```

## 🔄 典型工作流

```
1. myagent-developer: 编写代码
   ↓
2. 代码提交
   ↓
3. myagent-test-loop: 自动化测试
   ↓
4. 如果失败，分析原因
   ↓
5. myagent-developer: 修复问题
   ↓
6. 重复直到测试通过
```

## 💡 调试技巧

### 查看实时日志

```bash
tail -f /Users/leo/workspace/myagent/.motia/logs/motia.log
```

### 过滤特定任务

```bash
grep "task-xxx" /Users/leo/workspace/myagent/.motia/logs/motia.log
```

### 查看Agent状态

```bash
curl http://localhost:3000/api/sessions/{sessionId} | jq '.'
```

## ⚠️ 常见问题

**Q: 任务一直处于 pending 状态**

A: 检查后端日志，确认 Agent Manager 正常工作

**Q: 上下文未保存**

A: 确认数据库已初始化：`npm run db:reset`

**Q: Skill 执行失败**

A: 检查 Skill 是否正确注册：`curl http://localhost:3000/api/skills`

**Q: 前端无法连接后端**

A: 确认两个服务都在运行，并检查CORS配置

## 📚 相关文档

- `AGENTS.md` - 完整项目指南
- `API_REFERENCE.md` - 所有API端点
- `.claude/agents/myagent-test-loop.md` - 测试Agent详细说明
