/**
 * Tests for Skill Discovery Module
 *
 * Verifies that skills are automatically discovered and loaded
 * from the /skills directory.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SkillDiscovery, getSkillDiscovery, discoverSkills } from '../../../src/core/agent/skill-discovery';
import { join } from 'path';

describe('SkillDiscovery', () => {
  let discovery: SkillDiscovery;

  beforeEach(() => {
    // Use the actual skills directory
    discovery = new SkillDiscovery(join(process.cwd(), 'skills'));
  });

  describe('discover()', () => {
    it('should discover all skills from the skills directory', async () => {
      const skills = await discovery.discover();

      // Should find at least the known skills
      expect(skills.length).toBeGreaterThanOrEqual(4);

      // Check for expected skills
      const skillNames = skills.map((s) => s.name);
      expect(skillNames).toContain('web-search');
      expect(skillNames).toContain('summarize');
      expect(skillNames).toContain('code-analysis');
      expect(skillNames).toContain('remotion-generator');
    });

    it('should parse skill metadata correctly', async () => {
      const skills = await discovery.discover();

      // Find web-search skill
      const webSearch = skills.find((s) => s.name === 'web-search');
      expect(webSearch).toBeDefined();
      expect(webSearch?.description).toBe('Search the web for information and return results');
      expect(webSearch?.tags).toContain('web');
      expect(webSearch?.tags).toContain('research');
      expect(webSearch?.tags).toContain('search');
    });

    it('should include skill type and version', async () => {
      const skills = await discovery.discover();

      // Check remotion-generator has type
      const remotion = skills.find((s) => s.name === 'remotion-generator');
      expect(remotion?.type).toBe('hybrid');
      expect(remotion?.version).toBe('1.0.0');
    });

    it('should handle missing skill.yaml gracefully', async () => {
      // Create a temporary discovery instance pointing to a non-existent directory
      const tempDiscovery = new SkillDiscovery('/non/existent/path');
      const skills = await tempDiscovery.discover();

      // Should return empty array instead of throwing
      expect(skills).toEqual([]);
    });
  });

  describe('getSkillsRegistry()', () => {
    it('should return skills in Agent-compatible format', async () => {
      await discovery.discover();
      const registry = discovery.getSkillsRegistry();

      // Check format
      registry.forEach((skill) => {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('description');
        expect(skill).toHaveProperty('tags');
        expect(Array.isArray(skill.tags)).toBe(true);
      });
    });

    it('should not include internal path property in registry', async () => {
      await discovery.discover();
      const registry = discovery.getSkillsRegistry();

      // Registry should not have 'path' property (only for internal use)
      registry.forEach((skill) => {
        expect(skill).not.toHaveProperty('path');
      });
    });
  });

  describe('getSkill()', () => {
    it('should retrieve a specific skill by name', async () => {
      await discovery.discover();
      const skill = discovery.getSkill('web-search');

      expect(skill).toBeDefined();
      expect(skill?.name).toBe('web-search');
      expect(skill?.description).toBeDefined();
    });

    it('should return undefined for non-existent skill', async () => {
      await discovery.discover();
      const skill = discovery.getSkill('non-existent-skill');

      expect(skill).toBeUndefined();
    });
  });

  describe('hasSkill()', () => {
    it('should return true for existing skills', async () => {
      await discovery.discover();
      expect(discovery.hasSkill('web-search')).toBe(true);
      expect(discovery.hasSkill('summarize')).toBe(true);
    });

    it('should return false for non-existent skills', async () => {
      await discovery.discover();
      expect(discovery.hasSkill('fake-skill')).toBe(false);
    });
  });

  describe('getSkillsByTag()', () => {
    it('should filter skills by tag', async () => {
      await discovery.discover();
      const webSkills = discovery.getSkillsByTag('web');

      expect(webSkills.length).toBeGreaterThan(0);
      webSkills.forEach((skill) => {
        expect(skill.tags).toContain('web');
      });
    });

    it('should return empty array for non-existent tag', async () => {
      await discovery.discover();
      const skills = discovery.getSkillsByTag('non-existent-tag');

      expect(skills).toEqual([]);
    });
  });

  describe('getStats()', () => {
    it('should return skill statistics', async () => {
      await discovery.discover();
      const stats = discovery.getStats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byTag).toBeDefined();
      expect(stats.byType).toBeDefined();

      // Check tag counts
      expect(Object.keys(stats.byTag).length).toBeGreaterThan(0);
    });

    it('should count skills by tag correctly', async () => {
      await discovery.discover();
      const stats = discovery.getStats();

      // Should have web tag count
      if (stats.byTag['web']) {
        expect(stats.byTag['web']).toBeGreaterThan(0);
      }
    });
  });

  describe('reload()', () => {
    it('should reload skills from disk', async () => {
      // Initial discovery
      await discovery.discover();
      const initialCount = discovery.getAllSkills().length;

      // Reload
      const reloaded = await discovery.reload();
      expect(reloaded.length).toBe(initialCount);
    });
  });

  describe('Singleton pattern', () => {
    it('should return the same instance from getSkillDiscovery()', () => {
      const instance1 = getSkillDiscovery();
      const instance2 = getSkillDiscovery();

      expect(instance1).toBe(instance2);
    });

    it('should allow custom skills directory', async () => {
      const customDiscovery = new SkillDiscovery(join(process.cwd(), 'skills'));
      const skills = await customDiscovery.discover();

      expect(skills.length).toBeGreaterThan(0);
    });
  });

  describe('discoverSkills() convenience function', () => {
    it('should discover skills using singleton instance', async () => {
      const skills = await discoverSkills();

      expect(skills.length).toBeGreaterThan(0);
      expect(skills[0]).toHaveProperty('name');
      expect(skills[0]).toHaveProperty('description');
    });
  });

  describe('Integration with Agent', () => {
    it('should provide skills in format compatible with PTCGenerator', async () => {
      await discovery.discover();
      const registry = discovery.getSkillsRegistry();

      // Check that the format matches what PTCGenerator expects
      registry.forEach((skill) => {
        expect(typeof skill.name).toBe('string');
        expect(typeof skill.description).toBe('string');
        expect(Array.isArray(skill.tags)).toBe(true);
        expect(skill.tags.every((tag) => typeof tag === 'string')).toBe(true);
      });
    });
  });
});
