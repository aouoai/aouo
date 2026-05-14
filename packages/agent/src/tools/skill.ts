/**
 * @module tools/skill
 * @description Skill inspection interface for the LLM agent.
 *
 * Allows the agent to view a skill's SKILL.md content before executing
 * it, or to read attached files referenced within the skill instructions.
 */

import { register } from './registry.js';
import { getSkill, getAllSkills } from '../packs/skillRegistry.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ToolContext } from '../agent/types.js';

/**
 * Lists non-SKILL.md files in a skill directory.
 */
function listSkillFiles(skillDir: string): string[] {
  if (!existsSync(skillDir)) return [];
  try {
    const entries: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'SKILL.md') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          entries.push(relative(skillDir, full));
        }
      }
    }
    walk(skillDir);
    return entries;
  } catch {
    return [];
  }
}

register({
  name: 'skill_view',
  description: 'View a skill\'s full SKILL.md content (Level 1) or an attached file (Level 2). Use this before executing a skill\'s procedure.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Skill name to view',
      },
      file: {
        type: 'string',
        description: 'Optional: relative path to an attached file (Level 2). Omit to view SKILL.md (Level 1).',
      },
    },
    required: ['name'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const name = String(args.name).trim();
    const file = args.file ? String(args.file) : undefined;

    // Prefer the pack-scoped lookup when the agent has a bound activePack
    // and the caller passed a bare name. Without this, `skill_view('onboarding')`
    // in a notes-bound turn would resolve to whichever pack registered an
    // `onboarding` skill last — the very cross-pack drift we are fixing.
    const lookup = (n: string): ReturnType<typeof getSkill> => {
      const pack = context.pack;
      if (pack && !n.includes(':')) {
        return getSkill(`${pack}:${n}`) ?? getSkill(n);
      }
      return getSkill(n);
    };

    if (!file) {
      const skill = lookup(name);
      if (!skill) {
        const all = getAllSkills();
        if (all.length === 0) return `Error: Skill "${name}" not found. No skills are installed.`;
        const names = all.map(s => s.qualifiedName).join(', ');
        return `Error: Skill "${name}" not found. Available skills: ${names}`;
      }

      const files = listSkillFiles(skill.dirPath);
      let result = skill.body;
      if (files.length > 0) {
        result += '\n\n---\nAttached files: ' + files.join(', ');
        result += '\nUse skill_view with file parameter to read them.';
      }
      return result;
    }

    // Level 2: read an attached file
    const skill = lookup(name);
    if (!skill) return `Error: Skill "${name}" not found.`;

    const filePath = join(skill.dirPath, file);
    if (!existsSync(filePath)) {
      const files = listSkillFiles(skill.dirPath);
      if (files.length === 0) return `Error: Skill "${name}" has no attached files.`;
      return `Error: File "${file}" not found in skill "${name}". Available files: ${files.join(', ')}`;
    }

    try {
      return readFileSync(filePath, 'utf-8');
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`;
    }
  },
});
