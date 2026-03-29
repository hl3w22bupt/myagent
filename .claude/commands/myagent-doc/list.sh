#!/bin/bash
#
# myagent-doc:list - 列出所有提案
#
# 用法: myagent-doc:list [--status active|archived|all]
#

set -euo pipefail

# 默认值
STATUS="active"
PROPOSALS_DIR="docs/proposals"
ARCHIVE_DIR="docs/archive"

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --status)
      STATUS="$2"
      shift 2
      ;;
    *)
      echo "❌ 未知选项: $1"
      exit 1
      ;;
  esac
done

echo "📋 MyAgent 提案列表"
echo "状态: $STATUS"
echo ""

case $STATUS in
  active)
    # 列出活跃提案
    if [[ -d "$PROPOSALS_DIR" ]]; then
      echo "活跃提案 ($PROPOSALS_DIR):"
      echo ""
      for dir in "$PROPOSALS_DIR"/*/; do
        if [[ -d "$dir" ]]; then
          name=$(basename "$dir")
          date=$(echo "$name" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "????-??-??")
          title=$(echo "$name" | sed 's/^[0-9]*-//')

          # 检查是否有 README
          if [[ -f "$dir/README.md" ]]; then
            echo "  📄 $name"
          else
            echo "  📄 $name (无 README)"
          fi
        fi
      done | sort
    else
      echo "  (无活跃提案)"
    fi
    ;;

  archived)
    # 列出已归档提案
    if [[ -d "$ARCHIVE_DIR" ]]; then
      echo "已归档提案 ($ARCHIVE_DIR):"
      echo ""
      for dir in "$ARCHIVE_DIR"/*/; do
        if [[ -d "$dir" ]]; then
          name=$(basename "$dir")
          echo "  📦 $name"
        fi
      done | sort
    else
      echo "  (无归档提案)"
    fi
    ;;

  all)
    # 列出所有提案
    echo "活跃提案:"
    $0 --status active
    echo ""
    echo "已归档提案:"
    $0 --status archived
    ;;

  *)
    echo "❌ 无效的状态: $STATUS"
    echo "有效值: active, archived, all"
    exit 1
    ;;
esac

echo ""
echo "总计:"
ACTIVE_COUNT=$(find "$PROPOSALS_DIR" -maxdepth 1 -type d 2>/dev/null | wc -l)
ARCHIVED_COUNT=$(find "$ARCHIVE_DIR" -maxdepth 1 -type d 2>/dev/null | wc -l)
echo "  活跃: $((ACTIVE_COUNT - 1))"
echo "  已归档: $((ARCHIVED_COUNT - 1))"
