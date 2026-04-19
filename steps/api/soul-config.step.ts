/**
 * Soul Configuration API
 *
 * 获取 Soul 和 Subagent 的完整配置信息
 */

import { soulConfigLoader } from '../../src/core/config/soul-config-loader';
import { promises as fs } from 'fs';
import path from 'path';
import { type StepConfig, logger } from 'motia';

/**
 * Soul Configuration API configuration.
 */
export const config = {
  name: 'soul-config',
  description: '获取 Soul 和 Subagent 完整配置',

  triggers: [{ type: 'http' as const, method: 'GET' as const, path: '/api/soul/:soulId/config' }],
  enqueues: [] as const,
} as const satisfies StepConfig;

/**
 * Soul Configuration handler.
 */
export const handler = async (context: any) => {
  const soulId = context.request.pathParams?.soulId;

  logger.info('Fetching soul configuration', { soulId });

  try {
    // 1. 加载 Soul 配置
    const soulConfig = await soulConfigLoader.loadSoulConfig(soulId);

    // 2. 读取完整的 soul.yaml 文件内容
    const soulYamlPath = path.resolve(process.cwd(), 'autonomous', soulId, 'soul.yaml');
    const soulYamlContent = await fs.readFile(soulYamlPath, 'utf-8');

    // 3. 读取 Subagent 配置
    const subagentId = soulConfig.subagent;
    const subagentYamlPath = path.resolve(process.cwd(), 'subagents', subagentId, 'agent.yaml');

    let subagentYamlContent = null;
    let subagentFound = false;

    try {
      subagentYamlContent = await fs.readFile(subagentYamlPath, 'utf-8');
      subagentFound = true;
    } catch (error: any) {
      logger.warn(`Subagent config not found for ${subagentId}`, {
        subagentId,
        error: error.message
      });
    }

    // 4. 获取可用的原语列表（从 subagent 配置中解析）
    let availablePrimitives: string[] = [];
    if (subagentYamlContent) {
      // 简单解析获取 skills
      const skillsMatch = subagentYamlContent.match(/available_skills:\s*\n([\s\S]*?)(?=\n\s{0,2}[\w-]+:|$)/);
      if (skillsMatch) {
        const skillsText = skillsMatch[1];
        const skillMatches = skillsText.matchAll(/-\s*(\S+)/g);
        availablePrimitives = Array.from(skillMatches).map(m => m[1]);
      }
    }

    logger.info('Soul configuration fetched successfully', {
      soulId,
      subagentId,
      subagentFound
    });

    return {
      status: 200,
      body: {
        success: true,
        data: {
          soulId,
          soulConfig: {
            displayName: soulConfig.display_name,
            subagent: soulConfig.subagent,
            goal: soulConfig.goal,
            primitives: soulConfig.primitives,
            hibernation: soulConfig.hibernation
          },
          soulYaml: soulYamlContent,
          subagentConfig: subagentYamlContent ? {
            id: subagentId,
            yaml: subagentYamlContent,
            availablePrimitives
          } : null,
          subagentFound
        }
      }
    };

  } catch (error: any) {
    logger.error('Failed to fetch soul configuration', {
      soulId,
      error: error.message,
      stack: error.stack
    });

    return {
      status: 500,
      body: {
        success: false,
        error: error.message
      }
    };
  }
};
