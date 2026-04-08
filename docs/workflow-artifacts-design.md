# Workflow Step 产物传递设计文档

## 📋 核心设计原则

### 1. **Workspace 是 Task Level 的**
```yaml
# Task 创建时指定
POST /agent/execute
{
  "task": "创建一个博客应用",
  "workflow": "simple-dev-workflow",
  "environment": {
    "workspace": "/tmp/task-workspace-123"  // ← Task 级别
  }
}

# 所有 Steps 共享同一个 Workspace
Step 1 (plan)      → /tmp/task-workspace-123/plan.md
Step 2 (implement)  → /tmp/task-workspace-123/app.js
Step 3 (test)       → /tmp/task-workspace-123/app.test.js
```

**优点**：
- ✅ 文件自动共享（所有 step 都能访问）
- ✅ 符合直觉（就像开发者在同一个项目中工作）
- ✅ 易于调试（可以直接查看 workspace 目录）

### 2. **Step 产物类型是可确定的**

每个 step 的产出类型是预先定义的，例如：
- **Plan Step**: 产出文本（JSON/Markdown plan）
- **Code Step**: 产出代码文件（`.js`, `.ts`, `.jsx` 等）
- **Doc Step**: 产出文档文件（`.md`, `.txt` 等）
- **Test Step**: 产出测试文件（`.test.js`, `.spec.ts` 等）

---

## 🎯 问题分析

### 当前问题

```yaml
steps:
  - id: plan
    agent: claude-code-external
    output: { planResult: "structuredOutput" }

  - id: implement
    agent: claude-code-external
    input:
      requirement: "{{ input.requirement }}"
      plan: "{{ planResult }}"  # ← 问题：这是文本还是文件？
```

**问题**：
1. `planResult` 可能是**文本**（plan 内容），也可能是**文件**（`plan.md` 的路径）
2. ExternalAgent 创建了文件，但下一个 step **不知道有哪些文件**
3. 无法过滤文件类型（如只要 `.js` 文件，不要 `.md` 文件）

---

## 💡 解决方案设计

### 方案 A：扩展 WorkflowStep 支持 Artifacts 声明（推荐）

```yaml
steps:
  - id: plan
    name: "制定计划"
    agent: claude-code-external
    externalAgent: { type: claude, timeout: 1800000 }
    input:
      requirement: "{{ input.requirement }}"
    artifacts:
      type: "text"              # ← 产物类型：文本
      outputKey: "planText"      # ← 输出键名
    output:
      planText: "structuredOutput"

  - id: implement
    name: "实现代码"
    agent: claude-code-external
    depends_on: [plan]
    externalAgent: { type: claude, timeout: 1800000 }
    input:
      requirement: "{{ input.requirement }}"
      planText: "{{ planText }}"    # ← 引用上一个 step 的文本产物
    artifacts:
      type: "files"                       # ← 产物类型：文件
      includePatterns: ["*.js", "*.jsx"]   # ← 只包含这些文件
      excludePatterns: ["*.test.js"]      # ← 排除这些文件
      outputKey: "codeFiles"
    output:
      implementationResult: "structuredOutput"
      codeFiles: "fileList"
```

### 方案 B：自动收集所有产物（简单但不够精确）

```yaml
steps:
  - id: plan
    agent: claude-code-external
    # 自动收集产物（文本和文件）
    
  - id: implement
    agent: claude-code-external
    input:
      previousStepOutput: "{{ plan.output }}"        # 文本
      previousStepFiles: "{{ plan.artifacts.files }}"  # 文件列表
      workspaceFiles: "autoScan"                      # 当前 workspace 所有文件
```

### 方案 C：混合方案（灵活）

```yaml
steps:
  - id: plan
    agent: claude-code-external
    artifacts:
      type: "both"  # 收集文本和文件
      fileFilter: ["*.md"]  # 只要 markdown 文件
      
  - id: implement
    agent: claude-code-external
    input:
      planText: "{{ plan.text }}"              # 明确引用文本
      planFiles: "{{ plan.files }}"            # 明确引用文件
      allWorkspaceFiles: "scanWorkspace"      # 扫描整个 workspace
```

---

## 🏗️ 推荐的实现架构

### 1. 扩展 WorkflowStep 类型

```typescript
// src/core/workflow/types.ts
export interface WorkflowStep {
  id: string;
  name?: string;
  agent?: string;
  
  // ⭐ 新增：产物配置
  artifacts?: {
    /** 产物类型 */
    type: 'text' | 'files' | 'both' | 'none';
    
    /** 输出键名（默认: artifacts） */
    outputKey?: string;
    
    /** 文件包含模式（可选） */
    includePatterns?: string[];
    
    /** 文件排除模式（可选） */
    excludePatterns?: string[];
    
    /** 是否自动扫描 workspace（可选） */
    scanWorkspace?: boolean;
  };
  
  // ... 其他字段
}
```

### 2. ExternalAgent 生成产物信息

```typescript
// ExternalAgent.run() 返回
return {
  success: true,
  output: output,
  metadata: {
    fileOperations: fileOperations,
    workspace: this.currentWorkspace,
    
    // ⭐ 新增：产物信息
    artifacts: this.collectArtifacts(fileOperations, context),
  },
};

/**
 * 收集当前 step 的产物
 */
private collectArtifacts(fileOperations: any[], context: any): {
  text?: string;
  files?: Array<{ path: string; name: string; type: string; size: number }>;
  workspace?: string;
} {
  const artifacts: any = {
    files: fileOperations
      .filter(op => op.type === 'file')
      .map(op => ({
        path: op.path,
        name: op.name,
        type: op.path.split('.').pop() || 'unknown',
        size: op.size || 0,
      })),
    workspace: this.currentWorkspace,
  };
  
  // 如果有文本输出，也包含进来
  if (output && output.length > 0 && output.length < 5000) {
    artifacts.text = output;
  }
  
  return artifacts;
}
```

### 3. WorkflowEngine 处理产物

```typescript
// WorkflowEngine.executeStep()

// 执行 step
const result = await agent.run(taskDescription, taskId, context);

// ⭐ 处理产物配置
if (step.artifacts) {
  const collectedArtifacts = this.collectArtifacts(result, step.artifacts);
  
  // 保存到 context，供下一个 step 使用
  const outputKey = step.artifacts.outputKey || 'artifacts';
  context.setVariable(`${step.id}.${outputKey}`, collectedArtifacts);
  
  // 如果配置了 scanWorkspace，扫描整个 workspace
  if (step.artifacts.scanWorkspace) {
    const workspaceFiles = await this.scanWorkspace(result.metadata?.workspace);
    context.setVariable(`${step.id}.workspaceFiles`, workspaceFiles);
  }
}

/**
 * 根据 artifacts 配置收集产物
 */
private collectArtifacts(result: AgentResult, artifactsConfig: any): any {
  const metadata = result.metadata || {};
  const fileOperations = metadata.fileOperations || [];
  
  if (artifactsConfig.type === 'text') {
    return {
      text: result.output,
      workspace: metadata.workspace,
    };
  }
  
  if (artifactsConfig.type === 'files') {
    let files = fileOperations
      .filter(op => op.type === 'file')
      .map(op => ({
        path: op.path,
        name: op.name,
        type: op.path.split('.').pop(),
      }));
    
    // 应用过滤规则
    if (artifactsConfig.includePatterns) {
      const minimatch = require('minimatch');
      files = files.filter(f =>
        artifactsConfig.includePatterns.some(pattern =>
          minimatch(f.path, pattern)
        )
      );
    }
    
    if (artifactsConfig.excludePatterns) {
      const minimatch = require('minimatch');
      files = files.filter(f =>
        !artifactsConfig.excludePatterns.some(pattern =>
          minimatch(f.path, pattern)
        )
      );
    }
    
    return {
      files,
      workspace: metadata.workspace,
      totalCount: files.length,
    };
  }
  
  if (artifactsConfig.type === 'both') {
    return {
      text: result.output,
      files: fileOperations
        .filter(op => op.type === 'file')
        .map(op => ({
          path: op.path,
          name: op.name,
          type: op.path.split('.').pop(),
        })),
      workspace: metadata.workspace,
    };
  }
  
  return {};
}

/**
 * 扫描 workspace 目录
 */
private async scanWorkspace(workspace?: string): Promise<any[]> {
  if (!workspace) return [];
  
  const { readdirSync, statSync } = require('fs');
  const { join } = require('path');
  
  const scanDir = (dir: string, baseDir: string, maxDepth = 5): any[] => {
    const files: any[] = [];
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = fullPath.replace(baseDir + '/', '');
        
        if (entry.isDirectory()) {
          if (maxDepth > 0) {
            files.push(...scanDir(fullPath, baseDir, maxDepth - 1));
          }
        } else {
          files.push({
            path: fullPath,
            relativePath,
            name: entry.name,
            type: entry.name.split('.').pop(),
            size: statSync(fullPath).size,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory: ${dir}`, error);
    }
    
    return files;
  };
  
  return scanDir(workspace, workspace, 5);
}
```

### 4. Template Engine 渲染输入

```typescript
// 在 WorkflowEngine 中
const renderedInput = this.renderInput(step.input || {}, context);

// 输入可以包含：
{
  requirement: "{{ input.requirement }}",
  planText: "{{ plan.text }}",
  planFiles: "{{ plan.files }}",
  
  // 渲染成：
  requirement: "创建一个博客应用",
  planText: "## 项目计划\n...",
  planFiles: [
    { path: "/tmp/workspace/plan.md", name: "plan.md", type: "md" },
    { path: "/tmp/workspace/architecture.md", name: "architecture.md", type: "md" }
  ]
}
```

---

## 📝 完整示例

### 示例 1：简单文本传递

```yaml
steps:
  - id: plan
    agent: claude-code-external
    artifacts:
      type: "text"
      outputKey: "planText"
    output:
      planText: "structuredOutput"
      
  - id: implement
    agent: claude-code-external
    input:
      requirement: "{{ input.requirement }}"
      plan: "{{ planText }}"  # ← 直接引用文本
```

### 示例 2：文件列表传递

```yaml
steps:
  - id: generate-code
    agent: claude-code-external
    artifacts:
      type: "files"
      includePatterns: ["*.js", "*.jsx"]
      outputKey: "codeFiles"
    output:
      codeFiles: "fileList"
      implementationResult: "structuredOutput"
      
  - id: review-code
    agent: claude-code-external
    input:
      filesToReview: "{{ codeFiles }}"  # ← 引用文件列表
      reviewCriteria: "Check for bugs and performance"
```

### 示例 3：混合产物

```yaml
steps:
  - id: design
    agent: claude-code-external
    artifacts:
      type: "both"
      outputKey: "design"
    output:
      design: "artifacts"
      
  - id: implement
    agent: claude-code-external
    input:
      designDoc: "{{ design.text }}"        # 文本部分
      designFiles: "{{ design.files }}"      # 文件列表部分
```

---

## 🤔 需要讨论的细节

### 1. 产物类型声明位置
- **选项 A**: 在 workflow yaml 中声明（推荐）
  ```yaml
  artifacts: { type: "files", includePatterns: ["*.js"] }
  ```
- **选项 B**: 在 subagent agent.yaml 中声明
  ```yaml
  artifacts:
    type: "files"
    default_patterns: ["*.ts", "*.js"]
  ```

### 2. 文件过滤的时机
- **选项 A**: ExternalAgent 返回后过滤（推荐）
- **选项 B**: 下一个 step 开始前过滤
- **选项 C**: 在 prompt 中说明（最灵活）

### 3. 向后兼容性
- 现有 workflow 没有声明 artifacts 怎么办？
- **建议**: 默认为 `type: "both"`，收集所有产物

### 4. Prompt 中如何使用产物信息
- **选项 A**: 自动拼接成文本
  ```
  Previous files:
  - file1.js (120 bytes)
  - file2.ts (340 bytes)
  ```
- **选项 B**: 作为 JSON 结构传递
- **选项 C**: 使用 handlebars 模板

---

## ✅ 推荐的实现步骤

1. **第一步**：扩展类型系统
   - 添加 `artifacts` 配置到 WorkflowStep
   - 更新 schema 验证

2. **第二步**：ExternalAgent 收集产物
   - 实现 `collectArtifacts()` 方法
   - 从 `fileOperations` 提取文件信息

3. **第三步**：WorkflowEngine 处理产物
   - 实现 `collectArtifacts()` 和 `scanWorkspace()`
   - 保存到 context 供下一步使用

4. **第四步**：Template Engine 支持
   - 支持引用 `{{ step.artifacts }}`
   - 支持复杂的渲染逻辑

5. **第五步**：更新现有 workflow
   - 添加 `artifacts` 配置
   - 测试产物传递

---

**这个设计如何？有什么需要调整的地方吗？**
