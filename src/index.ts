/**
 * Application Entry Point
 *
 * This module initializes and exports global manager instances for Agent and Sandbox sessions.
 * These managers are created as singletons at application startup and can be imported by
 * any Motia step that needs session-scoped Agent or Sandbox instances.
 *
 * ## Architecture
 *
 * - **agentManager**: Manages session-scoped Agent instances with LLM configuration
 * - **sandboxManager**: Manages session-scoped Sandbox instances for code execution
 *
 * ## Usage
 *
 * Import the managers in your Motia steps:
 *
 * ```typescript
 * import { agentManager } from '@/index';
 * import { sandboxManager } from '@/index';
 *
 * const agent = await agentManager.acquire(sessionId);
 * const sandbox = await sandboxManager.acquire(sessionId);
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
 * - SANDBOX_WORKSPACE: Working directory for sandbox execution (default: /tmp/motia-sandbox)
 *
 * ## Graceful Shutdown
 *
 * This module registers handlers for SIGTERM and SIGINT signals to ensure proper
 * cleanup of all active sessions before process exit.
 */

import { AgentManager } from './core/agent/manager';
import { SandboxManager } from './core/sandbox/manager';

/**
 * Global AgentManager instance.
 *
 * Manages session-scoped Agent instances with the following configuration:
 * - Session timeout: 30 minutes (configurable via SESSION_TIMEOUT)
 * - Maximum sessions: 1000 (configurable via MAX_SESSIONS)
 * - LLM provider: Anthropic Claude (configurable via LLM_PROVIDER)
 * - Available skills: web-search, summarize, code-analysis
 * - Task timeout: 60 seconds (configurable via TASK_TIMEOUT)
 * - Max iterations: 5 (configurable via MAX_ITERATIONS)
 */
export const agentManager = new AgentManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'), // 30 minutes
  maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
  agentConfig: {
    systemPrompt: 'You are a helpful assistant',
    llm: {
      provider: process.env.LLM_PROVIDER as 'anthropic' | 'openai-compatible' || 'anthropic',
      model: process.env.LLM_MODEL || 'claude-sonnet-4-5',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
    },
    availableSkills: ['web-search', 'summarize', 'code-analysis'],
    sandbox: {
      type: 'local',
      config: {
        pythonPath: process.env.PYTHON_PATH || 'python3'
      }
    },
    constraints: {
      timeout: parseInt(process.env.TASK_TIMEOUT || '60000'),
      maxIterations: parseInt(process.env.MAX_ITERATIONS || '5')
    }
  }
});

/**
 * Global SandboxManager instance.
 *
 * Manages session-scoped Sandbox instances with the following configuration:
 * - Session timeout: 30 minutes (configurable via SESSION_TIMEOUT)
 * - Maximum sessions: 1000 (configurable via MAX_SESSIONS)
 * - Sandbox type: local (configurable via SANDBOX_TYPE)
 * - Python path: python3 (configurable via PYTHON_PATH)
 * - Workspace: /tmp/motia-sandbox (configurable via SANDBOX_WORKSPACE)
 * - Task timeout: 60 seconds (configurable via TASK_TIMEOUT)
 */
export const sandboxManager = new SandboxManager({
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'), // 30 minutes
  maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
  sandboxConfig: {
    type: process.env.SANDBOX_TYPE || 'local',
    pythonPath: process.env.PYTHON_PATH || 'python3',
    workspace: process.env.SANDBOX_WORKSPACE || '/tmp/motia-sandbox',
    timeout: parseInt(process.env.TASK_TIMEOUT || '60000')
  }
});

/**
 * Graceful shutdown handler for SIGTERM.
 *
 * Ensures all active sessions are properly cleaned up before process exit.
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received: Shutting down managers...');
  try {
    await agentManager.shutdown();
    await sandboxManager.shutdown();
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
    await sandboxManager.shutdown();
    console.log('Managers shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});
