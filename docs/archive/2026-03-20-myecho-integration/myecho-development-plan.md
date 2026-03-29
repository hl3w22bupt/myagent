# MyEcho - Flutter 客户端开发计划

## Context

为 **MyEcho** 产品（AI 情感伴侣 - 提供情绪价值与情感回响）开发完整的全栈应用。

**品牌理念**：你的心声，必有回响 (Your Heart, Reflected)

**重要**：MyEcho 是独立的系统，会调用 myagent 提供的 AI Agent 分布式服务，但需要独立设计和实现后端 API。

### 技术关系

```
┌─────────────────────────────────────────────────────────────────┐
│                          MyEcho 系统                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────┐               │
│  │  Flutter 客户端  │ ◄─────► │   MyEcho 后端    │               │
│  │  (Android/iOS)  │  API    │   (Motia 框架)    │               │
│  └─────────────────┘         └────────┬────────┘               │
│                                       │                         │
│                                       │ myagent API             │
│                                       ▼                         │
│                              ┌─────────────────┐               │
│                              │  myagent 服务    │               │
│                              │  (AI Agent 系统) │               │
│                              └─────────────────┘               │
└─────────────────────────────────────────────────────────────────┘

代码仓库:
- /root/workspace/myagent          (现有 - myagent AI 服务)
- /root/workspace/myecho-backend   (新建 - MyEcho Motia 后端)
- /root/workspace/myecho-app       (新建 - Flutter 客户端)
```

### MyEcho 后端职责
- 用户管理（设备 ID 认证）
- 人设和形象管理
- 聊天会话管理
- 记忆存储和检索
- 亲密度计算
- TTS 语音合成
- 调用 myagent 的 AI 能力

### myagent 服务职责
- LLM 对话生成
- subagent 人设管理
- 记忆提取和存储
- 流式响应

---

## 技术架构

### 全栈架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Flutter 客户端 (MyEcho)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Dart + Flutter 3.24+ | Riverpod | Dio | WebSocket                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ REST + WebSocket
┌─────────────────────────────────────────────────────────────────────┐
│                        MyEcho 后端服务                              │
├─────────────────────────────────────────────────────────────────────┤
│  Motia 框架 (TypeScript)                                            │
│  ├─ 用户模块 (设备 ID 认证)                                          │
│  ├─ 人设模块 (3 个预设人设管理)                                       │
│  ├─ 形象模块 (4 个预设形象管理)                                       │
│  ├─ 聊天模块 (会话管理、消息存储)                                     │
│  ├─ 记忆模块 (结构化存储、检索)                                       │
│  ├─ 亲密度模块 (等级计算)                                            │
│  └─ TTS 模块 (火山引擎语音合成)                                     │
├─────────────────────────────────────────────────────────────────────┤
│  数据库: PostgreSQL                                                 │
│  存储: OSS (对象存储，用于形象图片/音频)                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ HTTP API 调用
┌─────────────────────────────────────────────────────────────────────┐
│                        myagent AI 服务                               │
├─────────────────────────────────────────────────────────────────────┤
│  - /agent/execute - 执行 AI 对话                                    │
│  - /api/agents - 获取 subagent 列表                                 │
│  - WebSocket - 流式响应                                             │
│  - 记忆提取与存储                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 后端技术栈

**MyEcho 后端：Motia 框架**

| 组件 | 技术 | 说明 |
|------|------|------|
| 框架 | **Motia** | 与 myagent 统一架构 |
| 语言 | **TypeScript** | 当前主要语言 |
| 数据库 | **PostgreSQL** | 关系型数据库 |
| 存储 | **对象存储 (OSS)** | 形象图片、音频文件 |
| 未来扩展 | **Golang** | Motia 官方计划支持 |

**架构优势：**
- ✅ 统一技术栈，降低维护成本
- ✅ 复用 Motia 的流式响应、subagent 能力
- ✅ 可直接调用 myagent 服务
- ✅ 独立 Git repo，代码隔离

---

## 项目结构

### MyEcho 后端项目结构（Motia 框架）

```
myecho-backend/
├── motia.config.ts               # Motia 配置
├── package.json
├── tsconfig.json
├── .env                          # 环境变量
│
├── src/                          # 源代码
│   │
│   ├── steps/                    # Motia Steps（API 端点）
│   │   ├── api/
│   │   │   ├── chat-api.step.ts      # 聊天 API
│   │   │   ├── session-api.step.ts   # 会话管理 API
│   │   │   ├── memory-api.step.ts    # 记忆 API
│   │   │   ├── character-api.step.ts # 人设 API
│   │   │   ├── avatar-api.step.ts    # 形象 API
│   │   │   └── tts-api.step.ts       # TTS API
│   │   │
│   │   ├── services/
│   │   │   ├── myagent-client.step.ts    # 调用 myagent 服务
│   │   │   ├── memory-processor.step.ts  # 记忆处理
│   │   │   └── intimacy-calculator.step.ts # 亲密度计算
│   │   │
│   │   └── streams/
│   │       └── chat-stream.stream.ts     # 聊天实时流
│   │
│   ├── core/                     # 核心模块
│   │   ├── database/
│   │   │   ├── data-store.ts          # 数据库连接
│   │   │   └── schema.ts              # 数据库 Schema
│   │   │
│   │   ├── models/
│   │   │   ├── User.ts
│   │   │   ├── Character.ts
│   │   │   ├── Avatar.ts
│   │   │   ├── ChatSession.ts
│   │   │   ├── Message.ts
│   │   │   ├── Memory.ts
│   │   │   └── Intimacy.ts
│   │   │
│   │   └── services/
│   │       ├── MyAgentService.ts       # myagent 服务封装
│   │       ├── TTSService.ts           # TTS 服务
│   │       └── StorageService.ts       # 对象存储
│   │
│   └── types/                    # TypeScript 类型
│       └── index.d.ts
│
├── subagents/                    # MyEcho 专用 subagent（可选）
│   ├── characters/               # 人设 subagent 定义
│   │   ├── energetic-girlfriend.subagent.yaml
│   │   ├── gentle-sister.subagent.yaml
│   │   └── neighbor-girl.subagent.yaml
│   │
│   └── prompts/                  # 人设 Prompt 模板
│
├── migrations/                   # 数据库迁移（可选）
└── tests/                        # 测试
```

### Flutter 客户端项目结构

```
myecho-app/
├── lib/
│   ├── main.dart                    # 入口文件
│   ├── app.dart                     # App 根组件
│   │
│   ├── core/                        # 核心功能
│   │   ├── config/
│   │   │   ├── env.dart            # 环境配置
│   │   │   └── api_config.dart     # API 配置
│   │   ├── network/
│   │   │   ├── api_client.dart     # Dio 封装
│   │   │   ├── websocket_client.dart # WebSocket 封装
│   │   │   └── interceptors.dart   # 请求拦截器
│   │   ├── storage/
│   │   │   ├── shared_prefs.dart   # 简单存储
│   │   │   └── database.dart       # SQLite (Drift)
│   │   └── constants/
│   │       ├── assets.dart         # 资源路径
│   │       └── strings.dart        # 字符串常量
│   │
│   ├── data/                        # 数据层
│   │   ├── models/
│   │   │   ├── message.dart        # 消息模型
│   │   │   ├── session.dart        # 会话模型
│   │   │   ├── character.dart      # 人设/形象模型
│   │   │   ├── memory.dart         # 记忆档案模型
│   │   │   └── intimacy.dart       # 亲密度模型
│   │   ├── repositories/
│   │   │   ├── chat_repository.dart
│   │   │   ├── memory_repository.dart
│   │   │   └── character_repository.dart
│   │   └── services/
│   │       ├── myecho_api_service.dart    # MyEcho API 调用
│   │       └── audio_service.dart          # 音频播放
│   │
│   ├── presentation/                # UI 层
│   │   ├── providers/               # Riverpod 状态管理
│   │   │   ├── chat_provider.dart
│   │   │   ├── memory_provider.dart
│   │   │   ├── character_provider.dart
│   │   │   └── websocket_provider.dart
│   │   │
│   │   ├── pages/                   # 页面
│   │   │   ├── home/
│   │   │   │   └── character_selection_page.dart  # 人设选择
│   │   │   ├── avatar/
│   │   │   │   └── avatar_selection_page.dart     # 形象选择
│   │   │   ├── chat/
│   │   │   │   └── chat_page.dart                # 聊天主页
│   │   │   ├── memory/
│   │   │   │   └── memory_profile_page.dart      # 记忆档案
│   │   │   └── profile/
│   │   │       └── profile_page.dart             # 个人中心
│   │   │
│   │   ├── widgets/                # 可复用组件
│   │   │   ├── common/
│   │   │   │   ├── app_button.dart
│   │   │   │   ├── app_card.dart
│   │   │   │   └── loading_indicator.dart
│   │   │   ├── chat/
│   │   │   │   ├── message_bubble.dart
│   │   │   │   ├── chat_input_box.dart
│   │   │   │   └── typing_indicator.dart
│   │   │   ├── character/
│   │   │   │   ├── character_card.dart
│   │   │   │   └── avatar_grid.dart
│   │   │   └── memory/
│   │   │       ├── memory_section.dart
│   │   │       └── intimacy_progress_bar.dart
│   │   │
│   │   └── theme/                  # 主题配置
│   │       ├── app_colors.dart     # 复用 motia-frontend 配色
│   │       ├── app_text_theme.dart
│   │       └── app_theme.dart
│   │
│   └── l10n/                       # 国际化（可选）
│       └── app_zh.arb
│
├── assets/                         # 资源文件
│   ├── images/                     # 预设形象图片 (4 个)
│   │   ├── pure/
│   │   ├── sexy/
│   │   ├── neighbor/
│   │   └── sporty/
│   └── fonts/                      # 自定义字体（可选）
│
├── android/                        # Android 原生配置
├── ios/                            # iOS 配置（预留）
├── web/                            # Web 配置（可选）
├── pubspec.yaml                    # 依赖配置
└── analysis_options.yaml           # 代码分析配置
```

---

## MVP 功能开发顺序

### 阶段零：MyEcho 后端 API 开发（3-4 周）

**优先级：最高（前端依赖）**

#### 核心任务清单（Motia 框架）

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| **0.1 初始化 Motia 项目** | 创建 myecho-backend 项目 | `motia.config.ts` |
| **0.2 数据库 Schema** | PostgreSQL 表设计 | `src/core/database/schema.ts` |
| **0.3 数据模型** | TypeScript 数据模型 | `src/core/models/` |
| **0.4 myagent 客户端 Step** | 调用 myagent 服务 | `src/steps/services/myagent-client.step.ts` |
| **0.5 聊天 API Step** | 创建会话、发送消息 | `src/steps/api/chat-api.step.ts` |
| **0.6 会话 API Step** | 会话管理 | `src/steps/api/session-api.step.ts` |
| **0.7 人设 API Step** | CRUD 3 个预设人设 | `src/steps/api/character-api.step.ts` |
| **0.8 形象 API Step** | CRUD 4 个预设形象 | `src/steps/api/avatar-api.step.ts` |
| **0.9 记忆 API Step** | 存储和检索记忆 | `src/steps/api/memory-api.step.ts` |
| **0.10 亲密度计算 Step** | 计算亲密度等级 | `src/steps/services/intimacy-calculator.step.ts` |
| **0.11 聊天流 Stream** | 实时推送消息 | `src/steps/streams/chat-stream.stream.ts` |
| **0.12 TTS 集成** | 火山引擎 TTS | `src/core/services/TTSService.ts` |

#### 数据库设计

```sql
-- 用户表（设备 ID 认证，MVP 阶段）
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 人设表
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  personality JSONB,
  subagent_id VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 形象表
CREATE TABLE avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  style VARCHAR(50),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户配置（关联人设和形象）
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  character_id UUID REFERENCES characters(id),
  avatar_id UUID REFERENCES avatars(id),
  nickname VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 聊天会话表
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  character_id UUID REFERENCES characters(id),
  myagent_task_id VARCHAR(255),
  intimacy_level INT DEFAULT 1,
  chat_days INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 消息表
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  emotion JSONB,
  audio_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 记忆表
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  session_id UUID REFERENCES chat_sessions(id),
  category VARCHAR(50),
  key VARCHAR(100),
  value JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### API 端点设计

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /api/chat/sessions | 创建聊天会话 |
| POST | /api/chat/sessions/:id/messages | 发送消息（调用 myagent） |
| GET | /api/chat/sessions/:id/messages | 获取消息历史 |
| GET | /api/characters | 获取人设列表 |
| GET | /api/avatars | 获取形象列表 |
| PUT | /api/users/profile | 更新用户选择的人设和形象 |
| GET | /api/memories/:sessionId | 获取记忆档案 |
| GET | /api/intimacy/:sessionId | 获取亲密度等级 |
| WS | /ws/chat/:sessionId | WebSocket 实时推送 |

#### Motia 开发参考

**创建新项目：**
```bash
cd /root/workspace
mkdir myecho-backend
cd myecho-backend
npx create-motia-app
```

**关键配置（motia.config.ts）：**
```typescript
export default defineConfig({
  port: 3001,

  database: {
    type: 'postgresql',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    database: 'myecho_ai',
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },

  myagent: {
    url: process.env.MYAGENT_URL || 'http://localhost:3000',
    apiKey: process.env.MYAGENT_API_KEY,
  },

  storage: {
    type: 'oss',
    endpoint: process.env.OSS_ENDPOINT,
    accessKey: process.env.OSS_ACCESS_KEY,
    secretKey: process.env.OSS_SECRET_KEY,
    bucket: 'myecho-ai',
  },
});
```

---

### 阶段一：Flutter 客户端基础框架（1-2 周）

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| 1. Flutter 项目初始化 | 创建项目，配置依赖 | `pubspec.yaml`, `main.dart` |
| 2. 主题系统 | Material 3，复用 motia-frontend 配色 | `presentation/theme/` |
| 3. API 客户端 | Dio 封装，拦截器 | `core/network/api_client.dart` |
| 4. WebSocket 客户端 | 连接后端 WS 服务 | `core/network/websocket_client.dart` |
| 5. 数据模型 | Message, Session, Character, Memory | `data/models/` |
| 6. Riverpod Providers | ChatProvider, WebSocketProvider | `presentation/providers/` |
| 7. 聊天页面 | 消息列表 + 输入框 | `presentation/pages/chat/chat_page.dart` |
| 8. 消息气泡 | 用户/AI 消息样式 | `presentation/widgets/chat/message_bubble.dart` |
| 9. 发送消息 | 调用后端 `/api/chat/sessions/:id/messages` | `data/repositories/chat_repository.dart` |
| 10. 实时接收 | WebSocket 监听消息推送 | `presentation/providers/websocket_provider.dart` |

**验证目标**：能发送消息并接收 AI 回复（后端需先完成）

---

### 阶段二：人设 + 形象选择（1 周）

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| 11. 人设选择页 | 调用 `/api/characters` 获取列表 | `presentation/pages/home/character_selection_page.dart` |
| 12. 形象选择页 | 调用 `/api/avatars` 获取列表 | `presentation/pages/avatar/avatar_selection_page.dart` |
| 13. 本地存储 | 保存用户选择（设备 ID） | `core/storage/shared_prefs.dart` |
| 14. 首次启动流程 | 引导用户选择 | `main.dart` 逻辑判断 |
| 15. 占位图处理 | 使用网络占位图或 assets | `assets/images/` |

**验证目标**：首次启动可选择人设和形象（后端需先完成）

---

### 阶段三：记忆系统（1 周）

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| 16. 记忆数据模型 | 基础信息、偏好、事件、情绪标签 | `data/models/memory.dart` |
| 17. 记忆 API 调用 | 调用 `/api/memories/:sessionId` | `data/repositories/memory_repository.dart` |
| 18. 记忆档案页面 | 分类展示记忆 | `presentation/pages/memory/memory_profile_page.dart` |
| 19. 记忆组件 | 可折叠卡片、标签展示 | `presentation/widgets/memory/` |
| 20. 亲密度展示 | 调用 `/api/intimacy/:sessionId` | `data/models/intimacy.dart` |
| 21. 亲密度进度条 | 可视化展示等级 | `presentation/widgets/memory/intimacy_progress_bar.dart` |

**验证目标**：AI 提取的记忆能在档案页面展示（后端需先完成）

---

### 阶段四：声音系统（0.5 周）

| 任务 | 说明 | 关键文件 |
|------|------|----------|
| 22. TTS API 调用 | 后端提供 TTS 接口 | `data/services/tts_service.dart` |
| 23. 音频播放器 | just_audio 包 | `presentation/widgets/audio/audio_player.dart` |
| 24. 情绪标签解析 | 解析消息中的 `emotion` 字段 | `data/models/message.dart` |
| 25. 自动播放设置 | 用户可开关 | `core/storage/shared_prefs.dart` |

**验证目标**：AI 回复能播放语音（后端需先完成 TTS）

---

### 阶段五：优化与打磨（1 周）

| 任务 | 说明 |
|------|------|
| 26. 动画效果 | 页面过渡、消息弹出动画 |
| 27. 加载状态 | 骨架屏、加载指示器 |
| 28. 错误处理 | 网络异常、超时提示 |
| 29. 性能优化 | 图片缓存、消息分页 |
| 30. 本地缓存 | SQLite 存储聊天历史 |

**验证目标**：流畅的用户体验，可展示给投资人

---

## MyEcho 后端 API 对接 myagent

### MyEcho 后端调用 myagent 的流程

```typescript
// MyEcho 后端 → myagent 服务
class MyAgentService {
  private baseURL = process.env.MYAGENT_URL || 'http://localhost:3000';
  private apiKey = process.env.MYAGENT_API_KEY;

  // 执行 AI 对话
  async executeChat(userMessage: string, subagentId: string) {
    const response = await axios.post(`${this.baseURL}/agent/execute`, {
      task: userMessage,
      subagent: subagentId,
      sessionId: session.id,
    }, {
      headers: { 'X-API-Key': this.apiKey }
    });

    return response.data;
  }

  // 获取 subagent 列表
  async getSubagents() {
    const response = await axios.get(`${this.baseURL}/api/agents`, {
      headers: { 'X-API-Key': this.apiKey }
    });
    return response.data;
  }

  // WebSocket 监听（服务端监听 myagent 的流）
  subscribeToTaskExecution(taskId: string, callback: (data) => void) {
    const ws = new WebSocket(`${this.baseURL.replace('http', 'ws')}/streams/taskExecution`);

    ws.on('message', (data) => {
      const event = JSON.parse(data);
      if (event.taskId === taskId) {
        callback(event);
      }
    });

    return ws;
  }
}
```

### 数据流

```
Flutter 客户端
    ↓ POST /api/chat/sessions/:id/messages
MyEcho 后端
    ↓ POST /agent/execute (with subagentId)
myagent 服务
    ↓ WebSocket 流式响应
MyEcho 后端 (监听并转发)
    ↓ WebSocket /api/chat/sessions/:id/stream
Flutter 客户端 (实时显示)
```

---

## TTS 服务方案

### 推荐方案：火山引擎（字节跳动）

**只需语音合成 (TTS)**

| 服务 | 是否需要 | 说明 |
|------|----------|------|
| **语音合成 (TTS)** | ✅ **必需** | AI 回复文字 → 语音播放 |
| **实时语音** | ❌ **不需要** | 不做语音输入功能 |
| **声音复刻** | ❌ **MVP 不需要** | 未来可考虑 |

**火山引擎 TTS：**
- 国内访问稳定
- 价格低廉（¥0.004/千字）
- 支持情绪标签
- 提供免费试用额度

**接入示例（Node.js）：**

```typescript
class TTSService {
  private client = new TtsClient({
    accessKey: process.env.VOLC_ACCESS_KEY,
    secretKey: process.env.VOLC_SECRET_KEY,
  });

  async synthesize(text: string, emotion: string = 'neutral') {
    const result = await this.synthesize({
      text,
      voice: 'zh_female_qingxin',
      emotion: this.mapEmotion(emotion),
      outputFormat: 'mp3',
    });

    return result.audioUrl;
  }

  private mapEmotion(emotion: string) {
    const map = {
      '开心': 'happy',
      '关心': 'gentle',
      '生气': 'angry',
      '撒娇': 'cute',
      '温柔': 'gentle',
    };
    return map[emotion] || 'neutral';
  }
}
```

**成本估算：**
- 每天 100 条对话，每条 50 字
- 每月成本：约 ¥0.6
- MVP 阶段几乎免费

---

## 开发环境配置

### VS Code 插件推荐

```json
{
  "recommendations": [
    "Dart-Code.flutter",
    "Dart-Code.code-debug",
    "GitHub.copilot",
    "usernamehw.errorlens",
    "nash.awesome-flutter-snippets"
  ]
}
```

### Flutter 环境检查

```bash
# 检查 Flutter 安装
flutter doctor

# 创建项目
flutter create myecho-app

# 运行（Android 模拟器或真机）
flutter run
```

---

## 时间估算（全栈）

| 阶段 | 内容 | 预估时间 | 并行 |
|------|------|----------|------|
| **阶段零** | **MyEcho 后端 API 开发** | **3-4 周** | - |
| 0.1-0.3 | 项目初始化 + 数据库 + myagent 封装 | 1 周 | - |
| 0.4-0.6 | 用户/人设/形象 API | 1 周 | - |
| 0.7-0.9 | 聊天/记忆/亲密度 API | 1 周 | 可与 0.4-0.6 并行 |
| 0.10-0.12 | WebSocket + TTS | 0.5 周 | - |
| **阶段一** | **Flutter 基础框架** | **1-2 周** | ⚠️ 依赖阶段零 |
| **阶段二** | **人设 + 形象选择** | **1 周** | ⚠️ 依赖阶段零 |
| **阶段三** | **记忆系统** | **1 周** | ⚠️ 依赖阶段零 |
| **阶段四** | **声音系统** | **0.5 周** | ⚠️ 依赖阶段零 |
| **阶段五** | **优化打磨** | **1 周** | ⚠️ 依赖前端完成 |
| **总计** | | **7.5-9.5 周** | |

### 并行开发建议

| 时期 | 后端 | 前端 | 备注 |
|------|------|------|------|
| 第 1-2 周 | 开发核心 API | 准备环境、UI 设计 | 前端可用 Mock 数据 |
| 第 3-4 周 | 完善 API、TTS | 聊天功能对接 | 联调 |
| 第 5-6 周 | Bug 修复 | 其他功能开发 | - |
| 第 7-8 周 | 优化 | 优化 | - |

---

## 下一步行动

### 第一阶段：MyEcho 后端开发（Motia）

1. **创建 GitHub 仓库**
   - myecho-backend
   - myecho-app

2. **创建 myecho-backend 项目**
   ```bash
   cd /root/workspace
   mkdir myecho-backend
   cd myecho-backend
   npx create-motia-app
   ```

3. **配置 PostgreSQL 数据库**
   - 安装 PostgreSQL
   - 创建 `myecho_ai` 数据库
   - 配置环境变量

4. **设计数据库 Schema**
   - 用户表（设备 ID）
   - 人设表（3 个预设）
   - 形象表（4 个预设）
   - 会话表
   - 消息表
   - 记忆表

5. **实现核心 API Steps**
   - `chat-api.step.ts` - 聊天 API
   - `memory-api.step.ts` - 记忆 API
   - `character-api.step.ts` - 人设 API
   - `avatar-api.step.ts` - 形象 API

6. **实现 myagent 客户端**
   - 调用 `/agent/execute`
   - WebSocket 监听流
   - 转发消息到 Flutter 客户端

7. **集成 TTS 服务**
   - 注册火山引擎账号
   - 实现 `TTSService.ts`

### 第二阶段：Flutter 客户端开发

1. **创建 Flutter 项目**
   ```bash
   flutter create myecho-app
   cd myecho-app
   ```

2. **配置依赖**
   - Dio（网络）
   - flutter_riverpod（状态管理）
   - go_router（路由）
   - just_audio（音频播放）
   - shared_preferences（本地存储）

3. **实现核心功能**
   - 聊天页面
   - 人设选择
   - 形象选择
   - 记忆档案
   - 音频播放

### 第三阶段：联调与测试

1. **API 联调**
   - 后端 + 前端对接
   - WebSocket 测试
   - TTS 测试

2. **真机测试**
   - Android 真机调试
   - 性能优化

3. **Demo 准备**
   - 测试数据准备
   - 演示脚本

---

## 风险与依赖

### 技术风险
| 风险 | 缓解措施 |
|------|----------|
| 后端从零开发 | 使用成熟框架（Motia），参考 myagent 模式 |
| myagent API 变更 | 使用 Service 层隔离，便于适配 |
| WebSocket 不稳定 | 实现断线重连、心跳检测 |
| TTS 服务限流 | 添加队列和缓存，准备备用方案 |

### 外部依赖
- **myagent 服务**：需要稳定的 `/agent/execute` 和 WebSocket
- **TTS 服务**：火山引擎 TTS API
- **形象资源**：MVP 用占位图，后续替换

---

## 品牌信息

| 项目 | 内容 |
|------|------|
| **产品名** | MyEcho |
| **品牌理念** | 你的心声，必有回响 (Your Heart, Reflected) |
| **核心价值** | 提供情绪价值与情感回响 |
| **标语** | Every Emotion Deserves an Echo |

---

## 关键文件参考（现有代码）

### 需要复用的设计

| 来源 | 内容 | 用途 |
|------|------|------|
| `motia-frontend/src/services/api.js` | API 客户端结构 | 参考 Axios 配置 |
| `motia-frontend/src/components/` | 组件设计模式 | 参考 UI 结构 |
| `motia-frontend/src/index.css` | 配色系统 | 复用颜色变量 |
| `/steps/api/*.ts` | API 端点定义 | 对接接口 |
| `/motia.config.ts` | 后端配置 | 了解端口、认证 |
