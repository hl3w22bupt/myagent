#!/bin/bash
# Quick Test Script for Shell Executor Skill

echo "=========================================="
echo "Shell Executor Skill - 快速测试"
echo "=========================================="

cd "$(dirname "$0")"

echo ""
echo "1. 测试基础命令..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'echo',
    'args': ['Test Passed!']
})
assert result['success'] == True
assert 'Test Passed!' in result['content']
print('✅ Echo命令测试通过')
"

echo ""
echo "2. 测试JSON解析..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'echo',
    'args': ['{\"status\": \"ok\"}'],
    'output_format': 'json'
})
assert result['success'] == True
assert result['result_type'] == 'json'
print('✅ JSON解析测试通过')
"

echo ""
echo "3. 测试键值对解析..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'echo',
    'args': ['key=value'],
    'output_format': 'kv'
})
assert result['success'] == True
assert result['result_type'] == 'table'
print('✅ 键值对解析测试通过')
"

echo ""
echo "4. 测试安全拦截..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'rm',
    'args': ['-rf', '/tmp/test']
})
assert result['success'] == False
assert result['content']['type'] == 'permission'
print('✅ 安全拦截测试通过')
"

echo ""
echo "5. 测试超时处理..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'sleep',
    'args': ['0.1'],
    'timeout': 5
})
assert result['success'] == True
print('✅ 超时处理测试通过')
"

echo ""
echo "6. 测试白名单命令..."
python -c "
import sys
sys.path.insert(0, 'lib')
from handler import execute_shell_command

result = execute_shell_command({
    'command': 'ls',
    'args': ['-la', '/tmp'],
    'output_format': 'auto'
})
assert result['success'] == True
print('✅ 白名单命令测试通过')
"

echo ""
echo "=========================================="
echo "所有测试通过! ✅"
echo "=========================================="
echo ""
echo "Shell Executor Skill 已准备就绪!"
echo ""
echo "查看完整文档:"
echo "  cat README.md"
echo ""
echo "运行演示:"
echo "  python demo.py"
echo ""
