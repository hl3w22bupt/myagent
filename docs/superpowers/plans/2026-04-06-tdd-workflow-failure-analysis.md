# tdd-workflow Skill 失败深度分析报告

**任务 ID**: task-1775460090728-1
**任务**: "实现一个简单的限流库"
**失败时间**: 2026-04-06 15:22:14
**失败 Skill**: tdd-workflow

## 执行流程

```
1. MasterAgent 接收任务 → 分配给 simple-dev-workflow
2. simple-dev-workflow 执行步骤：
   ├─ plan 步骤: developer-engineer subagent ✓ 成功
   └─ implement 步骤: developer-engineer subagent
       ├─ claude-code-cli: 生成代码 ✓ 成功（但输出异常）
       ├─ tdd-workflow: 添加测试 ✗ 失败
       └─ python-best-practices: 重构（跳过）
3. 最终状态: failed
```

## 失败原因分析

### 1. **核心问题：claude-code-cli 输出格式不符合预期**

#### 预期输出
`simple-dev-workflow` 期待 `claude-code-cli` 输出：
- 代码文件路径（有 `path` 字段）
- 或表格格式（有 `columns` 和 `rows`）
- 或纯代码字符串

#### 实际输出
```json
{
  "type": "result",
  "subtype": "success",
  "result": "好的，这是一个空的临时工作区。让我通过一些问题来理解你的限流库需求。\n\n**问题 1/5：这个限流库主要用于什么场景？**\n\nA. HTTP API 请求限流（防止接口被过度调用）\nB. 服务间调用限流（微服务场景下的保护）\nC. 资源访问限流（如数据库、缓存等）\nD. 通用限流库（支持多种场景）\n\n请选择一个或多个场景，这样我可以更好地设计接口。",
  "stop_reason": "end_turn",
  "num_turns": 5,
  "session_id": "7949082f-3912-4ecf-b098-dad135785d47"
}
```

这是一个**对话响应**，而不是代码！

### 2. **格式化逻辑问题**

在 sandbox 脚本中（`debug_workflow-简单开发工作流-implement-task-1775460090728-1.py`）：

```python
# Format previous output for tdd-workflow
if isinstance(raw_content, dict) and 'columns' in raw_content and 'rows' in raw_content:
    # 表格格式
    formatted_content = ...
elif isinstance(raw_content, dict) and 'path' in raw_content:
    # 文件路径格式
    formatted_content = raw_content['path']
elif isinstance(raw_content, dict):
    # 其他 dict → JSON 序列化 ← 实际走这里
    import json
    formatted_content = json.dumps(raw_content, ensure_ascii=False, indent=2)
else:
    formatted_content = str(raw_content)
```

实际输出匹配第三种条件，导致整个 JSON 响应被作为 `content` 传递给 `tdd-workflow`。

### 3. **tdd-workflow 接收到错误的输入**

```python
result2 = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='tdd-workflow',
    input_data={
        'task': '为限流库添加完整的测试套件，包括单元测试、集成测试和边界条件测试，确保测试覆盖率达到80%以上',
        'content': formatted_content  # ← 这是一个巨大的 JSON 字符串，包含对话消息！
    }
)
```

`tdd-workflow` 期待：
- 代码内容（用于编写测试）
- 或项目结构信息

实际收到：
- Claude Code CLI 的对话 JSON（包含 session_id, token usage 等）

### 4. **ClaudeSkillHandler 执行失败**

当 `tdd-workflow` 试图处理这个输入时：

```
Error: "Claude Skill execution failed"
```

可能原因：
1. **无法解析对话 JSON** - tdd-workflow 的 SKILL.md 没有定义如何处理这种格式
2. **SKILL.md 找不到项目代码** - skill_root 指向空目录
3. **环境变量缺失** - 没有 `CLAUDE_CODE_CLI_WORKSPACE` 等关键环境变量

### 5. **为什么 claude-code-cli 进入对话模式？**

查看日志：
```
[CLAUDE-CODE-CLI] Environment parameters:
  project_dir: not specified (using temporary workspace)
  language: go (inferred from task)
  branch: main
  model: claude-sonnet-4-5
  timeout: 7200s
```

问题：
- `project_dir: not specified` - 没有指定项目目录
- `using temporary workspace` - 使用临时空目录
- 没有现有代码作为上下文

**结果**：claude-code-cli 认为需要先了解需求，而不是直接生成代码。

## 根本原因总结

### 主因
**Workflow 设计缺陷**：`simple-dev-workflow` 假设 `claude-code-cli` 总是输出代码或文件路径，但实际上它可能输出对话消息。

### 次因
1. **输入数据不足**：任务描述"实现一个简单的限流库"太简单，缺少语言、框架、场景等信息
2. **工作区为空**：临时工作区没有任何现有代码，claude-code-cli 无法推断项目结构
3. **格式化逻辑不健壮**：没有处理对话响应的情况
4. **错误处理缺失**：tdd-workflow 失败时只返回通用错误，没有详细原因

## 日志关键片段

```
[Sandbox] Execution result: {
  exitCode: 0,
  stdoutLength: 2556,
  stderrLength: 57,
  stderrPreview: "Skill 'tdd-workflow' failed on attempt 1, will not retry\n"
}

[Structured Output]
result_type: "error"
success: false
content: {
  type: "execution",
  message: "Claude Skill execution failed"
}
metadata: {
  execution_time: 0,
  skills_used: []
}
```

## 影响范围

- **直接**：task-1775460090728-1 失败
- **间接**：所有使用 `simple-dev-workflow` 且 `claude-code-cli` 输出非代码的任务都会失败
- **用户体验**：前端显示"Claude Skill execution failed"，但无详细信息

## 建议修复方案

### 短期（快速修复）
1. **增强格式化逻辑**：检测对话响应并跳过 tdd-workflow
2. **改进错误消息**：返回具体失败原因而不是通用错误
3. **添加重试逻辑**：检测到对话响应时，用更明确的提示重试

### 中期（架构改进）
1. **修复 claude-code-cli**：
   - 添加 `--force-code` 参数强制生成代码
   - 或在 workflow 中添加明确的提示："直接生成代码，不要提问"

2. **改进 workflow 数据流**：
   - 添加响应类型检测
   - 根据响应类型分支处理

3. **增强 tdd-workflow**：
   - 支持处理空项目
   - 或添加前置检查：如果没有代码，先跳过

### 长期（系统优化）
1. **统一输出格式**：所有 skills 返回标准化的 OutputBuilder 格式
2. **添加类型系统**：明确定义每个 skill 的输入/输出类型
3. **改进错误追踪**：记录完整的堆栈跟踪和调试信息
4. **Workflow 验证**：在执行前验证所有前置条件

## 测试建议

1. **单元测试**：
   - 测试 sandbox 脚本的格式化逻辑
   - 测试各种 claude-code-cli 输出格式

2. **集成测试**：
   - 测试 simple-dev-workflow 的完整流程
   - 测试空工作区场景

3. **端到端测试**：
   - 提交简单任务并验证输出
   - 提交复杂任务并验证多步执行

## 相关文件

- Workflow: `src/core/sandbox/adapters/local.ts` (simple-dev-workflow)
- Skill: `claude_skills/tdd-workflow/SKILL.md`
- Handler: `src/core/skill/handlers/claude_skill_handler.py`
- Sandbox: `/tmp/motia-sandbox/debug_workflow-*.py`

## 后续行动

1. ✅ 分析完成 - 已识别根本原因
2. ⏳ 待修复 - 需要实现上述修复方案
3. ⏳ 待测试 - 修复后需要回归测试
4. ⏳ 待监控 - 部署后监控类似失败

---

**分析时间**: 2026-04-06
**分析人**: Claude (Sonnet 4.6)
**严重性**: 高（影响所有简单开发任务）
