/**
 * 产物传递集成测试
 * 直接测试 WorkflowEngine 的产物传递功能
 */

import { WorkflowEngine } from '../../src/core/workflow/engine';
import { AgentManager } from '../../src/core/agent/manager';
import { AgentResult, AgentConfig } from '../../src/core/agent/types';
import { AgentArtifacts } from '../../src/core/agent/artifacts';

// 创建 Mock Agent
class MockAgent {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async run(task: string, taskId?: string, context?: any): Promise<AgentResult> {
    console.log(`\n[${this.name}] 执行任务:`, task.substring(0, 100));

    // 检查是否有产物信息注入
    const hasArtifactsInfo = task.includes('[Previous step:');
    console.log(`[${this.name}] 是否包含产物信息:`, hasArtifactsInfo);

    if (hasArtifactsInfo) {
      console.log(`[${this.name}] 产物信息内容:`);
      const lines = task.split('\n');
      const artifactsSection = lines.filter((line, idx) => {
        if (line.includes('[Previous step:')) return true;
        if (idx > 0 && lines[idx - 1].includes('[Previous step:')) return true;
        if (line.startsWith('Workspace:') || line.startsWith('Files created')) return true;
        if (line.startsWith('  ') && line.includes('.md')) return true;
        if (line.startsWith('Summary:')) return true;
        return false;
      });
      artifactsSection.forEach(line => console.log('  ', line));
    }

    // 返回模拟结果
    if (this.name === 'create-plan') {
      // 第一个 step 返回有产物的结果
      const artifacts: AgentArtifacts = {
        workspace: '/tmp/test-workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/test-workspace/plan.md',
              name: 'plan.md',
              relativePath: 'plan.md',
              operation: 'created',
              size: 1024,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/test-workspace/plan.md',
            name: 'plan.md',
            relativePath: 'plan.md',
            operation: 'created',
            size: 1024,
          },
        ],
        summary: {
          counts: { codes: 1, images: 0, audios: 0, videos: 0, documents: 0, data: 0, other: 0 },
          totalFiles: 1,
          totalSize: 1024,
        },
      };

      return {
        success: true,
        output: '计划文档已创建',
        steps: [],
        executionTime: 100,
        metadata: {
          workspace: '/tmp/test-workspace',
        },
        artifacts,
      };
    } else if (this.name === 'implement') {
      // 第二个 step 返回
      return {
        success: true,
        output: '代码已实现',
        steps: [],
        executionTime: 200,
        metadata: {},
      };
    }

    return {
      success: true,
      output: '完成',
      steps: [],
      executionTime: 100,
      metadata: {},
    };
  }

  updateLLMTraceConfig(taskId?: string) {}
  setHookManager(hookManager: any) {}
}

// 创建 Mock AgentManager
const mockAgentManager = {
  acquire: async (agentId: string, options?: any) => {
    console.log(`\n[MockAgentManager] Acquiring agent: ${agentId}`);
    return new MockAgent(agentId);
  },
  getHookManager: () => ({
    executeHook: async (hookName: string, ...args: any[]) => {
      console.log(`[HookManager] ${hookName} called`);
    },
  }),
} as any;

// 创建 WorkflowEngine
const workflowEngine = new WorkflowEngine(mockAgentManager);

// 注册测试 workflow
const workflowConfig = {
  name: 'test-artifacts-workflow',
  description: '测试产物传递',
  steps: [
    {
      id: 'create-plan',
      name: '创建计划',
      agent: 'create-plan',
    },
    {
      id: 'implement',
      name: '实现代码',
      agent: 'implement',
      depends_on: ['create-plan'],
    },
  ],
};

workflowEngine.registerWorkflow('test-artifacts', workflowConfig);

// 执行 workflow
console.log('========================================');
console.log('开始执行测试 workflow');
console.log('========================================');

workflowEngine
  .execute('test-artifacts', {
    requirement: '创建一个简单的项目',
  })
  .then((result) => {
    console.log('\n========================================');
    console.log('Workflow 执行完成');
    console.log('========================================');
    console.log('Success:', result.success);
    console.log('Steps:', result.steps.length);

    // 检查第二个 step 是否收到了第一个 step 的产物信息
    const implementStep = result.steps.find((s: any) => s.stepId === 'implement');
    if (implementStep) {
      console.log('\nImplement Step 结果:', implementStep.status);
    }
  })
  .catch((error) => {
    console.error('Workflow 执行失败:', error);
  });
