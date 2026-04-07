# Workspace API 前端实现文档

## 概述

Workspace API 提供任务工作区（workspace）的文件列表功能，允许用户查看 ExternalAgent 创建的所有文件。

## API 规范

### 端点
```
GET /api/workspace/:taskId
```

### 路径参数
- `taskId`: 任务 ID（格式：`task-{timestamp}-{sequence}`）

### 响应格式

**成功响应**（200）：
```json
{
  "success": true,
  "data": {
    "taskId": "task-1775573783066-1",
    "workspace": "/tmp/test-fileops",
    "files": [
      {
        "name": "file1.txt",
        "path": "/tmp/test-fileops/file1.txt",
        "size": 5,
        "type": "file",
        "modifiedTime": "2026-04-07T14:56:45.991Z",
        "relativePath": "file1.txt"
      },
      {
        "name": "subdir",
        "path": "/tmp/test-fileops/subdir",
        "size": 0,
        "type": "directory",
        "modifiedTime": "2026-04-07T14:56:46.188Z",
        "relativePath": "subdir"
      }
    ],
    "summary": {
      "fileCount": 2,
      "dirCount": 1,
      "totalSize": 1024
    }
  }
}
```

**错误响应**：
- `400` - Invalid taskId format / Task does not have a workspace
- `403` - Invalid workspace path（安全检查）
- `404` - Task not found / Workspace directory not found
- `500` - Server error

## 前端实现指南

### 1. 在任务详情页添加 Workspace Tab

**位置**: 任务详情页面（Task Detail Page）

**UI 建议布局**：
```
┌─────────────────────────────────────────┐
│ Task Details                             │
├─────────────────────────────────────────┤
│ [Overview] [Workspace] [Artifacts] ... │  ← 新增 Workspace Tab
├─────────────────────────────────────────┤
│                                         │
│ Workspace: /tmp/test-fileops            │
│                                         │
│ 📁 root.txt (5 B)                       │
│ 📁 subdir/                              │
│   📄 file1.txt (10 B)                   │
│   📄 file2.txt (15 B)                   │
│                                         │
│ Summary: 3 files, 1 directory, 25 B     │
└─────────────────────────────────────────┘
```

### 2. 数据获取

```typescript
// API 调用示例
async function getWorkspaceFiles(taskId: string) {
  const response = await fetch(`/api/workspace/${taskId}`);
  const data = await response.json();

  if (data.success) {
    return {
      workspace: data.data.workspace,
      files: data.data.files,
      summary: data.data.summary,
    };
  } else {
    throw new Error(data.error);
  }
}

// 使用示例
const workspaceData = await getWorkspaceFiles('task-1775573783066-1');
console.log(workspaceData.workspace); // '/tmp/test-fileops'
console.log(workspaceData.files); // 文件列表
```

### 3. 文件列表渲染

```typescript
interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  modifiedTime: string;
  relativePath: string;
}

function WorkspaceTab({ taskId }: { taskId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceFiles(taskId)
      .then(setWorkspace)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;
  if (!workspace) return <EmptyState />;

  return (
    <div className="workspace-tab">
      <WorkspaceInfo
        path={workspace.workspace}
        summary={workspace.summary}
      />
      <FileList files={workspace.files} />
    </div>
  );
}
```

### 4. 文件图标

```typescript
function getFileIcon(type: 'file' | 'directory', name: string) {
  if (type === 'directory') {
    return '📁'; // 文件夹图标
  }

  // 根据文件扩展名返回不同图标
  const ext = name.split('.').pop()?.toLowerCase();
  const icons: Record<string, string> = {
    'txt': '📄',
    'py': '🐍',
    'js': '📜',
    'ts': '📘',
    'json': '📋',
    'md': '📝',
    'jpg': '🖼️',
    'png': '🖼️',
  };

  return icons[ext || ''] || '📄';
}
```

### 5. 文件大小格式化

```typescript
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
```

### 6. 树形结构显示（可选）

对于包含子目录的 workspace，可以使用树形结构：

```typescript
function buildFileTree(files: FileInfo[]): FileNode[] {
  const root: FileNode[] = [];

  files.forEach(file => {
    const parts = file.relativePath.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      const existing = currentLevel.find(node => node.name === part);

      if (existing) {
        currentLevel = existing.children || [];
      } else {
        const isLast = index === parts.length - 1;
        const node: FileNode = {
          name: part,
          type: file.type,
          path: file.path,
          size: file.size,
          children: isLast ? undefined : [],
        };
        currentLevel.push(node);
        if (!isLast) {
          currentLevel = node.children!;
        }
      }
    });
  });

  return root;
}
```

## 注意事项

### 安全性
- API 已实现路径验证，防止路径遍历攻击
- 只允许访问特定前缀的目录（/tmp/myagent-workspaces, /Users/leo/workspace 等）
- 递归深度限制为 5 层

### 性能
- 对于大型 workspace，API 响应可能较大
- 建议前端实现虚拟滚动或分页
- 考虑添加文件数量限制提示

### 用户体验
- 显示 workspace 路径，让用户知道文件在哪里
- 提供文件操作统计（文件数、目录数、总大小）
- 对于无 workspace 的任务，显示友好的提示信息

## 示例用例

### 用例 1: 查看 Python 脚本任务的输出
```json
{
  "workspace": "/tmp/test-complex",
  "files": [
    {"name": "hello.py", "type": "file", "size": 33}
  ],
  "summary": {
    "fileCount": 1,
    "dirCount": 0,
    "totalSize": 33
  }
}
```

### 用例 2: 查看多文件项目的结构
```json
{
  "workspace": "/tmp/test-nested",
  "files": [
    {"name": "root.txt", "relativePath": "root.txt"},
    {"name": "subdir1", "type": "directory", "relativePath": "subdir1"},
    {"name": "file1.txt", "relativePath": "subdir1/file1.txt"},
    {"name": "subdir2", "type": "directory", "relativePath": "subdir1/subdir2"},
    {"name": "file2.txt", "relativePath": "subdir1/subdir2/file2.txt"}
  ],
  "summary": {
    "fileCount": 3,
    "dirCount": 2,
    "totalSize": 15
  }
}
```

## 测试命令

```bash
# 测试简单文件列表
curl http://localhost:3000/api/workspace/task-1775573783066-1 | jq '.'

# 测试嵌套目录
curl http://localhost:3000/api/workspace/task-1775575000543-1 | jq '.'

# 测试不存在的任务
curl http://localhost:3000/api/workspace/task-invalid | jq '.'
```

## 相关文件

- **后端实现**: `steps/api/workspace-api.step.ts`
- **类型定义**: `src/core/database/data-store.ts`
- **ExternalAgent**: `src/core/agent/external-agent.ts`
