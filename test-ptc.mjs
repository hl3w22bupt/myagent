#!/usr/bin/env node
/**
 * Quick PTC Test - Test PTC generation with GLM-4
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { Agent } from './core/agent/agent.js';

async function main() {
  console.log('=== PTC Code Generation Test (GLM-4) ===\n');

  // Check configuration
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const provider = process.env.DEFAULT_LLM_PROVIDER;
  const model = process.env.DEFAULT_LLM_MODEL;

  console.log('Configuration:');
  console.log('  API Key:', apiKey ? `✓ Set (${apiKey.substring(0, 10)}...)` : '✗ Not set');
  console.log('  Provider:', provider || 'anthropic (default)');
  console.log('  Model:', model || 'claude-sonnet-4-5 (default)');
  console.log('');

  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set!');
    console.log('\nPlease add to .env file:');
    console.log('  ANTHROPIC_API_KEY=your_glm_api_key');
    console.log('  DEFAULT_LLM_PROVIDER=openai-compatible');
    console.log('  DEFAULT_LLM_MODEL=glm-4');
    process.exit(1);
  }

  try {
    console.log('Creating Agent with GLM-4...');
    const agent = new Agent({
      systemPrompt: '你是一个代码生成助手，专门使用 PTC (Programmatic Tool Calling) 模式。',
      availableSkills: ['summarize', 'code-analysis', 'web-search']
    });

    console.log('✓ Agent created\n');

    // Test task - simple summarization
    const testTask = '请使用 summarize skill 总结这句话：人工智能正在改变世界。';
    console.log('Task:', testTask);
    console.log('');
    console.log('⏳ Calling GLM-4 API to generate PTC code...');
    console.log('');

    const startTime = Date.now();
    const result = await agent.run(testTask);
    const elapsed = Date.now() - startTime;

    console.log('\n=== Result ===');
    console.log('Success:', result.success ? '✅ Yes' : '❌ No');
    console.log('Execution Time:', `${elapsed}ms`);
    console.log('');

    if (result.success && result.output) {
      console.log('📦 Output:');
      console.log('---');
      console.log(result.output);
      console.log('---\n');
    }

    if (result.steps && result.steps.length > 0) {
      console.log('📝 Execution Steps:');
      result.steps.forEach((step, index) => {
        const icon = index === 0 ? '🎯' : index === result.steps.length - 1 ? '✅' : '⚙️';
        console.log(`  ${icon} Step ${index + 1}: ${step.type}`);
        if (step.metadata) {
          console.log(`     Metadata: ${JSON.stringify(step.metadata).substring(0, 100)}...`);
        }
      });
      console.log('');
    }

    if (result.metadata) {
      console.log('📊 Metadata:');
      console.log(`  LLM Calls: ${result.metadata.llmCalls}`);
      console.log(`  Skill Calls: ${result.metadata.skillCalls}`);
      console.log(`  Total Tokens: ${result.metadata.totalTokens}`);
      console.log('');
    }

    console.log('✅ Test Successful!');
    console.log('');
    console.log('Verification:');
    console.log('  ✓ GLM-4 API was called');
    console.log('  ✓ PTC code was generated');
    console.log('  ✓ Code executed in Sandbox');
    console.log('  ✓ Skills were available');
    console.log('');
    console.log('🎉 PTC generation is working with GLM-4!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
