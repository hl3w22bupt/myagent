# Skill Self-Evolution System - State Machine

## Complete Task Status Flow Diagram

```mermaid
flowchart TD
    Start([用户提交任务]) --> PENDING[pending<br/>待处理]

    PENDING --> RUNNING[running<br/>执行中]

    RUNNING --> RunningLogic{running 状态内部逻辑}

    subgraph RunningInternal["Running 状态内部逻辑（非状态机）"]
        RunningLogic --> Intent[意图识别 + 复杂度判断]
        Intent --> Complexity{复杂度判断}

        Complexity -->|低复杂度| SkillMatch1[技能匹配]
        Complexity -->|高复杂度| SkillMatch2[技能匹配]

        SkillMatch1 --> MatchResult1{有匹配技能?}
        SkillMatch2 --> MatchResult2{有匹配技能?}

        MatchResult1 -->|有| Execute1[执行任务]
        MatchResult1 -->|无但简单| Execute1[直接执行]

        MatchResult2 -->|有| Execute2[执行任务]
        MatchResult2 -->|无| NeedLearn[需要学习新技能]

        Execute1 --> Result{执行结果}
        Execute2 --> Result

        Result -->|成功| COMPLETED[completed<br/>完成]
        Result -->|失败| FAILED[failed<br/>失败]
    end

    NeedLearn --> LEARNING[learning<br/>学习中]

    subgraph EvolutionProcess["进化环境处理（异步）"]
        LEARNING --> EvolutionEngine{进化引擎}

        EvolutionEngine -->|Step 1| FindSkill[find-skill<br/>检索技能市场]
        FindSkill -->|找到| DOWNLOAD[下载并安装技能]
        FindSkill -->|未找到| CreateSkill[skill-creator<br/>创建新技能]

        DOWNLOAD --> VALIDATE[验证新技能]
        CreateSkill --> BENCHMARK[运行 benchmark<br/>评估技能质量]
        BENCHMARK --> ITERATE{评估通过?}
        ITERATE -->|否| IMPROVE[改进描述<br/>重新评估]
        IMPROVE BENCHMARK
        ITERATE -->|是| VALIDATE

        VALIDATE --> ValidateResult{验证成功?}
        ValidateResult -->|失败| FAILED
        ValidateResult -->|成功| BACK_TO_PENDING[改回 pending 状态]
    end

    subgraph EvalFlow["评估流程（异步，后台定时任务）"]
        COMPLETED --> EvalTrigger{触发评估?}
        FAILED --> EvalTrigger

        EvalTrigger -->|自动评估| EVAL[eval system<br/>评估任务质量]
        EvalTrigger -->|用户反馈| USER_FEEDBACK[用户反馈质量不好]

        EVAL --> Quality{质量达标?}
        USER_FEEDBACK --> EVAL

        Quality -->|达标| DONE([结束])
        Quality -->|不达标| RECORD[记录到后台<br/>等待优化]
        RECORD --> LEARNING
    end

    BACK_TO_PENDING --> PENDING
    PENDING -->|取任务处理| RUNNING

    classDef status fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef internal fill:#e8f5e9,stroke:#4caf50,stroke-dasharray: 5 5
    classDef evolution fill:#fff3e0,stroke:#ff9800
    classDef eval fill:#e3f2fd,stroke:#2196f3
    classDef endState fill:#ffebee,stroke:#f44336

    class PENDING,RUNNING,COMPLETED,FAILED,LEARNING status
    class RunningLogic,Intent,SkillMatch1,SkillMatch2,Execute1,Execute2,Result internal
    class FindSkill,CreateSkill,BENCHMARK,VALIDATE,BACK_TO_PENDING evolution
    class EVAL,RECORD,USER_FEEDBACK,Quality eval
    class DONE endState
```

## State Descriptions

### Current States (Existing)
| State | Description |
|-------|-------------|
| `pending` | 任务初始状态，等待处理 |
| `running` | 任务正在执行中 |
| `completed` | 任务成功完成 |
| `failed` | 任务执行失败 |
| `awaiting_clarification` | HITL 模式，等待用户澄清 |

### New States (Self-Evolution)
| State | Description |
|-------|-------------|
| `learning` | 任务等待系统学习如何处理（正在检索/创建技能）<br/>**重要**：此状态的任务不会被调度执行 |

### Running Internal Logic (非状态机状态)
| Logic | Description |
|-------|-------------|
| 意图识别 | 解析用户输入，识别任务意图 |
| 复杂度判断 | 评估任务复杂度（0-100分） |
| 技能匹配 | 在现有技能中查找匹配项 |
| 执行任务 | 使用匹配的技能或通用方案执行 |

## Flow Descriptions

### Normal Flow (不需要学习新技能)
1. **提交**: 用户提交任务 → `pending`
2. **意图识别**: 判断任务复杂度
   - 低复杂度 → 技能匹配
   - 高复杂度但有匹配技能 → 技能匹配
3. **技能匹配**: 查找现有技能
   - 找到匹配 → `ready_to_scheduled`
   - 无匹配但任务简单 → `direct_execution`
4. **调度执行**: `ready_to_scheduled` → `scheduled` → `running`
5. **完成**: `running` → `completed` / `failed`

### Self-Evolution Flow (需要学习新技能)
1. **触发条件**: 高复杂度 + 无匹配技能 → `learning`
2. **检索现有技能**: 调用 find-skill
   - skills.sh 市场
   - ClawHub (OpenClaw) 市场
3. **创建新技能** (如果未找到):
   - 调用 skill-creator
   - 运行 benchmark 评估
   - 迭代改进描述
4. **验证**: 测试新技能是否可用
5. **状态更新**: `learning` → `ready_to_scheduled`
6. **正常执行**: 进入 Normal Flow

### Eval Flow (异步评估)
1. **触发**: 任务完成后
   - 自动评估触发
   - 或用户主动反馈
2. **评估**: 运行 eval system
   - Pass Rate, Time, Tokens, Tool Calls, Errors
3. **决策**:
   - 质量达标 → 结束
   - 质量不达标 → 记录到后台，触发 `learning`

## Configuration

### 环境变量配置

```bash
# 生产环境 (.env.production)
ENABLE_EVOLUTION=false

# 开发环境 (.env.development)
ENABLE_EVOLUTION=true
```

### Motia 配置文件

```typescript
// motia.config.ts
interface MotiaConfig {
  evolution: EvolutionConfig;
}

interface EvolutionConfig {
  // 总开关
  enabled: boolean;

  // 复杂度阈值
  complexity: {
    threshold: number; // 0-100, 超过此值视为高复杂度
    enableLearning: boolean; // 是否启用自我进化
  };

  // 技能市场
  marketplaces: {
    skillsSh: {
      enabled: boolean;
      apiEndpoint: string;
    };
    clawHub: {
      enabled: boolean;
      apiEndpoint: string;
    };
  };

  // 评估配置
  evaluation: {
    autoTrigger: boolean; // 任务完成后自动评估
    qualityThreshold: number; // 质量阈值 (0-1)
  };

  // 进化轮询配置
  polling: {
    interval: string; // Cron 表达式，默认 '*/1 * * * *' (每分钟)
    batchSize: number; // 每次处理任务数量，默认 10
  };

  // Git 同步配置
  gitSync: {
    enabled: boolean; // 是否启用 Git 同步
    repoPath: string; // Git 仓库路径
    autoCommit: boolean; // 自动提交
    commitMessage: string; // 提交信息模板
  };
}

// 默认配置
const defaultEvolutionConfig: EvolutionConfig = {
  enabled: false, // 默认关闭
  complexity: {
    threshold: 70, // 复杂度超过 70 视为高复杂度
    enableLearning: true,
  },
  marketplaces: {
    skillsSh: {
      enabled: true,
      apiEndpoint: 'https://skills.sh/api',
    },
    clawHub: {
      enabled: true,
      apiEndpoint: 'https://clawhub.ai/api',
    },
  },
  evaluation: {
    autoTrigger: true,
    qualityThreshold: 0.7,
  },
  polling: {
    interval: '*/1 * * * *',
    batchSize: 10,
  },
  gitSync: {
    enabled: true,
    repoPath: process.cwd(),
    autoCommit: true,
    commitMessage: 'feat: auto-evolved skill ${skillName}',
  },
};
```

### 条件加载实现

```typescript
// steps/cron/evolution-polling.step.ts
export const evolutionPollingStep = {
  type: 'cron' as const,
  name: 'evolution-polling',
  cron: '*/1 * * * *',  // 每分钟执行
  config: {
    enabled: (context: MotiaContext) => {
      // 检查配置开关
      const config = context.app.config.evolution;
      return config?.enabled === true;
    }
  },
  async handle(context: MotiaContext) {
    // 只在进化开启时执行
    const config = context.app.config.evolution;

    context.app.logger.info('[EvolutionPolling] Checking for learning tasks');

    const learningTasks = await context.app.db.query(
      `SELECT * FROM tasks
       WHERE status = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      ['learning', config.polling.batchSize]
    );

    context.app.logger.info(`[EvolutionPolling] Found ${learningTasks.length} learning tasks`);

    for (const task of learningTasks) {
      await processEvolution(task, context);
    }
  }
};
```

## Database Schema Changes

### tasks table - 新增字段
```sql
ALTER TABLE tasks ADD COLUMN complexity_score INTEGER;
ALTER TABLE tasks ADD COLUMN evolution_metadata JSONB;
ALTER TABLE tasks ADD COLUMN learning_reason TEXT;
ALTER TABLE tasks ADD COLUMN ready_at TIMESTAMP;
```

### skill_evolution_log - 新表
```sql
CREATE TABLE skill_evolution_log (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  evolution_type TEXT, -- 'find_skill', 'create_skill', 'improve_existing'
  marketplace TEXT, -- 'skills.sh', 'clawhub', 'local'
  skill_name TEXT,
  old_description TEXT,
  new_description TEXT,
  benchmark_results JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### task_evaluation_log - 新表
```sql
CREATE TABLE task_evaluation_log (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  pass_rate FLOAT,
  time_seconds FLOAT,
  tokens INTEGER,
  tool_calls INTEGER,
  errors INTEGER,
  quality_score FLOAT,
  evaluation_timestamp TIMESTAMP DEFAULT NOW(),
  notes JSONB
);
```

---

## Deployment Strategy

### 方案 A：单实例 + 配置开关 ✅ 已采用

**核心思想**：
- 部署单个 myagent 实例
- 通过 `ENABLE_EVOLUTION` 环境变量控制是否启用进化功能
- 生产环境关闭，开发环境打开

**部署架构**：

```mermaid
graph TB
    subgraph Production["生产环境 (ENABLE_EVOLUTION=false)"]
        ProdAPI[API Server]
        ProdTask[Task Worker]
        ProdDB[(PostgreSQL DB)]
    end

    subgraph Development["开发环境 (ENABLE_EVOLUTION=true)"]
        DevAPI[API Server]
        DevTask[Task Worker]
        DevEvolution[Evolution Worker<br/>定时轮询]
        DevDB[(PostgreSQL DB)<br/>共享或独立]
    end

    ProdTask --> ProdDB
    ProdAPI --> ProdDB

    DevTask --> DevDB
    DevAPI --> DevDB
    DevEvolution --> DevDB

    DevEvolution -.->|Git push| SkillsGit[Git Repository<br/>skills/]
    SkillsGit -.->|Git pull| ProdTask

    classDef prod fill:#ffebee,stroke:#f44336
    classDef dev fill:#e8f5e9,stroke:#4caf50
    classDef shared fill:#e3f2fd,stroke:#2196f3

    class ProdAPI,ProdTask prod
    class DevAPI,DevTask,DevEvolution dev
    class ProdDB,DevDB,SkillsGit shared
```

**环境配置**：

```bash
# ============================================
# 生产环境部署
# ============================================

# .env.production
ENABLE_EVOLUTION=false
DATABASE_URL=postgresql://user:pass@prod-db:5432/myagent
EVOLUTION_POLLING_INTERVAL=disabled
EVOLUTION_GIT_SYNC=false

# 启动命令
npm run start:prod
# 或
ENABLE_EVOLUTION=false motia start
```

```bash
# ============================================
# 开发环境部署
# ============================================

# .env.development
ENABLE_EVOLUTION=true
DATABASE_URL=postgresql://user:pass@dev-db:5432/myagent
EVOLUTION_POLLING_INTERVAL=*/1 * * * *
EVOLUTION_GIT_SYNC=true
EVOLUTION_MARKETPLACE_SKILLS_SH=true
EVOLUTION_MARKETPLACE_CLAWHUB=true

# 启动命令
npm run start:dev
# 或
ENABLE_EVOLUTION=true motia start
```

**启动脚本**：

```json
// package.json
{
  "scripts": {
    "start": "motia start",
    "start:prod": "ENABLE_EVOLUTION=false motia start",
    "start:dev": "ENABLE_EVOLUTION=true motia start",
    "start:evolution-only": "ENABLE_EVOLUTION=true motia start --cron-only"
  }
}
```

**工作模式对比**：

| 特性 | 生产环境 | 开发环境 |
|------|---------|---------|
| API Server | ✅ 运行 | ✅ 运行 |
| Task Worker | ✅ 运行 | ✅ 运行 |
| Evolution Worker | ❌ 不启动 | ✅ 启动（定时轮询） |
| 任务状态 learning | 可能发生 | 可能发生 |
| 自动处理 learning | ❌ 不处理 | ✅ 自动处理 |
| Git 同步新技能 | ❌ 不执行 | ✅ 自动执行 |
| 资源消耗 | 低 | 中 |
| 稳定性 | 高 | 中 |

**Git 同步流程**：

```bash
# 开发环境：进化环境创建新技能后
cd /path/to/myagent
git add skills/new-skill
git commit -m "feat: auto-evolved skill new-skill"
git push origin main

# 生产环境：通过 Webhook 或定时拉取
# 方案 1: Webhook (推荐)
# GitHub/GitLab push → Webhook → 触发 git pull

# 方案 2: 定时拉取
# 每分钟执行：git pull origin main
```

**优点**：
- ✅ 部署简单，只需一个实例
- ✅ 通过配置控制，易于切换
- ✅ 开发环境可以测试完整流程
- ✅ 生产环境关闭进化，节省资源
- ✅ 生产环境稳定性高（不受进化逻辑影响）

**注意事项**：
1. **数据库共享 vs 独立**：
   - 开发初期可以用共享数据库测试
   - 生产建议使用独立数据库
2. **Git 同步方向**：
   - 进化（开发环境）→ 生产
   - 单向流动，避免生产覆盖开发
3. **技能热加载**：
   - Git pull 后需要重启才能加载新技能
   - 未来可以支持动态加载（方案 C）
4. **监控和日志**：
   - 生产环境关闭进化，但仍需监控 learning 状态任务
   - 如果发现 learning 任务积累，需要人工介入

**故障处理**：

```typescript
// 生产环境：发现 learning 状态任务
const learningTasks = await db.query(
  "SELECT COUNT(*) FROM tasks WHERE status = 'learning'"
);

if (learningTasks.count > 0) {
  // 发送告警
  alerting.send({
    level: 'warning',
    message: `Found ${learningTasks.count} tasks in learning state. Evolution is disabled in production.`,
    action: 'Please enable evolution in dev environment or manually create skills'
  });
}
```

---

## Implementation Plan

### Phase 1: 基础设施 (1-2周)

**目标**：实现基本的自我进化流程

**任务清单**：

- [ ] **1.1 数据库 Schema**
  - [ ] 添加 `learning` 状态到 `TaskStatus` 枚举
  - [ ] 创建 `skill_evolution_log` 表
  - [ ] 创建 `task_evaluation_log` 表
  - [ ] 添加任务字段：`complexity_score`, `evolution_metadata`

- [ ] **1.2 意图识别 + 复杂度判断**
  - [ ] 修改意图识别逻辑，同时输出复杂度评分
  - [ ] 添加配置开关控制是否启用学习
  - [ ] 高复杂度 + 无匹配技能 → 状态改为 `learning`

- [ ] **1.3 find-skill 基础技能**
  - [ ] 创建 `find-skill` 技能
  - [ ] 实现 skills.sh API 集成
  - [ ] 实现技能匹配逻辑

- [ ] **1.4 skill-creator 集成**
  - [ ] 集成已有的 `skill-creator` 技能
  - [ ] 实现自动创建技能流程
  - [ ] 运行 benchmark 验证

- [ ] **1.5 进化轮询 Worker**
  - [ ] 创建 `evolution-polling.step.ts`
  - [ ] 实现条件加载（`enabled` 配置）
  - [ ] 定时查询 `learning` 状态任务
  - [ ] 调用 find-skill 或 skill-creator

- [ ] **1.6 Git 同步脚本**
  - [ ] 自动 git add 新技能
  - [ ] 自动 commit 和 push
  - [ ] 错误处理和重试

### Phase 2: 自动化与监控 (+1-2周)

**目标**：实现自动化同步和监控

**任务清单**：

- [ ] **2.1 Webhook 服务**
  - [ ] 接收 Git push 通知
  - [ ] 触发生产环境 git pull
  - [ ] 技能热加载（如果支持）

- [ ] **2.2 find-skill 扩展**
  - [ ] 添加 ClawHub 支持
  - [ ] 实现向量搜索
  - [ ] 支持多个市场同时搜索

- [ ] **2.3 监控 Dashboard**
  - [ ] 进化任务统计
  - [ ] 技能创建成功率
  - [ ] 平均耗时

- [ ] **2.4 告警系统**
  - [ ] learning 任务积累告警
  - [ ] 进化失败告警
  - [ ] Git 同步失败告警

### Phase 3: 完整 Eval 体系 (+2-4周)

**目标**：实现完整的评估和优化闭环

**任务清单**：

- [ ] **3.1 任务完成评估**
  - [ ] 集成 skill-creator 的 eval 体系
  - [ ] 自动评估任务质量
  - [ ] 支持 Pass Rate, Time, Tokens, Tool Calls, Errors

- [ ] **3.2 异步评估队列**
  - [ ] 创建评估定时任务
  - [ ] 批量处理已完成的任务
  - [ ] 质量不达标 → 触发 learning

- [ ] **3.3 数据库技能存储** (可选)
  - [ ] 修改技能加载逻辑
  - [ ] 支持从数据库加载技能
  - [ ] 实现动态加载（无需重启）

- [ ] **3.4 LISTEN/NOTIFY 优化** (可选)
  - [ ] 替代轮询，使用 PostgreSQL 原生通知
  - [ ] 实时触发进化处理

---

## Migration Path

### 从当前系统到自我进化系统

**Step 1: 数据库迁移**
```sql
-- 添加新状态
ALTER TYPE task_status ADD VALUE 'learning' AFTER 'pending';

-- 添加新字段
ALTER TABLE tasks ADD COLUMN complexity_score INTEGER;
ALTER TABLE tasks ADD COLUMN evolution_metadata JSONB;
ALTER TABLE tasks ADD COLUMN learning_reason TEXT;

-- 创建新表
CREATE TABLE skill_evolution_log (...);
CREATE TABLE task_evaluation_log (...);
```

**Step 2: 代码迁移**
```typescript
// 更新状态枚举
export enum TaskStatus {
  PENDING = 'pending',
  LEARNING = 'learning',  // 新增
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  AWAITING_CLARIFICATION = 'awaiting_clarification',
}
```

**Step 3: 配置迁移**
```bash
# 添加环境变量
echo "ENABLE_EVOLUTION=false" >> .env.production
echo "ENABLE_EVOLUTION=true" >> .env.development
```

**Step 4: 部署**
```bash
# 生产环境
git pull
npm install
npm run migrate
npm run start:prod

# 开发环境
git pull
npm install
npm run migrate
npm run start:dev
```

---

## Testing Strategy

### 单元测试
- [ ] 复杂度判断逻辑
- [ ] 技能匹配算法
- [ ] find-skill API 集成
- [ ] Git 同步脚本

### 集成测试
- [ ] 完整的进化流程
- [ ] 多任务并发进化
- [ ] Git 同步和加载

### E2E 测试
- [ ] 提交高复杂度任务 → learning → 创建技能 → pending → completed
- [ ] 任务质量评估 → 不达标 → learning → 创建优化技能

---

## Future Enhancements

### 短期 (3个月内)
- 支持更多技能市场
- 改进复杂度判断算法
- 添加 A/B 测试（新技能 vs 旧技能）

### 长期 (6个月+)
- 技能数据库存储
- 动态技能加载
- 多模型协作（不同任务用不同模型）
- 跨项目技能共享
