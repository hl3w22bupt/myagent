#!/bin/bash
# 快速测试 Python 环境是否正常

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="$PROJECT_ROOT/python_modules/bin/python3"

echo "测试 Python 环境..."
echo ""

# 测试关键依赖
echo "1. 测试 pyyaml..."
$PYTHON_BIN -c "import yaml; print('✓ pyyaml:', yaml.__version__)" || echo "✗ pyyaml 失败"

echo ""
echo "2. 测试 pydantic..."
$PYTHON_BIN -c "import pydantic; print('✓ pydantic:', pydantic.__version__)" || echo "✗ pydantic 失败"

echo ""
echo "3. 测试 anthropic..."
$PYTHON_BIN -c "import anthropic; print('✓ anthropic:', anthropic.__version__)" || echo "✗ anthropic 失败"

echo ""
echo "4. 测试 skill.executor 导入..."
$PYTHON_BIN -c "from src.core.skill.executor import SkillExecutor; print('✓ SkillExecutor 导入成功')" || echo "✗ SkillExecutor 导入失败"

echo ""
echo "5. 测试完整 sandbox 导入链..."
$PYTHON_BIN << 'EOF'
import sys
sys.path.insert(0, 'src')
from core.skill.executor import SkillExecutor
from core.sandbox.retry_utils import execute_with_retry
from core.skill.adapters.virtual_skill_registry import create_virtual_registry
print("✓ 所有 sandbox 依赖导入成功")
EOF

echo ""
echo "测试完成！"
