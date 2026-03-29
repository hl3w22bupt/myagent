---
description: 列出所有提案

parameters:
  - name: --status
    description: 筛选状态 (active|archived|all)
    default: active

examples:
  - "myagent-doc:list"
  - "myagent-doc:list --status archived"
  - "myagent-doc:list --status all"
---

列出所有提案，可按状态筛选。

**使用示例**:
```bash
# 列出活跃提案
myagent-doc:list

# 列出已归档提案
myagent-doc:list --status archived

# 列出所有提案
myagent-doc:list --status all
```
