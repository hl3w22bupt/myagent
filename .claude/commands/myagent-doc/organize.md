# myagent-doc:organize

整理文档以符合 MyAgent 文档规范。

## 用法

```bash
myagent-doc:organize [options]
```

## 选项

| 选项 | 说明 |
|------|------|
| `--dry-run` | 预览变更但不执行（默认） |
| `--execute` | 执行整理操作 |
| `--verbose` | 显示详细输出 |
| `-h, --help` | 显示帮助信息 |

## 示例

```bash
# 预览将要做的变更
myagent-doc:organize

# 执行整理
myagent-doc:organize --execute

# 显示详细信息
myagent-doc:organize --verbose
```

## 功能

此命令会根据 `docs/DOCS_CONVENTIONS.md` 规范自动整理文档：

### 自动整理规则

1. **API 文档** → `docs/reference/api/`
   - `docs/api/*.md` → `docs/reference/api/*.md`

2. **实施计划** → `docs/archive/YYYY-MM-DD-plans/`
   - `docs/plans/*.md` → `docs/archive/YYYY-MM-DD-plans/*.md`

3. **分析文档** → `docs/archive/YYYY-MM-DD-analysis/`
   - `docs/analysis/*.md` → `docs/archive/YYYY-MM-DD-analysis/*.md`

4. **空目录清理**
   - 自动删除移动后的空目录

## 输出示例

```
📋 MyAgent 文档整理工具
====================

🔍 扫描文档...

➜ 建议移动: hitl-api.md
   源: api/hitl-api.md
   目标: reference/api/hitl-api.md
   原因: API 文档应在 reference/api/ 下

➜ 建议移动: workflow-feedback-loop-implementation.md
   源: plans/workflow-feedback-loop-implementation.md
   目标: archive/2026-04-02-plans/workflow-feedback-loop-implementation.md
   原因: 已完成或计划的实施文档应归档

====================
ℹ️  预览模式 - 使用 --execute 执行整理

执行命令:
  myagent-doc:organize --execute
```

## 相关命令

- `myagent-doc:create` - 创建新提案
- `myagent-doc:archive` - 归档已完成提案
- `myagent-doc:list` - 列出所有提案
- `myagent-doc:update` - 更新提案状态

## 注意事项

- 默认使用 `--dry-run` 模式，安全预览变更
- 建议先预览，确认后再执行 `--execute`
- 命令会自动创建必要的目录结构
- 移动操作会保留文件历史

## 相关文档

- [MyAgent 文档规范](../../../docs/DOCS_CONVENTIONS.md)
- [myagent-doc 命令总览](./README.md)
