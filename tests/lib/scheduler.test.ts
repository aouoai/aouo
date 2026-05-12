/**
 * @module tests/lib/scheduler
 * @description Tests for the cron scheduler — schedule parsing and job lifecycle.
 *
 * Note: Job CRUD tests operate on the real CRON_JOBS_PATH since the
 * path constants are evaluated at module import time. Each test clears
 * jobs via removeJob to avoid cross-test contamination.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  parseSchedule,
  createJob, listJobs, getJob, removeJob, pauseJob, resumeJob,
} from '../../src/lib/scheduler.js';
import { DEFAULT_CONFIG, type AouoConfig } from '../../src/config/defaults.js';

describe('scheduler', () => {
  const config: AouoConfig = {
    ...DEFAULT_CONFIG,
    cron: { ...DEFAULT_CONFIG.cron, timezone: 'UTC', default_chat_id: '12345', enabled: true },
  };

  // Track created job IDs for cleanup
  const createdIds: string[] = [];

  afterEach(() => {
    // Clean up any jobs created during tests
    for (const id of createdIds) {
      try { removeJob(id); } catch { /* ignore */ }
    }
    createdIds.length = 0;
  });

  describe('parseSchedule', () => {
    it('parses interval schedule', () => {
      const s = parseSchedule('every 30m', config);
      expect(s.kind).toBe('interval');
      if (s.kind === 'interval') expect(s.minutes).toBe(30);
    });

    it('parses hour intervals', () => {
      const s = parseSchedule('every 2h', config);
      expect(s.kind).toBe('interval');
      if (s.kind === 'interval') expect(s.minutes).toBe(120);
    });

    it('parses day intervals', () => {
      const s = parseSchedule('every 1d', config);
      expect(s.kind).toBe('interval');
      if (s.kind === 'interval') expect(s.minutes).toBe(1440);
    });

    it('parses ISO timestamp as once', () => {
      const s = parseSchedule('2030-01-01T00:00:00Z', config);
      expect(s.kind).toBe('once');
    });

    it('parses relative duration as once', () => {
      const s = parseSchedule('30m', config);
      expect(s.kind).toBe('once');
    });

    it('throws on invalid duration', () => {
      expect(() => parseSchedule('banana', config)).toThrow('Invalid schedule');
    });

    it('parses cron expression', () => {
      const s = parseSchedule('0 9 * * *', config);
      expect(s.kind).toBe('cron');
      if (s.kind === 'cron') expect(s.expr).toBe('0 9 * * *');
    });

    it('parses minutes shorthand', () => {
      const s = parseSchedule('every 5min', config);
      expect(s.kind).toBe('interval');
      if (s.kind === 'interval') expect(s.minutes).toBe(5);
    });
  });

  describe('job CRUD', () => {
    it('creates a job with correct fields', () => {
      const job = createJob(config, {
        name: `test-create-${Date.now()}`,
        prompt: 'Say hello',
        schedule: 'every 1h',
        chat_id: '12345',
      });
      createdIds.push(job.id);

      expect(job.id).toBeTruthy();
      expect(job.id.length).toBe(12);
      expect(job.enabled).toBe(true);
      expect(job.state).toBe('scheduled');
      expect(job.schedule.kind).toBe('interval');
      expect(job.deliver.chat_id).toBe('12345');
    });

    it('finds a job by ID', () => {
      const created = createJob(config, {
        name: `test-find-${Date.now()}`,
        prompt: 'test',
        schedule: '30m',
        chat_id: '12345',
      });
      createdIds.push(created.id);

      const found = getJob(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('removes a job', () => {
      const job = createJob(config, {
        name: `test-remove-${Date.now()}`,
        prompt: 'test',
        schedule: '1h',
        chat_id: '12345',
      });
      // Don't add to createdIds since we remove it manually
      const before = listJobs().length;
      expect(removeJob(job.id)).toBe(true);
      expect(listJobs().length).toBe(before - 1);
    });

    it('pauses and resumes', () => {
      const job = createJob(config, {
        name: `test-pause-${Date.now()}`,
        prompt: 'test',
        schedule: 'every 1h',
        chat_id: '12345',
      });
      createdIds.push(job.id);

      const paused = pauseJob(job.id);
      expect(paused.enabled).toBe(false);
      expect(paused.state).toBe('paused');
      expect(paused.next_run_at).toBeNull();

      const resumed = resumeJob(config, job.id);
      expect(resumed.enabled).toBe(true);
      expect(resumed.state).toBe('scheduled');
      expect(resumed.next_run_at).toBeTruthy();
    });

    it('creates disabled jobs in paused state', () => {
      const job = createJob(config, {
        name: `test-disabled-${Date.now()}`,
        prompt: 'test',
        schedule: 'every 1h',
        chat_id: '12345',
        enabled: false,
      });
      createdIds.push(job.id);

      expect(job.enabled).toBe(false);
      expect(job.state).toBe('paused');
      expect(job.next_run_at).toBeNull();
    });
  });
});
