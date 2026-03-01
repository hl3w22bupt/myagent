import { describe, it, expect, beforeEach } from '@jest/globals';
import { LLMSummarizer } from '../summarizer';

describe('LLMSummarizer', () => {
  let summarizer: LLMSummarizer;

  beforeEach(() => {
    summarizer = new LLMSummarizer({
      apiKey: 'test-key',
      model: 'gpt-4',
    });
  });

  it('should generate structured summary from messages', async () => {
    const messages = [
      {
        id: 'msg-1',
        taskId: 'test-task',
        role: 'user',
        content: '创建一个React组件显示用户列表',
        metadata: { timestamp: new Date(), tokens: 20 },
      },
      {
        id: 'msg-2',
        taskId: 'test-task',
        role: 'assistant',
        content: '我将创建UserList组件，包含用户数据获取和展示逻辑',
        metadata: { timestamp: new Date(), tokens: 30 },
      },
      {
        id: 'msg-3',
        taskId: 'test-task',
        role: 'assistant',
        content: '已创建文件 /src/components/UserList.tsx',
        metadata: { timestamp: new Date(), tokens: 25 },
      },
    ];

    // Mock LLM调用
    summarizer.callLLM = async (_prompt: string) => {
      return JSON.stringify({
        sessionIntent: '创建React用户列表组件',
        currentTask: '创建UserList组件',
        completedSteps: ['分析需求', '创建组件文件'],
        filesModified: [
          {
            path: '/src/components/UserList.tsx',
            action: 'created',
            description: '创建用户列表组件',
            timestamp: new Date(),
          },
        ],
        decisionsMade: [
          {
            topic: '组件结构',
            decision: '使用函数组件',
            reasoning: '更简单且支持Hooks',
            timestamp: new Date(),
          },
        ],
        currentStatus: 'in_progress',
        nextSteps: ['添加样式', '实现数据获取'],
        errorsAndSolutions: [],
        technicalDetails: {
          functionNames: ['UserList'],
          dependencies: ['react'],
        },
      });
    };

    const summary = await summarizer.summarizeContext(messages);

    expect(summary).toBeDefined();
    expect(summary.sessionIntent).toBe('创建React用户列表组件');
    expect(summary.completedSteps).toHaveLength(2);
    expect(summary.filesModified).toHaveLength(1);
  });
});
