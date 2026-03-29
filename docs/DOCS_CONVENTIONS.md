# MyAgent 文档规范

**版本**: 1.0
**更新日期**: 2026-03-29

---

## 📚 文档结构概览

```
docs/
├── proposals/          # 活跃需求（正在开发或等待开发）
├── archive/            # 已完成需求归档
├── reference/          # 系统性参考文档
│   ├── architecture/   # 架构设计
│   ├── api/            # API 文档
│   ├── guides/         # 使用指南
│   ├── deployment/     # 运维部署
│   └── troubleshooting/# 故障排查
└── tbd/               # 待定/脑暴阶段的想法
```

---

## 🎯 复杂度分级标准

### 简单需求
- **定义**: 单个模块/文件内的修改
- **预估时间**: < 1 天
- **影响范围**: 不超过 2 个文件
- **文档要求**: 单个 `simple-proposal.md` 文档即可

**示例**:
- 修复单个 bug
- 添加一个小工具函数
- 修改配置项

### 中等复杂度需求
- **定义**: 跨多个模块的修改
- **预估时间**: 1-3 天
- **影响范围**: 2-5 个文件/模块
- **文档要求**: 使用 complex-proposal 模板（00-requirement.md, 01-design.md, 02-implementation.md）

**示例**:
- 添加新的 API 端点
- 重构一个子系统
- 集成新的服务

### 高复杂度需求
- **定义**: 架构性变更或大规模重构
- **预估时间**: > 3 天
- **影响范围**: 多个子系统或整体架构
- **文档要求**: 使用 complex-proposal 全套模板（包含 03-test-report.md）

**示例**:
- 架构重构
- 核心系统替换
- 跨系统集成

---

## 📝 命名规范

### proposals/ 目录
- **格式**: `YYYY-MM-DD-简短描述/`
- **示例**:
  - `2026-03-29-knowledge-base-refactor/`
  - `2026-03-25-agent-performance-optimization/`

### archive/ 目录
- **格式**: 与 proposals 相同，便于追溯
- **示例**:
  - `2026-03-15-context-compression/`
  - `2026-02-28-hook-system/`

### 文件命名
- 使用小写字母和连字符
- 避免使用下划线（除非是技术文件名）
- **推荐**: `api-reference.md`, `quick-start.md`
- **避免**: `API_REFERENCE.md`, `QuickStart.md`

---

## 🔄 文档生命周期

### 1. 创建阶段
```bash
# 简单需求
cp proposals/templates/simple-proposal.md proposals/2026-03-29-feature-name/proposal.md

# 复杂需求
cp -r proposals/templates/complex-proposal proposals/2026-03-29-feature-name/
```

### 2. 开发阶段
- 在 `proposals/` 中维护文档
- 及时更新设计决策和实现细节
- 记录重要的技术讨论

### 3. 完成阶段
当需求完成后，执行以下步骤：

**Step 1**: 更新系统性文档
- 将重要的设计决策更新到 `reference/` 对应的文档中
- 更新 API 文档、架构图等

**Step 2**: 归档到 archive/
```bash
mv proposals/2026-03-29-feature-name archive/2026-03-29-feature-name
```

### 4. 参考文档维护
- `reference/` 中的文档应始终反映最新实现状态
- 每次功能完成后，及时更新相关参考文档

---

## 📋 文档模板使用

### 简单需求模板
位置: `proposals/templates/simple-proposal.md`

适用场景：
- Bug 修复
- 小功能添加
- 配置修改

### 复杂需求模板
位置: `proposals/templates/complex-proposal/`

包含文件：
- `00-requirement.md` - 需求文档
- `01-design.md` - 设计文档
- `02-implementation.md` - 实现文档
- `03-test-report.md` - 测试报告

---

## 🚫 删除规范

以下类型的文档应该删除：

**明确删除**：
- 临时修复报告（如 `FIX_SUMMARY.md`）
- 过时的测试报告
- 重复的文档

**保留到 tbd/**：
- 脑暴阶段的概念文档
- 未成熟的想法
- 探索性设计

**归档到 archive/**：
- 所有已完成功能的相关文档
- 保留完整结构，便于后续参考

---

## ✅ 质量标准

### 文档内容要求
- **准确性**: 与实际实现保持一致
- **清晰性**: 使用简洁明了的语言
- **完整性**: 包含必要的上下文和示例
- **时效性**: 及时更新，避免过时信息

### 格式要求
- 使用 Markdown 格式
- 代码块标注语言类型（如 \`\`\`typescript）
- 适当使用表格、列表、标题等格式化元素
- 重要信息使用引用块（>）或粗体（**）标注

---

## 🔍 常见问题

### Q: 已有功能的文档如何处理？
**A**:
1. 评估文档质量：良好 → 迁移到 `reference/`，混乱 → 删除
2. 根据最新实现状态，更新或重写核心文档
3. 过程性文档（测试报告、修复记录）直接删除或归档

### Q: 如何判断文档是"活跃需求"还是"已完成"？
**A**:
- **活跃**: 代码正在开发或即将开发
- **已完成**: 功能已上线或不再维护

### Q: tbd/ 目录的文档什么时候移出？
**A**:
- 当想法成熟、准备实施时 → 移到 `proposals/`
- 确定不再实施 → 删除

### Q: reference/ 中的文档多久更新一次？
**A**:
- 每次功能完成后立即更新
- 至少每个季度review一次时效性

---

## 📞 联系与反馈

如有疑问或建议，请通过以下方式反馈：
- 在团队会议中讨论
- 提交 issue 或 PR
- 直接联系文档维护者

---

**最后更新**: 2026-03-29
**维护者**: MyAgent Team
