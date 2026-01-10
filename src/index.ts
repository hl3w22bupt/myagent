/**
 * Application Entry Point
 *
 * This module initializes and exports the global AgentManager instance for Agent sessions.
 * The manager is created as a singleton at application startup and can be imported by
 * any Motia step that needs session-scoped Agent instances.
 *
 * ## Architecture
 *
 * - **agentManager**: Manages session-scoped Agent instances with LLM configuration
 *
 * ## Usage
 *
 * Import the manager in your Motia steps:
 *
 * ```typescript
 * import { agentManager } from '@/index';
 *
 * const agent = await agentManager.acquire(sessionId);
 * ```
 *
 * ## Configuration
 *
 * Manager behavior is configured via environment variables:
 * - SESSION_TIMEOUT: Session timeout in milliseconds (default: 1800000 = 30 minutes)
 * - MAX_SESSIONS: Maximum number of concurrent sessions (default: 1000)
 * - TASK_TIMEOUT: Task execution timeout in milliseconds (default: 60000 = 1 minute)
 * - MAX_ITERATIONS: Maximum agent iterations per task (default: 5)
 * - LLM_PROVIDER: LLM provider - 'anthropic' or 'openai-compatible' (default: anthropic)
 * - LLM_MODEL: Model name (default: claude-sonnet-4-5)
 * - ANTHROPIC_API_KEY: API key for Anthropic
 * - OPENAI_API_KEY: API key for OpenAI-compatible providers
 * - PYTHON_PATH: Path to Python executable (default: python3)
 *
 * ## Graceful Shutdown
 *
 * This module registers handlers for SIGTERM and SIGINT signals to ensure proper
 * cleanup of all active sessions before process exit.
 */

import { AgentManager } from './core/agent/manager';
import { resolve } from 'path';

/**
 * Global AgentManager singleton.
 *
 * Uses lazy initialization to avoid issues with module hot-reload.
 * The manager is created only once and reused across reloads.
 */
let _agentManager: AgentManager | null = null;

/**
 * Get or create the global AgentManager instance.
 */
export function getAgentManager(): AgentManager {
  if (_agentManager) {
    console.log('[index.ts] Returning existing AgentManager instance');
    return _agentManager;
  }

  // Try .venv (uv) first, then python_modules, then system python3
  const venvPythonPath =
    process.env.PYTHON_PATH ||
    resolve(process.cwd(), 'python_modules', 'bin', 'python3') ||
    resolve(process.cwd(), '.venv', 'bin', 'python3');

  console.log('[index.ts] Initializing AgentManager with config:');
  console.log('[index.ts] venvPythonPath:', venvPythonPath);
  console.log('[index.ts] process.cwd():', process.cwd());

  _agentManager = new AgentManager({
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'), // 30 minutes
    maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
    agentConfig: {
      systemPrompt: 'You are a helpful assistant',
      llm: {
        provider: (process.env.DEFAULT_LLM_PROVIDER === 'openai-compatible' ? 'openai-compatible' : 'anthropic'),
        model: process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-5',
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || ''
      },
      availableSkills: ['web-search', 'summarize', 'code-analysis'],
      sandbox: {
        type: 'local',
        config: {
          pythonPath: process.env.PYTHON_PATH || venvPythonPath
        }
      },
      constraints: {
        timeout: parseInt(process.env.TASK_TIMEOUT || '60000'),
        maxIterations: parseInt(process.env.MAX_ITERATIONS || '5')
      }
    }
  });

  return _agentManager;
}

/**
 * Legacy export: AgentManager instance.
 *
 * For backward compatibility with existing code that imports agentManager.
 * This is a reference to the singleton instance.
 */
export const agentManager = getAgentManager() as AgentManager;


/**
 * Graceful shutdown handler for SIGTERM.
 *
 * Ensures all active sessions are properly cleaned up before process exit.
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received: Shutting down managers...');
  try {
    await agentManager.shutdown();
    console.log('Managers shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

/**
 * Graceful shutdown handler for SIGINT (Ctrl+C).
 *
 * Ensures all active sessions are properly cleaned up before process exit.
 */
process.on('SIGINT', async () => {
  console.log('\nSIGINT received: Shutting down managers...');
  try {
    await agentManager.shutdown();
    console.log('Managers shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});
