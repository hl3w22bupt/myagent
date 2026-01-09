# Motia 分布式 Agent 系统实现工作流

**项目**: Motia-based Distributed Agent System
**策略**: Systematic (系统性、结构化)
**深度**: Deep (详细实现指导)
**创建日期**: 2026-01-06
**基于**: delegated-mapping-yao.md

---

## 📋 执行摘要

本文档提供了一个从零开始构建 Motia 分布式 Agent 系统的系统性实现工作流。该系统采用四层架构：

1. **Skill 抽象层** (Python) - 可复用的能力单元
2. **Agent 编排层** (TypeScript) - 通用智能体和子代理
3. **Sandbox 执行层** (TS + Python) - 隔离的 PTC 代码执行环境
4. **Motia 集成层** (TypeScript) - 事件驱动和可观测性

---

## 🎯 实现阶段概览

```
Phase 1: 项目基础 (Foundation)
  ├─ 项目结构初始化
  ├─ 依赖配置
  └─ 开发环境搭建

Phase 2: Skill 子系统 (Python)
  ├─ Skill Executor 实现
  ├─ Skill Registry 实现
  ├─ 配置加载机制
  └─ 示例 Skills

Phase 3: Sandbox 层 (TypeScript)
  ├─ SandboxAdapter 接口
  ├─ Local Sandbox 实现
  ├─ 适配器工厂
  └─ 配置系统

Phase 4: Agent 层 (TypeScript)
  ├─ 基础 Agent 类
  ├─ PTC 生成器
  ├─ MasterAgent 类
  └─ Subagent 系统

Phase 4.5: Agent + Skill 集成测试 (独立测试) ⭐ NEW
  ├─ 独立测试脚本
  ├─ Agent + Skill 端到端测试
  ├─ PTC 生成与执行验证
  ├─ Sandbox 集成验证
  └─ 性能基准测试

Phase 5: Motia 集成 (TypeScript)
  ├─ Motia Config 配置
  ├─ AgentManager 实现（框架无关）
  ├─ SandboxManager 实现（框架无关）
  └─ Master Agent Step 实现

Phase 6: Master Agent 实现 (TypeScript)
  ├─ 两步规划器
  ├─ 委派逻辑
  ├─ 结果整合
  └─ 示例 Subagents

Phase 7: 示例与测试
  ├─ 示例 Skills
  ├─ 示例 Subagents
  ├─ 端到端测试
  └─ 文档完善

Phase 8: 优化与扩展
  ├─ 性能优化
  ├─ 可观测性增强
  ├─ 错误处理完善
  └─ 生产就绪检查
```

---

## Phase 1: 项目基础搭建

### 1.1 项目结构初始化

**目标**: 创建符合 Motia 规范的完整项目结构

**任务列表**:

```bash
# 1. 创建目录结构
myagent/
├── steps/
│   ├── agents/
│   └── workflows/
├── subagents/
│   ├── code-reviewer/
│   ├── data-analyst/
│   └── security-auditor/
├── skills/
│   ├── web-search/
│   ├── code-analysis/
│   └── summarize/
├── core/
│   ├── agent/
│   ├── sandbox/
│   └── skill/
├── config/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
```

**执行命令**:
```bash
# 创建所有必需的目录
mkdir -p steps/agents steps/workflows
mkdir -p subagents/{code-reviewer,data-analyst,security-auditor}/prompts
mkdir -p skills/{web-search,code-analysis,summarize}/tests
mkdir -p core/agent core/sandbox/adapters core/skill
mkdir -p config tests/{unit,integration,e2e} docs
```

**依赖**: 无
**产出**: 完整的目录结构
**验证**: `tree -L 3` 显示所有目录已创建

---

### 1.2 依赖配置

**目标**: 配置 TypeScript、Python 和 Motia 依赖

**任务清单**:

#### 1.2.1 TypeScript 依赖 (package.json)

```json
{
  "name": "myagent",
  "version": "1.0.0",
  "description": "Motia-based Distributed Agent System",
  "main": "dist/index.js",
  "scripts": {
    "dev": "motia dev",
    "start": "motia start",
    "build": "tsc",
    "test": "jest",
    "generate-types": "motia generate-types",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write \"**/*.ts\""
  },
  "dependencies": {
    "@motiadev/core": "^1.0.0",
    "@motiadev/orchestrator": "^1.0.0",
    "zod": "^3.22.4",
    "axios": "^1.6.2",
    "ws": "^8.16.0",
    "ioredis": "^5.3.2",
    "bullmq": "^5.1.8"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "@typescript-eslint/eslint-plugin": "^6.17.0",
    "@typescript-eslint/parser": "^6.17.0",
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11",
    "ts-jest": "^29.1.1"
  }
}
```

**执行命令**:
```bash
npm install
```

#### 1.2.2 Python 依赖 (requirements.txt)

```txt
# Core dependencies
python-dotenv==1.0.0
pydantic==2.5.2
pyyaml==6.0.1

# Async runtime
asyncio==3.4.3

# HTTP clients
httpx==0.25.2
aiohttp==3.9.1

# Code execution
executing==2.0.1

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
pytest-cov==4.1.0

# Linting
black==23.12.1
pylint==3.0.3
mypy==1.7.1
```

**执行命令**:
```bash
pip install -r requirements.txt
```

#### 1.2.3 TypeScript 配置 (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node", "jest"],
    "baseUrl": "./",
    "paths": {
      "@/*": ["*"],
      "@/core/*": ["core/*"],
      "@/steps/*": ["steps/*"],
      "@/skills": ["skills"]
    }
  },
  "include": [
    "**/*.ts",
    "types.d.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
```

**依赖**: 1.1 项目结构
**产出**: 完整的依赖配置
**验证**: `npm list` 和 `pip list` 显示所有包已安装

---

### 1.3 Motia 基础配置

**目标**: 创建最小可运行的 Motia 配置

#### 1.3.1 初始 Motia 配置 (motia.config.ts)

```typescript
import { defineConfig } from '@motiadev/core';

export default defineConfig({
  projectId: 'myagent-distributed-system',
  workspace: './',

  plugins: [],

  adapters: {
    events: {
      type: 'memory',
    },
    state: {
      type: 'memory',
    },
  },

  dev: {
    port: 3000,
    hotReload: true,
  },
});
```

#### 1.3.2 环境变量 (.env.example)

```bash
# Sandbox Configuration
DEFAULT_SANDBOX_ADAPTER=local

# Local Sandbox
PYTHON_PATH=python3
SANDBOX_TIMEOUT=30000
SANDBOX_WORKSPACE=/tmp/motia-sandbox

# Daytona (Optional)
DAYTONA_API_KEY=

# E2B (Optional)
E2B_API_KEY=

# Modal (Optional)
MODAL_TOKEN=

# LLM Configuration
ANTHROPIC_API_KEY=
DEFAULT_LLM_PROVIDER=anthropic
DEFAULT_LLM_MODEL=claude-sonnet-4-5

# Redis (Optional - for production)
REDIS_URL=redis://localhost:6379
```

**执行命令**:
```bash
cp .env.example .env
# Edit .env with your API keys
```

**依赖**: 1.2 依赖配置
**产出**: 可配置的 Motia 项目
**验证**: `npm run dev` 成功启动 Motia 开发服务器

---

## Phase 2: Skill 子系统实现 (Python)

### 2.1 Skill 类型定义

**目标**: 定义 Skill 的数据结构

**文件**: `core/skill/types.py`

```python
from typing import Dict, Any, Optional, List
from enum import Enum
from pydantic import BaseModel, Field

class SkillType(str, Enum):
    PURE_PROMPT = "pure-prompt"
    PURE_SCRIPT = "pure-script"
    HYBRID = "hybrid"

class InputSchema(BaseModel):
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)
    required: List[str] = Field(default_factory=list)

class OutputSchema(BaseModel):
    type: str = "object"
    properties: Dict[str, Any] = Field(default_factory=dict)

class ExecutionConfig(BaseModel):
    handler: str
    function: str = "execute"
    timeout: int = 30000

class SkillMetadata(BaseModel):
    """Level 1: Lightweight metadata loaded at startup"""
    name: str
    version: str
    description: str
    tags: List[str]
    type: SkillType

class SkillDefinition(SkillMetadata):
    """Level 2: Full definition loaded on demand"""
    input_schema: InputSchema
    output_schema: OutputSchema
    prompt_template: Optional[str] = None
    execution: Optional[ExecutionConfig] = None

class SkillResult(BaseModel):
    success: bool
    output: Optional[Any] = None
    error: Optional[str] = None
    execution_time: float = 0.0
```

**依赖**: 1.2.2 Python 依赖
**产出**: Skill 数据模型
**验证**: `python -m mypy core/skill/types.py` 通过类型检查

---

### 2.2 Skill Registry 实现

**目标**: 实现 Skill 的自动发现和按需加载

**文件**: `core/skill/registry.py`

```python
import os
import yaml
import asyncio
from pathlib import Path
from typing import Dict, List, Optional
from .types import SkillMetadata, SkillDefinition, SkillType

class SkillRegistry:
    def __init__(self, skills_dir: str = 'skills/'):
        self.skills_dir = Path(skills_dir)
        self._metadata: Dict[str, SkillMetadata] = {}
        self._full_definitions: Dict[str, SkillDefinition] = {}

    async def scan(self) -> Dict[str, SkillMetadata]:
        """Scan skills directory and load metadata (Level 1)"""
        tasks = []
        for skill_path in self.skills_dir.iterdir():
            if skill_path.is_dir() and (skill_path / 'skill.yaml').exists():
                tasks.append(self._load_metadata(skill_path))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for result in results:
            if isinstance(result, SkillMetadata):
                self._metadata[result.name] = result

        return self._metadata

    async def _load_metadata(self, skill_path: Path) -> SkillMetadata:
        """Load only metadata from skill.yaml"""
        config_file = skill_path / 'skill.yaml'
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        return SkillMetadata(
            name=config['name'],
            version=config['version'],
            description=config['description'],
            tags=config.get('tags', []),
            type=SkillType(config.get('type', 'pure-script'))
        )

    async def load_full(self, skill_name: str) -> SkillDefinition:
        """Load full skill definition (Level 2)"""
        if skill_name in self._full_definitions:
            return self._full_definitions[skill_name]

        if skill_name not in self._metadata:
            raise ValueError(f"Skill '{skill_name}' not found in registry")

        skill_path = self.skills_dir / skill_name
        config_file = skill_path / 'skill.yaml'

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        definition = SkillDefinition(
            **self._metadata[skill_name].dict(),
            input_schema=config.get('input_schema', {}),
            output_schema=config.get('output_schema', {}),
            prompt_template=config.get('prompt_template'),
            execution=ExecutionConfig(**config['execution']) if 'execution' in config else None
        )

        self._full_definitions[skill_name] = definition
        return definition

    def list(self, tags: Optional[List[str]] = None) -> List[SkillMetadata]:
        """List available skills, optionally filtered by tags"""
        skills = list(self._metadata.values())

        if tags:
            skills = [s for s in skills if any(tag in s.tags for tag in tags)]

        return skills

    def get_full(self, skill_name: str) -> Optional[SkillDefinition]:
        """Get full definition if already loaded"""
        return self._full_definitions.get(skill_name)
```

**依赖**: 2.1 类型定义
**产出**: Skill Registry 类
**验证**: 单元测试覆盖扫描、加载、过滤功能

---

### 2.3 Skill Executor 实现

**目标**: 实现 Skill 的统一执行接口

**文件**: `core/skill/executor.py`

```python
import importlib
import json
import time
from typing import Any, Dict
from .registry import SkillRegistry
from .types import SkillType, SkillResult

class SkillExecutor:
    def __init__(self, skills_dir: str = 'skills/'):
        self.registry = SkillRegistry(skills_dir)
        self._loaded = False

    async def ensure_loaded(self):
        """Ensure registry is initialized"""
        if not self._loaded:
            await self.registry.scan()
            self._loaded = True

    async def execute(self, skill_name: str, input_data: Dict[str, Any]) -> SkillResult:
        """Execute a skill by name"""
        await self.ensure_loaded()

        skill = await self.registry.load_full(skill_name)
        start_time = time.time()

        try:
            if skill.type == SkillType.PURE_PROMPT:
                output = await self._execute_prompt_skill(skill, input_data)
            elif skill.type == SkillType.PURE_SCRIPT:
                output = await self._execute_script_skill(skill, input_data)
            elif skill.type == SkillType.HYBRID:
                output = await self._execute_hybrid_skill(skill, input_data)
            else:
                raise ValueError(f"Unknown skill type: {skill.type}")

            execution_time = time.time() - start_time
            return SkillResult(
                success=True,
                output=output,
                execution_time=execution_time
            )

        except Exception as e:
            execution_time = time.time() - start_time
            return SkillResult(
                success=False,
                error=str(e),
                execution_time=execution_time
            )

    async def _execute_prompt_skill(self, skill, input_data: Dict[str, Any]) -> Any:
        """Pure prompt skills - returns the prompt template for LLM"""
        if not skill.prompt_template:
            raise ValueError(f"Pure prompt skill '{skill.name}' missing prompt_template")

        # Render template with input data
        template = skill.prompt_template
        for key, value in input_data.items():
            template = template.replace(f"{{{{{key}}}}}", str(value))

        return {
            "type": "prompt",
            "content": template
        }

    async def _execute_script_skill(self, skill, input_data: Dict[str, Any]) -> Any:
        """Pure script skills - execute Python code"""
        if not skill.execution:
            raise ValueError(f"Script skill '{skill.name}' missing execution config")

        try:
            # Dynamic import
            module_path = f"skills.{skill.name}.{skill.execution.handler.replace('.py', '')}"
            skill_module = importlib.import_module(module_path)

            # Call the function
            handler = getattr(skill_module, skill.execution.function)
            if hasattr(handler, '__call__'):
                # Check if it's async
                if asyncio.iscoroutinefunction(handler):
                    return await handler(input_data)
                else:
                    return handler(input_data)
            else:
                raise AttributeError(f"Handler '{skill.execution.function}' is not callable")

        except ImportError as e:
            raise ImportError(f"Failed to import skill module '{skill.name}': {e}")
        except AttributeError as e:
            raise AttributeError(f"Function '{skill.execution.function}' not found in skill '{skill.name}': {e}")

    async def _execute_hybrid_skill(self, skill, input_data: Dict[str, Any]) -> Any:
        """Hybrid skills - script execution with prompt context"""
        # For hybrid skills, execute the script part
        # The script can use the prompt template for LLM calls internally
        return await self._execute_script_skill(skill, input_data)
```

**依赖**: 2.2 Skill Registry
**产出**: Skill Executor 类
**验证**: 单元测试覆盖三种 Skill 类型执行

---

### 2.4 示例 Skills 创建

**目标**: 创建三个示例 Skills 用于测试

#### 2.4.1 Web Search Skill

**文件**: `skills/web-search/skill.yaml`

```yaml
name: web-search
version: 1.0.0
description: Search the web for information and return results
tags: [web, research, search]
type: hybrid

input_schema:
  type: object
  properties:
    query:
      type: string
      description: The search query string
    limit:
      type: number
      default: 5
      description: Maximum number of results
  required: [query]

output_schema:
  type: object
  properties:
    results:
      type: array
      items:
        type: object
    total:
      type: number

prompt_template: |
  You are a web search assistant. Search for "{{query}}" and return the top {{limit}} results.

execution:
  handler: handler.py
  function: execute
  timeout: 30000
```

**文件**: `skills/web-search/handler.py`

```python
import httpx
from typing import Dict, Any

async def execute(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Execute web search using a search API"""
    query = input_data.get('query')
    limit = input_data.get('limit', 5)

    # Example: Use a search API (replace with actual implementation)
    # For now, return mock data
    mock_results = [
        {
            "title": f"Result {i+1} for '{query}'",
            "url": f"https://example.com/{i+1}",
            "snippet": f"This is result {i+1} for the query '{query}'"
        }
        for i in range(limit)
    ]

    return {
        "results": mock_results,
        "total": len(mock_results)
    }
```

#### 2.4.2 Summarize Skill (Pure Prompt)

**文件**: `skills/summarize/skill.yaml`

```yaml
name: summarize
version: 1.0.0
description: Summarize text content
tags: [text, summarization, nlp]
type: pure-prompt

input_schema:
  type: object
  properties:
    content:
      type: string
      description: Text content to summarize
    max_length:
      type: number
      default: 100
      description: Maximum summary length
  required: [content]

output_schema:
  type: object
  properties:
    summary:
      type: string

prompt_template: |
  Please summarize the following content in under {{max_length}} words:

  {{content}}

  Provide a concise summary that captures the key points.
```

#### 2.4.3 Code Analysis Skill (Pure Script)

**文件**: `skills/code-analysis/skill.yaml`

```yaml
name: code-analysis
version: 1.0.0
description: Analyze code quality and patterns
tags: [code, analysis, quality]
type: pure-script

input_schema:
  type: object
  properties:
    code:
      type: string
      description: Code to analyze
    language:
      type: string
      description: Programming language
  required: [code, language]

output_schema:
  type: object
  properties:
    score:
      type: number
    issues:
      type: array
    suggestions:
      type: array

execution:
  handler: analyzer.py
  function: analyze
  timeout: 10000
```

**文件**: `skills/code-analysis/analyzer.py`

```python
import re
from typing import Dict, Any, List

def analyze(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Analyze code quality"""
    code = input_data.get('code', '')
    language = input_data.get('language', '')

    issues = []
    suggestions = []

    # Simple analysis rules
    if language == 'python':
        # Check for print statements
        if 'print(' in code:
            issues.append({
                "severity": "warning",
                "message": "Print statement found in code",
                "line": code.find('print(')
            })
            suggestions.append("Consider using logging instead of print")

        # Check for function length
        functions = re.findall(r'def\s+\w+\(.*?\):', code)
        for func in functions:
            func_start = code.find(func)
            # Simple heuristic: find next 'def' or end of code
            func_end = code.find('\ndef ', func_start + 1)
            if func_end == -1:
                func_end = len(code)
            func_code = code[func_start:func_end]

            if len(func_code.split('\n')) > 50:
                issues.append({
                    "severity": "info",
                    "message": f"Function may be too long ({len(func_code.split('\\n'))} lines)",
                    "line": func_start
                })

    # Calculate quality score (0-100)
    base_score = 100
    score = base_score - (len(issues) * 5)

    return {
        "score": max(0, score),
        "issues": issues,
        "suggestions": suggestions
    }
```

**依赖**: 2.3 Skill Executor
**产出**: 三个可执行的示例 Skills
**验证**: `python -m pytest tests/skills/` 全部通过

---

## Phase 3: Sandbox 层实现 (TypeScript)

### 3.1 Sandbox 类型定义

**目标**: 定义 Sandbox 接口和类型

**文件**: `core/sandbox/types.ts`

```typescript
export interface SandboxOptions {
  skills: SkillManifest[];
  skillImplPath?: string;
  timeout?: number;
  sessionId?: string;
  workspace?: string;
  metadata?: Record<string, any>;
  env?: Record<string, string>;
}

export interface SkillManifest {
  name: string;
  version: string;
  type: 'pure-prompt' | 'pure-script' | 'hybrid';
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

export interface SandboxResult {
  success: boolean;
  output?: any;
  error?: SandboxError;
  executionTime: number;
  sessionId: string;
  stdout?: string;
  stderr?: string;
}

export interface SandboxError {
  type: 'timeout' | 'execution' | 'validation' | 'unknown';
  message: string;
  stack?: string;
}

export interface SandboxInfo {
  type: string;
  version: string;
  capabilities: string[];
}

export interface SandboxAdapter {
  execute(code: string, options: SandboxOptions): Promise<SandboxResult>;
  cleanup(sessionId?: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  getInfo(): SandboxInfo;
}
```

**依赖**: 1.2.1 TypeScript 依赖
**产出**: Sandbox 类型定义
**验证**: `npm run build` 类型检查通过

---

### 3.2 Local Sandbox 实现

**目标**: 实现本地 Python 进程 Sandbox

**文件**: `core/sandbox/adapters/local.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  SandboxAdapter,
  SandboxOptions,
  SandboxResult,
  SandboxError,
  SandboxInfo
} from '../types';

export class LocalSandboxAdapter implements SandboxAdapter {
  private pythonPath: string;
  private workspace: string;
  private activeSessions: Map<string, ChildProcess>;

  constructor(config: { pythonPath?: string; workspace?: string }) {
    this.pythonPath = config.pythonPath || 'python3';
    this.workspace = config.workspace || '/tmp/motia-sandbox';
    this.activeSessions = new Map();
  }

  async execute(code: string, options: SandboxOptions): Promise<SandboxResult> {
    const sessionId = options.sessionId || uuidv4();
    const startTime = Date.now();

    try {
      // 1. Wrap PTC code with SkillExecutor
      const wrappedCode = this.wrapCode(code, options);

      // 2. Write to temporary file
      const scriptPath = join(this.workspace, `script_${sessionId}.py`);
      await writeFile(scriptPath, wrappedCode, 'utf-8');

      // 3. Spawn Python process
      const process = spawn(this.pythonPath, [scriptPath], {
        env: {
          ...process.env,
          MOTIA_TRACE_ID: options.metadata?.traceId || sessionId,
          MOTIA_SKILL_PATH: options.skillImplPath || process.cwd(),
          PYTHONPATH: options.skillImplPath || process.cwd()
        },
        timeout: options.timeout || 30000
      });

      this.activeSessions.set(sessionId, process);

      // 4. Collect output
      const result = await this.collectResult(process);

      // 5. Cleanup
      await unlink(scriptPath);
      this.activeSessions.delete(sessionId);

      const executionTime = Date.now() - startTime;

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? {
          type: 'execution',
          message: result.stderr || 'Unknown error'
        } : undefined,
        executionTime,
        sessionId,
        stdout: result.stdout,
        stderr: result.stderr
      };

    } catch (error: any) {
      return {
        success: false,
        error: {
          type: 'unknown',
          message: error.message,
          stack: error.stack
        },
        executionTime: Date.now() - startTime,
        sessionId
      };
    }
  }

  private wrapCode(code: string, options: SandboxOptions): string {
    return `
import asyncio
import sys
import os
import json

# Add skill path to Python path
skill_path = os.getenv('MOTIA_SKILL_PATH', '${options.skillImplPath || ''}')
if skill_path:
    sys.path.insert(0, skill_path)

from core.skill.executor import SkillExecutor

async def main():
    executor = SkillExecutor()
    try:
${code.split('\n').map(line => '        ' + line).join('\n')}
    except Exception as e:
        print(json.dumps({"error": str(e), "success": False}))

asyncio.run(main())
`;
  }

  private collectResult(process: ChildProcess): Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({ exitCode: code, stdout, stderr });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async cleanup(sessionId?: string): Promise<void> {
    if (sessionId) {
      const process = this.activeSessions.get(sessionId);
      if (process) {
        process.kill();
        this.activeSessions.delete(sessionId);
      }
    } else {
      // Cleanup all sessions
      for (const [id, process] of this.activeSessions) {
        process.kill();
      }
      this.activeSessions.clear();
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const process = spawn(this.pythonPath, ['--version']);
      return new Promise((resolve) => {
        process.on('close', (code) => resolve(code === 0));
        process.on('error', () => resolve(false));
      });
    } catch {
      return false;
    }
  }

  getInfo(): SandboxInfo {
    return {
      type: 'local',
      version: '1.0.0',
      capabilities: ['python-execution', 'skill-execution', 'file-io']
    };
  }
}
```

**依赖**: 3.1 Sandbox 类型, 2.3 Skill Executor
**产出**: Local Sandbox Adapter
**验证**: 单元测试覆盖代码执行、超时、错误处理

---

### 3.3 Sandbox 工厂实现

**目标**: 实现 Sandbox 适配器工厂

**文件**: `core/sandbox/factory.ts`

```typescript
import { SandboxAdapter, SandboxConfig } from './types';
import { LocalSandboxAdapter } from './adapters/local';

// Lazy load remote adapters
// import { DaytonaSandboxAdapter } from './adapters/daytona';
// import { E2BSandboxAdapter } from './adapters/e2b';
// import { ModalSandboxAdapter } from './adapters/modal';

export class SandboxFactory {
  private static adapters = new Map<string, (config?: any) => SandboxAdapter>();

  static register(type: string, factory: (config?: any) => SandboxAdapter) {
    this.adapters.set(type, factory);
  }

  static create(config: SandboxConfig): SandboxAdapter {
    const factory = this.adapters.get(config.type);
    if (!factory) {
      throw new Error(`Unknown sandbox type: ${config.type}`);
    }
    return factory(config);
  }

  static getAvailableTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Register built-in adapters
SandboxFactory.register('local', (config) => new LocalSandboxAdapter(config.local || {}));
// SandboxFactory.register('daytona', (config) => new DaytonaSandboxAdapter(config.daytona));
// SandboxFactory.register('e2b', (config) => new E2BSandboxAdapter(config.e2b));
// SandboxFactory.register('modal', (config) => new ModalSandboxAdapter(config.modal));
```

**依赖**: 3.2 Local Sandbox
**产出**: Sandbox Factory
**验证**: 能创建所有注册的适配器类型

---

### 3.4 Sandbox 配置系统

**文件**: `config/sandbox.config.yaml`

```yaml
default_adapter: local

adapters:
  local:
    type: local
    python_path: python3
    timeout: 30000
    workspace: /tmp/motia-sandbox
    max_sessions: 10

  # Future implementations
  # daytona:
  #   type: daytona
  #   api_key: ${DAYTONA_API_KEY}
  #   template: python-311

  # e2b:
  #   type: e2b
  #   api_key: ${E2B_API_KEY}
  #   template: python3.11-pandas

  # modal:
  #   type: modal
  #   token: ${MODAL_TOKEN}
  #   function_id: motia-sandbox-runner
```

**文件**: `core/sandbox/config.ts`

```typescript
import * as yaml from 'js-yaml';
import { readFileSync } from 'fs';

export interface SandboxConfig {
  type: string;
  local?: {
    pythonPath?: string;
    timeout?: number;
    workspace?: string;
    maxSessions?: number;
  };
  daytona?: {
    apiKey?: string;
    template?: string;
  };
  e2b?: {
    apiKey?: string;
    template?: string;
  };
  modal?: {
    token?: string;
    functionId?: string;
  };
}

export interface FullSandboxConfig {
  default_adapter: string;
  adapters: Record<string, SandboxConfig>;
}

export function loadSandboxConfig(configPath: string = './config/sandbox.config.yaml'): FullSandboxConfig {
  const fileContent = readFileSync(configPath, 'utf8');
  const config = yaml.load(fileContent) as FullSandboxConfig;

  // Substitute environment variables
  for (const [key, adapter] of Object.entries(config.adapters)) {
    if (adapter.daytona?.api_key) {
      adapter.daytona.apiKey = substituteEnv(adapter.daytona.api_key);
    }
    // Similar for other adapters...
  }

  return config;
}

function substituteEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });
}
```

**依赖**: 3.3 Sandbox Factory
**产出**: Sandbox 配置加载器
**验证**: 能加载配置并创建适配器

---

## Phase 4: Agent 层实现 (TypeScript)

### 4.1 Agent 类型定义

**文件**: `core/agent/types.ts`

```typescript
export interface AgentConfig {
  systemPrompt: string;
  availableSkills: string[];
  llm?: {
    provider: string;
    model: string;
    apiKey?: string;
  };
  sandbox?: {
    type: string;
    config?: any;
  };
  constraints?: {
    maxIterations?: number;
    timeout?: number;
  };
}

export interface AgentResult {
  success: boolean;
  output?: any;
  error?: string;
  steps: AgentStep[];
  executionTime: number;
  metadata: {
    llmCalls: number;
    skillCalls: number;
    totalTokens: number;
  };
}

export interface AgentStep {
  type: 'planning' | 'ptc-generation' | 'execution' | 'error';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PTCGenerationOptions {
  includeReasoning?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface DelegationPlan {
  steps: DelegationStep[];
  reasoning: string;
}

export interface DelegationStep {
  task: string;
  delegateTo?: string; // undefined = execute self
  reason: string;
}
```

**依赖**: 无
**产出**: Agent 类型定义
**验证**: TypeScript 编译通过

---

### 4.2 PTC 生成器实现

**目标**: 实现两步 PTC 代码生成

**文件**: `core/agent/ptc-generator.ts`

```typescript
import { Anthropic } from '@anthropic-ai/sdk';
import { SkillRegistry } from '../skill/registry';
import { PTCGenerationOptions } from './types';

export class PTCGenerator {
  private llm: Anthropic;
  private skillRegistry: SkillRegistry;

  constructor(llm: Anthropic, skillRegistry: SkillRegistry) {
    this.llm = llm;
    this.skillRegistry = skillRegistry;
  }

  async generate(task: string, options?: PTCGenerationOptions): Promise<string> {
    // Step 1: Planning phase (skill selection)
    const plan = await this.planSkills(task);

    // Step 2: Implementation phase (code generation)
    const code = await this.generateCode(task, plan.selectedSkills);

    return code;
  }

  private async planSkills(task: string): Promise<{ selectedSkills: string[]; reasoning: string }> {
    const skills = await this.skillRegistry.listAll();
    const skillsList = skills.map(s =>
      `- ${s.name}: ${s.description}`
    ).join('\n');

    const prompt = `You are an agent that plans task execution by selecting skills.

<available_skills>
${skillsList}
</available_skills>

<task>
${task}
</task>

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1", "skill2"],
  "reasoning": "First use skill1 to ..., then skill2 to ..."
}
</plan>`;

    const response = await this.llm.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from LLM');
    }

    // Extract JSON from response
    const jsonMatch = content.text.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (!jsonMatch) {
      throw new Error('Failed to parse plan from LLM response');
    }

    const plan = JSON.parse(jsonMatch[1]);
    return plan;
  }

  private async generateCode(task: string, selectedSkills: string[]): Promise<string> {
    // Load skill schemas
    const skillsInfo = await Promise.all(
      selectedSkills.map(async (skillName) => {
        const skill = await this.skillRegistry.loadFull(skillName);
        return {
          name: skillName,
          inputSchema: skill.inputSchema,
          outputSchema: skill.outputSchema
        };
      })
    );

    const skillsBlock = skillsInfo.map(s =>
      `${s.name}:
  Input Schema: ${JSON.stringify(s.inputSchema, null, 2)}
  Output Schema: ${JSON.stringify(s.outputSchema, null, 2)}`
    ).join('\n\n');

    const prompt = `<task>
${task}
</task>

<skills>
${skillsBlock}
</skills>

Generate Python code using this pattern:

<code>
from skill_executor import SkillExecutor

executor = SkillExecutor()

result1 = await executor.execute('skill-name', {'param': 'value'})
result2 = await executor.execute('another-skill', {'input': result1})

print(result2)
</code>

Important:
- Use async/await for all skill executions
- Print the final result
- Handle errors gracefully
- Only output the Python code, no explanations`;

    const response = await this.llm.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from LLM');
    }

    // Extract code from response
    const codeMatch = content.text.match(/<code>\s*(.*?)\s*<\/code>/s);
    if (!codeMatch) {
      throw new Error('Failed to parse code from LLM response');
    }

    return codeMatch[1].trim();
  }
}
```

**依赖**: 4.1 Agent 类型, 2.2 Skill Registry
**产出**: PTC Generator 类
**验证**: 能生成有效的 Python PTC 代码

---

### 4.3 基础 Agent 类实现

**文件**: `core/agent/agent.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Anthropic } from '@anthropic-ai/sdk';
import { SandboxFactory } from '../sandbox/factory';
import { loadSandboxConfig } from '../sandbox/config';
import { SkillRegistry } from '../skill/registry';
import { PTCGenerator } from './ptc-generator';
import { AgentConfig, AgentResult, AgentStep } from './types';

export class Agent {
  protected config: AgentConfig;
  protected llm: Anthropic;
  protected sandbox: any;
  protected skillRegistry: SkillRegistry;
  protected ptcGenerator: PTCGenerator;
  protected sessionId: string;

  constructor(config: AgentConfig) {
    this.config = config;

    // Initialize LLM
    this.llm = new Anthropic({
      apiKey: config.llm?.apiKey || process.env.ANTHROPIC_API_KEY
    });

    // Initialize Sandbox
    const sandboxConfig = loadSandboxConfig();
    const adapterConfig = sandboxConfig.adapters[config.sandbox?.type || sandboxConfig.default_adapter];
    this.sandbox = SandboxFactory.create(adapterConfig);

    // Initialize Skill Registry and PTC Generator
    this.skillRegistry = new SkillRegistry();
    this.ptcGenerator = new PTCGenerator(this.llm, this.skillRegistry);

    this.sessionId = uuidv4();
  }

  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    try {
      // Step 1: Generate PTC code
      steps.push({
        type: 'planning',
        content: 'Generating PTC code for task',
        timestamp: Date.now()
      });

      const ptcCode = await this.ptcGenerator.generate(task);

      steps.push({
        type: 'ptc-generation',
        content: ptcCode,
        timestamp: Date.now()
      });

      // Step 2: Execute in Sandbox
      steps.push({
        type: 'execution',
        content: 'Executing PTC code in sandbox',
        timestamp: Date.now()
      });

      const sandboxResult = await this.sandbox.execute(ptcCode, {
        skills: [],
        skillImplPath: process.cwd(),
        sessionId: this.sessionId,
        timeout: this.config.constraints?.timeout || 60000,
        metadata: {
          traceId: this.sessionId,
          task
        }
      });

      // Step 3: Process result
      const executionTime = Date.now() - startTime;

      if (!sandboxResult.success) {
        return {
          success: false,
          error: sandboxResult.error?.message || 'Execution failed',
          steps,
          executionTime,
          metadata: {
            llmCalls: 1,
            skillCalls: 0,
            totalTokens: 0
          }
        };
      }

      return {
        success: true,
        output: sandboxResult.output,
        steps,
        executionTime,
        metadata: {
          llmCalls: 1,
          skillCalls: this.extractSkillCalls(ptcCode),
          totalTokens: 0 // TODO: Track actual token usage
        }
      };

    } catch (error: any) {
      steps.push({
        type: 'error',
        content: error.message,
        timestamp: Date.now()
      });

      return {
        success: false,
        error: error.message,
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          llmCalls: 1,
          skillCalls: 0,
          totalTokens: 0
        }
      };
    }
  }

  private extractSkillCalls(code: string): number {
    const matches = code.match(/executor\.execute/g);
    return matches ? matches.length : 0;
  }

  async cleanup(): Promise<void> {
    await this.sandbox.cleanup(this.sessionId);
  }
}
```

**依赖**: 4.2 PTC Generator, 3.3 Sandbox Factory, 2.2 Skill Registry
**产出**: 基础 Agent 类
**验证**: 能执行简单任务并返回结果

---

### 4.4 Master Agent 类实现

**文件**: `core/agent/master-agent.ts`

```typescript
import { Agent } from './agent';
import { AgentConfig, AgentResult, DelegationPlan, DelegationStep } from './types';
import { Anthropic } from '@anthropic-ai/sdk';

export interface MasterAgentConfig extends AgentConfig {
  subagents: string[];
}

export class MasterAgent extends Agent {
  private subagents: Map<string, Agent>;
  private subagentConfigs: Map<string, any>;

  constructor(config: MasterAgentConfig) {
    super(config);
    this.subagents = new Map();
    this.subagentConfigs = new Map();

    // Load subagent configurations
    this.loadSubagents(config.subagents);
  }

  private async loadSubagents(subagentNames: string[]): Promise<void> {
    for (const name of subagentNames) {
      try {
        const configPath = `./subagents/${name}/agent.yaml`;
        // Load subagent config (implementation depends on config format)
        // For now, store placeholder
        this.subagentConfigs.set(name, { name });
      } catch (error) {
        console.error(`Failed to load subagent '${name}':`, error);
      }
    }
  }

  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: any[] = [];

    try {
      // Step 1: Plan with delegation
      steps.push({
        type: 'planning',
        content: 'Creating delegation plan',
        timestamp: Date.now()
      });

      const plan = await this.planWithDelegation(task);

      // Step 2: Execute plan
      const results: any[] = [];
      for (const step of plan.steps) {
        if (step.delegateTo) {
          // Delegate to subagent
          const subagent = await this.getOrCreateSubagent(step.delegateTo);
          const result = await subagent.run(step.task);
          results.push({ subagent: step.delegateTo, result });
        } else {
          // Execute self
          const result = await super.run(step.task);
          results.push({ self: true, result });
        }
      }

      // Step 3: Synthesize results
      const finalResult = await this.synthesizeResults(results);

      return {
        success: true,
        output: finalResult,
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          llmCalls: 1,
          skillCalls: 0,
          totalTokens: 0
        }
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        steps,
        executionTime: Date.now() - startTime,
        metadata: {
          llmCalls: 1,
          skillCalls: 0,
          totalTokens: 0
        }
      };
    }
  }

  private async planWithDelegation(task: string): Promise<DelegationPlan> {
    const subagentsList = Array.from(this.subagentConfigs.keys()).map(name => {
      const config = this.subagentConfigs.get(name);
      return `- ${name}: ${config?.description || 'No description'}`;
    }).join('\n');

    const prompt = `You are a master agent planning task execution with delegation.

<available_subagents>
${subagentsList}
</available_subagents>

<task>
${task}
</task>

Create a plan breaking down the task into steps. For each step, decide:
1. Should this be delegated to a subagent? If yes, which one?
2. Or should the master agent handle it directly?

Output format (JSON):
<plan>
{
  "steps": [
    {"task": "subtask 1", "delegateTo": "subagent-name", "reason": "..."},
    {"task": "subtask 2", "reason": "..."}  // No delegateTo means execute self
  ],
  "reasoning": "Overall strategy explanation"
}
</plan>`;

    const response = await this.llm.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from LLM');
    }

    const jsonMatch = content.text.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
    if (!jsonMatch) {
      throw new Error('Failed to parse plan from LLM response');
    }

    return JSON.parse(jsonMatch[1]);
  }

  private async getOrCreateSubagent(name: string): Promise<Agent> {
    if (this.subagents.has(name)) {
      return this.subagents.get(name)!;
    }

    // Create subagent instance
    // This is a simplified version - actual implementation would load full config
    const config = {
      systemPrompt: `You are ${name}.`,
      availableSkills: [],
      llm: this.config.llm
    };

    const subagent = new Agent(config);
    this.subagents.set(name, subagent);

    return subagent;
  }

  private async synthesizeResults(results: any[]): Promise<any> {
    // Simple synthesis: combine all outputs
    // In production, use LLM to intelligently merge results
    return {
      results,
      summary: `Executed ${results.length} steps successfully`
    };
  }
}
```

**依赖**: 4.3 基础 Agent
**产出**: Master Agent 类
**验证**: 能委派任务给 Subagents

---

## Phase 4.5: Agent + Skill 集成测试 (独立测试)

### ⚠️ 重要说明

**这是一个关键的验证阶段**，在集成到 Motia 之前，我们需要确保：
1. Agent 能够正确生成和执行 PTC 代码
2. Skills 能够在 Sandbox 中正确执行
3. 端到端流程（Agent → PTC → Sandbox → Skills）正常工作
4. 性能满足基本要求

这样做的好处：
- ✅ 更早发现核心逻辑问题
- ✅ 更容易调试（没有 Motia 复杂性）
- ✅ 确保核心 API 稳定后再集成
- ✅ 减少 Motia 集成时的风险

---

### 4.5.1 独立测试脚本

**目标**: 创建一个不依赖 Motia 的独立测试脚本

**文件**: `tests/integration/agent-skill-standalone.test.ts`

```typescript
import { Agent } from '@/core/agent/agent';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { loadSandboxConfig } from '@/core/sandbox/config';
import { SandboxFactory } from '@/core/sandbox/factory';
import { SkillRegistry } from '@/core/skill/registry';

describe('Agent + Skill Integration (Standalone)', () => {
  let agent: Agent;
  let sandbox: any;

  beforeAll(async () => {
    // Initialize sandbox
    const sandboxConfig = loadSandboxConfig();
    const adapterConfig = sandboxConfig.adapters[sandboxConfig.default_adapter];
    sandbox = SandboxFactory.create(adapterConfig);

    // Verify sandbox is healthy
    const isHealthy = await sandbox.healthCheck();
    expect(isHealthy).toBe(true);
  });

  afterAll(async () => {
    if (agent) {
      await agent.cleanup();
    }
    await sandbox.cleanup();
  });

  it('should initialize agent successfully', () => {
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['web-search', 'summarize', 'code-analysis'],
      sandbox: {
        type: 'local'
      }
    });

    expect(agent).toBeDefined();
  });

  it('should execute a simple skill call', async () => {
    const result = await agent.run('Summarize the following: This is a test document for summarization.');

    console.log('Result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.metadata.skillCalls).toBeGreaterThan(0);
  }, 60000);

  it('should handle skill errors gracefully', async () => {
    const result = await agent.run('Execute non-existent-skill with some input');

    console.log('Error Result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 60000);

  it('should track execution metadata', async () => {
    const result = await agent.run('Search for "test query"');

    expect(result.metadata).toBeDefined();
    expect(result.metadata.llmCalls).toBeGreaterThan(0);
    expect(result.metadata.skillCalls).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
  }, 60000);
});
```

**依赖**: Phase 2 (Skills), Phase 3 (Sandbox), Phase 4 (Agent)
**产出**: 独立集成测试套件
**验证**: `npm test -- tests/integration/agent-skill-standalone.test.ts` 全部通过

---

### 4.5.2 PTC 生成与执行验证

**目标**: 验证 PTC 代码生成和 Sandbox 执行的正确性

**文件**: `tests/integration/ptc-generation.test.ts`

```typescript
import { PTCGenerator } from '@/core/agent/ptc-generator';
import { Anthropic } from '@anthropic-ai/sdk';
import { SkillRegistry } from '@/core/skill/registry';
import { describe, it, expect, beforeAll } from '@jest/globals';

describe('PTC Generation and Execution', () => {
  let ptcGenerator: PTCGenerator;
  let skillRegistry: SkillRegistry;
  let llm: Anthropic;

  beforeAll(() => {
    llm = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    skillRegistry = new SkillRegistry();
    ptcGenerator = new PTCGenerator(llm, skillRegistry);
  });

  it('should generate valid Python PTC code', async () => {
    const task = 'Search for "TypeScript best practices" and summarize the results';

    const ptcCode = await ptcGenerator.generate(task);

    console.log('Generated PTC Code:');
    console.log(ptcCode);

    // Verify it's valid Python code structure
    expect(ptcCode).toContain('executor.execute');
    expect(ptcCode).toContain('await');
    expect(ptcCode).toContain('print');
  }, 30000);

  it('should generate code with correct skill usage', async () => {
    const task = 'Summarize this text: Hello world, this is a test.';

    const ptcCode = await ptcGenerator.generate(task);

    // Should use summarize skill
    expect(ptcCode.toLowerCase()).toContain('summarize');
    expect(ptcCode).toContain("'content':");
    expect(ptcCode).toContain("'max_length':");
  }, 30000);

  it('should handle multi-step tasks', async () => {
    const task = 'Search for "AI trends" and analyze the code quality of the results';

    const ptcCode = await ptcGenerator.generate(task);

    // Should use multiple skills
    const executeCount = (ptcCode.match(/executor\.execute/g) || []).length;
    expect(executeCount).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('should include error handling in generated code', async () => {
    const task = 'Execute web-search with query "test"';

    const ptcCode = await ptcGenerator.generate(task);

    // Generated code should have proper structure
    expect(ptcCode).toMatch(/async def main\(\)/);
    expect(ptcCode).toMatch(/try:/);
    expect(ptcCode).toMatch(/except/);
  }, 30000);
});
```

**依赖**: 4.2 PTC Generator
**产出**: PTC 生成验证测试
**验证**: 所有 PTC 生成测试通过

---

### 4.5.3 Sandbox 集成验证

**目标**: 确保 Sandbox 正确执行 PTC 代码并调用 Skills

**文件**: `tests/integration/sandbox-execution.test.ts`

```typescript
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('Sandbox Execution with Skills', () => {
  let sandbox: LocalSandboxAdapter;

  beforeAll(() => {
    sandbox = new LocalSandboxAdapter({
      pythonPath: 'python3',
      workspace: '/tmp/motia-sandbox-test'
    });
  });

  afterAll(async () => {
    await sandbox.cleanup();
  });

  it('should execute simple skill call', async () => {
    const code = `
result = await executor.execute('summarize', {
    'content': 'This is a test document for summarization.',
    'max_length': 50
})
print(result)
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 30000
    });

    console.log('Sandbox Result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.stdout).toBeDefined();
  }, 30000);

  it('should handle multiple skill calls', async () => {
    const code = `
result1 = await executor.execute('summarize', {
    'content': 'First document',
    'max_length': 50
})

result2 = await executor.execute('summarize', {
    'content': 'Second document',
    'max_length': 50
})

print({"result1": result1, "result2": result2})
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 30000
    });

    expect(result.success).toBe(true);
  }, 30000);

  it('should handle skill execution errors', async () => {
    const code = `
result = await executor.execute('non-existent-skill', {'input': 'test'})
print(result)
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 30000
    });

    console.log('Error Result:', result);

    // Should not throw, but return error information
    expect(result).toBeDefined();
    expect(result.stderr || !result.success).toBeTruthy();
  }, 30000);

  it('should respect timeout limits', async () => {
    const code = `
import asyncio
await asyncio.sleep(35)  # Exceed 30s timeout
print('done')
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd(),
      timeout: 30000  // 30 seconds
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('timeout');
  }, 40000);
});
```

**依赖**: 3.2 Local Sandbox, 2.3 Skill Executor
**产出**: Sandbox 集成验证测试
**验证**: 所有 Sandbox 执行测试通过

---

### 4.5.4 端到端流程验证

**目标**: 验证完整的 Agent → PTC → Sandbox → Skills 流程

**文件**: `tests/integration/e2e-agent-flow.test.ts`

```typescript
import { Agent } from '@/core/agent/agent';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('End-to-End Agent Flow', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant with access to various skills.',
      availableSkills: ['web-search', 'summarize', 'code-analysis'],
      sandbox: {
        type: 'local'
      }
    });
  });

  afterEach(async () => {
    await agent.cleanup();
  });

  it('should execute complete workflow: planning → PTC generation → execution', async () => {
    const task = 'Summarize the text: Artificial intelligence is transforming industries worldwide.';

    const result = await agent.run(task);

    console.log('Complete Workflow Result:');
    console.log(JSON.stringify(result, null, 2));

    // Verify overall success
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();

    // Verify workflow steps
    expect(result.steps).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);

    // Verify step types
    const stepTypes = result.steps.map(s => s.type);
    expect(stepTypes).toContain('planning');
    expect(stepTypes).toContain('ptc-generation');
    expect(stepTypes).toContain('execution');

    // Verify metadata
    expect(result.metadata.llmCalls).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
  }, 60000);

  it('should handle complex multi-skill tasks', async () => {
    const task = 'Search for "Python best practices" and summarize the top 3 results';

    const result = await agent.run(task);

    console.log('Multi-Skill Task Result:');
    console.log(JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.metadata.skillCalls).toBeGreaterThanOrEqual(2);
  }, 90000);

  it('should provide detailed execution steps for debugging', async () => {
    const task = 'Analyze the code quality of this Python code: print("hello")';

    const result = await agent.run(task);

    console.log('Execution Steps:');
    result.steps.forEach((step, index) => {
      console.log(`\nStep ${index + 1}:`);
      console.log(`  Type: ${step.type}`);
      console.log(`  Timestamp: ${step.timestamp}`);
      console.log(`  Content: ${step.content.substring(0, 200)}...`);
    });

    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every(s => s.timestamp)).toBe(true);
  }, 60000);
});
```

**依赖**: 4.3 Agent, 4.2 PTC Generator, 3.2 Sandbox, 2.3 Skill Executor
**产出**: 端到端流程验证测试
**验证**: 所有端到端测试通过

---

### 4.5.5 性能基准测试

**目标**: 建立性能基准，确保系统满足基本性能要求

**文件**: `tests/performance/benchmark.test.ts`

```typescript
import { Agent } from '@/core/agent/agent';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Performance Benchmarks', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['summarize', 'code-analysis'],
      sandbox: {
        type: 'local'
      }
    });
  });

  afterEach(async () => {
    await agent.cleanup();
  });

  it('should complete simple task within 30 seconds', async () => {
    const startTime = Date.now();

    const result = await agent.run('Summarize: This is a test.');

    const executionTime = Date.now() - startTime;

    console.log(`Execution time: ${executionTime}ms`);

    expect(result.success).toBe(true);
    expect(executionTime).toBeLessThan(30000);
  }, 35000);

  it('should complete multi-skill task within 60 seconds', async () => {
    const startTime = Date.now();

    const result = await agent.run('Analyze code quality of: def foo(): pass');

    const executionTime = Date.now() - startTime;

    console.log(`Execution time: ${executionTime}ms`);

    expect(result.success).toBe(true);
    expect(executionTime).toBeLessThan(60000);
  }, 65000);

  it('should maintain acceptable memory usage', async () => {
    const memBefore = process.memoryUsage();

    // Execute multiple tasks
    for (let i = 0; i < 5; i++) {
      await agent.run(`Summarize task ${i}: Test content.`);
    }

    const memAfter = process.memoryUsage();
    const memIncrease = memAfter.heapUsed - memBefore.heapUsed;

    console.log(`Memory increase: ${(memIncrease / 1024 / 1024).toFixed(2)} MB`);

    // Memory increase should be reasonable (< 100 MB for 5 tasks)
    expect(memIncrease).toBeLessThan(100 * 1024 * 1024);
  }, 120000);

  it('should handle concurrent requests', async () => {
    const tasks = [
      'Summarize: Task 1',
      'Summarize: Task 2',
      'Summarize: Task 3'
    ];

    const startTime = Date.now();

    const results = await Promise.all(
      tasks.map(task => agent.run(task))
    );

    const executionTime = Date.now() - startTime;

    console.log(`Concurrent execution time: ${executionTime}ms`);

    expect(results.every(r => r.success)).toBe(true);
    expect(executionTime).toBeLessThan(60000); // Should be faster than sequential
  }, 65000);
});
```

**依赖**: 所有前置阶段
**产出**: 性能基准测试套件
**验证**: 所有性能基准测试通过

---

### 4.5.6 独立测试执行脚本

**目标**: 创建便捷的测试执行脚本

**文件**: `scripts/test-standalone.sh`

```bash
#!/bin/bash

echo "================================"
echo "Agent + Skill Standalone Tests"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test phases
PHASES=(
  "ptc-generation:PTC Generation Tests"
  "sandbox-execution:Sandbox Execution Tests"
  "agent-skill-standalone:Agent + Skill Integration"
  "e2e-agent-flow:End-to-End Flow"
  "benchmark:Performance Benchmarks"
)

failed=false

for phase in "${PHASES[@]}"; do
  IFS=':' read -r test_name description <<< "$phase"

  echo "Running: $description"
  echo "--------------------------------"

  if npm test -- "tests/integration/$test_name.test.ts" --verbose; then
    echo -e "${GREEN}✓ $description PASSED${NC}"
  else
    echo -e "${RED}✗ $description FAILED${NC}"
    failed=true
  fi

  echo ""
done

echo "================================"
if [ "$failed" = true ]; then
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
else
  echo -e "${GREEN}All standalone tests passed!${NC}"
  echo "You can now proceed to Phase 5: Motia Integration"
  exit 0
fi
```

**package.json 添加脚本**:

```json
{
  "scripts": {
    "test:standalone": "bash scripts/test-standalone.sh",
    "test:ptc": "npm test -- tests/integration/ptc-generation.test.ts",
    "test:sandbox": "npm test -- tests/integration/sandbox-execution.test.ts",
    "test:e2e": "npm test -- tests/integration/e2e-agent-flow.test.ts",
    "test:benchmark": "npm test -- tests/performance/benchmark.test.ts"
  }
}
```

**依赖**: 所有 4.5.x 测试
**产出**: 便捷的测试执行脚本
**验证**: `npm run test:standalone` 全部通过

---

### 4.5.7 故障排查指南

**目标**: 提供常见问题的排查方法

**文件**: `docs/TROUBLESHOOTING_STANDALONE.md`

```markdown
# Agent + Skill 独立测试故障排查指南

## 常见问题

### 1. PTC 生成失败

**症状**: PTC 生成测试失败，LLM 返回无效代码

**可能原因**:
- ANTHROPIC_API_KEY 未设置或无效
- LLM 响应格式不符合预期
- Skill schema 加载失败

**排查步骤**:
```bash
# 检查 API key
echo $ANTHROPIC_API_KEY

# 检查 Skill registry
npm test -- tests/unit/skill/registry.test.ts

# 查看详细日志
DEBUG=* npm test -- tests/integration/ptc-generation.test.ts
```

---

### 2. Sandbox 执行失败

**症状**: Sandbox 执行测试失败，Python 进程错误

**可能原因**:
- Python 未安装或版本不兼容
- Skill executor 路径错误
- Python 依赖缺失

**排查步骤**:
```bash
# 检查 Python
python3 --version  # Should be 3.8+

# 检查依赖
pip list | grep -E "(pydantic|pyyaml|asyncio)"

# 手动测试 Skill executor
cd skills/summarize
python3 -c "from core.skill.executor import SkillExecutor; print('OK')"
```

---

### 3. Skill 执行超时

**症状**: Skill 执行时间过长导致超时

**可能原因**:
- Skill 实现效率低
- 外部 API 调用慢
- 网络问题

**排查步骤**:
```bash
# 检查 Skill 实现
cat skills/web-search/handler.py

# 增加 timeout
# 在测试中设置 timeout: 120000

# 检查网络连接
curl -I https://api.example.com
```

---

### 4. 内存泄漏

**症状**: 多次执行后内存持续增长

**可能原因**:
- Sandbox session 未清理
- Python 进程未终止
- LLM 客户端未释放

**排查步骤**:
```bash
# 运行内存测试
npm test -- tests/performance/benchmark.test.ts

# 检查进程
ps aux | grep python

# 检查 Sandbox 清理
npm test -- tests/unit/sandbox/cleanup.test.ts
```

---

### 5. 性能不达标

**症状**: 执行时间超过预期

**可能原因**:
- LLM API 延迟高
- Sandbox 启动慢
- Skill 实现效率低

**排查步骤**:
```bash
# 运行性能基准
npm run test:benchmark

# 分析瓶颈
# 查看每个 step 的 executionTime

# 优化建议
# - 考虑缓存 LLM 响应
# - 预热 Sandbox
# - 优化 Skill 实现
```
```

**依赖**: 实际测试经验
**产出**: 故障排查文档
**验证**: 能根据文档解决常见问题

---

### ✅ Phase 4.5 验收标准

完成此阶段后，你应该能够：

- ✅ **独立运行所有集成测试**（无需 Motia）
- ✅ **PTC 生成和执行正确** - Agent 能生成有效的 Python 代码
- ✅ **Skills 在 Sandbox 中正常工作** - 所有三种类型的 Skills 都能正确执行
- ✅ **端到端流程顺畅** - 从 task input 到 final output 的完整流程无问题
- ✅ **性能符合预期** - 简单任务 < 30s，复杂任务 < 60s
- ✅ **错误处理完善** - 各种错误情况都能正确处理和报告
- ✅ **调试信息充足** - 执行步骤、日志、错误信息清晰

**执行命令验证**:
```bash
# 运行所有独立测试
npm run test:standalone

# 应该看到:
# ✓ PTC Generation Tests PASSED
# ✓ Sandbox Execution Tests PASSED
# ✓ Agent + Skill Integration PASSED
# ✓ End-to-End Flow PASSED
# ✓ Performance Benchmarks PASSED
# All standalone tests passed!
```

**如果测试失败**:
1. 查看具体失败的测试用例
2. 参考 `docs/TROUBLESHOOTING_STANDALONE.md` 排查
3. 修复问题后重新测试
4. **不要继续 Phase 5，直到所有测试通过**

**只有当 Phase 4.5 完全通过后，才应该开始 Phase 5 (Motia 集成)**

---

## Phase 5: Motia 集成层实现

**架构设计原则**：
- ✅ **框架解耦**: Manager 层不依赖 Motia，可在其他框架使用
- ✅ **Session 独立**: 每个 session 有独立的 Agent 和 Sandbox 实例
- ✅ **状态管理**: Agent 维护 session 状态（对话历史、变量等）
- ✅ **并发安全**: 不同 session 之间完全隔离

**架构分层**：
```
Motia Steps (框架层)
    ↓
AgentManager / SandboxManager (框架无关的 Manager 层)
    ↓
Agent / Sandbox (有状态，session-scoped)
```

详细设计见: `docs/AGENT_MANAGER_ARCHITECTURE.md`

---

### 5.1 Motia Config 配置（简化）

**文件**: `motia.config.ts`

```typescript
import { defineConfig } from '@motiadev/core';
import endpointPlugin from '@motiadev/plugin-endpoint/plugin';
import logsPlugin from '@motiadev/plugin-logs/plugin';
import observabilityPlugin from '@motiadev/plugin-observability/plugin';
import statesPlugin from '@motiadev/plugin-states/plugin';
import bullmqPlugin from '@motiadev/plugin-bullmq/plugin';

export default defineConfig({
  plugins: [
    // ✅ 只使用 Motia 内置插件
    observabilityPlugin,
    statesPlugin,
    endpointPlugin,
    logsPlugin,
    bullmqPlugin

    // ❌ 不需要 Agent/Sandbox Plugin
    // Agent 和 Sandbox 由独立的 Manager 管理
  ]
});
```

**说明**：
- ✅ **简化配置** - Motia 只负责事件流转和插件
- ✅ **Manager 独立** - AgentManager 和 SandboxManager 在应用层管理
- ✅ **框架解耦** - Manager 可以在任何框架中使用

**依赖**: 所有前置阶段
**产出**: Motia 配置
**验证**: `npm run dev` 成功启动

---

### 5.2 AgentManager 实现

**文件**: `src/core/agent/manager.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Agent } from './agent';
import { AgentConfig } from './types';

export interface AgentManagerConfig {
  sessionTimeout: number;      // Session 过期时间（毫秒）
  maxSessions: number;          // 最大 session 数量
  agentConfig: AgentConfig;     // Agent 配置
}

export class AgentManager {
  private sessions: Map<string, Agent> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private config: AgentManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: AgentManagerConfig) {
    this.config = config;

    // 定期清理过期 session
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * 获取或创建 Agent（按 session）
   */
  async acquire(sessionId: string): Promise<Agent> {
    if (this.sessions.has(sessionId)) {
      const agent = this.sessions.get(sessionId)!;
      this.lastActivity.set(sessionId, Date.now());
      return agent;
    }

    // ✅ 创建新的 Agent（带 session 状态）
    const agent = new Agent(this.config.agentConfig, sessionId);
    this.sessions.set(sessionId, agent);
    this.lastActivity.set(sessionId, Date.now());

    // 限制 session 数量
    if (this.sessions.size > this.config.maxSessions) {
      await this.evictOldestSession();
    }

    return agent;
  }

  /**
   * 释放 session
   */
  async release(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      const agent = this.sessions.get(sessionId)!;
      await agent.cleanup();
      this.sessions.delete(sessionId);
      this.lastActivity.delete(sessionId);
    }
  }

  /**
   * 清理过期 session
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (now - lastActivity > this.config.sessionTimeout) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      await this.release(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }

  /**
   * 驱逐最旧的 session
   */
  private async evictOldestSession(): Promise<void> {
    let oldestSession: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestSession = sessionId;
      }
    }

    if (oldestSession) {
      await this.release(oldestSession);
      console.log(`Evicted oldest session: ${oldestSession}`);
    }
  }

  /**
   * 关闭 Manager
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await Promise.all(
      Array.from(this.sessions.keys()).map(id => this.release(id))
    );
  }
}
```

**依赖**: 4.3 Agent
**产出**: AgentManager
**验证**: 单元测试 + 并发测试

---

### 5.3 SandboxManager 实现

**文件**: `src/core/sandbox/manager.ts`

```typescript
import { SandboxAdapter } from './types';
import { SandboxFactory } from './factory';
import { SandboxAdapterConfig } from './types';

export interface SandboxManagerConfig {
  sessionTimeout: number;
  maxSessions: number;
  sandboxConfig: SandboxAdapterConfig;
}

export class SandboxManager {
  private sessions: Map<string, SandboxAdapter> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private config: SandboxManagerConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: SandboxManagerConfig) {
    this.config = config;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000);
  }

  /**
   * 获取或创建 Sandbox（按 session）
   */
  async acquire(sessionId: string): Promise<SandboxAdapter> {
    if (this.sessions.has(sessionId)) {
      const sandbox = this.sessions.get(sessionId)!;
      this.lastActivity.set(sessionId, Date.now());
      return sandbox;
    }

    // 创建新的 Sandbox 实例
    const sandbox = SandboxFactory.create(this.config.sandboxConfig);
    this.sessions.set(sessionId, sandbox);
    this.lastActivity.set(sessionId, Date.now());

    if (this.sessions.size > this.config.maxSessions) {
      await this.evictOldestSession();
    }

    return sandbox;
  }

  /**
   * 释放 session
   */
  async release(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      const sandbox = this.sessions.get(sessionId)!;
      await sandbox.cleanup(sessionId);
      this.sessions.delete(sessionId);
      this.lastActivity.delete(sessionId);
    }
  }

  /**
   * 清理过期 session
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expired: string[] = [];

    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (now - lastActivity > this.config.sessionTimeout) {
        expired.push(sessionId);
      }
    }

    for (const sessionId of expired) {
      await this.release(sessionId);
      console.log(`Cleaned up expired sandbox session: ${sessionId}`);
    }
  }

  /**
   * 驱逐最旧的 session
   */
  private async evictOldestSession(): Promise<void> {
    let oldestSession: string | null = null;
    let oldestTime = Infinity;

    for (const [sessionId, lastActivity] of this.lastActivity) {
      if (lastActivity < oldestTime) {
        oldestTime = lastActivity;
        oldestSession = sessionId;
      }
    }

    if (oldestSession) {
      await this.release(oldestSession);
      console.log(`Evicted oldest sandbox session: ${oldestSession}`);
    }
  }

  /**
   * 关闭 Manager
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    await Promise.all(
      Array.from(this.sessions.keys()).map(id => this.release(id))
    );
  }
}
```

**依赖**: 3.3 Sandbox Factory
**产出**: SandboxManager
**验证**: 单元测试 + 并发测试

---

### 5.4 修改 Agent 类支持 Session 状态

**文件**: `src/core/agent/agent.ts`

**关键修改**：

```typescript
export interface SessionState {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;

  // 对话历史
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;

  // 执行历史
  executionHistory: Array<{
    task: string;
    result: any;
    timestamp: number;
    executionTime: number;
  }>;

  // 中间变量
  variables: Map<string, any>;
}

export class Agent {
  // ✅ 添加 session 相关字段
  private sessionId: string;
  private state: SessionState;

  private config: AgentConfig;
  private llm: LLMClient;
  private sandbox: any;
  private ptcGenerator: PTCGenerator;

  // ✅ 修改构造函数签名，接受 sessionId
  constructor(config: AgentConfig, sessionId: string) {
    this.config = config;
    this.sessionId = sessionId;

    // 初始化 LLM
    this.llm = new LLMClient(config.llm);

    // 初始化 Sandbox
    this.sandbox = SandboxFactory.create(config.sandbox);

    // 初始化 PTC Generator
    this.ptcGenerator = new PTCGenerator(this.llm, skills);

    // ✅ 初始化 session 状态
    this.state = {
      sessionId,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      conversationHistory: [],
      executionHistory: [],
      variables: new Map()
    };
  }

  async run(task: string): Promise<AgentResult> {
    // ✅ 更新活动时间
    this.state.lastActivityAt = Date.now();

    // ✅ 记录用户输入
    this.state.conversationHistory.push({
      role: 'user',
      content: task,
      timestamp: Date.now()
    });

    const startTime = Date.now();
    const steps: AgentStep[] = [];

    try {
      // Step 1: 生成 PTC（可以访问历史上下文）
      const ptcCode = await this.ptcGenerator.generate(task, {
        history: this.state.conversationHistory,
        variables: Object.fromEntries(this.state.variables)
      });

      // Step 2: 执行
      const sandboxResult = await this.sandbox.execute(ptcCode, {
        sessionId: this.sessionId,
        variables: Object.fromEntries(this.state.variables)
      });

      // Step 3: 更新状态
      if (sandboxResult.success) {
        // 记录执行历史
        this.state.executionHistory.push({
          task,
          result: sandboxResult.output,
          timestamp: Date.now(),
          executionTime: Date.now() - startTime
        });

        // 记录助手回复
        this.state.conversationHistory.push({
          role: 'assistant',
          content: sandboxResult.output,
          timestamp: Date.now()
        });

        // 保存变量（如果有）
        if (sandboxResult.variables) {
          Object.entries(sandboxResult.variables).forEach(([key, value]) => {
            this.state.variables.set(key, value);
          });
        }

        return {
          success: true,
          sessionId: this.sessionId,
          output: sandboxResult.output,
          steps,
          executionTime: Date.now() - startTime,
          state: {
            conversationLength: this.state.conversationHistory.length,
            executionCount: this.state.executionHistory.length,
            variablesCount: this.state.variables.size
          }
        };
      }

      // ... 错误处理
    } catch (error: any) {
      // 记录错误
      this.state.conversationHistory.push({
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * 获取 session 状态
   */
  getState(): Readonly<SessionState> {
    return this.state;
  }

  /**
   * 设置变量
   */
  setVariable(key: string, value: any): void {
    this.state.variables.set(key, value);
  }

  /**
   * 获取变量
   */
  getVariable(key: string): any {
    return this.state.variables.get(key);
  }

  /**
   * 清理 session
   */
  async cleanup(): Promise<void> {
    await this.sandbox.cleanup(this.sessionId);
    // 清空状态
    this.state.conversationHistory = [];
    this.state.executionHistory = [];
    this.state.variables.clear();
  }
}
```

**依赖**: 4.3 Agent
**产出**: 支持 session 状态的 Agent
**验证**: 单元测试

---

### 5.5 Master Agent Step 实现

**文件**: `steps/agents/master-agent.step.ts`

```typescript
import type { EventConfig } from 'motia';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AgentManager } from '@/core/agent/manager';
import { SandboxManager } from '@/core/sandbox/manager';

// ✅ 全局 Manager 实例（应用启动时创建）
const agentManager = new AgentManager({
  sessionTimeout: 30 * 60 * 1000,  // 30 分钟
  maxSessions: 1000,
  agentConfig: {
    llm: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      apiKey: process.env.ANTHROPIC_API_KEY
    },
    availableSkills: ['web-search', 'summarize', 'code-analysis'],
    constraints: {
      timeout: 60000,
      maxIterations: 5
    }
  }
});

const sandboxManager = new SandboxManager({
  sessionTimeout: 30 * 60 * 1000,
  maxSessions: 1000,
  sandboxConfig: {
    type: 'local',
    pythonPath: process.env.PYTHON_PATH || 'python3',
    workspace: '/tmp/motia-sandbox',
    timeout: 60000
  }
});

// ✅ 应用关闭时清理
process.on('SIGTERM', async () => {
  console.log('Shutting down managers...');
  await agentManager.shutdown();
  await sandboxManager.shutdown();
});

export const inputSchema = z.object({
  task: z.string(),
  sessionId: z.string().optional(),  // 可选：继续已有 session
  continue: z.boolean().optional()   // 是否继续之前的对话
});

export const config: EventConfig = {
  type: 'event',
  name: 'master-agent',
  description: 'Master agent that orchestrates task execution using PTC',
  subscribes: ['agent.task.execute'],
  emits: [
    'agent.task.completed',
    'agent.task.failed',
    { topic: 'agent.step.started', label: 'Agent step started' },
    { topic: 'agent.step.completed', label: 'Agent step completed', conditional: true }
  ],
  flows: ['agent-workflow']
};

export const handler = async (
  input: z.infer<typeof inputSchema>,
  { emit, logger, state }: any
) => {
  // ✅ 获取或创建 sessionId
  const sessionId = input.sessionId || uuidv4();

  logger.info('Master Agent: Starting task execution', {
    task: input.task,
    sessionId
  });

  try {
    // ✅ 从 Manager 获取 Agent 和 Sandbox（每个 session 独立）
    const agent = await agentManager.acquire(sessionId);
    const sandbox = await sandboxManager.acquire(sessionId);

    logger.info('Agent and Sandbox acquired', { sessionId });

    // 如果是继续对话，获取历史
    if (input.continue) {
      const history = agent.getConversationHistory();
      logger.info('Continuing conversation', {
        sessionId,
        historyLength: history.length
      });
    }

    // ✅ 执行任务（Agent 维护 session 状态）
    const result = await agent.run(input.task);

    logger.info('Task execution completed', {
      sessionId,
      success: result.success,
      executionTime: result.executionTime
    });

    // ✅ 发送完成事件
    await emit({
      topic: 'agent.task.completed',
      data: {
        sessionId,
        task: input.task,
        result: {
          success: result.success,
          output: result.output,
          executionTime: result.executionTime,
          state: result.state
        }
      }
    });

    return {
      success: true,
      sessionId,  // ✅ 返回 sessionId，客户端可以继续
      output: result.output,
      state: result.state
    };

  } catch (error: any) {
    logger.error('Agent execution failed', {
      error: error.message,
      stack: error.stack,
      sessionId
    });

    // ✅ 发送失败事件
    await emit({
      topic: 'agent.task.failed',
      data: {
        sessionId,
        task: input.task,
        error: error.message,
        stack: error.stack
      }
    });

    throw error;

  } finally {
    // ✅ 不释放！让 session 持续存在
    // Manager 会自动清理过期 session
    // await agentManager.release(sessionId);
    // await sandboxManager.release(sessionId);
  }
};
```

**说明**：
- ✅ **每个 session 独立** - Agent 和 Sandbox 实例绑定到 session
- ✅ **状态维护** - Agent 维护对话历史和变量
- ✅ **自动清理** - Manager 自动清理过期 session
- ✅ **框架解耦** - Manager 可以在任何框架中使用

**依赖**: 5.2 AgentManager, 5.3 SandboxManager, 5.4 Agent
**产出**: Master Agent Motia Step
**验证**: 通过 Motia 事件触发 Agent 执行

---

### 5.6 应用初始化

**文件**: `src/index.ts`

```typescript
import { AgentManager } from '@/core/agent/manager';
import { SandboxManager } from '@/core/sandbox/manager';

// ✅ 导出全局 Manager（供 Step 使用）
export const agentManager = new AgentManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'),  // 30 分钟
  maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
  agentConfig: {
    llm: {
      provider: process.env.LLM_PROVIDER as 'anthropic' | 'openai-compatible' || 'anthropic',
      model: process.env.LLM_MODEL || 'claude-sonnet-4-5',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
    },
    availableSkills: ['web-search', 'summarize', 'code-analysis'],
    sandbox: {
      type: 'local',
      pythonPath: process.env.PYTHON_PATH || 'python3'
    },
    constraints: {
      timeout: parseInt(process.env.TASK_TIMEOUT || '60000'),
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '5')
    }
  }
});

export const sandboxManager = new SandboxManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'),
  maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
  sandboxConfig: {
    type: 'local',
    pythonPath: process.env.PYTHON_PATH || 'python3',
    workspace: process.env.SANDBOX_WORKSPACE || '/tmp/motia-sandbox',
    timeout: parseInt(process.env.TASK_TIMEOUT || '60000')
  }
});

// ✅ 优雅关闭
process.on('SIGTERM', async () => {
  console.log('Shutting down managers...');
  await agentManager.shutdown();
  await sandboxManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down managers...');
  await agentManager.shutdown();
  await sandboxManager.shutdown();
  process.exit(0);
});
```

**依赖**: 5.2, 5.3
**产出**: 应用入口
**验证**: `npm run dev` 启动成功

---

## ✅ Phase 5 验收标准

完成此阶段后，你应该能够：

### 5.1 功能验证

- ✅ **Session 管理** - AgentManager 和 SandboxManager 正确管理 session 生命周期
- ✅ **状态隔离** - 不同 session 之间状态完全独立
- ✅ **状态维护** - Agent 正确维护对话历史、执行历史和变量
- ✅ **自动清理** - 过期 session 自动清理
- ✅ **并发安全** - 多个并发请求无状态污染

### 5.2 测试验证

```bash
# 单元测试
npm test -- tests/unit/agent/manager.test.ts
npm test -- tests/unit/sandbox/manager.test.ts

# 并发测试
npm test -- tests/integration/concurrent-sessions.test.ts

# 端到端测试
npm test -- tests/integration/e2e-agent-flow.test.ts
```

**应该看到**:
```
✓ AgentManager manages sessions correctly
✓ SandboxManager manages sessions correctly
✓ Concurrent requests don't interfere
✓ Session state is maintained across requests
✓ Expired sessions are cleaned up automatically
```

### 5.3 架构验证

- ✅ **框架解耦** - Manager 可以独立于 Motia 使用
- ✅ **易迁移** - 可以轻松切换到 Express/Fastify 等其他框架
- ✅ **易测试** - Manager 可以独立测试

### 5.4 性能验证（当前版本未优化）

**注意**: 当前版本优先保证正确性，性能优化见 `docs/PERFORMANCE_OPTIMIZATION.md`

预期性能（未优化）:
- Session 创建: ~100ms
- 内存占用: 每个 session ~10-15MB
- 并发能力: 支持 ~100 并发 session

**如果测试失败**:
1. 查看具体失败的测试用例
2. 参考 `docs/TROUBLESHOOTING_STANDALONE.md` 排查
3. 修复问题后重新测试
4. **不要继续 Phase 6，直到所有测试通过**

---

## Phase 6: 示例 Subagents 实现

### 6.1 Code Reviewer Subagent

**文件**: `subagents/code-reviewer/agent.yaml`

```yaml
name: CodeReviewer
description: Specialized agent for code review and quality analysis

agent:
  system_prompt: |
    You are a code review expert with deep knowledge of software engineering best practices.

    Your responsibilities:
    - Analyze code for quality, security, and maintainability
    - Identify bugs, anti-patterns, and potential issues
    - Provide actionable feedback for improvement
    - Check adherence to coding standards
    - Suggest refactoring opportunities

    Available skills:
    - read-file: Read file contents
    - git-diff: Get git diff for changes
    - code-analysis: Analyze code quality metrics
    - security-scan: Scan for security vulnerabilities

    Constraints:
    - Be thorough but concise
    - Prioritize critical issues
    - Provide specific line references
    - Suggest concrete improvements

  available_skills:
    - read-file
    - git-diff
    - code-analysis
    - security-scan

  constraints:
    max_iterations: 5
    timeout: 60000
```

**文件**: `subagents/code-reviewer/prompts/system.txt`

```text
You are a code review expert with deep knowledge of software engineering best practices.

Your responsibilities:
- Analyze code for quality, security, and maintainability
- Identify bugs, anti-patterns, and potential issues
- Provide actionable feedback for improvement
- Check adherence to coding standards
- Suggest refactoring opportunities

When reviewing code:
1. Start with a high-level overview
2. Identify critical issues first
3. Provide specific, actionable feedback
4. Include line references where applicable
5. Suggest concrete improvements or alternatives

Remember to be constructive and respectful in your feedback.
```

---

### 6.2 Data Analyst Subagent

**文件**: `subagents/data-analyst/agent.yaml`

```yaml
name: DataAnalyst
description: Specialized agent for data analysis and visualization

agent:
  system_prompt: |
    You are a data analyst expert specializing in data processing, analysis, and visualization.

    Your responsibilities:
    - Process and clean data
    - Perform statistical analysis
    - Create visualizations and charts
    - Generate insights and recommendations
    - Handle structured and unstructured data

    Available skills:
    - data-processing: Process and transform data
    - statistical-analysis: Perform statistical tests
    - visualization: Create charts and graphs
    - csv-reader: Read CSV files
    - json-parser: Parse JSON data

    Constraints:
    - Ensure data privacy and security
    - Validate assumptions
    - Document analysis methodology
    - Provide clear interpretations

  available_skills:
    - data-processing
    - statistical-analysis
    - visualization
    - csv-reader
    - json-parser

  constraints:
    max_iterations: 10
    timeout: 120000
```

---

### 6.3 Security Auditor Subagent

**文件**: `subagents/security-auditor/agent.yaml`

```yaml
name: SecurityAuditor
description: Specialized agent for security analysis and vulnerability detection

agent:
  system_prompt: |
    You are a security expert specializing in application security and vulnerability assessment.

    Your responsibilities:
    - Identify security vulnerabilities
    - Check for OWASP Top 10 issues
    - Review authentication and authorization
    - Analyze data encryption and privacy
    - Assess compliance with security standards

    Available skills:
    - security-scan: Scan for security issues
    - dependency-check: Check for vulnerable dependencies
    - code-analysis: Analyze code for security patterns
    - secret-scanner: Scan for exposed secrets

    Constraints:
    - Follow responsible disclosure
    - Prioritize critical vulnerabilities
    - Provide remediation guidance
    - Consider security trade-offs

  available_skills:
    - security-scan
    - dependency-check
    - code-analysis
    - secret-scanner

  constraints:
    max_iterations: 5
    timeout: 90000
```

**依赖**: 4.4 Master Agent
**产出**: 三个示例 Subagents
**验证**: Master Agent 能成功委派任务

---

## Phase 7: 测试与验证

### 7.1 单元测试

**文件**: `tests/unit/agent/agent.test.ts`

```typescript
import { Agent } from '@/core/agent/agent';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['web-search', 'summarize']
    });
  });

  afterEach(async () => {
    await agent.cleanup();
  });

  it('should initialize successfully', () => {
    expect(agent).toBeDefined();
  });

  it('should execute a simple task', async () => {
    const result = await agent.run('Search for "TypeScript best practices"');
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
  }, 30000);
});
```

---

### 7.2 集成测试

**文件**: `tests/integration/sandbox/integration.test.ts`

```typescript
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';
import { describe, it, expect } from '@jest/globals';

describe('Sandbox Integration', () => {
  it('should execute PTC code', async () => {
    const sandbox = new LocalSandboxAdapter({
      pythonPath: 'python3',
      workspace: '/tmp/motia-test'
    });

    const code = `
result = await executor.execute('summarize', {
  'content': 'This is a test document.',
  'max_length': 50
})
print(result)
`;

    const result = await sandbox.execute(code, {
      skills: [],
      skillImplPath: process.cwd()
    });

    expect(result.success).toBe(true);
    await sandbox.cleanup();
  }, 30000);
});
```

---

### 7.3 端到端测试

**文件**: `tests/e2e/master-agent.e2e.test.ts`

```typescript
import { MasterAgent } from '@/core/agent/master-agent';
import { describe, it, expect } from '@jest/globals';

describe('Master Agent E2E', () => {
  it('should delegate task to subagent', async () => {
    const masterAgent = new MasterAgent({
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['*'],
      subagents: ['code-reviewer']
    });

    const result = await masterAgent.run('Review the code in src/utils.ts');
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();

    await masterAgent.cleanup();
  }, 60000);
});
```

**依赖**: 所有实现
**产出**: 完整的测试套件
**验证**: `npm test` 全部通过

---

## Phase 8: 优化与扩展

### 8.1 性能优化

**任务**:
- [ ] 实现 Skill 预加载缓存
- [ ] 添加 LLM 响应缓存
- [ ] 优化 Sandbox 启动时间
- [ ] 实现并行 Subagent 执行
- [ ] 添加连接池管理

**验证**: 性能基准测试显示改进

---

### 8.2 可观测性增强

**任务**:
- [ ] 集成 OpenTelemetry 追踪
- [ ] 添加 Agent 思考链可视化
- [ ] 实现 Skill 调用追踪
- [ ] 添加性能监控 Dashboard
- [ ] 创建执行日志查看器

**验证**: 可通过 UI 查看 Agent 执行过程

---

### 8.3 错误处理完善

**任务**:
- [ ] 添加详细错误分类
- [ ] 实现自动重试机制
- [ ] 添加降级策略
- [ ] 完善错误恢复逻辑
- [ ] 创建错误处理文档

**验证**: 错误场景测试通过

---

### 8.4 生产就绪检查

**清单**:
- [ ] 所有测试通过
- [ ] 代码覆盖率 > 80%
- [ ] 性能基准达标
- [ ] 安全扫描无高危问题
- [ ] 文档完整
- [ ] 监控告警配置完成
- [ ] 部署脚本就绪
- [ ] 备份恢复方案确认

**验证**: 生产环境部署成功

---

## 🎯 总结

这个实现工作流提供了一个完整的、系统化的 Motia 分布式 Agent 系统构建指南。关键特点：

1. **分层架构**: Skill → Agent → Master → Motia
2. **渐进式实现**: 从基础到高级，逐步构建
3. **类型安全**: TypeScript + Python 类型定义
4. **事件驱动**: 深度集成 Motia 框架
5. **可扩展性**: 插件化设计，易于扩展
6. **生产就绪**: 完整的测试和监控

**下一步**:
- 从 Phase 1 开始执行
- 每完成一个 Phase，进行验证
- 根据实际情况调整实施顺序
- 保持文档和代码同步更新

**预计时间**: 2-3 周完整实现（基于全职开发）

---

*工作流版本: v1.0*
*最后更新: 2026-01-06*
