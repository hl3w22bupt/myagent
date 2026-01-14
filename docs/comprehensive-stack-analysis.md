# Motia 栈溢出问题 - 全面技术分析

## 🔍 问题概述

**错误类型**: `RangeError: Maximum call stack size exceeded`
**错误位置**: `node_modules/@motiadev/core/dist/src/server.mjs:121-122`
**当前版本**: `0.17.11-beta.194-563479`

---

## 📊 根本原因分析

### 1. **Motia 框架 `wrapObject` 方法无限递归** (主要嫌疑)

**证据**:
- 错误发生在 `main.get` 函数内部
- 调用链: `main.get` → `wrapObject` → `mainGet.apply` → `main.get` (循环)
- beta.194 版本引入的代码变更可能导致此问题

**server.mjs 代码片段**:
```javascript
// Line 121-122
main.get = async (groupId, id) => {
    return wrapObject(groupId, id, await mainGet.apply(main, [groupId, id]));
}
```

**假设**: `wrapObject` 内部可能又调用了包装后的 `main.get`，形成无限递归。

---

### 2. **State 历史数据结构问题** (次要嫌疑)

**当前存储结构** (result-logger.step.ts:150-160):
```typescript
history.unshift({
  taskId: input.taskId,
  timestamp,
  task: input.task,
  success: result.success,
  output: result.output,        // 可能包含大量文本
  error: result.error,          // 可能包含堆栈信息
  executionTime: result.executionTime,
  metadata: result.metadata,    // 可能包含复杂对象
  sessionId: input.sessionId,
});
```

**潜在问题**:
- `result.output` 可能非常大（完整 LLM 响应）
- `result.error` 可能包含完整堆栈跟踪
- `result.metadata` 可能包含深层嵌套对象
- **循环引用**: 如果 `metadata` 包含对父对象的引用

**历史限制**:
- 最多 100 条记录 (line 163-165)
- 每条可能数 KB 到数 MB

---

### 3. **Stream 持久化问题** (次要嫌疑)

**当前存储结构** (master-agent.step.ts:83-90):
```typescript
await streams.taskExecution.set(taskId, taskId, {
  taskId,
  task: input.task,
  status,
  sessionId,
  timestamp: new Date().toISOString(),
  ...data,  // 包含 output, error, metadata 等
});
```

**潜在问题**:
- `data` 对象包含完整的 `result.output` 和 `result.metadata`
- 每个任务创建一个新的 stream entry
- 可能包含大量重复数据

---

### 4. **并发访问问题** (可能性较低)

**场景**:
- 多个请求同时读取/写入同一个 state group
- `state.get` 在数据未完全写入时被调用
- 导致读取到部分数据，触发异常

**当前使用点**:
1. `result-logger.step.ts:146` - 写入历史
2. `agent-results.step.ts:88` - 读取历史
3. `health-check.step.ts:87` - 读取历史
4. `system-api.step.ts:141` - 读取历史

---

## 🔬 深层技术原因

### 可能性 A: **Motia beta.194 `wrapObject` Bug**

**概率**: ⭐⭐⭐⭐⭐ (非常高)

**理由**:
1. 你之前锁定到 beta.193 时问题消失
2. 错误直接发生在 Motia 核心代码
3. 栈溢出模式典型的无限递归

**验证方法**:
```bash
# 1. 锁定到 beta.193
npm install @motiadev/core@0.17.11-beta.193 --save-exact

# 2. 清理并重启
rm -rf .motia && npm run dev

# 3. 运行测试
node scripts/test-ultra-clean.mjs

# 4. 检查错误
tail -100 logs/motia-dev.log | grep -c "RangeError"
```

---

### 可能性 B: **State 数据结构循环引用**

**概率**: ⭐⭐⭐ (中等)

**理由**:
1. `result.metadata` 可能包含复杂对象
2. LLM 返回的 JSON 可能有意外的引用
3. 你的代码没有检查循环引用

**验证方法**:
```typescript
// 在 result-logger.step.ts 中添加循环引用检测
import { detectCircular } from 'circular-json';

const checkCircular = (obj: any): boolean => {
  try {
    JSON.stringify(obj);
    return false;
  } catch (e) {
    return true;
  }
};

if (checkCircular(result)) {
  logger.warn('Circular reference detected in result', {
    taskId: input.taskId,
  });
  return; // 不保存有循环引用的数据
}
```

---

### 可能性 C: **深层数据结构触发 `wrapObject` Bug**

**概率**: ⭐⭐⭐⭐ (高)

**理由**:
1. 即使数据量不大（500 字符），仍会触发栈溢出
2. 说明问题不在数据大小，而在数据结构
3. beta.194 的 `wrapObject` 可能对某些数据结构处理不当

**触发条件**:
- 嵌套对象（metadata → result → metadata）
- 特殊值（Date, RegExp, Function）
- 大量数组元素（100 条历史记录）

---

### 可能性 D: **并发读写竞争条件**

**概率**: ⭐⭐ (较低)

**理由**:
1. Motia 应该有内置的锁机制
2. 错误是栈溢出，不是数据损坏
3. 不太可能导致无限递归

**但值得检查**:
- 是否有多个 step 同时写入 `state.set('agent:execution', 'history')`
- 是否有 step 在读取时同时被写入

---

## 🛠️ 解决方案优先级

### 方案 1: **锁定 Motia 版本到 beta.193** (立即执行)

**优先级**: 🔴 **最高**

**理由**:
- 最简单，最安全
- 已经验证过有效
- 零代码改动

**步骤**:
1. 更新 `package.json`，移除所有 `^` 符号
2. 锁定所有 Motia 包到 `0.17.11-beta.193`
3. 清理并重新安装依赖

**副作用**:
- 无法获得 beta.194 的潜在修复
- 需要手动测试新版本

---

### 方案 2: **添加循环引用检测和数据清理** (可选)

**优先级**: 🟡 **中等**

**理由**:
- 防御性编程
- 避免任何数据结构问题
- 改善数据质量

**实施**:
```typescript
// 1. 截断过长的输出
const MAX_OUTPUT_LENGTH = 1000;
const truncatedOutput = result.output?.slice(0, MAX_OUTPUT_LENGTH);

// 2. 移除可能的循环引用
const { metadata, ...safeResult } = result;

// 3. 只保存必要字段
history.unshift({
  taskId: input.taskId,
  timestamp,
  task: input.task,
  success: result.success,
  output: truncatedOutput,
  error: result.error?.slice(0, 500),
  // 不保存 metadata, sessionId, executionTime
});
```

---

### 方案 3: **禁用 State 持久化** (激进方案)

**优先级**: 🟢 **低** (除非方案 1 失败)

**理由**:
- 核心功能（视频生成）不依赖持久化
- 日志文件已经包含所有信息
- 完全避开 Motia 的 State bug

**实施**:
```typescript
// result-logger.step.ts
logger.info('Execution completed', {
  taskId: input.taskId,
  success: result.success,
  timestamp: new Date().toISOString(),
});
// 不再调用 state.set()
```

---

### 方案 4: **使用外部存储** (长期方案)

**优先级**: 🔵 **未来考虑**

**实施**:
- Redis（快速读写）
- MongoDB（灵活 schema）
- PostgreSQL（关系型）

**优势**:
- 完全避开 Motia 持久化
- 更好的性能和扩展性
- 成熟的解决方案

---

## 📋 验证步骤

### 第 1 步: 锁定版本并测试

```bash
# 1. 更新 package.json
# (手动编辑或使用脚本)

# 2. 清理环境
rm -rf node_modules package-lock.json .motia

# 3. 重新安装
npm install --legacy-peer-deps --ignore-scripts

# 4. 验证版本
npm list @motiadev/core motia

# 5. 启动服务
npm run dev

# 6. 运行测试
node scripts/test-ultra-clean.mjs

# 7. 检查日志
tail -100 logs/motia-dev.log | grep -i "range\|stack"
```

### 第 2 步: 如果仍有问题，启用调试日志

```typescript
// result-logger.step.ts
logger.info('Before state.get', { groupId, key });
const existingHistory = await state.get(groupId, key);
logger.info('After state.get', { historyLength: existingHistory?.length });

logger.info('Before state.set', { historyLength: history.length });
await state.set(groupId, key, history);
logger.info('After state.set');
```

### 第 3 步: 如果问题持续，收集更详细信息

```bash
# 启用 Node.js 调试
NODE_OPTIONS="--stack-trace-limit=100" npm run dev

# 捕获完整的堆栈跟踪
# 查看 wrapObject 的完整调用链
```

---

## 🎯 预期结果

### 成功标准
- ✅ 零栈溢出错误
- ✅ 任务成功执行
- ✅ 视频正常生成
- ✅ 日志显示 "Execution completed"

### 失败迹象
- ❌ 仍有 `RangeError: Maximum call stack size exceeded`
- ❌ 任务执行失败
- ❌ 日志显示 "Error processing message"

---

## 📝 后续监控

### 关键指标
1. **错误数量**: `grep -c "RangeError" logs/motia-dev.log`
2. **任务成功率**: 检查视频生成是否成功
3. **内存使用**: `node --max-old-space-size=4096` 是否需要

### 定期检查
```bash
# 每天检查一次
tail -1000 logs/motia-dev.log | grep -i "error\|range"

# 每周清理一次持久化数据
rm -rf .motia/states/* .motia/streams/*
```

---

## 🏁 结论

**最可能的原因**: Motia beta.194 的 `wrapObject` 方法有 bug

**最安全的解决方案**: 锁定到 beta.193

**次优方案**: 添加数据清理和循环引用检测

**长期方案**: 迁移到外部存储（Redis/MongoDB）

**不推荐**: 完全禁用持久化（除非其他方案都失败）

---

**生成时间**: 2025-01-14
**分析基于**: 当前代码库 + 历史文档 + 错误堆栈跟踪
