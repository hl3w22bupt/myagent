# 故障排查

> 常见问题和解决方案

**阅读时间**: 5 分钟 | **难度**: ⭐⭐ intermediate

---

## 🔍 快速诊断

### 健康检查

```bash
curl http://localhost:3000/health
```

**正常响应**: `{"status":"ok"}`

---

## ❓ 常见问题

### 1. 安装错误

#### Module not found

**问题**: `Error: Cannot find module 'xxx'`

**解决**:
```bash
npm run generate-types
npm run build
```

---

#### PostgreSQL 连接失败

**问题**: `Connection refused: postgres`

**解决**:
```bash
# 检查 PostgreSQL 是否运行
psql -U postgres -c "SELECT version()"

# 启动 PostgreSQL
brew services start postgresql@14  # macOS
sudo systemctl start postgresql   # Ubuntu
```

---

### 2. 运行时错误

#### Agent 超时

**问题**: 任务执行超时

**解决**:
```bash
# 增加超时时间
# .env
SANDBOX_TIMEOUT=60000
```

---

#### 上下文过大

**问题**: Context length exceeded

**解决**:
```bash
# 触发上下文压缩
curl -X POST http://localhost:3000/api/contexts/compression \
  -d '{"sessionId": "your-session-id"}'
```

---

### 3. 性能问题

#### 响应慢

**问题**: API 响应时间长

**解决**:
```bash
# 检查沙箱配置
DEFAULT_SANDBOX_ADAPTER=local

# 使用沙箱池
SANDBOX_POOL_SIZE=5
```

---

## 📞 获取帮助

- 查看日志：`tail -f .motia/logs/motia.log`
- 检查配置：`.env` 文件
- 提交 Issue：https://github.com/your-org/myagent/issues

---

## 📖 相关文档

- [部署文档](../deployment/quick-start.md) - 系统部署
- [配置说明](../deployment/configuration.md) - 配置优化

---

**版本**: v1.0 | **更新日期**: 2026-03-29
