# MyRD & MyAgent 完整设计文档

> **创建时间**: 2026-03-31
> **状态**: 设计阶段
> **版本**: v0.1

---

## 📋 目录

- [1. 系统定位与演进](#1-系统定位与演进)
- [2. MyRD vs MyAgent 职责边界](#2-myrd-vs-myagent-职责边界)
- [3. MyRD 与 MyAgent 协同设计](#3-myrd-与-myagent-协同设计)
- [4. MyRD 研发平台设计](#4-myrd-研发平台设计)
- [5. MyAgent 中间件平台设计](#5-myagent-中间件平台设计)
- [6. Workflow Feedback Loop 核心设计](#6-workflow-feedback-loop-核心设计)
- [7. 技术实现方案](#7-技术实现方案)
- [8. 实施路线图](#8-实施路线图)

---

## 1. 系统定位与演进

### 1.1 设计演进历程

```
第一阶段: MyRD 概念提出
  └─> 定位: 全自动研发平台
  └─> 目标: 连接本地 AI 编程与云端自动化
  └─> 核心问题: 规范落地、流程管控、实时可视化

第二阶段: 职责边界清晰化
  └─> 发现: MyRD 承担了过多职责
  └─> 分离: 将 Agent 执行层剥离为 MyAgent
  └─> 定位: MyRD = 应用层，MyAgent = 中间件层

第三阶段: Workflow Feedback Loop 设计
  └─> 核心: 解决多 Agent 协作中的错误恢复问题
  └─> 关键: 重试、回滚、人工介入
  └─> 原则: 分层清晰，简化设计，人类决策
```

### 1.2 最终架构定位

```
┌─────────────────────────────────────────────────────────────┐
│                     应用层 (MyRD)                            │
│  研发管理平台: 项目管理、规范管理、CI/CD、监控               │
└─────────────────────────────────────────────────────────────┘
                          ↕ API 调用
┌─────────────────────────────────────────────────────────────┐
│                   中间件层 (MyAgent)                         │
│  Agent 中间件: Agent 编排、Workflow、Context、Skill         │
└─────────────────────────────────────────────────────────────┘
                          ↕ API 调用
┌─────────────────────────────────────────────────────────────┐
│                   基础设施层 (Motia)                         │
│  事件驱动框架: Event Step、State、Middleware                │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. MyRD vs MyAgent 职责边界

### 2.1 核心定位对比

| 维度 | MyRD | MyAgent |
|------|------|---------|
| **定位** | 垂直应用平台 | 通用中间件 |
| **用户** | 研发团队 | Agent 开发者 |
| **核心功能** | 项目管理、规范管理、CI/CD | Agent 执行、Workflow、Context |
| **扩展方式** | 配置 + 插件 | Agent + Skill + Hook |
| **业务逻辑** | 研发管理流程 | 无业务逻辑 |
| **可复用性** | 仅限研发场景 | 任意 Agent 场景 |

### 2.2 职责边界图

```
┌─────────────────────────────────────────────────────────────┐
│  MyRD 职责 (应用层)                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✅ 项目管理: CRUD、生命周期                          │   │
│  │  ✅ 规范管理: SOP、Skills、配置                       │   │
│  │  ✅ CI/CD: 流水线、Git、Test、Deploy                 │   │
│  │  ✅ 监控: 实时状态、Dashboard、通知                  │   │
│  │  ✅ Webhook: 接收 Agent 完成事件                     │   │
│  │  ❌ Agent 执行: 交给 MyAgent                         │   │
│  │  ❌ Workflow 编排: 交给 MyAgent                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  MyAgent 职责 (中间件层)                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ✅ Agent 执行: 生命周期、错误处理                    │   │
│  │  ✅ Workflow: 依赖、条件、并行、Feedback Loop         │   │
│  │  ✅ Context: 多轮对话、压缩、管理                     │   │
│  │  ✅ Skill: 可复用能力库                              │   │
│  │  ✅ Hook: 生命周期扩展                               │   │
│  │  ❌ 项目管理: 应用层关注                             │   │
│  │  ❌ CI/CD: 应用层关注                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 交互关系

```
1. MyRD 调用 MyAgent 执行开发任务
   ┌─────────────┐         ┌──────────────┐
   │   MyRD      │────────>│   MyAgent    │
   │  Platform   │  API    │  Middleware  │
   └─────────────┘         └──────────────┘
         |                        |
         | "实现用户登录功能"       |
         |                        |
         |<───────────────       |
         |  Task Result          |
         |                       v
         |                ┌──────────────┐
         |                │ Coding Agent │
         |                └──────────────┘

2. MyRD 通过 Webhook 接收任务完成事件
   ┌─────────────┐         ┌──────────────┐
   │   MyRD      │<────────│   MyAgent    │
   │  Webhook    │  Event  │  TaskHook    │
   │  Receiver   │         │              │
   └─────────────┘         └──────────────┘

3. MyRD 收到事件后触发 CI/CD
   ┌─────────────┐
   │   MyRD      │────────> [Git Commit]
   │  CI/CD      │────────> [Test]
   │   Engine    │────────> [Deploy]
   └─────────────┘
```

### 2.4 典型调用场景

```typescript
// MyRD 调用 MyAgent 执行开发任务

// 1. MyRD 端 (steps/cicd/develop.step.ts)
export const handler = async (event, { logger, emit }) => {
  const { task, projectId, specs } = event.data;

  // 调用 MyAgent API
  const response = await fetch(`${MYAGENT_URL}/agent/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: `根据以下规范开发功能: ${task}`,
      sessionId: `project-${projectId}`,
      environment: {
        specs,  // 应用项目规范
        knowledgeCollection: 'team-docs',
      }
    }),
  });

  const result = await response.json();

  // 发布事件（供 CI/CD 使用）
  await emit({
    topic: 'task.completed',
    data: result,
  });
};

// 2. MyAgent 端 (steps/agents/agent-api.step.ts)
export const handler = async (event, { logger, agentManager }) => {
  const { task, sessionId, environment } = event.data;

  // 获取或创建 Agent
  const agent = agentManager.getOrCreate(sessionId, {
    type: 'coding-agent',
    config: environment.specs,
  });

  // 执行任务
  const result = await agent.execute(task);

  // TaskHook.postExec 会自动触发
  return result;
};

// 3. MyAgent 端 (src/core/task/hooks/myrd-integration.ts)
export class MyRDPlatformHook extends BaseTaskHook {
  async postExec(context: TaskContext, result: any) {
    // 发送 Webhook 到 MyRD
    await fetch(`${MYRD_URL}/webhooks/task-completed`, {
      method: 'POST',
      body: JSON.stringify({
        taskId: context.taskId,
        sessionId: context.sessionId,
        status: result.success ? 'completed' : 'failed',
        artifacts: result.artifacts,
      }),
    });
  }
}
```

---

## 3. MyRD 与 MyAgent 协同设计

本节详细说明 MyRD 各模块（Projects、Specs、CI/CD Engine、Monitoring、Webhook）与 MyAgent 的协同关系。

### 3.1 核心概念：Project = Environment

```
MyRD Project              MyAgent
┌──────────────┐         ┌──────────────────┐
│ my-app       │  ────>  │ Environment:     │
│              │         │   projectName:   │
│ - GitHub URL │         │   "my-app"       │
│ - Staging    │         │   githubUrl: ... │
│ - Prod       │         │   stagingUrl: ...│
│ - Specs      │         │   prodUrl: ...   │
└──────────────┘         │   specs: [...]   │
                         └──────────────────┘

MyRD 通过 POST /agent/execute 的 environment 参数传递 Project 信息
MyAgent Workflow 通过 {{ environment.* }} 引用 Project 配置
```

### 3.2 协同架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         协同架构总览                             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────┐
│   MyRD Platform      │         │   MyAgent Platform   │
│                      │         │                      │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │  Projects     │  │         │  │ Agent Manager  │  │
│  │  Specs        │  │         │  │ Workflow Engine │  │
│  │  Monitoring   │  │         │  │ Context Manager │  │
│  └────────────────┘  │         │  └────────────────┘  │
│          │            │         │          │            │
│          │ POST /agent/execute  │          │            │
│          │ workflow: "xxx"    │          │            │
│          │ environment: {...} │          │            │
│          │            │         │          ▼            │
│          ▼            │         │  ┌────────────────┐  │
│  ┌────────────────┐  │         │  │  Workflow:     │  │
│  │  CI/CD Engine  │  │         │  │  - Agent Steps │  │
│  │  (提供 Webhook)│  │         │  │  - Webhook Steps│
│  └────────────────┘  │         │  └────────────────┘  │
│          ▲            │         │          │            │
│          │ Webhook    │         │          ▼            │
│          │            │         │  ┌────────────────┐  │
│          │            │         │  │  Webhook Step  │  │
│          │            │         │  │  调用 MyRD API  │  │
│  └────────────────┘  │         │                      │
└──────────────────────┘         └──────────────────────┘

关键数据流:
1. MyRD 调用 MyAgent API (通过 environment 传递 Project 配置)
2. MyAgent Workflow 执行，包含 Agent Steps 和 Webhook Steps
3. Webhook Step 调用 MyRD CI/CD API
4. MyRD 监控推送实时状态
```

### 3.2 核心协同流程

#### 3.2.1 MyRD 调用 MyAgent 执行 Workflow

```typescript
// MyRD 端: 调用 MyAgent 执行开发流程

const response = await fetch(`${MYAGENT_URL}/agent/execute`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    // ⭐ 指定 Workflow
    workflow: 'full-development',

    // ⭐ Workflow 输入参数
    workflow_input: {
      requirement: '实现用户登录功能',
    },

    // ⭐ Session ID（用于多轮对话）
    sessionId: `project-${projectId}`,

    // ⭐ Environment = Project 配置
    environment: {
      projectName: project.name,
      githubUrl: project.githubUrl,
      stagingUrl: project.stagingUrl,
      prodUrl: project.prodUrl,
      specs: project.specs.map(s => s.name),
    },

    // 应用标识
    app: 'myrd',
  }),
});

const result = await response.json();
// {
//   success: true,
//   taskId: "task-1743480000000-1",
//   sessionId: "project-123",
//   message: "Task submitted for execution"
// }
```

#### 3.2.2 MyAgent Workflow 定义

```yaml
# workflows/full-development/workflow.yaml

name: "full-development"
description: "完整研发流程"

# Environment 变量从 MyAgent API 的 environment 参数注入
# 在 Workflow 中可以通过 {{ environment.* }} 引用

steps:
  # ⭐ Agent Step: 代码生成
  - id: developer
    name: "代码生成"
    type: agent
    agent: developer
    input:
      requirement: "{{ workflow_input.requirement }}"
      specs: "{{ environment.specs }}"

    # 失败重试
    on_failure:
      action: retry
    retry:
      maxAttempts: 3

    output:
      artifacts: "artifacts"

  # ⭐ Webhook Step: Git Commit
  - id: git-commit
    name: "提交代码"
    type: webhook
    depends_on: [developer]
    config:
      url: "http://myrd.internal/api/cicd/git-commit"
      method: POST
      body:
        artifacts: "{{ developer.artifacts }}"
        githubUrl: "{{ environment.githubUrl }}"

    # 使用默认 HTTP 判断
    on_failure:
      action: rollback
      rollback_to: developer

  # ⭐ Webhook Step: Test
  - id: test
    name: "运行测试"
    type: webhook
    depends_on: [git-commit]
    config:
      url: "http://myrd.internal/api/cicd/test"
      method: POST
      body:
        branch: "{{ git-commit.branch }}"

    # 使用 success_when 判断
    success_when:
      - "response.status == 200"
      - "response.body.success == true"
      - "response.body.failedTests == 0"

    on_failure:
      action: rollback
      rollback_to: developer

  # ⭐ Webhook Step: Deploy Staging
  - id: deploy-staging
    name: "部署到 Staging"
    type: webhook
    depends_on: [test]
    config:
      url: "http://myrd.internal/api/cicd/deploy"
      method: POST
      body:
        environment: "staging"
        deployUrl: "{{ environment.stagingUrl }}"

    # 使用 reject 判断
    reject:
      - "response.body.success == false"
      - "response.body.errorType != undefined"

    on_failure:
      action: human_intervention
      message: "Staging 部署失败，需要人工审核"
      options:
        - label: "重试部署"
          action: retry
        - label: "回滚到开发"
          action: rollback
          rollback_to: developer
```

### 3.3 MyRD CI/CD Webhook 端点

MyRD 提供 Webhook 端点供 MyAgent Workflow 调用：

```typescript
// MyRD 端: steps/cicd/git-commit.step.ts

export const config = {
  type: 'api',
  route: '/api/cicd/git-commit',
  method: 'POST',
};

export const handler = async (request, { logger }) => {
  const { artifacts, githubUrl } = request.body;

  try {
    // 1. 创建分支
    const taskId = artifacts[0]?.taskId || 'unknown';
    const branchName = `feature/task-${taskId}`;
    await git.createBranch(githubUrl, branchName);

    // 2. 应用代码变更
    for (const artifact of artifacts) {
      await git.applyChange(githubUrl, artifact.path, artifact.content);
    }

    // 3. 提交代码
    const commit = await git.commit(githubUrl, `Task ${taskId}: Apply AI-generated changes`);

    // 4. 返回结构化响应
    return {
      success: true,
      branch: branchName,
      commitSha: commit.sha,
      commitUrl: commit.url,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

// MyRD 端: steps/cicd/test.step.ts

export const config = {
  type: 'api',
  route: '/api/cicd/test',
  method: 'POST',
};

export const handler = async (request, { logger }) => {
  const { branch } = request.body;

  try {
    // 运行测试
    const results = await runTests(branch);

    return {
      success: results.failed === 0,
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      coverage: results.coverage,
      errors: results.errors,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

// MyRD 端: steps/cicd/deploy.step.ts

export const config = {
  type: 'api',
  route: '/api/cicd/deploy',
  method: 'POST',
};

export const handler = async (request, { logger }) => {
  const { environment, deployUrl } = request.body;

  try {
    await deploy(environment, deployUrl);

    return {
      success: true,
      deployed: true,
      environment,
      deployedUrl,
    };
  } catch (error) {
    return {
      success: false,
      deployed: false,
      error: error.message,
      errorType: error.type,
    };
  }
};
```

### 3.4 完整流程时序图

```
用户触发开发任务
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. MyRD 调用 MyAgent                                       │
│      POST /agent/execute                                    │
│      {                                                      │
│        workflow: "full-development",                         │
│        workflow_input: { requirement: "..." },              │
│        sessionId: "project-123",                            │
│        environment: { githubUrl, stagingUrl, specs }        │
│      }                                                      │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  2. MyAgent 执行 Workflow                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 1: developer (Agent)                               ││
│  │   - 输入: requirement, specs                            ││
│  │   - 执行: 代码生成                                       ││
│  │   - 输出: artifacts                                      ││
│  │   - 状态: ✅ completed                                   ││
│  └─────────────────────────────────────────────────────────┘│
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 2: git-commit (Webhook)                            ││
│  │   - 调用: POST http://myrd.internal/api/cicd/git-commit ││
│  │   - 输入: artifacts, githubUrl                           ││
│  │   - 返回: { success: true, branch, commitSha }         ││
│  │   - 状态: ✅ completed                                   ││
│  └─────────────────────────────────────────────────────────┘│
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 3: test (Webhook)                                  ││
│  │   - 调用: POST http://myrd.internal/api/cicd/test       ││
│  │   - 输入: branch                                         ││
│  │   - 返回: { success: false, failed: 3, errors: [...] }  ││
│  │   - 状态: ❌ failed (不满足 success_when)               ││
│  └─────────────────────────────────────────────────────────┘│
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 触发 on_failure.rollback                                ││
│  │   - 回滚到: developer                                    ││
│  │   - 清除 context: test, git-commit                      ││
│  └─────────────────────────────────────────────────────────┘│
│    │                                                         │
│    ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Step 1: developer (Agent) - 重新执行                     ││
│  │   - 输入: requirement, specs, feedback                   ││
│  │   - 执行: 修复代码                                       ││
│  │   - 输出: artifacts                                      ││
│  │   - 状态: ✅ completed                                   ││
│  └─────────────────────────────────────────────────────────┘│
│    │                                                         │
│    ▼                                                         │
│  [继续执行 git-commit, test, deploy-staging...]             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
[MyRD 监控推送实时状态到 Dashboard]
```

### 3.5 Webhook Step 成功/失败判断

MyAgent Workflow 的 Webhook Step 支持多种成功/失败判断方式：

#### 3.5.1 默认行为

```yaml
# 不配置任何判断规则 → 使用 HTTP 状态码
- id: git-commit
  type: webhook
  config:
    url: "http://myrd.internal/api/cicd/git-commit"
  # 默认: HTTP 2xx → 成功，其他 → 失败
```

#### 3.5.2 success_when（成功条件）

```yaml
# 所有条件都满足 → 成功，否则 → 失败
- id: test
  type: webhook
  config:
    url: "http://myrd.internal/api/cicd/test"

  success_when:
    - "response.status == 200"
    - "response.body.success == true"
    - "response.body.failedTests == 0"
```

#### 3.5.3 reject（失败条件）

```yaml
# 满足任一条件 → 失败，都不满足 → 成功
- id: deploy-staging
  type: webhook
  config:
    url: "http://myrd.internal/api/cicd/deploy"

  reject:
    - "response.body.success == false"
    - "response.body.errorType != undefined"
```

#### 3.5.4 success_when + reject 组合

```yaml
# 先检查 reject（失败条件），再检查 success_when（成功条件）
- id: integration-test
  type: webhook
  config:
    url: "http://myrd.internal/api/cicd/integration-test"

  # 有严重错误直接失败
  reject:
    - "response.body.criticalErrors > 0"

  # 满足所有条件才算成功
  success_when:
    - "response.body.status == 'passed'"
    - "response.body.responseTime < 5000"
```

#### 3.5.5 判断优先级

```
1. reject（最高优先级）
   └─> 满足任一 reject 条件 → ❌ 失败
   └─> 不满足任何 reject 条件 → 继续

2. success_when
   └─> 满足所有 success_when 条件 → ✅ 成功
   └─> 不满足所有 success_when 条件 → ❌ 失败

3. 默认行为
   └─> HTTP 状态码 2xx → ✅ 成功
   └─> 其他状态码 → ❌ 失败
```

---

## 4. MyRD 研发平台设计
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MYAGENT_API_KEY}`,
    },
    body: JSON.stringify({
      sessionId,
      config: {
        projectType: type,
        specs: defaultSpecs,
      },
    }),
  });

  // 4. 更新项目记录
  await prisma.project.update({
    where: { id: project.id },
    data: { sessionId },
  });

  return project;
};
```

#### 3.2.2 Specs 模块协同

**Specs 模块的职责**：
- 管理规范内容（Markdown、Skills、Config）
- 提供规范查询和版本管理
- 支持规范应用到项目

**与 MyAgent 的协同**：

```
场景1: 规范应用时传递给 Agent

┌─────────────────────────────────────────────────────────────┐
│  1. 用户在 MyRD Console 选择规范应用到项目                   │
│      POST /api/v1/projects/:projectId/specs                 │
│      Body: { specIds: ["spec-1", "spec-2"] }               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. MyRD Specs API 更新项目规范关联                         │
│      - 创建/更新 ProjectSpec 记录                           │
│      - 获取完整规范内容                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. MyRD 调用 MyAgent 更新 Session 配置                      │
│      PATCH ${MYAGENT_URL}/api/sessions/:sessionId          │
│      Body: { config: { specs: [...] } }                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. MyAgent 更新 Session 配置                                │
│      - 后续任务使用新规范执行                                │
└─────────────────────────────────────────────────────────────┘

场景2: CLI 初始化时从 MyRD 拉取规范

┌─────────────────────────────────────────────────────────────┐
│  1. 用户执行 myrd init                                       │
│      - CLI 检测项目类型                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. CLI 调用 MyRD API 获取规范列表                           │
│      GET /api/v1/specs?projectType=react                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. MyRD Specs API 返回适用的规范                            │
│      - 根据 projectType 过滤                                │
│      - 返回规范内容和类型                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. CLI 应用规范到本地                                       │
│      - Markdown → .claude/CLAUDE.md                         │
│      - Skills → .claude/skills/*.md                        │
│      - Config → .claude/settings.json                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. CLI 将项目信息注册到 MyRD                                │
│      POST /api/v1/projects/register                         │
│      Body: { name, type, localPath }                        │
└─────────────────────────────────────────────────────────────┘
```

**API 交互示例**：

```typescript
// MyRD 端: steps/api/specs-api.step.ts

export const handler = async (event, { logger, prisma }) => {
  const { projectId, specIds } = event.data;

  // 1. 获取项目信息
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { specs: true },
  });

  // 2. 获取规范内容
  const specs = await prisma.spec.findMany({
    where: { id: { in: specIds } },
  });

  // 3. 更新项目规范关联
  await prisma.projectSpec.deleteMany({
    where: { projectId },
  });

  await prisma.projectSpec.createMany({
    data: specs.map(spec => ({
      projectId,
      specId: spec.id,
    })),
  });

  // 4. 调用 MyAgent 更新 Session 配置
  if (project.sessionId) {
    await fetch(`${MYAGENT_URL}/api/sessions/${project.sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MYAGENT_API_KEY}`,
      },
      body: JSON.stringify({
        config: {
          specs: specs.map(s => ({
            type: s.type,
            content: s.content,
          })),
        },
      }),
    });
  }

  return { success: true, specs };
};
```

#### 3.2.3 CI/CD Engine 模块协同

**CI/CD Engine 的职责**：
- 监听 Agent 任务完成事件
- 创建和执行流水线
- 管理各个 Stage（Git、Test、Deploy）
- 处理流水线失败

**与 MyAgent 的协同**：

```
完整流程: Agent 任务完成 → CI/CD 执行

┌─────────────────────────────────────────────────────────────┐
│  阶段1: MyAgent 执行开发任务                                  │
└─────────────────────────────────────────────────────────────┘

1. MyRD CI/CD Engine 触发开发任务
   POST ${MYAGENT_URL}/agent/execute
   Body: {
     task: "实现用户登录功能",
     sessionId: "project-123",
     workflow: "development-pipeline"  // ⭐ 使用 Workflow
   }

2. MyAgent 执行 Workflow
   ├─> [产品经理 Agent] ✅
   ├─> [架构师 Agent] ✅
   ├─> [技术设计 Agent] ✅
   ├─> [开发 Agent] ✅ (带重试机制)
   └─> [测试 Agent] ✅ (失败则回滚到开发)

3. Workflow 完成，TaskHook.postExec 触发
   └─> 发送 Webhook 到 MyRD

┌─────────────────────────────────────────────────────────────┐
│  阶段2: MyRD 接收 Webhook 并启动 CI/CD                       │
└─────────────────────────────────────────────────────────────┘

4. MyRD Webhook Receiver 接收事件
   POST /webhooks/task-completed
   Body: {
     taskId: "task-456",
     sessionId: "project-123",
     status: "completed",
     artifacts: [
       { path: "src/auth/login.ts", type: "code" },
       { path: "src/components/LoginForm.tsx", type: "code" },
       { path: "tests/auth.test.ts", type: "test" }
     ]
   }

5. Webhook Receiver 处理
   ├─> 验证 API Token
   ├─> 保存任务结果到数据库
   ├─> 根据 sessionId 获取 projectId
   └─> 发布 'cicd.trigger' 事件

6. CI/CD Engine 监听事件，创建流水线
   ┌─────────────────────────────────────────────┐
   │  Pipeline #789                              │
   │  ├─ Stage 1: Git Commit (pending)          │
   │  ├─ Stage 2: Test (pending)                │
   │  ├─ Stage 3: Deploy Staging (pending)      │
   │  └─ Stage 4: Integration Test (pending)    │
   └─────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  阶段3: CI/CD 执行各个 Stage                                │
└─────────────────────────────────────────────────────────────┘

7. Stage 1: Git Commit
   ├─> 创建分支: feature/task-456
   ├─> 应用 Agent 生成的代码变更
   ├─> 提交代码
   ├─> 推送状态: ✅ completed
   └─> 发布 'pipeline.stage.updated' 事件

8. Stage 2: Test
   ├─> 运行单元测试: npm test
   ├─> 收集测试结果
   │   ├─> PASS: src/auth/login.spec.ts
   │   └─> FAIL: src/components/LoginForm.spec.ts (3/10 失败)
   ├─> 推送状态: ❌ failed
   └─> 发布 'pipeline.stage.updated' 事件

9. CI/CD Engine 处理测试失败
   ┌─────────────────────────────────────────────┐
   │  决策点: 测试失败，如何处理？                │
   │                                            │
   │  选项 A: 调用 MyAgent 重新修复               │
   │    POST ${MYAGENT_URL}/agent/execute       │
   │    Body: {                                  │
   │      task: "测试失败，修复 LoginForm 组件", │
   │      sessionId: "project-123",              │
   │      feedback: "3/10 测试用例失败: ..."     │
   │    }                                        │
   │                                            │
   │  选项 B: 人工介入                           │
   │    - 通知用户 (Lark)                       │
   │    - 等待人工决策                          │
   │                                            │
   │  选项 C: 标记流水线失败                     │
   │    - 停止流水线                            │
   │    - 记录失败原因                          │
   └─────────────────────────────────────────────┘

   → 选择: 选项 A (调用 MyAgent 重新修复)

10. MyAgent 重新修复
    ├─> [开发 Agent] 读取反馈，修复代码
    ├─> [测试 Agent] 重新测试
    └─> TaskHook.postExec 发送新 Webhook

11. MyRD 收到新的 Webhook
    ├─> 更新任务结果
    ├─> 从 Stage 1 重新执行流水线
    └─> 全部 Stage ✅ 完成

12. 通知用户
    ├─> WebSocket 推送: 流水线完成
    ├─> Lark 消息: 功能已部署到 Staging
    └─> Dashboard 显示: ✅ Pipeline #789 完成
```

**API 交互示例**：

```typescript
// MyRD 端: steps/cicd/engine.step.ts

export const config = {
  type: 'event',
  topic: 'cicd.trigger',
};

export const handler = async (event, { logger, emit, prisma }) => {
  const { taskId, sessionId, status, artifacts } = event.data;

  // 1. 根据 sessionId 获取项目
  const project = await prisma.project.findFirst({
    where: { sessionId },
    include: { specs: true },
  });

  if (!project) {
    throw new Error(`Project not found for sessionId: ${sessionId}`);
  }

  // 2. 创建流水线
  const pipeline = await prisma.pipeline.create({
    data: {
      taskId,
      trigger: 'agent-completed',
      status: 'pending',
      stages: {
        create: [
          { name: 'git-commit', order: 1, status: 'pending' },
          { name: 'test', order: 2, status: 'pending' },
          { name: 'deploy-staging', order: 3, status: 'pending' },
          { name: 'integration-test', order: 4, status: 'pending' },
        ],
      },
    },
  });

  // 3. 执行流水线
  await executePipeline(pipeline.id, { emit, prisma, logger, projectId: project.id });

  return { pipelineId: pipeline.id };
};

async function executePipeline(pipelineId, context) {
  const pipeline = await context.prisma.pipeline.findUnique({
    where: { id: pipelineId },
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  for (const stage of pipeline.stages) {
    // 更新阶段状态
    await context.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: { status: 'running', startedAt: new Date() },
    });

    // 推送状态更新
    await context.emit({
      topic: 'pipeline.stage.updated',
      data: {
        pipelineId,
        stageName: stage.name,
        status: 'running',
      },
    });

    // 执行阶段
    const result = await executeStage(stage, context);

    // 更新结果
    await context.prisma.pipelineStage.update({
      where: { id: stage.id },
      data: {
        status: result.success ? 'completed' : 'failed',
        result: result.data,
        completedAt: new Date(),
      },
    });

    // ⭐ 阶段失败处理
    if (!result.success) {
      await handleStageFailure(stage, result, context);
      return;
    }
  }

  // 全部成功
  await context.prisma.pipeline.update({
    where: { id: pipelineId },
    data: { status: 'completed', completedAt: new Date() },
  });
}

async function handleStageFailure(stage, result, context) {
  const { pipelineId, name } = stage;

  // ⭐ 场景：测试失败，调用 MyAgent 重新修复
  if (name === 'test') {
    const taskId = context.generateTaskId();

    // 调用 MyAgent 重新修复
    const response = await fetch(`${MYAGENT_URL}/agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MYAGENT_API_KEY}`,
      },
      body: JSON.stringify({
        task: `测试失败，请修复问题：\n${result.error}`,
        sessionId: `project-${context.projectId}`,
        feedback: {
          originalTaskId: result.taskId,
          failureReason: result.error,
          testResults: result.data,
        },
      }),
    });

    const newResult = await response.json();

    // 保存新任务结果
    await context.prisma.task.create({
      data: {
        id: taskId,
        sessionId: `project-${context.projectId}`,
        task: newResult.task,
        status: newResult.success ? 'completed' : 'failed',
        result: newResult,
      },
    });

    // 如果新任务成功，从第一个 Stage 重新执行流水线
    if (newResult.success) {
      await executePipeline(pipelineId, context);
    } else {
      // 标记流水线失败
      await context.prisma.pipeline.update({
        where: { id: pipelineId },
        data: { status: 'failed' },
      });

      // 人工介入通知
      await notifyHumanIntervention(pipelineId, result);
    }
  } else {
    // 其他 Stage 失败，直接标记流水线失败
    await context.prisma.pipeline.update({
      where: { id: pipelineId },
      data: { status: 'failed' },
    });

    await notifyHumanIntervention(pipelineId, result);
  }
}

async function notifyHumanIntervention(pipelineId, result) {
  // 发送 Lark 通知
  await fetch(`${LARK_WEBHOOK_URL}`, {
    method: 'POST',
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        title: '⚠️ 流水线失败，需要人工介入',
        elements: [
          {
            tag: 'div',
            text: {
              content: `流水线 #${pipelineId} 在 ${result.stage} 阶段失败\n\n错误：${result.error}`,
              tag: 'lark_md',
            },
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { content: '查看详情', tag: 'plain_text' },
                type: 'default',
                url: `${MYRD_URL}/pipelines/${pipelineId}`,
              },
            ],
          },
        ],
      },
    }),
  });
}
```

#### 3.2.4 Monitoring 模块协同

**Monitoring 模块的职责**：
- 实时推送流水线状态
- 提供 Dashboard 数据
- 发送通知（Lark、Email）

**与 MyAgent 的协同**：

```
场景: 实时监控 Agent 和 CI/CD 状态

┌─────────────────────────────────────────────────────────────┐
│  1. 用户打开 MyRD Dashboard                                  │
│      - WebSocket 连接到 MyRD                                │
│      - 订阅项目更新: project-${projectId}                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. MyRD 推送初始状态                                        │
│      WebSocket.emit('init', {                              │
│        project: { name, status, specs },                   │
│        runningPipelines: [...],                            │
│        recentTasks: [...]                                  │
│      })                                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. MyAgent 执行任务时，实时更新                             │
└─────────────────────────────────────────────────────────────┘

3.1 Workflow 开始
    WebSocket.emit('workflow.started', {
      workflowName: "development-pipeline",
      steps: [product-manager, architect, developer, tester]
    })

3.2 每个 Step 开始
    WebSocket.emit('step.started', {
      stepId: "developer",
      stepName: "代码生成",
      status: "running"
    })

3.3 Step 完成
    WebSocket.emit('step.completed', {
      stepId: "developer",
      status: "completed",
      artifacts: [...]
    })

                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. CI/CD 执行时，实时更新                                    │
└─────────────────────────────────────────────────────────────┘

4.1 Pipeline 开始
    WebSocket.emit('pipeline.created', {
      pipelineId: "789",
      taskId: "456",
      stages: [...]
    })

4.2 Stage 开始
    WebSocket.emit('pipeline.stage.started', {
      pipelineId: "789",
      stageName: "test",
      status: "running"
    })

4.3 Stage 完成
    WebSocket.emit('pipeline.stage.completed', {
      pipelineId: "789",
      stageName: "test",
      status: "completed",
      result: {...}
    })

                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Dashboard 实时更新                                       │
│      - 显示 Agent 进度条                                     │
│      - 显示 CI/CD 状态                                       │
│      - 显示 Artifacts                                        │
└─────────────────────────────────────────────────────────────┘
```

**WebSocket 推送示例**：

```typescript
// MyRD 端: src/lib/event-router.ts

export class EventRouter {
  private io: Socket.Server;

  constructor(io: Socket.Server) {
    this.io = io;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // 监听 MyAgent 事件
    this.listenToMyAgentEvents();

    // 监听 MyRD 内部事件
    this.listenToMyRDEvents();
  }

  private listenToMyAgentEvents() {
    // 监听 MyAgent Workflow 事件
    MyAgentEventStream.on('workflow.started', (data) => {
      this.pushToSession(data.sessionId, {
        type: 'workflow.started',
        data,
      });
    });

    MyAgentEventStream.on('step.started', (data) => {
      this.pushToSession(data.sessionId, {
        type: 'step.started',
        data,
      });
    });

    MyAgentEventStream.on('step.completed', (data) => {
      this.pushToSession(data.sessionId, {
        type: 'step.completed',
        data,
      });
    });
  }

  private listenToMyRDEvents() {
    // 监听 CI/CD 事件
    eventBus.on('pipeline.created', (data) => {
      this.pushToSession(data.sessionId, {
        type: 'pipeline.created',
        data,
      });
    });

    eventBus.on('pipeline.stage.updated', (data) => {
      this.pushToSession(data.sessionId, {
        type: 'pipeline.stage.updated',
        data,
      });
    });
  }

  private pushToSession(sessionId: string, update: any) {
    this.io.to(`session:${sessionId}`).emit('update', update);
  }
}

// MyRD 端: steps/monitoring/dashboard-updater.step.ts

export const config = {
  type: 'event',
  topic: 'pipeline.stage.updated',
};

export const handler = async (event, { logger, emit }) => {
  const { pipelineId, stageName, status } = event.data;

  // 获取流水线详情
  const pipeline = await getPipelineDetails(pipelineId);

  // 推送 WebSocket 更新
  await emit({
    topic: 'websocket.push',
    data: {
      sessionId: pipeline.sessionId,
      update: {
        type: 'pipeline.stage.updated',
        data: {
          pipelineId,
          stageName,
          status,
          progress: calculateProgress(pipeline),
        },
      },
    },
  });
};
```

#### 3.2.5 Webhook 模块协同

**Webhook 模块的职责**：
- 接收 MyAgent TaskHook 事件
- 验证请求合法性
- 路由到对应处理器

**与 MyAgent 的协同**：

```
完整 Webhook 流程

┌─────────────────────────────────────────────────────────────┐
│  1. MyAgent 任务完成，TaskHook.postExec 触发                  │
└─────────────────────────────────────────────────────────────┘

// MyAgent 端: src/core/task/hooks/myrd-integration.ts
export class MyRDPlatformHook extends BaseTaskHook {
  async postExec(context: TaskContext, result: any) {
    // 发送 Webhook 到 MyRD
    await fetch(`${MYRD_URL}/webhooks/task-completed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiToken}`,
        'X-MyRD-Event': 'task.completed',
      },
      body: JSON.stringify({
        taskId: context.taskId,
        sessionId: context.sessionId,
        status: result.success ? 'completed' : 'failed',
        result: result,
        artifacts: result.artifacts || [],
        metadata: {
          llmCalls: context.metadata?.llmCalls,
          skillCalls: context.metadata?.skillCalls,
          executionTime: context.metadata?.executionTime,
        },
      }),
    });
  }
}

┌─────────────────────────────────────────────────────────────┐
│  2. MyRD Webhook Receiver 接收并验证                         │
└─────────────────────────────────────────────────────────────┘

// MyRD 端: steps/webhooks/receiver.step.ts
export const config = {
  type: 'api',
  route: '/webhooks/task-completed',
  method: 'POST',
};

export const handler = async (request, { logger, emit, prisma }) => {
  // 1. 验证 API Token
  const token = request.headers['authorization'];
  if (!verifyToken(token)) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // 2. 解析事件类型
  const eventType = request.headers['x-myrd-event'];
  const payload = request.body;

  // 3. 根据 eventType 路由
  switch (eventType) {
    case 'task.completed':
      return await handleTaskCompleted(payload, { emit, prisma });
    case 'task.failed':
      return await handleTaskFailed(payload, { emit, prisma });
    case 'workflow.started':
      return await handleWorkflowStarted(payload, { emit, prisma });
    default:
      return { statusCode: 400, body: 'Unknown event type' };
  }
};

async function handleTaskCompleted(payload, { emit, prisma }) {
  const { taskId, sessionId, status, result, artifacts } = payload;

  // 1. 保存任务结果
  await prisma.task.upsert({
    where: { id: taskId },
    update: {
      status,
      result,
      completedAt: new Date(),
    },
    create: {
      id: taskId,
      sessionId,
      task: result.task,
      status,
      result,
    },
  });

  // 2. 保存 Artifacts
  if (artifacts && artifacts.length > 0) {
    await prisma.artifact.createMany({
      data: artifacts.map(a => ({
        taskId,
        path: a.path,
        type: a.type,
        content: a.content,
      })),
      skipDuplicates: true,
    });
  }

  // 3. 发布事件（触发 CI/CD）
  await emit({
    topic: 'cicd.trigger',
    data: {
      taskId,
      sessionId,
      status,
      artifacts,
    },
  });

  return { statusCode: 200, body: 'OK' };
}

┌─────────────────────────────────────────────────────────────┐
│  3. CI/CD Engine 响应事件（已在 3.2.3 详细说明）              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 协同时序图

```
完整的开发流程时序图

用户          MyRD Console     MyRD API      MyAgent        CI/CD Engine
 │                │                │              │                │
 │  myrd code     │                │              │                │
 │───────────────>│                │              │                │
 │                │                │              │                │
 │                │  检测项目类型   │              │                │
 │                │<───────────────│              │                │
 │                │                │              │                │
 │                │  拉取项目规范   │              │                │
 │                │<───────────────│              │                │
 │                │                │              │                │
 │                │  启动 Agent     │              │                │
 │                │───────────────>│              │                │
 │                │                │  执行任务    │                │
 │                │                │─────────────>│                │
 │                │                │              │                │
 │                │                │              │  [产品经理]     │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │                │                │              │  [架构师]       │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │                │                │              │  [开发]         │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │                │                │              │  [测试]         │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │                │                │  发送 Webhook│                │
 │                │                │<─────────────│                │
 │                │                │              │                │
 │                │                │  触发 CI/CD  │                │
 │                │                │──────────────────────────────>│
 │                │                │              │                │
 │                │  实时状态更新   │              │                │
 │<───────────────│──────────────────────────────────────────────│
 │                │                │              │                │
 │                │                │              │                │
 │                │                │              │  [Git Commit]  │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │                │                │              │  [Test]        │
 │                │                │              │───────>        │
 │                │                │              │  ❌ 失败       │
 │                │                │              │                │
 │                │                │              │  重新修复       │
 │                │                │<─────────────│                │
 │                │                │  重新执行    │                │
 │                │                │─────────────>│                │
 │                │                │              │                │
 │                │                │              │  [Test]        │
 │                │                │              │───────>        │
 │                │                │              │  ✅ 成功       │
 │                │                │              │                │
 │                │                │              │  [Deploy]      │
 │                │                │              │───────>        │
 │                │                │              │  <-------       │
 │                │                │              │                │
 │  完成通知      │                │              │                │
 │<───────────────│                │              │                │
 │                │                │              │                │
```

### 3.4 API 契约定义

#### 3.4.1 MyRD → MyAgent API

```yaml
# 1. 创建 Session
POST /api/sessions
Request:
  sessionId: string
  config:
    projectType: string
    specs: Array<Spec>
Response:
  sessionId: string
  status: "created"

# 2. 更新 Session 配置
PATCH /api/sessions/:sessionId
Request:
  config:
    specs: Array<Spec>
Response:
  sessionId: string
  status: "updated"

# 3. 执行 Agent 任务
POST /agent/execute
Request:
  task: string
  sessionId: string
  workflow?: string  # 可选：指定 Workflow 名称
  environment:
    specs: Array<Spec>
    knowledgeCollection?: string
    feedback?: object
Response:
  taskId: string
  sessionId: string
  status: "running" | "completed" | "failed"
  result?: object

# 4. 查询任务状态
GET /api/tasks/:taskId
Response:
  taskId: string
  status: string
  result?: object
  artifacts?: Array<Artifact>
```

#### 3.4.2 MyAgent → MyRD Webhook

```yaml
# 1. 任务完成
POST /webhooks/task-completed
Headers:
  X-MyRD-Event: "task.completed"
  Authorization: "Bearer ${MYRD_API_TOKEN}"
Request:
  taskId: string
  sessionId: string
  status: "completed" | "failed"
  result: object
  artifacts: Array<Artifact>
  metadata:
    llmCalls: number
    skillCalls: number
    executionTime: number
Response:
  statusCode: 200
  body: "OK"

# 2. Workflow 开始
POST /webhooks/workflow-started
Headers:
  X-MyRD-Event: "workflow.started"
Request:
  workflowName: string
  sessionId: string
  steps: Array<Step>
Response:
  statusCode: 200
  body: "OK"

# 3. Step 完成
POST /webhooks/step-completed
Headers:
  X-MyRD-Event: "step.completed"
Request:
  stepId: string
  sessionId: string
  status: "completed" | "failed"
  output?: object
Response:
  statusCode: 200
  body: "OK"
```

---

## 4. MyRD 研发平台设计

### 4.1 核心功能

```
MyRD Platform
│
├─ 项目管理 (Projects)
│   ├─ 项目 CRUD
│   ├─ 项目类型检测 (React, Vue, Python...)
│   └─ 项目生命周期管理
│
├─ 规范管理 (Specs)
│   ├─ 规范 CRUD
│   ├─ 规范类型: Markdown / Skills / Config
│   ├─ 规范应用机制
│   └─ 规范版本管理
│
├─ CI/CD 引擎
│   ├─ 流水线编排
│   ├─ Git Commit Stage
│   ├─ Test Stage
│   ├─ Deploy Stage
│   └─ Integration Test Stage
│
├─ 监控服务 (Monitoring)
│   ├─ 实时状态 (WebSocket)
│   ├─ Dashboard
│   └─ 通知 (Lark, Email, Webhook)
│
└─ Webhook 接收
    └─ 接收 MyAgent 任务完成事件
```

### 4.2 数据模型

```prisma
// MyRD 专属数据模型

model Project {
  id            String    @id @default(cuid())
  name          String
  description   String?
  type          String    // react, vue, python, nodejs
  status        String    @default("active")
  userId        String
  teamId        String?

  specs         ProjectSpec[]
  tasks         Task[]
  pipelines     Pipeline[]
}

model Spec {
  id            String    @id @default(cuid())
  name          String
  description   String?
  type          String    // markdown, skills, config
  content       Json      // 规范内容
  version       String    @default("1.0.0")

  projects      ProjectSpec[]
}

model ProjectSpec {
  id            String    @id @default(cuid())
  projectId     String
  specId        String
  isActive      Boolean   @default(true)

  project       Project   @relation(fields: [projectId], references: [id])
  spec          Spec      @relation(fields: [specId], references: [id])
}

model Pipeline {
  id            String    @id @default(cuid())
  taskId        String
  trigger       String    // agent-completed, manual
  status        String    // pending, running, completed, failed
  startedAt     DateTime  @default(now())
  completedAt   DateTime?

  stages        PipelineStage[]
}

model PipelineStage {
  id            String    @id @default(cuid())
  pipelineId    String
  name          String    // git-commit, test, deploy-staging, integration-test
  order         Int
  status        String    // pending, running, completed, failed
  result        Json?
  startedAt     DateTime?
  completedAt   DateTime?

  pipeline      Pipeline  @relation(fields: [pipelineId], references: [id])
}
```

### 4.3 CI/CD 流程

```
┌─────────────────────────────────────────────────────────────┐
│  MyRD CI/CD 流程                                             │
└─────────────────────────────────────────────────────────────┘

1. Agent 任务完成
   └─> MyRD PlatformHook 发送 Webhook

2. Webhook Receiver 接收事件
   ├─> 验证 API Token
   ├─> 保存任务结果
   └─> 发布 'cicd.trigger' 事件

3. CI/CD Engine 创建流水线
   ├─> 创建 Pipeline 记录
   ├─> 创建 PipelineStage 记录
   └─> 开始执行

4. 执行各个阶段 (串行)
   a) Git Commit Stage
      ├─> 创建分支: feature/task-{taskId}
      ├─> 应用代码变更
      ├─> 提交代码
      └─> 推送状态

   b) Test Stage
      ├─> 运行单元测试
      ├─> 收集测试结果
      └─> 推送状态

   c) Deploy Stage
      ├─> 部署到 Staging
      ├─> 健康检查
      └─> 推送状态

   d) Integration Test Stage
      ├─> 运行集成测试
      ├─> E2E 测试
      └─> 推送最终状态

5. 通知用户
   ├─> WebSocket 推送
   ├─> Lark 通知
   └─> 记录到 Dashboard
```

### 4.4 规范应用机制

```typescript
// myrd-cli/src/commands/init.ts

export async function initCommand(options: any) {
  // 1. 检测项目类型
  const projectType = detectProjectType();

  // 2. 从 MyRD 平台拉取规范
  const specs = await fetch(`${MYRD_URL}/api/v1/specs`, {
    headers: { 'Authorization': `Bearer ${getApiToken()}` },
  });

  // 3. 根据项目类型过滤规范
  const filteredSpecs = specs.filter(s =>
    s.applicableTo.includes(projectType)
  );

  // 4. 应用规范到本地
  for (const spec of filteredSpecs) {
    await applySpec(spec);
  }
}

async function applySpec(spec: Spec) {
  switch (spec.type) {
    case 'markdown':
      // 写入 CLAUDE.md
      await fs.writeFile('.claude/CLAUDE.md', spec.content);
      break;

    case 'skills':
      // 复制 Skills 到本地
      for (const skill of spec.content.skills) {
        await fs.copy(
          skill.remotePath,
          `.claude/skills/${skill.name}.md`
        );
      }
      break;

    case 'config':
      // 合并配置文件
      await mergeConfig('.claude/settings.json', spec.content);
      break;
  }
}
```

---

## 5. MyAgent 中间件平台设计

### 5.1 核心定位

**MyAgent = 通用 Agent 中间件**

- **不包含业务逻辑**: 可用于任何 Agent 场景（代码生成、文档生成、测试等）
- **提供执行能力**: Agent 生命周期、Workflow、Context、Skill
- **可扩展**: 通过 Agent、Skill、Hook 扩展
- **与 Motia 的关系**: MyAgent 基于 Motia 构建，是 Agent 领域的专用框架

### 5.2 核心功能

```
MyAgent Middleware
│
├─ Agent 管理 (Agent Manager)
│   ├─ Session 管理
│   ├─ Agent 创建与销毁
│   └─ Agent 状态维护
│
├─ Workflow 编排 (Workflow Engine)
│   ├─ 依赖管理 (depends_on)
│   ├─ 条件执行 (condition)
│   ├─ 并行执行 (parallel)
│   └─ Feedback Loop (on_failure)
│
├─ Context 管理 (Context Manager)
│   ├─ 多轮对话
│   ├─ 上下文压缩
│   └─ 变量管理
│
├─ Skill 系统 (Skill Library)
│   ├─ 可复用能力
│   ├─ 参数化调用
│   └─ 结果验证
│
└─ Hook 系统 (Extension Points)
    ├─ Agent Hook
    ├─ Task Hook
    └─ Skill Hook
```

### 5.3 Agent 类型

```typescript
// Agent 是业务逻辑的封装
// MyAgent 不内置任何业务 Agent

interface Agent {
  id: string;
  name: string;
  description: string;

  // 核心方法
  execute(task: string, context: Context): Promise<AgentResult>;

  // 配置
  config: AgentConfig;
}

// 示例: 开发 Agent (由用户创建)
class DeveloperAgent implements Agent {
  id = 'developer';
  name = '开发工程师';

  async execute(task: string, context: Context) {
    // 使用 Skills
    const file = await this.skill('read').call({ path: 'src/index.ts' });
    const code = await this.skill('claude-code').call({ task });

    // 自检
    if (!this.validate(code)) {
      throw new ValidationError('代码不符合规范');
    }

    return { success: true, code };
  }

  private validate(code: string): boolean {
    // 自检逻辑
    return code.includes('error handling');
  }
}
```

### 5.4 Workflow 编排

```yaml
# workflows/development-pipeline/workflow.yaml

name: "development-pipeline"
description: "多 Agent 协作开发流程"

steps:
  - id: product-manager
    name: "需求分析"
    agent: product-manager
    output:
      requirement: "structuredOutput"

  - id: architect
    name: "架构设计"
    agent: architect
    depends_on: [product-manager]
    input:
      requirement: "{{ requirement }}"
    output:
      architecture: "structuredOutput"

  - id: developer
    name: "代码生成"
    agent: developer
    depends_on: [technical-designer]

    # Feedback Loop: 重试
    on_failure:
      action: retry
    retry:
      maxAttempts: 3

  - id: tester
    name: "测试验证"
    agent: tester
    depends_on: [developer]

    # Feedback Loop: 回滚
    on_failure:
      action: rollback
      rollback_to: developer
      message: "测试失败，重新开发"
```

### 5.5 Skill 系统

```
Skill = 可复用的单一能力

特性:
- 独立性: 不依赖特定 Agent
- 可组合: 多个 Skill 可组合使用
- 参数化: 支持参数传递
- 可测试: 独立测试

示例 Skills:
- /commit: Git 提交
- /test: 运行测试
- /review: 代码审查
- /lint: 代码检查
- /read: 读取文件
- /write: 写入文件
```

---

## 6. Workflow Feedback Loop 核心设计

### 6.1 设计目标

在 Workflow 层实现**错误恢复和人工介入**能力，支持全自动研发流水线：

```
用户需求 → [产品经理] → [架构师] → [技术设计] → [开发] → [测试]
              ↓           ↓          ↓         ↓       ↓
          自检/重试/回滚/人工介入
```

### 6.2 分层架构

```
┌─────────────────────────────────────────────────┐
│  Agent 层（内部执行）                             │
│  agent.yaml                                        │
│                                                   │
│  hooks:                                           │
│    post-execution:                               │
│      - ValidationHook  ← ⭐ Validation 在这里    │
│                                                   │
│  内部流程：                                        │
│    1. Agent 执行任务                                │
│    2. ValidationHook 检查输出                       │
│    3. 如果验证失败 → 抛出 ValidationError         │
│    4. 如果验证成功 → 返回结果                     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Workflow 层（外部编排）                           │
│  workflow.yaml                                     │
│                                                   │
│  steps:                                           │
│    - id: developer                                │
│      on_failure:                                 │ ← ⭐ Feedback Loop 在这里
│        action: retry                              │
│        rollback_to: architect                    │
│                                                   │
│  外部流程：                                        │
│    1. 执行 Agent                                   │
│    2. 检查结果 (success/failure)                  │
│    3. 如果失败 → on_failure 处理                   │
│    4. 重试 / 回滚 / 人工介入                        │
└─────────────────────────────────────────────────┘
```

### 6.3 什么是 Failure？

#### 6.3.1 Agent Step 的 Failure

三种 Failure 情况：

```typescript
// 情况1: Agent 抛出异常
const result = await agent.run(task);
// ❌ 抛出 Error
// → status: 'failed'

// 情况2: Agent 返回失败
const result = {
  success: false,  // ← Agent 自己判断失败了
  error: '无法实现需求'
};
// → status: 'failed'

// 情况3: ValidationHook 抛出 ValidationError
const result = await agent.run(task);
// ✅ 返回结果
// → ValidationHook.onTaskComplete() 检查
// → ❌ 抛出 ValidationError
// → status: 'failed'
```

#### 6.3.2 Webhook Step 的 Failure

Webhook Step 的成功/失败判断更加灵活：

```typescript
// 判断优先级：
// 1. reject（失败条件）
// 2. success_when（成功条件）
// 3. 默认 HTTP 状态码

// 示例1: 默认行为
// HTTP 2xx → ✅ 成功
// HTTP 4xx/5xx → ❌ 失败

// 示例2: success_when
// 所有条件都满足 → ✅ 成功
success_when:
  - "response.status == 200"
  - "response.body.success == true"

// 示例3: reject
// 满足任一条件 → ❌ 失败
reject:
  - "response.body.success == false"
  - "response.body.errors.length > 0"

// 示例4: success_when + reject
// 先检查 reject，再检查 success_when
reject:
  - "response.body.criticalErrors > 0"
success_when:
  - "response.body.status == 'passed'"
  - "response.body.coverage >= 80"
```

### 6.4 on_failure vs condition

```
condition:   [执行前] 决定"是否执行"
on_failure: [执行后] 决定"失败后怎么办"
```

| 维度 | condition | on_failure |
|------|----------|-----------|
| **时机** | 执行前（pre-check） | 执行后（post-check） |
| **作用** | 决定"是否执行" | 决定"失败后怎么办" |
| **影响** | status: 'skipped' | 触发重试/回滚/介入 |
| **使用场景** | 条件执行 | 错误恢复 |

### 6.5 配置示例

```yaml
# 基础配置: 重试
steps:
  - id: developer
    name: "代码生成"
    agent: developer
    on_failure:
      action: retry
    retry:
      maxAttempts: 5
      backoff: exponential

# 高级配置: 回滚
steps:
  - id: tester
    name: "测试验证"
    agent: tester
    on_failure:
      action: rollback
      rollback_to: developer
      message: "测试失败，重新开发"

# 高级配置: 人工介入
steps:
  - id: deploy
    name: "部署到生产"
    agent: deployer
    on_failure:
      # 测试环境失败: 重试
      if: "environment == 'staging'"
        action: retry
        maxAttempts: 3

      # 生产环境失败: 人工介入
      if: "environment == 'production'"
        action: human_intervention
        message: "生产部署失败，需要人工审核"
        options:
          - label: "重试部署"
            action: retry
          - label: "回滚到上一个版本"
            action: rollback
            rollback_to: previous_version
          - label: "标记为失败"
            action: fail
```

### 6.6 执行流程

```
场景1: 正常流程
[产品经理] ✅ → [架构师] ✅ → [开发] ✅ → [测试] ✅ → [完成]

场景2: 重试
[开发] ❌ → on_failure.retry → [开发] 🔁 ✅ → [测试] ✅

场景3: 回滚
[开发] ✅ → [测试] ❌ → on_failure.rollback → [开发] 🔁

场景4: 人工介入
[部署] ❌ → on_failure.human_intervention
  → 保存介入请求
  → 返回等待状态
  → 人类决策: 重试/回滚/失败
```

---

## 6.5 Agent 层 HITL (Human In The Loop) 设计

> **问题**: 在 Workflow 执行过程中，每个 Agent（产品经理、架构师、开发）可能需要人类澄清需求或决策
>
> **解决方案**: Agent Hook 系统支持在 Intent Analysis 阶段触发 HITL，通过配置化 Webhook 通知 MyRD，Agent 内部轮询等待澄清结果，丝滑恢复执行

### 6.5.1 设计原则

1. **在 Intent Analysis 阶段触发**: PTC CodeGen 之前判断是否需要澄清（需求明确才能生成代码）
2. **Agent Hook 配置化**: 通过 YAML 配置 Agent Hook，不需要修改 Agent 代码
3. **轮询机制**: Agent 内部轮询检测澄清结果，不中断执行线程
4. **丝滑恢复**: 澄清完成后从 checkpoint 继续，而不是重新开始
5. **独立接口**: 新增 `PUT /api/tasks/:id/hitl` 接口，只修改 `hitlState`，不触发新执行

### 6.5.2 HITL 触发时机

```
Agent.execute()
  ↓
1. checkHITLCheckpoint() - 检查是否有待恢复的 HITL
  ├─ 有 → 恢复澄清结果，继续执行
  └─ 无 → 继续
  ↓
2. notifyIntentAnalysis() - 分析意图
  ↓
3. checkIntentClarification() - 判断是否需要澄清 ⭐
  ├─ confidence < 0.7 → LLM 判断并生成澄清问题
  ├─ 需要 → 触发 Agent Hook，进入轮询
  └─ 不需要 → 继续
  ↓
4. PTC CodeGen - 生成代码（需求明确后）
  ↓
5. Sandbox Execute - 执行代码
```

**核心原则**: **在知道要干什么之前澄清，而不是在执行过程中澄清**

### 6.5.3 Agent Hook 配置

```yaml
# hooks/agent/hitl-webhook.yaml
type: hitl_webhook
trigger: onAwaitingHITL
enabled: true
config:
  url: "{{ env.HITL_WEBHOOK_URL }}"
  method: POST
```

**Agent Hook 类型**:

| Hook Type | Trigger | 说明 |
|-----------|---------|------|
| `hitl_webhook` | `onAwaitingHITL` | 发送 Webhook 到 MyRD，显示澄清 UI |
| `notification` | `onAwaitingHITL` | 发送通知（Lark、邮件等） |

### 6.5.4 扩展 Agent Hook Trigger

```typescript
// src/core/agent/hooks/types.ts

export type AgentHookTrigger =
  | 'preExec'              // 执行前
  | 'postExec'             // 执行后
  | 'onProgressingNotify'  // 进度通知
  | 'onAwaitingHITL';      // ⭐ 新增：需要澄清时

export interface AgentHookContext {
  agentName: string;      // 当前 Agent 名称（product-designer, architect...）
  sessionId: string;
  taskId: string;
  question: string;       // 澄清问题
  options?: string[];     // 可选答案
  intent?: any;           // 意图分析结果
}
```

### 6.5.5 HITL Webhook Handler

```typescript
// src/core/agent/hooks/handlers/hitl-webhook.ts

export class HITLWebhookHandler implements AgentHookHandler {
  async execute(context: AgentHookContext, config: any): Promise<any> {
    // 发送 Webhook 到 MyRD
    await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HITL-Event': 'clarification.required',
      },
      body: JSON.stringify({
        taskId: context.taskId,
        sessionId: context.sessionId,
        agentName: context.agentName,  // ⭐ Agent 身份
        question: context.question,
        options: context.options,
        intent: context.intent,
        answerUrl: `${process.env.MYAGENT_URL}/api/tasks/${context.taskId}/hitl`,  // ⭐ 新接口
      }),
    });
  }
}
```

### 6.5.6 修改 checkIntentClarification()

```typescript
// src/core/agent/agent.ts

private async checkIntentClarification(
  intent: any,
  task: string,
  taskId: string,
  context: any
): Promise<{ needs: boolean; question?: string; options?: string[] }> {
  // ... 现有逻辑（confidence 检查）

  if (clarification.needs_clarification) {
    // ⭐ 1. 触发 Agent Hook（如果配置了）
    await this.triggerAgentHook('onAwaitingHITL', {
      agentName: this.agentName,
      sessionId: this.sessionId,
      taskId,
      question: clarification.question,
      options: clarification.options,
      intent,
    });

    // ⭐ 2. 保存 HITL 状态到数据库
    await this.saveHITLState(taskId, {
      stage: 'post_intent',
      status: 'awaiting',
      question: clarification.question,
      options: clarification.options,
      createdAt: new Date(),
    });

    // ⭐ 3. 开始轮询，直到拿到澄清结果
    const clarificationResult = await this.pollHITLResult(taskId);

    // ⭐ 4. 获取到澄清结果，更新 task
    console.log('[Agent] Clarification received:', clarificationResult);

    // 将澄清内容添加到对话历史
    this.state.conversationHistory.push({
      role: 'user',
      content: clarificationResult.content,
      timestamp: Date.now(),
    });

    // 更新 task 内容为澄清后的内容
    task = clarificationResult.content;

    // ⭐ 5. 清除 HITL 状态
    await this.clearHITLState(taskId);

    // ⭐ 6. 返回 needs: false，继续执行（不返回 AWAITING_CLARIFICATION）
    return { needs: false };
  }

  return { needs: false };
}

/**
 * ⭐ 轮询 HITL 结果（不中断执行）
 */
private async pollHITLResult(taskId: string): Promise<any> {
  const pollInterval = 30000; // 30 秒检查一次
  const maxPollTime = 86400000; // 最多等 24 小时

  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTime) {
    try {
      const contextManager = new ContextManager();
      const taskContext = await contextManager.getContext(taskId);

      // 检查 HITL 状态
      if (taskContext?.hitlState?.status === 'completed') {
        console.log('[Agent] HITL completed, resuming...');
        return taskContext.hitlState.response;
      }

      console.log(`[Agent] Still awaiting clarification (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
    } catch (error) {
      console.error('[Agent] Failed to check HITL state:', error);
    }

    // 等待 30 秒后再次检查
    await sleep(pollInterval);
  }

  // 超时：抛出错误
  throw new Error('HITL timeout: no clarification received within 24 hours');
}

/**
 * ⭐ 清除 HITL 状态
 */
private async clearHITLState(taskId: string): Promise<void> {
  try {
    const contextManager = new ContextManager();
    const taskContext = await contextManager.getContext(taskId);

    if (taskContext?.hitlState) {
      delete taskContext.hitlState;
      await contextManager.saveContext(taskContext);
      console.log('[Agent] HITL state cleared');
    }
  } catch (error) {
    console.error('[Agent] Failed to clear HITL state:', error);
  }
}
```

### 6.5.7 新增 HITL 结果设置 API

```typescript
// steps/api/task-hitl-result-api.step.ts

export const config: ApiRouteConfig = {
  type: 'api',
  path: '/api/tasks/:id/hitl',
  method: 'PUT',
};

export const handler = async (request, { logger }) => {
  const { id } = request.pathParams;
  const { decision, feedback } = request.body;

  logger.info('HITL result received', { taskId: id, decision, feedback });

  try {
    const contextManager = new ContextManager();
    const taskContext = await contextManager.getContext(id);

    // 边界检查：确保 HITL 状态存在
    if (!taskContext?.hitlState) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'HITL state not found for this task',
        },
      };
    }

    // ⭐ 只修改 hitlState，不触发新执行
    taskContext.hitlState.status = 'completed';
    taskContext.hitlState.response = {
      content: decision,  // 人类的选择/回答
      feedback,            // 补充说明（可选）
      timestamp: new Date(),
    };

    // 保存到数据库
    await contextManager.saveContext(taskContext);

    logger.info('HITL state updated to completed', { taskId: id });

    return {
      status: 200,
      body: {
        success: true,
        message: 'HITL result saved, agent will resume',
      },
    };
  } catch (error: any) {
    logger.error('Failed to save HITL result', { error: error.message });
    return {
      status: 500,
      body: {
        success: false,
        message: 'Failed to save HITL result',
        error: error.message,
      },
    };
  }
};
```

### 6.5.8 完整 HITL 流程

```
1. 产品经理 Agent 执行
   ↓
2. Intent Analysis - 分析意图
   confidence: 0.3（低于阈值）
   ↓
3. checkIntentClarification() - 需要 HIL
   ↓
4. ⭐ 触发 Agent Hook (onAwaitingHITL)
   ├─ hitl_webhook handler 执行
   └─ 发送 Webhook 到 MyRD
   ↓
5. ⭐ 保存 HITL 状态到 DB
   taskContext.hitlState = {
     status: 'awaiting',
     question: "请说明主要用户角色",
     options: ["普通用户", "企业用户", "管理员"]
   }
   ↓
6. ⭐ 进入轮询循环（不中断执行）：
   while (status === 'awaiting') {
     sleep(30s)
     check status from DB
   }
   ↓
7. MyRD 收到 Webhook，显示澄清 UI
   ↓
8. 人类提交答案：
   PUT /api/tasks/:id/hitl
   { decision: "企业用户", feedback: "B端客户" }
   ↓
9. ⭐ 只修改 hitlState.status = 'completed'
   不触发新执行 ✅
   ↓
10. Agent 轮询检测到 status === 'completed'
   ↓
11. ⭐ 从 checkpoint 丝滑恢复，继续执行
    使用澄清内容更新 task
    继续后续流程（PTC CodeGen） ✅
```

### 6.5.9 与现有 `/api/tasks/:id/chat` 的区别

| 维度 | `/api/tasks/:id/chat` | `/api/tasks/:id/hitl` |
|------|----------------------|---------------------|
| **用途** | 多轮对话 | HITL 澄清结果设置 |
| **行为** | 重新触发整个 task 执行 | 只修改 `hitlState` |
| **触发** | 发送 `agent.task.execute` 事件 | 不触发新事件 |
| **适用场景** | 对话式交互 | HITL 流程中设置澄清结果 |
| **Agent 状态** | 重新开始执行 | 从 checkpoint 丝滑恢复 |

**关键区别**:
- `/api/tasks/:id/chat` 会触发新的执行轮次，不会继续原来的 workflow
- `/api/tasks/:id/hitl` 只修改状态，Agent 轮询检测到后丝滑恢复

### 6.5.10 TaskContext 生命周期保证

```
1. Task 开始执行
   ↓
2. ContextManagerTaskHook.preExec()
   - 调用 contextManager.createTaskContext(taskId, sessionId, task)
   - 创建 TaskContext 并保存到数据库
   ↓
3. Agent 执行
   ↓
4. checkIntentClarification() 发现需要澄清
   ↓
5. saveHITLState(taskId, { status: 'awaiting', ... })
   - 从数据库获取 TaskContext（已存在 ✅）
   - 设置 taskContext.hitlState
   - 保存回数据库
   ↓
6. Agent 进入轮询循环
   ↓
7. 外部调用 PUT /api/tasks/:id/hitl
   - 从数据库获取 TaskContext
   - 检查 taskContext.hitlState 是否存在 ✅
   - 更新 taskContext.hitlState.status = 'completed'
   - 保存回数据库
```

**边界保护**:
- `if (!taskContext?.hitlState)` → 返回 404
- 正常情况下 TaskContext 和 hitlState 都存在
- 404 只在异常情况（错误的 taskId，没有 HITL 请求）

### 6.5.11 简化方案：只支持文本输入

为了快速实现和降低复杂度，第一期只支持文本输入，移除选择题逻辑。

#### 简化数据模型

```typescript
// ⭐ 移除 options 字段
interface HITLState {
  stage: string;
  status: 'awaiting' | 'completed';
  question: string;  // 只有 question
  response?: {
    content: string;
    timestamp: Date;
  };
  createdAt: Date;
}
```

#### 简化 checkIntentClarification()

```typescript
// src/core/agent/agent.ts

private async checkIntentClarification(
  intent: any,
  task: string,
  taskId: string,
  context: any
): Promise<{ needs: boolean; question?: string }> {  // ⭐ 移除 options 返回
  // ...

  if (clarification.needs_clarification) {
    // 1. 触发 Agent Hook
    await this.triggerAgentHook('onAwaitingHITL', {
      agentName: this.agentName,
      sessionId: this.sessionId,
      taskId,
      question: clarification.question,  // ⭐ 只传 question
      intent,
    });

    // 2. 保存 HITL 状态（不包含 options）
    await this.saveHITLState(taskId, {
      stage: 'post_intent',
      status: 'awaiting',
      question: clarification.question,  // ⭐ 只有 question
      createdAt: new Date(),
    });

    // 3. 轮询等待
    const clarificationResult = await this.pollHITLResult(taskId);

    // 4. 恢复执行
    task = clarificationResult.content;
    await this.clearHITLState(taskId);

    return { needs: false };
  }

  return { needs: false };
}
```

#### 简化 LLM Prompt

```typescript
const prompt = `分析以下任务，判断是否需要向用户澄清才能更好地完成任务。

任务: "${task}"

当前意图分析:
- 检测到的意图: ${intent.intent}
- 置信度: ${intent.confidence}
- 推理: ${intent.reasoning}

请以 JSON 格式回复，包含以下字段:
{
  "needs_clarification": true/false,
  "question": "澄清问题"
}

澄清规则:
1. 如果置信度 < 0.5，需要澄清
2. 如果任务描述过于模糊，需要澄清
3. 澄清问题要具体、有帮助，引导用户提供更多信息

如果不需要澄清，返回: {"needs_clarification": false}`;
```

#### 简化 API

```typescript
// steps/api/task-hitl-result-api.step.ts

export const handler = async (request, { logger }) => {
  const { id } = request.pathParams;
  const { decision } = request.body;  // ⭐ 只需要 decision（文本）

  // ... 更新 hitlState
  taskContext.hitlState.response = {
    content: decision,  // ⭐ 文本内容
    timestamp: new Date(),
  };

  // ...
};
```

### 6.5.12 前端交互设计

#### 设计原则

1. **不占用主界面**：使用卡片 + 展开交互，点击后显示澄清界面
2. **清晰的视觉提示**：⏸️ 图标 + "等待澄清"文案
3. **简洁的交互流程**：点击卡片 → 展开Modal → 输入文本 → 提交

#### 状态判断

```typescript
const TaskDetailPage = ({ taskId }) => {
  const { task, hitlState } = useTaskPolling(taskId);

  // ⭐ 场景 1：HITL 澄清等待
  if (task?.status === 'RUNNING' && hitlState?.status === 'awaiting') {
    return (
      <div>
        <ClarificationWaitingCard
          task={task}
          hitlState={hitlState}
          onExpand={() => setShowClarificationModal(true)}
        />
        <ProgressStream taskId={taskId} />
      </div>
    );
  }

  // ⭐ 场景 2：Agent 正常执行
  if (task?.status === 'RUNNING') {
    return <ProgressStream taskId={taskId} />;
  }

  // ⭐ 场景 3：Agent 已完成
  if (task?.status === 'COMPLETED') {
    return (
      <div>
        <TaskResult task={task} />
        <MultiRoundChatInput taskId={taskId} />
      </div>
    );
  }

  // ⭐ 场景 4：Agent 失败
  if (task?.status === 'FAILED') {
    return (
      <div>
        <ErrorResult task={task} />
        <MultiRoundChatInput taskId={taskId} />
      </div>
    );
  }
};
```

#### 澄清等待卡片（收起状态）

```typescript
const ClarificationWaitingCard = ({ task, hitlState, onExpand }) => {
  return (
    <div className="clarification-waiting-card" onClick={onExpand}>
      {/* 左侧：图标 + 信息 */}
      <div className="card-left">
        <div className="icon">⏸️</div>
        <div className="info">
          <div className="agent-name">{task.agentName} 需要澄清</div>
          <div className="question-preview">
            {hitlState.question?.substring(0, 50)}...
          </div>
        </div>
      </div>

      {/* 右侧：展开按钮 */}
      <div className="card-right">
        <button className="expand-button">
          回复澄清 →
        </button>
      </div>
    </div>
  );
};
```

**视觉样式**：
```
┌─────────────────────────────────────────────────────────────┐
│ ⏸️  产品经理需要澄清                                    回复澄清 → │
│     请说明主要用户角色，包括：普通用户、企业用户...          │
└─────────────────────────────────────────────────────────────┘
```

#### 展开后的澄清 Modal

```typescript
const ClarificationModal = ({ task, hitlState, onClose }) => {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) {
      toast.error('请输入澄清信息');
      return;
    }

    setSubmitting(true);

    const response = await fetch(`/api/tasks/${task.id}/hitl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: input,  // 文本内容
      })
    });

    if (response.ok) {
      toast.success('澄清已收到，Agent 继续执行...');
      onClose();
    } else {
      toast.error('提交失败，请重试');
    }

    setSubmitting(false);
  };

  return (
    <Modal open={true} onClose={onClose}>
      <div className="clarification-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="agent-info">
            <AgentAvatar agentName={task.agentName} />
            <h3>{task.agentName} 需要澄清</h3>
          </div>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <div className="question-section">
            <h4>🤔 澄清问题</h4>
            <p>{hitlState.question}</p>
          </div>

          {/* ⭐ 只支持文本输入 */}
          <div className="input-section">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="请输入您的回答..."
              rows={4}
              disabled={submitting}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            onClick={handleSubmit}
            disabled={submitting || !input.trim()}
            className="submit-button"
          >
            {submitting ? '提交中...' : '提交回答'}
          </button>
          <button onClick={onClose} className="cancel-button">
            取消
          </button>
        </div>
      </div>
    </Modal>
  );
};
```

**Modal 视觉设计**：
```
┌─────────────────────────────────────────────────────────────┐
│  👤 产品经理需要澄清                              [×]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🤔 澄清问题                                               │
│  请说明主要用户角色，包括：普通用户、企业用户、管理员       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 请输入您的回答...                                    │    │
│  │                                                     │    │
│  │                                                     │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [取消]                            [提交回答]             │
└─────────────────────────────────────────────────────────────┘
```

#### 完整交互流程

```
1. 用户进入任务详情页
   ↓
2. 顶部显示卡片：⏸️ 产品经理需要澄清 [回复澄清 →]
   ↓
3. 用户点击"回复澄清"按钮
   ↓
4. 展开澄清 Modal
   ↓
5. 显示澄清问题 + 文本输入框
   ↓
6. 用户输入答案
   ↓
7. 点击"提交回答" → PUT /api/tasks/:id/hitl
   ↓
8. Modal 关闭，卡片消失
   ↓
9. 显示提示："✅ 澄清已收到，Agent 继续执行..."
   ↓
10. 进度流继续显示 Agent 的执行进度
```

#### 前端轮询策略

```typescript
const useTaskPolling = (taskId) => {
  const [task, setTask] = useState(null);
  const [hitlState, setHITLState] = useState(null);

  useEffect(() => {
    const poll = async () => {
      const [taskData, hitlData] = await Promise.all([
        fetch(`/api/tasks/${taskId}`).then(r => r.json()),
        fetch(`/api/contexts/${taskId}`).then(r => r.json())
          .then(ctx => ctx.hitlState)
      ]);

      setTask(taskData);
      setHITLState(hitlData);

      // 如果是 RUNNING 状态，继续轮询
      if (taskData.status === 'RUNNING') {
        setTimeout(poll, 2000); // 2 秒轮询
      }
    };

    poll();
  }, [taskId]);

  return { task, hitlState };
};
```

### 6.5.13 未来扩展（可选）

在基础功能稳定后，可以考虑以下扩展：

1. **支持选择题**：LLM 生成选项，用户点击选择
2. **支持文件上传**：用户可以上传图片、文档作为澄清依据
3. **支持多轮澄清**：连续提问，逐步澄清
4. **支持历史记录**：查看之前的澄清历史
5. **支持超时设置**：每个 Agent 设置不同的超时时间

---

## 7. 技术实现方案

### 7.1 类型定义

```typescript
// src/core/workflow/types.ts

export interface RetryConfig {
  maxAttempts?: number;
  backoff?: 'linear' | 'exponential';
  backoffMs?: number;
}

export interface InterventionOption {
  label: string;
  action: 'retry' | 'rollback' | 'fail';
  rollback_to?: string;
}

export interface FailureHandler {
  action: 'retry' | 'rollback' | 'human_intervention' | 'fail';

  // 重试相关
  retry?: RetryConfig;

  // 回滚相关
  rollback_to?: string;
  fallback_rollback_to?: string;
  message?: string;

  // 人工介入相关
  options?: InterventionOption[];

  // 条件性处理
  if?: string;
  then?: FailureHandler;
}

// ⭐ Webhook Step 配置
export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  body?: Record<string, any>;
  timeout?: number;
}

export interface WorkflowStep {
  id: string;
  name?: string;

  // ⭐ Step 类型
  type: 'agent' | 'webhook';

  // Agent Step 专用
  agent?: string;
  input?: Record<string, any>;

  // Webhook Step 专用
  config?: WebhookConfig;

  // ⭐ 成功/失败判断（简化版）
  success_when?: string[];  // 成功条件（AND）
  reject?: string[];        // 失败条件（OR）

  // 通用字段
  depends_on?: string[];
  output?: Record<string, string | OutputMapping>;

  // Feedback Loop
  on_failure?: FailureHandler;
  retry?: RetryConfig;

  // 现有字段
  condition?: StepCondition;
  parallel?: ParallelConfig;
  always_run?: boolean;
}
```

### 7.2 Workflow Engine 扩展

```typescript
// src/core/workflow/engine.ts

export class WorkflowEngine {

  /**
   * Execute workflow with retry and rollback support
   */
  async execute(
    workflowName: string,
    input: Record<string, any>,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);

    try {
      // 执行工作流（带重试和回滚）
      const result = await this.executeWorkflowWithRetry(
        workflow,
        input,
        options
      );

      return result;
    } catch (error: any) {
      if (error.name === 'HumanInterventionRequired') {
        // ⭐ 触发人工介入
        return await this.handleHumanIntervention(error, workflow, input, options);
      }
      throw error;
    }
  }

  /**
   * Execute a single step (supports both agent and webhook)
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<WorkflowStepResult> {
    // ⭐ 根据 step 类型执行
    if (step.type === 'agent') {
      return await this.executeAgentStep(step, context);
    } else if (step.type === 'webhook') {
      return await this.executeWebhookStep(step, context);
    } else {
      throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute Agent Step
   */
  private async executeAgentStep(step: WorkflowStep, context: WorkflowContext): Promise<WorkflowStepResult> {
    const agent = this.agentManager.getOrCreate(step.agent);
    const result = await agent.execute(step.input);

    return {
      stepId: step.id,
      status: result.success ? 'completed' : 'failed',
      output: result,
    };
  }

  /**
   * ⭐ Execute Webhook Step
   */
  private async executeWebhookStep(step: WorkflowStep, context: WorkflowContext): Promise<WorkflowStepResult> {
    const { url, method, headers, body, timeout = 30000 } = step.config;

    try {
      // 1. 渲染 body 模板
      const renderedBody = this.renderTemplate(body, context);

      // 2. 发起 HTTP 请求
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: method !== 'GET' ? JSON.stringify(renderedBody) : undefined,
        signal: AbortSignal.timeout(timeout),
      });

      // 3. 解析响应
      let responseBody: any;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // 4. 构造完整的响应对象
      const result = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
      };

      // 5. 判断成功/失败
      const isSuccess = this.isWebhookSuccess(step, result, context);

      if (isSuccess) {
        // 6. 保存输出到 Context
        if (step.output) {
          this.mapOutputs(step.output, result, context);
        }

        return {
          stepId: step.id,
          status: 'completed',
          output: result,
        };
      } else {
        return {
          stepId: step.id,
          status: 'failed',
          error: this.extractFailureMessage(result),
          output: result,
        };
      }

    } catch (error) {
      // 网络错误、超时等
      return {
        stepId: step.id,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * ⭐ 判断 Webhook 是否成功
   */
  private isWebhookSuccess(step: WorkflowStep, response: any, context: WorkflowContext): boolean {
    // 优先级1: reject（满足任一则失败）
    if (step.reject && step.reject.length > 0) {
      const isRejected = step.reject.some(expr =>
        this.evaluateExpression(expr, { response, context })
      );
      if (isRejected) return false;
    }

    // 优先级2: success_when（满足全部则成功）
    if (step.success_when && step.success_when.length > 0) {
      return step.success_when.every(expr =>
        this.evaluateExpression(expr, { response, context })
      );
    }

    // 默认: HTTP 状态码 2xx
    return response.status >= 200 && response.status < 300;
  }

  /**
   * 渲染模板变量
   */
  private renderTemplate(template: any, context: WorkflowContext): any {
    if (typeof template === 'string') {
      // "{{ variable }}" → context.get('variable')
      return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const value = this.getNestedValue(context, key.trim());
        return value !== undefined ? value : '';
      });
    }

    if (Array.isArray(template)) {
      return template.map(item => this.renderTemplate(item, context));
    }

    if (typeof template === 'object' && template !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.renderTemplate(value, context);
      }
      return result;
    }

    return template;
  }

  /**
   * 安全的表达式求值
   */
  private evaluateExpression(expression: string, scope: { response: any; context: WorkflowContext }): boolean {
    try {
      const func = new Function('response', 'context', `
        "use strict";
        try {
          return (${expression});
        } catch (e) {
          return false;
        }
      `);

      return func(scope.response, scope.context);
    } catch (error) {
      this.logger.warn(`Failed to evaluate expression: ${expression}`, error);
      return false;
    }
  }

  /**
   * 映射输出到 Context
   */
  private mapOutputs(outputMapping: Record<string, string | OutputMapping>, result: any, context: WorkflowContext): void {
    for (const [key, mapping] of Object.entries(outputMapping)) {
      if (typeof mapping === 'string') {
        const value = this.getNestedValue(result, mapping);
        if (value !== undefined) {
          context.set(key, value);
        }
      } else if (mapping.structuredOutput) {
        context.set(key, result);
      }
    }
  }

  /**
   * 提取失败消息
   */
  private extractFailureMessage(response: any): string {
    if (response.body && typeof response.body === 'object') {
      if (response.body.error) return response.body.error;
      if (response.body.message) return response.body.message;
    }
    return `${response.status} ${response.statusText}`;
  }

```typescript
// src/core/workflow/engine.ts

export class WorkflowEngine {

  /**
   * Execute workflow with retry and rollback support
   */
  async execute(
    workflowName: string,
    input: Record<string, any>,
    options: WorkflowOptions = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);

    try {
      // 执行工作流（带重试和回滚）
      const result = await this.executeWorkflowWithRetry(
        workflow,
        input,
        options
      );

      return result;
    } catch (error: any) {
      if (error.name === 'HumanInterventionRequired') {
        // ⭐ 触发人工介入
        return await this.handleHumanIntervention(error, workflow, input, options);
      }
      throw error;
    }
  }

  /**
   * Execute workflow with retry and rollback
   */
  private async executeWorkflowWithRetry(
    workflow: WorkflowConfig,
    input: Record<string, any>,
    options: WorkflowOptions
  ): Promise<WorkflowResult> {
    const sortedSteps = this.topologicalSort(workflow.steps);
    let currentStepIndex = 0;

    while (currentStepIndex < sortedSteps.length) {
      const step = sortedSteps[currentStepIndex];

      // ⭐ 执行步骤（带重试）
      const stepResult = await this.executeStepWithRetry(
        step,
        context,
        workflow,
        options
      );

      // ⭐ 步骤失败：处理失败
      if (stepResult.status === 'failed') {
        const failureResult = await this.handleStepFailure(
          step,
          stepResult,
          workflow,
          context,
          sortedSteps
        );

        if (failureResult.action === 'retry') {
          // 重试当前步骤（不增加索引）
          continue;
        } else if (failureResult.action === 'rollback') {
          // ⭐ 回滚到指定步骤
          currentStepIndex = failureResult.rollbackIndex;
          this.clearContextAfter(sortedSteps, failureResult.rollbackIndex, context);
          continue;
        } else if (failureResult.action === 'human_intervention') {
          // ⭐ 触发人工介入
          throw new HumanInterventionRequiredError(step, stepResult);
        } else {
          // 失败：停止执行
          break;
        }
      }

      currentStepIndex++;
    }

    return {
      success: true,
      output: this.extractFinalOutput(executionSteps, context),
      steps: executionSteps,
    };
  }

  /**
   * Execute a single step with retry support
   */
  private async executeStepWithRetry(
    step: WorkflowStep,
    context: WorkflowContext,
    workflow: WorkflowConfig,
    options: WorkflowOptions
  ): Promise<any> {
    const retryConfig = step.retry || { maxAttempts: 1 };
    const maxAttempts = retryConfig.maxAttempts || 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // ⭐ 执行步骤（捕获 ValidationError）
        const result = await this.executeStep(step, context, workflow, options);
        return result;
      } catch (error) {
        if (attempt >= maxAttempts) {
          return {
            stepId: step.id,
            status: 'failed',
            error: error.message,
            retryAttempts: attempt,
          };
        }
        // ⭐ 等待退避时间
        await this.sleep(this.calculateBackoff(retryConfig, attempt));
      }
    }
  }

  /**
   * Handle step failure
   */
  private async handleStepFailure(
    step: WorkflowStep,
    stepResult: any,
    workflow: WorkflowConfig,
    context: WorkflowContext,
    sortedSteps: WorkflowStep[]
  ): Promise<{ action: string; rollbackIndex?: number }> {
    const onFailure = step.on_failure || { action: 'fail' };

    // ⭐ 条件性处理
    if (onFailure.if && !this.evaluateCondition(onFailure.if, context)) {
      return { action: onFailure.action || 'fail' };
    }

    if (onFailure.action === 'retry') {
      return { action: 'retry' };
    }

    if (onFailure.action === 'rollback' && onFailure.rollback_to) {
      const rollbackIndex = this.findStepIndex(sortedSteps, onFailure.rollback_to);
      if (rollbackIndex !== -1) {
        return { action: 'rollback', rollbackIndex };
      }
    }

    if (onFailure.action === 'human_intervention') {
      throw new HumanInterventionRequiredError(step, stepResult);
    }

    return { action: 'fail' };
  }

  /**
   * Clear context after a specific step (for rollback)
   */
  private clearContextAfter(
    sortedSteps: WorkflowStep[],
    rollbackIndex: number,
    context: WorkflowContext
  ): void {
    for (let i = rollbackIndex + 1; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      context.clearStepStatus(step.id);
      context.clearVariable(step.id);
    }
  }
}

/**
 * Human intervention required error
 */
class HumanInterventionRequiredError extends Error {
  constructor(
    public step: WorkflowStep,
    public stepResult: any
  ) {
    super(`Human intervention required for step: ${step.id}`);
    this.name = 'HumanInterventionRequired';
  }
}
```

### 7.3 人工介入流程

```typescript
/**
 * Handle human intervention
 */
private async handleHumanIntervention(
  error: HumanInterventionRequiredError,
  workflow: WorkflowConfig,
  input: Record<string, any>,
  options: WorkflowOptions
): Promise<WorkflowResult> {
  const step = error.step;
  const stepResult = error.stepResult;

  // ⭐ 保存人工介入请求到数据库
  const interventionId = await this.saveInterventionRequest({
    workflowName: workflow.name,
    stepId: step.id,
    stepName: step.name,
    error: stepResult.error,
    message: step.on_failure?.message || `步骤 ${step.name} 执行失败`,
    options: step.on_failure?.options || [],
    metadata: {
      sessionId: options.sessionId,
      taskId: options.taskId,
    },
  });

  // ⭐ 返回"等待人工介入"状态
  return {
    success: false,
    error: 'Human intervention required',
    interventionId,
    requiresHumanIntervention: true,
  };
}

/**
 * Resume workflow from human intervention
 */
async resumeFromIntervention(
  workflowName: string,
  interventionId: string,
  humanDecision: {
    action: 'retry' | 'rollback' | 'fail';
    rollbackTo?: string;
    feedback?: string;
  },
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const intervention = await this.getInterventionRequest(interventionId);
  const context = new WorkflowContext(options.taskId, intervention.context);

  if (humanDecision.action === 'retry') {
    return await this.execute(workflowName, intervention.input, {
      ...options,
      resumeFrom: intervention.stepId,
    });
  }

  if (humanDecision.action === 'rollback' && humanDecision.rollbackTo) {
    return await this.execute(workflowName, intervention.input, {
      ...options,
      rollbackTo: humanDecision.rollbackTo,
      feedback: humanDecision.feedback,
    });
  }

  return {
    success: false,
    error: 'Workflow failed by human decision',
  };
}
```

### 7.4 数据库支持

```prisma
// 人工介入请求表
model InterventionRequest {
  id            String   @id @default(cuid())
  workflowName  String
  stepId        String
  stepName      String
  error         String
  message       String
  options       Json     // InterventionOption[]
  status        String   @default("pending") // pending, completed, cancelled

  humanDecision Json?
  feedback      String?

  metadata      Json
  context       Json     // WorkflowContext snapshot
  input         Json     // Task input

  createdAt     DateTime @default(now())
  decidedAt     DateTime?

  @@index([workflowName])
  @@index([status])
}
```

---

## 7. 实施路线图

### 8.1 MyRD 平台实施

#### Phase 1: 基础框架 (2-3 周)
- [ ] 创建 Motia 项目
- [ ] 设计数据模型 (Prisma)
- [ ] 搭建 API Gateway (Fastify + Socket.IO)
- [ ] 实现 Projects CRUD API
- [ ] 实现 Specs CRUD API
- [ ] Webhook 接收基础功能

#### Phase 2: CI/CD 引擎 (3-4 周)
- [ ] CI/CD Engine Step
- [ ] Pipeline 创建和执行
- [ ] Git Commit Stage
- [ ] Test Stage
- [ ] Deploy Stage
- [ ] Integration Test Stage

#### Phase 3: CLI 工具 (2-3 周)
- [ ] CLI 框架搭建 (Commander.js)
- [ ] init 命令: 项目初始化、规范拉取
- [ ] code 命令: Coding Agent 启动、WebSocket 连接
- [ ] status 命令: 项目状态查询

#### Phase 4: 实时监控 (2-3 周)
- [ ] WebSocket 服务 (Socket.IO)
- [ ] Event Router 实现
- [ ] 监控 Dashboard
- [ ] 通知服务 (Lark, Email)

#### Phase 5: Web 控制台 (4-6 周，可选)
- [ ] Next.js 项目初始化
- [ ] Dashboard 页面
- [ ] 项目管理页面
- [ ] 规范管理页面
- [ ] 流水线监控页面

### 8.2 MyAgent Workflow Feedback Loop 实施

#### Phase 1: 类型扩展 (1 周)
- [ ] 扩展 WorkflowStep 类型
- [ ] 添加 RetryConfig、FailureHandler
- [ ] 添加 InterventionOption
- [ ] 单元测试

#### Phase 2: Engine 实现 (2 周)
- [ ] executeStepWithRetry 实现
- [ ] handleStepFailure 实现
- [ ] handleHumanIntervention 实现
- [ ] resumeFromIntervention 实现
- [ ] clearContextAfter 实现
- [ ] 集成测试

#### Phase 3: 数据库和 API (1 周)
- [ ] 数据库表设计
- [ ] InterventionRequest 模型
- [ ] API 端点实现
- [ ] 测试

#### Phase 4: Agent 层支持 (1 周)
- [ ] 实现 ValidationHook
- [ ] 实现 FeedbackLoopHook（可选）
- [ ] 配置文档

#### Phase 5: 完整流程测试 (1 周)
- [ ] 端到端测试
- [ ] 文档完善
- [ ] 示例配置

### 8.3 集成与联调

#### Phase 1: MyRD ↔ MyAgent 集成 (1 周)
- [ ] MyRD 调用 MyAgent API
- [ ] MyAgent 发送 Webhook 到 MyRD
- [ ] 数据格式统一
- [ ] 错误处理

#### Phase 2: 完整流程测试 (1 周)
- [ ] 从需求到部署的完整流程
- [ ] Feedback Loop 测试
- [ ] 人工介入流程测试
- [ ] 性能测试

---

## 8. Demo Workflow 设计

> **目标**: 快速验证 MyAgent Workflow + Webhook Step 的可行性

### 8.1 Demo Workflow 概览

```
GitHub Issue
    ↓
[开发 Agent (含自测)]
    ↓ (retry 最多3次)
[Git Commit Webhook]
    ↓
[CI Test Webhook]
    ↓
[人工 Review] ← ⭐ 新环节
    ↓ (通过)
[Mock Staging Deploy Webhook]
    ↓
[完成]
```

**核心特点**：
1. **GitHub Issue 作为需求来源**：AI Native，不需要 JIRA/Linear
2. **开发 Agent 自包含测试**：Agent 自己设计 test case 并自测
3. **Webhook Step 集成 CI/CD**：通过 Webhook 调用外部系统
4. **人工 Review 环节**：CI 后、部署前的人工审查
5. **Mock 部署验证**：快速验证流程，无需真实环境

### 8.2 MyAgent 需要实现的功能

#### 8.2.1 类型扩展

```typescript
export interface WorkflowStep {
  id: string;
  name?: string;

  // ⭐ Step 类型：agent 或 webhook
  type: 'agent' | 'webhook';

  // Agent Step 专用
  agent?: string;
  input?: Record<string, any>;

  // Webhook Step 专用
  config?: {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    body?: Record<string, any>;
    timeout?: number;
  };

  // ⭐ 成功/失败判断
  success_when?: string[];  // 成功条件（AND 逻辑）
  reject?: string[];        // 失败条件（OR 逻辑）

  // 通用字段
  depends_on?: string[];
  output?: Record<string, string | OutputMapping>;
  on_failure?: FailureHandler;
  retry?: RetryConfig;
}
```

#### 8.2.2 Workflow Engine 扩展

- **`executeWebhookStep`**: 执行 HTTP 请求，处理超时，解析响应
- **`isWebhookSuccess`**: 判断 Webhook 是否成功（reject > success_when > 默认 HTTP 状态码）
- **`renderTemplate`**: 渲染模板变量（支持 `{{ workflow_input.* }}`, `{{ environment.* }}`, `{{ stepId.* }}`）
- **`evaluateExpression`**: 表达式求值（如 `response.body.success == true`）

#### 8.2.3 Mock Webhook 服务

**Mock 人工 Review**:
- 提供 Web UI 供人工决策（批准/拒绝）
- 支持自动批准模式（`AUTO_APPROVE=true`）用于测试
- 决策后通知 Workflow 继续执行

**Mock Staging 部署**:
- 模拟部署成功/失败（通过环境变量控制）
- 验证人工介入流程
- 返回部署结果

### 8.3 关键验证点

1. **Webhook Step 执行**：能够发起 HTTP 请求并处理响应
2. **成功/失败判断**：`success_when` 和 `reject` 条件判断正确
3. **模板渲染**：变量引用正确展开
4. **Feedback Loop**：失败时回滚到指定步骤重新执行
5. **人工介入**：触发人工介入后能够继续执行

---

## 9. 设计原则总结

### 9.1 MyRD 设计原则

1. **应用驱动**: 面向研发管理场景，提供端到端解决方案
2. **规范数字化**: 将团队规范转化为可执行能力
3. **本地优先**: 保留开发者的控制权和体验
4. **事件驱动**: 解耦本地开发和云端自动化
5. **实时透明**: 让研发流程可追踪、可视化

### 9.2 MyAgent 设计原则

1. **中间件定位**: 通用 Agent 执行框架，不包含业务逻辑
2. **分层清晰**: Agent 层执行、Workflow 层编排
3. **可扩展**: 通过 Agent、Skill、Hook 轻松扩展
4. **简化设计**: 避免过度复杂的智能决策
5. **人类决策**: 复杂情况由人类决定

### 9.3 Workflow Feedback Loop 设计原则

1. **分层清晰**: Agent 层自检（Validation），Workflow 层编排（Feedback Loop）
2. **职责分离**: Validation 在 Agent 内部，Feedback Loop 在 Workflow 外部
3. **简化设计**: 支持重试、回滚、人工介入，避免过度复杂
4. **渐进增强**: 在现有 Workflow 机制上扩展，不破坏兼容性
5. **人类决策**: 复杂情况由人类决定，而不是 AI 推测

---

## 10. 相关文档

- [AGENT_PLATFORM_ARCHITECTURE.md](./AGENT_PLATFORM_ARCHITECTURE.md) - Agent 平台架构
- [workflow-feedback-loop-design.md](./workflow-feedback-loop-design.md) - Workflow Feedback Loop 详细设计
- [workflow-system.md](../reference/architecture/workflow-system.md) - Workflow 系统文档
- [coding-agent-platform-vision.md](./coding-agent-platform-vision.md) - 代码生成平台愿景
- [ai-rd-platform-concept.md](./ai-rd-platform-concept.md) - AI 研发平台概念

---

**文档状态**: 🟡 设计阶段
**下一步**: 开始实施 Phase 1（MyRD 基础框架 + MyAgent Workflow 类型扩展）
