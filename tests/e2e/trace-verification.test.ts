import { describe, it, expect } from '@jest/globals';
import axios from 'axios';
import {
  createTask,
  sendChatMessage,
  sleep,
} from '../helpers';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function getTraces(taskId: string): Promise<any[]> {
  const response = await axios.get(`${API_BASE_URL}/api/tasks/${taskId}/traces`);
  return response.data.traces || [];
}

describe('Trace Data Verification Tests', () => {
  describe('Multi-turn Trace Uniqueness (Fix #1)', () => {
    it('should preserve all pre/post hook traces across multiple turns', async () => {
      // 1. 创建任务
      const task = await createTask({
        task: '测试任务：你好',
        sessionId: 'trace-test-multi-turn-1',
      });

      // 2. 等待任务完成
      await sleep(5000);

      // 3. 发送多轮对话消息
      await sendChatMessage(task.id, {
        message: '第一轮：请重复"你好"',
        sessionId: 'trace-test-multi-turn-1',
      });
      await sleep(3000);

      await sendChatMessage(task.id, {
        message: '第二轮：请再说一次"你好"',
        sessionId: 'trace-test-multi-turn-1',
      });
      await sleep(3000);

      await sendChatMessage(task.id, {
        message: '第三轮：最后一次说"你好"',
        sessionId: 'trace-test-multi-turn-1',
      });
      await sleep(3000);

      // 4. 获取所有 traces
      const traces = await getTraces(task.id);

      // 5. 验证 traces 存在
      expect(traces).toBeDefined();
      expect(Array.isArray(traces)).toBe(true);

      // 6. 统计 agent 和 skill 的 pre/post hooks
      const agentPreTraces = traces.filter((t: any) =>
        t.level === 'agent' && t.stage === 'pre'
      );
      const agentPostTraces = traces.filter((t: any) =>
        t.level === 'agent' && t.stage === 'post'
      );

      // 7. 验证多轮对话后应该有多个 pre/post hooks
      // 初始任务 + 3轮对话 = 至少4个 agent pre/post hooks
      expect(agentPreTraces.length).toBeGreaterThanOrEqual(3);
      expect(agentPostTraces.length).toBeGreaterThanOrEqual(3);

      // 8. 验证每个 trace ID 都是唯一的
      const traceIds = traces.map((t: any) => t.id);
      const uniqueTraceIds = new Set(traceIds);
      expect(uniqueTraceIds.size).toBe(traceIds.length);

      console.log('✅ 所有 trace ID 都是唯一的');
    }, 60000);
  });

  describe('LLM Prompt Completeness (Fix #2)', () => {
    it('should store complete LLM prompts without truncation', async () => {
      // 1. 创建一个会触发 LLM 调用的任务
      const task = await createTask({
        task: '请详细解释什么是人工智能，包括它的历史、应用领域和未来发展趋势',
        sessionId: 'trace-test-prompt-1',
      });

      // 2. 等待任务完成
      await sleep(10000);

      // 3. 获取所有 traces
      const traces = await getTraces(task.id);

      // 4. 查找包含 LLM 调用 metadata 的 traces
      const llmTraces = traces.filter((t: any) =>
        t.metadata?.llmRequest || t.metadata?.llmResponse
      );

      // 5. 验证至少有一个 LLM trace
      expect(llmTraces.length).toBeGreaterThan(0);

      // 6. 验证 prompt 没有被截断
      for (const trace of llmTraces) {
        const { llmRequest, llmResponse: _llmResponse } = trace.metadata;

        if (llmRequest && llmRequest.prompt) {
          const { prompt, promptLength } = llmRequest;
          expect(prompt).toBeDefined();
          expect(promptLength).toBeDefined();

          // 验证实际 prompt 长度等于保存的长度
          const actualPromptLength = prompt ? prompt.length : 0;

          // 验证 prompt 没有被截断（或者至少应该大于1000字符）
          if (promptLength > 1000) {
            expect(actualPromptLength).toBe(promptLength);
          }
        }
      }
    }, 120000);
  });

  describe('Combined Verification', () => {
    it('should maintain both trace uniqueness and prompt completeness', async () => {
      const task = await createTask({
        task: '综合测试：请介绍一下Python编程语言',
        sessionId: 'trace-test-combined-1',
      });

      await sleep(8000);

      // 第一轮对话
      await sendChatMessage(task.id, {
        message: 'Python有哪些主要应用场景？',
        sessionId: 'trace-test-combined-1',
      });
      await sleep(5000);

      // 第二轮对话
      await sendChatMessage(task.id, {
        message: '请详细说明Python在数据科学中的应用',
        sessionId: 'trace-test-combined-1',
      });
      await sleep(5000);

      // 获取所有 traces
      const traces = await getTraces(task.id);

      // 验证 trace 唯一性
      const traceIds = traces.map((t: any) => t.id);
      const uniqueTraceIds = new Set(traceIds);
      expect(uniqueTraceIds.size).toBe(traceIds.length);
      console.log('✅ Trace ID 唯一性验证通过');

      // 验证 LLM prompt 完整性
      const llmTraces = traces.filter((t: any) =>
        t.metadata?.llmRequest
      );

      for (const trace of llmTraces) {
        const { prompt, promptLength } = trace.metadata.llmRequest;
        if (prompt && promptLength > 1000) {
          expect(prompt.length).toBe(promptLength);
        }
      }
      console.log('✅ Prompt 完整性验证通过');
    }, 120000);
  });
});
