/**
 * Workflow Artifacts 单元测试
 * 测试产物在 workflow step 之间的传递
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WorkflowEngine } from '../../src/core/workflow/engine';
import { WorkflowConfig, WorkflowStep } from '../../src/core/workflow/types';
import { AgentManager } from '../../src/core/agent/manager';
import { AgentResult } from '../../src/core/agent/types';
import { AgentArtifacts } from '../../src/core/agent/artifacts';

// Mock AgentManager
jest.mock('../../src/core/agent/manager');

describe('Workflow Artifacts 传递测试', () => {
  let workflowEngine: WorkflowEngine;
  let mockAgentManager: jest.Mocked<AgentManager>;

  // Mock Agent
  const mockAgent = {
    run: jest.fn(),
    updateLLMTraceConfig: jest.fn(),
    setHookManager: jest.fn(),
  };

  beforeEach(() => {
    // 创建 mock AgentManager
    mockAgentManager = {
      acquire: jest.fn().mockResolvedValue(mockAgent),
      getHookManager: jest.fn().mockReturnValue({
        executeHook: jest.fn().mockResolvedValue(undefined),
      }),
    } as any;

    workflowEngine = new WorkflowEngine(mockAgentManager);

    // 重置 mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('产物收集和存储', () => {
    it('应该在 step 执行后保存产物到 context', async () => {
      // 配置 workflow
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'plan',
            name: 'Plan Step',
            agent: 'developer',
          },
          {
            id: 'implement',
            name: 'Implement Step',
            agent: 'developer',
            depends_on: ['plan'],
          },
        ],
      };

      // 注册 workflow
      workflowEngine.registerWorkflow('test-workflow', workflow);

      // Mock 第一个 step 返回有产物的结果
      const planArtifacts: AgentArtifacts = {
        workspace: '/tmp/workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/workspace/plan.md',
              name: 'plan.md',
              relativePath: 'plan.md',
              operation: 'created',
              size: 512,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/workspace/plan.md',
            name: 'plan.md',
            relativePath: 'plan.md',
            operation: 'created',
            size: 512,
          },
        ],
        summary: {
          counts: { codes: 1, images: 0, audios: 0, videos: 0, documents: 0, data: 0, other: 0 },
          totalFiles: 1,
          totalSize: 512,
        },
      };

      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Plan completed',
        steps: [],
        executionTime: 100,
        metadata: {
          workspace: '/tmp/workspace',
        },
        artifacts: planArtifacts,
      });

      // Mock 第二个 step 返回
      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Implementation completed',
        steps: [],
        executionTime: 200,
        metadata: {},
      });

      // 执行 workflow
      const result = await workflowEngine.execute('test-workflow', {});

      expect(result.success).toBe(true);
      expect(mockAgent.run).toHaveBeenCalledTimes(2);

      // 验证第二个 step 收到的 prompt 包含第一个 step 的产物信息
      const secondCallArgs = (mockAgent.run as jest.Mock).mock.calls[1];
      const taskDescription = secondCallArgs[0];

      expect(taskDescription).toContain('[Previous step: plan]');
      expect(taskDescription).toContain('Workspace: /tmp/workspace');
      expect(taskDescription).toContain('plan.md');
    });

    it('应该从 metadata.fileOperations 自动转换为 artifacts', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'generate',
            agent: 'developer',
          },
          {
            id: 'review',
            agent: 'reviewer',
            depends_on: ['generate'],
          },
        ],
      };

      workflowEngine.registerWorkflow('test-workflow', workflow);

      // Mock 第一个 step 返回 fileOperations（但没有 artifacts）
      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Code generated',
        steps: [],
        executionTime: 100,
        metadata: {
          workspace: '/tmp/workspace',
          fileOperations: [
            {
              type: 'write',
              path: '/tmp/workspace/app.js',
              name: 'app.js',
              size: 1024,
            },
          ],
        },
      });

      // Mock 第二个 step 返回
      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Review completed',
        steps: [],
        executionTime: 100,
        metadata: {},
      });

      // 执行 workflow
      await workflowEngine.execute('test-workflow', {});

      // 验证第二个 step 收到的 prompt 包含产物信息
      const secondCallArgs = (mockAgent.run as jest.Mock).mock.calls[1];
      const taskDescription = secondCallArgs[0];

      expect(taskDescription).toContain('[Previous step: generate]');
      expect(taskDescription).toContain('Files created');
      expect(taskDescription).toContain('app.js');
    });

    it('应该处理没有产物的 step', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'think',
            agent: 'planner',
          },
          {
            id: 'act',
            agent: 'doer',
            depends_on: ['think'],
          },
        ],
      };

      workflowEngine.registerWorkflow('test-workflow', workflow);

      // Mock 第一个 step 没有产物
      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Thinking complete',
        steps: [],
        executionTime: 50,
        metadata: {},
      });

      // Mock 第二个 step
      (mockAgent.run as jest.Mock).mockResolvedValueOnce({
        success: true,
        output: 'Action complete',
        steps: [],
        executionTime: 100,
        metadata: {},
      });

      // 执行 workflow
      const result = await workflowEngine.execute('test-workflow', {});

      expect(result.success).toBe(true);

      // 第二个 step 的 prompt 不应该包含产物信息
      const secondCallArgs = (mockAgent.run as jest.Mock).mock.calls[1];
      const taskDescription = secondCallArgs[0];

      expect(taskDescription).not.toContain('[Previous step:');
    });
  });

  describe('多依赖产物合并', () => {
    it('应该合并多个依赖 step 的产物信息', async () => {
      const workflow: WorkflowConfig = {
        name: 'test-workflow',
        steps: [
          {
            id: 'design',
            agent: 'designer',
          },
          {
            id: 'frontend',
            agent: 'frontend-dev',
            depends_on: ['design'],
          },
          {
            id: 'backend',
            agent: 'backend-dev',
            depends_on: ['design'],
          },
          {
            id: 'integrate',
            agent: 'integrator',
            depends_on: ['frontend', 'backend'],
          },
        ],
      };

      workflowEngine.registerWorkflow('test-workflow', workflow);

      // Mock 各个 step 的产物
      const designArtifacts: AgentArtifacts = {
        workspace: '/tmp/workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/workspace/api-spec.yaml',
              name: 'api-spec.yaml',
              relativePath: 'api-spec.yaml',
              operation: 'created',
              size: 1024,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/workspace/api-spec.yaml',
            name: 'api-spec.yaml',
            relativePath: 'api-spec.yaml',
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

      const frontendArtifacts: AgentArtifacts = {
        workspace: '/tmp/workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/workspace/app.jsx',
              name: 'app.jsx',
              relativePath: 'app.jsx',
              operation: 'created',
              size: 2048,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/workspace/app.jsx',
            name: 'app.jsx',
            relativePath: 'app.jsx',
            operation: 'created',
            size: 2048,
          },
        ],
        summary: {
          counts: { codes: 1, images: 0, audios: 0, videos: 0, documents: 0, data: 0, other: 0 },
          totalFiles: 1,
          totalSize: 2048,
        },
      };

      const backendArtifacts: AgentArtifacts = {
        workspace: '/tmp/workspace',
        files: {
          codes: [
            {
              type: 'codes',
              path: '/tmp/workspace/server.js',
              name: 'server.js',
              relativePath: 'server.js',
              operation: 'created',
              size: 3072,
            },
          ],
        },
        allFiles: [
          {
            type: 'codes',
            path: '/tmp/workspace/server.js',
            name: 'server.js',
            relativePath: 'server.js',
            operation: 'created',
            size: 3072,
          },
        ],
        summary: {
          counts: { codes: 1, images: 0, audios: 0, videos: 0, documents: 0, data: 0, other: 0 },
          totalFiles: 1,
          totalSize: 3072,
        },
      };

      (mockAgent.run as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          output: 'Design complete',
          steps: [],
          executionTime: 100,
          metadata: {},
          artifacts: designArtifacts,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'Frontend complete',
          steps: [],
          executionTime: 200,
          metadata: {},
          artifacts: frontendArtifacts,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'Backend complete',
          steps: [],
          executionTime: 200,
          metadata: {},
          artifacts: backendArtifacts,
        })
        .mockResolvedValueOnce({
          success: true,
          output: 'Integration complete',
          steps: [],
          executionTime: 300,
          metadata: {},
        });

      // 执行 workflow
      const result = await workflowEngine.execute('test-workflow', {});

      expect(result.success).toBe(true);

      // 验证最后一个 step 收到了前面两个 step 的产物信息
      const lastCallArgs = (mockAgent.run as jest.Mock).mock.calls[3];
      const taskDescription = lastCallArgs[0];

      expect(taskDescription).toContain('[Previous step: frontend]');
      expect(taskDescription).toContain('[Previous step: backend]');
      expect(taskDescription).toContain('app.jsx');
      expect(taskDescription).toContain('server.js');
    });
  });
});
