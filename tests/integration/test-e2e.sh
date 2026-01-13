#!/bin/bash
# E2E Test - 简单直接的API测试

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT=3031
API_URL="http://localhost:${PORT}/agent"

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cleanup
cleanup() {
    log_info "停止服务..."
    pkill -f "motia dev" || true
}
trap cleanup EXIT

# 1. 重启服务
log_info "重启服务 (端口 ${PORT})..."
cd "$PROJECT_ROOT"
pkill -f "motia dev" || true
sleep 2
npm run dev -- --port=$PORT > /tmp/motia-e2e.log 2>&1 &
DEV_PID=$!
sleep 5

# 检查服务是否启动
if ! ps -p $DEV_PID > /dev/null 2>&1; then
    log_error "服务启动失败"
    tail -50 /tmp/motia-e2e.log
    exit 1
fi

# 检查端口是否监听
log_info "检查端口 ${PORT} 是否监听..."
sleep 3
if ! lsof -nP -iTCP:${PORT} -sTCP:LISTEN > /dev/null 2>&1; then
    log_error "端口 ${PORT} 未监听"
    tail -50 /tmp/motia-e2e.log
    exit 1
fi
log_success "服务已在端口 ${PORT} 上启动"

# 2. 提交任务
TASK_DESC="生成一个泰勒公式的教学视频，重点讲解它的核心理念和本质"
TASK_ID="e2e-$(date +%s)"

log_info "提交任务: $TASK_DESC"
RESPONSE=$(curl -s -X POST "$API_URL/execute" \
    -H "Content-Type: application/json" \
    -d "{\"task\": \"$TASK_DESC\", \"taskId\": \"$TASK_ID\"}")

REAL_TASK_ID=$(echo "$RESPONSE" | jq -r '.taskId')
log_success "任务已提交: $REAL_TASK_ID"

# 3. 轮询结果
log_info "等待结果..."
MAX_ATTEMPTS=60
ATTEMPT=0
SUCCESS=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    sleep 5

    RESULT=$(curl -s "$API_URL/results?taskId=$REAL_TASK_ID&limit=1" 2>/dev/null || echo '{}')

    # 检查result字段是否存在
    if echo "$RESULT" | jq -e '.result' > /dev/null 2>&1; then
        TASK_SUCCESS=$(echo "$RESULT" | jq -r '.result.success // empty')

        if [ -n "$TASK_SUCCESS" ]; then
            if [ "$TASK_SUCCESS" = "true" ]; then
                SUCCESS=true
                log_success "任务完成!"
                break
            else
                log_error "任务失败"
                echo "$RESULT" | jq '.result'
                exit 1
            fi
        fi
    fi

    echo -n "."
done

echo ""

if [ "$SUCCESS" = false ]; then
    log_error "超时 (5分钟)"
    log_info "最近50行日志:"
    tail -50 /tmp/motia-e2e.log
    exit 1
fi

# 4. 验证视频文件
sleep 2
VIDEO=$(find "$PROJECT_ROOT/outputs/videos" -name "*.mp4" -type f -mmin -5 | sort -r | head -1)
echo "========: $VIDEO"

if [ -n "$VIDEO" ] && [ -f "$VIDEO" ]; then
    SIZE=$(ls -lh "$VIDEO" | awk '{print $5}')
    log_success "测试通过! ✅"
    echo "  视频: $VIDEO"
    echo "  大小: $SIZE"
    exit 0
else
    log_error "未找到视频文件"
    log_info "视频目录内容:"
    ls -lh "$PROJECT_ROOT/outputs/videos" | tail -10
    exit 1
fi
