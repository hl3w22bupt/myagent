/**
 * Developer-Engineer Subagent Test
 *
 * Tests the developer-engineer subagent functionality
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

describe('Developer-Engineer Subagent', () => {
  const subagentName = 'developer-engineer';
  const subagentDir = resolve(process.cwd(), 'subagents', subagentName);
  const configPath = resolve(subagentDir, 'agent.yaml');

  describe('Configuration', () => {
    it('should have agent.yaml file', () => {
      expect(existsSync(configPath)).toBe(true);
    });

    it('should have valid YAML structure', () => {
      const content = readFileSync(configPath, 'utf-8');

      // Check required fields
      expect(content).toContain('name:');
      expect(content).toContain('description:');
      expect(content).toContain('agent:');
      expect(content).toContain('system_prompt:');
      expect(content).toContain('available_skills:');
    });

    it('should have all required skills', () => {
      const content = readFileSync(configPath, 'utf-8');

      // Check for required skills
      expect(content).toContain('tool-read');
      expect(content).toContain('tool-write');
      expect(content).toContain('tool-edit');
      expect(content).toContain('tool-grep');
      expect(content).toContain('tool-glob');
      expect(content).toContain('tool-bash');
    });
  });

  describe('System Prompt', () => {
    it('should contain workflow instructions', () => {
      const content = readFileSync(configPath, 'utf-8');

      expect(content).toContain('Understand Requirements');
      expect(content).toContain('Explore Codebase');
      expect(content).toContain('Implement Feature');
      expect(content).toContain('Verify Functionality');
      expect(content).toContain('Commit Changes');
    });

    it('should mention Conventional Commits', () => {
      const content = readFileSync(configPath, 'utf-8');

      expect(content).toContain('Conventional Commits');
      expect(content).toContain('feat:');
      expect(content).toContain('fix:');
      expect(content).toContain('refactor:');
    });
  });

  describe('Auto-Discovery', () => {
    it('should be discoverable by MasterAgent', () => {
      // Simulate MasterAgent's discoverSubagents logic
      const subagentsDir = resolve(process.cwd(), 'subagents');
      const exists = existsSync(subagentDir);
      expect(exists).toBe(true);

      const configExists = existsSync(resolve(subagentsDir, subagentName, 'agent.yaml'));
      expect(configExists).toBe(true);
    });
  });
});
