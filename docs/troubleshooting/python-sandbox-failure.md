# Python Sandbox 执行失败排查指南

## 问题描述

**症状**：
- PTC 代码生成成功，包含正确的技能调用流程
- 任务快速完成（7-12秒），但没有任何输出或 artifacts
- 没有 sandbox 执行日志
- 任务状态显示为成功，但实际没有执行任何技能

**根本原因**：
Python 虚拟环境 (`python_modules/`) 不存在，导致系统回退到系统 Python，
而系统 Python 缺少必要的依赖（如 `pyyaml`），导致技能执行器导入失败。

## 发现路径

这个问题隐藏得很深，因为：

1. **静默失败**：Sandbox 执行失败但返回 `{ success: false }`，没有抛出异常
2. **错误被吞掉**：LocalSandboxAdapter 在 `catch` 块中返回错误，但没有详细日志
3. **任务仍标记成功**：Agent.run() 在某些情况下忽略了 sandbox 的失败状态
4. **日志不完整**：缺少详细的 sandbox 错误日志
5. **没有启动检查**：系统启动时不检查 Python 环境是否完整

**如何发现**：

1. 查看 PTC 代码（确认代码正确）
2. 检查 `/tmp/motia-sandbox/` 目录（确认脚本存在）
3. 手动执行 PTC 脚本（发现 `ModuleNotFoundError: No module named 'yaml'`）
4. 检查 `python_modules/bin/python3` 是否存在（发现不存在）

## 解决方案

### 1. 自动修复（推荐）

运行新添加的环境检查脚本：

```bash
npm run check:python-env
```

这个脚本会：
- 检查 `python_modules/` 是否存在
- 如果不存在，自动创建虚拟环境
- 检查关键依赖（pyyaml, pydantic, anthropic 等）
- 如果缺少依赖，自动从 `requirements.txt` 安装

### 2. 手动修复

```bash
# 创建虚拟环境
python3 -m venv python_modules

# 安装依赖
python_modules/bin/pip install -r requirements.txt
```

### 3. 重启服务

修复后，重启开发服务器：

```bash
npm run dev
```

## 预防措施

### 已实施的改进

1. **启动检查**：`predev` 脚本现在会自动运行 `check:python-env`
2. **更好的错误日志**：LocalSandboxAdapter 现在会识别常见错误并提供修复建议
3. **详细错误信息**：Sandbox 失败时会显示具体的错误类型和原因

### 错误日志示例

修复前：
```
[Sandbox] Execution result: { success: false }
```

修复后：
```
[Sandbox] Execution FAILED - Full stderr: {
  exitCode: 1,
  stderr: "ModuleNotFoundError: No module named 'yaml'"
}
[Sandbox] ⚠️ Python 依赖缺失！请运行: npm run check:python-env
```

## 相关文件

- `/scripts/check-python-env.sh` - Python 环境检查脚本
- `/src/core/sandbox/adapters/local.ts` - Sandbox 执行适配器（已改进错误日志）
- `/requirements.txt` - Python 依赖列表
- `/config/sandbox.config.yaml` - Sandbox 配置

## 常见问题

**Q: 为什么不使用系统 Python？**
A: 系统 Python 可能缺少必要的依赖，或者版本不兼容。使用虚拟环境可以确保依赖隔离和版本一致。

**Q: `requirements.txt` 中有哪些关键依赖？**
A:
- `pyyaml` - YAML 配置解析（必需）
- `pydantic` - 数据验证（必需）
- `anthropic` - Claude AI SDK（必需）
- `httpx` / `aiohttp` - HTTP 客户端（必需）
- 其他技能特定依赖

**Q: 如何验证 Python 环境是否正常？**
A: 运行 `npm run check:python-env`，它会检查所有关键依赖。

**Q: 如果虚拟环境已存在但仍报错怎么办？**
A: 删除 `python_modules/` 目录，然后重新运行 `npm run check:python-env`。

## 技术细节

### Sandbox 执行流程

1. **PTC 生成**：Agent 生成 Python 代码
2. **代码包装**：LocalSandboxAdapter.wrapCode() 包装代码
3. **写入文件**：保存到 `/tmp/motia-sandbox/script_<sessionId>.py`
4. **Spawn 进程**：使用配置的 Python 路径启动子进程
5. **收集输出**：通过 stdout/stderr 收集执行结果
6. **解析结果**：检查 exitCode 和 structured output
7. **返回结果**：返回 `{ success, output, error }`

### 错误传播路径

```
Python ImportError
  ↓
Sandbox exitCode = 1
  ↓
LocalSandboxAdapter.execute() returns { success: false }
  ↓
Agent.run() receives sandboxResult.success = false
  ↓
Task marked as failed (but sometimes this is ignored)
```

### 为什么任务显示为成功？

在某些情况下，Agent.run() 中的错误处理逻辑可能：
- 捕获了 sandbox 错误但没有正确传播
- 使用了默认的成功状态
- 在上层逻辑中被覆盖为成功

这需要在 Agent.run() 中进一步改进错误处理。
