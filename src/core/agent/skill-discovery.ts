/**
 * Skill Discovery and Auto-Loading Module.
 *
 * Automatically discovers skills from multiple sources:
 * 1. Motia native skills (/skills directory with skill.yaml)
 * 2. Claude Skills (/claude_skills directory with SKILL.md)
 *
 * Uses unified skill-loader for consistent discovery across API and Agent layers.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadAllSkills } from '../skill/skill-loader.js';

/**
 * Skill metadata extracted from skill.yaml
 */
export interface SkillMetadata {
  name: string;
  description: string;
  tags: string[];
  version?: string;
  type?: string;
  path: string; // Path to skill directory
  metadata?: Record<string, any>; // Full YAML data including input_schema, output_schema, etc.
}

/**
 * Simple YAML parser (minimal implementation)
 * Parses skill.yaml files to extract metadata
 */
class SimpleYAMLParser {
  /**
   * Parse a simple YAML file into an object
   * Handles basic key-value pairs and arrays
   */
  static parse(yamlContent: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yamlContent.split('\n');
    let currentKey = '';
    let currentValue: any = null;
    let inMultiline = false;
    let multilineLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = line.search(/\S/);

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        if (inMultiline && trimmed === '') {
          multilineLines.push('');
        }
        continue;
      }

      // Check for top-level key-value pair
      const keyValueMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);

      if (keyValueMatch && indent === 0) {
        // Save previous key if exists
        if (currentKey) {
          result[currentKey] = this.parseValue(currentValue);
        }

        currentKey = keyValueMatch[1];
        const valueStr = keyValueMatch[2];

        // Check for array start (inline)
        if (valueStr.startsWith('[')) {
          currentValue = valueStr;
          inMultiline = false;
        }
        // Check for multiline value start
        else if (valueStr.startsWith('|') || valueStr.startsWith('>')) {
          inMultiline = true;
          multilineLines = [];
          currentValue = '';
        }
        // Empty value (nested object follows)
        else if (!valueStr) {
          currentValue = null;
          inMultiline = false;
        }
        // String value with quotes
        else if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
          currentValue = valueStr.slice(1, -1);
          inMultiline = false;
        }
        // Number
        else if (!isNaN(Number(valueStr))) {
          currentValue = Number(valueStr);
          inMultiline = false;
        }
        // Boolean
        else if (valueStr === 'true' || valueStr === 'false') {
          currentValue = valueStr === 'true';
          inMultiline = false;
        }
        // Plain string
        else {
          currentValue = valueStr;
          inMultiline = false;
        }
      }
      // Handle nested properties with indentation
      else if (indent > 0 && currentKey) {
        // We're in a nested section, skip these for now
        // We only care about top-level metadata
        continue;
      }
      // Handle array continuation
      else if (currentValue && typeof currentValue === 'string' && currentValue.startsWith('[')) {
        currentValue += '\n' + trimmed;
        // Check if array is complete
        if (trimmed.includes(']')) {
          result[currentKey] = this.parseValue(currentValue);
          currentKey = '';
          currentValue = null;
        }
      }
      // Handle multiline value content
      else if (inMultiline) {
        if (trimmed.startsWith('|') || trimmed.startsWith('>')) {
          // Another multiline marker, skip
          continue;
        } else {
          multilineLines.push(trimmed);
          currentValue = multilineLines.join('\n');
        }
      }
    }

    // Save last key
    if (currentKey) {
      result[currentKey] = this.parseValue(currentValue);
    }

    return result;
  }

  /**
   * Parse a value string into appropriate type
   */
  private static parseValue(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    // Array
    if (value.startsWith('[')) {
      const arrayContent = value.slice(1, -1);
      if (!arrayContent.trim()) {
        return [];
      }
      // Parse array items (comma-separated, handle quotes)
      const items: string[] = [];
      let currentItem = '';
      let inQuotes = false;
      let quoteChar = '';

      for (let i = 0; i < arrayContent.length; i++) {
        const char = arrayContent[i];

        if ((char === '"' || char === "'") && !inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false;
        } else if (char === ',' && !inQuotes) {
          if (currentItem.trim()) {
            items.push(currentItem.trim().replace(/^["']|["']$/g, ''));
          }
          currentItem = '';
        } else {
          currentItem += char;
        }
      }

      if (currentItem.trim()) {
        items.push(currentItem.trim().replace(/^["']|["']$/g, ''));
      }

      return items;
    }

    return value;
  }
}

/**
 * Skill Discovery Service
 *
 * Scans the /skills directory and builds a dynamic registry
 * of available skills from their skill.yaml metadata files.
 */
export class SkillDiscovery {
  private skills: Map<string, SkillMetadata> = new Map();
  private skillsDir: string;

  constructor(skillsDir?: string) {
    // Default to skills/ directory in current working directory
    this.skillsDir = skillsDir || join(process.cwd(), 'skills');
  }

  /**
   * Discover all skills from all sources.
   *
   * Uses unified skill-loader to load both:
   * - Motia native skills (/skills directory with skill.yaml)
   * - Claude Skills (/claude_skills directory with SKILL.md)
   */
  async discover(): Promise<SkillMetadata[]> {
    this.skills.clear();

    try {
      // Use unified skill-loader to discover all skills
      const unifiedSkills = loadAllSkills();

      // Convert UnifiedSkillMetadata to SkillMetadata
      for (const unified of unifiedSkills) {
        const skillMetadata: SkillMetadata = {
          name: unified.name,
          description: unified.description,
          tags: unified.tags,
          version: unified.version,
          type: unified.type,
          path: unified.path || '',
          metadata: unified.metadata,
        };

        this.skills.set(unified.name, skillMetadata);
      }

      console.log(`[SkillDiscovery] Discovered ${this.skills.size} skills from all sources`);

      // Log breakdown by source
      const nativeCount = unifiedSkills.filter(s => s.source === 'native').length;
      const claudeCount = unifiedSkills.filter(s => s.source === 'claude').length;
      console.log(`[SkillDiscovery]   - ${nativeCount} native skills`);
      console.log(`[SkillDiscovery]   - ${claudeCount} Claude Skills`);

      return Array.from(this.skills.values());
    } catch (error) {
      console.error('[SkillDiscovery] Failed to discover skills:', error);
      return [];
    }
  }

  /**
   * Load a single skill from its directory.
   *
   * @param skillName - Name of the skill directory
   */
  private async loadSkill(skillName: string): Promise<void> {
    const skillPath = join(this.skillsDir, skillName);
    const yamlPath = join(skillPath, 'skill.yaml');

    try {
      // Read skill.yaml file
      const yamlContent = readFileSync(yamlPath, 'utf-8');
      const parsed = SimpleYAMLParser.parse(yamlContent);

      // Extract metadata
      const metadata: SkillMetadata = {
        name: parsed.name || skillName,
        description: parsed.description || `Skill: ${skillName}`,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        version: parsed.version,
        type: parsed.type,
        path: skillPath,
        metadata: parsed, // Store full YAML data including input_schema, output_schema, etc.
      };

      // Validate required fields
      if (!metadata.name) {
        console.warn(`[SkillDiscovery] Skill missing name in ${yamlPath}`);
        return;
      }

      // Register skill
      this.skills.set(metadata.name, metadata);
      console.log(
        `[SkillDiscovery] Loaded skill: ${metadata.name} (${metadata.tags.join(', ')})`
      );
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // No skill.yaml file, skip this directory
        console.debug(`[SkillDiscovery] No skill.yaml found in ${skillPath}, skipping`);
      } else {
        console.warn(`[SkillDiscovery] Failed to load skill ${skillName}:`, error.message);
      }
    }
  }

  /**
   * Get all discovered skills.
   */
  getAllSkills(): SkillMetadata[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a specific skill by name.
   */
  getSkill(name: string): SkillMetadata | undefined {
    return this.skills.get(name);
  }

  /**
   * Get skill names as an array (for backward compatibility).
   */
  getSkillNames(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Get skills in the format expected by Agent (with metadata for PTC).
   */
  getSkillsRegistry(): Array<{ name: string; description: string; tags: string[]; metadata?: SkillMetadata['metadata'] }> {
    return Array.from(this.skills.values()).map((skill) => ({
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      metadata: skill.metadata,
    }));
  }

  /**
   * Check if a skill exists.
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Reload all skills (useful for hot-reload in development).
   */
  async reload(): Promise<SkillMetadata[]> {
    return this.discover();
  }

  /**
   * Get skills filtered by tag.
   */
  getSkillsByTag(tag: string): SkillMetadata[] {
    return Array.from(this.skills.values()).filter((skill) => skill.tags.includes(tag));
  }

  /**
   * Get skill statistics.
   */
  getStats(): {
    total: number;
    byTag: Record<string, number>;
    byType: Record<string, number>;
  } {
    const byTag: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const skill of this.skills.values()) {
      // Count by tag
      for (const tag of skill.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      // Count by type
      if (skill.type) {
        byType[skill.type] = (byType[skill.type] || 0) + 1;
      }
    }

    return {
      total: this.skills.size,
      byTag,
      byType,
    };
  }
}

/**
 * Singleton instance for use across the application
 */
let skillDiscoveryInstance: SkillDiscovery | null = null;

/**
 * Get or create the singleton SkillDiscovery instance.
 */
export function getSkillDiscovery(skillsDir?: string): SkillDiscovery {
  if (!skillDiscoveryInstance) {
    skillDiscoveryInstance = new SkillDiscovery(skillsDir);
  }
  return skillDiscoveryInstance;
}

/**
 * Discover skills asynchronously (convenience function).
 */
export async function discoverSkills(
  skillsDir?: string
): Promise<SkillMetadata[]> {
  const discovery = getSkillDiscovery(skillsDir);
  return await discovery.discover();
}
