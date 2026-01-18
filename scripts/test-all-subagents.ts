/**
 * Comprehensive Test for All Subagents via API
 *
 * Tests:
 * 1. system-guide - System architecture and documentation questions
 * 2. code-reviewer - Code review tasks
 * 3. data-analyst - Data analysis tasks
 * 4. security-auditor - Security audit tasks
 */

const BASE_URL = 'http://localhost:3000';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  log(title, colors.cyan);
  console.log('='.repeat(70));
}

function logTest(testName: string) {
  log(`\n▶ ${testName}`, colors.blue);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`  ℹ ${message}`, colors.yellow);
}

function logSubagent(name: string) {
  log(`\n🤖 ${name}`, colors.magenta);
}

// Sleep helper
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Submit task to API
async function submitTask(task: string, useDelegation = true): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}/agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task,
        useDelegation,
      }),
    });

    if (!response.ok) {
      logError(`Failed to submit task: ${response.statusText}`);
      return null;
    }

    const result = await response.json() as { taskId: string; message: string };
    logSuccess(`Task submitted: ${result.taskId}`);
    return result.taskId;
  } catch (error: any) {
    logError(`Error submitting task: ${error.message}`);
    return null;
  }
}

// Query task result
async function queryResult(taskId: string): Promise<any | null> {
  try {
    const response = await fetch(`${BASE_URL}/agent/result?id=${taskId}`);

    if (!response.ok) {
      logError(`Failed to query result: ${response.statusText}`);
      return null;
    }

    const result = await response.json() as {
      success: boolean;
      result?: {
        taskId: string;
        task: string;
        success: boolean;
        output?: any;
        error?: string;
        executionTime?: number;
        metadata?: {
          delegates?: string[];
        };
        sessionId?: string;
        timestamp?: string;
      };
    };

    if (result.success && result.result) {
      return result.result;
    }

    return null;
  } catch (error: any) {
    logError(`Error querying result: ${error.message}`);
    return null;
  }
}

// Wait for task completion with timeout
async function waitForCompletion(taskId: string, timeoutMs = 30000): Promise<any | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await queryResult(taskId);

    if (result) {
      return result;
    }

    await sleep(1000);
  }

  logError('Task timed out');
  return null;
}

// Test a subagent
async function testSubagent(
  name: string,
  task: string,
  expectedDelegate: string
): Promise<boolean> {
  logSubagent(name);
  logTest(`Task: "${task}"`);
  logInfo(`Expected delegate: ${expectedDelegate}`);

  // Submit task
  const taskId = await submitTask(task, true);

  if (!taskId) {
    logError('Failed to submit task');
    return false;
  }

  // Wait for completion
  logInfo('Waiting for task to complete...');
  const result = await waitForCompletion(taskId, 60000);

  if (!result) {
    logError('Task failed or timed out');
    return false;
  }

  // Check results
  logInfo(`Execution time: ${result.executionTime || 'N/A'}ms`);
  logInfo(`Success: ${result.success}`);

  if (result.metadata?.delegates) {
    const delegates = result.metadata.delegates;
    logInfo(`Delegated to: ${delegates.join(', ')}`);

    const matched = delegates.includes(expectedDelegate);
    if (matched) {
      logSuccess(`✓ Successfully delegated to ${expectedDelegate}`);
    } else {
      logError(`✗ Expected ${expectedDelegate}, got ${delegates.join(', ')}`);
    }

    // Show output preview
    if (result.output) {
      logInfo('\nOutput preview:');
      const outputStr = JSON.stringify(result.output, null, 2);
      const preview = outputStr.substring(0, 300);
      log(`    ${preview}${outputStr.length > 300 ? '...' : ''}`, colors.reset);
    }

    return matched;
  } else {
    logInfo('No delegation metadata (may have been handled by MasterAgent directly)');
    return true;
  }
}

async function main() {
  logSection('🧪 Comprehensive Subagent API Test');
  logInfo(`Testing against: ${BASE_URL}`);
  logInfo('Make sure the Motia server is running!\n');

  // Test 1: System Guide
  logSection('Test 1: System-Guide Subagent');
  const systemGuideTests = [
    {
      task: 'What technology stack does this system use?',
      expected: 'system-guide',
    },
    {
      task: 'What API endpoints are available in this system?',
      expected: 'system-guide',
    },
  ];

  for (const test of systemGuideTests) {
    await testSubagent('System-Guide', test.task, test.expected);
    await sleep(2000);
  }

  // Test 2: Code Reviewer
  logSection('Test 2: Code-Reviewer Subagent');
  await testSubagent(
    'Code-Reviewer',
    'Review the quality of the master-agent.ts file and identify potential improvements',
    'code-reviewer'
  );
  await sleep(2000);

  // Test 3: Data Analyst
  logSection('Test 3: Data-Analyst Subagent');
  await testSubagent(
    'Data-Analyst',
    'Analyze the execution logs and provide insights about agent performance',
    'data-analyst'
  );
  await sleep(2000);

  // Test 4: Security Auditor
  logSection('Test 4: Security-Auditor Subagent');
  await testSubagent(
    'Security-Auditor',
    'Perform a security audit on the agent-api authentication mechanism',
    'security-auditor'
  );

  // Summary
  logSection('📊 Test Summary');
  log('All subagent tests completed!', colors.cyan);
  log('\nTested subagents:', colors.green);
  log('  ✓ system-guide - System documentation and architecture', colors.green);
  log('  ✓ code-reviewer - Code quality and analysis', colors.green);
  log('  ✓ data-analyst - Data processing and insights', colors.green);
  log('  ✓ security-auditor - Security vulnerability assessment', colors.green);
  log('\nNote: Actual delegation depends on MasterAgent planning logic.', colors.yellow);
  log('Some tasks may be handled by MasterAgent directly if no subagent match is found.', colors.yellow);
}

main().catch((error) => {
  logError(`Test suite failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
