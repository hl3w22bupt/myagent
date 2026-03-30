# Dynamic Skill Discovery System

## Overview

The Agent system now includes automatic skill discovery, eliminating the need for hardcoded skill registries. Skills are automatically discovered by scanning the `/skills` directory for `skill.yaml` metadata files.

## Architecture

### Components

1. **SkillDiscovery Service** (`src/core/agent/skill-discovery.ts`)
   - Scans `/skills` directory for skill subdirectories
   - Parses `skill.yaml` files to extract metadata
   - Maintains an in-memory registry of available skills
   - Singleton pattern for efficient access

2. **Agent Integration** (`src/core/agent/agent.ts`)
   - Uses `SkillDiscovery` to automatically load skills on initialization
   - Provides static methods for accessing discovered skills
   - Supports hot-reload for development

### Skill Metadata Format

Each skill must have a `skill.yaml` file in its directory:

```yaml
name: skill-name
version: 1.0.0
description: Brief description of what the skill does
tags: [tag1, tag2, tag3]
type: hybrid

input_schema:
  # Schema for skill inputs

output_schema:
  # Schema for skill outputs

prompt_template: |
  # Optional prompt template

execution:
  handler: handler.py
  function: execute
  timeout: 30000
```

## Usage

### Basic Discovery

```typescript
import { discoverSkills, getSkillDiscovery } from './src/core/agent/skill-discovery';

// Method 1: Convenience function
const skills = await discoverSkills();
console.log(`Found ${skills.length} skills`);

// Method 2: Using singleton instance
const discovery = getSkillDiscovery();
await discovery.discover();
```

### Accessing Skills

```typescript
const discovery = getSkillDiscovery();

// Get all skills
const allSkills = discovery.getAllSkills();

// Get specific skill
const webSearch = discovery.getSkill('web-search');

// Check if skill exists
if (discovery.hasSkill('web-search')) {
  // Skill is available
}

// Filter by tag
const webSkills = discovery.getSkillsByTag('web');

// Get statistics
const stats = discovery.getStats();
console.log(`Total skills: ${stats.total}`);
console.log(`By tag: ${stats.byTag}`);
```

### Integration with Agent

```typescript
import { Agent } from './src/core/agent/agent';

// Skills are automatically discovered when Agent is instantiated
const agent = new Agent(config, sessionId);

// Get discovered skills
const skills = Agent.getDiscoveredSkills();

// Get statistics
const stats = Agent.getSkillStats();

// Hot-reload (useful in development)
await Agent.reloadSkills();
```

## Features

### Automatic Discovery

- Scans `/skills` directory on first Agent instantiation
- Lazy loading - only scans once per application lifecycle
- Graceful handling of missing or malformed skill.yaml files

### Skill Filtering

```typescript
// Get skills by tag
const webSkills = discovery.getSkillsByTag('web');
const videoSkills = discovery.getSkillsByTag('video');
```

### Statistics

```typescript
const stats = discovery.getStats();
// {
//   total: 4,
//   byTag: { web: 1, video: 1, ... },
//   byType: { hybrid: 2, pure-prompt: 1, ... }
// }
```

### Hot-Reload

```typescript
// Reload skills from disk (useful in development)
await Agent.reloadSkills();
```

## Agent-Compatible Format

The `getSkillsRegistry()` method returns skills in the format expected by `PTCGenerator`:

```typescript
const registry = discovery.getSkillsRegistry();
// [
//   {
//     name: 'web-search',
//     description: 'Search the web for information',
//     tags: ['web', 'search', 'research']
//   },
//   ...
// ]
```

## Implementation Details

### YAML Parsing

The system includes a minimal YAML parser that:
- Handles top-level key-value pairs
- Parses inline arrays (`[item1, item2]`)
- Supports multiline strings with `|` or `>`
- Ignores nested properties (only top-level metadata needed)
- Skips comments and empty lines

### Error Handling

- Missing `skill.yaml`: Directory is silently skipped
- Invalid YAML: Error logged, directory skipped
- Missing directory: Returns empty array
- Missing required fields: Logged as warning

## Testing

Run the skill discovery tests:

```bash
npm test -- tests/unit/agent/skill-discovery.test.ts
```

Run the demo:

```bash
npx tsx examples/skill-discovery-demo.ts
```

## Examples

See `examples/skill-discovery-demo.ts` for comprehensive usage examples.

## Migration from Hardcoded Registry

### Before

```typescript
private static skillsRegistry = [
  {
    name: 'web-search',
    description: 'Search the web for information',
    tags: ['web', 'search', 'research'],
  },
  // ... more hardcoded skills
];
```

### After

```typescript
// Skills are automatically discovered from /skills directory
// No hardcoded registry needed!
private skillDiscovery: SkillDiscovery = getSkillDiscovery();
```

## Benefits

1. **Zero Configuration**: New skills are automatically discovered
2. **Type Safe**: Full TypeScript support
3. **Extensible**: Easy to add new skills
4. **Developer Friendly**: No manual registry updates
5. **Production Ready**: Graceful error handling
6. **Hot-Reload**: Support for development workflow

## Future Enhancements

Potential improvements:
- Watch mode for automatic reloading on file changes
- Skill version validation
- Dependency resolution between skills
- Skill deprecation warnings
- Distributed skill discovery (networked registries)
