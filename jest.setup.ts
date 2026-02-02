import { getAgentManager } from './src/index';
import { getDataStore } from './src/core/database/data-store';

// Initialize database once for all tests (if using PostgreSQL)
let dbInitialized = false;

beforeAll(async () => {
  const backend = process.env.DATABASE_BACKEND || 'sqlite';

  if (backend === 'postgres' && !dbInitialized) {
    console.log('[Jest Setup] Initializing PostgreSQL for all tests...');
    try {
      const dataStore = getDataStore();
      await dataStore.initialize();
      dbInitialized = true;
      console.log('[Jest Setup] PostgreSQL initialized successfully');
    } catch (error) {
      console.error('[Jest Setup] Failed to initialize PostgreSQL:', error);
      throw error;
    }
  }
});

// 全局测试结束时清理 AgentManager 单例
afterAll(async () => {
  const agentManager = getAgentManager();
  if (agentManager && typeof agentManager.shutdown === 'function') {
    await agentManager.shutdown();
  }

  // Close database connection if using PostgreSQL
  const backend = process.env.DATABASE_BACKEND || 'sqlite';
  if (backend === 'postgres') {
    try {
      const dataStore = getDataStore();
      if (dataStore && typeof dataStore.close === 'function') {
        await dataStore.close();
        console.log('[Jest Setup] PostgreSQL connection closed');
      }
    } catch (error) {
      console.error('[Jest Setup] Failed to close PostgreSQL:', error);
    }
  }
});
