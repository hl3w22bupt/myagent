# Shell Executor Skill - 快速开始指南

5分钟上手Shell Executor Skill！

## 安装检查

```bash
cd /Users/leo/workspace/myagent/skills/shell-executor
ls -la
```

应该看到:
```
skill.yaml          # Skill配置
handler.py          # 执行处理器
lib/                # 核心库
README.md           # 完整文档
quick_test.sh       # 快速测试
demo.py             # 功能演示
```

## 快速测试

运行自动化测试:

```bash
./quick_test.sh
```

预期输出:
```
✅ Echo命令测试通过
✅ JSON解析测试通过
✅ 键值对解析测试通过
✅ 安全拦截测试通过
✅ 超时处理测试通过
✅ 白名单命令测试通过
```

## 立即使用

### 1. 最简单的例子

```python
from handler import execute_shell_command

result = execute_shell_command({
    "command": "echo",
    "args": ["Hello World!"]
})

print(result["content"])  # "Hello World!\n"
```

### 2. 列出文件

```python
result = execute_shell_command({
    "command": "ls",
    "args": ["-la", "/tmp"],
    "output_format": "auto"  # 自动检测为表格
})

# result["content"]["headers"] - 列名
# result["content"]["rows"] - 数据行
```

### 3. Postgres查询

```bash
# 设置环境变量
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mydb
export PGUSER=myuser
export PGPASSWORD=mypass
```

```python
result = execute_shell_command({
    "command": "psql",
    "args": ["-c", "SELECT * FROM users LIMIT 5"],
    "output_format": "table"
})

# 表格格式返回结果
```

### 4. JSON解析

```python
result = execute_shell_command({
    "command": "echo",
    "args": ['{"name": "test", "value": 123}'],
    "output_format": "json"
})

# 自动解析JSON
```

### 5. 键值对解析

```python
result = execute_shell_command({
    "command": "env",
    "output_format": "kv"
})

# 转换为表格格式
```

## 常用命令速查

| 功能 | 命令 | 输出格式 |
|-----|------|---------|
| 列出文件 | `ls -la /tmp` | table |
| 查找文件 | `find /tmp -name "*.log"` | raw |
| 查看进程 | `ps aux \| head -10` | table |
| 磁盘使用 | `df -h` | table |
| 环境变量 | `env` | kv |
| Postgres查询 | `psql -c "SELECT ..."` | table |
| JSON数据 | `echo '{"key":"value"}'` | json |

## 环境变量配置

```bash
# 可选: 自定义白名单
export SHELL_ALLOWED_COMMANDS="psql,ls,cat,grep,find"

# 可选: 默认超时
export SHELL_TIMEOUT=60

# 可选: 最大输出
export SHELL_MAX_OUTPUT_SIZE=5242880  # 5MB

# Postgres配置
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=mydb
export PGUSER=user
export PGPASSWORD=pass
```

## 运行演示

查看所有功能演示:

```bash
python demo.py
```

## 安全注意事项

### ✅ 允许的命令

**PostgreSQL**: psql, pg_dump, pg_restore
**系统工具**: ls, cat, grep, find, head, tail
**网络工具**: curl, wget, ping
**开发工具**: git, npm, python, node
**其他**: echo, sleep, time, which

### ❌ 危险命令（自动拦截）

- `rm` - 文件删除
- `dd` - 磁盘操作
- `mkfs` - 文件系统格式化
- `reboot/shutdown` - 系统重启
- `eval/exec` - 代码执行

### 🔒 自定义白名单

```bash
# 添加更多命令
export SHELL_ALLOWED_COMMANDS="psql,ls,cat,custom_command"
```

## 故障排除

### 问题1: 命令不在白名单

```
Error: Command 'xxx' not in whitelist
```

**解决**:
```bash
export SHELL_ALLOWED_COMMANDS="xxx,psql,ls"
```

### 问题2: 超时

```
Error: Command timeout after 30 seconds
```

**解决**:
```python
result = execute_shell_command({
    "command": "...",
    "timeout": 120  # 增加到120秒
})
```

### 问题3: 输出解析错误

**解决**: 使用raw格式查看原始输出
```python
result = execute_shell_command({
    "command": "...",
    "output_format": "raw"
})
print(result["content"])  # 原始文本
```

## 下一步

1. **查看完整文档**: `cat README.md`
2. **运行功能演示**: `python demo.py`
3. **查看实现报告**: `cat IMPLEMENTATION_REPORT.md`
4. **开始集成到你的项目**!

## 与sql-pro集成示例

```python
# Step 1: 获取表结构
schema_result = execute_shell_command({
    "command": "psql",
    "args": ["-c", "\\d users"],
    "output_format": "table"
})

# Step 2: 传递给sql-pro生成SQL
# (sql-pro skill处理...)

# Step 3: 执行生成的SQL
query_result = execute_shell_command({
    "command": "psql",
    "args": ["-c", generated_sql],
    "output_format": "table"
})

# Step 4: 使用结果
for row in query_result["content"]["rows"]:
    print(row)
```

## 技巧和窍门

### 技巧1: 自动格式检测

```python
# 不指定格式，自动检测
result = execute_shell_command({
    "command": "ls",  # 会自动检测为table
    "args": ["-la"]
})
```

### 技巧2: 环境变量传递

```python
result = execute_shell_command({
    "command": "python",
    "args": ["-c", "import os; print(os.environ['MY_VAR'])"],
    "env": {"MY_VAR": "test"}
})
```

### 技巧3: 工作目录

```python
result = execute_shell_command({
    "command": "pwd",
    "working_dir": "/tmp"  # 在/tmp执行
})
```

### 技巧4: 解析选项

```python
result = execute_shell_command({
    "command": "...",
    "output_format": "table",
    "parse_options": {
        "skip_rows": 1,     # 跳过第一行
        "skip_empty": True,  # 跳过空行
        "trim": True         # 去除空白
    }
})
```

## 获取帮助

- 📖 完整文档: `cat README.md`
- 💡 演示代码: `python demo.py`
- 🧪 运行测试: `./quick_test.sh`
- 📋 实现详情: `cat IMPLEMENTATION_REPORT.md`

---

**开始使用Shell Executor Skill，5分钟即可上手！** 🚀
