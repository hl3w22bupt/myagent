#!/usr/bin/env node
/**
 * Debug GLM-4 Response - See what GLM-4 actually returns
 */

import dotenv from 'dotenv';
dotenv.config();

import { LLMClient } from './core/agent/llm-client.js';

async function main() {
  console.log('=== GLM-4 Response Debug ===\n');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.DEFAULT_LLM_MODEL || 'glm-4';

  console.log('Model:', model);
  console.log('');

  const client = new LLMClient({
    provider: 'openai-compatible',
    apiKey: apiKey,
    model: model
  });

  // Test 1: Simple text generation
  console.log('Test 1: Simple Text Generation');
  console.log('---');

  const response1 = await client.messagesCreate([
    {
      role: 'user',
      content: '你好！请用一句话介绍你自己。'
    }
  ]);

  console.log('Response:', response1.content);
  console.log('');
  console.log('✅ Test 1 passed\n');

  // Test 2: JSON format generation
  console.log('Test 2: JSON Format Generation');
  console.log('---');

  const response2 = await client.messagesCreate([
    {
      role: 'user',
      content: `请返回以下 JSON 格式（不要有任何其他文字）：
<plan>
{
  "selected_skills": ["summarize"],
  "reasoning": "测试原因"
}
</plan>`
    }
  ]);

  console.log('Response:', response2.content);
  console.log('');
  console.log('✅ Test 2 passed\n');

  // Test 3: Code generation
  console.log('Test 3: Code Generation');
  console.log('---');

  const response3 = await client.messagesCreate([
    {
      role: 'user',
      content: `请生成以下 Python 代码（只返回代码，不要解释）：

<code>
print("Hello from GLM-4")
</code>`
    }
  ]);

  console.log('Response:');
  console.log(response3.content);
  console.log('');
  console.log('✅ Test 3 passed\n');

  // Test 4: Full PTC planning
  console.log('Test 4: Full PTC Planning');
  console.log('---');

  const response4 = await client.messagesCreate([
    {
      role: 'user',
      content: `You are an agent that plans task execution by selecting skills.

<available_skills>
- summarize: Summarize text content
- code-analysis: Analyze code quality
</available_skills>

<task>
Summarize this text: Hello world
</task>

Please output:
1. Which skills to use (in order)
2. Brief reasoning for each skill selection

Output format (JSON):
<plan>
{
  "selected_skills": ["skill1"],
  "reasoning": "Use skill1 to..."
}
</plan>`
    }
  ]);

  console.log('Response:');
  console.log(response4.content);
  console.log('');

  // Try to parse JSON
  const jsonMatch = response4.content.match(/<plan>\s*(\{.*?\})\s*<\/plan>/s);
  if (jsonMatch) {
    console.log('✅ JSON parsed successfully');
    console.log('Parsed:', JSON.parse(jsonMatch[1]));
  } else {
    console.log('⚠️  JSON not found in expected format');
    console.log('Looking for plain JSON...');
    const plainJsonMatch = response4.content.match(/\{[^}]*"selected_skills"[^}]*\}/);
    if (plainJsonMatch) {
      console.log('Found JSON:', plainJsonMatch[0]);
    }
  }

  console.log('');
  console.log('🎉 All tests completed!');
}

main().catch(error => {
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});
