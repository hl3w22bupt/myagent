# Git Hooks Setup

本项目使用 **pre-commit钩子** 来确保所有测试在提交代码之前通过。

## 🚀 快速开始

在克隆仓库后，运行以下命令来安装git hooks：

```bash
npm run setup:hooks
```

或者手动运行：

```bash
bash scripts/setup-git-hooks.sh
```

## 📋 工作原理

每次执行 `git commit` 时，pre-commit钩子会自动：

1. 运行所有Jest测试：`npm run test -- --passWithNoTests`
2. 检查测试是否全部通过
3. **如果测试通过**：允许提交继续
4. **如果测试失败**：阻止提交，显示错误信息

## 🛠️ 使用示例

### 正常提交（测试通过）

```bash
git add .
git commit -m "feat: add new feature"
```

输出：
```
🔍 Running tests before commit...

✅ All tests passed! Proceeding with commit...
[main abc1234] feat: add new feature
```

### 提交失败（测试失败）

```bash
git add .
git commit -m "feat: broken feature"
```

输出：
```
🔍 Running tests before commit...

❌ Tests failed! Commit aborted.

Please fix the failing tests before committing.
You can run tests manually with: npm run test -- --passWithNoTests

If you absolutely need to commit without tests (not recommended),
use: git commit --no-verify
```

## ⚠️ 绕过钩子（不推荐）

如果绝对需要跳过测试（不推荐），使用 `--no-verify` 标志：

```bash
git commit --no-verify -m "WIP: work in progress"
```

**⚠️ 警告**：仅在以下情况使用绕过：
- 文档修改
- 注释更新
- 实验性代码（不要推送到main分支）
- 紧急修复（之后立即运行测试）

## 📝 测试命令

手动运行测试：

```bash
# 运行所有测试
npm run test

# 运行测试（允许没有测试的文件）
npm run test -- --passWithNoTests

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

## 🔍 故障排查

### 钩子没有运行

检查钩子是否正确安装：

```bash
ls -la .git/hooks/pre-commit
```

应该看到可执行文件。如果不存在，重新运行：

```bash
npm run setup:hooks
```

### 测试失败但不知道原因

运行测试并查看详细输出：

```bash
npm run test -- --passWithNoTests --verbose
```

### 钩子阻止了提交但你想调试

1. 运行测试查看详细错误：
   ```bash
   npm run test -- --passWithNoTests
   ```

2. 修复失败的测试

3. 重新提交：
   ```bash
   git add .
   git commit -m "fix: resolve failing tests"
   ```

## 🎯 最佳实践

1. **提交前先运行测试**：
   ```bash
   npm run test -- --passWithNoTests
   ```

2. **频繁提交小改动**：更容易定位问题

3. **保持测试通过**：不要推送失败的代码

4. **使用有意义的提交消息**：遵循[Conventional Commits](https://www.conventionalcommits.org/)

5. **不要绕过钩子**：除非有充分的理由

## 📚 相关文档

- [Jest配置](./TEST_SUMMARY.md)
- [CI/CD配置](./GITHUB_ACTIONS_FIX_SUMMARY.md)
- [开发工作流](../README.md#development)
