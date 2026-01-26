import { ContextManagerTaskHook } from '@/core/task/hooks/context-manager';
import { TaskContext } from '@/core/task/hooks/types';

// Mock ContextManager
jest.mock('@/core/context/manager');
jest.mock('@/core/database/context-store');

describe('ContextManagerTaskHook', () => {
  let hook: ContextManagerTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    // Create hook without ContextManager (it will try to create real one)
    // We'll test the behavior through method calls
    hook = new ContextManagerTaskHook(undefined as any);

    mockContext = {
      taskId: 'test-1',
      sessionId: 'session-1',
      task: 'test task',
      status: 'pending',
      context: null,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        llmCalls: 0,
        skillCalls: 0,
        totalTokens: 0,
      },
      services: {
        streams: {
          taskExecution: {
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        logger: {
          info: jest.fn(),
          debug: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        },
        emit: jest.fn(),
      },
    };
  });

  describe('preExec', () => {
    it('should initialize context object with fallback when ContextManager fails', async () => {
      // Mock contextManager.createTaskContext to throw error
      (hook as any).contextManager = {
        createTaskContext: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      await hook.preExec(mockContext);

      // Should have fallback context with all required fields
      expect(mockContext.context).not.toBeNull();
      expect(mockContext.context).toMatchObject({
        taskId: 'test-1',
        sessionId: 'session-1',
        currentTurn: 0,
        messages: [],
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 0,
          llmCallsCount: 0,
          skillCallsCount: 0,
        },
      });

      // Should have summary
      expect(mockContext.context?.summary).toBeDefined();
      expect(mockContext.context?.summary).toMatchObject({
        sessionIntent: '',
        currentTask: 'test task',
        completedSteps: [],
        filesModified: [],
        decisionsMade: [],
        currentStatus: 'pending',
        nextSteps: [],
        errorsAndSolutions: [],
        technicalDetails: {},
      });

      // Should log error
      expect(mockContext.services.logger.error).toHaveBeenCalledWith(
        'Failed to create task context',
        expect.objectContaining({
          taskId: 'test-1',
        })
      );
    });
  });

  describe('postExec', () => {
    it('should log context save with correct metadata', async () => {
      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 100,
          llmCallsCount: 2,
          skillCallsCount: 3,
          lastCompressedAt: new Date(),
        },
      };

      // Mock saveContext
      (hook as any).contextManager = {
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true });

      // Should log with correct metadata
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context saved',
        expect.objectContaining({
          taskId: 'test-1',
          currentTurn: 1,
          totalTokens: 100,
          hasCompression: true,
        })
      );
    });

    it('should update summary status on success', async () => {
      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'pending', // Will be updated
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 0,
          llmCallsCount: 0,
          skillCallsCount: 0,
        },
      };

      mockContext.status = 'completed';

      // Mock saveContext
      (hook as any).contextManager = {
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true });

      // Status should be updated
      expect(mockContext.context?.summary.currentStatus).toBe('completed');
    });

    it('should add task to completedSteps on success', async () => {
      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [], // Will be updated
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 0,
          llmCallsCount: 0,
          skillCallsCount: 0,
        },
      };

      // Mock saveContext
      (hook as any).contextManager = {
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true });

      // Task should be added to completedSteps
      expect(mockContext.context?.summary.completedSteps).toContain('test task');
    });

    it('should handle saveContext errors gracefully', async () => {
      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
        currentTurn: 1,
        messages: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          totalTokens: 0,
          llmCallsCount: 0,
          skillCallsCount: 0,
        },
      };

      // Mock saveContext to throw error
      (hook as any).contextManager = {
        saveContext: jest.fn().mockRejectedValue(new Error('Save failed')),
      };

      // Should not throw
      await expect(hook.postExec(mockContext, { success: true })).resolves.toBeUndefined();

      // Should log error
      expect(mockContext.services.logger.error).toHaveBeenCalledWith(
        'Failed to save task context',
        expect.objectContaining({
          taskId: 'test-1',
        })
      );
    });
  });
});
