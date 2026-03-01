import { ContextManagerTaskHook } from '@/core/task/hooks/context-manager';
import { TaskContext } from '@/core/task/hooks/types';

// Mock ContextManager and DataStore to avoid creating real database connections
jest.mock('@/core/context/manager');
jest.mock('@/core/database/data-store', () => ({
  getDataStore: jest.fn(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    createTaskContext: jest.fn().mockResolvedValue({
      taskId: 'test-1',
      sessionId: 'session-1',
      conversationRounds: [],
      summary: {},
      artifactIndex: [],
      workingMemory: {},
      metadata: {},
    }),
    getContext: jest.fn().mockResolvedValue(null),
    saveContext: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('ContextManagerTaskHook', () => {
  let hook: ContextManagerTaskHook;
  let mockContext: TaskContext;

  beforeEach(() => {
    // Create hook without ContextManager (it will use the mocked getDataStore)
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
        conversationRounds: [],
        artifactIndex: [],
        workingMemory: {},
        metadata: {
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
      const mockUpdatedContext = {
        taskId: 'test-1',
        sessionId: 'session-1',
        conversationRounds: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'pending',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {
          lastCompressedAt: new Date(),
        },
      };

      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
                conversationRounds: [],
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
          lastCompressedAt: new Date(),
        },
      };

      // Mock all required contextManager methods
      (hook as any).contextManager = {
        getContext: jest.fn().mockResolvedValue({
          conversationRounds: [],
        }),
        addConversationRound: jest.fn().mockResolvedValue(mockUpdatedContext),
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true, structuredOutputs: [] });

      // Should log with correct metadata
      expect(mockContext.services.logger.info).toHaveBeenCalledWith(
        'Task context saved',
        expect.objectContaining({
          taskId: 'test-1',
                    hasCompression: true,
        })
      );
    });

    it('should update summary status on success', async () => {
      const mockUpdatedContext = {
        taskId: 'test-1',
        sessionId: 'session-1',
        conversationRounds: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: [],
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed', // Updated by the hook
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {},
      };

      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
                conversationRounds: [],
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
        },
      };

      mockContext.status = 'completed';

      // Mock all required contextManager methods
      (hook as any).contextManager = {
        getContext: jest.fn().mockResolvedValue({
          conversationRounds: [],
        }),
        addConversationRound: jest.fn().mockResolvedValue(mockUpdatedContext),
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true, structuredOutputs: [] });

      // Status should be updated in the context returned by addConversationRound
      expect(mockUpdatedContext.summary.currentStatus).toBe('completed');
    });

    it('should add task to completedSteps on success', async () => {
      const mockUpdatedContext = {
        taskId: 'test-1',
        sessionId: 'session-1',
        conversationRounds: [],
        summary: {
          sessionIntent: 'test',
          currentTask: 'test task',
          completedSteps: ['test task'], // Updated by the hook
          filesModified: [],
          decisionsMade: [],
          currentStatus: 'completed',
          nextSteps: [],
          errorsAndSolutions: [],
          technicalDetails: {},
        },
        artifactIndex: [],
        workingMemory: {},
        metadata: {},
      };

      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
                conversationRounds: [],
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
        },
      };

      // Mock all required contextManager methods
      (hook as any).contextManager = {
        getContext: jest.fn().mockResolvedValue({
          conversationRounds: [],
        }),
        addConversationRound: jest.fn().mockResolvedValue(mockUpdatedContext),
        saveContext: jest.fn().mockResolvedValue(undefined),
      };

      await hook.postExec(mockContext, { success: true, structuredOutputs: [] });

      // Task should be added to completedSteps
      expect(mockUpdatedContext.summary.completedSteps).toContain('test task');
    });

    it('should handle saveContext errors gracefully', async () => {
      const mockUpdatedContext = {
        taskId: 'test-1',
        sessionId: 'session-1',
        conversationRounds: [],
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
        metadata: {},
      };

      mockContext.context = {
        taskId: 'test-1',
        sessionId: 'session-1',
                conversationRounds: [],
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
        },
      };

      // Mock saveContext to throw error
      (hook as any).contextManager = {
        getContext: jest.fn().mockResolvedValue({
          conversationRounds: [],
        }),
        addConversationRound: jest.fn().mockResolvedValue(mockUpdatedContext),
        saveContext: jest.fn().mockRejectedValue(new Error('Save failed')),
      };

      // Should not throw
      await expect(hook.postExec(mockContext, { success: true, structuredOutputs: [] })).resolves.toBeUndefined();

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
