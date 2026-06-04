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
 * - LLM_API_KEY: API key for LLM provider (falls back to ANTHROPIC_API_KEY)
 * - OPENAI_API_KEY: API key for OpenAI-compatible providers (or embedding)
 * - PYTHON_PATH: Path to Python executable (default: python3)
 *
 * ## Graceful Shutdown
 *
 * This module registers handlers for SIGTERM and SIGINT signals to ensure proper
 * cleanup of all active sessions before process exit.
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { AgentManager } from './core/agent/manager.js';
import { resolve } from 'path';
import { existsSync, readdirSync } from 'fs';
import type { MasterAgentConfig, ExternalAgentConfig } from './core/agent/types.js';

/**
 * Global AgentManager singleton.
 *
 * Uses lazy initialization to avoid issues with module hot-reload.
 * The manager is created only once and reused across reloads.
 */
let _agentManager: AgentManager | null = null;

/**
 * Discover all subagents in the subagents directory.
 *
 * Scans the subagents/ directory for all directories containing an agent.yaml file.
 * This allows automatic discovery without hardcoding subagent names.
 */
export function discoverSubagents(): string[] {
  const subagentsDir = resolve(process.cwd(), 'subagents');
  if (!existsSync(subagentsDir)) {
    console.warn('[MasterAgent] Subagents directory not found:', subagentsDir);
    return [];
  }
  const discovered = readdirSync(subagentsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => {
      const configPath = resolve(subagentsDir, name, 'agent.yaml');
      return existsSync(configPath);
    });

  if (discovered.length > 0) {
    console.log(`[MasterAgent] Discovered ${discovered.length} subagents:`, discovered.join(', '));
  } else {
    console.warn('[MasterAgent] No subagents found with agent.yaml configuration');
  }

  return discovered;
}

/**
 * Get or create the global AgentManager instance.
 */
export function getAgentManager(): AgentManager {
  if (_agentManager) {
    return _agentManager;
  }

  // Try .venv (uv) first, then python_modules, then system python3
  const venvPythonPath =
    process.env.PYTHON_PATH ||
    resolve(process.cwd(), 'python_modules', 'bin', 'python3') ||
    resolve(process.cwd(), '.venv', 'bin', 'python3');

  // Prepare MasterAgent configuration
  const masterAgentConfig: MasterAgentConfig = {
    systemPrompt: 'You are a helpful assistant with delegation capabilities.',
    llm: {
      provider:
        process.env.DEFAULT_LLM_PROVIDER === 'openai-compatible'
          ? 'openai-compatible'
          : 'anthropic',
      model: process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-5',
      apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
    },
    // Knowledge Base configuration for RAG (enabled by default if DB is configured)
    knowledgeBase: process.env.KNOWLEDGE_BASE_ENABLED !== 'false' ? {
      db: {
        host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
        database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
        user: process.env.PG_USER || process.env.DB_USER || 'leo',
      },
      apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536'),
    } : undefined,
    // Don't restrict availableSkills - let all discovered skills be available
    // This allows users to explicitly request skills via task instructions
    // (undefined = all skills available)
    sandbox: {
      type: 'local',
      local: {
        pythonPath: process.env.PYTHON_PATH || venvPythonPath,
        timeout: parseInt(process.env.TASK_TIMEOUT || '60000'),
      },
    },
    subagents: discoverSubagents(),
  };

  // Prepare ExternalAgent configuration
  const externalAgentConfig: ExternalAgentConfig = {
    systemPrompt: 'External coding agent',
    llm: {
      provider: 'anthropic',
      model: 'unused',
      apiKey: 'unused',
    },
    sandbox: {
      type: 'local',
      local: {},
    },
    externalAgent: {
      type: (process.env.EXTERNAL_AGENT_TYPE || 'claude') as 'claude' | 'codex' | 'gemini' | 'cursor' | 'pi' | 'openclaw',
      protocol: 'acp',
      timeout: parseInt(process.env.EXTERNAL_AGENT_TIMEOUT || '1800000'), // 30 minutes (default)
      workingDirectory: process.env.EXTERNAL_AGENT_WORKSPACE || '/tmp/myagent-workspaces',
      args: [],
    },
  };

  _agentManager = new AgentManager({
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000'), // 30 minutes
    maxSessions: parseInt(process.env.MAX_SESSIONS || '1000'),
    agentConfig: {
      systemPrompt: 'You are a helpful assistant',
      llm: {
        provider:
          process.env.DEFAULT_LLM_PROVIDER === 'openai-compatible'
            ? 'openai-compatible'
            : 'anthropic',
        model: process.env.DEFAULT_LLM_MODEL || 'claude-sonnet-4-5',
        apiKey: process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || '',
      },
      // Knowledge Base configuration for RAG (enabled by default if DB is configured)
      knowledgeBase: process.env.KNOWLEDGE_BASE_ENABLED !== 'false' ? {
        db: {
          host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432'),
          database: process.env.PG_DATABASE || process.env.DB_NAME || 'myagent',
          user: process.env.PG_USER || process.env.DB_USER || 'leo',
        },
        apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
        baseURL: process.env.OPENAI_BASE_URL || undefined,
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536'),
      } : undefined,
      // availableSkills: undefined, // Allow dynamic configuration via availableSkills parameter (undefined = all skills)
      sandbox: {
        type: 'local',
        local: {
          pythonPath: process.env.PYTHON_PATH || venvPythonPath,
          timeout: parseInt(process.env.TASK_TIMEOUT || '600000'), // 10 minute
        },
      },
      constraints: {
        timeout: parseInt(process.env.TASK_TIMEOUT || '600000'), // 10 minute - unified with sandbox
        maxIterations: parseInt(process.env.MAX_ITERATIONS || '5'),
        // Retry configuration for failed operations
        retry: {
          maxRetries: parseInt(process.env.MAX_RETRIES || '3'), // Maximum retry attempts
          baseDelay: parseInt(process.env.RETRY_BASE_DELAY || '1000'), // Base delay in ms
          maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '30000'), // Maximum delay in ms
          exponentialBackoff: process.env.RETRY_EXPONENTIAL_BACKOFF !== 'false', // Use exponential backoff
        },
      },
    },
    masterAgentConfig, // Optional: Enable MasterAgent support
    externalAgentConfig, // Optional: Enable ExternalAgent support
    defaultAgentType: 'agent', // Default to regular Agent for backward compatibility
  });

  return _agentManager;
}

/**
 * Legacy export: AgentManager instance.
 *
 * For backward compatibility with existing code that imports agentManager.
 * This is a reference to the singleton instance.
 */
/**
 * Legacy export: AgentManager instance (lazy getter).
 *
 * @deprecated Use getAgentManager() instead.
 */
export const agentManager = new Proxy({} as AgentManager, {
  get: (target, prop) => {
    const manager = getAgentManager();
    return (manager as any)[prop];
  },
});

/**
 * Graceful shutdown handler for SIGTERM.
 *
 * Ensures all active sessions are properly cleaned up before process exit.
 */
process.on('SIGTERM', async () => {
  try {
    await agentManager.shutdown();
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
  try {
    await agentManager.shutdown();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});
