/**
 * @module server/logs
 * @description Pack-scoped log tail endpoint.
 *
 * Reads the daemon log files Pino writes to under `~/.aouo/logs/` — single
 * file per service (gateway.log, ui.log, …), no rotation, so we just merge
 * every `*.log` in that directory and surface the result in time-DESC order.
 *
 * Filtering rules per the Phase 5 plan:
 *   1. Pack scope — include lines tagged `pack: <name>` for THIS pack, AND
 *      lines that have no pack field (system events that aren't pack-tagged
 *      but are still useful context, e.g., scheduler ticks, provider faults).
 *      Lines tagged for a *different* pack are excluded.
 *   2. Level — optional exact match on `level` field.
 *   3. `before` cursor — only entries with `time < before`, so the UI can
 *      page backwards from its current oldest row.
 *
 * Non-JSON lines (e.g., the boot banner `console.log` writes to ui.log)
 * are skipped silently — they have no structured fields the filter could
 * apply to. The raw file remains accessible at the on-disk path.
 *
 * Read budget: each file is capped at the trailing 16 MiB to bound memory
 * for pathological log growth. The first partial line in a tail-read is
 * dropped to avoid surfacing a half-JSON record; the response flags this
 * via `sources[*].truncated`.
 */

import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { LOGS_DIR } from '../lib/paths.js';
import { getLoadedPacks } from '../packs/loader.js';

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal', 'trace'] as const;

export interface LogEntry {
  /** ISO timestamp from pino's `time` field; empty string when the source line had none. */
  time: string;
  level: string;
  msg: string;
  pack?: string;
  /** Origin file name within `~/.aouo/logs/`, e.g. `gateway.log`. */
  source: string;
  /** All non-structured fields from the JSON record (pid/hostname/name/time/level/msg/pack stripped). */
  context: Record<string, unknown>;
}

export interface LogSource {
  name: string;
  size: number;
  mtime: string;
  /** True when the file exceeded the read budget and only the tail was loaded. */
  truncated: boolean;
}

export interface LogsResponse {
  entries: LogEntry[];
  sources: LogSource[];
  /** True when there are more lines matching the filter than the limit returned. */
  hasMore: boolean;
  /** Earliest entry time in this page — pass back as `before` to load older. */
  oldestTime: string | null;
}

export interface LogsQuery {
  /** Optional level filter (exact match). Unknown levels fall through as no-op. */
  level?: string;
  /** Defaults to 200, capped at 1000. */
  limit?: number;
  /** ISO timestamp; only return entries strictly older than this. */
  before?: string;
}

function isLoaded(packName: string): boolean {
  return getLoadedPacks().some((p) => p.manifest.name === packName);
}

/**
 * Reads either the whole file or its trailing MAX_FILE_BYTES, dropping the
 * partial first line on a tail-read so JSON parsing doesn't see fragments.
 */
function readTail(path: string): { text: string; truncated: boolean } {
  const stat = statSync(path);
  if (stat.size <= MAX_FILE_BYTES) {
    return { text: readFileSync(path, 'utf-8'), truncated: false };
  }
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(MAX_FILE_BYTES);
    readSync(fd, buf, 0, MAX_FILE_BYTES, stat.size - MAX_FILE_BYTES);
    const text = buf.toString('utf-8');
    const nl = text.indexOf('\n');
    return { text: nl >= 0 ? text.slice(nl + 1) : text, truncated: true };
  } finally {
    closeSync(fd);
  }
}

const STRUCTURED_KEYS: ReadonlySet<string> = new Set([
  'time',
  'level',
  'msg',
  'pack',
  'pid',
  'hostname',
  'name',
]);

export function handleReadPackLogs(
  packName: string,
  query: LogsQuery,
): LogsResponse | null {
  if (!isLoaded(packName)) return null;

  if (!existsSync(LOGS_DIR)) {
    return { entries: [], sources: [], hasMore: false, oldestTime: null };
  }

  const fileNames = readdirSync(LOGS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.log'))
    .map((e) => e.name)
    .sort();

  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const levelFilter = query.level && (LEVELS as readonly string[]).includes(query.level)
    ? query.level
    : undefined;
  const beforeMs = query.before ? Date.parse(query.before) : Number.NaN;
  const hasBefore = Number.isFinite(beforeMs);

  const matched: LogEntry[] = [];
  const sources: LogSource[] = [];

  for (const file of fileNames) {
    const path = join(LOGS_DIR, file);
    const stat = statSync(path);
    const { text, truncated } = readTail(path);
    sources.push({
      name: file,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      truncated,
    });

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }

      const pack = typeof parsed['pack'] === 'string' ? parsed['pack'] : undefined;
      if (pack && pack !== packName) continue;

      const level = typeof parsed['level'] === 'string' ? parsed['level'] : 'info';
      if (levelFilter && level !== levelFilter) continue;

      const time = typeof parsed['time'] === 'string' ? parsed['time'] : '';
      if (hasBefore) {
        const t = Date.parse(time);
        if (!Number.isFinite(t) || t >= beforeMs) continue;
      }

      const msg = typeof parsed['msg'] === 'string' ? parsed['msg'] : '';
      const context: Record<string, unknown> = {};
      for (const k of Object.keys(parsed)) {
        if (STRUCTURED_KEYS.has(k)) continue;
        context[k] = parsed[k];
      }

      matched.push({
        time,
        level,
        msg,
        ...(pack ? { pack } : {}),
        source: file,
        context,
      });
    }
  }

  matched.sort((a, b) => {
    const ta = Date.parse(a.time) || 0;
    const tb = Date.parse(b.time) || 0;
    return tb - ta;
  });

  const entries = matched.slice(0, limit);
  const hasMore = matched.length > entries.length;
  const oldestTime = entries.length ? entries[entries.length - 1]!.time : null;

  return { entries, sources, hasMore, oldestTime };
}
