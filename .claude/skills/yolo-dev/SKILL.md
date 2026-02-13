---
name: yolo-dev
description: 'YOLO 全自动开发模式 - 自动开发、重启服务、真实任务验证、测试失败自动修复循环、生成测试报告、提交 PR。工具: 全部。模型: claude-sonnet-4-5'
---

# YOLO 全自动开发模式

**"You Only Live Once"** - 全自动开发工作流，从需求到真实任务验证完成交付。

## 使用场景

当你需要：
- 🚀 快速开发一个功能，不需要人工干预
- 🔄 **自动重启前后端服务**
- ✅ **提交真实任务验证 E2E（含视频生成和多轮对话）**
- 🔁 **测试失败自动修复，直到完全通过**
- 📊 **自动生成测试报告**
- 🔗 **直接给出可点击的验收链接**
- 📮 **提交 PR（不自动合并）**

## 工作流程

### Phase 0: 环境准备 (开发前必做)

**重要**: 在开始任何开发工作之前，必须创建一个新的 Git 分支！

1. **检查当前状态**
   ```bash
   # 确保工作区干净
   git status
   # 如果有未提交的更改，先保存
   git stash push -m "YOLO: Auto-dev bash before branch creation"
   ```

### Phase 1: 需求分析与规划

1. **理解任务**
   - 读取用户需求
   - 识别涉及的模块和文件
   - 确定测试策略

2. **创建任务追踪**
   ```bash
   # 创建唯一的任务 ID 用于追踪
   TASK_ID="yolo-$(date +%s)"
   echo "Task ID: $TASK_ID"

   # 初始化重试计数器
   RETRY_COUNT=0
   MAX_RETRIES=5
   ```

### Phase 2: YOLO 开发模式

**重要**: 在 YOLO 模式下，Agent 将自动执行所有操作，包括：
- ✏️ 编写代码
- 🔄 修改配置
- 📦 安装依赖
- 🔧 运行构建命令
- ❌ 不会询问用户确认

使用 `motia-developer` 子代理进行开发：
- 严格遵循 `.cursor/rules/motia/` 中的所有指南。
- 所有变更自动提交
- 不会打断流程询问用户

### Phase 3: 测试-修复循环 ⭐ 核心改进

**重要**: YOLO 模式采用"测试-修复-再测试"循环，直到所有测试完全通过！

### Phase 4: 重启服务并真实任务验证 ⭐ 核心

#### 4.1 停止现有服务
```bash
echo ""
echo "🛑 停止现有服务..."
pkill -f "vite" || true
pkill -f "node.*dev" || true
echo "✅ 现有服务已停止"
```

#### 4.2 重启后端服务
```bash
echo ""
echo "🚀 启动后端服务..."
npm run dev > /tmp/yolo-backend.log 2>&1 &
BACKEND_PID=$!

echo "⏳ 等待后端服务启动..."
for i in {1..60}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ 后端服务已启动"
    break
  fi
done

echo "⏳ 等待后端服务启动完成，再启动"
   sleep 3

echo "🏳 等待前端服务启动..."
for i in {1..60}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ 后端服务已启动"
    break
  fi
done
```

#### 4.3 重启前端服务
```bash
echo ""
echo "🚀 启动前端服务..."
npm run start > /tmp/yolo-frontend.log 2>&1 &
FRONTEND_PID=$!

echo "⏳ 等待前端服务启动..."
for i in {1..60}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ 前端服务已启动"
    break
  fi
done
```

#### 4.4 提交真实任务验证 ⭐ 必须包含视频生成和多轮对话

**重要**: 真实任务验证必须包含以下两类测试：

1. **视频生成测试** - 验证 Remotion 视频生成功能正常工作
2. **多轮对话测试** - 验证 Agent 能正确处理同一 session 内的多轮对话

```bash
echo "🧪 提交真实任务进行 E2E 验证..."

# 初始化任务 ID 数组用于后续验收
VERIFIED_TASK_IDS=()

# 记录验证开始时间
E2E_START_TIME=$(date +%s%N)

# 定义测试任务数组
TEST_TASKS=(
  # 视频生成测试
  "生成一个 5 秒的测试视频，内容是 YOLO 自动开发测试，使用默认模板"
  
  # 多轮对话测试 - 包含 "然后" 表示需要两步执行
  "创建一个用户资料，然后修改用户的邮箱为 test@example.com"
)

# 发送多个测试任务
ALL_E2E_PASSED=true
TASK_INDEX=0  # 任务计数器，从 0 开始

for i in "${!TEST_TASKS[@]}"; do
  echo ""
  echo "───────────────────────────────────────────────────────────────────────────────────────────────────────────"
  echo "🧪 E2E 测试 $((TASK_INDEX+1))/${#TEST_TASKS[@]}:"
  echo "────────────────────────────────────────────────────────────────────────────────────────────────────────"
  echo "任务: ${TEST_TASKS[$i]}"

  # ========== 判断任务类型：视频生成 vs 多轮对话 ==========
  # 如果任务描述包含 "然后"、"，" 等连接词，判定为多轮对话任务
  if echo "${TEST_TASKS[$i]}" | grep -qE "(然后|，|之后|接着)"; then
    echo "🔄 多轮对话任务 - 需要两步执行"

    # ========== 多轮对话任务 - 步骤 1: 创建任务 ==========
    echo "📝 步骤 1/2: 创建任务并获取 sessionId..."

    CREATE_RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
      -H "Content-Type: application/json" \
      -d "{
        \"task\": \"${TEST_TASKS[$i]}\",
        \"sessionId\": \"yolo-e2e-test-$TASK_ID-round-$RETRY_COUNT-task-$((TASK_INDEX+1))\"
      }")

    # 解析响应获取 taskId 和 sessionId
    VERIFIED_TASK_ID=$(echo $CREATE_RESPONSE | grep -o '"taskId":"[^"]*' | cut -d'"' -f4)
    SESSION_ID=$(echo $CREATE_RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)

    if [ -n "$VERIFIED_TASK_ID" ] && [ -n "$SESSION_ID" ]; then
      echo "✅ 步骤 1 成功 - 任务已创建"
      echo "📦 Task ID: $VERIFIED_TASK_ID"
      echo "📦 Session ID: $SESSION_ID"
      E2E_MULTI_TURN_STEP1=true
    else
      echo "❌ 步骤 1 失败 - 无法创建任务"
      echo "📋 响应: $CREATE_RESPONSE"
      E2E_MULTI_TURN_STEP1=false
      ALL_E2E_PASSED=false
      TASK_INDEX=$((TASK_INDEX + 1))
      continue
    fi

    # ========== 多轮对话任务 - 步骤 2: 发送后续消息 ==========
    echo "📝 步骤 2/2: 使用 chat API 发送后续消息..."

    # 提取任务中的第二部分操作（"然后"之后的内容）
    SECOND_MESSAGE=$(echo "${TEST_TASKS[$i]}" | sed -E 's/.*然后//')

    CHAT_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/tasks/$VERIFIED_TASK_ID/chat" \
      -H "Content-Type: application/json" \
      -d "{
        \"message\": \"$SECOND_MESSAGE\",
        \"sessionId\": \"$SESSION_ID\"
      }")

    # 检查 chat API 是否成功（只需要 200 状态码）
    CHAT_STATUS=$(echo $CHAT_RESPONSE | grep -o '"status":[0-9][0-9]' | cut -d':' -f2)

    if [ "$CHAT_STATUS" = "200" ]; then
      echo "✅ 步骤 2 成功 - 多轮消息已发送"
      E2E_CHAT_PASSED=true
      # 多轮消息发送成功，记录任务 ID
      VERIFIED_TASK_IDS+=("$VERIFIED_TASK_ID")
    else
      echo "❌ 步骤 2 失败 - Chat API 返回: $CHAT_RESPONSE"
      E2E_CHAT_PASSED=false
      ALL_E2E_PASSED=false
    fi

  else
    # ========== 视频生成任务 = 直接调用 /agent/execute ==========
    echo "📹 视频生成任务 - 直接调用 /agent/execute"

    # 第 1 步：发送任务请求
    RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
      -H "Content-Type: application/json" \
      -d "{
        \"task\": \"${TEST_TASKS[$i]}\",
        \"sessionId\": \"yolo-e2e-test-$TASK_ID-round-$RETRY_COUNT-task-$((TASK_INDEX+1))\"
      }")

    # 解析响应获取 taskId
    VERIFIED_TASK_ID=$(echo $RESPONSE | grep -o '"taskId":"[^"]*' | cut -d'"' -f4)

    if [ -n "$VERIFIED_TASK_ID" ]; then
      echo "✅ 真实任务请求成功！"
      echo "📦 Task ID: $VERIFIED_TASK_ID"
      E2E_REQUEST_PASSED=true
    else
      echo "❌ 真实任务请求失败"
      echo "📋 响应: $RESPONSE"
      E2E_REQUEST_PASSED=false
      VERIFIED_TASK_ID=""
      ALL_E2E_PASSED=false
    fi

    # 如果请求成功，等待视频生成完成并验证结果
    if [ -n "$VERIFIED_TASK_ID" ]; then
      echo "⏳ 等待视频生成完成（最多等待 10 分钟）..."
      TASK_MAX_WAIT=600
      TASK_ELAPSED=0
      E2E_TEST_PASSED=false

      # 轮询任务状态直到完成或超时
      while [ $TASK_ELAPSED -lt $TASK_MAX_WAIT ]; do
        # 获取任务状态
        TASK_RESULT=$(curl -s http://localhost:3000/api/contexts/$VERIFIED_TASK_ID)

        # 解析任务状态 - 提取 status 字段
        TASK_STATUS=$(echo $TASK_RESULT | grep -o '"status":"[^"]*' | cut -d'"' -f4)

        echo "📊 当前状态: $TASK_STATUS (${TASK_ELAPSED}s/${TASK_MAX_WAIT}s)"

        # 检查任务状态
        if [ "$TASK_STATUS" = "completed" ]; then
          echo "✅ 视频生成成功！"
          E2E_TEST_PASSED=true
          break
        elif [ "$TASK_STATUS" = "failed" ]; then
          echo "❌ 视频生成失败！"
          echo "📋 任务详情: $TASK_RESULT"
          E2E_TEST_PASSED=false
          ALL_E2E_PASSED=false
          break
        elif [ "$TASK_STATUS" = "running" ] || [ "$TASK_STATUS" = "pending" ]; then
          # 任务仍在进行中，继续等待
          sleep 5
          TASK_ELAPSED=$((TASK_ELAPSED + 5))
        else
          echo "⚠️ 未知状态: $TASK_STATUS"
          echo "📋 任务响应: $TASK_RESULT"
          # 未知状态视为失败
          E2E_TEST_PASSED=false
          ALL_E2E_PASSED=false
          break
        fi
      done

      # 检查是否超时
      if [ $TASK_ELAPSED -ge $TASK_MAX_WAIT ] && [ "$E2E_TEST_PASSED" = false ]; then
        echo "⏰ 等待视频生成超时（${TASK_MAX_WAIT}秒）"
        echo "📋 最终状态: $TASK_STATUS"
        E2E_TEST_PASSED=false
        ALL_E2E_PASSED=false
      fi

      # 记录任务 ID 用于后续验收
      if [ -n "$VERIFIED_TASK_ID" ]; then
        VERIFIED_TASK_IDS+=("$VERIFIED_TASK_ID")
      fi
    fi
  fi

  # 任务计数器递增
  TASK_INDEX=$((TASK_INDEX + 1))
done
```

#### 4.5 清理测试服务
```bash
echo ""
echo "🧹 清理测试服务..."
kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true

# 额外停止可能残留的进程
pkill -f "vite" || true
pkill -f "node.*dev" || true
echo "✅ 测试服务已清理"
```

#### 4.6 检查所有 E2E 测试是否通过
```bash
if [ "$ALL_E2E_PASSED" = true ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "✅ 所有 E2E 测试通过！"
  echo "═══════════════════════════════════════════════════"
  E2E_PASSED=true
else
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "❌ 部分 E2E 测试失败"
  echo "═════════════════════════════════════════════════"
  E2E_PASSED=false
fi
```

#### 4.7 如果 E2E 测试失败 - 自动修复
```bash
if [ "$ALL_E2E_PASSED" = false ]; then
  echo ""
  echo "🔧 检测到 E2E 测试失败，开始自动修复..."
  echo "─────────────────────────────────────────────────────────────────────────────────────────────────────────────────"

  # 分析测试失败原因
  echo "📋 分析失败原因..."

  # 读取测试输出日志
  echo "📄 测试日志:"

  # 自动修复代码
  echo "🔧 开始自动修复 E2E 问题..."
  echo "请使用 motia-developer agent 分析并修复失败的 E2E 测试..."

  # 这里应该启动修复流程
  # 修复后继续循环，重新测试
  echo ""
  echo "⚠️ 修复完成，将在下一轮循环中重新测试..."
  echo ""

  # 继续循环，不设置 ALL_TESTS_PASSED=true
  continue
```

### Phase 5: 提交 PR ⭐ 不自动合并

**重要**: YOLO 模式不会自动合并到 main，而是提交 PR 供人工审查！

#### 5.1 提交代码到远程
```bash
echo ""
echo "📮 提交代码到远程..."

# 推送当前分支到远程
git push -u origin $YOLO_BRANCH

echo "✅ 分支已推送到远程: origin/$YOLO_BRANCH"
```

#### 5.2 创建 Pull Request
```bash
echo ""
echo "📮 创建 Pull Request..."
echo "────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────"

# 构造 PR 标题
PR_TITLE="✨ [YOLO] $TASK_DESC"

# 构造 PR 描述
PR_BODY="## 🎉 YOLO 自动开发完成

### 📋 任务信息
- **YOLO Task ID**: \`$TASK_ID\`
- **验证 Task IDs**: \`${VERIFIED_TASK_IDS[*]}\`
- **开发分支**: \`$YOLO_BRANCH\`
- **任务描述**: {用户原始需求}
- **开发时间**: {开始时间} -> {结束时间}
- **测试重试次数**: {RETRY_COUNT}

### 📊 测试结果

#### 单元测试
- ✅ 单元测试: 通过
- ✅ 集成测试: 通过
- ✅ E2E 测试: 通过（包含视频生成和多轮对话）
- ✅ Python 测试: 通过

#### 集成测试
- ✅ 单元测试: 通过
- ❌ 集成测试: 失败
- ❌ E2E 测试: 失败

### 📊 总体评估

- **全部测试通过**: ✅ / ❌
- **可以交付验收**: ✅ / ❌

### 📝 备注
{任何需要说明的事项}

---

## 使用场景

当你需要：
- 🚀 快速开发一个功能，不需要人工干预
- 🔄 **自动重启前后端服务**
- ✅ **提交真实任务验证 E2E（含视频生成和多轮对话）**
- 🔁 **测试失败自动修复，直到完全通过**
- 📊 **自动生成测试报告**
- 🔗 **直接给出可点击的验收链接**
- 📮 **提交 PR（不自动合并）**

## 测试任务设计原则

### 真实任务必须包含的类型

1. **视频生成测试** - 验证 Remotion 视频生成功能正常工作
   - 示例任务: "生成一个 5 秒的测试视频，内容是 YOLO 自动开发测试，使用默认模板"
   - 验证标准: 视频文件成功生成，可访问下载

2. **多轮对话测试** - 验证 Agent 能正确处理同一 session 内的多轮对话
   - **执行方式**: 分两步执行
     - 步骤 1: 调用 `/agent/execute` 创建任务，获取 `taskId` 和 `sessionId`
     - 步骤 2: 使用 `/api/tasks/:id/chat` 发送后续消息到同一 `sessionId`

   **示例任务**:
   - "创建一个用户资料，然后修改用户的邮箱为 test@example.com"

### 📊 总体评估

- **全部测试通过**: ✅ / ❌
- **可以交付验收**: ✅ / ❌

### 📝 备注
{任何需要说明的事项}

---

## 测试执行流程

1. **发送任务请求**
   ```bash
   curl -s -X POST http://localhost:3000/agent/execute \
     -H "Content-Type: application/json" \
     -d '{"task": "任务内容", "sessionId": "测试会话 ID"}'
   ```

2. **等待并检查状态**
   ```bash
   # 最多等待 10 分钟（600 秒）
   TASK_MAX_WAIT=600

   while [ $TASK_ELAPSED -lt $TASK_MAX_WAIT ]; do
     # 获取任务状态
     TASK_RESULT=$(curl -s http://localhost:3000/api/contexts/$VERIFIED_TASK_ID)

     # 解析任务状态 - 提取 status 字段
     TASK_STATUS=$(echo $TASK_RESULT | grep -o '"status":"[^"]*' | cut -d'"' -f4)

     echo "📊 当前状态: $TASK_STATUS (${TASK_ELAPSED}s/${TASK_MAX_WAIT}s)"

     # 检查任务状态
     if [ "$TASK_STATUS" = "completed" ]; then
       echo "✅ 任务执行成功！"
       break
     elif [ "$TASK_STATUS" = "failed" ]; then
       echo "❌ 任务执行失败！"
       break
     fi
     done
   ```

3. **多轮对话测试**（使用 chat API）
   ```bash
   # 第一条：创建任务获取 sessionId
   CREATE_RESPONSE=$(curl -s -X POST http://localhost:3000/agent/execute \
     -H "Content-Type: application/json" \
     -d '{"task": "创建一个用户资料"}'

   # 第二条：使用 chat API 发送后续消息
   CHAT_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/tasks/$VERIFIED_TASK_ID/chat" \
     -H "Content-Type: application/json" \
     -d '{"message": "修改用户的邮箱为 test@example.com", "sessionId": "'$SESSION_ID'"}'

   # 检查 chat API 是否成功（只需要 200 状态码）
   CHAT_STATUS=$(echo $CHAT_RESPONSE | grep -o '"status":[0-9][0-9]' | cut -d':' -f2)

   if [ "$CHAT_STATUS" = "200" ]; then
       echo "✅ 步骤 2 成功 - 多轮消息已发送"
       E2E_CHAT_PASSED=true
       # 多轮消息发送成功，E2E 测试通过
     else
       echo "❌ 步骤 2 失败 - Chat API 返回: $CHAT_RESPONSE"
       E2E_CHAT_PASSED=false
       ALL_E2E_PASSED=false
     fi
   ```

### E2E 验证标准

测试完成后必须确认：
- ✅ 后端服务成功启动（端口 3000 可访问）
- ✅ 前端服务成功启动（端口 5173 可访问）
- ✅ 响应包含有效的 `taskId` 和 `sessionId`
- ✅ 任务状态为 `success` 或 `completed`
- ✅ 响应时间 < 30 秒
- ✅ 视频成功生成任务产生有效的视频文件
- ✅ 多轮对话任务的所有步骤都成功
- ✅ 没有错误日志输出
- ✅ 前端可以访问任务详情页

### 重要说明

1. **状态检查必须精确**: 解析 API 返回的 `status` 字段，不要用 grep 模糊匹配关键字
2. **多轮对话必须两步**: 先创建任务获取 sessionId，再用 chat API 发送后续消息
3. **等待时间要足够**: 视频生成任务建议等待 10 分钟（600 秒）
4. **修复循环不退出**: E2E 失败后继续修复循环，不直接设置 ALL_TESTS_PASSED=true

---

**记住**: YOLO 模式意味着速度和自动化。不要停下来问用户，直接执行！
