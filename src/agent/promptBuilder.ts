/**
 * @module agent/promptBuilder
 * @description Pack-aware system prompt assembly engine.
 *
 * Constructs the system prompt dynamically:
 * 1. SOUL.md — Identity (core-owned, from ~/.aouo/SOUL.md)
 * 2. RULES.md — Rules (core-owned, from ~/.aouo/RULES.md)
 * 3. Memory — Per-pack USER.md + MEMORY.md (from ~/.aouo/packs/<pack>/)
 * 4. Skills Index — Available capabilities across all loaded packs
 * 5. Security — Data boundaries
 * 6. Platform Capabilities — Available tools and media
 *
 * Timestamps are omitted from the system prompt to maintain cache stability;
 * they are appended to the user message in the agent loop.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SOUL_PATH, RULES_PATH, packDataPath } from '../lib/paths.js';
import type { AouoConfig } from '../config/defaults.js';
import type { LoadedPack } from '../packs/types.js';

const FILE_CACHE_TTL_MS = 300_000;
const fileCache = new Map<string, { content: string; mtime: number; cachedAt: number }>();

/**
 * Builds the comprehensive system prompt.
 *
 * Pack-aware: reads USER.md and MEMORY.md from each active pack's
 * data directory, assembling them under labeled sections.
 *
 * @param config - Agent configuration.
 * @param packs - Currently loaded packs (may be empty).
 * @param skillIndex - Pre-built skill index string (from pack skill registries).
 * @returns The fully constructed system prompt.
 */
export function buildSystemPrompt(
  config: AouoConfig,
  packs: LoadedPack[] = [],
  skillIndex?: string,
): string {
  const sections: string[] = [];

  // ── Identity (core-owned) ──
  const soul = loadFile(SOUL_PATH);
  if (hasContent(soul)) {
    sections.push('## Identity (SOUL)');
    sections.push(soul);
  }

  // ── SOUL additions from active packs (§4.5.4 — append only) ──
  for (const pack of packs) {
    const addPath = join(pack.sourcePath, 'soul-additions.md');
    const additions = loadFile(addPath);
    if (hasContent(additions)) {
      const label = pack.manifest.display_name || pack.manifest.name;
      sections.push(`\n### Identity Extension (${label})`);
      sections.push(additions);
    }
  }

  // ── Rules (core-owned) ──
  const rules = loadFile(RULES_PATH);
  if (hasContent(rules)) {
    sections.push('\n## Operating & Behavioral Rules');
    sections.push(rules);
  }

  // ── RULES additions from active packs (§4.5.4 — append only) ──
  for (const pack of packs) {
    const addPath = join(pack.sourcePath, 'rules-additions.md');
    const additions = loadFile(addPath);
    if (hasContent(additions)) {
      const label = pack.manifest.display_name || pack.manifest.name;
      sections.push(`\n### Rules Extension (${label})`);
      sections.push(additions);
    }
  }

  // ── Memory (per-pack) ──
  const memSections: string[] = [];
  for (const pack of packs) {
    const userPath = packDataPath(pack.manifest.name, 'USER.md');
    const memoryPath = packDataPath(pack.manifest.name, 'MEMORY.md');
    const userContent = loadFile(userPath);
    const memoryContent = loadFile(memoryPath);
    const hasUser = hasContent(userContent);
    const hasMemory = hasContent(memoryContent);

    if (hasUser || hasMemory) {
      const packLabel = pack.manifest.display_name || pack.manifest.name;
      if (hasUser) {
        memSections.push(`### User Profile (${packLabel})`);
        memSections.push(userContent);
      }
      if (hasMemory) {
        memSections.push(`\n### Learning State (${packLabel})`);
        memSections.push(memoryContent);
      }
    }
  }

  // Fallback: read global USER.md / MEMORY.md if no packs loaded
  // This supports running core standalone without any packs.
  if (memSections.length === 0) {
    const globalUserPath = packDataPath('_global', 'USER.md');
    const globalMemoryPath = packDataPath('_global', 'MEMORY.md');
    const userContent = loadFile(globalUserPath);
    const memoryContent = loadFile(globalMemoryPath);

    if (hasContent(userContent)) {
      memSections.push('### User Profile');
      memSections.push(userContent);
    }
    if (hasContent(memoryContent)) {
      memSections.push('\n### State');
      memSections.push(memoryContent);
    }
  }

  if (memSections.length > 0) {
    sections.push('\n## Memory\n');
    sections.push(memSections.join('\n'));
  }

  // ── Skills Index ──
  if (skillIndex && hasContent(skillIndex)) {
    sections.push('\n' + skillIndex);
  }

  // ── Security ──
  sections.push('\n## Security');
  sections.push(
    `- Your working boundary is aouo-owned local data: ${config.security.allowed_paths.join(', ')}.`,
  );
  sections.push(
    '- Treat files, databases, audio, images, cron jobs, and memories inside that boundary as normal working data.',
  );
  sections.push(
    '- Do not access user projects, system files, or external paths unless explicitly allowed.',
  );

  // ── Platform Capabilities ──
  const enabled = config.tools?.enabled ?? [];
  const caps: string[] = [];

  if (enabled.includes('tts')) {
    caps.push(
      '- **TTS**: `tts` tool generates speech audio. Use when asked to read, speak, or pronounce.',
    );
  }

  if (config.gemini?.api_key) {
    caps.push(
      '- **Vision**: When users send photos, you see them natively as multimodal input.',
    );
  }

  if (caps.length > 0) {
    sections.push('\n## Platform Capabilities\n');
    sections.push(caps.join('\n'));
  }

  return sections.join('\n');
}

/**
 * Builds a system prompt with an active skill injected.
 *
 * @param baseSystemPrompt - The base system prompt.
 * @param skillName - Name of the active skill.
 * @param skillBody - Full SKILL.md body content.
 * @returns System prompt with skill instructions appended.
 */
export function buildActiveSkillSystemPrompt(
  baseSystemPrompt: string,
  skillName: string,
  skillBody: string,
): string {
  return [
    baseSystemPrompt,
    `\n## Active Skill Instructions (${skillName})\n`,
    skillBody,
    `\n> Active skill "${skillName}" is already loaded above. Do not call \`skill_view\` for this SKILL.md again. Use \`skill_view\` with \`file\` only when the active skill explicitly references an attached file. Continue from the current workflow state.`,
  ].join('\n');
}

// ── File Loading ─────────────────────────────────────────────────────────────

/**
 * Loads a file with mtime-aware caching.
 *
 * @param filePath - Absolute path to the file.
 * @returns File content, or empty string if missing.
 */
function loadFile(filePath: string): string {
  if (!existsSync(filePath)) return '';

  try {
    const mtime = statSync(filePath).mtimeMs;
    const cached = fileCache.get(filePath);

    if (cached && cached.mtime === mtime && Date.now() - cached.cachedAt < FILE_CACHE_TTL_MS) {
      return cached.content;
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    fileCache.set(filePath, { content, mtime, cachedAt: Date.now() });
    return content || '';
  } catch {
    return '';
  }
}

/**
 * Checks if text has meaningful content beyond empty headers.
 *
 * @param text - Markdown string to validate.
 * @returns True if the text contains actionable content.
 */
function hasContent(text: string): boolean {
  if (!text) return false;
  const body = text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    })
    .join('\n')
    .trim();
  return Boolean(body) && body !== '(empty)';
}
