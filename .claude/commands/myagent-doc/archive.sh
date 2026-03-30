#!/bin/bash
#
# myagent-doc:archive - 归档已完成的提案
#
# 用法: myagent-doc:archive <proposal-name> [--date YYYY-MM-DD]
#

set -euo pipefail

# 默认值
ARCHIVE_DATE=$(date +%Y-%m-%d)
PROPOSALS_DIR="docs/proposals"
ARCHIVE_DIR="docs/archive"

# 解析参数
PROPOSAL_NAME=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --date)
      ARCHIVE_DATE="$2"
      shift 2
      ;;
    -*)
      echo "❌ 未知选项: $1"
      exit 1
      ;;
    *)
      if [[ -z "$PROPOSAL_NAME" ]]; then
        PROPOSAL_NAME="$1"
      else
        echo "❌ 多余的参数: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

# 检查必需参数
if [[ -z "$PROPOSAL_NAME" ]]; then
  echo "❌ 缺少必需参数: proposal-name"
  echo ""
  echo "用法: myagent-doc:archive <proposal-name> [options]"
  echo ""
  echo "示例:"
  echo "  myagent-doc:archive 2026-03-29-add-validation-hook"
  echo "  myagent-doc:archive add-validation-hook --date 2026-03-29"
  exit 1
fi

# 查找提案目录
PROPOSAL_PATH=""
if [[ -d "$PROPOSALS_DIR/$PROPOSAL_NAME" ]]; then
  PROPOSAL_PATH="$PROPOSALS_DIR/$PROPOSAL_NAME"
else
  # 尝试匹配日期前缀
  for dir in "$PROPOSALS_DIR"/*-"$PROPOSAL_NAME"; do
    if [[ -d "$dir" ]]; then
      PROPOSAL_PATH="$dir"
      break
    fi
  done
fi

if [[ -z "$PROPOSAL_PATH" ]]; then
  echo "❌ 找不到提案: $PROPOSAL_NAME"
  echo ""
  echo "可用的提案:"
  ls -1 "$PROPOSALS_DIR" 2>/dev/null || echo "  (无)"
  exit 1
fi

echo "📂 找到提案: $PROPOSAL_PATH"

# 创建归档目录
ARCHIVE_SUBDIR="$ARCHIVE_DIR/$ARCHIVE_DATE-$PROPOSAL_NAME"
echo "📁 创建归档目录: $ARCHIVE_SUBDIR"
mkdir -p "$ARCHIVE_DIR"

# 移动提案
echo "📦 移动提案到归档..."
mv "$PROPOSAL_PATH" "$ARCHIVE_SUBDIR"

echo "✅ 提案已归档！"
echo ""
echo "📁 归档位置: $ARCHIVE_SUBDIR"
echo ""
echo "下一步:"
echo "  1. 更新 reference/ 文档（如需要）"
echo "  2. 提交代码: git add docs/ && git commit -m 'docs: archive $PROPOSAL_NAME'"
