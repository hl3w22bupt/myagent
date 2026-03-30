#!/bin/bash
#
# myagent-doc:update - 更新提案状态或添加文档
#
# 用法: myagent-doc:update <proposal-name> [options]
#

set -euo pipefail

# 默认值
PROPOSALS_DIR="docs/proposals"
STATUS=""

# 解析参数
PROPOSAL_NAME=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --status)
      STATUS="$2"
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
  echo "用法: myagent-doc:update <proposal-name> [options]"
  echo ""
  echo "选项:"
  echo "  --status <status>    更新状态 (in-progress|completed|blocked)"
  echo ""
  echo "示例:"
  echo "  myagent-doc:update add-validation-hook --status in-progress"
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
  exit 1
fi

echo "📂 找到提案: $PROPOSAL_PATH"

# 更新状态
if [[ -n "$STATUS" ]]; then
  STATUS_FILE="$PROPOSAL_PATH/STATUS.md"

  case $STATUS in
    in-progress|completed|blocked)
      echo "# 状态: $STATUS" > "$STATUS_FILE"
      echo "" >> "$STATUS_FILE"
      echo "**更新时间**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$STATUS_FILE"
      echo "✅ 状态已更新: $STATUS"
      ;;

    *)
      echo "❌ 无效的状态: $STATUS"
      echo "有效值: in-progress, completed, blocked"
      exit 1
      ;;
  esac
fi

echo ""
echo "📁 提案位置: $PROPOSAL_PATH"
echo ""
echo "当前文件:"
ls -1 "$PROPOSAL_PATH" | sed 's/^/  /'
