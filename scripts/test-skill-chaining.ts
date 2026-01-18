/**
 * Test skill chaining to verify proper result.output handling
 */

async function testSkillChaining() {
  console.log('\n🧪 Testing Skill Chaining\n');
  console.log('='.repeat(70));

  const testTasks = [
    {
      task: 'Read the package.json file and analyze what dependencies this project uses',
      description: 'This should chain read-file → code-analysis',
    },
  ];

  for (const test of testTasks) {
    console.log(`\n📝 Task: "${test.task}"`);
    console.log(`Expected: ${test.description}`);
    console.log('─'.repeat(70));

    try {
      // Submit task
      const response = await fetch('http://localhost:3000/agent/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: test.task,
          useDelegation: true,
        }),
      });

      const result = await response.json() as { taskId: string; message: string };
      console.log(`✓ Task submitted: ${result.taskId}`);

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Query result
      const resultResponse = await fetch(`http://localhost:3000/agent/result?id=${result.taskId}`);
      const taskResult = await resultResponse.json() as {
        success: boolean;
        result?: {
          taskId: string;
          task: string;
          success: boolean;
          output?: any;
          executionTime?: number;
          metadata?: {
            delegates?: string[];
            skillCalls?: number;
            skillNames?: string[];
          };
        };
      };

      if (taskResult.success && taskResult.result) {
        const { metadata, output } = taskResult.result;

        console.log('\n  📊 Execution Results:');
        console.log(`  Success: ${taskResult.result.success}`);
        console.log(`  Execution time: ${taskResult.result.executionTime}ms`);

        if (metadata) {
          console.log('\n  🔍 Metadata:');
          if (metadata.skillNames) {
            console.log(`  Skills: ${metadata.skillNames.join(', ')}`);
          }
          if (metadata.delegates) {
            console.log(`  Delegates: ${metadata.delegates.join(', ')}`);
          }
        }

        // Show output preview
        if (output) {
          const outputStr = JSON.stringify(output);
          const preview = outputStr.substring(0, 400);
          console.log(`\n  📄 Output preview:`);
          console.log(`    ${preview}${outputStr.length > 400 ? '...' : ''}`);
        }
      }
    } catch (error: any) {
      console.error(`✗ Test failed: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✓ Test completed\n');
}

testSkillChaining().catch(console.error);
