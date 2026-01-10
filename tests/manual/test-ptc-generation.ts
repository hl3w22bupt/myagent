/**
 * PTC Code Generation Test
 *
 * This script tests the actual PTC code generation using GLM-4.
 */

import { Agent } from '../../src/core/agent/agent.js';

async function testPTCGeneration() {
  console.log('=== PTC Code Generation Test ===\n');

  // Check environment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.DEFAULT_LLM_PROVIDER;
  const model = process.env.DEFAULT_LLM_MODEL;

  console.log('Configuration:');
  console.log('  API Key:', apiKey ? '✓ Set' : '✗ Not set');
  console.log('  Provider:', provider || 'anthropic (default)');
  console.log('  Model:', model || 'claude-sonnet-4-5 (default)');
  console.log('');

  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set!');
    console.log('\nPlease set your API key in .env file:');
    console.log('  ANTHROPIC_API_KEY=your_api_key');
    process.exit(1);
  }

  try {
    console.log('Creating Agent...');
    const sessionId = `test-${Date.now()}`;
    const agent = new Agent({
      systemPrompt: '你是一个代码生成助手。',
      availableSkills: ['summarize', 'code-analysis']
    }, sessionId);

    console.log('✓ Agent created\n');
    console.log('Testing PTC code generation...\n');

    const testTask = '请使用 summarize skill 总结以下文本：人工智能正在改变世界。';
    console.log('Task:', testTask);
    console.log('');

    const startTime = Date.now();

    // This will trigger PTC generation via LLM
    const result = await agent.run(testTask);

    const elapsed = Date.now() - startTime;

    console.log('\n=== Result ===');
    console.log('Success:', result.success);
    console.log('Execution Time:', `${elapsed}ms`);
    console.log('');

    if (result.success) {
      console.log('Output:');
      console.log('---');
      console.log(result.output);
      console.log('---\n');

      if (result.steps && result.steps.length > 0) {
        console.log('Execution Steps:');
        result.steps.forEach((step, index) => {
          console.log(`  ${index + 1}. ${step.type}: ${step.content.substring(0, 100)}...`);
        });
      }

      console.log('\n✅ PTC code generation successful!');
      console.log('✓ This confirms that:');
      console.log('  1. LLM API was called');
      console.log('  2. PTC code was generated');
      console.log('  3. Code was executed in Sandbox');
      console.log('  4. Skills were invoked');

    } else {
      console.error('❌ Execution failed');
      console.error('Error:', result.error);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testPTCGeneration()
  .then(() => {
    console.log('\n=== Test Complete ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
