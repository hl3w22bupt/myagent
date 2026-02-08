# Motia Structured Output 故障排查指南

## 问题案例：Web Search Skill 的 Table Artifact 不显示

### 问题现象
- Web search skill 返回的 artifact type 是 `text` 而不是 `table`
- Frontend 收到的 task results 中 `structuredOutput` 和 `artifacts` 都是 null/empty
- Postgres-api-sql-query skill 可以正常渲染表格，但 web-search 不行

### 调查过程（走过的弯路）

#### 阶段 1：对比 Skill 实现 ❌
**尝试**：对比 web-search 和 postgres-api-sql-query 的 handler.py
- 发现 postgres 使用 `.set_result_type("table")` 显式设置类型
- 发现 `set_table()` 方法内部自动设置 `result_type: "table"` (output_builder.py:320)

**结论**：这不是根本原因。两个 skill 的实现方式都是正确的。

**教训**：不要在 skill 层面浪费时间，问题在更上层。

---

#### 阶段 2：检查 Structured Output 文件 ✅
**操作**：直接读取 `/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json`
- 发现文件内容完全正确：`{"result_type": "table", ...}`
- 证明 sandbox 执行层面没有问题

**教训**：当怀疑数据丢失时，先检查源头文件是否正确生成。

---

#### 阶段 3：Debug Agent.run() 返回值 ⚠️
**操作**：在 master-agent 和 agent.ts 中添加 console.log
```typescript
// master-agent.step.ts
const result = await agent.run(taskContext.task, taskId, taskContext.context);
console.log('resultKeys:', Object.keys(result));
// 输出: [success, output, steps, executionTime, metadata]
// ❌ 没有 structuredOutput！
```

**发现**：
- Agent.ts:601 代码确实返回了 `structuredOutput: sandboxResult.structuredOutput`
- 但 master-agent 接收到的 result 对象中没有这个字段
- 可能原因：某处代理/包装器过滤了返回值

**错误操作**：
- ❌ 把 console.log 放在 return 语句后面，导致日志从未执行
- ❌ 添加了大量 DIAGNOSIS 日志，造成日志污染

**教训**：
1. Debug 代码要放在正确的位置
2. 不要过度添加日志，只保留关键信息

---

#### 阶段 4：数据库 Schema 问题 ⚠️
**错误**：发现数据库缺少 `structured_output` 列后，直接添加了列

```sql
ALTER TABLE tasks ADD COLUMN structured_output JSONB;
```

**用户质疑**：
> "为什么添加了 structured_output 列，这是必需的修改，我之前没添加也是可以的啊。"

**反思**：
- 数据库列缺失确实是问题，但不是根本原因
- 之前能"工作"可能是因为没有使用 structured output 功能
- 不要在没有理解原因的情况下修改数据库 schema

**教训**：
1. 数据库修改需要充分理由
2. 要理解"之前为什么能工作"

---

#### 阶段 5：Fallback 解决方案 ✅
**最终方案**：在 master-agent 中添加 fallback 逻辑

```typescript
// steps/agents/master-agent.step.ts (lines 563-583)
const result = await agent.run(taskContext.task, taskId, taskContext.context);

// Fallback: Read structuredOutput from file if Agent didn't return it
if (!result.structuredOutput || Object.keys(result.structuredOutput).length === 0) {
  const fs = await import('fs');
  const structuredOutputPath = `/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json`;

  if (fs.existsSync(structuredOutputPath)) {
    try {
      const fileContent = await fs.promises.readFile(structuredOutputPath, 'utf-8');
      result.structuredOutput = JSON.parse(fileContent);
      logger.info('[master-agent] Loaded structuredOutput from file', {
        taskId,
        resultType: result.structuredOutput?.result_type,
      });
    } catch (error: any) {
      logger.warn('[master-agent] Failed to read structuredOutput from file', {
        taskId,
        error: error.message,
      });
    }
  }
}
```

**为什么这样做**：
- Agent.run() 的返回值可能被某处过滤，无法追踪根本原因
- Structured output 文件已经正确生成（阶段 2 已验证）
- 直接从文件读取是最可靠的方案

**关键点**：
- ✅ 使用 fallback 模式，而不是替代正常流程
- ✅ 添加日志记录 fallback 是否触发
- ✅ 保持向后兼容

---

### 根本原因分析

#### 问题链路
```
Skill Handler (OutputBuilder.set_table())
  ↓ 写入
/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json ✅
  ↓ 读取
SandboxResult.structuredOutput ✅
  ↓ 返回
Agent.run() → structuredOutput ❌ (在这里丢失)
  ↓ 传递
master-agent → result.structuredOutput ❌ (空)
  ↓ 发送
task-result-handler → finalStructuredResult ❌ (空)
  ↓ 创建
store.addArtifact() → 没有 table artifact ❌
```

#### 数据流
1. **Skill 层**（Python）：OutputBuilder 正确设置 `result_type: "table"` ✅
2. **Sandbox 层**：正确生成 structured output 文件 ✅
3. **Agent 层**：sandboxResult.structuredOutput 存在 ✅
4. **返回值层**：Agent.run() 代码返回了 structuredOutput，但实际接收不到 ❌
5. **Event 层**：master-agent 发送事件时 structuredOutput 丢失 ❌

**核心问题**：Agent.run() 的返回值在传递过程中被过滤或截断。

---

### 解决方案总结

#### 立即生效的方案（已实施）

1. **Master-agent Fallback**（主要方案）
   - 位置：`steps/agents/master-agent.step.ts:563-583`
   - 逻辑：如果 result 没有 structuredOutput，从文件读取
   - 优点：绕过了未知的返回值过滤问题
   - 缺点：没有解决根本原因

2. **数据库 Schema 更新**（必需）
   ```sql
   ALTER TABLE tasks ADD COLUMN structured_output JSONB;
   ```
   - 位置：`src/core/database/postgres-store.ts`
   - 用途：持久化 structured output 供前端使用

3. **Result-Logger 处理**（已存在）
   - 位置：`steps/agents/task-result-handler.step.ts:583-490`
   - 逻辑：检查 `result_type === 'table'` 并创建 table artifact
   - 关键代码：
   ```typescript
   if (finalStructuredResult?.result_type === 'table' && finalStructuredResult.content) {
     const content = finalStructuredResult.content as any;
     const columns = content.columns || content.headers || [];
     const rows = content.rows || [];

     await store.addArtifact({
       taskId,
       artifactType: 'table',
       action: 'generated',
       path: artifactPath,
       description: task || title || `Table with ${rowCount} rows`,
       metadata: {
         columnCount: columns.length,
         rowCount,
         columns: columns,
         title: title,
         tableData: { columns, rows, title },
       },
       timestamp: new Date(),
     });
   }
   ```

---

### 经验教训

#### 1. 调试策略
- ✅ **从下往上检查**：先确认最底层（文件）是否正确
- ✅ **使用数据流图**：画出完整的调用链，找出丢失点
- ❌ **不要过早优化**：先解决数据流问题，再考虑性能
- ❌ **不要过度调试**：添加日志要有目的性

#### 2. 代码修改原则
- ✅ **Fallback 优于强行修复**：当无法追踪根本原因时，使用 fallback
- ✅ **保持向后兼容**：不要破坏现有的工作流程
- ❌ **不要修改数据库 schema 除非完全理解**
- ❌ **不要在 return 语句后面写代码**

#### 3. Motia 框架特定知识
- **Structured Output 系统**：
  - Skill 通过 `OutputBuilder` 设置 `result_type`
  - Sandbox 将结构化输出写入 `/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json`
  - Agent.run() 应该返回 `structuredOutput` 字段，但可能被过滤
  - **最佳实践**：在 master-agent 层添加 fallback 逻辑

- **Artifact 创建流程**：
  - Skill 返回结果 → Agent.run() → master-agent emit event → task-result-handler 监听 event → 创建 artifact
  - 关键：task-result-handler 根据 `result_type` 决定创建什么类型的 artifact
  - Table artifact 的数据存储在 `metadata.tableData` 中

- **Event 系统**：
  - master-agent 发出 `agent.task.completed` 事件
  - task-result-handler 订阅该事件并处理
  - 事件数据通过 `emit({ topic: 'agent.task.completed', data: {...} })` 传递

#### 4. 不要做的事
```typescript
// ❌ 错误：在 return 之后写代码
return { success: true, ... };
console.log('这行永远不会执行');

// ❌ 错误：过度调试日志
logger.info('[🔍 DIAGNOSIS] 检查 metadata 的格式', {
  taskId,
  hasMetadata: !!currentTask?.metadata,
  metadataKeysCount: currentMetadataKeys.length,
  isCharIndexed: isCurrentMetadataCharIndexed,
  firstKeys: currentMetadataKeys.slice(0, 20),
  metadataPreview: JSON.stringify(currentTask.metadata).substring(0, 200),
});
// 这样的日志有 40+ 条，造成污染

// ✅ 正确：简洁的日志
logger.info('Task record updated in database', {
  taskId,
  finalStatus,
  hasOutputHistory: !!(latestTask?.metadata?.outputHistory),
});
```

---

### 检查清单

当遇到 structured output 或 artifact 不显示的问题时，按以下顺序检查：

#### Step 1: 确认 Skill 层
- [ ] Skill handler 是否使用了 `OutputBuilder`？
- [ ] 是否调用了 `set_table()` / `set_video()` / `set_code()` 等方法？
- [ ] 方法是否正确传递了数据？

#### Step 2: 确认文件层
- [ ] 检查 `/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json` 是否存在？
- [ ] 文件内容是否正确？特别是 `result_type` 字段
- [ ] 文件是否可读？

#### Step 3: 确认 Agent 层
- [ ] `sandboxResult.structuredOutput` 是否存在？
- [ ] Agent.run() 返回值是否包含 `structuredOutput` 字段？
- [ ] 如果没有，是否触发了 fallback？

#### Step 4: 确认 Event 层
- [ ] master-agent 是否发送了 `agent.task.completed` 事件？
- [ ] 事件数据中是否包含 `structuredOutput`？
- [ ] task-result-handler 是否订阅了该事件？

#### Step 5: 确认 Artifact 层
- [ ] task-result-handler 是否正确识别了 `result_type`？
- [ ] 是否调用了 `store.addArtifact()`？
- [ ] artifact type 是否正确（table/video/code/infographic）？
- [ ] metadata 是否包含所需数据？

#### Step 6: 确认数据库层
- [ ] tasks 表是否有 `structured_output` 列？
- [ ] 数据是否正确存储？
- [ ] artifacts 表是否有对应记录？

---

### 相关文件

#### 核心文件
- `steps/agents/master-agent.step.ts` - Agent 执行入口，fallback 逻辑位置
- `steps/agents/task-result-handler.step.ts` - Artifact 创建逻辑
- `src/core/agent/agent.ts` - Agent.run() 实现
- `src/core/database/postgres-store.ts` - 数据库操作
- `skills/lib/output_builder.py` - Structured output 构建

#### Skill 示例
- `skills/web-search/handler.py` - Web search 实现（table 输出）
- `skills/postgres-api-sql-query/handler.py` - SQL query 实现（table 输出）
- `skills/remotion-generator/handler.py` - Video 生成（video 输出）

#### 配置文件
- `skills/web-search/skill.yaml` - Skill 描述（影响 LLM 选择）

---

### 快速参考

#### Web Search Skill Table 输出的完整流程

```python
# 1. Skill Handler (Python)
output = OutputBuilder()
output.set_table(headers=['Title', 'URL', 'Snippet'], rows=[...])
# 自动设置 result_type = 'table'
print(f'[STRUCTURED_OUTPUT]{structured_output_path}')
```

```typescript
// 2. Sandbox Adapter (TypeScript)
sandboxResult.structuredOutput = {
  result_type: 'table',
  content: { title, columns, rows }
}
```

```typescript
// 3. Master-Agent (TypeScript)
const result = await agent.run(...);
// Fallback: 如果 result.structuredOutput 为空，从文件读取
if (!result.structuredOutput) {
  result.structuredOutput = JSON.parse(
    await fs.promises.readFile(`/tmp/motia-sandbox/structured_outputs/output_${sessionId}.json`)
  );
}
```

```typescript
// 4. Result-Logger (TypeScript)
if (finalStructuredResult?.result_type === 'table') {
  await store.addArtifact({
    artifactType: 'table',
    metadata: { tableData: { columns, rows, title } }
  });
}
```

```typescript
// 5. Frontend (React)
// 从 artifacts 表读取 table artifact
// 渲染表格数据
```

---

### 最后的话

这个问题的核心教训是：**当数据在传递过程中丢失时，直接从源头读取是最可靠的方案。**

与其花费大量时间追踪 Agent.run() 返回值为什么被过滤，不如添加一个简单的 fallback 逻辑。这不是"逃避问题"，而是工程实践中的务实选择。

记住：
- **理解数据流**比盲目修改代码更重要
- **Fallback 模式**比完美解决更实用
- **从下往上调试**比从上往下更高效
- **简洁的日志**比大量的 DIAGNOSIS 更有价值
