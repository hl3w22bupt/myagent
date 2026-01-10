#!/usr/bin/env node

/**
 * Context Support Demonstration
 *
 * This script demonstrates how PTCGenerator now supports context
 * (conversation history and variables) when generating PTC code.
 */

import { PTCGenerator } from '../src/core/agent/ptc-generator';
import { LLMClient } from '../src/core/agent/llm-client';

async function demonstrateContextSupport() {
  console.log('='.repeat(80));
  console.log('PTCGenerator Context Support Demonstration');
  console.log('='.repeat(80));
  console.log();

  // Initialize LLM client (would require API key for actual execution)
  const llm = new LLMClient({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    apiKey: process.env.ANTHROPIC_API_KEY || 'demo-key',
  });

  // Define available skills
  const skills = [
    {
      name: 'summarize',
      description: 'Summarize text content',
      tags: ['text', 'summarization', 'nlp'],
    },
    {
      name: 'web-search',
      description: 'Search the web for information',
      tags: ['web', 'research', 'search'],
    },
    {
      name: 'code-analysis',
      description: 'Analyze code quality and patterns',
      tags: ['code', 'analysis', 'quality'],
    },
  ];

  const ptcGenerator = new PTCGenerator(llm, skills);
  void ptcGenerator; // Mark as used

  console.log('Available Skills:');
  skills.forEach((skill) => {
    console.log(`  - ${skill.name}: ${skill.description}`);
  });
  console.log();

  // Example 1: Context with Conversation History
  console.log('Example 1: Conversation History Context');
  console.log('-'.repeat(80));

  const historyExample = {
    history: [
      {
        role: 'user' as const,
        content: 'Search for TypeScript best practices',
        timestamp: Date.now() - 10000,
      },
      {
        role: 'assistant' as const,
        content:
          'I found several articles about TypeScript best practices including type safety, interfaces, and async/await patterns.',
        timestamp: Date.now() - 5000,
      },
    ],
  };

  console.log('Conversation History:');
  historyExample.history.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}] ${msg.content}`);
  });
  console.log();

  console.log('New Task: "Summarize the search results about async/await"');
  console.log();

  // Show what context would be passed to the LLM
  console.log('Context that would be sent to LLM:');
  console.log('  <conversation_history>');
  historyExample.history.forEach((msg) => {
    console.log(`    ${msg.role}: ${msg.content}`);
  });
  console.log('  </conversation_history>');
  console.log();

  // Example 2: Context with Variables
  console.log('Example 2: Variables Context');
  console.log('-'.repeat(80));

  const variablesExample = {
    variables: {
      apiKey: 'secret-api-key-123',
      userId: 'user-456',
      preferences: {
        theme: 'dark',
        language: 'en',
      },
    },
  };

  console.log('Available Variables:');
  console.log(`  apiKey: ${JSON.stringify(variablesExample.variables.apiKey)}`);
  console.log(`  userId: ${JSON.stringify(variablesExample.variables.userId)}`);
  console.log(`  preferences: ${JSON.stringify(variablesExample.variables.preferences)}`);
  console.log();

  console.log('New Task: "Make API request using the stored credentials"');
  console.log();

  console.log('Context that would be sent to LLM:');
  console.log('  <available_variables>');
  Object.entries(variablesExample.variables).forEach(([key, value]) => {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  });
  console.log('  </available_variables>');
  console.log();

  // Example 3: Combined Context
  console.log('Example 3: Combined History and Variables');
  console.log('-'.repeat(80));

  const combinedExample = {
    history: [
      {
        role: 'user' as const,
        content: 'What is the weather in San Francisco?',
        timestamp: Date.now() - 15000,
      },
      {
        role: 'assistant' as const,
        content: 'The current weather in San Francisco is 65°F and sunny.',
        timestamp: Date.now() - 10000,
      },
      {
        role: 'user' as const,
        content: 'What about in celsius?',
        timestamp: Date.now() - 5000,
      },
    ],
    variables: {
      location: 'San Francisco',
      units: 'celsius',
    },
  };

  console.log('Conversation History:');
  combinedExample.history.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}] ${msg.content}`);
  });
  console.log();

  console.log('Available Variables:');
  Object.entries(combinedExample.variables).forEach(([key, value]) => {
    console.log(`  ${key}: ${JSON.stringify(value)}`);
  });
  console.log();

  console.log('New Task: "Convert the temperature to the requested units"');
  console.log();

  console.log('Complete Context that would be sent to LLM:');
  console.log('  <conversation_history>');
  combinedExample.history.forEach((msg) => {
    console.log(`    ${msg.role}: ${msg.content}`);
  });
  console.log('  </conversation_history>');
  console.log();
  console.log('  <available_variables>');
  Object.entries(combinedExample.variables).forEach(([key, value]) => {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  });
  console.log('  </available_variables>');
  console.log();

  // Example 4: Benefits
  console.log('Benefits of Context Support');
  console.log('-'.repeat(80));
  console.log('1. Multi-Turn Conversations:');
  console.log('   - Agent remembers previous questions and answers');
  console.log('   - Can reference what was discussed earlier');
  console.log('   - Maintains natural conversation flow');
  console.log();

  console.log('2. Variable Persistence:');
  console.log('   - Store intermediate results for later use');
  console.log('   - Share data across multiple tasks');
  console.log('   - Maintain state across interactions');
  console.log();

  console.log('3. Better Planning:');
  console.log('   - LLM selects skills based on conversation context');
  console.log('   - Understands what has already been attempted');
  console.log('   - Makes more informed decisions');
  console.log();

  console.log('4. More Relevant Code:');
  console.log('   - Generated Python code can reference variables');
  console.log('   - Can build upon previous results');
  console.log('   - More context-aware implementations');
  console.log();

  // Example 5: History Limiting
  console.log('Example 4: History Limiting (Last 5 Messages)');
  console.log('-'.repeat(80));

  const longHistory = Array.from({ length: 10 }, (_, i) => ({
    role: 'user' as const,
    content: `Message ${i + 1}`,
    timestamp: Date.now() + i,
  }));

  console.log('Total Messages in History:', longHistory.length);
  console.log();
  console.log('Messages Sent to LLM (last 5):');
  longHistory.slice(-5).forEach((msg, i) => {
    console.log(`  ${i + 1}. ${msg.content}`);
  });
  console.log();
  console.log('Messages NOT Sent (too old):');
  longHistory.slice(0, -5).forEach((msg, i) => {
    console.log(`  ${i + 1}. ${msg.content}`);
  });
  console.log();

  console.log('='.repeat(80));
  console.log('Demonstration Complete');
  console.log('='.repeat(80));
  console.log();
  console.log('To use context in your Agent:');
  console.log('  const agent = new Agent(config, sessionId);');
  console.log('  await agent.execute("First message");');
  console.log('  await agent.execute("Follow-up question");');
  console.log('  // Agent automatically maintains context!');
  console.log();
}

// Run demonstration
demonstrateContextSupport().catch(console.error);
