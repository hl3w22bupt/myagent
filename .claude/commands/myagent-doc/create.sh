#!/bin/bash
#
# myagent-doc:create - 创建符合 MyAgent 规范的提案文档
#
# 用法: myagent-doc:create <source-path> [options]
#
# Options:
#   --source <type>    来源类型 (openspec|superpowers|auto)
#   --date <YYYY-MM-DD> 自定义日期（默认今天）
#

set -euo pipefail

# 默认值
SOURCE_TYPE="auto"
DATE=$(date +%Y-%m-%d)
TARGET_DIR="docs/proposals"

# 解析参数
SOURCE_PATH=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --source)
      SOURCE_TYPE="$2"
      shift 2
      ;;
    --date)
      DATE="$2"
      shift 2
      ;;
    -*)
      echo "❌ 未知选项: $1"
      exit 1
      ;;
    *)
      if [[ -z "$SOURCE_PATH" ]]; then
        SOURCE_PATH="$1"
      else
        echo "❌ 多余的参数: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

# 检查必需参数
if [[ -z "$SOURCE_PATH" ]]; then
  echo "❌ 缺少必需参数: source-path"
  echo ""
  echo "用法: myagent-doc:create <source-path> [options]"
  echo ""
  echo "示例:"
  echo "  myagent-doc:create openspec/changes/add-validation-hook"
  echo "  myagent-doc:create openspec/changes/add-validation-hook --source openspec"
  echo "  myagent-doc:create openspec/changes/add-validation-hook --date 2026-03-30"
  exit 1
fi

# 规范化路径
SOURCE_PATH=$(cd "$SOURCE_PATH" 2>/dev/null && pwd) || {
  echo "❌ 源路径不存在: $SOURCE_PATH"
  exit 1
}

# 自动检测来源类型
if [[ "$SOURCE_TYPE" == "auto" ]]; then
  if [[ -f "$SOURCE_PATH/.openspec.yaml" ]]; then
    SOURCE_TYPE="openspec"
  elif [[ -d "$SOURCE_PATH/specs" ]]; then
    SOURCE_TYPE="superpowers"
  else
    echo "❌ 无法自动检测文档来源，请使用 --source 参数指定"
    exit 1
  fi
fi

echo "📄 检测到来源类型: $SOURCE_TYPE"

# 提取变更名称
CHANGE_NAME=$(basename "$SOURCE_PATH")
TARGET_DIR="$TARGET_DIR/$DATE-$CHANGE_NAME"

# 创建目标目录
echo "📁 创建目标目录: $TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 转换文件
case $SOURCE_TYPE in
  openspec)
    # OpenSpec 格式转换
    FILES=(
      "proposal.md:00-requirement.md"
      "design.md:01-design.md"
      "tasks.md:02-implementation.md"
    )

    for mapping in "${FILES[@]}"; do
      IFS=':' read -r SOURCE_FILE TARGET_FILE <<< "$mapping"

      if [[ -f "$SOURCE_PATH/$SOURCE_FILE" ]]; then
        cp "$SOURCE_PATH/$SOURCE_FILE" "$TARGET_DIR/$TARGET_FILE"
        echo "  ✅ $SOURCE_FILE → $TARGET_FILE"
      else
        echo "  ⚠️  文件不存在: $SOURCE_FILE"
      fi
    done

    # 复制 specs/ 目录
    if [[ -d "$SOURCE_PATH/specs" ]]; then
      cp -r "$SOURCE_PATH/specs" "$TARGET_DIR/"
      echo "  ✅ specs/ → specs/"
    fi
    ;;

  superpowers)
    # Superpowers 格式转换
    FILES=(
      "spec.md:00-requirement.md"
      "plan.md:02-implementation.md"
    )

    for mapping in "${FILES[@]}"; do
      IFS=':' read -r SOURCE_FILE TARGET_FILE <<< "$mapping"

      if [[ -f "$SOURCE_PATH/$SOURCE_FILE" ]]; then
        cp "$SOURCE_PATH/$SOURCE_FILE" "$TARGET_DIR/$TARGET_FILE"
        echo "  ✅ $SOURCE_FILE → $TARGET_FILE"
      else
        echo "  ⚠️  文件不存在: $SOURCE_FILE"
      fi
    done

    # Superpowers 通常没有独立的 design.md，提示用户
    if [[ ! -f "$TARGET_DIR/01-design.md" ]]; then
      echo "  ℹ️  注: Superpowers 输出通常不包含 design.md"
      echo "     如需设计文档，请手动创建或从 spec.md 中提取"
    fi
    ;;

  *)
    echo "❌ 不支持的来源类型: $SOURCE_TYPE"
    exit 1
    ;;
esac

# 创建 README（可选）
cat > "$TARGET_DIR/README.md" <<EOF
# ${CHANGE_NAME}

**创建日期**: ${DATE}
**来源**: ${SOURCE_TYPE}

## 文档说明

- \`00-requirement.md\` - 需求文档
- \`01-design.md\` - 设计文档
- \`02-implementation.md\` - 实现文档

## 快速开始

\`\`\`bash
# 查看需求
cat 00-requirement.md

# 开始实施
# （参见 02-implementation.md）
\`\`\`
EOF

echo "  ✅ README.md → README.md"

# 完成
echo ""
echo "✅ 提案创建成功！"
echo ""
echo "📁 目标位置: $TARGET_DIR"
echo ""
echo "下一步:"
echo "  1. 查看提案: cd $TARGET_DIR"
echo "  2. 开始实施: cat 02-implementation.md"
echo "  3. 完成后归档: myagent-doc:archive $CHANGE_NAME"
