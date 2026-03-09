/**
 * Test script to verify invalid subagent handling
 */

const TEST_INVALID_SUBAGENT = 'gentle-sister-caring';
const TEST_VALID_SUBAGENT = 'myagent-system-guide';

async function waitForTaskResult(taskId, maxWait = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    try {
      const response = await fetch(`http://localhost:3001/agent/result/${taskId}`);
      const data = await response.json();

      if (data.status === 'completed' || data.status === 'failed') {
        return data;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log('Error polling result:', error.message);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error('Task timeout');
}

async function testInvalidSubagent() {
  console.log('🧪 Testing INVALID subagent handling...\n');

  try {
    const response = await fetch('http://localhost:3001/agent/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'Say hello',
        app: 'test',
        useDelegation: true,
        delegateTo: [TEST_INVALID_SUBAGENT],
      }),
    });

    const submitResult = await response.json();
    console.log('Task submitted:', submitResult.taskId);

    // Wait for task to complete
    const result = await waitForTaskResult(submitResult.taskId);

    console.log('Task status:', result.status);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.status === 'failed' && result.error) {
      console.log('\n✅ PASS: Invalid subagent was rejected!\n');
      console.log('Error message:', result.error);
      console.log('\nExpected to see list of valid subagents in the error.');
      return true;
    } else {
      console.log('\n❌ FAIL: Invalid subagent was accepted!\n');
      console.log('The task completed without error, which means the invalid subagent was not rejected.');
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR: Test failed:', error.message);
    return false;
  }
}

async function testValidSubagent() {
  console.log('\n🧪 Testing VALID subagent handling...\n');

  try {
    const response = await fetch('http://localhost:3001/agent/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'Say hello',
        app: 'test',
        useDelegation: true,
        delegateTo: [TEST_VALID_SUBAGENT],
      }),
    });

    const submitResult = await response.json();
    console.log('Task submitted:', submitResult.taskId);

    // Wait for task to complete
    const result = await waitForTaskResult(submitResult.taskId);

    console.log('Task status:', result.status);
    console.log('Delegates:', result.metadata?.delegates);

    if (result.status === 'completed' && result.metadata?.delegates?.includes(TEST_VALID_SUBAGENT)) {
      console.log('\n✅ PASS: Valid subagent was accepted!\n');
      return true;
    } else {
      console.log('\n❌ FAIL: Valid subagent was rejected or not delegated!\n');
      console.log('Result:', JSON.stringify(result, null, 2));
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR: Test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Testing Subagent Validation Fix');
  console.log('='.repeat(60));
  console.log(`Testing with invalid subagent: "${TEST_INVALID_SUBAGENT}"`);
  console.log(`Testing with valid subagent: "${TEST_VALID_SUBAGENT}"`);
  console.log('='.repeat(60));
  console.log();

  const invalidTest = await testInvalidSubagent();
  const validTest = await testValidSubagent();

  console.log('\n' + '='.repeat(60));
  console.log('Test Summary:');
  console.log('='.repeat(60));
  console.log(`Invalid subagent rejection: ${invalidTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Valid subagent acceptance: ${validTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(60));

  if (invalidTest && validTest) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed!');
    process.exit(1);
  }
}

main();
