# MyAgent Doc Commands

MyAgent 文档规范转换工具 - 统一各种文档工具的输出格式。

## 🎯 用途

将 OpenSpec、Superpowers 等文档工具的输出转换为 MyAgent 文档规范格式，便于统一管理和归档。

## 📦 可用 Commands

### 1. `myagent-doc:create` - 创建提案

将文档工具的输出转换为 MyAgent 格式。

```bash
# 从 OpenSpec 创建
myagent-doc:create openspec/changes/add-validation-hook

# 从 Superpowers 创建
myagent-doc:create docs/superpowers/specs/feature-name --source superpowers

# 使用自定义日期
myagent-doc:create openspec/changes/feature-name --date 2026-03-30
```

**转换规则**:

| 来源 | 输入文件 | 输出文件 |
|------|---------|---------|
| **OpenSpec** | `proposal.md` | `00-requirement.md` |
| | `design.md` | `01-design.md` |
| | `tasks.md` | `02-implementation.md` |
| | `specs/` | `specs/` (保留) |
| **Superpowers** | `spec.md` | `00-requirement.md` |
| | `plan.md` | `02-implementation.md` |

**输出位置**: `docs/proposals/YYYY-MM-DD-<name>/`

---

### 2. `myagent-doc:archive` - 归档提案

将已完成的提案移动到归档目录。

```bash
# 使用完整名称
myagent-doc:archive 2026-03-29-add-validation-hook

# 只用名称（自动匹配日期）
myagent-doc:archive add-validation-hook
```

**归档位置**: `docs/archive/YYYY-MM-DD-<name>/`

---

### 3. `myagent-doc:list` - 列出提案

查看所有提案，可按状态筛选。

```bash
# 列出活跃提案
myagent-doc:list

# 列出已归档提案
myagent-doc:list --status archived

# 列出所有提案
myagent-doc:list --status all
```

---

### 4. `myagent-doc:update` - 更新状态

更新提案的状态或元数据。

```bash
# 标记为进行中
myagent-doc:update add-validation-hook --status in-progress

# 标记为已完成
myagent-doc:update add-validation-hook --status completed

# 标记为阻塞
myagent-doc:update add-validation-hook --status blocked
```

---

## 🔄 完整工作流

```bash
# 1. 使用 OpenSpec 创建提案
/opsx:propose "add validation hook"

# 2. 转换为 MyAgent 格式
myagent-doc:create openspec/changes/add-validation-hook

# 3. 开始实施
cd docs/proposals/2026-03-29-add-validation-hook
cat 02-implementation.md

# 4. 更新状态
myagent-doc:update add-validation-hook --status in-progress

# 5. 完成后归档
myagent-doc:archive add-validation-hook

# 6. 更新 reference/ 文档（如需要）
# 手动更新 docs/reference/ 中的相关文档
```

---

## 📁 目录结构

```
docs/
├── proposals/                    # 活跃提案
│   ├── YYYY-MM-DD-feature-name/  # 转换后的提案
│   │   ├── 00-requirement.md     # 需求文档
│   │   ├── 01-design.md          # 设计文档
│   │   ├── 02-implementation.md  # 实施文档
│   │   ├── README.md             # 提案说明
│   │   └── specs/                # 规范文件（来自 OpenSpec）
│   └── templates/                # 提案模板
│
└── archive/                      # 已归档提案
    └── YYYY-MM-DD-feature-name/
```

---

## 🎨 与 OpenSpec 集成

OpenSpec 是一个强大的 SDD（Spec-Driven Development）工具。你可以：

1. **使用 OpenSpec 快速创建提案**:
   ```bash
   /opsx:propose "feature name"
   ```

2. **转换为 MyAgent 格式**:
   ```bash
   myagent-doc:create openspec/changes/feature-name
   ```

3. **继续使用 MyAgent 规范**:
   - 所有文档遵循 `docs/DOCS_CONVENTIONS.md`
   - 统一的命名和归档方式
   - 与现有文档体系一致

---

## 🛠️ 技术实现

- **语言**: Bash Script
- **依赖**: 无（纯 Bash）
- **性能**: 快速（文件操作，< 1s）
- **可维护性**: 简单、透明、易于调试

---

## 📚 相关文档

- [MyAgent 文档规范](../../../docs/DOCS_CONVENTIONS.md)
- [OpenSpec 官方文档](https://github.com/Fission-AI/OpenSpec)
- [Superpowers Skills](../skills/superpowers/)

---

## 🤝 贡献

如需添加新的文档来源支持，修改对应的转换脚本：

1. 编辑 `create.sh`，添加新的 `case` 分支
2. 定义文件映射规则
3. 测试转换结果

---

**最后更新**: 2026-03-29
**维护者**: MyAgent Team
