import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { DEFAULT_CONFIG, type AouoConfig } from '../../src/config/defaults.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { registerPackCronDefaults } from '../../src/packs/cronDefaults.js';
import { getJob, listJobs, removeJob } from '../../src/lib/scheduler.js';

const PACKS_DIR = join(import.meta.dirname, '..', '..', 'packs');

describe('pack cron defaults', () => {
  const config: AouoConfig = {
    ...DEFAULT_CONFIG,
    cron: { ...DEFAULT_CONFIG.cron, enabled: true, timezone: 'UTC', default_chat_id: '12345' },
  };

  beforeEach(() => {
    unloadAllPacks();
    for (const job of listJobs()) {
      if (job.name.startsWith('notes:')) removeJob(job.id);
    }
  });

  afterEach(() => {
    for (const job of listJobs()) {
      if (job.name.startsWith('notes:')) removeJob(job.id);
    }
    unloadAllPacks();
  });

  it('registers enabled pack cron defaults once with pack and skill context', async () => {
    const loaded = await loadPack(join(PACKS_DIR, 'notes'));
    expect(loaded).not.toBeNull();

    const result = await registerPackCronDefaults(config, loaded!);
    const repeated = await registerPackCronDefaults(config, loaded!);

    expect(result.created).toHaveLength(1);
    expect(repeated.created).toHaveLength(0);
    expect(repeated.skipped.some((item) => item.reason === 'already_exists')).toBe(true);

    const job = getJob('notes:evening-journal');
    expect(job).toBeDefined();
    expect(job!.pack).toBe('notes');
    expect(job!.skill).toBe('notes:daily-note');
    expect(job!.prompt).toContain('notes');
    expect(job!.prompt).toContain('daily-note');
    expect(getJob('notes:weekly-review')).toBeUndefined();
  });

  it('skips enabled cron defaults when no delivery chat id is configured', async () => {
    const loaded = await loadPack(join(PACKS_DIR, 'notes'));
    expect(loaded).not.toBeNull();

    const result = await registerPackCronDefaults(
      { ...config, cron: { ...config.cron, default_chat_id: '' } },
      loaded!,
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped.some((item) => item.reason === 'missing_chat_id')).toBe(true);
  });
});
