import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { LOGS_DIR } from '../../src/lib/paths.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

interface LogEntry {
  time: string;
  level: string;
  msg: string;
  pack?: string;
  source: string;
  context: Record<string, unknown>;
}

interface LogsBody {
  entries: LogEntry[];
  sources: Array<{ name: string; size: number; mtime: string; truncated: boolean }>;
  hasMore: boolean;
  oldestTime: string | null;
}

function pinoLine(record: Record<string, unknown>): string {
  return JSON.stringify(record);
}

function seedLogs(): void {
  mkdirSync(LOGS_DIR, { recursive: true });
  const gateway = [
    pinoLine({
      level: 'info',
      time: '2026-05-15T09:00:00.000Z',
      pid: 1,
      hostname: 'h',
      name: 'aouo',
      msg: 'pack_loaded',
      pack: 'hello-world',
      version: '1.0.0',
    }),
    pinoLine({
      level: 'warn',
      time: '2026-05-15T09:01:00.000Z',
      pid: 1,
      hostname: 'h',
      name: 'aouo',
      msg: 'schema_migration_slow',
      pack: 'hello-world',
      duration_ms: 312,
    }),
    pinoLine({
      level: 'error',
      time: '2026-05-15T09:02:00.000Z',
      pid: 1,
      hostname: 'h',
      name: 'aouo',
      msg: 'cron_tick_error',
      pack: 'hello-world',
      error: 'boom',
    }),
    // Untagged (no `pack` field) — should still appear in pack view per plan.
    pinoLine({
      level: 'info',
      time: '2026-05-15T09:03:00.000Z',
      pid: 1,
      hostname: 'h',
      name: 'aouo',
      msg: 'cron_scheduler_start',
      tick_ms: 60000,
    }),
    // Different pack — must be filtered out.
    pinoLine({
      level: 'info',
      time: '2026-05-15T09:04:00.000Z',
      pid: 1,
      hostname: 'h',
      name: 'aouo',
      msg: 'pack_loaded',
      pack: 'other-pack',
      version: '0.1.0',
    }),
  ].join('\n') + '\n';
  writeFileSync(join(LOGS_DIR, 'gateway.log'), gateway, 'utf-8');

  // ui.log mixes a boot banner (non-JSON, must be skipped) and a JSON line.
  const ui = [
    '[ui] URL=http://127.0.0.1:9800/?token=abc',
    '[ui] Port=9800',
    pinoLine({
      level: 'info',
      time: '2026-05-15T09:05:00.000Z',
      pid: 2,
      hostname: 'h',
      name: 'aouo',
      msg: 'ui_server_start',
      port: 9800,
    }),
  ].join('\n') + '\n';
  writeFileSync(join(LOGS_DIR, 'ui.log'), ui, 'utf-8');
}

describe('GET /api/packs/:pack/logs', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    handle = await startUiServer({ port: 0, token: 'test-logs' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
  });

  beforeEach(() => {
    seedLogs();
  });

  async function api<T>(path: string): Promise<{ status: number; body: T }> {
    const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
      headers: { 'X-Aouo-Token': handle.token },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('returns 404 when the pack is not loaded', async () => {
    const { status } = await api('/api/packs/does-not-exist/logs');
    expect(status).toBe(404);
  });

  it('returns entries for this pack plus untagged lines, newest first', async () => {
    const { status, body } = await api<LogsBody>('/api/packs/hello-world/logs');
    expect(status).toBe(200);

    const msgs = body.entries.map((e) => e.msg);
    expect(msgs).toContain('pack_loaded');
    expect(msgs).toContain('cron_scheduler_start'); // untagged — included
    expect(msgs).toContain('ui_server_start');      // untagged — included
    // Excluded: other-pack's pack_loaded counts as a different entry by pack field.
    const otherPackHit = body.entries.find((e) => e.pack === 'other-pack');
    expect(otherPackHit).toBeUndefined();

    // Time-DESC ordering.
    const times = body.entries.map((e) => Date.parse(e.time));
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]!).toBeGreaterThanOrEqual(times[i]!);
    }

    // Sources reflect both files.
    const names = body.sources.map((s) => s.name).sort();
    expect(names).toEqual(['gateway.log', 'ui.log']);
  });

  it('peels structured fields into context, leaving the well-known keys top-level', async () => {
    const { body } = await api<LogsBody>('/api/packs/hello-world/logs');
    const warn = body.entries.find((e) => e.msg === 'schema_migration_slow');
    expect(warn).toBeDefined();
    expect(warn!.level).toBe('warn');
    expect(warn!.pack).toBe('hello-world');
    // pid/hostname/name/time/level/msg/pack are stripped.
    expect(warn!.context).toEqual({ duration_ms: 312 });
  });

  it('filters by level when the query supplies one', async () => {
    const { body } = await api<LogsBody>('/api/packs/hello-world/logs?level=error');
    expect(body.entries.length).toBe(1);
    expect(body.entries[0]!.level).toBe('error');
    expect(body.entries[0]!.msg).toBe('cron_tick_error');
  });

  it('ignores unknown level values (no-op)', async () => {
    const { body } = await api<LogsBody>('/api/packs/hello-world/logs?level=banana');
    // No level filter applied → all eligible entries return.
    expect(body.entries.length).toBeGreaterThan(1);
  });

  it('skips non-JSON lines silently (boot banners in ui.log)', async () => {
    const { body } = await api<LogsBody>('/api/packs/hello-world/logs');
    const fromUi = body.entries.filter((e) => e.source === 'ui.log');
    expect(fromUi.length).toBe(1);
    expect(fromUi[0]!.msg).toBe('ui_server_start');
  });

  it('paginates via `before` cursor and `hasMore` flag', async () => {
    const { body: first } = await api<LogsBody>(
      '/api/packs/hello-world/logs?limit=2',
    );
    expect(first.entries.length).toBe(2);
    expect(first.hasMore).toBe(true);
    expect(first.oldestTime).toBeTruthy();

    const { body: second } = await api<LogsBody>(
      `/api/packs/hello-world/logs?limit=2&before=${encodeURIComponent(first.oldestTime!)}`,
    );
    // Every entry in the second page must be strictly older than oldestTime of the first.
    const cutoff = Date.parse(first.oldestTime!);
    for (const e of second.entries) {
      expect(Date.parse(e.time)).toBeLessThan(cutoff);
    }
  });

  it('returns empty payload (200) when the logs dir has no files', async () => {
    // Wipe both log files we seeded.
    writeFileSync(join(LOGS_DIR, 'gateway.log'), '', 'utf-8');
    writeFileSync(join(LOGS_DIR, 'ui.log'), '', 'utf-8');
    const { status, body } = await api<LogsBody>('/api/packs/hello-world/logs');
    expect(status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.oldestTime).toBeNull();
  });
});
