# 真实任务执行和Trace验证指南

## 📋 当前状态总结

### ✅ 已完成的工作

1. **OpenClaw Skills Adapter完整实现** (Phase 1 + Phase 2)
   - 26个文件，3260+行代码
   - 3个测试技能已创建
   - 所有组件已测试验证

2. **OpenClaw技能已注册到系统**
   - ✅ skill-loader.ts已更新
   - ✅ 服务器已重启
   - ✅ OpenClaw技能出现在API中
   ```
   test-prompt (pure-prompt)
   test-scripts (hybrid)
   test-dispatch (command-dispatch)
   ```

3. **模拟验证已完成**
   - ✅ Scanner: 发现3个技能
   - ✅ Analyzer: 正确检测类型
   - ✅ {baseDir}: 替换工作正常
   - ✅ Mapper: 转换到myagent格式
   - ✅ Scripts/: 执行成功 (150ms)
   - ✅ Trace结构: 4/4类型验证通过

### 🎯 需要的下一步

要执行**真实任务**并获取**真实的trace数据**，请按以下步骤操作：

---

## 🚀 方法1: 通过Workbench UI执行（推荐）

### 步骤1: 打开Workbench

```bash
# Workbench已经在运行
open http://localhost:3000
```

### 步骤2: 创建新任务

1. 在Workbench中选择一个OpenClaw技能或任意技能
2. 输入任务描述，例如：
   ```
   使用test-prompt技能测试OpenClaw adapter
   ```

### 步骤3: 查看Trace数据

任务执行后，traces会自动记录到数据库。可以通过以下方式查看：

**方式A: 通过API查询**
```bash
# 替换 <task_id> 为实际的任务ID
curl "http://localhost:3000/api/tasks/<task_id>/traces" | jq '.traces'
```

**方式B: 通过查询脚本**
```bash
# 运行数据库查询脚本
python3 query_database_traces.py
```

---

## 🔍 方法2: 通过Event API执行

### 发送执行事件

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventName": "agent.task.execute",
    "data": {
      "task": "使用test-prompt技能测试",
      "sessionId": "test-001",
      "availableSkills": ["test-prompt"]
    }
  }'
```

### 查询执行结果

```bash
# 等待5-10秒后查询
sleep 10

# 查询数据库中的traces
python3 query_database_traces.py
```

---

## 📊 Trace验证检查清单

执行真实任务后，验证以下trace类型是否存在：

### 必需的Trace类型

1. **skill_pre_execution** ✅
   - 记录技能名称、类型
   - 时间戳

2. **llm_call** ✅
   - prompt（提示词）
   - response（响应）
   - tokens（token使用统计）

3. **skill_post_execution** ✅
   - success（成功/失败）
   - execution_time_ms（执行时间）

4. **artifact_inference** ✅
   - inferred_type（推断的类型）
   - confidence（置信度）

---

## 📈 验证结果

### 模拟验证结果（已完成）

```
✅ ALL VALIDATIONS PASSED

Trace Statistics:
  - Total traces: 7
  - Trace types found: 4
  - Missing trace types: 0

Components validated:
  ✓ OpenClaw skill discovery works
  ✓ Skill type detection accurate
  ✓ {baseDir} replacement functional
  ✓ Metadata mapping correct
  ✓ Scripts/ execution working
  ✓ Trace structure complete
  ✓ 4/4 trace types validated
```

### 真实任务验证（待执行）

**状态**: 系统已就绪，等待真实任务执行

**需要的操作**:
1. 通过Workbench或API执行一个任务
2. 从数据库查询trace数据
3. 验证trace完整性

---

## 🎯 成功标准

真实任务验证成功的标准：

- [ ] 任务成功执行完成
- [ ] 至少4个trace类型被捕获
- [ ] skill_pre_execution trace存在
- [ ] llm_call trace包含prompt和response
- [ ] skill_post_execution trace记录执行时间
- [ ] artifact_inference trace推断输出类型
- [ ] 所有trace数据结构符合设计文档

---

## 📝 相关文件

**实现文件**:
- `src/core/skill/adapters/openclaw_*.py` - OpenClaw适配器组件
- `src/core/skill/skill-loader.ts` - 统一技能加载器（已更新）
- `src/core/skill/dependency_checker.py` - 增强的依赖检查器
- `src/core/skill/startup_dependency_scanner.py` - 启动依赖扫描器

**测试文件**:
- `validate_openclaw_real_task.py` - 模拟验证脚本
- `query_database_traces.py` - 数据库查询脚本
- `test_openclaw_*.py` - 组件测试脚本

**文档文件**:
- `VALIDATION_REPORT.md` - 验证报告
- `FINAL_SUMMARY.md` - 实现总结
- `docs/openclaw-skills-adapter-design.md` - 设计文档

---

## 💡 重要提示

1. **服务器正在运行**: Motia dev服务器已在端口3000运行
2. **OpenClaw技能已注册**: 3个测试技能可通过API访问
3. **Trace系统已就绪**: 所有组件支持trace生成
4. **数据库已连接**: PostgreSQL可用于存储traces

**下一步**: 执行一个真实任务来验证完整的trace流程！

---

*生成时间: 2026-03-13*
*状态: 系统就绪，等待真实任务执行*
