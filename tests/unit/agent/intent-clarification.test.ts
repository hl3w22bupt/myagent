/**
 * Agent Intent Clarification Tests
 *
 * Tests for Agent's intent clarification (HITL) functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Agent } from '@/core/agent/agent';
import { LLMClient } from '@/core/llm/client';
import { getDataStore } from '@/core/database/data-store';

// Mock LLMClient
jest.mock('@/core/llm/client');

describe('Agent Intent Clarification', () => {
  let agent: Agent;
  let mockLLM: jest.Mocked<LLMClient>;
  const sessionId = 'test-session';

  beforeAll(async () => {
    const store = getDataStore();
    await store.initialize();
  });

  afterAll(async () => {
    const store = getDataStore();
    await store.close();
  });

  beforeEach(() => {
    // Create mock LLM
    mockLLM = {
      messagesCreate: jest.fn(),
      stream: jest.fn(),
    } as any;

    // Create agent with clarification enabled
    agent = new Agent({
      name: 'test-agent',
      systemPrompt: 'You are a test agent',
      availableSkills: [],
      llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      },
      sandbox: {
        type: 'local',
        local: {
          pythonPath: 'python3',
          timeout: 5000,
        },
      },
      constraints: {
        enable_clarification: true,
      },
    }, sessionId);

    // Replace the agent's LLM with our mock
    (agent as any).llm = mockLLM;

    // Mock hookManager to avoid null reference errors
    const mockHookManager = {
      executeHook: jest.fn(() => Promise.resolve()),
    };
    (agent as any).hookManager = mockHookManager as any;

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Confidence threshold checking', () => {
    it('should not request clarification when confidence >= 0.7', async () => {
      const highConfidenceIntent = {
        intent: 'code_generation',
        confidence: 0.8,
        reasoning: 'Clear intent',
        category: 'technical',
      };

      const context = { skipHITL: false };

      const result = await (agent as any).checkIntentClarification(
        highConfidenceIntent,
        'Write a function',
        'mock-task-id',
        context
      );

      expect(result.needs).toBe(false);
      expect(mockLLM.messagesCreate).not.toHaveBeenCalled();
    });

    it('should request clarification when confidence < 0.7', async () => {
      const lowConfidenceIntent = {
        intent: 'unknown',
        confidence: 0.5,
        reasoning: 'Unclear intent',
        category: 'general',
      };

      // Mock LLM to request clarification
      mockLLM.messagesCreate.mockResolvedValue({
        content: JSON.stringify({
          needs_clarification: true,
          question: 'What kind of task do you want me to perform?',
        }),
      });

      // Mock pollHITLResult
      jest.spyOn(agent as any, 'pollHITLResult').mockResolvedValue({
        content: 'Create video',
      });

      const context = { skipHITL: false, enableHITLInTest: true };

      const result = await (agent as any).checkIntentClarification(
        lowConfidenceIntent,
        'Do something',
        'mock-task-id',
        context
      );

      // Verify LLM was called
      expect(mockLLM.messagesCreate).toHaveBeenCalled();

      // Should return clarification content (after polling)
      expect(result.needs).toBe(false);
      expect(result.clarification).toBe('Create video');
    });
  });

  describe('Configuration options', () => {
    it('should respect skipHITL flag in context', async () => {
      const lowConfidenceIntent = {
        intent: 'unknown',
        confidence: 0.3,
        reasoning: 'Unclear',
        category: 'general',
      };

      const context = { skipHITL: true };

      const result = await (agent as any).checkIntentClarification(
        lowConfidenceIntent,
        'Create something',
        'mock-task-id',
        context
      );

      expect(result.needs).toBe(false);
      expect(mockLLM.messagesCreate).not.toHaveBeenCalled();
    });

    it('should respect enable_clarification config', async () => {
      // Create agent with clarification disabled
      const agentNoClarification = new Agent({
        name: 'test-agent-no-clarification',
        systemPrompt: 'You are a test agent',
        availableSkills: [],
        llm: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          type: 'local',
          local: {
            pythonPath: 'python3',
            timeout: 5000,
          },
        },
        constraints: {
          enable_clarification: false,
        },
      }, sessionId);

      const lowConfidenceIntent = {
        intent: 'unknown',
        confidence: 0.3,
        reasoning: 'Unclear',
        category: 'general',
      };

      const context = { skipHITL: false, enableHITLInTest: true };

      const result = await (agentNoClarification as any).checkIntentClarification(
        lowConfidenceIntent,
        'Create something',
        'mock-task-id',
        context
      );

      expect(result.needs).toBe(false);
      expect(mockLLM.messagesCreate).not.toHaveBeenCalled();
    });
  });

  describe('Fallback behavior', () => {
    it('should use fallback rules when LLM fails', async () => {
      const lowConfidenceIntent = {
        intent: 'unknown',
        confidence: 0.4,
        reasoning: 'Unclear',
        category: 'general',
        possibleIntents: ['Create video', 'Write code'],
      };

      // Mock LLM to throw error
      mockLLM.messagesCreate.mockRejectedValue(new Error('LLM service unavailable'));

      // Mock pollHITLResult
      jest.spyOn(agent as any, 'pollHITLResult').mockResolvedValue({
        content: 'Create video',
      });

      const context = { skipHITL: false, enableHITLInTest: true };

      const result = await (agent as any).checkIntentClarification(
        lowConfidenceIntent,
        'Create something',
        'mock-task-id',
        context
      );

      // Should use fallback and return clarification
      expect(result.needs).toBe(false);
      expect(result.clarification).toBe('Create video');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full clarification workflow with mocked polling', async () => {
      const lowConfidenceIntent = {
        intent: 'creative',
        confidence: 0.5,
        reasoning: 'Unclear what type of content',
        category: 'creative',
      };

      const llmResponse = {
        needs_clarification: true,
        question: 'What type of video do you want to create?',
        options: ['Tutorial', 'Advertisement', 'Vlog', 'Animation'],
      };

      mockLLM.messagesCreate.mockResolvedValue({
        content: JSON.stringify(llmResponse),
      });

      // Mock pollHITLResult to simulate user response
      jest.spyOn(agent as any, 'pollHITLResult').mockResolvedValue({
        content: 'Tutorial video',
        feedback: 'For beginners',
      });

      const context = { skipHITL: false, enableHITLInTest: true };

      const result = await (agent as any).checkIntentClarification(
        lowConfidenceIntent,
        'Create a video',
        'mock-task-id',
        context
      );

      // Verify clarification was processed
      expect(result.needs).toBe(false);
      expect(result.clarification).toBe('Tutorial video');
      expect(result.feedback).toBe('For beginners');
    });

    it('should process text clarification responses correctly', async () => {
      const lowConfidenceIntent = {
        intent: 'technical',
        confidence: 0.4,
        reasoning: 'Unclear technical requirement',
        category: 'technical',
      };

      mockLLM.messagesCreate.mockResolvedValue({
        content: JSON.stringify({
          needs_clarification: true,
          question: 'What programming language?',
        }),
      });

      // Mock user providing text response
      jest.spyOn(agent as any, 'pollHITLResult').mockResolvedValue({
        content: 'Python with FastAPI',
      });

      const context = { skipHITL: false, enableHITLInTest: true };

      const result = await (agent as any).checkIntentClarification(
        lowConfidenceIntent,
        'Build an API',
        'mock-task-id',
        context
      );

      expect(result.clarification).toBe('Python with FastAPI');
    });
  });
});
