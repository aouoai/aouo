/**
 * @module server/cron
 * @description Pack-scoped cron job viewer + control endpoints.
 *
 * The dashboard's Cron tab needs to: (1) see which jobs the pack registered
 * with the scheduler, (2) toggle individual jobs on/off, (3) preview what a
 * job's prompt produces without nudging its schedule. All three operations
 * are constrained to one pack at a time — there is no cross-pack write
 * surface here.
 *
 * Job listing comes straight from `scheduler.listJobs()` filtered by the
 * `pack` field. Toggle wraps `pauseJob` / `resumeJob`. Preview wraps the
 * non-persisting `dryRunJob` (see scheduler.ts) so the schedule's
 * `next_run_at` and `last_run_at` stay untouched.
 */

import { loadConfig } from '../config/loader.js';
import { getLoadedPacks } from '../packs/loader.js';
import {
  dryRunJob,
  listJobs,
  pauseJob,
  resumeJob,
  type CronJob,
} from '../lib/scheduler.js';

function isLoaded(packName: string): boolean {
  return getLoadedPacks().some((p) => p.manifest.name === packName);
}

function findPackJob(packName: string, jobId: string): CronJob | undefined {
  return listJobs().find(
    (j) => j.pack === packName && (j.id === jobId || j.name === jobId),
  );
}

export interface CronListResponse {
  jobs: CronJob[];
}

/**
 * Returns the cron jobs registered under one pack.
 *
 * Returns `null` when the pack is not loaded (router → 404). The empty
 * array is a normal result — a pack with no `cron_defaults` simply has no
 * jobs registered.
 */
export function handleListPackCron(packName: string): CronListResponse | null {
  if (!isLoaded(packName)) return null;
  return { jobs: listJobs().filter((j) => j.pack === packName) };
}

export type CronAction = 'pause' | 'resume' | 'run';

export interface CronActionPauseResume {
  ok: true;
  action: 'pause' | 'resume';
  job: CronJob;
}

export interface CronActionRun {
  ok: true;
  action: 'run';
  /** Captured agent output. Empty string when the job emitted `[SILENT]`. */
  output: string;
  status: 'ok' | 'silent';
}

export type CronActionResult =
  | CronActionPauseResume
  | CronActionRun
  | { ok: false; status: 400 | 403 | 404 | 500; error: string };

/**
 * Validates pack/job ownership then dispatches to the scheduler.
 *
 * The pack-ownership check is the security boundary that keeps the
 * dashboard from poking jobs that belong to other packs — a job id leaked
 * via another route cannot be paused/run from a workspace it doesn't
 * belong to.
 */
export async function handleCronAction(
  packName: string,
  jobId: string,
  action: CronAction,
): Promise<CronActionResult> {
  if (!isLoaded(packName)) {
    return { ok: false, status: 404, error: `Pack not loaded: ${packName}` };
  }
  const job = findPackJob(packName, jobId);
  if (!job) {
    return { ok: false, status: 404, error: `Cron job not found for pack ${packName}: ${jobId}` };
  }

  const config = loadConfig();
  try {
    if (action === 'pause') {
      return { ok: true, action: 'pause', job: pauseJob(job.id) };
    }
    if (action === 'resume') {
      return { ok: true, action: 'resume', job: await resumeJob(config, job.id) };
    }
    const preview = await dryRunJob(config, job.id);
    return { ok: true, action: 'run', output: preview.output, status: preview.status };
  } catch (err) {
    return { ok: false, status: 500, error: (err as Error).message };
  }
}
