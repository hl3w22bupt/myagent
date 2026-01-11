/**
 * Example: Using Agent with Dynamic Skill Discovery
 *
 * This example shows how to create an Agent that automatically
 * discovers and uses skills from the /skills directory.
 */

import { Agent } from '../src/core/agent/agent';
import type { AgentConfig } from '../src/core/agent/types';

async function main() {
  console.log('=== Agent with Dynamic Skills Example ===\n');

  // 0. Wait for skills to be initialized
  console.log('0. Initializing skills...');
  await Agent.awaitSkillsInitialized();
  console.log('   Skills initialized!\n');

  // 1. Check what skills are discovered
  console.log('1. Checking discovered skills...');
  const skills = Agent.getDiscoveredSkills();
  console.log(`   Found ${skills.length} skills:`);
  skills.forEach((skill) => {
    console.log(`   - ${skill.name}: ${skill.description}`);
  });

  // 2. Get skill statistics
  console.log('\n2. Skill statistics...');
  const stats = Agent.getSkillStats();
  console.log(`   Total skills: ${stats.total}`);
  console.log(`   Types: ${Object.keys(stats.byType).join(', ')}`);
  console.log(`   Top tags: ${Object.entries(stats.byTag)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([tag, count]) => `${tag}(${count})`)
    .join(', ')}`);

  // 3. Create an Agent with access to all skills
  console.log('\n3. Creating Agent...');
  const agentConfig: AgentConfig = {
    systemPrompt: 'You are a helpful assistant with access to various skills.',
    availableSkills: skills.map((s) => s.name), // Use all discovered skills
    llm: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
    sandbox: {
      type: 'local',
      local: {
        pythonPath: process.env.PYTHON_PATH || './python_modules/bin/python3',
      },
    },
    constraints: {
      maxIterations: 10,
      timeout: 60000,
    },
  };

  const agent = new Agent(agentConfig, 'example-session-001');
  console.log('   Agent created successfully!');

  // 4. Check Agent info
  console.log('\n4. Agent information...');
  const agentInfo = agent.getInfo();
  console.log(`   Type: ${agentInfo.type}`);
  console.log(`   Session ID: ${agentInfo.sessionId}`);
  console.log(`   Available skills: ${agentInfo.availableSkills.length}`);
  console.log(`   Discovered skills: ${agentInfo.discoveredSkills}`);
  console.log(`   LLM model: ${agentInfo.llmModel}`);
  console.log(`   Sandbox type: ${agentInfo.sandboxType}`);

  // 5. Example: Filter skills by tag for specialized agents
  console.log('\n5. Creating specialized agents...');
  const researchSkills = skills.filter((s) => s.tags.includes('research'));
  console.log(`   Research agent would use: ${researchSkills.map((s) => s.name).join(', ')}`);

  const mediaSkills = skills.filter((s) => s.tags.includes('video') || s.tags.includes('media'));
  console.log(`   Media agent would use: ${mediaSkills.map((s) => s.name).join(', ')}`);

  const codeSkills = skills.filter((s) => s.tags.includes('code'));
  console.log(`   Code agent would use: ${codeSkills.map((s) => s.name).join(', ')}`);

  // 6. Example: Check if specific skills are available
  console.log('\n6. Skill availability check...');
  const requiredSkills = ['web-search', 'summarize', 'code-analysis'];
  const missingSkills = requiredSkills.filter(
    (skillName) => !skills.find((s) => s.name === skillName)
  );

  if (missingSkills.length > 0) {
    console.log(`   Warning: Missing skills: ${missingSkills.join(', ')}`);
  } else {
    console.log('   All required skills are available!');
  }

  // 7. Example: Hot-reload skills (useful in development)
  console.log('\n7. Hot-reload demonstration...');
  console.log('   Reloading skills...');
  await Agent.reloadSkills();
  console.log('   Skills reloaded successfully!');
  const newSkills = Agent.getDiscoveredSkills();
  console.log(`   Still have ${newSkills.length} skills after reload`);

  console.log('\n=== Example Complete ===');
  console.log('\nKey takeaways:');
  console.log('1. Skills are automatically discovered from /skills directory');
  console.log('2. No hardcoded registry needed');
  console.log('3. Easy to filter and create specialized agents');
  console.log('4. Hot-reload support for development');
  console.log('5. Type-safe and production-ready');
}

// Run the example
main().catch((error) => {
  console.error('Example failed:', error);
  process.exit(1);
});
