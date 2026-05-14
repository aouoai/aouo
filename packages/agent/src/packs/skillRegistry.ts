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
  /** Bare skill name as it appears on disk (e.g., 'shadowing'). */
  name: string;
  /**
   * Pack-qualified canonical name (e.g., 'english:shadowing').
   *
   * MUST be used at every persistence / cross-pack boundary —
   * persisting bare names into `sessions.active_skill` causes
   * cross-pack resurrection when two packs ship a skill with the
   * same bare name (last-registered wins on bare lookup).
   */
  qualifiedName: string;
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

    const qualifiedName = `${pack}:${skillName}`;
    const skill: RegisteredSkill = {
      name: skillName,
      qualifiedName,
      pack,
      displayName: (data['display_name'] as string) || (data['name'] as string) || skillName,
      description: (data['description'] as string) || '',
      body: content.trim(),
      filePath,
      dirPath: skillDir,
      command: data['command'] === true,
    };

    // Store under both keys. Bare-name registration is best-effort — when
    // two packs ship a skill with the same bare name, the second wins on
    // bare lookup. Callers that need disambiguation MUST use the qualified
    // key (every persistence / cross-pack boundary inside this codebase
    // does so via `skill.qualifiedName`).
    skills.set(skillName, skill);
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
 * Returns all registered skills, one entry per (pack, skill).
 *
 * Iterates the qualified-name keys exclusively — iterating bare-name
 * keys would silently drop skills whose bare name collides across packs
 * (e.g., `notes:onboarding` and `create:onboarding`), leaving only the
 * last-registered owner. The qualified key is the unambiguous identity.
 */
export function getAllSkills(): RegisteredSkill[] {
  const result: RegisteredSkill[] = [];
  for (const [key, skill] of skills) {
    if (key.includes(':')) result.push(skill);
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
      // Print the qualified name so packs that ship a same-bare-name
      // skill (e.g., `notes:onboarding`, `create:onboarding`) remain
      // unambiguous from the model's perspective.
      lines.push(`- **${skill.displayName}** (\`${skill.qualifiedName}\`)${desc}`);
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
