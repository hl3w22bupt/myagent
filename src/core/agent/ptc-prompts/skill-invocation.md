# Skill Invocation Methodology

You are calling skills (functions) via `executor.execute()`. Each skill has a defined parameter schema.
You MUST call skills correctly by following this methodology.

## Parameter Classification

Every parameter in a skill's schema falls into one of two categories:

### Category 1: Structured Parameters (direct)
These accept precise, typed values. What you pass is what the skill uses directly.
Examples: `file_path`, `command`, `old_string`, `new_string`, `content`, `args`, `query`

### Category 2: Natural Language Parameters (fallback)
These accept a natural language description. The skill will internally use an LLM to parse it into structured values.
Examples: `task`, `text`, `description`

**How to identify**: A parameter named `task`, `text`, `query`, or `description` is a natural language parameter. ALL other parameters are structured parameters.

## Calling Rules

**Rule 1 - Prefer structured parameters.**
If you know the exact value for a structured parameter, pass it directly.
```python
# CORRECT: You know the exact file path
input_data={'file_path': '/tmp/README.md', 'content': 'Hello World'}

# CORRECT: You know the exact shell command
input_data={'command': 'git status'}
```

**Rule 2 - Use natural language parameter only as fallback.**
Only use `task`/`text`/`query`/`description` when you cannot determine exact values for structured parameters.
```python
# CORRECT: You don't know the exact command, let the skill's internal LLM figure it out
input_data={'task': 'list all Python files in the project'}

# WRONG: You DO know the exact command but still used 'task'
input_data={'task': 'git status'}  # This triggers unnecessary LLM parsing inside the skill
```

**Rule 3 - Never pass parameters not in the schema.**
Only use parameter names that appear in the skill's parameter list above.
```python
# WRONG: 'content' is not a parameter of tool-edit
input_data={'task': 'edit file', 'content': 'some content'}  # 'content' is ignored or causes error
```

**Rule 4 - For multi-skill chaining, extract exact values from previous output.**
When a previous skill returns structured data, extract specific values and pass them as structured parameters to the next skill.
```python
# Step 1: Read file (structured param)
result1 = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='tool-read',
    input_data={'file_path': 'config.json'}
)

# Step 2: Edit file using exact content from step 1
if result1['success']:
    file_content = str(result1['content'])
    # Extract the exact old_string from file_content
    old_value = '"debug": false'
    new_value = '"debug": true'
    result2 = await execute_with_retry(
        execute_func=executor.execute,
        skill_name='tool-edit',
        input_data={
            'file_path': 'config.json',
            'old_string': old_value,
            'new_string': new_value,
        }
    )
```

## Code Template

For each skill, use this template pattern:

```python
# When you know exact values for structured parameters:
result = await execute_with_retry(
    execute_func=executor.execute,
    skill_name='SKILL_NAME',
    input_data={
        # Pass structured parameters with exact values
        'param1': exact_value_1,
        'param2': exact_value_2,
        # ... only include parameters from the skill's schema
    }
)

if result['success']:
    print(result['content'])
else:
    error = result['content'].get('message', 'Unknown error') if isinstance(result['content'], dict) else str(result['content'])
    print(f"Error: {error}")
```

## Selected Skills Schema

{{SKILLS_BLOCK}}
