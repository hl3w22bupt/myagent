# Pre-commit CI Check 脚本使用说明

## 🚨 重要提示

在首次运行此脚本之前，请确保已正确安装所有依赖。

由于 `redis-memory-server` 可能在某些环境下编译失败，建议使用以下方式安装：

```bash
# 跳过 postinstall 脚本安装依赖（推荐）
npm install --ignore-scripts
```

如果已经运行过 `npm install` 但遇到问题，可以重新安装：

```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install --ignore-scripts
```

如果遇到 `motia: command not found` 错误,说明 motia 包未正确安装。

## 使用方法

### 方式 1: 使用 npm 脚本 (推荐)

```bash
# 运行所有检查(包括测试)
npm run pre-commit

# 跳过测试(快速检查)
SKIP_TESTS=1 npm run pre-commit
```

### 方式 2: 直接运行脚本

```bash
# 运行所有检查
bash scripts/pre-commit-check.sh

# 跳过测试
SKIP_TESTS=1 bash scripts/pre-commit-check.sh
```

## 检查内容

脚本按顺序执行以下检查:

1. ✅ **检查依赖** - 验证 node_modules 存在
2. ✅ **生成 Motia 类型** - `npm run generate-types`
3. ✅ **TypeScript 类型检查** - `npx tsc --noEmit`
4. ✅ **ESLint 检查** - `npm run lint`
5. ✅ **TypeScript 编译** - `npm run build:ts`
6. ✅ **Jest 测试** - `npm run test -- --passWithNoTests` (可选)

## Redis 配置

脚本会自动检测 Redis 是否运行:

- **如果 Redis 正在运行**: 使用外部 Redis (localhost:6379)
- **如果 Redis 未运行**: Motia 将使用内存服务器 (需要编译,可能较慢)

如果你想始终使用外部 Redis (需要本地 Redis 服务):

```bash
# 启动 Redis
brew services start redis

# 或使用 Docker
docker run -d -p 6379:6379 redis:alpine
```

## 退出代码

- **0**: 所有检查通过 ✅
- **1**: 有检查失败 ❌

## Git Hook 集成 (可选)

在每次 commit 前自动运行检查:

```bash
npm install -D husky
npx husky install
npx husky add .husky/pre-commit "npm run pre-commit"
```

## 常见问题

### Q: motia: command not found
**A**: 需要重新安装依赖
```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: TypeScript 编译失败
**A**: 清理并重新构建
```bash
npm run clean
npm install
npm run pre-commit
```

### Q: Redis 编译超时
**A**: 跳过测试或使用外部 Redis
```bash
# 使用外部 Redis
brew services start redis

# 跳过测试
SKIP_TESTS=1 npm run pre-commit
```

## 快速参考

| 命令 | 说明 |
|------|------|
| `npm run pre-commit` | 运行完整检查 |
| `SKIP_TESTS=1 npm run pre-commit` | 跳过测试 |
| `npm run lint` | 仅运行 ESLint |
| `npx tsc --noEmit` | 仅运行类型检查 |
| `npm run build:ts` | 仅编译 TypeScript |
