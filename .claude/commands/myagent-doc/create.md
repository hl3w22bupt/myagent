---
description: 创建符合 MyAgent 文档规范的提案

parameters:
  - name: source-path
    description: 源文档路径
    required: true
  - name: --source
    description: 来源类型 (openspec|superpowers|auto)
    default: auto
  - name: --date
    description: 自定义日期 (YYYY-MM-DD)
    default: 今天

examples:
  - "myagent-doc:create openspec/changes/add-validation-hook"
  - "myagent-doc:create openspec/changes/add-validation-hook --source openspec"
  - "myagent-doc:create docs/superpowers/specs/2026-03-29-feature --source superpowers"
---

将各种文档工具的输出转换为 MyAgent 文档规范格式。

**支持的来源**:
- OpenSpec: `openspec/changes/*/`
- Superpowers: `docs/superpowers/specs/*/` 或 `docs/superpowers/plans/*/`

**转换规则**:

OpenSpec → MyAgent:
- `proposal.md` → `00-requirement.md`
- `design.md` → `01-design.md`
- `tasks.md` → `02-implementation.md`
- `specs/` → `specs/` (保留)

Superpowers → MyAgent:
- `spec.md` → `00-requirement.md`
- `plan.md` → `02-implementation.md`
- `design.md` 通常不存在

**输出位置**:
- `docs/proposals/YYYY-MM-DD-<name>/`

**使用示例**:
```bash
# 从 OpenSpec 创建
myagent-doc:create openspec/changes/add-validation-hook

# 指定来源类型
myagent-doc:create openspec/changes/add-validation-hook --source openspec

# 使用自定义日期
myagent-doc:create openspec/changes/add-validation-hook --date 2026-03-30

# 从 Superpowers 创建
myagent-doc:create docs/superpowers/specs/agent-validation --source superpowers
```
