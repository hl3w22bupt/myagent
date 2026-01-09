#!/usr/bin/env ts-node
/**
 * Quick test script for GLM-4 configuration.
 *
 * Usage:
 *   export ANTHROPIC_API_KEY=your_glm_api_key
 *   npm run test-glm4
 */

import { LLMClient } from '../src/core/agent/llm-client';

async function testGLM4() {
  console.log('=== GLM-4 Configuration Test ===\n');

  // Read configuration from environment
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  const provider = process.env.DEFAULT_LLM_PROVIDER || 'openai-compatible';
  const model = process.env.DEFAULT_LLM_MODEL || 'glm-4';
  const baseURL = process.env.LLM_BASE_URL;

  console.log('Configuration:');
  console.log('  Provider:', provider);
  console.log('  Model:', model);
  console.log('  Base URL:', baseURL || 'https://open.bigmodel.cn/api/paas/v4/');
  console.log('  API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');
  console.log('');

  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set!');
    console.log('\nPlease set your GLM-4 API key:');
    console.log('  export ANTHROPIC_API_KEY=your_glm_api_key');
    process.exit(1);
  }

  try {
    console.log('Creating LLM client...');
    const client = new LLMClient({
      provider: provider as 'anthropic' | 'openai-compatible',
      apiKey,
      baseURL,
      model
    });

    console.log('✅ LLM client created\n');

    console.log('Sending test message...');
    const response = await client.messagesCreate([
      {
        role: 'user',
        content: '你好！请用一句话介绍你自己。'
      }
    ]);

    console.log('\n✅ Message sent successfully!\n');
    console.log('Response:');
    console.log('---');
    console.log(response.content);
    console.log('---\n');

    if (response.usage) {
      console.log('Token Usage:');
      console.log('  Prompt tokens:', response.usage.prompt_tokens);
      console.log('  Completion tokens:', response.usage.completion_tokens);
      console.log('  Total tokens:', response.usage.total_tokens);
    }

    console.log('\n✅ GLM-4 is working correctly!');
    console.log('\nYou can now use the Agent system with GLM-4.\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('\nTroubleshooting:');
    console.log('1. Check your API key is correct');
    console.log('2. Verify DEFAULT_LLM_PROVIDER=openai-compatible');
    console.log('3. Check network connection to open.bigmodel.cn');
    console.log('4. Ensure you have sufficient API quota');
    process.exit(1);
  }
}

// Run test
testGLM4()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
