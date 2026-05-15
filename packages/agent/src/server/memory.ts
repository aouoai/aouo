/**
 * @module server/memory
 * @description Pack-scoped memory file viewer endpoints.
 *
 * Wraps the same on-disk layout the agent's `memory` tool uses
 * (`~/.aouo/data/packs/<pack>/USER.md` / `MEMORY.md`) so the dashboard's
 * Memory tab can render the live state of a pack's persistent notes without
 * going through the LLM.
 *
 * Strictly read-only. Editing lands in a follow-up commit once the viewer is
 * proven; until then, writes go through the agent's `memory` tool.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { packDataDir, packDataPath } from '../lib/paths.js';
import { getLoadedPacks } from '../packs/loader.js';

/** Files we always offer in the picker, in display order, even when absent. */
const CANONICAL_FILES = ['USER.md', 'MEMORY.md'] as const;

export interface MemoryFileInfo {
  /** Bare filename relative to the pack data dir, e.g. `USER.md`. */
  name: string;
  /** Pretty label for the picker; mirrors `name` minus the extension. */
  displayName: string;
  /** True when the file is present on disk. */
  exists: boolean;
  /** Size in bytes (0 when absent). */
  size: number;
  /** ISO mtime; empty string when absent. */
  mtime: string;
}

export interface MemoryListResponse {
  files: MemoryFileInfo[];
}

export interface MemoryFileResponse {
  name: string;
  content: string;
  size: number;
  mtime: string;
}

function isLoaded(packName: string): boolean {
  return getLoadedPacks().some((p) => p.manifest.name === packName);
}

/**
 * Caller-driven filename guard. We refuse anything that would walk out of the
 * pack data dir or hit a non-markdown file — the picker only ever shows `.md`
 * entries the runtime knows how to render, so anything else is an attempt to
 * coerce the endpoint into a general-purpose file reader.
 */
function validateFilename(name: string): { ok: true; name: string } | { ok: false; reason: string } {
  if (!name) return { ok: false, reason: 'Filename is required.' };
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    return { ok: false, reason: 'Filename must not contain path separators.' };
  }
  if (!name.endsWith('.md')) {
    return { ok: false, reason: 'Only markdown files are exposed by this endpoint.' };
  }
  return { ok: true, name };
}

/**
 * Lists the memory files surfaced by the dashboard picker for one pack.
 *
 * Returns `null` when the pack is not loaded so the router can respond 404.
 * Canonical files (USER.md, MEMORY.md) are always present in the result with
 * `exists: false` placeholders when missing — the dashboard renders the empty
 * state from that signal so users see what the pack *could* keep, not just
 * what it has already written. Additional top-level `.md` files inside the
 * pack data dir are appended, sorted alphabetically.
 */
export function handleListMemory(packName: string): MemoryListResponse | null {
  if (!isLoaded(packName)) return null;

  const dir = packDataDir(packName);
  const dirEntries = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => e.name)
    : [];

  const seen = new Set<string>();
  const result: MemoryFileInfo[] = [];

  const pushEntry = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const path = packDataPath(packName, name);
    if (existsSync(path)) {
      const stat = statSync(path);
      result.push({
        name,
        displayName: name.replace(/\.md$/i, ''),
        exists: true,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    } else {
      result.push({
        name,
        displayName: name.replace(/\.md$/i, ''),
        exists: false,
        size: 0,
        mtime: '',
      });
    }
  };

  for (const name of CANONICAL_FILES) pushEntry(name);
  for (const name of dirEntries.sort()) pushEntry(name);

  return { files: result };
}

export type MemoryFileResult =
  | { ok: true; file: MemoryFileResponse }
  | { ok: false; status: 400 | 404; error: string };

/**
 * Reads a single markdown memory file inside one pack's data dir.
 *
 * Returns a status-tagged result so the router can map cleanly to HTTP codes:
 * 400 for filenames the guard rejects, 404 for unknown packs or files the
 * pack has not yet written, 200 with the content otherwise.
 */
export function handleReadMemoryFile(packName: string, fileName: string): MemoryFileResult {
  if (!isLoaded(packName)) {
    return { ok: false, status: 404, error: `Pack not loaded: ${packName}` };
  }
  const guard = validateFilename(fileName);
  if (!guard.ok) {
    return { ok: false, status: 400, error: guard.reason };
  }

  const path = join(packDataDir(packName), guard.name);
  if (!existsSync(path)) {
    return { ok: false, status: 404, error: `Memory file not found: ${guard.name}` };
  }
  const stat = statSync(path);
  const content = readFileSync(path, 'utf-8');
  return {
    ok: true,
    file: {
      name: guard.name,
      content,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
    },
  };
}
