# Claude Skills Adapter for myagent

## Overview

The Claude Skills Adapter enables myagent to discover, analyze, and execute Claude Skills (defined in SKILL.md files). This creates a unified interface where both native myagent skills and Claude Skills can be used interchangeably.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Skills Layer                     │
│  .claude/skills/my-skill/SKILL.md                           │
│  .claude/skills/my-skill/main.py                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Adapter Layer                              │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │   Scanner        │  │   Analyzer       │               │
│  │  (Discover .md)  │→ │  (Parse content) │               │
│  └──────────────────┘  └──────────────────┘               │
│           ↓                      ↓                          │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  Generator       │  │ VirtualRegistry  │               │
│  │ (Create mapping) │→ │  (In-memory)     │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   myagent Skill Layer                       │
│  SkillRegistry (unified interface)                          │
│  SkillExecutor (unified execution)                          │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. ClaudeSkillScanner

Discovers SKILL.md files from configured directories.

```python
from src.core.skill import ClaudeSkillScanner

scanner = ClaudeSkillScanner()
skill_files = scanner.scan()

for skill_file in skill_files:
    print(f"Found: {skill_file.skill_name} at {skill_file.path}")
```

### 2. ClaudeSkillAnalyzer

Parses SKILL.md content and extracts metadata using smart analysis.

```python
from src.core.skill import ClaudeSkillAnalyzer

analyzer = ClaudeSkillAnalyzer()
skill_info = analyzer.analyze(skill_file)

print(f"Type: {skill_info.type}")  # 'pure-prompt' or 'hybrid'
print(f"Tags: {skill_info.tags}")
print(f"Has Script: {skill_info.has_script}")
```

### 3. MyagentSkillGenerator

Converts Claude Skills to myagent-compatible definitions.

```python
from src.core.skill import MyagentSkillGenerator

generator = MyagentSkillGenerator()
definition = generator.generate_yaml(skill_info)

# Or create a VirtualSkill
virtual_skill = generator.to_virtual_skill(skill_info)
```

### 4. VirtualSkillRegistry

In-memory registry for Claude Skills without generating files.

```python
from src.core.skill import VirtualSkillRegistry

registry = VirtualSkillRegistry()
await registry.scan()

skill_names = registry.get_skill_names()
print(f"Registered: {skill_names}")
```

## Usage

### Quick Start

#### 1. Create a Claude Skill

Create a `.claude/skills/my-skill/SKILL.md` file:

```markdown
---
description: Analyzes code quality and provides suggestions
tags:
  - code
  - analysis
  - quality
---

# Code Analysis Skill

Analyze code quality and provide improvement suggestions.

## Input

- `code`: The source code to analyze
- `language`: Programming language (optional)

## Output Format

JSON with analysis results and suggestions.

## Examples

Example 1: Analyze Python code
```
Input: {"code": "def foo(): pass"}
Output: {"quality": "low", "suggestions": ["Add docstring"]}
```
```

Optionally add a `main.py` script:

```python
import json
import sys

def analyze_code(code: str, language: str = "python") -> dict:
    """Analyze code and return suggestions."""
    # Your analysis logic here
    return {
        "quality": "good",
        "suggestions": []
    }

if __name__ == "__main__":
    # Read from stdin
    input_data = json.loads(sys.stdin.read())

    # Execute
    result = analyze_code(
        code=input_data.get("code", ""),
        language=input_data.get("language", "python")
    )

    # Write to stdout
    print(json.dumps({"success": True, "output": result}))
```

#### 2. Use Claude Skills in Motia

```python
from src.core.skill import create_executor_with_claude_skills

# Create executor with Claude Skills support
executor = await create_executor_with_claude_skills()

# Execute a Claude Skill
result = await executor.execute(
    'my-skill',
    {
        'task': {
            'code': 'def foo(): pass',
            'language': 'python'
        }
    }
)

if result.success:
    print(f"Output: {result.output}")
else:
    print(f"Error: {result.error}")
```

#### 3. List Available Skills

```python
from src.core.skill import list_all_skills

all_skills = await list_all_skills()

print(f"Total: {all_skills['total']}")
print(f"Native: {len(all_skills['native'])}")
print(f"Claude: {len(all_skills['claude'])}")
```

## Configuration

Edit `config/claude-skills-adapter.yaml`:

```yaml
# Directory paths for Claude Skills discovery
claude_skills:
  scan_paths:
    - .claude/skills
    - .claude/custom-skills  # Add custom paths

  skill_file_pattern: "SKILL.md"

# Adapter behavior settings
adapter:
  analysis_strategy: smart  # smart or manual
  default_tags:
    - claude-skill
    - adapted
  default_output_type: auto  # text, json, or auto

# Execution settings
execution:
  handler: src/core/skill/handlers/claude_skill_handler.py
  script_discovery: auto  # main, named, first, or auto
  timeout: 30000  # milliseconds

# Virtual skill registry settings
registry:
  use_virtual_registry: true
  generate_yaml_files: false
```

## Smart Analysis

The adapter automatically detects:

### Skill Type

- **Pure Prompt**: No script found, returns prompt template
- **Hybrid**: Script found, executes code

### Tags

Extracted from SKILL.md frontmatter:
```yaml
---
tags:
  - code
  - analysis
---
```

Plus default tags: `claude-skill`, `adapted`

### Output Type

Detected from "Output Format" section:
- "Output Format: JSON" → `json`
- "Output Format: text" → `text`
- Default → `text`

### Script Discovery

Search order:
1. `main.py` (Claude Code standard)
2. `{skill-name}.py`
3. First `.py` file found

## Execution Flow

```
User Request
    ↓
SkillExecutor.execute('my-skill', {...})
    ↓
SkillRegistry.load_full('my-skill')
    ↓
VirtualSkillRegistry.load_full('my-skill')  [if Claude Skill]
    ↓
ClaudeSkillHandler.execute({...})
    ↓
Subprocess: python main.py
    ↓
Return result
```

## Examples

See `examples/claude_skills_demo.py` for a complete demo:

```bash
python examples/claude_skills_demo.py
```

## Advanced Usage

### Custom Scan Paths

```python
from src.core.skill import ClaudeSkillScanner, ClaudeSkillAnalyzer, VirtualSkillRegistry

scanner = ClaudeSkillScanner(scan_paths=[
    '.claude/skills',
    '.claude/experimental',
    './custom-skills'
])

analyzer = ClaudeSkillAnalyzer()
registry = VirtualSkillRegistry(scanner=scanner, analyzer=analyzer)
await registry.scan()
```

### Custom Tags

```python
from src.core.skill import ClaudeSkillAnalyzer

analyzer = ClaudeSkillAnalyzer(
    default_tags=['my-custom-tag', 'adapted']
)
```

### Direct Access to Virtual Registry

```python
from src.core.skill import VirtualSkillRegistry

registry = VirtualSkillRegistry()
await registry.scan()

# Get specific skill
skill = registry.get_virtual_skill('my-skill')
print(skill.definition)
```

## Troubleshooting

### Claude Skills Not Found

```
✗ No Claude Skills found
```

**Solution**: Create the directory structure:
```bash
mkdir -p .claude/skills/my-skill
touch .claude/skills/my-skill/SKILL.md
```

### Script Not Found

```
✗ No Python script found for skill "my-skill"
```

**Solution**: Add a script (named `main.py`, `my-skill.py`, or any `.py` file)

### Execution Timeout

```
✗ Script execution timed out after 30s
```

**Solution**: Increase timeout in `config/claude-skills-adapter.yaml`:
```yaml
execution:
  timeout: 60000  # 60 seconds
```

## Design Decisions

### Smart Strategy vs Manual

- **Smart (default)**: Auto-analyze SKILL.md content
- **Manual**: Require explicit configuration (not implemented in MVP)

### Virtual Registry vs YAML Files

- **Virtual Registry (default)**: In-memory, faster, recommended
- **YAML Files**: Generate skill.yaml files (optional, not recommended)

### Output Type Detection

- **Auto (default)**: Detect from "Output Format" section, fallback to text
- **Text**: Always return text
- **JSON**: Always expect JSON

## Limitations (MVP)

- No hot reload
- Only Python scripts supported
- No Claude Code tool-specific features
- No manual configuration mode
- No YAML file generation mode

## Future Enhancements

- Hot reload for development
- JavaScript/TypeScript script support
- Manual configuration mode
- YAML file generation
- Claude Code tool integration
- Skill dependencies and chaining

## Related Documentation

- `docs/ai-rd-platform-concept.md` - Original design specification
- `.cursor/rules/motia/` - Motia development patterns
- `src/core/skill/` - Skill system implementation
