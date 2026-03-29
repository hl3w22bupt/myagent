# Workspace Artifact Management

## Overview

为每个 task 创建独立的工作空间（workspace），skill 执行产生的文件统一在 workspace 中管理，执行结束后自动扫描并转移产物到分类目录。

## 架构设计

### 目录结构

```
tmp-workspace/
└── {task_id}/               # 每个 task 独立的工作空间
    ├── tool-bash/           # 按 skill name 分类的子目录
    │   └── output.mp4
    ├── ffmpeg/
    │   └── processed.mp4
    ├── remotion-generator/
    │   └── video.mp4
    └── infographic-generator/
        └── chart.png

outputs/                     # 统一的产物存储
├── videos/
│   └── {task_id}_{skill_name}_{original_name}.mp4
├── images/
│   └── {task_id}_{skill_name}_{original_name}.png
├── audios/
│   └── {task_id}_{skill_name}_{original_name}.mp3
└── codes/
    └── {task_id}_{skill_name}_{original_name}.py
```

### 执行流程

```
┌─────────────────────────────────────────────────────────────────┐
│ Task 开始                                                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TaskHook.pre_exec()                                             │
│  - 清理旧的 workspace (双保险，如果存在则先清空)                 │
│  - 创建 tmp-workspace/{task_id}/{skill_name}/                   │
│  - 设置 SkillContext.workspace_dir                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Skill 执行 (在 workspace 中)                                    │
│  - Native Skills 从 context.workspace_dir 获取工作目录          │
│  - Claude Skills 通过 tool-bash 间接使用 workspace              │
│  - 所有产物文件落在 workspace/ 下                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SkillHookExecutor.post_exec()                                   │
│  - 扫描 workspace/ 目录                                         │
│  - 按文件扩展名分类 (videos/images/audios/codes)                │
│  - 复制文件到 outputs/{type}/                                   │
│  - 文件命名: {task_id}_{skill_name}_{original_name}             │
│  - 记录到 result["output_files"]                                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ TaskHook.post_exec()                                            │
│  - 清空 workspace/ 目录                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 文件类型映射

```python
ARTIFACT_TYPES = {
    "videos": [".mp4", ".mov", ".avi", ".webm", ".mkv", ".flv"],
    "images": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
    "audios": [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"],
    "codes":  [".py", ".js", ".ts", ".jsx", ".tsx", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css", ".md", ".sh", ".sql"],
}

SKIP_PATTERNS = [
    "*.tmp", "*~", ".DS_Store", "__pycache__", "*.pyc",
    "node_modules", ".git", "*.log"
]
```

## 多产物处理

当一个 skill 产生多个不同类型的文件时，**每个文件按自己的扩展名独立分类**：

```python
# 扫描结果示例
artifacts = {
    "videos": ["output.mp4"],
    "images": ["thumbnail.png", "poster.jpg"],
    "codes": ["script.sh"],
}

# 转移后
outputs/
├── videos/123_ffmpeg_output.mp4
├── images/
│   ├── 123_ffmpeg_thumbnail.png
│   └── 123_ffmpeg_poster.jpg
└── codes/123_ffmpeg_script.sh
```

## Skill 约束

### 需要修改的 Native Skills

| Skill | 产物类型 | 修改方式 |
|-------|----------|----------|
| tool-bash | 任意文件 | working_dir 参数 |
| tool-write | 文件写入 | 输出路径前缀加 workspace |
| tool-edit | 文件编辑 | 同上 |
| remotion-generator | 视频 | 输出路径配置 |
| infographic-generator | 图表 | 输出路径配置 |
| lite-tts | 音频 | 输出路径配置 |
| volcano-tts | 音频 | 输出路径配置 |

### 统一接口

```python
# SkillContext 添加 workspace_dir 字段
class SkillContext:
    skill_name: str
    task_id: str
    session_id: str
    input_data: Dict[str, Any]
    metadata: Dict[str, Any]
    workspace_dir: str  # 新增: tmp-workspace/{task_id}/{skill_name}/
```

### Skill 使用示例

```python
async def execute(self, input_data, context: SkillContext):
    workspace = context.workspace_dir

    # 产出文件放到 workspace 下
    output_path = os.path.join(workspace, "output.mp4")

    # 或者使用环境变量兜底
    workspace = os.getenv("MOTIA_WORKSPACE_DIR", context.workspace_dir)
```

### Claude Skills

Claude Skills（如 ffmpeg）通过 tool-bash 间接使用 workspace，无需单独修改：

```
用户请求 → Agent → ffmpeg skill (Claude) → 生成 PTC → tool-bash → workspace/
```

## 兼容性

### 与现有 output_files 兼容

Native skill 可以显式设置 output_files，优先级高于扫描：

```python
# 1. 先检查 result.get("output_files")
if result.get("output_files"):
    # 使用显式指定的文件，跳过扫描
    return result

# 2. 如果没有显式指定，扫描 workspace
artifacts = scan_workspace(context.workspace_dir)
```

### 环境变量兜底

在 SkillHookExecutor 中设置环境变量，确保所有 skill 都能获取 workspace：

```python
os.environ['MOTIA_WORKSPACE_DIR'] = workspace_dir
```

## 实现计划

### Phase 1: 核心基础设施 (P0)

| 任务 | 文件 | 工作量 |
|------|------|--------|
| WorkspaceManager 实现 | 新建 `src/core/skill/hooks/workspace_manager.py` | 60 min |
| SkillContext 添加 workspace_dir | `src/core/skill/hooks/base.py` | 15 min |
| SkillHookExecutor 集成 | `src/core/skill/hooks/executor.py` | 60 min |

### Phase 2: 核心 Skills 修改 (P0)

| 任务 | 文件 | 工作量 |
|------|------|--------|
| tool-bash 使用 workspace | `skills/tool-bash/handler.py` | 30 min |
| tool-write 使用 workspace | `skills/tool-write/handler.py` | 20 min |
| tool-edit 使用 workspace | `skills/tool-edit/handler.py` | 20 min |

### Phase 3: 专用 Skills 修改 (P1)

| 任务 | 文件 | 工作量 |
|------|------|--------|
| remotion-generator | `skills/remotion-generator/handler.py` | 20 min |
| infographic-generator | `skills/infographic-generator/handler.py` | 20 min |
| tts skills | `skills/lite-tts/handler.py`, `skills/volcano-tts/handler.py` | 30 min |

### Phase 4: 测试验证 (P0)

| 任务 | 工作量 |
|------|--------|
| 单轮 task 测试 | 30 min |
| 多轮对话测试 | 30 min |
| 并发 task 测试 | 30 min |
| 边界情况测试 | 30 min |

**总工作量**: 约 6-7 小时

## 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 子目录结构 | `{task_id}/{skill_name}/` | 避免文件名冲突，便于追溯 |
| 文件转移方式 | 复制 | 保持 workspace 完整，便于调试 |
| 多产物处理 | 每个文件独立分类 | 不强制选择"主要"类型 |
| 清理时机 | 每轮结束后 | 避免磁盘膨胀，支持多轮对话 |
| 兼容性 | 显式 output_files 优先 | 不影响现有 native skill 行为 |

## 待确认问题

1. ~~产物分类规则：扩展名映射表放哪里？~~ → 放在 WorkspaceManager 中
2. ~~并发安全：多个 task 同时执行时的文件冲突？~~ → task_id 隔离
3. ~~文件转移：是复制还是移动？~~ → 复制
4. ~~与现有 output_files 兼容？~~ → 显式优先
5. workspace 大小限制？是否需要监控？
6. 清理失败时的降级策略？
