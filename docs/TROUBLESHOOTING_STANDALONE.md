# Agent + Skill Integration Troubleshooting Guide

## Overview

This guide helps diagnose and fix issues in the Agent → PTC → Sandbox → Skills integration chain.

## Table of Contents

1. [Environment Setup Issues](#environment-setup-issues)
2. [Sandbox Execution Failures](#sandbox-execution-failures)
3. [Skill Loading Problems](#skill-loading-problems)
4. [Agent Integration Issues](#agent-integration-issues)
5. [Performance Problems](#performance-problems)
6. [Common Error Messages](#common-error-messages)

---

## Environment Setup Issues

### Issue: `PYTHON_PATH not found`

**Symptoms:**
- Sandbox fails to start with "Python executable not found"
- Error: `Error: spawn python3 ENOENT`

**Diagnosis:**
```bash
# Check if Python is available
which python3
python3 --version

# Check if PYTHON_PATH is set
echo $PYTHON_PATH
```

**Solutions:**

1. **Option 1: Use system Python**
```bash
export PYTHON_PATH=$(which python3)
```

2. **Option 2: Use virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate
export PYTHON_PATH=$(which python3)
```

3. **Option 3: Specify in .env file**
```env
PYTHON_PATH=/usr/bin/python3
```

---

### Issue: `ModuleNotFoundError: No module named 'core'`

**Symptoms:**
- SkillExecutor import fails
- Error: `ModuleNotFoundError: No module named 'core.skill.executor'`

**Diagnosis:**
```bash
# Check project structure
ls -la core/
ls -la core/skill/

# Verify Python can see the modules
python3 -c "import sys; sys.path.insert(0, '.'); from core.skill.executor import SkillExecutor"
```

**Solutions:**

1. **Ensure you're in the project root**
```bash
cd /path/to/myagent
pwd  # Should show project root
```

2. **Verify PYTHONPATH includes current directory**
```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

3. **Check skillImplPath is correctly set**
```typescript
await sandbox.execute(code, {
  skillImplPath: process.cwd(),  // Should be absolute path
  // ...
});
```

---

## Sandbox Execution Failures

### Issue: Sandbox timeout

**Symptoms:**
- Execution hangs and times out
- Error: `Sandbox execution timeout`

**Diagnosis:**
```bash
# Check if timeout is too short
# In tests, look for:
timeout: 10000  // 10 seconds

# Check if skill is actually slow
time python3 -c "from core.skill.executor import SkillExecutor; ..."
```

**Solutions:**

1. **Increase timeout**
```typescript
await sandbox.execute(code, {
  timeout: 60000,  // 60 seconds instead of 10
  // ...
});
```

2. **Check for infinite loops in skill code**
```python
# Make sure async functions properly await
async def execute(self, input_data):
    result = await some_async_call()  # Don't forget await!
```

3. **Check LLM API rate limits**
```bash
# If using pure-prompt skills, LLM might be slow
# Check API status
curl -I https://api.anthropic.com
```

---

### Issue: Python process crashes

**Symptoms:**
- Sandbox returns `success: false` with `error` field
- Error: `Python process exited with code 1`

**Diagnosis:**
```bash
# Run the code directly to see the error
python3 << 'EOF'
import sys
sys.path.insert(0, '.')
# Your test code here
EOF
```

**Solutions:**

1. **Check stderr in sandbox result**
```typescript
const result = await sandbox.execute(code, options);
if (!result.success) {
  console.error('Error:', result.error);
  console.error('Stderr:', result.stderr);
}
```

2. **Add error handling in Python code**
```python
try:
    result = await executor.execute('skill-name', input)
except Exception as e:
    print(json.dumps({
        "success": False,
        "error": str(e),
        "error_type": type(e).__name__
    }))
```

3. **Check Python dependencies**
```bash
# Install required packages
pip3 install -r requirements.txt

# Verify specific packages
python3 -c "import pydantic; import anthropic"
```

---

## Skill Loading Problems

### Issue: Skill not found in registry

**Symptoms:**
- Error: `Skill 'xyz' not found`
- Registry scan returns empty or incomplete results

**Diagnosis:**
```python
# Test registry directly
python3 << 'EOF'
import sys
sys.path.insert(0, '.')
from core.skill.registry import SkillRegistry

registry = SkillRegistry()
skills = await registry.scan()
print(f"Found {len(skills)} skills:")
for name, meta in skills.items():
    print(f"  - {name}")
EOF
```

**Solutions:**

1. **Check skill directory structure**
```bash
# Verify structure:
skills/
  summarize/
    skill.yaml
    handler.py
  code-analysis/
    skill.yaml
    analyzer.py
```

2. **Verify skill.yaml format**
```yaml
# Required fields:
name: summarize
version: 1.0.0
description: Summarizes text
type: pure-prompt
tags: [text, summarization]
```

3. **Check for YAML syntax errors**
```bash
# Validate YAML
python3 -c "import yaml; yaml.safe_load(open('skills/summarize/skill.yaml'))"
```

---

### Issue: Skill execution fails

**Symptoms:**
- Skill loads but execution fails
- Error: `ValidationError` or `AttributeError`

**Diagnosis:**
```python
# Test skill execution directly
python3 << 'EOF'
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor

executor = SkillExecutor()
result = await executor.execute('skill-name', {'input': 'value'})
print(f"Success: {result.success}")
print(f"Output: {result.output}")
print(f"Error: {result.error}")
EOF
```

**Solutions:**

1. **Check input schema**
```yaml
# In skill.yaml, verify input_schema:
input_schema:
  type: object
  properties:
    text:
      type: string
  required:
    - text
```

2. **Verify input matches schema**
```python
# Make sure to provide all required fields
input_data = {
    'text': 'Required field',
    'max_length': 50  # Optional field
}
```

3. **Check handler function signature**
```python
# Pure-script skills:
async def execute(data: Dict[str, Any]) -> Dict[str, Any]:
    # Must return dict
    return {'result': '...'}

# Hybrid skills:
async def handler(input_data: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    # Must accept input_data and context
    return {'output': '...'}
```

---

## Agent Integration Issues

### Issue: Agent fails to generate PTC code

**Symptoms:**
- Agent.run() fails
- Error: `Failed to generate PTC code`

**Diagnosis:**
```typescript
// Check LLM configuration
const agentInfo = agent.getInfo();
console.log('LLM Model:', agentInfo.llmModel);
console.log('Available Skills:', agentInfo.availableSkills);
```

**Solutions:**

1. **Verify ANTHROPIC_API_KEY is set**
```bash
echo $ANTHROPIC_API_KEY
# Should show a valid API key
```

2. **Check API key format**
```env
# Should start with sk-ant-
ANTHROPIC_API_KEY=sk-ant-api03-...
```

3. **Test LLM connection**
```typescript
import { Anthropic } from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Hello' }]
});
console.log(response.content);
```

---

### Issue: Sandbox not executing PTC code

**Symptoms:**
- PTC code generates successfully
- Sandbox execution fails
- Error: `Python execution failed`

**Diagnosis:**
```typescript
// Check sandbox configuration
const agentInfo = agent.getInfo();
console.log('Sandbox Type:', agentInfo.sandboxType);

// Check if sandbox is healthy
const isHealthy = await sandbox.healthCheck();
console.log('Sandbox Healthy:', isHealthy);
```

**Solutions:**

1. **Verify sandbox adapter is registered**
```typescript
import { SandboxFactory } from '@/core/sandbox/factory';
import { LocalSandboxAdapter } from '@/core/sandbox/adapters/local';

// Should be registered:
SandboxFactory.register('local', (config) => {
  return new LocalSandboxAdapter(config);
});
```

2. **Check sandbox configuration**
```typescript
{
  type: 'local',
  config: {
    pythonPath: process.env.PYTHON_PATH || 'python3',
    timeout: 60000
  }
}
```

3. **Test sandbox directly**
```typescript
const testCode = 'print("Hello from sandbox")';
const result = await sandbox.execute(testCode, {
  skills: [],
  skillImplPath: process.cwd(),
  sessionId: 'test-direct',
  timeout: 5000
});
console.log('Result:', result);
```

---

## Performance Problems

### Issue: Slow skill execution

**Symptoms:**
- Skills take > 5 seconds to execute
- Tests timeout frequently

**Diagnosis:**
```bash
# Profile skill execution
time python3 << 'EOF'
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor
import asyncio

executor = SkillExecutor()
async def test():
    result = await executor.execute('skill-name', {'input': 'value'})
    print(result)

asyncio.run(test())
EOF
```

**Solutions:**

1. **Use pure-script skills when possible**
```yaml
# Pure-script is faster than pure-prompt
type: pure-script  # No LLM call
```

2. **Cache LLM results**
```python
# Add caching to handler
from functools import lru_cache

@lru_cache(maxsize=128)
def cached_llm_call(prompt):
    # LLM call here
    pass
```

3. **Optimize Python code**
```python
# Use list comprehensions
result = [process(x) for x in items]

# Avoid unnecessary awaits
# Bad:
for item in items:
    await process(item)  # Sequential

# Good:
await asyncio.gather(*[process(item) for item in items])  # Parallel
```

---

### Issue: High memory usage

**Symptoms:**
- Memory usage grows over time
- Tests fail with out-of-memory errors

**Diagnosis:**
```bash
# Monitor memory usage
python3 -m memory_profiler script.py

# Check for memory leaks
python3 -m tracemalloc
```

**Solutions:**

1. **Clean up resources**
```typescript
afterAll(async () => {
  await agent.cleanup();
  await sandbox.cleanup();
});
```

2. **Limit skill registry cache**
```python
class SkillRegistry:
    def __init__(self, max_cache_size: int = 10):
        self._cache = {}
        self._max_cache_size = max_cache_size
```

3. **Use weak references for subagents**
```typescript
import { WeakMap } from 'weak-map';

private subagents: WeakMap<string, Agent> = new WeakMap();
```

---

## Common Error Messages

### `ModuleNotFoundError: No module named 'anthropic'`

**Cause:** Anthropic SDK not installed

**Fix:**
```bash
pip3 install anthropic
# or
npm install @anthropic-ai/sdk
```

---

### `ValidationError: 1 validation error`

**Cause:** Input doesn't match skill's schema

**Fix:** Check skill.yaml for required fields and provide them

---

### `AttributeError: 'NoneType' object has no attribute 'xxx'`

**Cause:** LLM returned null or unexpected response

**Fix:** Add null checks and proper error handling

---

### `SyntaxError: invalid syntax`

**Cause:** Generated Python code has syntax errors

**Fix:** Improve PTC generation prompts and validate code before execution

---

## Debug Commands

```bash
# Run all tests
npm test

# Run only standalone tests
npm test tests/integration/agent-skill-standalone.test.ts

# Run with verbose output
npm test -- --verbose

# Run with coverage
npm test -- --coverage

# Run Python tests
python3 -m pytest tests/

# Check Python environment
python3 -c "import sys; print(sys.path)"

# Test skill directly
python3 << 'EOF'
import sys
sys.path.insert(0, '.')
from core.skill.executor import SkillExecutor
import asyncio

asyncio.run(SkillExecutor().execute('summarize', {'text': 'Test'}))
EOF
```

---

## Getting Help

If issues persist:

1. Check test output: `npm test 2>&1 | tee test.log`
2. Enable debug logging: Set `DEBUG=1` environment variable
3. Review error messages carefully
4. Check this guide's diagnostic sections first
5. Verify all environment variables are set correctly

---

## Prevention

**Best Practices:**

1. Always run tests after changes
2. Use type checking: `npm run type-check`
3. Run linters: `npm run lint`
4. Keep dependencies updated
5. Document new skills properly
6. Test skills individually before integration
7. Monitor performance metrics
8. Clean up resources in tests

---

**Last Updated:** Phase 4.5 Implementation
**Version:** 1.0.0
