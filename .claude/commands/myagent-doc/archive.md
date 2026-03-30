---
description: 归档已完成的提案到 archive/

parameters:
  - name: proposal-name
    description: 提案名称（可带或不带日期前缀）
    required: true
  - name: --date
    description: 归档日期 (YYYY-MM-DD)
    default: 今天

examples:
  - "myagent-doc:archive 2026-03-29-add-validation-hook"
  - "myagent-doc:archive add-validation-hook"
---

将已完成的提案从 `docs/proposals/` 移动到 `docs/archive/`。

**使用示例**:
```bash
# 使用完整名称
myagent-doc:archive 2026-03-29-add-validation-hook

# 只用名称（自动匹配日期）
myagent-doc:archive add-validation-hook

# 使用自定义归档日期
myagent-doc:archive add-validation-hook --date 2026-03-30
```

**归档后**:
- 提案从 `docs/proposals/` 移动到 `docs/archive/YYYY-MM-DD-<name>/`
- 如有需要，更新 `docs/reference/` 中的系统性文档
- 提交 git commit
