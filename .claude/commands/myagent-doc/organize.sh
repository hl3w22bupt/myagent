#!/bin/bash
#
# myagent-doc:organize - 整理文档以符合 MyAgent 文档规范
#
# 用法: myagent-doc:organize [options]
#
# Options:
#   --dry-run     预览变更但不执行（默认预览）
#   --execute     执行整理操作
#   --verbose     显示详细输出
#
# 此命令会检查 docs/ 目录下的所有文档，并根据 DOCS_CONVENTIONS.md
# 规范自动整理文档位置。
#

set -euo pipefail

# 默认值
DRY_RUN=true
VERBOSE=false
DOCS_DIR="docs"
CHANGES_MADE=false

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 解析参数
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --execute)
      DRY_RUN=false
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      cat <<EOF
用法: myagent-doc:organize [options]

整理 docs/ 目录以符合 MyAgent 文档规范。

选项:
  --dry-run     预览变更但不执行（默认）
  --execute     执行整理操作
  --verbose     显示详细输出
  -h, --help    显示此帮助信息

示例:
  myagent-doc:organize              # 预览将要做的变更
  myagent-doc:organize --execute    # 执行整理
  myagent-doc:organize --verbose    # 显示详细信息

文档规范:
  - docs/proposals/     活跃提案（正在开发）
  - docs/archive/       已完成功能归档（按日期）
  - docs/reference/     系统性参考文档
  - docs/tbd/           待定/脑暴想法

相关文档:
  - docs/DOCS_CONVENTIONS.md
  - .claude/commands/myagent-doc/README.md
EOF
      exit 0
      ;;
    *)
      echo "❌ 未知选项: $1"
      exit 1
      ;;
  esac
done

echo "📋 MyAgent 文档整理工具"
echo "===================="
echo ""

# 检查函数
check_document() {
  local file="$1"
  local relative_path="${file#$DOCS_DIR/}"
  local dirname=$(dirname "$relative_path")
  local filename=$(basename "$file")

  if [[ "$VERBOSE" == true ]]; then
    echo "检查: $relative_path"
  fi

  # 跳过 DOCS_CONVENTIONS.md 和 README.md
  if [[ "$filename" == "DOCS_CONVENTIONS.md" || "$filename" == "README.md" ]]; then
    return
  fi

  # 规则 1: docs/api/*.md → docs/reference/api/
  if [[ "$dirname" == "api" ]]; then
    local target="$DOCS_DIR/reference/api/$filename"
    suggest_move "$file" "$target" "API 文档应在 reference/api/ 下"
    return
  fi

  # 规则 2: docs/plans/*.md → docs/archive/YYYY-MM-DD-plans/
  if [[ "$dirname" == "plans" ]]; then
    local today=$(date +%Y-%m-%d)
    local target="$DOCS_DIR/archive/$today-plans/$filename"
    suggest_move "$file" "$target" "已完成或计划的实施文档应归档"
    return
  fi

  # 规则 3: docs/analysis/*.md → docs/archive/YYYY-MM-DD-analysis/
  if [[ "$dirname" == "analysis" ]]; then
    local today=$(date +%Y-%m-%d)
    local target="$DOCS_DIR/archive/$today-analysis/$filename"
    suggest_move "$file" "$target" "临时分析文档应归档"
    return
  fi

  # 规则 4: docs/tbd/ 中已完成功能的文档 → archive/
  # 需要检查文档内容来判断是否已完成
  # 这里跳过，因为需要人工判断
}

suggest_move() {
  local source="$1"
  local target="$2"
  local reason="$3"

  # 创建目标目录（如果需要）
  local target_dir=$(dirname "$target")

  echo -e "${YELLOW}➜${NC} 建议移动: ${filename}"
  echo "   源: $relative_path"
  echo "   目标: ${target#$DOCS_DIR/}"
  echo "   原因: $reason"
  echo ""

  if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$target_dir"
    mv "$source" "$target"
    echo -e "${GREEN}✅ 已移动${NC}"
    echo ""
    CHANGES_MADE=true
  fi
}

# 扫描 docs/ 目录
echo "🔍 扫描文档..."
echo ""

# 检查根目录文件
for file in "$DOCS_DIR"/*.md; do
  if [[ -f "$file" ]]; then
    check_document "$file"
  fi
done 2>/dev/null || true

# 检查一级子目录
for subdir in api analysis plans proposals tbd; do
  if [[ -d "$DOCS_DIR/$subdir" ]]; then
    for file in "$DOCS_DIR/$subdir"/*.md; do
      if [[ -f "$file" ]]; then
        check_document "$file"
      fi
    done
  fi
done 2>/dev/null || true

# 检查是否需要清理空目录
if [[ "$DRY_RUN" == false ]]; then
  echo "🧹 清理空目录..."
  for dir in api analysis plans; do
    if [[ -d "$DOCS_DIR/$dir" ]] && [[ -z "$(ls -A "$DOCS_DIR/$dir" 2>/dev/null)" ]]; then
      rmdir "$DOCS_DIR/$dir" 2>/dev/null && echo "  ✅ 删除空目录: $dir"
    fi
  done
fi

# 总结
echo ""
echo "===================="
if [[ "$DRY_RUN" == true ]]; then
  echo -e "${BLUE}ℹ️  预览模式${NC} - 使用 --execute 执行整理"
  echo ""
  echo "执行命令:"
  echo "  myagent-doc:organize --execute"
else
  if [[ "$CHANGES_MADE" == true ]]; then
    echo -e "${GREEN}✅ 整理完成！${NC}"
    echo ""
    echo "下一步:"
    echo "  1. 检查变更: git status"
    echo "  2. 提交变更: git add docs/ && git commit -m 'chore(docs): organize documentation'"
  else
    echo -e "${GREEN}✅ 文档已经符合规范！${NC}"
  fi
fi
