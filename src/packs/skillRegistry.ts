/**
 * @module packs/skillRegistry
 * @description Pack-scoped skill registration and lookup.
 *
 * Skills are SKILL.md files provided by packs. This registry maps
 * qualified names to their file paths and builds the skill index
 * injected into the system prompt.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { logger } from '../lib/logger.js';

/**
 * A registered skill with metadata extracted from SKILL.md frontmatter.
 */
export interface RegisteredSkill {
  /** Qualified name (e.g., 'shadowing' or 'english:shadowing'). */
  name: string;
  /** The pack that owns this skill. */
  pack: string;
  /** Human-readable display name from frontmatter. */
  displayName: string;
  /** Short description from frontmatter. */
  description: string;
  /** The full SKILL.md body content (instructions). */
  body: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Absolute path to the skill directory. */
  dirPath: string;
  /** If true, this skill registers as a Telegram /command. */
  command?: boolean;
}

/** Internal registry mapping skill names to their definitions. */
const skills = new Map<string, RegisteredSkill>();

/**
 * Registers a skill from a pack's skill directory.
 *
 * Reads the SKILL.md file, extracts frontmatter metadata,
 * and stores the skill in the global registry.
 *
 * @param pack - The pack name owning this skill.
 * @param skillName - The skill directory name.
 * @param skillDir - Absolute path to the skill directory.
 * @returns True if registration succeeded.
 */
export function registerSkill(pack: string, skillName: string, skillDir: string): boolean {
  const filePath = join(skillDir, 'SKILL.md');

  if (!existsSync(filePath)) {
    logger.warn({ msg: 'skill_missing', pack, skill: skillName, path: filePath });
    return false;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);

    const skill: RegisteredSkill = {
      name: skillName,
      pack,
      displayName: (data['display_name'] as string) || (data['name'] as string) || skillName,
      description: (data['description'] as string) || '',
      body: content.trim(),
      filePath,
      dirPath: skillDir,
      command: data['command'] === true,
    };

    skills.set(skillName, skill);

    // Also register with pack-qualified name for disambiguation
    const qualifiedName = `${pack}:${skillName}`;
    skills.set(qualifiedName, skill);

    return true;
  } catch (err) {
    logger.error({ msg: 'skill_register_failed', pack, skill: skillName, error: (err as Error).message });
    return false;
  }
}

/**
 * Registers all skills declared by a pack.
 *
 * Scans the pack's `skills/` directory for subdirectories matching
 * the manifest's `provided_skills` list.
 *
 * @param pack - The pack name.
 * @param skillNames - Array of skill directory names.
 * @param packSourceDir - Absolute path to the pack's source root.
 * @returns Count of successfully registered skills.
 */
export function registerPackSkills(
  pack: string,
  skillNames: string[],
  packSourceDir: string,
): number {
  let count = 0;
  const skillsDir = join(packSourceDir, 'skills');

  for (const name of skillNames) {
    const skillDir = join(skillsDir, name);
    if (registerSkill(pack, name, skillDir)) {
      count++;
    }
  }

  logger.info({ msg: 'skills_registered', pack, count, total: skillNames.length });
  return count;
}

/**
 * Looks up a skill by name.
 *
 * Supports both simple names ('shadowing') and qualified names ('english:shadowing').
 *
 * @param name - The skill name to look up.
 * @returns The registered skill, or undefined if not found.
 */
export function getSkill(name: string): RegisteredSkill | undefined {
  return skills.get(name);
}

/**
 * Returns all registered skills.
 *
 * @returns Array of all registered skills (de-duplicated by simple name).
 */
export function getAllSkills(): RegisteredSkill[] {
  // De-duplicate: only return simple-name entries to avoid doubles
  const seen = new Set<string>();
  const result: RegisteredSkill[] = [];
  for (const [key, skill] of skills) {
    if (!key.includes(':') && !seen.has(skill.name)) {
      seen.add(skill.name);
      result.push(skill);
    }
  }
  return result;
}

/**
 * Builds the skill index string for the system prompt.
 *
 * Groups skills by pack and formats them as a markdown section
 * with name, description, and usage instructions.
 *
 * @returns Formatted skill index for system prompt injection.
 */
export function buildSkillIndex(): string {
  const allSkills = getAllSkills();
  if (allSkills.length === 0) return '';

  // Group by pack
  const byPack = new Map<string, RegisteredSkill[]>();
  for (const skill of allSkills) {
    const existing = byPack.get(skill.pack) || [];
    existing.push(skill);
    byPack.set(skill.pack, existing);
  }

  const lines: string[] = ['## Available Skills'];
  lines.push('');
  lines.push('Use `skill_view(name)` to load a skill before executing it.');
  lines.push('');

  for (const [pack, packSkills] of byPack) {
    lines.push(`### ${pack}`);
    lines.push('');
    for (const skill of packSkills) {
      const desc = skill.description ? ` — ${skill.description}` : '';
      lines.push(`- **${skill.displayName}** (\`${skill.name}\`)${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Clears all registered skills.
 *
 * Used during pack unloading or testing.
 */
export function clearSkills(): void {
  skills.clear();
}
