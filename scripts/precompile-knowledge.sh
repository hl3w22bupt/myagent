#!/bin/bash
# 预编译 knowledge 模块以解决 Motia 编译顺序问题
# Motia 只编译 steps 目录，不会自动编译 src/core/knowledge/ 下的文件

set -e

echo "🔧 预编译 knowledge 模块..."

COMPILED_DIR=".motia/compiled/src/core/knowledge"

# 确保编译目录存在
mkdir -p "$COMPILED_DIR"

# 需要预编译的文件
FILES=(
  "src/core/knowledge/datasource-store.ts"
  "src/core/knowledge/datasource-manager.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    basename=$(basename "$file" .ts)
    echo "  编译 $basename -> $COMPILED_DIR/${basename}.js"

    npx esbuild "$file" \
      --format=esm \
      --platform=node \
      --outfile="$COMPILED_DIR/${basename}.js"

    echo "    ✅ 完成"
  else
    echo "  ⚠️  文件不存在: $file"
  fi
done

echo "✅ Knowledge 模块预编译完成"
