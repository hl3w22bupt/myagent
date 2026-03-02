#!/usr/bin/env node

/**
 * Test script for developer-engineer subagent
 *
 * This script verifies:
 * 1. The developer-engineer subagent is discovered
 * 2. The agent.yaml file is valid
 * 3. The subagent can be loaded correctly
 */

import { resolve } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function discoverSubagents() {
  const subagentsDir = resolve(process.cwd(), 'subagents');
  if (!existsSync(subagentsDir)) {
    log('❌ Subagents directory not found', 'red');
    return [];
  }

  const discovered = readdirSync(subagentsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => {
      const configPath = resolve(subagentsDir, name, 'agent.yaml');
      return existsSync(configPath);
    });

  return discovered;
}

function validateAgentYAML(subagentName) {
  const subagentDir = resolve(process.cwd(), 'subagents', subagentName);
  const configPath = resolve(subagentDir, 'agent.yaml');

  if (!existsSync(configPath)) {
    log(`❌ agent.yaml not found for ${subagentName}`, 'red');
    return false;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');

    // Basic validation checks
    const checks = {
      'name field': content.includes('name:'),
      'description field': content.includes('description:'),
      'agent section': content.includes('agent:'),
      'system_prompt': content.includes('system_prompt:'),
      'available_skills': content.includes('available_skills:'),
      'tool-read skill': content.includes('tool-read'),
      'tool-write skill': content.includes('tool-write'),
      'tool-edit skill': content.includes('tool-edit'),
      'tool-grep skill': content.includes('tool-grep'),
      'tool-glob skill': content.includes('tool-glob'),
      'tool-bash skill': content.includes('tool-bash'),
    };

    let allPassed = true;
    for (const [check, passed] of Object.entries(checks)) {
      if (passed) {
        log(`  ✓ ${check}`, 'green');
      } else {
        log(`  ✗ ${check}`, 'red');
        allPassed = false;
      }
    }

    return allPassed;
  } catch (error) {
    log(`❌ Error reading agent.yaml: ${error.message}`, 'red');
    return false;
  }
}

function main() {
  log('\n=== Developer-Engineer Subagent Test ===\n', 'blue');

  // Test 1: Discover all subagents
  log('Test 1: Discovering subagents...', 'yellow');
  const subagents = discoverSubagents();

  if (subagents.length === 0) {
    log('❌ No subagents found', 'red');
    process.exit(1);
  }

  log(`✓ Found ${subagents.length} subagents: ${subagents.join(', ')}`, 'green');

  // Test 2: Check if developer-engineer is present
  log('\nTest 2: Checking for developer-engineer...', 'yellow');
  if (!subagents.includes('developer-engineer')) {
    log('❌ developer-engineer subagent not found', 'red');
    process.exit(1);
  }
  log('✓ developer-engineer subagent found', 'green');

  // Test 3: Validate agent.yaml structure
  log('\nTest 3: Validating agent.yaml structure...', 'yellow');
  const isValid = validateAgentYAML('developer-engineer');

  if (!isValid) {
    log('❌ agent.yaml validation failed', 'red');
    process.exit(1);
  }
  log('✓ agent.yaml is valid', 'green');

  // Summary
  log('\n=== All Tests Passed ===', 'green');
  log('\nThe developer-engineer subagent is ready to use!', 'green');
  log('\nTo test it manually, you can:', 'blue');
  log('  npm run dev');
  log('  Then send a task like: "实现一个 capitalize 函数"');
}

main();
