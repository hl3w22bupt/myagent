# MyAgent Skill 系统增强计划

> 借鉴 OpenClaw 优秀特性，打造更强大的 Agent Skill 生态系统

**创建日期**: 2026-03-08
**状态**: Proposal
**优先级**: High
**预计工期**: 6-8 周

---

## 📋 目录

- [背景与目标](#背景与目标)
- [OpenClaw vs MyAgent 对比分析](#openclaw-vs-myagent-对比分析)
- [核心增强特性](#核心增强特性)
- [实施路线图](#实施路线图)
- [技术设计](#技术设计)
- [测试计划](#测试计划)
- [风险评估](#风险评估)

---

## 背景与目标

### 当前状态

MyAgent 已经拥有一个强大的 Skill 系统：
- ✅ 完整的类型系统（JSON Schema）
- ✅ Python handler 执行
- ✅ 沙箱隔离
- ✅ Hook 系统
- ✅ 技能链支持
- ✅ Claude Skills 适配器

### 改进动机

通过对比分析 OpenClaw 的 Skill 系统，我们发现了一些可以借鉴的优秀特性：

1. **依赖管理自动化** - 自动检查和安装依赖
2. **环境变量注入** - 灵活的配置管理
3. **多层级加载** - 更灵活的技能组织
4. **热重载** - 开发体验提升
5. **公共生态** - ClawHub 类似的技能注册表

### 目标

**保持 MyAgent 现有优势的同时**：
- 提升开发体验
- 增强可维护性
- 改善部署流程
- 构建生态系统

---

## OpenClaw vs MyAgent 对比分析

### 功能对比矩阵

| 功能 | MyAgent | OpenClaw | 借鉴价值 |
|------|---------|----------|----------|
| **代码执行** | ✅ 完整支持 | ✅ 通过工具调用 | - |
| **类型验证** | ✅ JSON Schema | ❌ 依赖 Agent | 保持优势 |
| **依赖管理** | ❌ 手动检查 | ✅ 自动检查 | 🔴 高 |
| **自动安装** | ❌ 无 | ✅ metadata.install | 🔴 高 |
| **Hook 系统** | ✅ 完整 | ❌ 无 | 保持优势 |
| **环境检查** | ⚠️ 基础 | ✅ bins/env/config | 🔴 高 |
| **环境注入** | ❌ 无 | ✅ skills.entries.*.env | 🔴 高 |
| **沙箱支持** | ✅ 完整 | ✅ Docker | 保持优势 |
| **热重载** | ❌ 无 | ✅ Skills Watcher | 🟡 中 |
| **多层级加载** | ❌ 单层 | ✅ 3 层优先级 | 🟡 中 |
| **权限控制** | ⚠️ 基础 | ✅ allowBundled | 🟡 中 |
| **远程节点** | ❌ 无 | ✅ macOS/Linux | 🟢 低 |
| **插件系统** | ❌ 无 | ✅ Plugin Skills | 🟢 低 |
| **公共注册表** | ❌ 无 | ✅ ClawHub (5400+) | 🟢 低 |

### 核心差异

#### MyAgent 的独特优势
- ✅ **Hook 系统** - 前置/后置钩子，AOP 编程
- ✅ **技能链** - 依赖编排和组合
- ✅ **进度报告** - 详细的执行追踪
- ✅ **类型安全** - JSON Schema 验证

#### OpenClaw 的独特优势
- ✅ **依赖自动化** - requires + install
- ✅ **多层级加载** - Workspace > Managed > Bundled
- ✅ **环境注入** - per-session 环境变量
- ✅ **生态系统** - ClawHub + 5400+ 技能

### 设计哲学对比

```
MyAgent:    "Code First" - 可执行的功能单元
Claude:     "Knowledge First" - 知识驱动的辅助
OpenClaw:   "Tools First" - Agent 工具调用层
```

---

## 核心增强特性

### 🔴 高优先级特性（Phase 1，1-2 周）

#### 1. 依赖检查和环境验证系统

**问题：**
- 当前依赖检查需要手动在 handler.py 中实现
- 缺少统一的依赖声明和验证机制
- 错误信息不够友好

**解决方案：**

在 `skill.yaml` 中添加 `runtime.requires` 字段：

```yaml
# skills/web-search/skill.yaml
name: web-search
version: 1.0.0
type: hybrid

execution:
  handler: handler.py
  function: execute
  timeout: 30000

  runtime:
    requires:
      bins: ["python3", "curl"]           # 必需的二进制
      anyBins: ["uv", "pip"]              # 任一即可
      env: ["SEARCH_API_KEY"]             # 环境变量
      config: ["sandbox.enabled"]         # 配置项
      pythonPackages:                    # Python 包
        - "httpx>=0.24.0"
        - "beautifulsoup4>=4.12.0"
    primaryEnv: "SEARCH_API_KEY"          # 主要密钥
```

**实现组件：**

1. **DependencyChecker** - 依赖检查器
   - `check_bins()` - 检查二进制文件
   - `check_any_bins()` - 检查任一二进制
   - `check_env()` - 检查环境变量
   - `check_config()` - 检查配置项
   - `check_python_packages()` - 检查 Python 包
   - `validate_skill()` - 综合验证

2. **集成到 SkillRegistry**
   - 扫描时自动检查依赖
   - 不满足依赖的技能自动跳过
   - 友好的错误提示

**示例输出：**

```bash
$ npm run dev
✅ Loaded 15 skills
⚠️  Skill 'web-search-v2' skipped: missing binaries ['youtube-dl']
⚠️  Skill 'gemini-image' skipped: missing env ['GEMINI_API_KEY']
⚠️  Skill 'video-editor' skipped: missing packages ['opencv-python>=4.8.0']
```

**实际应用案例：解决当前技能依赖问题**

当前系统中存在的一些依赖问题可以通过依赖检查系统解决：

**案例 1: remotion-generator 缺少 Chrome Headless Shell**

当前问题：
```
remotion-generator 执行时失败：
❌ Chrome Headless Shell not found
```

解决方案：
```yaml
# skills/remotion-generator/skill.yaml
execution:
  runtime:
    requires:
      bins: ["node", "npm"]
      anyBins: ["ffmpeg", "chromium"]  # 视频处理需要任一
      config: ["sandbox.enabled"]

    install:
      - id: "chrome-headless-shell"
        kind: "script"
        script: "scripts/install-chrome.sh"
        bins: ["chrome-headless-shell"]
        label: "Install Chrome Headless Shell for video rendering"
```

效果：
```bash
$ npm run dev
⚠️  remotion-generator skipped: missing chrome-headless-shell
💡 Auto-install available: npm run skill:install remotion-generator
✅ Other skills loaded successfully
```

**案例 2: ffmpeg skill 缺少 FFmpeg 二进制**

解决方案：
```yaml
# skills/tool-ffmpeg/skill.yaml
name: tool-ffmpeg
version: 1.0.0
description: Process videos using FFmpeg

execution:
  runtime:
    requires:
      bins: ["ffmpeg"]

    install:
      - id: "ffmpeg-brew"
        kind: "brew"
        formula: "ffmpeg"
        os: ["darwin"]
      - id: "ffmpeg-apt"
        kind: "apt"
        packages: ["ffmpeg"]
        os: ["linux"]
```

效果：
```bash
$ npm run dev
⚠️  tool-ffmpeg skipped: missing ffmpeg
💡 Install with: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)
```

**安装脚本示例：**

```bash
# skills/remotion-generator/scripts/install-chrome.sh
#!/bin/bash

echo "🔧 Installing Chrome Headless Shell..."

# 检测平台
OS_TYPE=$(uname -s)
ARCH=$(uname -m)

if [[ "$OS_TYPE" == "Darwin" ]]; then
    if [[ "$ARCH" == "arm64" ]]; then
        CHROME_DIR="chrome-headless-shell-mac-arm64"
    else
        CHROME_DIR="chrome-headless-shell-mac-x64"
    fi
elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [[ "$ARCH" == "aarch64" ]]; then
        CHROME_DIR="chrome-headless-shell-linux-arm64"
    else
        CHROME_DIR="chrome-headless-shell-linux-x64"
    fi
else
    echo "❌ Unsupported platform: $OS_TYPE $ARCH"
    exit 1
fi

TARGET_DIR="node_modules/.remotion/chrome-headless-shell/$CHROME_DIR"
mkdir -p "$TARGET_DIR"

# 下载
echo "📥 Downloading Chrome Headless Shell..."
BASE_URL="https://storage.googleapis.com/chrome-for-testing-public"
curl -L "$BASE_URL/$CHROME_DIR/chrome-headless-shell-$CHROME_DIR.zip" -o chrome.zip

# 解压
echo "📦 Extracting..."
unzip -q chrome.zip -d "$TARGET_DIR"
rm chrome.zip

echo "✅ Chrome Headless Shell installed successfully!"
```

**效果对比：**

| 阶段 | 之前 | 之后 |
|------|------|------|
| **启动时** | 无检查，所有技能加载 | 检查依赖，跳过不满足的技能 |
| **执行时** | 突然失败，错误难懂 | 提前知道，友好提示 |
| **修复** | 手动查找，不知道缺什么 | 明确告知缺少什么，如何安装 |
| **用户体验** | 💥 混乱 | ✅ 清晰 |

#### 2. 环境变量和配置注入系统

**问题：**
- 当前环境变量需要全局配置或硬编码
- 不同环境（开发/生产）切换困难
- 敏感信息管理不便

**解决方案：**

在 `execution.runtime` 下定义默认环境变量：

```yaml
# skills/web-search/skill.yaml
execution:
  runtime:
    env:
      SEARCH_API_KEY: "sk-default-key"
      SEARCH_ENGINE: "duckduckgo"
      SEARCH_TIMEOUT: "30"
      SEARCH_MAX_RESULTS: "10"
```

**配置文件覆盖**（可选，用于敏感信息）：

```yaml
# config/skills-env.yaml
skills:
  web-search:
    apiKey:
      source: env
      provider: default
      id: SEARCH_API_KEY
    env:
      SEARCH_API_KEY: "sk-production-key-123"
      SEARCH_ENGINE: "google"
```

**实现组件：**

1. **SkillEnvLoader** - 环境变量加载器
   - `load_for_skill()` - 加载技能环境变量
   - `restore()` - 恢复原始环境
   - `get_api_key()` - 获取 API 密钥
   - `_fetch_from_provider()` - 从外部获取密钥

2. **优先级机制**
   - 配置文件覆盖 > skill.yaml 默认值 > 系统环境变量
   - Session 作用域（执行后自动恢复）

**使用示例：**

```python
# 执行时自动注入
env = env_loader.load_for_skill("web-search", runtime_env)
# os.environ["SEARCH_API_KEY"] = "sk-production-key-123"

# 执行技能
result = await execute("web-search", {...})

# 自动恢复
env_loader.restore()
```

#### 3. 技能启用/禁用控制

**问题：**
- 无法灵活控制哪些技能可用
- 实验性技能无法安全测试
- 安全风险技能无法限制

**解决方案：**

```yaml
# config/skills-config.yaml
skills:
  # 只允许这些内置技能
  allowBundled: ["web-search", "code-analysis", "file-read"]

  entries:
    experimental-ai:
      enabled: false  # 禁用实验性技能

    web-search-v2:
      enabled: true
```

**实现组件：**

1. **SkillFilter** - 技能过滤器
   - `is_eligible()` - 检查技能是否可加载
   - 支持白名单/黑名单
   - 支持 OS 过滤
   - 支持自定义标签过滤

**示例：**

```bash
# 只加载允许的技能
✅ Loaded 12 skills (15 bundled, 3 filtered)
```

---

### 🟡 中优先级特性（Phase 2，2-3 周）

#### 4. 自动安装系统

**问题：**
- 依赖安装需要手动执行
- 跨平台安装困难
- 版本管理复杂

**解决方案：**

```yaml
execution:
  runtime:
    requires:
      bins: ["ffmpeg"]

    install:
      - id: "brew-ffmpeg"
        kind: "brew"
        formula: "ffmpeg"
        bins: ["ffmpeg"]
        label: "Install FFmpeg via Homebrew"
        os: ["darwin"]

      - id: "apt-ffmpeg"
        kind: "apt"
        packages: ["ffmpeg"]
        bins: ["ffmpeg"]
        label: "Install FFmpeg via APT"
        os: ["linux"]

      - id: "pip-ffmpeg-python"
        kind: "pip"
        packages: ["ffmpeg-python"]
        label: "Install FFmpeg Python bindings"
```

**实现组件：**

1. **SkillInstaller** - 技能安装器
   - 支持 pip, brew, npm, uv, apt
   - 自动选择合适的安装方式
   - 交互式提示用户

2. **安装流程**
   ```
   检测依赖 → 缺失依赖 → 询问用户 → 自动安装 → 验证
   ```

**示例交互：**

```bash
$ npm run dev
⚠️  Skill 'video-generator' requires FFmpeg
💡 Do you want to install FFmpeg? [Y/n]
   > brew install ffmpeg (macOS)
     apt install ffmpeg (Linux)

🔧 Installing FFmpeg via brew...
✅ FFmpeg installed successfully
✅ Skill 'video-generator' loaded
```

#### 5. 多层级技能加载优先级

**问题：**
- 所有技能在同一目录
- 无法覆盖默认技能
- 项目特定技能难以管理

**解决方案：**

```
┌─────────────────────────────────────────────────┐
│              技能加载层级架构                     │
├─────────────────────────────────────────────────┤
│                                                 │
│  Workspace Skills  (优先级: 3)                   │
│  └── /skills/                                   │
│                    ↓ 覆盖                        │
│  Managed Skills   (优先级: 2)                   │
│  └── ~/.myagent/skills/                         │
│                    ↓ 覆盖                        │
│  Bundled Skills   (优先级: 1)                   │
│  └── lib/bundled_skills/                        │
│                    ↓ 覆盖                        │
│  Extra Dirs      (优先级: 0)                     │
│  └── 从配置读取                                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

**配置：**

```yaml
# config/myagent.yaml
skills:
  load:
    extraDirs:
      - "/opt/myagent/skills"
      - "~/custom-skills"
```

**使用场景：**

```bash
# 项目 A 使用自定义 web-search
~/project-a/skills/web-search/  → 自定义版本

# 项目 B 使用默认版本
~/project-b/                   → 使用 Managed/Bundled

# 全局共享技能
~/.myagent/skills/shared-skill/ → 所有项目共享
```

**实现组件：**

1. **MultiLevelSkillRegistry** - 多层级注册表
   - `scan_all_levels()` - 扫描所有层级
   - `_scan_level()` - 扫描单层
   - `get_skill()` - 获取最高优先级技能

#### 6. 热重载

**问题：**
- 修改 skill.yaml 需要重启服务
- 开发体验不佳
- 调试效率低

**解决方案：**

```yaml
# config/myagent.yaml
skills:
  load:
    watch: true              # 启用文件监控
    watchDebounceMs: 250     # 防抖延迟
```

**实现组件：**

1. **SkillWatcher** - 文件监控器
   - 使用 `watchdog` 库监控文件变化
   - 防抖处理（避免频繁重载）
   - 自动重新扫描技能目录

**示例：**

```bash
$ npm run dev
🔄 Watching skills/ for changes...
📝 Detected changes in web-search/skill.yaml
🔄 Reloading skills...
✅ Reloaded 16 skills
```

---

### 🟢 低优先级特性（Phase 3，1-2 个月）

#### 7. MyHub 公共技能注册表

**愿景：**

类似 OpenClaw 的 ClawHub，构建 MyAgent 技能生态：

```bash
# 命令行工具
myhub install video-generator
myhub search "web scraping"
myhub update --all
myhub publish ./skills/my-skill
myhub info video-generator
```

**特性：**
- 🌐 公共技能仓库
- 🔍 搜索和发现
- 📦 版本管理
- ⭐ 评分和评论
- 🔐 安全扫描

**架构：**

```
┌──────────────┐      ┌──────────────┐
│   MyHub CLI  │ ←→   │  MyHub API   │
└──────────────┘      └──────────────┘
                             ↓
                      ┌──────────────┐
                      │  GitHub Repo  │
                      │  + Database   │
                      └──────────────┘
```

#### 8. Token 消耗优化

**问题：**
- 技能列表注入到系统提示词消耗大量 token
- 技能多时成本高

**解决方案：**

使用紧凑的 XML 格式（借鉴 OpenClaw）：

```python
def format_skills_for_prompt(skills: List[Skill]) -> str:
    """格式化技能列表（紧凑格式）"""
    parts = []
    for skill in skills:
        part = f'<skill name="{skill.name}" description="{skill.description}"/>'
        parts.append(part)
    return "\n".join(parts)
```

**Token 估算：**

```python
def estimate_tokens(skills: List[Skill]) -> int:
    """
    估算 token 消耗
    基础开销: 195 chars
    每个技能: 97 chars + len(name) + len(description)
    OpenAI: ~4 chars/token
    """
    base = 195
    per_skill = 97
    total = base
    for skill in skills:
        total += per_skill + len(skill.name) + len(skill.description)
    return total // 4
```

**对比：**

| 技能数量 | 旧格式 | 新格式 | 节省 |
|---------|--------|--------|------|
| 10      | ~500   | ~300   | 40%  |
| 50      | ~2500  | ~1500  | 40%  |
| 100     | ~5000  | ~3000  | 40%  |

#### 9. 远程节点支持

**愿景：**

支持跨平台技能执行：

```yaml
execution:
  runtime:
    remoteNodes:
      - arch: "darwin"     # macOS 节点
        required: true     # 必需
      - arch: "linux"
        required: false
```

**使用场景：**

- macOS 上执行需要 Final Cut Pro 的技能
- Linux 上执行需要 GPU 的训练任务
- 分布式视频渲染

---

## 实施路线图

### Phase 1: 基础增强（Week 1-2）

**目标：** 核心依赖和环境管理

- [ ] **Week 1**
  - [ ] 设计 `execution.runtime` Schema
  - [ ] 实现 `DependencyChecker`
  - [ ] 实现 `SkillEnvLoader`
  - [ ] 单元测试

- [ ] **Week 2**
  - [ ] 集成到 `SkillRegistry`
  - [ ] 集成到 `SkillExecutor`
  - [ ] 配置文件支持
  - [ ] 文档和示例

**交付物：**
- ✅ 依赖检查系统
- ✅ 环境变量注入
- ✅ 技能启用/禁用控制

### Phase 2: 开发体验（Week 3-4）

**目标：** 自动化和灵活性

- [ ] **Week 3**
  - [ ] 实现 `SkillInstaller`
  - [ ] 支持 pip, brew, npm
  - [ ] 交互式安装流程

- [ ] **Week 4**
  - [ ] 实现 `MultiLevelSkillRegistry`
  - [ ] 实现 `SkillWatcher`
  - [ ] 热重载测试

**交付物：**
- ✅ 自动安装系统
- ✅ 多层级加载
- ✅ 热重载

### Phase 3: 生态系统（Week 5-8）

**目标：** 生态和优化

- [ ] **Week 5-6**
  - [ ] 设计 MyHub API
  - [ ] 实现 MyHub CLI
  - [ ] 部署测试服务

- [ ] **Week 7**
  - [ ] Token 优化
  - [ ] 性能测试

- [ ] **Week 8**
  - [ ] 远程节点设计
  - [ ] 文档完善
  - [ ] 发布和推广

**交付物：**
- ✅ MyHub MVP
- ✅ Token 优化
- ✅ 远程节点设计文档

---

## 技术设计

### 数据模型

#### SkillDefinition 扩展

```python
from pydantic import BaseModel
from typing import Dict, List, Optional

class DependencyCheck(BaseModel):
    """依赖检查配置"""
    bins: Optional[List[str]] = None
    anyBins: Optional[List[str]] = None
    env: Optional[List[str]] = None
    config: Optional[List[str]] = None
    pythonPackages: Optional[List[str]] = None

class InstallSpec(BaseModel):
    """安装规范"""
    kind: str  # pip, brew, npm, uv, apt
    packages: Optional[List[str]] = None
    formula: Optional[str] = None
    bins: Optional[List[str]] = None
    os: Optional[List[str]] = None
    label: Optional[str] = None

class RuntimeConfig(BaseModel):
    """运行时配置"""
    env: Dict[str, str] = {}
    requires: Optional[DependencyCheck] = None
    install: Optional[List[InstallSpec]] = None
    sandbox: Optional[SandboxConfig] = None
    limits: Optional[ResourceLimits] = None

class ExecutionConfig(BaseModel):
    """执行配置（扩展）"""
    handler: str
    function: str = "execute"
    timeout: int = 30000
    runtime: Optional[RuntimeConfig] = None  # 🆕 新增

class SkillDefinition(BaseModel):
    """技能定义（扩展）"""
    name: str
    version: str
    description: str
    tags: List[str] = []
    type: SkillType = SkillType.HYBRID
    input_schema: Dict[str, Any]
    output_schema: Dict[str, Any]
    execution: ExecutionConfig  # 包含 runtime
```

### 配置文件 Schema

#### config/skills-config.yaml

```yaml
# 技能配置
skills:
  # 内置技能白名单
  allowBundled: ["web-search", "code-analysis", "file-read"]

  # 技能特定配置
  entries:
    web-search:
      enabled: true
      # 敏感信息覆盖
      apiKey:
        source: env
        provider: default
        id: SEARCH_API_KEY
      env:
        SEARCH_API_KEY: "sk-production-key"
      config:
        timeout: 30000
        maxResults: 10

    experimental-skill:
      enabled: false  # 禁用

  # 加载配置
  load:
    extraDirs:
      - "/opt/myagent/skills"
      - "~/custom-skills"
    watch: true
    watchDebounceMs: 250

  # 沙箱配置
  sandbox:
    enabled: true
    image: "python:3.11-slim"
    network: false
```

### 核心组件

#### 1. DependencyChecker

```python
# src/core/skill/dependency_checker.py
class DependencyChecker:
    """技能依赖检查器"""

    def check_bins(self, bins: List[str]) -> Dict[str, bool]:
        """检查二进制文件是否存在"""

    def check_any_bins(self, bins: List[str]) -> bool:
        """检查是否有任一二进制存在"""

    def check_env(self, env_vars: List[str],
                  config_env: Dict[str, str]) -> Dict[str, bool]:
        """检查环境变量"""

    def check_config(self, config_paths: List[str],
                     myagent_config: Dict) -> Dict[str, bool]:
        """检查配置项"""

    def check_python_packages(self, packages: List[str]) -> Dict[str, bool]:
        """检查 Python 包"""

    def validate_skill(self, skill_metadata: Dict,
                       config_env: Dict,
                       myagent_config: Dict) -> Dict[str, Any]:
        """综合验证技能依赖"""
```

#### 2. SkillEnvLoader

```python
# src/core/skill/env_loader.py
class SkillEnvLoader:
    """技能环境变量加载器"""

    def __init__(self, config_overrides_path: str = "config/skills-env.yaml"):
        self.config_overrides = self._load_config_overrides()
        self._original_env = {}

    def load_for_skill(self, skill_name: str,
                       runtime_env: Dict[str, str]) -> Dict[str, str]:
        """为技能加载环境变量（优先级：配置 > 默认）"""

    def restore(self):
        """恢复原始环境变量"""

    def get_api_key(self, skill_name: str,
                    primary_env: str = None) -> Optional[str]:
        """获取 API 密钥"""
```

#### 3. SkillInstaller

```python
# src/core/skill/installer.py
class SkillInstaller:
    """技能依赖自动安装器"""

    def __init__(self):
        self.package_managers = {
            "pip": self._install_pip,
            "brew": self._install_brew,
            "npm": self._install_npm,
            "uv": self._install_uv,
            "apt": self._install_apt,
        }

    async def install_skill_deps(self, install_specs: List[InstallSpec]) -> Dict[str, bool]:
        """安装技能的所有依赖"""

    async def _install_pip(self, spec: InstallSpec) -> bool:
        """通过 pip 安装"""

    async def _install_brew(self, spec: InstallSpec) -> bool:
        """通过 Homebrew 安装"""
```

#### 4. MultiLevelSkillRegistry

```python
# src/core/skill/multi_level_registry.py
class MultiLevelSkillRegistry:
    """多层级技能注册表"""

    LEVELS = {
        "workspace": {"path": "skills/", "priority": 3},
        "managed": {"path": "~/.myagent/skills/", "priority": 2},
        "bundled": {"path": "lib/bundled_skills/", "priority": 1},
        "extra": {"path": [], "priority": 0}
    }

    async def scan_all_levels(self):
        """扫描所有层级（低到高）"""

    async def _scan_level(self, level: str):
        """扫描单层级"""

    def get_skill(self, name: str):
        """获取技能（自动选择最高优先级）"""
```

#### 5. SkillWatcher

```python
# src/core/skill/watcher.py
class SkillWatcher(FileSystemEventHandler):
    """技能文件监控器"""

    def __init__(self, skills_dirs: List[Path], callback):
        self.skills_dirs = skills_dirs
        self.callback = callback
        self.observer = Observer()
        self.debounce_timer = None
        self.debounce_ms = 250

    def start(self):
        """启动监控"""

    def on_modified(self, event):
        """文件修改事件（带防抖）"""

    def _trigger_reload(self):
        """触发重载"""
```

### API 设计

#### 配置 API

```python
# 获取技能配置
config = SkillConfigLoader.load()

# 检查技能是否启用
is_enabled = config.is_skill_enabled("web-search")

# 获取环境变量
env = config.get_skill_env("web-search")

# 获取 API 密钥
api_key = config.get_api_key("web-search")
```

#### 注册表 API

```python
# 创建多层级注册表
registry = MultiLevelSkillRegistry()

# 扫描所有层级
await registry.scan_all_levels()

# 获取技能（自动选择最高优先级）
skill = registry.get_skill("web-search")

# 列出所有技能及其来源
skills = registry.list_skills()
# {
#   "web-search": "workspace",
#   "code-analysis": "managed",
#   "file-read": "bundled"
# }
```

#### 执行器 API

```python
# 创建执行器
executor = SkillExecutor(
    registry=registry,
    env_loader=SkillEnvLoader(),
    installer=SkillInstaller()
)

# 执行技能（自动处理依赖、环境、安装）
result = await executor.execute(
    "web-search",
    {"query": "AI agents"}
)
```

---

## 测试计划

### 单元测试

```python
# tests/unit/skill/test_dependency_checker.py
class TestDependencyChecker:
    def test_check_bins(self):
        checker = DependencyChecker()
        result = checker.check_bins(["ls", "python3"])
        assert result["ls"] == True
        assert result["python3"] == True

    def test_check_any_bins(self):
        checker = DependencyChecker()
        result = checker.check_any_bins(["uv", "pip"])
        assert result == True  # 至少一个存在

    def test_check_python_packages(self):
        checker = DependencyChecker()
        result = checker.check_python_packages(["httpx", "nonexistent"])
        assert result["httpx"] == True
        assert result["nonexistent"] == False

    def test_validate_skill_with_missing_deps(self):
        checker = DependencyChecker()
        metadata = {
            "requires": {
                "bins": ["nonexistent-binary"]
            }
        }
        result = checker.validate_skill(metadata)
        assert result["valid"] == False
        assert "nonexistent-binary" in result["missing"]
```

### 集成测试

```python
# tests/integration/skill/test_multi_level_loading.py
class TestMultiLevelLoading:
    @pytest.fixture
    async def registry(self):
        # 创建测试目录结构
        workspace = Path("/tmp/test-workspace/skills")
        managed = Path("/tmp/test-managed/skills")
        bundled = Path("/tmp/test-bundled/skills")

        # 创建同名技能
        self._create_skill(workspace / "web-search", "workspace")
        self._create_skill(managed / "web-search", "managed")
        self._create_skill(bundled / "web-search", "bundled")

        registry = MultiLevelSkillRegistry(
            workspace_dir="/tmp/test-workspace"
        )
        registry.paths["managed"] = managed
        registry.paths["bundled"] = bundled

        await registry.scan_all_levels()
        return registry

    def test_priority_order(self, registry):
        # Workspace 优先级最高
        skill = registry.get_skill("web-search")
        assert skill.metadata["level"] == "workspace"

    def test_fallback_to_managed(self, registry):
        # 删除 workspace 版本
        del registry.skills["web-search"]

        # 应该使用 managed 版本
        skill = registry.get_skill("web-search")
        assert skill.metadata["level"] == "managed"
```

### 端到端测试

```python
# tests/e2e/test_skill_lifecycle.py
class TestSkillLifecycle:
    async def test_full_lifecycle(self):
        # 1. 创建技能
        skill_yaml = self._create_test_skill()

        # 2. 扫描和加载
        registry = MultiLevelSkillRegistry()
        await registry.scan_all_levels()

        # 3. 检查依赖
        checker = DependencyChecker()
        validation = checker.validate_skill(skill_yaml["metadata"])
        if not validation["valid"]:
            # 自动安装
            installer = SkillInstaller()
            await installer.install_skill_deps(
                skill_yaml["execution"]["runtime"]["install"]
            )

        # 4. 加载环境
        env_loader = SkillEnvLoader()
        env = env_loader.load_for_skill(
            "test-skill",
            skill_yaml["execution"]["runtime"]["env"]
        )

        # 5. 执行
        executor = SkillExecutor()
        result = await executor.execute("test-skill", {"test": "data"})

        # 6. 验证结果
        assert result.success == True

        # 7. 清理环境
        env_loader.restore()
```

### 性能测试

```python
# tests/performance/test_skill_loading.py
class TestSkillPerformance:
    async def test_scan_performance(self):
        """测试扫描 1000 个技能的性能"""
        # 创建 1000 个测试技能
        self._create_test_skills(1000)

        start = time.time()
        registry = MultiLevelSkillRegistry()
        await registry.scan_all_levels()
        duration = time.time() - start

        # 应该在 5 秒内完成
        assert duration < 5.0

    async def test_token_consumption(self):
        """测试 token 消耗"""
        # 创建 100 个技能
        self._create_test_skills(100)

        formatter = SkillPromptFormatter()
        prompt = formatter.format_skills_for_prompt(
            registry.list_skills()
        )

        tokens = formatter.estimate_tokens(registry.list_skills())

        # 100 个技能应该 < 2000 tokens
        assert tokens < 2000
```

---

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| **向后兼容性** | 高 | 中 | 1. runtime 字段可选<br>2. 提供迁移脚本<br>3. 保留旧 API |
| **性能影响** | 中 | 低 | 1. 延迟检查<br>2. 缓存验证结果<br>3. 并行扫描 |
| **跨平台问题** | 中 | 中 | 1. 充分测试<br>2. 提供平台特定配置<br>3. 优雅降级 |
| **安全风险** | 高 | 低 | 1. 验证安装脚本<br>2. 沙箱隔离<br>3. 权限控制 |

### 兼容性策略

#### 1. 向后兼容

```yaml
# 旧格式仍然支持
execution:
  handler: handler.py
  function: execute
  timeout: 30000
  # runtime 是可选的

# 新格式
execution:
  handler: handler.py
  runtime:
    env: {...}
    requires: {...}
```

#### 2. 迁移脚本

```bash
# scripts/migrate-skill-yaml.py
import yaml
from pathlib import Path

def migrate_skill_yaml(skill_path: Path):
    """迁移旧格式到新格式"""
    with open(skill_path) as f:
        data = yaml.safe_load(f)

    # 添加空的 runtime 字段
    if "runtime" not in data.get("execution", {}):
        data["execution"]["runtime"] = {
            "env": {},
            "requires": {}
        }

    # 备份旧文件
    backup_path = skill_path.with_suffix(".yaml.backup")
    skill_path.rename(backup_path)

    # 写入新文件
    with open(skill_path, "w") as f:
        yaml.dump(data, f)

    print(f"Migrated: {skill_path}")

# 批量迁移
for skill_yaml in Path("skills/").glob("*/skill.yaml"):
    migrate_skill_yaml(skill_yaml)
```

#### 3. 渐进式采用

```python
class SkillRegistry:
    def __init__(self, enable_runtime_features: bool = False):
        # 新特性默认关闭，逐步启用
        self.enable_runtime_features = enable_runtime_features

    async def scan(self):
        for skill_dir in Path("skills/").glob("*/"):
            skill_info = await self._load_skill_info(skill_dir)

            # 旧逻辑：不检查依赖
            if not self.enable_runtime_features:
                self.register(skill_info)
                continue

            # 新逻辑：检查依赖
            if skill_info.execution.runtime:
                validation = self.dependency_checker.validate_skill(...)
                if not validation["valid"]:
                    continue

            self.register(skill_info)
```

### 安全考虑

#### 1. 安装脚本验证

```python
class SkillInstaller:
    def _validate_install_spec(self, spec: InstallSpec) -> bool:
        """验证安装规范"""
        # 只允许已知的管理器
        if spec.kind not in ["pip", "brew", "npm", "uv", "apt"]:
            return False

        # 检查恶意包名
        dangerous_patterns = ["; ", "&&", "|", "rm -rf"]
        for pkg in spec.packages or []:
            if any(pattern in pkg for pattern in dangerous_patterns):
                return False

        return True

    async def install_skill_deps(self, install_specs: List[InstallSpec]):
        """安装依赖（带验证）"""
        for spec in install_specs:
            if not self._validate_install_spec(spec):
                raise ValueError(f"Invalid install spec: {spec}")

            await self.package_managers[spec.kind](spec)
```

#### 2. 环境变量隔离

```python
class SkillEnvLoader:
    def load_for_skill(self, skill_name: str, runtime_env: Dict) -> Dict:
        """加载环境变量（Session 作用域）"""
        injected = {}

        # 只在不存在的变量上设置
        for key, value in runtime_env.items():
            if key not in os.environ:
                os.environ[key] = str(value)
                injected[key] = str(value)

        # 保存注入记录，用于恢复
        self._injected[skill_name] = injected
        return injected

    def restore(self, skill_name: str):
        """恢复环境变量"""
        injected = self._injected.get(skill_name, {})
        for key in injected:
            if key in os.environ:
                del os.environ[key]
        del self._injected[skill_name]
```

#### 3. 权限控制

```python
class SkillFilter:
    def is_eligible(self, skill_info: Any, level: str) -> bool:
        """检查技能是否可加载"""
        # 1. 检查是否明确禁用
        if not self._is_enabled(skill_info.name):
            return False

        # 2. 检查白名单（内置技能）
        if level == "bundled" and self.allowBundled:
            if skill_info.name not in self.allowBundled:
                return False

        # 3. 检查 OS 兼容性
        if not self._check_os_compatibility(skill_info):
            return False

        return True
```

---

## 向后兼容性保证

### 兼容性策略

1. **可选字段**
   - `execution.runtime` 完全可选
   - 旧格式自动兼容

2. **渐进增强**
   - 新特性默认关闭
   - 通过配置启用

3. **迁移工具**
   - 自动迁移脚本
   - 验证和回滚

### 迁移示例

```bash
# 1. 备份现有技能
cp -r skills/ skills-backup/

# 2. 运行迁移脚本
python scripts/migrate_skills.py

# 3. 验证
python scripts/validate_skills.py

# 4. 测试
npm run dev
```

---

## 成功指标

### 开发体验
- ⏱️ 技能创建时间减少 50%
- 🔄 修改技能无需重启
- 📝 配置更直观（单文件 vs 多文件）

### 可靠性
- ✅ 依赖错误提前发现
- 🔒 环境隔离更安全
- 🛡️ 权限控制更细粒度

### 生态系统
- 📦 技能复用率提升
- 🌐 公共技能库建立
- 🤝 社区贡献增加

---

## 下一步行动

### 立即行动

1. **审核提案** - 团队评审
2. **确定优先级** - 调整 Phase 顺序
3. **分配任务** - 责任到人
4. **创建里程碑** - GitHub Milestones

### 第一周任务

- [ ] 创建设计文档
- [ ] 创建 GitHub Issues
- [ ] 设置开发分支
- [ ] 准备开发环境

---

## 外部 Coding Agent 集成方案

### 🎯 设计思路

基于 MyAgent 现有架构的优势，我们采用**简洁优雅**的方案：

```
┌─────────────────────────────────────────────────┐
│      责任分离：MyAgent 理解，外部 Agent 执行   │
├─────────────────────────────────────────────────┤
│                                                 │
│  MyAgent Coding-Agent Subagent                  │
│  职责：智能、理解、交互                          │
│  ✓ 理解用户需求（通过基类澄清机制）             │
│  ✓ 收集必要的上下文                            │
│  ✓ 准备完整的任务描述                          │
│  ✓ 选择合适的外部工具                          │
│  ✓ 验证执行结果                                │
│                                                 │
│         ↓ (一次性完整指令)                      │
│                                                 │
│  External Coding Agent (Codex/Claude/Pi)       │
│  职责：执行、完成、返回                          │
│  ✓ 收到完整上下文                              │
│  ✓ 执行任务（无需询问）                        │
│  ✓ 完成后返回结果                              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### ✅ 核心原则

1. **一次性执行** - 外部 agent 收到完整上下文，不需要中途干预
2. **责任分离** - MyAgent 负责理解，外部 agent 负责执行
3. **复用现有能力** - 利用 MyAgent 的澄清机制、Skill 系统

### 🏗️ 架构实现

#### 1. 利用 MyAgent 的内置澄清机制

MyAgent 的基类 Agent 已经实现了 HITL（Human-in-the-Loop）澄清功能：

```typescript
// src/core/agent/agent.ts (基类)
export class Agent {
  // HITL clarification flag (default: true)
  protected enableClarification: boolean = true;

  // 检查是否需要澄清
  private async checkIntentClarification(
    intent: any,
    task: string,
    taskId: string,
    context: any
  ): Promise<{needs: boolean, question?: string, options?: string[]}> {

    // 跳过条件：测试环境、显式跳过、配置禁用
    if (process.env.NODE_ENV === 'test' ||
        context?.skipHITL ||
        !this.enableClarification) {
      return { needs: false };
    }

    // 基于置信度和 LLM 判断是否需要澄清
    if (intent.confidence < 0.5) {
      return {
        needs: true,
        question: '请提供更多信息...',
        options: [...]
      };
    }

    // LLM 澄清检查...
    return { needs: false };
  }
}
```

**关键优势：**
- ✅ 所有 agent（MasterAgent 和 Subagent）自动继承此能力
- ✅ 统一的澄清事件机制（`awaiting_clarification`）
- ✅ 通过配置控制（`enable_clarification`）

#### 2. 创建 Coding-Agent Subagent

```yaml
# subagents/coding-agent/agent.yaml
name: coding-agent
description: Expert coding agent that delegates to external CLI tools

model: claude-sonnet-4-6
temperature: 0.3

available_skills:
  - tool-bash
  - tool-read
  - tool-write
  - tool-glob
  - tool-grep

config:
  constraints:
    enable_clarification: true  # 启用澄清（继承基类能力）

  # 外部工具配置
  external_tools:
    codex:
      binary: codex
      model: gpt-5.2-codex
      requires:
        env: [OPENAI_API_KEY]
      best_for: large_refactoring

    claude-code:
      binary: claude
      model: claude-sonnet-4-6
      requires:
        env: [ANTHROPIC_API_KEY]
      best_for: medium_tasks

    pi:
      binary: pi
      requires: []
      best_for: simple_tasks

system_prompt: |
  You are an expert coding agent that coordinates external coding tools.

  ## Your Responsibilities

  ### 1. Understand Requirements
  - Analyze the user's request
  - Use the built-in clarification mechanism when needed
  - Ask specific questions with options when possible

  ### 2. Gather Context
  - Read relevant files using tool-read
  - Understand the codebase structure
  - Identify dependencies and constraints

  ### 3. Choose the Right Tool
  - **Codex**: Large refactoring (1000+ lines), multi-file changes, architecture
  - **Claude Code**: Medium tasks (100-1000 lines), bug fixes, features
  - **Pi**: Small tasks (<100 lines), simple transformations

  ### 4. Prepare Complete Task Description
  Include in the task:
  - Clear objective
  - All relevant context (files, code snippets)
  - Constraints and requirements
  - Testing instructions
  - Expected output format

  ### 5. Execute via tool-bash
  - Use complete, self-contained task description
  - Use pty:true for proper terminal support
  - Set appropriate timeout
  - DO NOT expect mid-execution interaction

  ### 6. Verify Results
  - Read modified files
  - Run tests if available
  - Validate the changes
  - Report summary to user

  ## Critical Rules

  - **NO mid-execution interaction**: External agents run autonomously
  - **Complete context first**: Gather all info before calling external agent
  - **One-shot execution**: External agent completes the task in one go
  - **Verify afterwards**: Check results, don't assume success
```

#### 3. 扩展 tool-bash Skill 支持 PTY

```yaml
# skills/tool-bash/skill.yaml
name: tool-bash
version: 2.0.0

description: Execute bash commands with PTY support

execution:
  runtime:
    requires:
      bins: ["bash"]

input_schema:
  type: object
  properties:
    command:
      type: string
      description: The shell command to execute
    pty:
      type: boolean
      default: false
      description: "Use pseudo-terminal (required for interactive apps)"
    background:
      type: boolean
      default: false
      description: "Run in background, returns sessionId"
    workdir:
      type: string
      description: "Working directory"
    timeout:
      type: number
      default: 60000

output_schema:
  type: object
  properties:
    success:
      type: boolean
    exitCode:
      type: number
    output:
      type: string
    sessionId:
      type: string
      description: "Session ID if background=true"
```

```python
# skills/tool-bash/handler.py
import pty
import subprocess
import os

def execute(context):
    inputs = context['inputs']
    command = inputs['command']
    use_pty = inputs.get('pty', False)
    background = inputs.get('background', False)
    timeout = inputs.get('timeout', 60000)

    if use_pty:
        return execute_with_pty(command, background, timeout)
    else:
        return execute_normal(command, timeout)

def execute_with_pty(command: str, background: bool, timeout: int):
    """PTY 模式执行（支持交互式 CLI）"""
    master_fd, slave_fd = pty.openpty()

    proc = subprocess.Popen(
        command,
        shell=True,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        close_fds=True
    )

    os.close(slave_fd)

    if background:
        import uuid
        session_id = f"bash-{uuid.uuid4().hex[:8]}"
        # 注册到会话管理器（简化版）
        return {
            'success': True,
            'sessionId': session_id,
            'status': 'running'
        }
    else:
        # 前台执行，读取输出
        output = []
        start_time = time.time()

        while True:
            # 检查超时
            if time.time() - start_time > timeout:
                proc.kill()
                break

            try:
                data = os.read(master_fd, 1024).decode()
                if data:
                    output.append(data)
            except OSError:
                break

            if proc.poll() is not None:
                break

        os.close(master_fd)

        return {
            'success': proc.returncode == 0,
            'exitCode': proc.returncode,
            'output': ''.join(output)
        }
```

### 🔄 完整工作流程示例

#### 场景：重构认证模块

```
1. 用户请求
   User: "Refactor auth to use OAuth 2.0"

2. MasterAgent 澄清（基类 Agent 能力）
   MasterAgent: "Which OAuth provider? [google/github/other]"
   User: "Google"

3. MasterAgent 委派给 Coding-Agent Subagent
   delegate_to_subagent("coding-agent", {
     provider: "google",
     task: "Refactor auth to OAuth 2.0"
   })

4. Coding-Agent Subagent 澄清（基类 Agent 能力）
   Coding-Agent: "Should I keep existing sessions?"
   User: "Yes, hybrid mode"

5. Coding-Agent 收集上下文
   tool-read: "src/auth/login.py"
   tool-read: "src/auth/middleware.py"
   tool-glob: "src/auth/**/*.py"

6. Coding-Agent 准备完整任务
   task_description = """
   Refactor authentication to Google OAuth 2.0.

   Context:
   - Current files: [...]
   - Keep existing sessions (hybrid mode)
   - Provider: Google

   Requirements:
   - Add OAuth flow
   - Maintain backward compatibility
   - Update middleware
   """

7. Coding-Agent 调用外部 agent
   tool-bash:
     command: "codex exec '...' (完整任务)"
     pty: true
     timeout: 600000

8. 外部 Codex 执行（收到完整上下文，无需询问）
   - 分析代码
   - 修改文件
   - 运行测试
   - 完成任务

9. Coding-Agent 验证结果
   tool-read: "src/auth/login.py"
   tool-bash: "npm test"

10. 返回给用户
    "Refactored successfully! Added Google OAuth 2.0 support"
```

### 🎯 方案优势

| 维度 | 复杂的多轮交互方案 | 我们的方案 |
|------|-------------------|----------|
| **复杂度** | 高（会话管理、输入检测） | 低（复用现有能力） |
| **可控性** | 低（外部 agent 不确定） | 高（MyAgent 完全控制） |
| **可预测性** | 低（可能多轮交互） | 高（一次性执行） |
| **实施难度** | 高 | 低（复用现有架构） |
| **调试难度** | 高 | 低（清晰的责任分层） |

### 📋 实施计划

作为 **Phase 2** 的一部分：

- [ ] 扩展 tool-bash skill（PTY 支持）
- [ ] 创建 coding-agent subagent
- [ ] 编写详细的 system prompt
- [ ] 测试不同复杂度的任务
- [ ] 优化工具选择策略

### ✅ 关键点

1. **澄清机制已存在** - 基类 Agent 的 `checkIntentClarification()`
2. **所有 agent 都能用** - Coding-Agent Subagent 自动继承
3. **无需额外开发** - 复用现有 HITL 事件机制
4. **配置可控** - 通过 `enable_clarification` 控制

---

## 向后兼容性保证

### 相关文档
- [MyAgent Skill 系统文档](../guides/skill-system.md)
- [OpenClaw Skills 文档](https://docs.openclaw.ai/tools/skills)
- [AgentSkills 规范](https://github.com/AgentSkills/AgentSkills)

### 示例技能
- [web-search 示例](../../skills/web-search/)
- [remotion-generator 示例](../../skills/remotion-generator/)

### 工具和库
- [Pydantic](https://docs.pydantic.dev/) - 数据验证
- [watchdog](https://python-watchdog.readthedocs.io/) - 文件监控
- [click](https://click.palletsprojects.com/) - CLI 框架

---

**变更历史：**

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-03-08 | 1.0 | 初始版本 |

---

**作者:** MyAgent Team
**审核者:** Pending
**状态:** 🟢 Pending Approval
