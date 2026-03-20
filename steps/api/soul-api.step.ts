import { z } from 'zod';
import { Step, StepOutput } from '@motiadev/core';
import { soulScheduler } from '../../src/core/scheduler/soul-scheduler';
import { getDataStore } from '../../src/core/database/data-store';

/**
 * Soul API - Autonomous Agent Trigger API
 *
 * Provides universal API endpoints for triggering Soul agents
 */

// ============================================================
// API: Execute Soul (通用接口)
// ============================================================

export const executeSoulTrigger: Step = {
  type: 'api',
  method: 'POST',
  path: '/api/soul/:soulId/execute',
  schema: z.object({
    soulId: z.string(),
    userId: z.string(),
    trigger_time: z.string().optional(),
    context: z.object({
      source: z.string(),
      data: z.any()
    })
  }),
  handler: async (request, context): Promise<StepOutput> => {
    const { soulId, userId, trigger_time, context: triggerContext } = request.body;

    console.log(`[SoulAPI] Executing soul: ${soulId} for user: ${userId}`);

    try {
      // Create session ID
      const sessionId = `soul-${soulId}-${userId}`;

      // Activate soul through scheduler
      const soulAgent = await soulScheduler.activateSoul(soulId, sessionId);

      // Execute soul with trigger context
      const input = {
        trigger_time: trigger_time || new Date().toISOString(),
        context: triggerContext
      };

      const result = await soulAgent.execute(input);

      return {
        status: 200,
        body: {
          success: true,
          sessionId,
          soulId,
          result: {
            executed: true,
            hibernated: false // TODO: Track if soul hibernated
          }
        }
      };
    } catch (error: any) {
      console.error(`[SoulAPI] Failed to execute soul: ${error.message}`);

      return {
        status: 500,
        body: {
          success: false,
          error: error.message
        }
      };
    }
  }
};

// ============================================================
// API: Get Soul Status
// ============================================================

export const getSoulStatusTrigger: Step = {
  type: 'api',
  method: 'GET',
  path: '/api/soul/:soulId/status/:userId',
  schema: z.object({
    soulId: z.string(),
    userId: z.string()
  }),
  handler: async (request, context): Promise<StepOutput> => {
    const { soulId, userId } = request.params;
    const sessionId = `soul-${soulId}-${userId}`;

    console.log(`[SoulAPI] Getting soul status: ${sessionId}`);

    try {
      const isActive = soulScheduler.isSoulActive(sessionId);
      const isHibernated = soulScheduler.isSoulHibernated(sessionId);

      let status = 'IDLE';
      if (isActive) {
        status = 'ACTIVE';
      } else if (isHibernated) {
        status = 'HIBERNATED';
      }

      // Get soul agent if active
      let soulState = null;
      if (isActive) {
        const soulAgent = soulScheduler.getActiveSoul(sessionId);
        if (soulAgent) {
          soulState = soulAgent.getSoulState();
        }
      }

      return {
        status: 200,
        body: {
          sessionId,
          soulId,
          status,
          isActive,
          isHibernated,
          state: soulState
        }
      };
    } catch (error: any) {
      console.error(`[SoulAPI] Failed to get soul status: ${error.message}`);

      return {
        status: 500,
        body: {
          error: error.message
        }
      };
    }
  }
};

// ============================================================
// API: List Active Souls
// ============================================================

export const listActiveSoulsTrigger: Step = {
  type: 'api',
  method: 'GET',
  path: '/api/souls/active',
  schema: z.object({}),
  handler: async (request, context): Promise<StepOutput> => {
    console.log('[SoulAPI] Listing active souls');

    try {
      const stats = soulScheduler.getStats();

      return {
        status: 200,
        body: {
          stats
        }
      };
    } catch (error: any) {
      console.error(`[SoulAPI] Failed to list active souls: ${error.message}`);

      return {
        status: 500,
        body: {
          error: error.message
        }
      };
    }
  }
};

// ============================================================
// API: Hibernate Soul (手动休眠)
// ============================================================

export const hibernateSoulTrigger: Step = {
  type: 'api',
  method: 'POST',
  path: '/api/soul/:soulId/hibernate/:userId',
  schema: z.object({
    soulId: z.string(),
    userId: z.string(),
    reason: z.string().optional()
  }),
  handler: async (request, context): Promise<StepOutput> => {
    const { soulId, userId } = request.params;
    const { reason = 'Manual hibernation' } = request.body;
    const sessionId = `soul-${soulId}-${userId}`;

    console.log(`[SoulAPI] Hibernating soul: ${sessionId}`);

    try {
      const soulAgent = soulScheduler.getActiveSoul(sessionId);

      if (!soulAgent) {
        return {
          status: 404,
          body: {
            success: false,
            error: 'Soul not found or not active'
          }
        };
      }

      await soulScheduler.hibernateSoul(soulAgent);

      return {
        status: 200,
        body: {
          success: true,
          sessionId,
          reason
        }
      };
    } catch (error: any) {
      console.error(`[SoulAPI] Failed to hibernate soul: ${error.message}`);

      return {
        status: 500,
        body: {
          success: false,
          error: error.message
        }
      };
    }
  }
};
