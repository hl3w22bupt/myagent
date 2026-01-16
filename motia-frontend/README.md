# Motia Frontend

Motia 前端应用 - 基于 React + Vite 构建的现代化用户界面。

## 🚀 快速开始

### 安装依赖

```bash
cd motia-frontend
npm install
```

### 开发模式

```bash
npm run dev
```

应用将在 http://localhost:5173 运行。

### 生产构建

```bash
npm run build
```

构建产物将输出到 `dist` 目录。

### 预览生产构建

```bash
npm run preview
```

## 📁 项目结构

```
src/
├── components/          # 公共组件
│   ├── Navigation.jsx  # 导航组件
│   └── Navigation.css  # 导航组件样式
├── pages/              # 页面组件
│   ├── Home.jsx        # 首页
│   ├── Home.css        # 首页样式
│   ├── Tasks.jsx       # 任务列表页
│   ├── Tasks.css       # 任务列表页样式
│   ├── TaskDetail.jsx  # 任务详情页
│   ├── TaskDetail.css  # 任务详情页样式
│   ├── Submit.jsx      # 任务提交页
│   ├── Submit.css      # 任务提交页样式
│   ├── Skills.jsx      # 技能管理页
│   ├── Skills.css      # 技能管理页样式
│   ├── Agents.jsx      # 代理管理页
│   ├── Agents.css      # 代理管理页样式
│   ├── Settings.jsx    # 设置页
│   └── Settings.css    # 设置页样式
├── services/           # API 服务
│   └── api.js          # API 客户端
├── App.jsx             # 应用主组件
├── App.css             # 应用样式
├── index.jsx           # 应用入口
└── index.css           # 全局样式
```

## 🛠️ 技术栈

- **React 19** - 用户界面库
- **Vite 7** - 构建工具
- **React Router 7** - 路由管理
- **Axios** - HTTP 客户端
- **CSS3** - 样式

## 🔧 配置

### API 基础地址

默认 API 地址为 `http://localhost:3000`，可在设置页面或 `.env` 文件中修改：

```env
VITE_API_BASE_URL=http://your-api-domain
```

## 📱 响应式设计

应用支持以下屏幕尺寸：

- **桌面端**（≥ 1024px）
- **平板端**（768px - 1023px）
- **移动端**（≤ 767px）

## 🎨 设计系统

### 配色方案

- 主色：蓝色 (#3b82f6)
- 背景色：浅灰 (#f8fafc)
- 文字色：深灰 (#1e293b)

### 字体

- 使用系统字体栈
- 响应式字体大小

## 🔍 页面功能

### 首页 (`/`)

- 系统统计卡片
- 最近任务列表（5条）
- 快速提交入口

### 任务列表 (`/tasks`)

- 任务列表显示
- 状态筛选（全部/待处理/运行中/已完成/失败）
- 排序选项（最新/最旧/执行时间）
- 任务卡片展示

### 任务详情 (`/tasks/:id`)

- 任务基本信息
- 任务内容
- 任务结果（支持文本、表格、图片、视频等格式）
- 错误信息

### 提交任务 (`/submit`)

- 大文本输入区
- 任务提交按钮
- 任务提交提示

### 技能管理 (`/skills`)

- 技能列表
- 技能卡片展示
- 技能详情链接

### 代理管理 (`/agents`)

- 代理列表
- 代理状态显示
- 代理基本信息

### 设置 (`/settings`)

- API 基础地址配置
- 主题设置（浅色/深色/跟随系统）
- 语言设置（中文/英文）
- 自动刷新设置
- 通知设置

## 📄 许可证

MIT License
