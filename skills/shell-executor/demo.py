#!/usr/bin/env python3
"""
Shell Executor Skill Demo

演示各种使用场景和输出格式。
"""

import sys
import json
from pathlib import Path

# Add local lib
sys.path.insert(0, str(Path(__file__).parent / "lib"))

from handler import execute_shell_command


def print_result(title, result):
    """打印结果"""
    print(f"\n{'='*60}")
    print(f"{title}")
    print('='*60)
    print(json.dumps(result, indent=2, ensure_ascii=False))


def demo_basic_commands():
    """基本命令演示"""
    print("\n## 基本命令演示 ##")

    # 1. 简单的echo命令
    result = execute_shell_command({
        "command": "echo",
        "args": ["Hello, Shell Executor!"]
    })
    print_result("1. Echo命令", result)

    # 2. 列出目录
    result = execute_shell_command({
        "command": "ls",
        "args": ["-la", "/tmp"],
        "output_format": "auto"
    })
    print_result("2. 列出目录 (auto格式)", result)


def demo_json_parsing():
    """JSON解析演示"""
    print("\n## JSON解析演示 ##")

    result = execute_shell_command({
        "command": "echo",
        "args": ['{"project": "motia", "version": "1.0.0", "features": ["shell", "sql"]}'],
        "output_format": "json"
    })
    print_result("JSON解析", result)


def demo_kv_parsing():
    """键值对解析演示"""
    print("\n## 键值对解析演示 ##")

    result = execute_shell_command({
        "command": "echo",
        "args": [
            "APP_NAME=motia",
            "APP_VERSION=1.0.0",
            "APP_ENV=production"
        ],
        "output_format": "kv"
    })
    print_result("键值对解析", result)


def demo_table_parsing():
    """表格解析演示"""
    print("\n## 表格解析演示 ##")

    # 创建模拟表格输出
    result = execute_shell_command({
        "command": "echo",
        "args": [
            "Name    Age    City",
            "Alice   30     New York",
            "Bob     25     London",
            "Charlie 35     Tokyo"
        ],
        "output_format": "table",
        "parse_options": {
            "skip_empty": True,
            "trim": True
        }
    })
    print_result("表格解析", result)


def demo_error_handling():
    """错误处理演示"""
    print("\n## 错误处理演示 ##")

    # 1. 命令不在白名单
    result = execute_shell_command({
        "command": "rm",
        "args": ["-rf", "/tmp/test"]
    })
    print_result("1. 命令不在白名单", result)

    # 2. 无效参数
    result = execute_shell_command({
        "command": "ls",
        "args": ["/nonexistent/directory"]
    })
    print_result("2. 目录不存在", result)


def demo_environment_variables():
    """环境变量演示"""
    print("\n## 环境变量演示 ##")

    result = execute_shell_command({
        "command": "echo",
        "args": ["$TEST_VAR"],
        "env": {
            "TEST_VAR": "Hello from env!"
        }
    })
    print_result("环境变量", result)


def demo_timeout():
    """超时控制演示"""
    print("\n## 超时控制演示 ##")

    result = execute_shell_command({
        "command": "sleep",
        "args": ["0.1"],
        "timeout": 5
    })
    print_result("短sleep命令", result)


def demo_postgres_commands():
    """Postgres命令演示（如果可用）"""
    print("\n## Postgres命令演示 ##")

    # 检查psql是否可用
    check_result = execute_shell_command({
        "command": "which",
        "args": ["psql"]
    })

    if check_result.get("success") and check_result.get("content"):
        print("✓ psql 已安装")

        # 尝试连接（使用环境变量）
        result = execute_shell_command({
            "command": "psql",
            "args": ["-c", "SELECT version();"],
            "timeout": 5,
            "output_format": "table"
        })

        if result.get("success"):
            print_result("Postgres版本查询", result)
        else:
            print("✗ 无法连接到Postgres (可能未配置)")
            print(f"  错误: {result.get('content', {}).get('message', 'Unknown')}")
    else:
        print("✗ psql 未安装，跳过Postgres演示")


def demo_csv_parsing():
    """CSV解析演示"""
    print("\n## CSV解析演示 ##")

    result = execute_shell_command({
        "command": "echo",
        "args": [
            "name,age,city",
            "Alice,30,New York",
            "Bob,25,London"
        ],
        "output_format": "csv"
    })
    print_result("CSV解析", result)


def main():
    """运行所有演示"""
    print("="*60)
    print("Shell Executor Skill - 完整演示")
    print("="*60)

    try:
        demo_basic_commands()
        demo_json_parsing()
        demo_kv_parsing()
        demo_table_parsing()
        demo_csv_parsing()
        demo_environment_variables()
        demo_timeout()
        demo_error_handling()
        demo_postgres_commands()

        print("\n" + "="*60)
        print("演示完成!")
        print("="*60)

    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
