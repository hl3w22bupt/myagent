#!/usr/bin/env tsx
/**
 * Demonstration of Agent session state functionality.
 *
 * This script shows how Agents maintain conversation history,
 * execution history, and variables across multiple executions.
 */

import { Agent } from '../src/core/agent/agent';
import { AgentConfig } from '../src/core/agent/types';

async function demonstrateSessionState() {
  console.log('=== Agent Session State Demonstration ===\n');

  // Create Agent with session ID
  const config: AgentConfig = {
    systemPrompt: 'You are a helpful assistant.',
    availableSkills: ['summarize', 'code-analysis'],
    llm: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5'
    },
    sandbox: {
      type: 'local'
    }
  };

  const sessionId = 'demo-session-' + Date.now();
  const agent = new Agent(config, sessionId);

  console.log('✓ Created Agent with sessionId:', sessionId);
  console.log();

  // Check initial state
  console.log('Initial State:');
  const initialState = agent.getState();
  console.log('  - sessionId:', initialState.sessionId);
  console.log('  - conversationHistory:', initialState.conversationHistory.length);
  console.log('  - executionHistory:', initialState.executionHistory.length);
  console.log('  - variables:', initialState.variables.size);
  console.log('  - createdAt:', new Date(initialState.createdAt).toISOString());
  console.log('  - lastActivityAt:', new Date(initialState.lastActivityAt).toISOString());
  console.log();

  // Demonstrate variable management
  console.log('Variable Management:');
  agent.setVariable('userName', 'Alice');
  agent.setVariable('userRole', 'Developer');
  agent.setVariable('project', 'Motia Agent System');

  console.log('  - Set userName:', agent.getVariable('userName'));
  console.log('  - Set userRole:', agent.getVariable('userRole'));
  console.log('  - Set project:', agent.getVariable('project'));
  console.log('  - Total variables:', agent.getState().variables.size);
  console.log();

  // Demonstrate variable updates
  console.log('Variable Updates:');
  agent.setVariable('userName', 'Bob');
  console.log('  - Updated userName:', agent.getVariable('userName'));
  console.log('  - Total variables (still 3):', agent.getState().variables.size);
  console.log();

  // Note: We can't easily demonstrate conversation history tracking
  // without actual LLM calls, but the run() method is designed to:
  // 1. Record user input in conversationHistory
  // 2. Record assistant responses in conversationHistory
  // 3. Track execution history
  // 4. Return session metadata in results

  console.log('Session Metadata (would be returned after run()):');
  console.log('  - sessionId:', sessionId);
  console.log('  - state.conversationLength:', agent.getState().conversationHistory.length);
  console.log('  - state.executionCount:', agent.getState().executionHistory.length);
  console.log('  - state.variablesCount:', agent.getState().variables.size);
  console.log();

  // Demonstrate cleanup
  console.log('Cleanup:');
  await agent.cleanup();
  const cleanedState = agent.getState();
  console.log('  - conversationHistory after cleanup:', cleanedState.conversationHistory.length);
  console.log('  - executionHistory after cleanup:', cleanedState.executionHistory.length);
  console.log('  - variables after cleanup:', cleanedState.variables.size);
  console.log();

  console.log('✓ Demonstration complete!');
}

// Run demonstration
demonstrateSessionState().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
