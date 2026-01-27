import { getAgentManager } from './src/index';

// 全局测试结束时清理 AgentManager 单例
afterAll(async () => {
  const agentManager = getAgentManager();
  if (agentManager && typeof agentManager.shutdown === 'function') {
    await agentManager.shutdown();
  }
});
