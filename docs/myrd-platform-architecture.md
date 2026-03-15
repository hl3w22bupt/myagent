# MyRD 研发平台架构设计

> 创建时间: 2026-03-15
> 状态: 架构设计阶段

## 系统概述

MyRD 是一个基于 Motia 框架的研发管理平台，通过事件驱动的方式连接本地开发环境和云端自动化流程。

### 核心理念

```
本地开发（可控） + 云端自动化（效率） + 实时可视化（透明）
```

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      MyRD 研发平台                            │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           展示层 (Presentation)                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Web 控制台│  │ CLI      │  │ Mobile   │          │   │
│  │  │ (未来)   │  │ Wrapper  │  │ (未来)   │          │   │
│  │  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           API 网关层 (Motia Event Steps)             │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  REST API + WebSocket (Socket.IO)            │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        业务逻辑层 (Motia Event Steps)                │   │
│  │                                                       │   │
│  │  ┌────────────────┐  ┌────────────────┐            │   │
│  │  │ 项目管理       │  │ 规范管理       │            │   │
│  │  │ ProjectService │  │ SpecService    │            │   │
│  │  └────────────────┘  └────────────────┘            │   │
│  │  ┌────────────────┐  ┌────────────────┐            │   │
│  │  │ CI/CD 引擎     │  │ 流程监控       │            │   │
│  │  │ CICDEngine     │  │ MonitorService │            │   │
│  │  └────────────────┘  └────────────────┘            │   │
│  │  ┌────────────────┐  ┌────────────────┐            │   │
│  │  │ 通知服务       │  │ Webhook 接收   │            │   │
│  │  │ NotifyService │  │ WebhookService │            │   │
│  │  └────────────────┘  └────────────────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        智能能力层 (调用 MyAgent)                      │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  MyAgent Client (HTTP/WebSocket)            │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        数据持久层 (Prisma + PostgreSQL)             │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │   │
│  │  │ Projects │  │ Specs    │  │ Pipelines│         │   │
│  │  │ Tasks    │  │ Artifacts│  │ Reports  │         │   │
│  │  └──────────┘  └──────────┘  └──────────┘         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块设计

### 1. 项目管理模块

```typescript
// steps/api/projects-api.step.ts

import { EventStep } from '@motiadev/core';

export const config = {
  type: 'event',
  topic: 'api.projects.*',
};

export const handler = async (event, { logger, prisma }) => {
  const { action } = event.data;

  switch (action) {
    case 'list':
      return await listProjects(event.data);
    case 'get':
      return await getProject(event.data);
    case 'create':
      return await createProject(event.data);
    case 'update':
      return await updateProject(event.data);
    case 'delete':
      return await deleteProject(event.data);
    case 'link-spec':
      return await linkSpecToProject(event.data);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

async function listProjects({ userId, filters }) {
  const projects = await prisma.project.findMany({
    where: {
      userId,
      ...(filters.status && { status: filters.status }),
      ...(filters.teamId && { teamId: filters.teamId }),
    },
    include: {
      team: true,
      specs: {
        include: {
          spec: true,
        },
      },
      _count: {
        select: {
          tasks: true,
          pipelines: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  });

  return {
    success: true,
    projects,
  };
}

async function getProject({ projectId, userId }) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      userId,
    },
    include: {
      team: true,
      specs: {
        include: {
          spec: true,
        },
      },
      tasks: {
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
      },
      pipelines: {
        where: {
          status: {
            in: ['pending', 'running'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return {
    success: true,
    project,
  };
}

async function linkSpecToProject({ projectId, specId, userId }) {
  // 验证权限
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // 创建关联
  const link = await prisma.projectSpec.upsert({
    where: {
      projectId_specId: {
        projectId,
        specId,
      },
    },
    create: {
      projectId,
      specId,
    },
    update: {},
  });

  return {
    success: true,
    link,
  };
}
```

### 2. 规范管理模块

```typescript
// steps/api/specs-api.step.ts

export const config = {
  type: 'event',
  topic: 'api.specs.*',
};

export const handler = async (event, { logger, prisma }) => {
  const { action } = event.data;

  switch (action) {
    case 'list':
      return await listSpecs(event.data);
    case 'get':
      return await getSpec(event.data);
    case 'create':
      return await createSpec(event.data);
    case 'update':
      return await updateSpec(event.data);
    case 'delete':
      return await deleteSpec(event.data);
    case 'apply-to-project':
      return await applySpecToProject(event.data);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

async function createSpec({
  userId,
  teamId,
  name,
  description,
  type,
  content
}) {
  const spec = await prisma.spec.create({
    data: {
      userId,
      teamId,
      name,
      description,
      type, // 'markdown' | 'skills' | 'config'
      content,
      version: '1.0.0',
    },
  });

  // 触发规范创建事件
  await emit({
    topic: 'spec.created',
    data: { spec },
  });

  return {
    success: true,
    spec,
  };
}

async function applySpecToProject({ specId, projectId, userId }) {
  // 获取规范内容
  const spec = await prisma.spec.findFirst({
    where: { id: specId, userId },
  });

  if (!spec) {
    throw new Error('Spec not found');
  }

  // 获取项目
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // 生成规范应用任务
  const task = await prisma.task.create({
    data: {
      userId,
      sessionId: `spec-apply-${Date.now()}`,
      task: `应用规范 "${spec.name}" 到项目 "${project.name}"`,
      type: 'spec-apply',
      status: 'pending',
      metadata: {
        specId,
        projectId,
        specContent: spec.content,
        specType: spec.type,
      },
    },
  });

  // 触发任务执行
  await emit({
    topic: 'task.created',
    data: { taskId: task.id },
  });

  return {
    success: true,
    task,
  };
}
```

### 3. CI/CD 引擎模块

```typescript
// steps/cicd/engine.step.ts

export const config = {
  type: 'event',
  topic: 'cicd.trigger',
};

export const handler = async (event, { logger, emit, prisma }) => {
  const { taskId, sessionId, codeChanges, trigger } = event.data;

  logger.info({ taskId, trigger }, 'CI/CD triggered');

  try {
    // 创建流水线
    const pipeline = await prisma.pipeline.create({
      data: {
        taskId,
        sessionId,
        trigger,
        status: 'pending',
        stages: {
          create: [
            {
              name: 'git-commit',
              status: 'pending',
              order: 1,
            },
            {
              name: 'test',
              status: 'pending',
              order: 2,
            },
            {
              name: 'deploy-staging',
              status: 'pending',
              order: 3,
            },
            {
              name: 'integration-test',
              status: 'pending',
              order: 4,
            },
          ],
        },
      },
    });

    // 触发流水线执行
    await executePipeline(pipeline.id, { emit, prisma, logger });

    return {
      success: true,
      pipelineId: pipeline.id,
    };

  } catch (error) {
    logger.error({ error, taskId }, 'CI/CD trigger failed');
    throw error;
  }
});

async function executePipeline(pipelineId, { emit, prisma, logger }) {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      stages: {
        orderBy: { order: 'asc' },
      },
      task: true,
    },
  });

  if (!pipeline) {
    throw new Error('Pipeline not found');
  }

  // 更新状态为运行中
  await prisma.pipeline.update({
    where: { id: pipelineId },
    data: { status: 'running' },
  });

  // 发送更新
  await emit({
    topic: 'pipeline.updated',
    data: {
      pipelineId,
      status: 'running',
      stage: null,
    },
  });

  // 执行各个阶段
  for (const stage of pipeline.stages) {
    try {
      // 更新阶段状态
      await prisma.pipelineStage.update({
        where: { id: stage.id },
        data: { status: 'running' },
      });

      await emit({
        topic: 'pipeline.stage.updated',
        data: {
          pipelineId,
          stageId: stage.id,
          stageName: stage.name,
          status: 'running',
        },
      });

      // 执行阶段
      const result = await executeStage(stage.name, pipeline, { prisma, logger });

      // 更新阶段状态
      await prisma.pipelineStage.update({
        where: { id: stage.id },
        data: {
          status: result.success ? 'completed' : 'failed',
          result: result.data,
        },
      });

      await emit({
        topic: 'pipeline.stage.updated',
        data: {
          pipelineId,
          stageId: stage.id,
          stageName: stage.name,
          status: result.success ? 'completed' : 'failed',
          result: result.data,
        },
      });

      // 如果阶段失败，停止流水线
      if (!result.success) {
        await prisma.pipeline.update({
          where: { id: pipelineId },
          data: { status: 'failed' },
        });

        await emit({
          topic: 'pipeline.updated',
          data: {
            pipelineId,
            status: 'failed',
            failedStage: stage.name,
          },
        });

        return;
      }

    } catch (error) {
      logger.error({ error, stage: stage.name }, 'Stage execution failed');

      await prisma.pipelineStage.update({
        where: { id: stage.id },
        data: { status: 'failed' },
      });

      await prisma.pipeline.update({
        where: { id: pipelineId },
        data: { status: 'failed' },
      });

      await emit({
        topic: 'pipeline.updated',
        data: {
          pipelineId,
          status: 'failed',
          failedStage: stage.name,
        },
      });

      return;
    }
  }

  // 所有阶段成功
  await prisma.pipeline.update({
    where: { id: pipelineId },
    data: { status: 'completed' },
  });

  await emit({
    topic: 'pipeline.updated',
    data: {
      pipelineId,
      status: 'completed',
    },
  });
}

async function executeStage(stageName, pipeline, { prisma, logger }) {
  switch (stageName) {
    case 'git-commit':
      return await executeGitCommit(pipeline, { prisma, logger });

    case 'test':
      return await executeTests(pipeline, { prisma, logger });

    case 'deploy-staging':
      return await executeDeployStaging(pipeline, { prisma, logger });

    case 'integration-test':
      return await executeIntegrationTests(pipeline, { prisma, logger });

    default:
      throw new Error(`Unknown stage: ${stageName}`);
  }
}

async function executeGitCommit(pipeline, { prisma, logger }) {
  const task = pipeline.task;

  // 获取任务的 artifacts
  const artifacts = await prisma.artifact.findMany({
    where: {
      taskId: task.id,
    },
  });

  logger.info({
    taskId: task.id,
    artifactsCount: artifacts.length
  }, 'Executing git commit');

  // TODO: 实际的 Git 操作
  // 1. 创建分支
  // 2. 应用变更
  // 3. 提交

  return {
    success: true,
    data: {
      branch: `agent/${task.id}`,
      commit: 'abc123',
      changesCount: artifacts.length,
    },
  };
}

async function executeTests(pipeline, { prisma, logger }) {
  // TODO: 运行测试
  logger.info({ pipelineId: pipeline.id }, 'Executing tests');

  // 模拟测试执行
  await new Promise(resolve => setTimeout(resolve, 5000));

  return {
    success: true,
    data: {
      total: 42,
      passed: 42,
      failed: 0,
      duration: 5000,
    },
  };
}

async function executeDeployStaging(pipeline, { prisma, logger }) {
  // TODO: 部署到 staging
  logger.info({ pipelineId: pipeline.id }, 'Deploying to staging');

  // 模拟部署
  await new Promise(resolve => setTimeout(resolve, 10000));

  return {
    success: true,
    data: {
      url: `https://staging-${pipeline.id}.myrd.example.com`,
      status: 'deployed',
    },
  };
}

async function executeIntegrationTests(pipeline, { prisma, logger }) {
  // TODO: 运行集成测试
  logger.info({ pipelineId: pipeline.id }, 'Executing integration tests');

  const deployStage = pipeline.stages.find(s => s.name === 'deploy-staging');
  const stagingUrl = deployStage?.result?.url;

  if (!stagingUrl) {
    throw new Error('Staging URL not found');
  }

  // 模拟集成测试
  await new Promise(resolve => setTimeout(resolve, 8000));

  return {
    success: true,
    data: {
      smoke: true,
      api: true,
      e2e: true,
      duration: 8000,
    },
  };
}
```

### 4. Webhook 接收模块

```typescript
// steps/webhooks/receiver.step.ts

export const config = {
  type: 'event',
  topic: 'webhook.received',
};

export const handler = async (event, { logger, emit, prisma }) => {
  const { type, payload } = event.data;

  logger.info({ type }, 'Webhook received');

  switch (type) {
    case 'task.completed':
      return await handleTaskCompleted(payload, { emit, prisma, logger });

    case 'task.failed':
      return await handleTaskFailed(payload, { emit, prisma, logger });

    default:
      logger.warn({ type }, 'Unknown webhook type');
  }
};

async function handleTaskCompleted(payload, { emit, prisma, logger }) {
  const { taskId, sessionId, result, metadata, codeChanges } = payload;

  logger.info({ taskId }, 'Task completed, triggering CI/CD');

  // 更新任务状态
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'completed',
      result,
      completedAt: new Date(),
      metadata: {
        llmCalls: metadata.llmCalls,
        skillCalls: metadata.skillCalls,
        totalTokens: metadata.totalTokens,
      },
    },
  });

  // 触发 CI/CD
  if (codeChanges && codeChanges.length > 0) {
    await emit({
      topic: 'cicd.trigger',
      data: {
        taskId,
        sessionId,
        codeChanges,
        trigger: 'agent-completed',
      },
    });
  }

  return {
    success: true,
    message: 'CI/CD triggered',
  };
}
```

### 5. 实时监控模块

```typescript
// steps/api/monitoring-api.step.ts

export const config = {
  type: 'event',
  topic: 'api.monitoring.*',
};

export const handler = async (event, { logger, prisma }) => {
  const { action } = event.data;

  switch (action) {
    case 'get-dashboard':
      return await getDashboard(event.data);
    case 'get-active-pipelines':
      return await getActivePipelines(event.data);
    case 'get-pipeline-details':
      return await getPipelineDetails(event.data);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

async function getDashboard({ userId }) {
  // 获取用户的项目统计
  const projects = await prisma.project.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          tasks: true,
          pipelines: true,
        },
      },
    },
  });

  // 获取运行中的流水线
  const activePipelines = await prisma.pipeline.findMany({
    where: {
      status: {
        in: ['pending', 'running'],
      },
      include: {
        task: {
          select: {
            id: true,
            task: true,
          },
        },
        stages: {
          where: {
            status: {
              in: ['pending', 'running'],
            },
          },
        },
      },
    },

    // 只返回该用户相关项目
    task: {
      project: {
        userId,
      },
    },
  });

  // 获取最近的任务
  const recentTasks = await prisma.task.findMany({
    where: {
      project: {
        userId,
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  // 统计数据
  const stats = {
    totalProjects: projects.length,
    activePipelines: activePipelines.length,
    completedTasksToday: await prisma.task.count({
      where: {
        project: { userId },
        status: 'completed',
        completedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
  };

  return {
    success: true,
    dashboard: {
      stats,
      projects,
      activePipelines,
      recentTasks,
    },
  };
}

async function getActivePipelines({ userId }) {
  const pipelines = await prisma.pipeline.findMany({
    where: {
      status: {
        in: ['pending', 'running'],
      },
      task: {
        project: {
          userId,
        },
      },
    },
    include: {
      task: {
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      stages: {
        orderBy: { order: 'asc' },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return {
    success: true,
    pipelines,
  };
}

async function getPipelineDetails({ pipelineId, userId }) {
  const pipeline = await prisma.pipeline.findFirst({
    where: {
      id: pipelineId,
      task: {
        project: {
          userId,
        },
      },
    },
    include: {
      task: {
        include: {
          project: true,
        },
      },
      stages: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!pipeline) {
    throw new Error('Pipeline not found');
  }

  return {
    success: true,
    pipeline,
  };
}
```

## 数据模型设计

```prisma
// prisma/schema.prisma

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  projects      Project[]
  specs         Spec[]
  tasks         Task[]
}

model Team {
  id            String    @id @default(cuid())
  name          String
  description   String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  projects      Project[]
  specs         Spec[]
}

model Project {
  id            String    @id @default(cuid())
  name          String
  description   String?
  type          String    // react, vue, python, nodejs
  status        String    @default("active") // active, archived
  userId        String
  teamId        String?

  user          User        @relation(fields: [userId], references: [id])
  team          Team?       @relation(fields: [teamId], references: [id])

  specs         ProjectSpec[]
  tasks         Task[]
  pipelines     Pipeline[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Spec {
  id            String    @id @default(cuid())
  name          String
  description   String?
  type          String    // markdown, skills, config
  content       Json      // 规范内容
  version       String    @default("1.0.0")
  userId        String
  teamId        String?

  user          User        @relation(fields: [userId], references: [id])
  team          Team?       @relation(fields: [teamId], references: [id])

  projects      ProjectSpec[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model ProjectSpec {
  id            String    @id @default(cuid())
  projectId     String
  specId        String
  isActive      Boolean   @default(true)

  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  spec          Spec      @relation(fields: [specId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())

  @@unique([projectId, specId])
}

model Task {
  id            String    @id @default(cuid())
  sessionId     String
  task          String
  type          String    @default("general")
  status        String    @default("pending") // pending, running, completed, failed
  result        Json?
  metadata      Json?

  projectId     String?
  userId        String

  project       Project?  @relation(fields: [projectId], references: [id])
  user          User      @relation(fields: [userId], references: [id])

  artifacts     Artifact[]
  pipelines     Pipeline[]

  createdAt     DateTime  @default(now())
  completedAt   DateTime?
}

model Artifact {
  id            String    @id @default(cuid())
  taskId        String
  type          String    // file, code, image, etc.
  path          String?
  content       Json
  metadata      Json?

  task          Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)

  createdAt     DateTime  @default(now())
}

model Pipeline {
  id            String    @id @default(cuid())
  taskId        String
  sessionId     String
  trigger       String    // agent-completed, manual, webhook
  status        String    @default("pending") // pending, running, completed, failed

  task          Task      @relation(fields: [taskId], references: [id])

  stages        PipelineStage[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model PipelineStage {
  id            String    @id @default(cuid())
  pipelineId    String
  name          String    // git-commit, test, deploy-staging, integration-test
  order         Int
  status        String    @default("pending") // pending, running, completed, failed
  result        Json?

  pipeline      Pipeline  @relation(fields: [pipelineId], references: [id], onDelete: Cascade)

  startedAt     DateTime?
  completedAt   DateTime?

  @@unique([pipelineId, order])
}
```

## Web 控制台 UI 设计

### Dashboard 页面

```
┌─────────────────────────────────────────────────────────────┐
│  MyRD 控制台                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📊 概览                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ 项目总数  │  │ 运行中    │  │ 今日完成  │                   │
│  │    12    │  │    3     │  │    28    │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
│                                                               │
│  🔄 运行中的流水线                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ #1234 - 实现用户登录功能                              │    │
│  │ 状态: 运行中                                           │    │
│  │ 进度: [████████░░] 75%                                │    │
│  │ 当前阶段: deploy-staging                              │    │
│  │ 开始时间: 10分钟前                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ #1235 - 修复 API bug                                  │    │
│  │ 状态: 测试中                                           │    │
│  │ 进度: [██████████] 100%                              │    │
│  │ 当前阶段: test                                        │    │
│  │ 开始时间: 5分钟前                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  📁 我的项目                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ my-awesome-app (React)                   [查看详情]   │    │
│  │ 规范: React 最佳实践, TypeScript 规范                      │
│  │ 最近任务: #1234 实现用户登录                           │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ backend-api (Python)                       [查看详情]   │    │
│  │ 规范: Python PEP8, FastAPI 最佳实践                     │
│  │ 最近任务: #1236 添加用户认证                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  📜 规范库                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ React 最佳实践                        [编辑] [应用]   │    │
│  │ 类型: markdown                                       │    │
│  │ 使用项目: 3                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ TypeScript 规范                       [编辑] [应用]   │    │
│  │ 类型: skills                                          │    │
│  │ 使用项目: 5                                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 流水线详情页

```
┌─────────────────────────────────────────────────────────────┐
│  流水线 #1234 详情                                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  状态: ✅ 完成                                               │
│  触发: Agent 完成                                           │
│  开始时间: 2026-03-15 10:30:00                              │
│  完成时间: 2026-03-15 10:35:23                              │
│  总耗时: 5分23秒                                              │
│                                                               │
│  阶段详情                                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. Git 提交                       ✅ 30秒          │    │
│  │    分支: agent/1234                                   │    │
│  │    提交: abc1234                                       │    │
│  │    变更: 12 个文件                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 2. 测试运行                       ✅ 2分15秒       │    │
│  │    单元测试: 42 passed                                │    │
│  │    覆盖率: 85%                                         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 3. 部署到 Staging                 ✅ 1分45秒       │    │
│  │    URL: https://staging-1234.myrd.example.com       │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 4. 集成测试                       ✅ 53秒          │    │
│  │    冒烟测试: ✅                                       │    │
│  │    API 测试: ✅                                       │    │
│  │    E2E 测试: ✅                                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  [查看日志] [重新部署] [创建 PR]                              │
└─────────────────────────────────────────────────────────────┘
```

## 技术栈

### 后端框架
- **Motia**: 事件驱动框架
- **Fastify**: HTTP 服务器
- **Socket.IO**: WebSocket 实时通信
- **Prisma**: ORM
- **PostgreSQL**: 数据库

### 前端技术（未来）
- **Next.js**: Web 框架
- **React**: UI 框架
- **Socket.IO Client**: 实时通信
- **Tailwind CSS**: 样式

## 实现路线图

### Week 1-2: 基础框架
- [ ] Motia 项目初始化
- [ ] 数据模型设计和迁移
- [ ] 基础 API 步骤
- [ ] WebSocket 集成

### Week 3-4: 核心功能
- [ ] 项目管理 API
- [ ] 规范管理 API
- [ ] Webhook 接收
- [ ] CI/CD 引擎（基础）

### Week 5-6: 完善
- [ ] CI/CD 引擎（完整）
- [ ] 监控 Dashboard
- [ ] 实时状态推送
- [ ] 错误处理和重试

### Week 7-8: UI（可选）
- [ ] Web 控制台基础
- [ ] Dashboard 页面
- [ ] 项目管理页面
- [ ] 流水线详情页面

## 相关文档

- [MyAgent Hook 系统](./task-hook-system.md)
- [Happy Engineering 参考](https://github.com/slopus/happy)
- [Motia 框架文档](https://github.com/motiadev/motia)
