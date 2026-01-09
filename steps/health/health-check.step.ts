/**
 * Health Check API Step.
 *
 * Provides system health status and metrics.
 */

import { z } from 'zod';
import { ApiRouteConfig } from 'motia';

/**
 * Response schema for health check.
 */
const healthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  services: z.object({
    api: z.boolean(),
    agent: z.boolean(),
    sandbox: z.boolean(),
    llm: z.boolean()
  }),
  metrics: z.object({
    totalTasks: z.number(),
    successfulTasks: z.number(),
    failedTasks: z.number(),
    averageExecutionTime: z.number()
  }).optional()
});

/**
 * Health Check API configuration.
 */
export const config: ApiRouteConfig = {
  type: 'api',
  name: 'health-check',
  description: 'Health check and system status endpoint',

  /**
   * API route configuration.
   */
  path: '/health',
  method: 'GET',

  /**
   * No events emitted.
   */
  emits: [],

  /**
   * No flow assignment.
   */
  flows: []
};

/**
 * Health Check handler.
 *
 * Returns system health status and metrics.
 */
export const handler = async (
  request: any,
  { logger, state }: any
) => {
  const startTime = Date.now();

  try {
    // Get basic system info
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();
    const version = '1.0.0';

    // Check service health
    const services = {
      api: true,  // If we're here, API is healthy
      agent: true,
      sandbox: true,
      llm: process.env.ANTHROPIC_API_KEY ? true : false
    };

    // Get metrics from state if available
    let metrics;
    try {
      // Use Motia state API with groupId and key
      const history = await state.get('agent:execution', 'history') || [];

      const successfulTasks = history.filter((entry: any) => entry.success).length;
      const failedTasks = history.filter((entry: any) => !entry.success).length;

      // Calculate average execution time (if available)
      const execTimes = history
        .filter((entry: any) => entry.metadata?.executionTime)
        .map((entry: any) => entry.metadata.executionTime);

      const averageExecutionTime = execTimes.length > 0
        ? execTimes.reduce((a: number, b: number) => a + b, 0) / execTimes.length
        : 0;

      metrics = {
        totalTasks: history.length,
        successfulTasks,
        failedTasks,
        averageExecutionTime: Math.round(averageExecutionTime)
      };
    } catch (stateError) {
      // State not available, return empty metrics
      metrics = {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageExecutionTime: 0
      };
    }

    // Determine overall health status
    const allServicesHealthy = Object.values(services).every(v => v === true);
    const status = allServicesHealthy ? 'healthy' : services.api ? 'degraded' : 'unhealthy';

    logger.info('Health check performed', {
      status,
      uptime: Math.round(uptime),
      services
    });

    return {
      status: status === 'healthy' ? 200 : 503,
      body: {
        status,
        version,
        uptime: Math.round(uptime),
        timestamp,
        services,
        metrics
      }
    };
  } catch (error: any) {
    logger.error('Health check failed', {
      error: error.message
    });

    return {
      status: 503,
      body: {
        status: 'unhealthy',
        version: '1.0.0',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        error: error.message,
        services: {
          api: false,
          agent: false,
          sandbox: false,
          llm: false
        }
      }
    };
  }
};
