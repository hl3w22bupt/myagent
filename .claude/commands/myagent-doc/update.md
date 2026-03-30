---
description: 更新提案状态或元数据

parameters:
  - name: proposal-name
    description: 提案名称
    required: true
  - name: --status
    description: 更新状态 (in-progress|completed|blocked)

examples:
  - "myagent-doc:update add-validation-hook --status in-progress"
  - "myagent-doc:update add-validation-hook --status completed"
---

更新提案的状态或添加文档。

**使用示例**:
```bash
# 更新状态为进行中
myagent-doc:update add-validation-hook --status in-progress

# 标记为已完成
myagent-doc:update add-validation-hook --status completed

# 标记为阻塞
myagent-doc:update add-validation-hook --status blocked
```

**状态值**:
- `in-progress` - 正在实施
- `completed` - 已完成（准备归档）
- `blocked` - 遇到阻塞
