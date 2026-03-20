/**
 * Unit tests for SubagentConfigLoader
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SubagentConfigLoader } from '@/core/config/subagent-config-loader';

describe('SubagentConfigLoader', () => {
  let loader: SubagentConfigLoader;

  beforeEach(() => {
    loader = new SubagentConfigLoader();
  });

  afterEach(() => {
    loader.clearCache();
  });

  describe('loadSubagentConfig', () => {
    it('should load emotional-girlfriend-lively subagent configuration', async () => {
      const config = await loader.loadSubagentConfig('emotional-girlfriend-lively');

      expect(config).toBeDefined();
      expect(config.name).toBe('emotional-girlfriend-lively');
      expect(config.description).toContain('活泼可爱');
      expect(config.agent).toBeDefined();
      expect(config.agent.system_prompt).toBeDefined();
      expect(config.agent.system_prompt).toContain('小糖');
    });

    it('should cache loaded configuration', async () => {
      const config1 = await loader.loadSubagentConfig('emotional-girlfriend-lively');
      const config2 = await loader.loadSubagentConfig('emotional-girlfriend-lively');

      expect(config1).toBe(config2); // Same reference (cached)
    });

    it('should throw error for non-existent subagent', async () => {
      await expect(loader.loadSubagentConfig('non-existent-subagent'))
        .rejects
        .toThrow('Subagent configuration not found');
    });
  });

  describe('validation', () => {
    it('should have name or system_prompt', async () => {
      const config = await loader.loadSubagentConfig('emotional-girlfriend-lively');
      expect(config.name || config.agent?.system_prompt).toBeDefined();
    });

    it('should have system_prompt in agent section', async () => {
      const config = await loader.loadSubagentConfig('emotional-girlfriend-lively');
      expect(config.agent?.system_prompt).toBeDefined();
      expect(typeof config.agent.system_prompt).toBe('string');
    });

    it('should have valid available_skills array', async () => {
      const config = await loader.loadSubagentConfig('emotional-girlfriend-lively');
      const skills = config.available_skills || config.agent?.available_skills;

      if (skills) {
        expect(Array.isArray(skills)).toBe(true);
      }
    });
  });

  describe('listAvailableSubagents', () => {
    it('should list available subagents', async () => {
      const subagents = await loader.listAvailableSubagents();

      expect(Array.isArray(subagents)).toBe(true);
      expect(subagents).toContain('emotional-girlfriend-lively');
    });

    it('should return sorted list', async () => {
      const subagents = await loader.listAvailableSubagents();

      // Check if array is sorted
      const sorted = [...subagents].sort();
      expect(subagents).toEqual(sorted);
    });
  });

  describe('cache management', () => {
    it('should clear specific cache entry', async () => {
      await loader.loadSubagentConfig('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeDefined();

      loader.clearCache('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeUndefined();
    });

    it('should clear all cache', async () => {
      await loader.loadSubagentConfig('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeDefined();

      loader.clearCache();
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeUndefined();
    });
  });
});
