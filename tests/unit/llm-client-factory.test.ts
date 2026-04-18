/**
 * LLMClientFactory 单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LLMClientFactory } from '../../src/core/llm/factory';
import { LLMClient } from '../../src/core/llm/client';

describe('LLMClientFactory', () => {
  afterEach(() => {
    // 清理全局配置
    LLMClientFactory.clearGlobalTraceConfig();
  });

  describe('全局 Trace 配置管理', () => {
    it('应该能够设置全局 trace 配置', () => {
      const mockStreams = {
        executionTraces: {
          set: async () => ({}),
        },
      };
      const traceConfig = {
        streams: mockStreams,
        traceContext: {
          taskId: 'task-123',
          agentId: 'agent-456',
        },
      };

      LLMClientFactory.setGlobalTraceConfig(traceConfig);

      const retrieved = LLMClientFactory.getGlobalTraceConfig();
      expect(retrieved).toEqual(traceConfig);
    });

    it('应该能够更新部分 trace 配置', () => {
      LLMClientFactory.setGlobalTraceConfig({
        streams: {
          executionTraces: {
            set: async () => ({}),
          },
        },
        traceContext: {
          taskId: 'task-123',
        },
      });

      // 更新部分字段
      LLMClientFactory.updateGlobalTraceConfig({
        traceContext: {
          taskId: 'task-456',
          agentId: 'agent-789',
        },
      });

      const retrieved = LLMClientFactory.getGlobalTraceConfig();
      expect(retrieved.traceContext?.taskId).toBe('task-456');
      expect(retrieved.traceContext?.agentId).toBe('agent-789');
      // streams 应该保留
      expect(retrieved.streams).toBeDefined();
    });

    it('应该能够清除 trace 配置', () => {
      LLMClientFactory.setGlobalTraceConfig({
        streams: {
          executionTraces: {
            set: async () => ({}),
          },
        },
        traceContext: {
          taskId: 'task-123',
        },
      });

      LLMClientFactory.clearGlobalTraceConfig();

      const retrieved = LLMClientFactory.getGlobalTraceConfig();
      expect(retrieved).toEqual({});
    });
  });

  describe('LLMClient 创建', () => {
    beforeEach(() => {
      // 设置环境变量
      process.env.LLM_API_KEY = 'test-key';
      process.env.DEFAULT_LLM_PROVIDER = 'anthropic';
      process.env.DEFAULT_LLM_MODEL = 'claude-sonnet-4-5';
    });

    it('应该能够使用预设创建 LLMClient', () => {
      const client = LLMClientFactory.createFromPreset('claude');

      expect(client).toBeInstanceOf(LLMClient);
      const info = client.getInfo();
      expect(info.provider).toBe('anthropic');
    });

    it('应该能够为 Agent 创建 LLMClient', () => {
      const agentConfig = {
        llm: {
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-5',
        },
        sandbox: {
          local: true,
        },
      };

      const client = LLMClientFactory.createForAgent(agentConfig);

      expect(client).toBeInstanceOf(LLMClient);
      const info = client.getInfo();
      expect(info.provider).toBe('anthropic');
      expect(info.model).toBe('claude-sonnet-4-5');
    });

    it('应该能够为摘要创建 LLMClient（无 trace）', () => {
      const client = LLMClientFactory.createForSummarizer();

      expect(client).toBeInstanceOf(LLMClient);
      // 摘要不应该包含 trace 配置
      const privateClient = client as any;
      expect(privateClient.streams).toBeUndefined();
      expect(privateClient.traceContext).toBeUndefined();
    });

    it('创建的 LLMClient 应该继承全局 trace 配置', () => {
      const mockStreams = {
        executionTraces: {
          set: async () => ({}),
        },
      };

      LLMClientFactory.setGlobalTraceConfig({
        streams: mockStreams,
        traceContext: {
          taskId: 'global-task',
        },
      });

      const client = LLMClientFactory.createFromPreset('claude');

      // 验证 trace 配置已设置
      const privateClient = client as any;
      expect(privateClient.streams).toBeDefined();
      expect(privateClient.traceContext?.taskId).toBe('global-task');
    });
  });

  describe('动态更新 Trace 配置', () => {
    it('应该能够更新现有 LLMClient 的 trace 配置', () => {
      const client = LLMClientFactory.createFromPreset('claude');

      const mockStreams = {
        executionTraces: {
          set: async () => ({}),
        },
      };

      LLMClientFactory.updateClientTraceConfig(client, {
        streams: mockStreams,
        traceContext: {
          taskId: 'updated-task',
          agentId: 'updated-agent',
        },
      });

      const privateClient = client as any;
      expect(privateClient.streams).toBe(mockStreams);
      expect(privateClient.traceContext?.taskId).toBe('updated-task');
      expect(privateClient.traceContext?.agentId).toBe('updated-agent');
    });

    it('应该能够为 Agent 更新 trace 配置', () => {
      const client = LLMClientFactory.createFromPreset('claude');

      const mockStreams = {
        executionTraces: {
          set: async () => ({}),
        },
      };

      LLMClientFactory.setGlobalTraceConfig({
        streams: mockStreams,
      });

      LLMClientFactory.updateAgentTraceConfig(
        client,
        'task-123',
        'agent-456'
      );

      const privateClient = client as any;
      expect(privateClient.streams).toBe(mockStreams);
      expect(privateClient.traceContext?.taskId).toBe('task-123');
      expect(privateClient.traceContext?.agentId).toBe('agent-456');
    });

    it('应该能够更新 skillName', () => {
      const client = LLMClientFactory.createFromPreset('claude');

      const mockStreams = {
        executionTraces: {
          set: async () => ({}),
        },
      };

      LLMClientFactory.setGlobalTraceConfig({
        streams: mockStreams,
      });

      LLMClientFactory.updateAgentTraceConfig(
        client,
        'task-123',
        'agent-456',
        'test-skill'
      );

      const privateClient = client as any;
      expect(privateClient.traceContext?.skillName).toBe('test-skill');
    });

    it('如果没有 streams 或 taskId，不应该更新 trace', () => {
      const client = LLMClientFactory.createFromPreset('claude');

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // 没有 streams
      LLMClientFactory.updateAgentTraceConfig(client, 'task-123', 'agent-456');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('配置解析', () => {
    it('应该优先使用显式配置而非环境变量', () => {
      process.env.DEFAULT_LLM_PROVIDER = 'anthropic';
      process.env.DEFAULT_LLM_MODEL = 'claude-sonnet-4-5';

      const client = LLMClientFactory.create({
        provider: 'openai-compatible',
        model: 'gpt-4',
        apiKey: 'custom-key',
      });

      const info = client.getInfo();
      expect(info.provider).toBe('openai-compatible');
      expect(info.model).toBe('gpt-4');
    });

    it('应该回退到环境变量', () => {
      process.env.LLM_API_KEY = 'env-key';
      process.env.DEFAULT_LLM_PROVIDER = 'anthropic';
      process.env.DEFAULT_LLM_MODEL = 'claude-sonnet-4-5';

      const client = LLMClientFactory.create({});

      const info = client.getInfo();
      expect(info.model).toBe('claude-sonnet-4-5');
    });
  });
});
