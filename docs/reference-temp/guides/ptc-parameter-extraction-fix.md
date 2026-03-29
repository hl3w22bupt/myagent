# PTC 参数提取修复 - 测试文档

## 问题描述

用户反馈 Remotion 视频生成任务中，即使明确指定"时长 15s"，生成的视频仍然是 10s。

### 根本原因

**Phase 1: 数据流追踪**
```
用户消息: "时长 15s"
    ↓
PTC: 把整个消息作为字符串传递
    ↓
handler.py: duration = input_data.get('duration', 10) → 默认 10
    ↓
LLM: 看到 description="15s" 但实际参数 duration=10
    ↓
生成的代码: durationInFrames=300 (10秒 × 30fps)
```

**Phase 2: 证据确认**
```python
"[DEBUG] input_data content: {'_skill_name': 'remotion-generator', 'task': '创建一个卷积神经网教学视频，时长 15s，前 2s是一个关键 hook，显示卷积神经网的关键逻辑'}\n"
```

`input_data` 中**只有** `task` 字符串，**缺少** `duration` 字段！

## 解决方案

### 修改文件
`src/core/agent/ptc-generator.ts`

### 修改内容

#### 1. 添加 remotion-generator 特殊参数提取指令
```typescript
// Build skill-specific parameter extraction instructions
let skillParamExtraction = '';
if (selectedSkills.includes('remotion-generator')) {
  skillParamExtraction = `
# CRITICAL - REMOTION-GENERATOR PARAMETER EXTRACTION:
# remotion-generator has IMPORTANT parameters beyond 'task' that MUST be extracted:
#
# 1. DURATION (duration in seconds):
#    Patterns to extract: "时长 15s", "15秒", "15 seconds", "duration: 15", "15s"
#    Examples:
#      - "创建一个视频，时长 15s" → duration=15
#      - "15秒的视频" → duration=15
#      - "改成 15s" (modify context) → duration=15
#
# 2. FPS (frames per second):
#    Patterns: "fps 30", "30 fps", "30帧/秒"
#
# 3. RESOLUTION:
#    Patterns: "1920x1080", "1080p", "4K", "720p"
#
# HOW TO EXTRACT:
# 1. SCAN the task for these patterns
# 2. EXTRACT numeric values AND units
# 3. PASS as separate parameters in input_data
#
# CORRECT Example:
#   input_data={
#       'task': '创建一个卷积神经网教学视频，时长 15s，前 2s是一个关键 hook',
#       'duration': 15,  # ✅ Extracted from "15s"
#       'fps': 30,       # ✅ Default if not specified
#       'resolution': '1920x1080'  # ✅ Default if not specified
#   }
#
# WRONG Example (DO NOT DO THIS):
#   input_data={'task': '创建一个卷积神经网教学视频，时长 15s'}  # ❌ Missing duration parameter!
#
# REMEMBER: If user says "15s", YOU MUST extract duration=15 as a SEPARATE parameter!
# Do NOT just pass the entire description as a string and hope the skill extracts it.
# PTC is responsible for parsing structured parameters from natural language.
`;
}
```

#### 2. 添加通用参数提取要求
```typescript
CRITICAL - PARAMETER EXTRACTION REQUIREMENTS:
For each skill, you MUST extract ALL mentioned parameters from the task:
1. SCAN the task description for parameter values (duration, fps, resolution, etc.)
2. EXTRACT numeric values with their units
3. PASS as SEPARATE parameters in input_data (NOT just in the task string)
4. Use DEFAULT values for unspecified parameters based on skill schema
```

#### 3. 更新代码示例
```python
# CORRECT: Parameters extracted separately
input_data={
    'task': '创建一个卷积神经网教学视频，前 2s是一个关键 hook',
    'duration': 15,  # ✅ Extracted from "15s"
    'fps': 30,
    'resolution': '1920x1080'
}

# WRONG: Missing extracted parameters
input_data={'task': '创建视频，时长 15s'}  # ❌ duration not extracted!
```

## 预期效果

### 修复前
```python
# PTC 生成的代码
input_data={'task': '创建一个卷积神经网教学视频，时长 15s'}

# handler.py 接收
duration = input_data.get('duration', 10)  # → 10 (默认值)

# 生成的视频
durationInFrames=300  # 10秒
```

### 修复后
```python
# PTC 生成的代码（自动提取参数）
input_data={
    'task': '创建一个卷积神经网教学视频，时长 15s，前 2s是一个关键 hook',
    'duration': 15,  # ✅ 提取的参数
    'fps': 30,
    'resolution': '1920x1080'
}

# handler.py 接收
duration = input_data.get('duration', 10)  # → 15

# 生成的视频
durationInFrames=450  # 15秒 (15 × 30fps)
```

## 测试用例

### 测试 1: 中文表达
**输入**: `创建一个视频，时长 15s`
**期望**: `input_data={'task': '...', 'duration': 15}`

### 测试 2: 秒的表达
**输入**: `创建一个15秒的视频`
**期望**: `input_data={'task': '...', 'duration': 15}`

### 测试 3: 修改指令
**输入**: `时长有点短，改成 15s`
**期望**: `input_data={'task': '...', 'duration': 15}`

### 测试 4: 复合表达
**输入**: `创建一个4K视频，时长20s，fps 60`
**期望**:
```python
input_data={
    'task': '...',
    'duration': 20,
    'fps': 60,
    'resolution': '3840x2160'  # 4K
}
```

### 测试 5: 未指定（使用默认值）
**输入**: `创建一个教学视频`
**期望**:
```python
input_data={
    'task': '创建一个教学视频',
    'duration': 10,  # 默认值
    'fps': 30,       # 默认值
    'resolution': '1920x1080'  # 默认值
}
```

## 验证步骤

1. **重启后端服务**
   ```bash
   npm run dev
   ```

2. **发送测试请求**
   在前端输入: `创建一个测试视频，时长 15s`

3. **检查生成的代码**
   在日志中搜索: `PTC code`
   验证生成的 Python 代码包含:
   ```python
   input_data={
       'task': '...',
       'duration': 15,  # ← 应该被提取
       'fps': 30,
       'resolution': '1920x1080'
   }
   ```

4. **检查 handler.py 接收**
   在日志中搜索: `input_data content`
   验证 duration 字段存在

5. **验证最终视频时长**
   检查生成的视频实际时长是否为 15s

## 影响范围

- ✅ 只修改 PTC 生成器的 prompt
- ✅ 不影响其他 skills
- ✅ 向后兼容（对于没有额外参数的 task）
- ✅ 提升所有 skills 的参数提取能力

## 后续优化

1. **增强 LLM 的参数识别能力**
   - 添加更多模式匹配示例
   - 支持更多单位的识别（分钟、毫秒等）

2. **参数验证**
   - 在 PTC 阶段验证提取的参数类型
   - 提供更友好的错误提示

3. **扩展到其他 skills**
   - 为 infographic-generator 添加类似的参数提取
   - 为 frontend-design 添加样式参数提取

## 相关文件

- `/Users/leo/workspace/myagent/src/core/agent/ptc-generator.ts` - PTC 生成器（已修改）
- `/Users/leo/workspace/myagent/skills/remotion-generator/handler.py:165` - duration 参数读取
- `/Users/leo/workspace/myagent/docs/ARCHITECTURE_OVERVIEW.md` - 架构文档

## 编者注

此修复遵循**系统化调试方法论**：
1. ✅ Phase 1: 根本原因调查 - 追踪数据流找到断裂点
2. ✅ Phase 2: 模式分析 - 对比正常/异常数据流
3. ✅ Phase 3: 假设测试 - 修改 PTC prompt
4. ⏳ Phase 4: 实施 - 需要验证效果

修改完成时间: 2026-02-10
