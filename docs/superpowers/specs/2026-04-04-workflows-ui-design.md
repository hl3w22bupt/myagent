# Workflows UI 设计规格文档

> **目标**: 为 MyAgent 前端添加 Workflows 管理页面，支持列表视图和 DAG 可视化
> **日期**: 2026-04-04
> **作者**: Claude & Leo
> **状态**: 设计阶段

---

## 1. 功能概述

### 1.1 目标
- 提供一个集中的界面管理和查看所有 workflows
- 支持两种视图模式：列表视图（默认）和 DAG 可视化
- 提供交互式的 DAG 图，支持缩放、拖拽、节点详情查看

### 1.2 覆盖场景
- 查看 workflow 列表和基本信息
- 可视化 workflow 的执行流程和依赖关系
- 快速理解复杂 workflow 的结构
- 为将来的 workflow 执行监控功能预留接口

---

## 2. 用户界面设计

### 2.1 页面布局

```
┌─────────────────────────────────────────────────────────┐
│  MyAgent Logo                          [Search] [User] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Home] [Tasks] [Submit] [Skills] [Agents]             │
│  [Autonomous] [Knowledge] [⭐Workflows] [Dashboard]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Workflows                                              │
│  ─────────────                                          │
│                                                         │
│  [🔄 刷新]  [🔍 搜索: ___________]  [视图: 列表▼]      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 名称       │ 描述              │ 步骤 │ 操作    │  │
│  ├─────────────────────────────────────────────────┤  │
│  │ Code Review │ 代码审查流程     │ 4    │ [可视化]│  │
│  │ Deployment  │ 部署流程         │ 6    │ [可视化]│  │
│  │ ...         │ ...              │ ...  │ ...     │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 DAG 可视化模态框

```
┌─────────────────────────────────────────────────────────┐
│  Workflow DAG: Code Review Pipeline         [×]         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [🔍+][-]  [📏 Fit]  [💾 Export]                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │   ┌──────────┐         ┌──────────┐            │  │
│  │   │  Start   │───────>│ Analyze  │            │  │
│  │   └──────────┘         └──────────┘            │  │
│  │          │                  │                  │  │
│  │          v                  v                  │  │
│  │   ┌──────────┐         ┌──────────┐            │  │
│  │   │  Review  │<────────│  Test    │            │  │
│  │   └──────────┘         └──────────┘            │  │
│  │                                                  │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  点击节点查看详情                                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 技术架构

### 3.1 技术栈

| 类别 | 技术 | 用途 |
|------|------|------|
| 前端框架 | React + Vite | 现有技术栈 |
| UI 库 | TailwindCSS | 现有样式系统 |
| DAG 可视化 | React Flow | 交互式节点图 |
| 路由 | React Router | 现有路由系统 |
| HTTP 客户端 | Fetch API | API 调用 |
| 图形布局 | Dagre (可选) | 自动布局算法 |

### 3.2 组件架构

```
motia-frontend/src/
├── pages/
│   └── Workflows.jsx                 # 主页面容器
├── components/
│   ├── workflows/
│   │   ├── WorkflowList.jsx          # 列表视图组件
│   │   ├── WorkflowDAG.jsx           # DAG 可视化组件
│   │   ├── WorkflowDetailModal.jsx   # 详情模态框
│   │   ├── WorkflowCard.jsx          # 卡片组件（可选）
│   │   └── DAGNode.jsx               # 自定义 DAG 节点
│   └── Navigation.jsx                # 更新导航菜单
├── services/
│   └── workflowService.js            # API 调用封装
└── utils/
    └── dagLayout.js                  # DAG 布局计算
```

---

## 4. 数据流设计

### 4.1 API 接口

#### 4.1.1 获取 Workflow 列表（已存在）
```http
GET /api/workflows
```

**响应**：
```json
{
  "success": true,
  "count": 9,
  "workflows": [
    {
      "name": "code-review-pipeline",
      "description": "代码审查流程",
      "input_schema": { ... },
      "output_schema": { ... }
    }
  ]
}
```

#### 4.1.2 获取 Workflow 详情（需要增强）
```http
GET /api/workflows/:name
```

**响应**：
```json
{
  "success": true,
  "workflow": {
    "name": "code-review-pipeline",
    "description": "代码审查流程",
    "steps": [
      {
        "id": "analyze",
        "name": "分析代码",
        "type": "agent",
        "agent": "code-analyzer",
        "depends_on": [],
        "input": { "task": "分析 {{ input.repo }}" }
      },
      {
        "id": "review",
        "name": "人工审查",
        "type": "hitl",
        "hitl": {
          "question": "代码是否通过审查？",
          "options": [ ... ]
        },
        "depends_on": ["analyze"]
      }
    ],
    "input_schema": { ... },
    "output_schema": { ... }
  }
}
```

### 4.2 数据流

```
用户访问 Workflows 页面
        ↓
调用 workflowService.getWorkflows()
        ↓
GET /api/workflows
        ↓
显示 WorkflowList 组件
        ↓
用户点击"可视化"按钮
        ↓
调用 workflowService.getWorkflowDetail(name)
        ↓
GET /api/workflows/:name
        ↓
显示 WorkflowDAG 模态框
        ↓
React Flow 渲染节点和边
        ↓
用户与 DAG 交互（缩放、拖拽、点击节点）
        ↓
显示 WorkflowDetailModal（节点详情）
```

---

## 5. 组件详细设计

### 5.1 WorkflowList 组件

**职责**: 显示 workflow 列表，支持搜索和过滤

**Props**:
```typescript
interface WorkflowListProps {
  workflows: Workflow[];
  onVisualize: (workflowName: string) => void;
  loading?: boolean;
}
```

**状态**:
```typescript
interface WorkflowListState {
  searchTerm: string;
  filteredWorkflows: Workflow[];
  sortBy: 'name' | 'steps' | 'date';
}
```

**核心功能**:
- 表格显示：名称、描述、步骤数量、操作
- 搜索过滤：实时过滤 workflow 名称
- 排序：按名称、步骤数量排序
- 分页（可选）：如果 workflow 数量 > 20

### 5.2 WorkflowDAG 组件

**职责**: 渲染交互式 DAG 可视化

**Props**:
```typescript
interface WorkflowDAGProps {
  workflow: WorkflowDetail;
  onNodeClick: (stepId: string) => void;
}
```

**核心功能**:
- 使用 React Flow 渲染节点和边
- 自动布局计算节点位置
- 支持缩放、拖拽
- 不同节点类型使用不同颜色：
  - Agent Step: 蓝色
  - HITL Step: 橙色
  - Subworkflow: 绿色
- 点击节点触发详情显示

**节点样式**:
```typescript
const nodeStyles = {
  agent: {
    background: '#3b82f6',
    borderColor: '#1d4ed8',
  },
  hitl: {
    background: '#f59e0b',
    borderColor: '#d97706',
  },
  subworkflow: {
    background: '#10b981',
    borderColor: '#059669',
  },
};
```

### 5.3 WorkflowDetailModal 组件

**职责**: 显示 workflow 或步骤的详细信息

**Props**:
```typescript
interface WorkflowDetailModalProps {
  workflow?: WorkflowDetail;
  step?: WorkflowStep;
  onClose: () => void;
}
```

**显示内容**:
- Workflow 级别：名称、描述、输入/输出 schema
- Step 级别：步骤 ID、名称、类型、配置、依赖关系

---

## 6. 实现细节

### 6.1 DAG 节点生成

```javascript
function buildDAGNodes(workflow: WorkflowDetail) {
  return workflow.steps.map(step => ({
    id: step.id,
    type: 'custom',
    data: {
      label: step.name || step.id,
      stepType: step.type || 'agent',
      step: step,
    },
    position: calculatePosition(step, workflow.steps),
  }));
}

function buildDAGEdges(workflow: WorkflowDetail) {
  const edges = [];
  workflow.steps.forEach(step => {
    if (step.depends_on) {
      step.depends_on.forEach(depId => {
        edges.push({
          id: `${depId}-${step.id}`,
          source: depId,
          target: step.id,
          type: 'smoothstep',
          animated: true,
        });
      });
    }
  });
  return edges;
}
```

### 6.2 自动布局（可选：使用 Dagre）

```javascript
import dagre from 'dagre';

function layoutWithDagre(nodes, edges) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB' }); // TB = Top to Bottom

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: 200, height: 50 });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map(node => ({
    ...node,
    position: {
      x: dagreGraph.node(node.id).x,
      y: dagreGraph.node(node.id).y,
    },
  }));
}
```

### 6.3 路由配置

**App.jsx**:
```jsx
import Workflows from './pages/Workflows';

// 在路由配置中添加
<Route path="/workflows" element={<Workflows />} />
```

**Navigation.jsx**:
```jsx
// 在菜单项中添加
const menuItems = [
  // ... 现有菜单项
  {
    path: '/workflows',
    label: 'Workflows',
    icon: <FiGitBranch />, // 或其他合适的图标
  },
];
```

---

## 7. 错误处理

### 7.1 API 错误处理

```javascript
try {
  const workflows = await workflowService.getWorkflows();
  setWorkflows(workflows);
} catch (error) {
  setError('无法加载 workflows，请稍后重试');
  logger.error('Failed to load workflows', error);
}
```

### 7.2 边界情况

| 场景 | 处理方式 |
|------|---------|
| 无 workflows | 显示空状态提示 |
| Workflow 加载失败 | 显示错误消息和重试按钮 |
| DAG 布局失败 | 降级到简单列表视图 |
| 节点过多（>50） | 提供缩略视图或分页 |

---

## 8. 性能优化

### 8.1 列表优化
- 使用虚拟滚动（如 react-window）处理大量 workflows
- 防抖搜索输入（300ms）

### 8.2 DAG 渲染优化
- 懒加载 React Flow 组件
- 缓存布局计算结果
- 限制节点数量阈值（>100 节点时警告）

### 8.3 API 优化
- 实现客户端缓存（5 分钟）
- 使用 React Query 或 SWR 管理数据

---

## 9. 测试计划

### 9.1 单元测试
- `workflowService.js`: API 调用逻辑
- `dagLayout.js`: 布局计算函数
- 组件：WorkflowList, WorkflowDAG, WorkflowDetailModal

### 9.2 集成测试
- 完整用户流程：访问页面 → 查看列表 → 可视化 DAG → 关闭
- API 集成：验证后端接口返回正确数据

### 9.3 E2E 测试
- 使用 Cypress 或 Playwright 测试完整用户场景

---

## 10. 未来扩展

### 10.1 预留功能
- Workflow 执行按钮
- 实时执行状态显示
- Workflow 编辑器（拖拽式）
- 导出 DAG 为图片
- Workflow 版本历史

### 10.2 API 扩展点
```typescript
// 未来可能的 API
POST /api/workflows/:name/execute    // 执行 workflow
GET /api/workflows/:name/executions  // 查看执行历史
GET /api/workflows/:name/executions/:id  // 查看执行详情
```

---

## 11. 开发时间估算

| 任务 | 预估时间 | 依赖 |
|------|---------|------|
| 后端 API 增强 | 0.5 天 | - |
| 前端路由和导航 | 0.5 天 | - |
| WorkflowList 组件 | 1 天 | 路由 |
| WorkflowDAG 组件 | 2-3 天 | React Flow 集成 |
| WorkflowDetailModal | 0.5 天 | - |
| 测试和优化 | 1 天 | 所有组件 |
| **总计** | **5-6 天** | - |

---

## 12. 验收标准

- [ ] 能够显示所有 workflows 列表
- [ ] 支持搜索和过滤 workflows
- [ ] 点击"可视化"按钮显示 DAG
- [ ] DAG 支持缩放、拖拽
- [ ] 不同步骤类型使用不同颜色
- [ ] 点击节点显示详情
- [ ] 响应式设计，支持移动端
- [ ] 通过所有测试用例
- [ ] 性能：列表加载 < 1s，DAG 渲染 < 2s

---

**文档版本**: v1.0
**最后更新**: 2026-04-04
