import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { dispatch, registerAllTools } from '../../src/tools/registry.js';
import { DEFAULT_CONFIG, type AouoConfig } from '../../src/config/defaults.js';
import { listJobs, removeJob } from '../../src/lib/scheduler.js';
import type { Adapter, ToolContext } from '../../src/agent/types.js';

const adapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'deny';
  },
};

const config: AouoConfig = {
  ...DEFAULT_CONFIG,
  cron: { ...DEFAULT_CONFIG.cron, enabled: true, timezone: 'UTC', default_chat_id: '12345' },
};

function context(pack?: string): ToolContext {
  return {
    adapter,
    config,
    sessionKey: 'test:cron',
    pack,
  };
}

describe('tools/cron', () => {
  beforeAll(async () => {
    await registerAllTools();
  });

  afterEach(() => {
    for (const job of listJobs()) {
      if (job.name.startsWith('test-cron-tool-')) removeJob(job.id);
    }
  });

  it('creates, lists, pauses, resumes, and removes scheduler jobs', async () => {
    const name = `test-cron-tool-${Date.now()}`;
    const created = await dispatch(
      'cron',
      {
        action: 'create',
        name,
        prompt: 'Send a short journaling reminder.',
        schedule: 'every 1h',
      },
      context('notes'),
    );

    expect(created.isError).toBe(false);
    const createdPayload = JSON.parse(created.content);
    expect(createdPayload.ok).toBe(true);
    expect(createdPayload.result.name).toBe(name);
    expect(createdPayload.result.pack).toBe('notes');

    const listed = await dispatch('cron', { action: 'list' }, context('notes'));
    const listPayload = JSON.parse(listed.content);
    expect(listPayload.ok).toBe(true);
    expect(listPayload.result.some((job: { name: string }) => job.name === name)).toBe(true);

    const paused = await dispatch('cron', { action: 'pause', id: name }, context('notes'));
    expect(JSON.parse(paused.content).result.state).toBe('paused');

    const resumed = await dispatch('cron', { action: 'resume', id: name }, context('notes'));
    expect(JSON.parse(resumed.content).result.state).toBe('scheduled');

    const removed = await dispatch('cron', { action: 'remove', id: name }, context('notes'));
    expect(JSON.parse(removed.content).result).toBe(true);
  });
});
