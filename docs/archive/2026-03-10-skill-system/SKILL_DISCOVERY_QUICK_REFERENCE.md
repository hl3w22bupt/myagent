# Skill Discovery Quick Reference

## API Reference

### SkillDiscovery Class

```typescript
import { SkillDiscovery, getSkillDiscovery, discoverSkills } from './src/core/agent/skill-discovery';
```

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `discover()` | Scan and load all skills | `Promise<SkillMetadata[]>` |
| `getAllSkills()` | Get all discovered skills | `SkillMetadata[]` |
| `getSkill(name)` | Get specific skill by name | `SkillMetadata \| undefined` |
| `hasSkill(name)` | Check if skill exists | `boolean` |
| `getSkillsByTag(tag)` | Filter skills by tag | `SkillMetadata[]` |
| `getStats()` | Get skill statistics | `{ total, byTag, byType }` |
| `reload()` | Reload skills from disk | `Promise<SkillMetadata[]>` |
| `getSkillsRegistry()` | Get Agent-compatible format | `Array<{name, description, tags}>` |

### Agent Static Methods

```typescript
import { Agent } from './src/core/agent/agent';
```

| Method | Description | Returns |
|--------|-------------|---------|
| `Agent.getDiscoveredSkills()` | Get all discovered skills | `Array<{name, description, tags}>` |
| `Agent.reloadSkills()` | Hot-reload skills | `Promise<void>` |
| `Agent.getSkillStats()` | Get statistics | `{ total, byTag, byType }` |

## SkillMetadata Interface

```typescript
interface SkillMetadata {
  name: string;           // Skill identifier
  description: string;    // Human-readable description
  tags: string[];         // Skill tags for filtering
  version?: string;       // Optional version
  type?: string;          // Optional type (hybrid, pure-prompt, etc.)
  path: string;           // Path to skill directory
}
```

## skill.yaml Format

```yaml
name: skill-name
version: 1.0.0
description: Skill description
tags: [tag1, tag2, tag3]
type: hybrid
```

## Common Usage Patterns

### Discover All Skills

```typescript
const skills = await discoverSkills();
console.log(`Found ${skills.length} skills`);
```

### Check if Skill Exists

```typescript
const discovery = getSkillDiscovery();
if (discovery.hasSkill('web-search')) {
  // Skill is available
}
```

### Filter by Tag

```typescript
const discovery = getSkillDiscovery();
const webSkills = discovery.getSkillsByTag('web');
```

### Get Statistics

```typescript
const stats = discovery.getStats();
console.log(`Total: ${stats.total}`);
console.log(`Tags: ${Object.keys(stats.byTag)}`);
```

### Hot-Reload (Development)

```typescript
await Agent.reloadSkills();
```

## File Locations

| Component | Path |
|-----------|------|
| Skill Discovery | `/src/core/agent/skill-discovery.ts` |
| Agent Integration | `/src/core/agent/agent.ts` |
| Tests | `/tests/unit/agent/skill-discovery.test.ts` |
| Demo | `/examples/skill-discovery-demo.ts` |
| Skills Directory | `/skills/` |

## Current Skills

| Name | Description | Tags |
|------|-------------|------|
| web-search | Search the web for information | web, research, search |
| summarize | Summarize text content | text, summarization, nlp |
| code-analysis | Analyze code quality | code, analysis, quality |
| remotion-generator | Generate videos with Remotion | remotion, video, animation |

## Testing

```bash
# Run skill discovery tests
npm test -- tests/unit/agent/skill-discovery.test.ts

# Run demo
npx tsx examples/skill-discovery-demo.ts

# Run all Agent tests
npm test -- tests/unit/agent/
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing `skill.yaml` | Directory skipped, logged as debug |
| Invalid YAML | Error logged, directory skipped |
| Missing `/skills` dir | Returns empty array, warns |
| Missing required fields | Warning logged |

## Performance

- **Lazy Loading**: Only scans once on first Agent instantiation
- **Singleton Pattern**: Shared instance across application
- **Efficient Parsing**: Minimal YAML parser for top-level metadata only
- **No File Watchers**: Manual reload required for changes

## Migration Guide

### Before
```typescript
private static skillsRegistry = [
  { name: 'web-search', description: '...', tags: [...] },
  { name: 'summarize', description: '...', tags: [...] },
];
```

### After
```typescript
// No hardcoded registry needed!
// Skills are automatically discovered from /skills directory
private skillDiscovery: SkillDiscovery = getSkillDiscovery();
```

## Best Practices

1. **Always include `skill.yaml`**: Required for discovery
2. **Use descriptive tags**: Helps with filtering and categorization
3. **Keep descriptions clear**: Used by PTCGenerator for skill selection
4. **Version your skills**: Add `version` field for tracking
5. **Use kebab-case names**: e.g., `my-awesome-skill`

## Troubleshooting

### Skills not discovered?
- Check that `/skills` directory exists
- Verify `skill.yaml` files are present
- Check file permissions
- Look for error messages in logs

### Hot-reload not working?
- Ensure you're calling `await Agent.reloadSkills()`
- Check for file system watchers in production
- Restart application if needed

### Parsing errors?
- Validate YAML syntax
- Check for special characters
- Ensure proper indentation
- Look for typos in key names
