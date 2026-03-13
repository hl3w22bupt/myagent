/**
 * Unified Skill Loader
 *
 * Provides centralized skill discovery logic for:
 * - TypeScript Agent layer (SkillDiscovery)
 * - API layer (skills-api)
 *
 * Loads skills from multiple sources:
 * 1. myagent native skills (/skills directory with skill.yaml)
 * 2. Claude Skills (/claude_skills directory with SKILL.md)
 * 3. OpenClaw Skills (/openclaw_skills directory with SKILL.md)
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

/**
 * Unified skill metadata format.
 */
export interface UnifiedSkillMetadata {
  name: string;
  version: string;
  description: string;
  tags: string[];
  type: string;
  source: 'native' | 'claude';
  path?: string; // Optional: for internal use
  metadata?: Record<string, any>; // Optional: full YAML data
}

/**
 * Load skill metadata from skill.yaml files (myagent native skills).
 *
 * Scans the /skills directory for subdirectories containing skill.yaml files.
 */
export function loadNativeSkills(): UnifiedSkillMetadata[] {
  const skillsDir = join(process.cwd(), 'skills');

  if (!existsSync(skillsDir)) {
    console.warn('[SkillLoader] /skills directory not found');
    return [];
  }

  const skills: UnifiedSkillMetadata[] = [];

  try {
    const skillFolders = readdirSync(skillsDir, { withFileTypes: true });

    for (const folder of skillFolders) {
      if (folder.isDirectory()) {
        const skillYamlPath = join(skillsDir, folder.name, 'skill.yaml');

        if (existsSync(skillYamlPath)) {
          try {
            const content = readFileSync(skillYamlPath, 'utf-8');
            const skillConfig: any = yaml.load(content);

            skills.push({
              name: skillConfig.name || folder.name,
              version: skillConfig.version || '1.0.0',
              description: skillConfig.description || '',
              tags: skillConfig.tags || [],
              type: skillConfig.type || 'unknown',
              source: 'native',
              path: join(skillsDir, folder.name),
              metadata: skillConfig, // Keep full YAML data
            });
          } catch (error) {
            console.warn(`[SkillLoader] Failed to load skill.yaml for ${folder.name}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('[SkillLoader] Error reading /skills directory:', error);
  }

  return skills;
}

/**
 * Load Claude Skills from claude_skills directory.
 *
 * Scans the /claude_skills directory for subdirectories containing SKILL.md files.
 * Extracts metadata from YAML frontmatter in SKILL.md.
 */
export function loadClaudeSkills(): UnifiedSkillMetadata[] {
  const claudeSkillsDir = join(process.cwd(), 'claude_skills');

  if (!existsSync(claudeSkillsDir)) {
    console.warn('[SkillLoader] /claude_skills directory not found');
    return [];
  }

  const skills: UnifiedSkillMetadata[] = [];

  try {
    const skillFolders = readdirSync(claudeSkillsDir, { withFileTypes: true });

    for (const folder of skillFolders) {
      if (folder.isDirectory()) {
        const skillMdPath = join(claudeSkillsDir, folder.name, 'SKILL.md');

        if (existsSync(skillMdPath)) {
          try {
            const content = readFileSync(skillMdPath, 'utf-8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

            if (frontmatterMatch) {
              const frontmatterText = frontmatterMatch[1];
              const frontmatter: any = yaml.load(frontmatterText);

              // Determine if skill has scripts
              const hasScript = existsSync(join(claudeSkillsDir, folder.name, 'main.py')) ||
                               existsSync(join(claudeSkillsDir, folder.name, `${folder.name}.py`));

              skills.push({
                name: frontmatter.name || folder.name,
                version: '1.0.0',
                description: frontmatter.description || '',
                tags: [
                  ...(frontmatter.tags || []),
                  'claude-skill',
                  'adapted'
                ],
                type: hasScript ? 'hybrid' : 'pure-prompt',
                source: 'claude',
                path: join(claudeSkillsDir, folder.name),
                metadata: frontmatter, // Keep full frontmatter data
              });
            }
          } catch (error) {
            console.warn(`[SkillLoader] Failed to load SKILL.md for ${folder.name}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('[SkillLoader] Error reading /claude_skills directory:', error);
  }

  return skills;
}

/**
 * Load OpenClaw Skills from openclaw_skills directory.
 *
 * Scans the /openclaw_skills directory for subdirectories containing SKILL.md files.
 * Extracts metadata from YAML frontmatter in SKILL.md.
 * Detects skill type: pure-prompt, hybrid (with scripts/), command-dispatch
 */
export function loadOpenClawSkills(): UnifiedSkillMetadata[] {
  const openclawSkillsDir = join(process.cwd(), 'openclaw_skills');

  if (!existsSync(openclawSkillsDir)) {
    console.warn('[SkillLoader] /openclaw_skills directory not found');
    return [];
  }

  const skills: UnifiedSkillMetadata[] = [];

  try {
    const skillFolders = readdirSync(openclawSkillsDir, { withFileTypes: true });

    for (const folder of skillFolders) {
      if (folder.isDirectory()) {
        const skillMdPath = join(openclawSkillsDir, folder.name, 'SKILL.md');

        if (existsSync(skillMdPath)) {
          try {
            const content = readFileSync(skillMdPath, 'utf-8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

            if (frontmatterMatch) {
              const frontmatterText = frontmatterMatch[1];
              const frontmatter: any = yaml.load(frontmatterText);

              // Determine skill type based on OpenClaw frontmatter
              let skillType = 'pure-prompt'; // Default
              if (frontmatter['command-dispatch'] === 'tool') {
                skillType = 'command-dispatch';
              }

              // Check for scripts/ directory (hybrid type)
              const hasScriptsDir = existsSync(join(openclawSkillsDir, folder.name, 'scripts'));

              if (hasScriptsDir && skillType !== 'command-dispatch') {
                skillType = 'hybrid';
              }

              skills.push({
                name: frontmatter.name || folder.name,
                version: '1.0.0',
                description: frontmatter.description || '',
                tags: [
                  ...(frontmatter.tags || []),
                  'openclaw-skill',
                  'adapted'
                ],
                type: skillType,
                source: 'claude', // OpenClaw skills use 'claude' source
                path: join(openclawSkillsDir, folder.name),
                metadata: frontmatter, // Keep full frontmatter data
              });
            }
          } catch (error) {
            console.warn(`[SkillLoader] Failed to load SKILL.md for ${folder.name}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('[SkillLoader] Error reading /openclaw_skills directory:', error);
  }

  return skills;
}

/**
 * Load all skills from all sources.
 *
 * Returns myagent native skills, Claude Skills, and OpenClaw Skills in a unified format.
 */
export function loadAllSkills(): UnifiedSkillMetadata[] {
  const nativeSkills = loadNativeSkills();
  const claudeSkills = loadClaudeSkills();
  const openclawSkills = loadOpenClawSkills();

  console.log(`[SkillLoader] Loaded ${nativeSkills.length} native skills, ${claudeSkills.length} Claude Skills, and ${openclawSkills.length} OpenClaw Skills`);

  return [...nativeSkills, ...claudeSkills, ...openclawSkills];
}

/**
 * Filter skills by tags.
 *
 * @param skills - Array of skills to filter
 * @param tags - Comma-separated tags to filter by
 * @returns Filtered array of skills
 */
export function filterByTags(skills: UnifiedSkillMetadata[], tags: string): UnifiedSkillMetadata[] {
  const tagList = tags.split(',').map((t) => t.trim().toLowerCase());
  return skills.filter((skill) =>
    skill.tags.some((tag) => tagList.includes(tag.toLowerCase()))
  );
}

/**
 * Filter skills by source.
 *
 * @param skills - Array of skills to filter
 * @param source - Source type ('native' or 'claude')
 * @returns Filtered array of skills
 */
export function filterBySource(skills: UnifiedSkillMetadata[], source: 'native' | 'claude'): UnifiedSkillMetadata[] {
  return skills.filter((skill) => skill.source === source);
}
