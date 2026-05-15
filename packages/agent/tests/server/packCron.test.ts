import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { CRON_DIR, CRON_JOBS_PATH } from '../../src/lib/paths.js';
import * as scheduler from '../../src/lib/scheduler.js';

// Replace only `dryRunJob` so list/pause/resume still hit real scheduler
// state. Module-level mock intercepts the binding before server/cron.ts
// imports it — `vi.spyOn` on the namespace is unreliable with ESM.
vi.mock('../../src/lib/scheduler.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/scheduler.js')>(
    '../../src/lib/scheduler.js',
  );
  return {
    ...actual,
    dryRunJob: vi.fn(),
  };
});

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

/**
 * Builds a complete CronJob shape that satisfies the persisted schema
 * without going through `createJob` — which would require a default
 * chat_id and config setup just to seed test fixtures.
 */
function makeJob(overrides: Partial<scheduler.CronJob> & { id: string; pack: string }): scheduler.CronJob {
  const now = '2026-05-15T00:00:00.000Z';
  return {
    name: overrides.name ?? `job-${overrides.id}`,
    prompt: 'say hi',
    pack: overrides.pack,
    skill: 'greeting',
    schedule: { kind: 'interval', minutes: 60, display: 'every 60m' },
    enabled: true,
    state: 'scheduled',
    deliver: { platform: 'telegram', chat_id: '12345' },
    repeat: { times: null, completed: 0 },
    next_run_at: '2026-05-15T01:00:00.000Z',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function seedJobs(jobs: scheduler.CronJob[]): void {
  mkdirSync(CRON_DIR, { recursive: true });
  writeFileSync(CRON_JOBS_PATH, JSON.stringify(jobs, null, 2) + '\n', 'utf-8');
}

interface CronListBody {
  jobs: scheduler.CronJob[];
}

interface CronActionBody {
  ok: boolean;
  action?: 'pause' | 'resume' | 'run';
  job?: scheduler.CronJob;
  output?: string;
  status?: 'ok' | 'silent';
  error?: string;
}

describe('GET/POST /api/packs/:pack/cron[/:id/:action]', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    handle = await startUiServer({ port: 0, token: 'test-cron' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
  });

  beforeEach(() => {
    seedJobs([
      makeJob({ id: 'job-a', pack: 'hello-world', name: 'hello-a' }),
      makeJob({ id: 'job-b', pack: 'hello-world', name: 'hello-b', enabled: false, state: 'paused', next_run_at: null }),
      makeJob({ id: 'job-x', pack: 'other-pack', name: 'other-x' }),
    ]);
    vi.mocked(scheduler.dryRunJob).mockReset();
  });

  async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
      ...init,
      headers: { 'X-Aouo-Token': handle.token, ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('returns 404 listing when pack is not loaded', async () => {
    const { status } = await api('/api/packs/does-not-exist/cron');
    expect(status).toBe(404);
  });

  it('lists only jobs belonging to the requested pack', async () => {
    const { status, body } = await api<CronListBody>('/api/packs/hello-world/cron');
    expect(status).toBe(200);
    const ids = body.jobs.map((j) => j.id).sort();
    expect(ids).toEqual(['job-a', 'job-b']);
    expect(body.jobs.find((j) => j.pack === 'other-pack')).toBeUndefined();
  });

  it('returns empty list when the pack has registered no cron jobs', async () => {
    seedJobs([makeJob({ id: 'job-x', pack: 'other-pack' })]);
    const { status, body } = await api<CronListBody>('/api/packs/hello-world/cron');
    expect(status).toBe(200);
    expect(body.jobs).toEqual([]);
  });

  it('pauses an enabled job for this pack', async () => {
    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-a/pause',
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe('pause');
    expect(body.job?.enabled).toBe(false);
    expect(body.job?.state).toBe('paused');
    expect(body.job?.next_run_at).toBeNull();
  });

  it('resumes a paused job for this pack', async () => {
    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-b/resume',
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe('resume');
    expect(body.job?.enabled).toBe(true);
    expect(body.job?.state).toBe('scheduled');
    expect(body.job?.next_run_at).toBeTruthy();
  });

  it('refuses to act on a job that belongs to another pack', async () => {
    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-x/pause',
      { method: 'POST' },
    );
    expect(status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it('rejects unknown actions with 400', async () => {
    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-a/delete',
      { method: 'POST' },
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/invalid cron action/i);
  });

  it('returns 405 when GET is used on a write route', async () => {
    const { status } = await api('/api/packs/hello-world/cron/job-a/pause');
    expect(status).toBe(405);
  });

  it('runs a preview without mutating persisted schedule', async () => {
    vi.mocked(scheduler.dryRunJob).mockResolvedValue({
      output: 'hello from preview',
      status: 'ok',
    });

    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-a/run',
      { method: 'POST' },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe('run');
    expect(body.output).toBe('hello from preview');
    expect(body.status).toBe('ok');
    expect(scheduler.dryRunJob).toHaveBeenCalledTimes(1);

    // Schedule untouched: the seeded next_run_at must be intact after preview.
    const { body: list } = await api<CronListBody>('/api/packs/hello-world/cron');
    const after = list.jobs.find((j) => j.id === 'job-a')!;
    expect(after.next_run_at).toBe('2026-05-15T01:00:00.000Z');
    expect(after.last_run_at).toBeUndefined();
  });

  it('surfaces dryRun errors as 500', async () => {
    vi.mocked(scheduler.dryRunJob).mockRejectedValue(new Error('provider missing'));
    const { status, body } = await api<CronActionBody>(
      '/api/packs/hello-world/cron/job-a/run',
      { method: 'POST' },
    );
    expect(status).toBe(500);
    expect(body.error).toMatch(/provider missing/i);
  });
});
