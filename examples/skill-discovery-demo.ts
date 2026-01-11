/**
 * Skill Discovery Demo
 *
 * Demonstrates how to use the dynamic skill discovery system
 * to automatically load and manage skills.
 */

import { discoverSkills, getSkillDiscovery } from '../src/core/agent/skill-discovery';
import { Agent } from '../src/core/agent/agent';

async function main() {
  console.log('=== Skill Discovery Demo ===\n');

  // Method 1: Using the convenience function
  console.log('1. Discovering skills...');
  const skills = await discoverSkills();
  console.log(`Found ${skills.length} skills:\n`);

  skills.forEach((skill) => {
    console.log(`   - ${skill.name}`);
    console.log(`     Description: ${skill.description}`);
    console.log(`     Tags: ${skill.tags.join(', ')}`);
    console.log(`     Type: ${skill.type || 'N/A'}`);
    console.log(`     Path: ${skill.path}`);
    console.log('');
  });

  // Method 2: Using the singleton instance
  console.log('2. Using singleton instance...');
  const discovery = getSkillDiscovery();

  // Get skill statistics
  const stats = discovery.getStats();
  console.log(`\nSkill Statistics:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   By Tag: ${JSON.stringify(stats.byTag, null, 2)}`);
  console.log(`   By Type: ${JSON.stringify(stats.byType, null, 2)}`);

  // Filter skills by tag
  console.log('\n3. Filtering skills by tag...');
  const webSkills = discovery.getSkillsByTag('web');
  console.log(`Web-related skills: ${webSkills.map((s) => s.name).join(', ')}`);

  const videoSkills = discovery.getSkillsByTag('video');
  console.log(`Video-related skills: ${videoSkills.map((s) => s.name).join(', ')}`);

  // Method 3: Check if a skill exists
  console.log('\n4. Checking skill existence...');
  console.log(`Has 'web-search'? ${discovery.hasSkill('web-search')}`);
  console.log(`Has 'fake-skill'? ${discovery.hasSkill('fake-skill')}`);

  // Method 4: Get specific skill
  console.log('\n5. Getting specific skill...');
  const webSearch = discovery.getSkill('web-search');
  if (webSearch) {
    console.log(`Name: ${webSearch.name}`);
    console.log(`Description: ${webSearch.description}`);
    console.log(`Tags: ${webSearch.tags.join(', ')}`);
  }

  // Method 5: Integration with Agent
  console.log('\n6. Integration with Agent...');
  const discoveredSkills = Agent.getDiscoveredSkills();
  console.log(`Agent has access to ${discoveredSkills.length} skills`);
  discoveredSkills.forEach((skill) => {
    console.log(`   - ${skill.name}: ${skill.description}`);
  });

  // Method 6: Get Agent skill stats
  console.log('\n7. Agent skill statistics...');
  const agentStats = Agent.getSkillStats();
  console.log(JSON.stringify(agentStats, null, 2));

  // Method 7: Hot-reload (useful in development)
  console.log('\n8. Hot-reload skills...');
  await Agent.reloadSkills();
  console.log('Skills reloaded successfully!');

  console.log('\n=== Demo Complete ===');
}

// Run the demo
main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
