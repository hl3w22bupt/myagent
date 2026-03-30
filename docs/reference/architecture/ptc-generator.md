# PTC Generator 详解

> Programmatic Tool Calling 代码生成器

**阅读时间**: 10 分钟 | **难度**: ⭐⭐⭐ advanced

---

## 🎯 PTC Generator 是什么？

**PTC (Programmatic Tool Calling)** 是 MyAgent 的**代码生成引擎**，自动生成调用技能的 Python 代码。

### 核心能力

- ✅ **两步生成**: Planning（选择技能）+ Implementation（生成代码）
- ✅ **技能匹配**: 自动选择最相关的技能
- ✅ **代码生成**: 生成符合规范的 Python 代码
- ✅ **上下文感知**: 根据对话历史和失败经验生成代码

---

## 🏗️ 两步生成机制

### Step 1: Planning（技能选择）

**目标**: 为任务选择最合适的技能

**流程**:
```
任务描述 → LLM 分析
           ↓
      技能列表
           ↓
    匹配相关技能
           ↓
    按置信度排序
           ↓
    选择 Top-K 技能
```

**代码示例**:
```typescript
// PTC Generator 内部
async planSkills(task: string, options?: PTCGenerationOptions) {
  // 1. 获取所有可用技能
  const availableSkills = Array.from(this.skills.values());

  // 2. LLM 分析任务，匹配技能
  const prompt = `
任务: ${task}

可用技能:
${availableSkills.map(s => `- ${s.name}: ${s.description}`).join('\n')}

请选择最相关的技能（最多 3 个）
  `;

  const response = await this.llm.generate(prompt);

  // 3. 解析选择结果
  const selectedSkills = this.parseSkillSelection(response);

  return {
    selectedSkills,
    confidence: 0.8
  };
}
```

---

### Step 2: Implementation（代码生成）

**目标**: 生成调用所选技能的 Python 代码

**流程**:
```
任务 + 选定的技能
         ↓
    构建生成 Prompt
         ↓
    LLM 生成代码
         ↓
    代码验证
         ↓
    返回 PTC 代码
```

**生成的代码示例**:
```python
# Agent 自动生成的代码

def execute_task():
    # 获取任务输入
    task = get_user_input()

    # 调用 code-analysis 技能
    analysis_result = await executor.execute('code-analysis', {
        'task': task,
        'language': 'python'
    })

    # 提取分析结果
    score = analysis_result.get('data', {}).get('score', 0)

    # 调用第二个技能
    suggestions = await executor.execute('code-analysis', {
        'task': task,
        'language': 'python',
        'checks': ['suggestions']
    })

    # 返回结果
    return {
        'analysis': analysis_result,
        'score': score,
        'suggestions': suggestions
    }
```

---

## 🎯 技能匹配策略

### 1. 语义匹配

**原理**: LLM 理解任务和技能描述的语义相似度

**示例**:
```
任务: "分析这段 Python 代码的质量"

技能匹配结果:
- code-analysis (置信度: 0.95) ✅
- data-analyst (置信度: 0.3)
- security-auditor (置信度: 0.7)
```

---

### 2. 标签匹配

**原理**: 通过技能的 tags 字段匹配

**技能定义**:
```yaml
# skills/code-analysis/skill.yaml
tags: [code, analysis, quality]
```

**匹配规则**:
```typescript
// 如果任务包含 "代码" 或 "质量"
if (task.includes('代码') || task.includes('质量')) {
  return 'code-analysis';
}
```

---

### 3. 置信度阈值

**配置**:
```typescript
const confidenceThreshold = 0.6;

// 只选择置信度 > 0.6 的技能
const selectedSkills = skills
  .filter(skill => skill.confidence > confidenceThreshold);
```

---

## 📝 生成模板

### 基础模板

```python
# PTC 生成器使用的模板

def execute_task():
    """
    执行任务：{task}

    可用技能：
    {skill_list}
    """

    # Step 1: 理解任务
    task_input = get_user_input()

    # Step 2: 调用技能
    {skill_calls}

    # Step 3: 返回结果
    return result
```

### 高级模板（多技能链）

```python
def execute_task():
    """
    多技能协作模板
    """

    # 技能 1
    result1 = await executor.execute('{skill1}', {
        'task': '{task_param1}',
        'input1': get_variable('$var1')
    })

    # 提取中间结果
    intermediate = result1.get('data', {})

    # 技能 2（使用技能 1 的输出）
    result2 = await executor.execute('{skill2}', {
        'input2': intermediate
    })

    return result2
```

---

## 🔧 配置和调优

### PTC Generator 配置

```typescript
// config/ptc-generator.config.yaml
ptc_generator:
  # 技能选择配置
  selection:
    max_skills: 3              # 最多选择 3 个技能
    confidence_threshold: 0.6  # 置信度阈值

  # 代码生成配置
  generation:
    max_iterations: 5         # 最大生成迭代次数
    timeout: 30000            # 生成超时时间

  # 模板配置
  template:
    enable_multi_skill: true  # 启用多技能链
    include_comments: true     # 包含注释
    include_error_handling: true  # 包含错误处理
```

---

## 💡 生成示例

### 示例 1: 单技能任务

**任务**: "分析这段代码的质量"

**生成的代码**:
```python
def execute_task():
    # 获取代码
    code = get_user_input()

    # 调用 code-analysis
    result = await executor.execute('code-analysis', {
        'code': code,
        'language': 'python',
        'checks': ['quality', 'security']
    })

    return result
```

---

### 示例 2: 多技能协作

**任务**: "审查这个 PR 的代码质量和安全性"

**Planning 阶段**:
```
LLM 选择:
1. code-reviewer (置信度: 0.9)
2. security-auditor (置信度: 0.85)
```

**Implementation 阶段**:
```python
def execute_task():
    # 获取代码
    code = get_user_input()

    # Step 1: 代码审查
    review = await executor.execute('code-analysis', {
        'task': '审查代码质量和安全性',
        'code': code,
        'checks': ['quality', 'security', 'maintainability']
    })

    # Step 2: 安全审计
    security = await executor.execute('security-auditor', {
        'task': '安全漏洞扫描',
        'code': code
    })

    # 整合结果
    return {
        'review': review,
        'security': security
    }
```

---

## 🚨 生成失败处理

### 常见失败情况

#### 1. 技能匹配失败

```
问题: 没有匹配到相关技能（置信度都低于阈值）

解决方案:
- 使用默认技能
- 提示用户提供更多信息
- 降级到通用 LLM 处理
```

#### 2. 代码生成失败

```
问题: LLM 生成的代码语法错误

解决方案:
- 重试生成（最多 3 次）
- 降级到纯 LLM 处理
- 记录失败经验（供 Context Engineering 使用）
```

---

## 🎓 从失败中学习

### 失败经验系统

```typescript
// 技能执行失败
try {
  await execute('code-analysis', {...});
} catch (error) {
  // 提取失败信息
  const failure = {
    skillName: 'code-analysis',
    scenario: '处理大型文件时超时',
    error: error.message,
    solution: '使用流式处理或增加超时时间',
    frequency: 1,
    lastOccurred: new Date()
  };

  // 存储到数据库
  await database.saveFailureExperience(failure);
}
```

### 下次生成时避免错误

```typescript
// PTC Generator 在生成代码前
const relevantFailures = await getRelevantFailures('code-analysis');

// 在 Prompt 中包含失败经验
const prompt = `
任务: ${task}

相关历史经验:
${relevantFailures.map(f => `- ${f.scenario}: ${f.solution}`).join('\n')}

请生成代码，避免遇到上述问题。
`;
```

---

## 🔍 调试 PTC 生成

### 查看生成的代码

```bash
# 查询任务的上下文
curl http://localhost:3000/api/contexts/{taskId}

# 响应包含 PTC 代码
```

### 启用详细日志

```typescript
// 在 Agent 配置中
{
  "logging": {
    "level": "debug",
    "includePTCCode": true
  }
}
```

---

## 📈 性能优化

### 1. 技能选择缓存

```typescript
// 缓存技能选择结果
const planCache = new Map();

async planSkills(task: string) {
  const cacheKey = hash(task);

  if (planCache.has(cacheKey)) {
    return planCache.get(cacheKey);
  }

  const plan = await this.llmAnalyze(task);
  planCache.set(cacheKey, plan);

  return plan;
}
```

### 2. 并行代码生成

```typescript
// 未来支持：并行生成多个版本的代码
const versions = await Promise.all([
  this.generateCode(task, plan1),
  this.generateCode(task, plan2),
  this.generateCode(task, plan3)
]);

// 选择最优版本
const bestCode = this.selectBestVersion(versions);
```

---

## 🔮 未来优化方向

### 1. 强化学习优化

```
当前: 基于规则的技能匹配
未来: 用 RL 模型优化技能选择策略
```

### 2. 代码质量提升

```
当前: 单次生成
未来: 迭代优化（多次生成，选择最优）
```

### 3. 自适应模板

```
当前: 固定模板
未来: 根据任务类型自适应模板
```

---

## 📖 相关文档

- [Agent 系统](./agent-system.md) - Agent 如何使用 PTC
- [Skill 开发](../api/plugin-api/custom-skill.md) - 开发技能
- [上下文工程](./context-engineering.md) - 失败经验学习

---

**版本**: v1.0 | **更新日期**: 2026-03-29
