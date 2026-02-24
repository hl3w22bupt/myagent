# Generators 导入问题修复总结

## 问题描述

在 Linux 环境下，`remotion-generator` skill 无法导入 `generators` 子模块：

```
ModuleNotFoundError: No module named 'generators.llm_analyzer_v2'
Error: LLM generators not available. Please check the installation.
```

## 根本原因

### handler.py 内部导入失败

在 `handler.py` 中使用了相对导入：

```python
from generators.llm_analyzer_v2 import ContentAnalyzerV2 as ContentAnalyzer
from generators.code_generator_v2 import RemotionCodeGeneratorV2 as RemotionCodeGenerator
from generators.validator import CodeValidator
```

虽然这个导入是**相对导入**（当前目录下的 `generators/`），但在模块被 importlib 导入时，Python 需要在 sys.path 中找到 `skills/remotion-generator` 目录。

### 为什么会失败？

当 `importlib.import_module("skills.remotion-generator.handler")` 执行时：
1. ✅ importlib 成功找到并导入 handler（从项目根目录）
2. ❌ 但 handler 内部的 `from generators.xxx` 失败

**原因：** handler 被导入后，其所在的目录 `skills/remotion-generator` 不在 sys.path 中，导致相对导入失败。

## 解决方案

**唯一需要的修改：`skills/remotion-generator/handler.py`**

在模块导入时，将 skill 目录添加到 sys.path 的前面：

```python
# IMPORTANT: Add skill directory to sys.path for relative imports to work
SKILL_DIR = Path(__file__).parent

# Ensure SKILL_DIR is in sys.path for generators imports
# Remove existing entries first to avoid duplicates, then add at front
while str(SKILL_DIR) in sys.path:
    sys.path.remove(str(SKILL_DIR))
sys.path.insert(0, str(SKILL_DIR))
logging.info(f"✅ Added {SKILL_DIR} to sys.path for imports")
```

### 关键点

1. **使用 `while` 循环先移除重复条目** - 避免重复
2. **插入到 sys.path 的开头** - 确保优先级
3. **在模块导入时执行** - 确保 generators 导入之前已经配置好

## 为什么不需要修改 local.ts？

### 原误解

最初认为需要修改 `src/core/sandbox/adapters/local.ts` 添加 `skills` 目录到 sys.path，理由是：
```
importlib.import_module("skills.remotion-generator.handler")
```
需要在 sys.path 中找到 `skills` 包。

### 实际情况

**不需要修改 local.ts！** 因为：

1. **Motia dev 服务器从项目根目录启动**
   ```bash
   npm run dev  # 在 /root/workspace/myagent 执行
   ```

2. **Python 自动从当前工作目录查找模块**
   - 当 importlib 尝试导入 `skills.xxx.handler` 时
   - Python 自动从当前目录（项目根）查找 `skills/` 包
   - 成功找到并导入 handler

3. **验证测试**
   ```python
   # 从项目根目录运行
   cd /root/workspace/myagent
   import importlib
   # 即使 sys.path 没有显式包含 skills/，也能成功
   module = importlib.import_module("skills.remotion-generator.handler")
   # ✅ 成功！
   ```

### 为什么最初认为需要两个修改？

因为在测试时，如果从非项目根目录运行，或者清空了 sys.path，确实需要 `skills/` 在 sys.path 中。但在实际运行环境中，Motia dev 服务器总是从项目根目录启动，所以不需要额外配置。

## 修改前后对比

### 修改前
```python
SKILL_DIR = Path(__file__).parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))
    logging.info(f"Added {SKILL_DIR} to sys.path for imports")
```

**问题：** 如果沙箱脚本已经添加过 SKILL_DIR，`if` 条件会跳过，不会再次添加到前面。

### 修改后
```python
SKILL_DIR = Path(__file__).parent

# Ensure SKILL_DIR is in sys.path for generators imports
while str(SKILL_DIR) in sys.path:
    sys.path.remove(str(SKILL_DIR))
sys.path.insert(0, str(SKILL_DIR))
logging.info(f"✅ Added {SKILL_DIR} to sys.path for imports")
```

**改进：**
- 强制移除所有已存在的条目
- 插入到 sys.path 的开头（索引 0）
- 确保 generators 导入时能找到

## 为什么 Mac 上没问题？

可能的原因：

1. **沙箱脚本生成的差异** - Mac 版本可能已经包含了这个修复
2. **Python 版本差异** - 不同版本的 Python 对相对导入的处理可能略有不同
3. **环境变量差异** - Mac 上 PYTHONPATH 可能包含所需目录

## 相关文件

- 修改: `skills/remotion-generator/handler.py` (第43-51行)
- 不需要修改: `src/core/sandbox/adapters/local.ts` ❌

## 验证

### 测试 1: 导入测试
```bash
python3 << 'EOF'
import sys
import importlib

# 从项目根目录执行（模拟 Motia dev 环境）
import os
os.chdir('/root/workspace/myagent')

# 测试导入
module = importlib.import_module('skills.remotion-generator.handler')
print(f'✅ GENERATORS_AVAILABLE: {module.GENERATORS_AVAILABLE}')
assert module.GENERATORS_AVAILABLE == True
EOF
```

预期输出：`✅ GENERATORS_AVAILABLE: True`

### 测试 2: 完整任务测试
```bash
# 重启服务器
pkill -f "motia dev"
npm run dev

# 提交测试任务
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "创建测试视频"}'

# 检查结果
sudo -u postgres psql -d myagent -c \
  "SELECT id, status FROM tasks ORDER BY created_at DESC LIMIT 1;"
```

预期结果：`status = 'completed'`

## 技术细节

### Python 相对导入解析

当执行 `from generators.llm_analyzer_v2 import ContentAnalyzerV2` 时：

1. **如果模块是顶层脚本**（`__package__ = None`）
   - `from generators.xxx` → 从 sys.path 查找 `generators/`

2. **如果模块在包中**（`__package__ = 'skills.remotion-generator'`）
   - `from generators.xxx` → 从 `skills/remotion-generator/` 查找 `generators/`
   - 但如果 `skills/remotion-generator/` 不在 sys.path，会失败

### 为什么强制添加到前面？

Python 按 sys.path 的**顺序**查找模块：
```python
sys.path = [
    '/root/workspace/myagent/skills/remotion-generator',  # ← 如果在这里
    '/some/other/path/generators',                          # 可能找到错误的 generators
    ...
]
```

通过插入到索引 0，确保优先使用正确的 generators 目录。

## 尝试过的无效方案

❌ 修改 `local.ts` 添加 `skills` 目录 - 不需要，Python 自动从当前目录查找
❌ 修改 `executor.py` - 在错误的位置修改
❌ 使用绝对导入 `from skills.remotion-generator.generators.xxx` - 破坏模块结构
❌ 直接导入 `from llm_analyzer_v2` - 破坏相对导入，其他 generators 模块会失败

## 总结

**核心问题：** handler 内部的相对导入需要在 sys.path 中包含 skill 目录

**解决方案：** 在 handler.py 模块加载时，强制将 SKILL_DIR 添加到 sys.path 开头

**关键发现：** 不需要修改 local.ts，因为 Motia dev 从项目根目录启动，Python 自动处理 skills 包的查找
