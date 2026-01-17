/**
 * Test script to verify subagent YAML loading.
 */

import { MasterAgent } from '../src/core/agent/master-agent';

async function main() {
  console.log('Testing Subagent YAML Loading...\n');

  const masterAgent = new MasterAgent(
    {
      systemPrompt: 'You are a helpful assistant.',
      availableSkills: ['*'],
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      },
      sandbox: {
        type: 'local',
        local: {
          pythonPath: 'python3',
          timeout: 5000,
        },
      },
      subagents: ['code-reviewer', 'data-analyst', 'security-auditor'],
    },
    'test-yaml-loading-session'
  );

  console.log('\n=== MasterAgent Info ===');
  const info = masterAgent.getInfo();
  console.log('Type:', info.type);
  console.log('Subagents:', info.subagents);

  console.log('\n=== Verifying all subagents loaded ===');
  const expected = ['code-reviewer', 'data-analyst', 'security-auditor'];
  const missing = expected.filter((s) => !info.subagents.includes(s));

  if (missing.length === 0) {
    console.log('✓ All subagents loaded successfully from YAML files!');
  } else {
    console.log('✗ Missing subagents:', missing);
  }

  await masterAgent.cleanup();
  console.log('\nTest completed.');
}

main().catch(console.error);
