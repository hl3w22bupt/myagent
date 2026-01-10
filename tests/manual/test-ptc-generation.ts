/**
 * PTC Code Generation Test
 *
 * This script tests the actual PTC code generation using GLM-4.
 */

import { Agent } from '../../src/core/agent/agent.js';

async function testPTCGeneration() {
  // Check environment
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.DEFAULT_LLM_PROVIDER;
  const model = process.env.DEFAULT_LLM_MODEL;

  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set!');
    process.exit(1);
  }

  try {
    const sessionId = `test-${Date.now()}`;
    const agent = new Agent(
      {
        systemPrompt: '你是一个代码生成助手。',
        availableSkills: ['summarize', 'code-analysis'],
      },
      sessionId
    );

    const testTask = '请使用 summarize skill 总结以下文本：人工智能正在改变世界。';

    const startTime = Date.now();

    // This will trigger PTC generation via LLM
    const result = await agent.run(testTask);

    const elapsed = Date.now() - startTime;

    if (result.success) {
      if (result.steps && result.steps.length > 0) {
        result.steps.forEach((step, index) => {});
      }
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
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
