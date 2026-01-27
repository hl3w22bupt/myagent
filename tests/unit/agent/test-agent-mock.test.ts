import { Agent } from '../../../src/core/agent/agent';

// 模拟 LLM 客户端
class MockLLMClient {
  async messagesCreate(messages: any[]): Promise<any> {
    console.log("模拟 LLM 调用:", messages);
    // 检查是否是技能选择阶段还是代码生成阶段
    if (messages[0].content.includes("selected_skills")) {
      // 技能选择阶段
      return {
        content: `
<plan>
{
  "selected_skills": [],
  "reasoning": "这是一个简单的加法计算，不需要使用任何技能"
}
</plan>
        `,
      };
    } else {
      // 代码生成阶段
      return {
        content: `
\`\`\`python
result = 1 + 1
print(f"计算结果: {result}")
\`\`\`
        `,
      };
    }
  }
}

describe('Agent 测试', () => {
  it('应该只生成一个 PTC 代码', async () => {
    try {
      // 创建一个简单的任务
      const task = "计算 1+1 的结果";
      const sessionId = "test-session-123";

      // 创建 Agent 实例
      const agent = new Agent({
        systemPrompt: '你是一个计算助手',
        availableSkills: [],
        llm: {
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-3-opus-20240229',
        },
        sandbox: {
          type: 'local',
          local: {},
        },
      }, sessionId);

      // 替换 LLM 客户端为模拟对象
      (agent as any).llm = new MockLLMClient();

      // 执行任务
      const result = await (agent as any).run(task);

      console.log("任务执行结果:", result);

      // 验证只生成了一个 PTC 代码
      expect(result.metadata.llmCalls).toBe(1);
    } catch (error) {
      console.error("任务执行失败:", error);
      throw error;
    }
  });
});
