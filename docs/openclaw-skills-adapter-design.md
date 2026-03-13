# OpenClaw Skills Adapter Design Document

## Overview

This document outlines the design and implementation plan for integrating OpenClaw skills into the myagent system. The goal is to make myagent compatible with OpenClaw's skill format while maintaining all existing functionality including hooks, traces, and artifact management.

## Background

### Current myagent Skill Types

| Type | Definition | File Structure | Examples |
|------|------------|---------------|----------|
| **pure-script** | Python handler only | `skill.yaml` + `handler.py` | `tool-bash`, `lite-tts` |
| **hybrid** | Has `prompt_template` + Python handler | `skill.yaml` + `handler.py` + `prompt_template` | `infographic-generator` |
| **pure-prompt** | Only prompt, no handler (via adapter) | `SKILL.md` | `ffmpeg`, `frontend-design` |

### OpenClaw Skill Types

| Type | Definition | File Structure | Examples |
|------|------------|---------------|----------|
| **Pure Prompt** | Only `SKILL.md`, AI reads and calls tools | `SKILL.md` | `ffmpeg`, `skill-builder` |
| **Tool Dispatch** | Direct tool dispatch via frontmatter | `SKILL.md` with `command-dispatch: tool` | (bypasses AI) |
| **Script via exec** | Prompt guides AI to call `exec` tool | `SKILL.md` + `scripts/` | `summarize` |

## Architecture Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   OpenClaw Skills Layer                     │
│  openclaw_skills/ffmpeg/SKILL.md                           │
│  openclaw_skills/summarize/SKILL.md + scripts/             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              OpenClaw Skills Adapter                         │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │   Scanner        │  │   Analyzer       │               │
│  │ (Scan SKILL.md)  │→│(Parse + {baseDir})│               │
│  └──────────────────┘  └──────────────────┘               │
│           ↓                      ↓                          │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │Metadata Mapper   │  │  Type Router     │               │
│  │(To MyAgent format)│→│(Detect features) │               │
│  └──────────────────┘  └──────────────────┘               │
│           ↓                      ↓                          │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │Dependency Checker│  │  Handler Selector│               │
│  │(bins/env check)  │  │(Choose handler)  │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   MyAgent Skill Layer                       │
│  ┌──────────────────────────────────────────────┐          │
│  │ SkillHookExecutor                             │          │
│  │ • SkillTraceHook (pre/post traces)          │          │
│  │ • ClaudeSkillHook (artifacts inference)     │          │
│  │ • ProgressNotificationHook (optional)       │          │
│  └──────────────────────────────────────────────┘          │
│           ↓                                               │
│  ┌──────────────────────────────────────────────┐          │
│  │ Handlers:                                     │          │
│  │ • claude_skill_handler (pure prompt)        │          │
│  │ • openclaw_scripts_handler (with scripts/)   │          │
│  │ • openclaw_command_dispatch_handler (tool)   │          │
│  └──────────────────────────────────────────────┘          │
│           ↓                                               │
│  ┌──────────────────────────────────────────────┐          │
│  │ LLM Client + Trace Sending                   │          │
│  │ • _send_llm_trace (every LLM call)          │          │
│  │ • Tool discovery (tool-* skills)            │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Outputs & Traces                          │
│  • OutputBuilder format results                             │
│  • executionTraces stream (Skill + LLM traces)             │
│  • Artifacts in outputs/ (videos, audios, images...)       │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Tool Names - No Aliasing Needed

**Decision**: Do not implement tool alias mapping.

**Rationale**:
- SKILL.md files describe "what to do", not "what tool to use"
- Tool registration is handled at the system level
- LLM automatically selects appropriate tools based on context
- OpenClaw and myagent tool names are different but functionally equivalent

### 2. Configuration - Do Not Migrate openclaw.json

**Decision**: Only support OpenClaw skill format, not the configuration system.

**Rationale**:
- Goal is to be compatible with OpenClaw skills, not the entire OpenClaw system
- `~/.openclaw/openclaw.json` is not needed
- Skills are enabled/disabled by file presence
- Environment variables handled by system environment

### 3. Top-Level Dependencies - Key Improvement

**Decision**: Move `requires` to top level, same level as `execution`.

**Rationale**:
- Current limitation: pure prompt skills have no way to declare dependencies
- Example: `ffmpeg` skill needs `ffmpeg` binary but has no `execution` field
- Top-level `requires` works for all skill types
- Enables startup-time dependency scanning and installation

**New Structure**:
```yaml
# Universal format (all skill types)
name: my-skill
type: pure-prompt | pure-script | hybrid
description: ...

# 🆕 Top-level requires (works for all types)
requires:
  bins: []
  env: []
  config: []
  install: []  # optional: installation hints

# execution: only for pure-script/hybrid
execution:
  runtime:
    resources: {...}
    platform: {...}
```

### 4. Hooks and Traces - Reuse Existing Implementation

**Decision**: Reuse all existing hooks and trace mechanisms.

**Required Hooks**:
- `SkillTraceHook` - Records skill pre/post execution traces
- `ClaudeSkillHook` - LLM-powered artifact inference
- `ProgressNotificationHook` - Optional progress updates

**Required Traces**:
- Skill level traces (pre/post execution)
- LLM call traces (prompt, response, tokens, timing)

**Implementation**: Reference `claude_skill_handler.py` for trace sending patterns.

## Implementation Plan

### Phase 1: Core Components (Must Have)

| File | Function | Priority |
|------|----------|----------|
| `src/core/skill/adapters/openclaw_skill_scanner.py` | Scan `openclaw_skills/` for SKILL.md files | P0 |
| `src/core/skill/adapters/openclaw_skill_analyzer.py` | Parse frontmatter, detect type, replace `{baseDir}`, map dependencies | P0 |
| `src/core/skill/adapters/openclaw_metadata_mapper.py` | Map OpenClaw metadata to myagent format | P0 |
| `src/core/skill/handlers/openclaw_scripts_handler.py` | Handle skills with `scripts/` directory | P0 |
| `src/core/skill/handlers/openclaw_command_dispatch_handler.py` | Handle `command-dispatch: tool` skills | P0 |
| `config/openclaw-skills-adapter.yaml` | Adapter configuration | P0 |

### Phase 2: System Integration (Should Have)

| Component | Function | Priority |
|-----------|----------|----------|
| Update `DependencyChecker.validate_skill` | Support top-level `requires` field | P1 |
| `src/core/skill/startup_dependency_scanner.py` | Scan and install dependencies at startup | P1 |
| Update `SkillRegistry` | Register OpenClaw skills | P1 |

### Phase 3: Enhanced Features (Nice to Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| Hot reload | Reload skills when files change | P2 |
| Slug and version metadata | Store additional OpenClaw metadata | P2 |
| Platform filtering | Filter by `requires.os` | P2 |

## Metadata Mapping

### OpenClaw → MyAgent Mapping

| OpenClaw Field | MyAgent Field | Notes |
|----------------|---------------|-------|
| `name` | `name` | Direct mapping |
| `slug` | ❌ Ignore | Not needed |
| `version` | ❌ Ignore | Not needed (yet) |
| `description` | `description` | Direct mapping |
| `homepage` | ❌ Ignore | Not needed |
| `emoji` | ❌ Ignore | Not needed |
| `user-invocable` | ❌ Ignore | All skills are invocable |
| `disable-model-invocation` | ❌ Ignore | Not applicable |
| `command-dispatch` | Special handling | Routes to command dispatch handler |
| `command-tool` | Tool name | Used by command dispatch handler |
| `metadata.openclaw.requires.bins` | `requires.bins` | Top-level requires |
| `metadata.openclaw.requires.env` | `requires.env` | Top-level requires |
| `metadata.openclaw.requires.config` | ❌ Ignore | OpenClaw-specific config |
| `metadata.openclaw.os` | ❌ Ignore | (Phase 3) |
| `metadata.openclaw.install` | `requires.install` | Installation hints |

## Type Detection Logic

### Detection Rules

```python
def detect_skill_type(frontmatter: dict, has_scripts: bool) -> str:
    """
    Detect myagent skill type from OpenClaw skill characteristics

    Returns: 'pure-prompt' | 'pure-script' | 'hybrid'
    """
    # Rule 1: command-dispatch: tool → pure-script (special handler)
    if frontmatter.get('command-dispatch') == 'tool':
        return 'pure-script'

    # Rule 2: has scripts/ directory → hybrid (prompt + script execution)
    if has_scripts:
        return 'hybrid'

    # Rule 3: Default → pure-prompt
    return 'pure-prompt'
```

## Special Syntax Handling

### {baseDir} Replacement

**Problem**: OpenClaw skills use `{baseDir}` to reference the skill directory.

**Examples**:
```markdown
Run the setup script:
```bash
python {baseDir}/scripts/setup.sh
```

See {baseDir}/docs/README.md for more details.
```

**Solution**: Replace during parsing

```python
def _replace_base_dir(content: str, skill_dir: Path) -> str:
    """
    Replace {baseDir} placeholders with actual skill directory path.

    Args:
        content: SKILL.md content
        skill_dir: Absolute path to skill directory

    Returns:
        Content with {baseDir} replaced
    """
    return content.replace("{baseDir}", str(skill_dir))
```

## Handler Selection Logic

### Pure Prompt Skills

**Characteristics**: No special frontmatter fields

**Handler**: `claude_skill_handler.py` (reuse existing)

**Execution**:
1. Read SKILL.md body
2. Call LLM with prompt
3. Return text/code result
4. ClaudeSkillHook infers artifacts

### Skills with scripts/ Directory

**Characteristics**: Has `scripts/` folder with executable scripts

**Handler**: `openclaw_scripts_handler.py` (new)

**Execution**:
1. Read SKILL.md to understand intent
2. LLM generates or selects script commands
3. Execute via `tool-bash`
4. Return results

### Command Dispatch Skills

**Characteristics**: `command-dispatch: tool` in frontmatter

**Handler**: `openclaw_command_dispatch_handler.py` (new)

**Execution**:
1. Read `command-tool` from frontmatter
2. Dispatch directly to corresponding myagent tool
3. Bypass LLM entirely

## Dependency Checking

### Enhanced DependencyChecker

**Current Implementation**: Only checks `execution.runtime.requires`

**Enhanced Implementation**:

```python
def validate_skill(self, skill_metadata: Dict[str, Any], ...):
    """
    🆕 Support two levels of requires:
    1. Top-level requires (compatible with all skill types)
    2. execution.runtime.requires (backward compatible)
    """

    # 🆕 Check top-level requires first
    requires = skill_metadata.get("requires", {})

    # Fallback to execution.runtime.requires
    if not requires:
        requires = skill_metadata.get("execution", {}).get("runtime", {}).get("requires", {})

    # Unified dependency checking
    # bins, env, config, pythonPackages, resources, platform
```

### Startup Dependency Scanner

**Purpose**: Scan all skills at startup and install missing dependencies

```python
class StartupDependencyScanner:
    """Scan and install skill dependencies at startup"""

    async def scan_all_skills(self):
        """
        1. Scan skills/ (native myagent skills)
        2. Scan claude_skills/ (via adapter)
        3. Scan openclaw_skills/ (via adapter)
        4. Check all dependencies
        5. Output installation suggestions
        """
```

## Configuration

### openclaw-skills-adapter.yaml

```yaml
# OpenClaw Skills Adapter Configuration

# Directory paths
openclaw_skills:
  scan_paths:
    - openclaw_skills

# Script discovery
script_discovery: auto  # auto | main | named | first

# Execution settings
execution:
  timeout: 30000  # milliseconds

# Optional: Default environment variables
default_env: {}

# Optional: Tool mappings (if needed)
# tool_aliases:
#   exec: tool-bash
#   web_search: web-search
```

## Error Handling

### Error Types

| Error Type | Handling |
|------------|----------|
| SKILL.md not found | Standard file not found error |
| Frontmatter parse failure | Standard YAML parse error |
| Dependencies not satisfied | Friendly error with installation suggestions |
| Script execution failure | Propagate tool-bash error |
| LLM call failure | Standard LLM error handling |

### Dependency Check Errors

```python
{
  "success": False,
  "error_type": "dependency",
  "message": "Missing required dependencies",
  "missing_dependencies": {
    "bins": ["ffmpeg"],
    "env": ["API_KEY"],
    "suggestions": [
      "Install ffmpeg: brew install ffmpeg",
      "Set API_KEY environment variable"
    ]
  }
}
```

## Trace and Hook Integration

### Required Traces

**Skill Level Traces** (via `SkillTraceHook`):
- `pre` stage: Skill starts execution
- `post` stage: Skill completes

**LLM Call Traces** (via handler):
- Every LLM call includes:
  - Prompt
  - Response
  - Token usage (if available)
  - Execution time
  - Model used

### Implementation Reference

Copy from `claude_skill_handler.py`:
- `_send_llm_trace()` method for sending traces
- Trace data structure matching `executionTraceSchema`
- Both sync and async sending methods

## Testing Strategy

### Unit Tests

- Test metadata mapping
- Test type detection logic
- Test {baseDir} replacement
- Test dependency checking

### Integration Tests

- Test pure prompt skill execution
- Test skill with scripts/
- Test command-dispatch skills
- Verify hooks are triggered
- Verify traces are sent

### Example Test Skills

```
openclaw_skills/
├── test-prompt/
│   └── SKILL.md          # Pure prompt test
├── test-scripts/
│   ├── SKILL.md
│   └── scripts/
│       └── test.sh      # Script execution test
└── test-dispatch/
    └── SKILL.md          # Command dispatch test
```

## Future Enhancements

### Phase 3 Features

1. **Hot Reload**: Watch for skill file changes and reload
2. **Slug and Version**: Store additional OpenClaw metadata
3. **Platform Filtering**: Filter by `requires.os`
4. **Install Automation**: Automatic dependency installation

### Performance Optimizations

1. **Lazy Loading**: Load full skill definitions only when needed
2. **Dependency Caching**: Cache dependency check results
3. **Parallel Scanning**: Scan multiple skill directories in parallel

## Compatibility Matrix

| OpenClaw Feature | MyAgent Support | Notes |
|------------------|-----------------|-------|
| Pure prompt skills | ✅ Yes | Via claude_skill_handler |
| Scripts/ directory | ✅ Yes | Via openclaw_scripts_handler |
| Command-dispatch | ✅ Yes | Via openclaw_command_dispatch_handler |
| requires.bins | ✅ Yes | Via DependencyChecker |
| requires.env | ✅ Yes | Via DependencyChecker |
| requires.config | ❌ No | OpenClaw-specific |
| requires.os | 🔄 Phase 3 | Platform filtering |
| install hints | 🔄 Phase 3 | Installation automation |
| Hot reload | 🔄 Phase 3 | Runtime updates |

## Migration Path

### For Users

1. Create `openclaw_skills/` directory
2. Copy OpenClaw skills to `openclaw_skills/`
3. Skills are automatically discovered and registered
4. Use skills like native myagent skills

### For Developers

1. Implement Phase 1 components
2. Update `DependencyChecker` for top-level `requires`
3. Test with sample OpenClaw skills
4. Implement Phase 2 features as needed

## Documentation

### User Documentation

- How to install OpenClaw skills
- How to configure the adapter
- How to use OpenClaw skills in workflows

### Developer Documentation

- Adapter architecture
- Handler implementation patterns
- Extension points for new skill types

## Success Criteria

- [ ] OpenClaw pure prompt skills work with full hook/trace support
- [ ] OpenClaw skills with scripts/ execute correctly
- [ ] Command-dispatch skills route to correct tools
- [ ] Dependency checking works for all skill types
- [ ] LLM traces are sent for all LLM calls
- [ ] Artifact inference works via ClaudeSkillHook
- [ ] Errors are handled gracefully with helpful messages

## Appendix: OpenClaw Frontmatter Reference

### Optional Fields

```yaml
---
name: skill-name
description: Skill description
# Optional fields
slug: skill-name
version: 1.0.0
homepage: https://example.com
user-invocable: true
disable-model-invocation: false
command-dispatch: tool
command-tool: web_search
command-arg-mode: raw
metadata:
  openclaw:
    emoji: 🛠️
    requires:
      bins: []
      anyBins: []
      env: []
      config: []
    primaryEnv: API_KEY
    os: [linux, darwin, win32]
    install: [...]
---
```

### Required Fields

Only `name` and `description` are required.
