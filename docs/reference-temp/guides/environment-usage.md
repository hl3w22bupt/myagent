# Environment Configuration Usage Guide

## Overview

The `environment` field allows you to pass structured configuration context to the agent without cluttering the task description. These values are automatically formatted and prepended to the user request in the prompt.

## Common Use Cases

### 1. Programming Tasks

```typescript
// Example: Analyze a codebase
{
  "task": "Analyze the codebase structure and identify potential improvements",
  "environment": {
    "workspace": "/Users/leo/workspace/myagent",
    "language": "typescript",
    "framework": "motia",
    "branch": "main"
  }
}
```

**Result in prompt:**
```xml
<environment>
workspace: /Users/leo/workspace/myagent
language: typescript
framework: motia
branch: main
</environment>

<original_task>
Analyze the codebase structure and identify potential improvements
</original_task>
```

### 2. Git Repository Tasks

```typescript
// Example: Review a pull request
{
  "task": "Review the changes in this pull request",
  "environment": {
    "gitUrl": "https://github.com/user/repo",
    "prNumber": 123,
    "baseBranch": "main",
    "targetBranch": "feature/new-feature"
  }
}
```

### 3. Web Development Tasks

```typescript
// Example: Build a new feature
{
  "task": "Add a user authentication system",
  "environment": {
    "framework": "nextjs",
    "language": "typescript",
    "uiLibrary": "tailwindcss",
    "database": "postgresql",
    "authProvider": "nextauth"
  }
}
```

### 4. Data Analysis Tasks

```typescript
// Example: Analyze dataset
{
  "task": "Perform exploratory data analysis",
  "environment": {
    "dataset": "/data/sales_2024.csv",
    "format": "csv",
    "language": "python",
    "libraries": ["pandas", "matplotlib", "seaborn"]
  }
}
```

## API Reference

### Request Format

```typescript
POST /agent/execute
{
  "task": string,                    // Required: Task description
  "environment": {                   // Optional: Environment configuration
    [key: string]: any               // Any key-value pairs
  },
  "delegateTo": string[],           // Optional: Explicit delegation
  "availableSkills": string[],      // Optional: Skill restriction
  "sessionId": string,              // Optional: For multi-turn conversations
  // ... other fields
}
```

### Environment Fields (Suggestions)

While you can use any key-value pairs, here are common conventions:

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `workspace` | string | `"/path/to/project"` | Project root directory |
| `gitUrl` | string | `"https://github.com/user/repo"` | Git repository URL |
| `branch` | string | `"main"` | Git branch name |
| `language` | string | `"typescript"` | Programming language |
| `framework` | string | `"react"` | Framework name |
| `database` | string | `"postgresql"` | Database type |
| `dataset` | string | `"/data/file.csv"` | Dataset path |
| `format` | string | `"csv"` | File format |
| `libraries` | string[] | `["pandas", "numpy"]` | Libraries to use |

## Best Practices

### 1. Use for Context, Not Commands

✅ **Good:**
```json
{
  "task": "Fix the authentication bug",
  "environment": {
    "language": "typescript",
    "framework": "nextjs"
  }
}
```

❌ **Bad:**
```json
{
  "task": "Fix the bug",
  "environment": {
    "instructions": "Use TypeScript and Next.js framework"
  }
}
```

### 2. Keep It Focused

Only include relevant environment variables for the specific task:

✅ **Good:**
```json
{
  "task": "Optimize database queries",
  "environment": {
    "database": "postgresql",
    "table": "users"
  }
}
```

❌ **Bad:**
```json
{
  "task": "Optimize database queries",
  "environment": {
    "database": "postgresql",
    "table": "users",
    "uiFramework": "react",
    "cssFramework": "tailwind",
    "buildTool": "webpack"
  }
}
```

### 3. Use Consistent Naming

Follow common conventions for field names:

- `workspace` (not `projectPath`, `dir`, `folder`)
- `language` (not `lang`, `programmingLanguage`)
- `framework` (not `fw`, `frameworkName`)

## How It Works

### Data Flow

```
API Request (environment)
    ↓
agent-api.step.ts (stores in event data)
    ↓
master-agent.step.ts (copies to context.environment)
    ↓
DefaultContextOrchestrator (extracts to OrchestratedContext.environment)
    ↓
Agent.execute() (passes to ptcOptions.environment)
    ↓
PTCGenerator (formats into <environment> section)
    ↓
LLM Prompt (with environment prepended)
```

### Prompt Formatting

The environment is formatted as XML-like tags and placed **before** the original task:

```xml
<environment>
key1: value1
key2: value2
key3: ["array", "values"]
</environment>

<original_task>
Your task description here
</original_task>
```

This ensures the LLM sees the context **before** processing the task.

## Examples

### Complete Example: Web Development Task

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Add a user login form with email and password fields",
    "environment": {
      "workspace": "/Users/leo/projects/myapp",
      "language": "typescript",
      "framework": "nextjs",
      "uiLibrary": "shadcn/ui",
      "styling": "tailwindcss",
      "auth": "nextauth"
    },
    "availableSkills": ["frontend-design", "web-search"]
  }'
```

### Complete Example: Code Review Task

```bash
curl -X POST http://localhost:3000/agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Review the pull request for security vulnerabilities",
    "environment": {
      "gitUrl": "https://github.com/user/repo",
      "prNumber": 123,
      "baseBranch": "main",
      "targetBranch": "feature/auth"
    },
    "delegateTo": ["security-auditor"]
  }'
```

## Migration from Inline Context

### Before (cluttered task):

```json
{
  "task": "In the /Users/leo/workspace/myagent TypeScript project using Motia framework, analyze the codebase structure",
  "availableSkills": ["code-analyzer"]
}
```

### After (clean separation):

```json
{
  "task": "Analyze the codebase structure",
  "environment": {
    "workspace": "/Users/leo/workspace/myagent",
    "language": "typescript",
    "framework": "motia"
  },
  "availableSkills": ["code-analyzer"]
}
```

## Benefits

1. **Cleaner Task Descriptions**: Keep task instructions focused on what to do
2. **Better Readability**: Context is structured and easy to parse
3. **Reusability**: Same environment can be used for multiple tasks
4. **Type Safety**: Environment values are validated by Zod schema
5. **Prompt Positioning**: Automatically placed in optimal position in prompt

## Related Features

- **`delegateTo`**: Combine with environment for specific subagent delegation
- **`availableSkills`**: Restrict skills along with environment context
- **`userContext`**: For application-specific configuration (e.g., AI girlfriend persona)
- **`sessionId`**: Maintain environment across multi-turn conversations
