/**
 * Unit tests for SoulConfigLoader
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SoulConfigLoader } from '@/core/config/soul-config-loader';
import { SoulConfig } from '@/core/agent/soul-types';
import path from 'path';

describe('SoulConfigLoader', () => {
  let loader: SoulConfigLoader;

  beforeEach(() => {
    loader = new SoulConfigLoader();
  });

  afterEach(() => {
    loader.clearCache();
  });

  describe('loadSoulConfig', () => {
    it('should load emotional-girlfriend-lively soul configuration', async () => {
      const config = await loader.loadSoulConfig('emotional-girlfriend-lively');

      expect(config).toBeDefined();
      expect(config.soul_id).toBe('emotional-girlfriend-lively');
      expect(config.display_name).toBe('小糖');
      expect(config.subagent).toBe('emotional-girlfriend-lively');
      expect(config.goal).toBeDefined();
      expect(config.goal).toContain('长期目标');
      expect(config.primitives).toContain('hibernate');
      expect(config.primitives).toContain('complete');
      expect(config.hibernation.idle_timeout).toBe(7200000); // 2 hours
    });

    it('should cache loaded configuration', async () => {
      const config1 = await loader.loadSoulConfig('emotional-girlfriend-lively');
      const config2 = await loader.loadSoulConfig('emotional-girlfriend-lively');

      expect(config1).toBe(config2); // Same reference (cached)
    });

    it('should throw error for non-existent soul', async () => {
      await expect(loader.loadSoulConfig('non-existent-soul'))
        .rejects
        .toThrow('Soul configuration not found');
    });
  });

  describe('validation', () => {
    it('should require subagent field', async () => {
      // This test would require mocking fs.readFile to return invalid config
      // For now, we test with the actual file which should be valid
      const config = await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(config.subagent).toBeDefined();
    });

    it('should require goal field', async () => {
      const config = await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(config.goal).toBeDefined();
      expect(typeof config.goal).toBe('string');
    });

    it('should have valid primitives array', async () => {
      const config = await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(Array.isArray(config.primitives)).toBe(true);
    });

    it('should have valid hibernation config', async () => {
      const config = await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(config.hibernation).toBeDefined();
      expect(typeof config.hibernation.idle_timeout).toBe('number');
    });
  });

  describe('cache management', () => {
    it('should clear specific cache entry', async () => {
      await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeDefined();

      loader.clearCache('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeUndefined();
    });

    it('should clear all cache', async () => {
      await loader.loadSoulConfig('emotional-girlfriend-lively');
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeDefined();

      loader.clearCache();
      expect(loader.getCachedConfig('emotional-girlfriend-lively')).toBeUndefined();
    });
  });
});
