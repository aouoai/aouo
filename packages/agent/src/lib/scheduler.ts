/**
 * @module lib/scheduler
 * @description JSON-backed cron execution engine for background jobs.
 *
 * Persists job definitions in `~/.aouo/cron/jobs.json`. The execution ticker
 * runs on an interval (configurable via `cron.tick_seconds`), driven by
 * the gateway process or invoked manually via CLI.
 *
 * Features:
 * - Three schedule kinds: `once` (absolute time), `interval` (recurring), `cron` (expressions)
 * - Filesystem-based mutual exclusion (`.tick.lock` directory) prevents concurrent ticks
 * - Silent job suppression via `[SILENT]` marker
 * - Repeat limits with auto-completion
 * - Atomic JSON writes (tmp + rename)
 */

import {
  chmodSync, existsSync, mkdirSync,
  readFileSync, writeFileSync,
  renameSync, rmSync, statSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';
import type { AouoConfig } from '../config/defaults.js';
import { ensureDirectories, CRON_DIR, CRON_JOBS_PATH, CRON_OUTPUT_DIR } from './paths.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** Supported scheduling variants. */
export type CronSchedule =
  | { kind: 'once'; run_at: string; display: string }
  | { kind: 'interval'; minutes: number; display: string }
  | { kind: 'cron'; expr: string; display: string };

/** Persisted state for a single automated job. */
export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  pack?: string;
  skill?: string;
  schedule: CronSchedule;
  enabled: boolean;
  state: 'scheduled' | 'paused' | 'running' | 'completed' | 'error';
  deliver: {
    platform: string;
    chat_id: string;
  };
  repeat: {
    times: number | null;
    completed: number;
  };
  next_run_at: string | null;
  last_run_at?: string;
  last_status?: 'ok' | 'error' | 'silent';
  last_error?: string;
  created_at: string;
  updated_at: string;
}

/** Input for creating a new cron job. */
export interface CreateCronJobInput {
  name: string;
  prompt: string;
  schedule: string;
  pack?: string;
  skill?: string;
  chat_id?: string;
  repeat_times?: number | null;
  enabled?: boolean;
}

/** Delivery interface for proactive messaging. */
export interface SchedulerDelivery {
  sendProactiveMessage(chatId: number, text: string): Promise<void>;
}

// ── Scheduler Lifecycle ──────────────────────────────────────────────────────

let interval: ReturnType<typeof setInterval> | null = null;

const SILENT_MARKER = '[SILENT]';
const LOCK_DIR = join(CRON_DIR, '.tick.lock');

/**
 * Starts the background scheduler ticker.
 *
 * @param config - Agent configuration.
 * @param delivery - Platform-specific message delivery.
 */
export function startScheduler(config: AouoConfig, delivery: SchedulerDelivery): void {
  if (!config.cron?.enabled) return;
  if (interval) return;

  const tickMs = Math.max(10, Number(config.cron.tick_seconds || 60)) * 1000;
  logger.info({ msg: 'cron_scheduler_start', tick_ms: tickMs });

  interval = setInterval(() => {
    tick(config, delivery).catch(err => {
      logger.error({ msg: 'cron_tick_error', error: (err as Error).message });
    });
  }, tickMs);
  interval.unref();

  // Run initial tick immediately
  tick(config, delivery).catch(err => {
    logger.error({ msg: 'cron_initial_tick_error', error: (err as Error).message });
  });
}

/** Stops the background scheduler. */
export function stopScheduler(): void {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

// ── Job CRUD ─────────────────────────────────────────────────────────────────

/** Returns all registered jobs. */
export function listJobs(): CronJob[] {
  return loadJobs();
}

/** Finds a job by ID or name. */
export function getJob(id: string): CronJob | undefined {
  return loadJobs().find(j => j.id === id || j.name === id);
}

/** Creates a new cron job. */
export async function createJob(config: AouoConfig, input: CreateCronJobInput): Promise<CronJob> {
  const now = new Date();
  const schedule = await parseSchedule(input.schedule, config);
  const job: CronJob = {
    id: randomUUID().replace(/-/g, '').slice(0, 12),
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    pack: input.pack,
    skill: input.skill,
    schedule,
    enabled: input.enabled ?? true,
    state: input.enabled === false ? 'paused' : 'scheduled',
    deliver: {
      platform: 'telegram',
      chat_id: String(input.chat_id || config.cron?.default_chat_id || ''),
    },
    repeat: {
      times: input.repeat_times === undefined ? null : input.repeat_times,
      completed: 0,
    },
    next_run_at: input.enabled === false ? null : await computeNextRun(schedule, config, now),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (!job.name) throw new Error('Missing cron job name');
  if (!job.prompt) throw new Error('Missing cron job prompt');
  if (!job.deliver.chat_id) throw new Error('Missing cron delivery chat_id.');

  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);
  return job;
}

/** Updates an existing cron job. */
export async function updateJob(config: AouoConfig, id: string, patch: Partial<CreateCronJobInput>): Promise<CronJob> {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === id || j.name === id);
  if (idx === -1) throw new Error(`Cron job not found: ${id}`);

  const now = new Date();
  const job = { ...jobs[idx]! };
  if (patch.name !== undefined) job.name = patch.name.trim();
  if (patch.prompt !== undefined) job.prompt = patch.prompt.trim();
  if (patch.pack !== undefined) job.pack = patch.pack;
  if (patch.skill !== undefined) job.skill = patch.skill;
  if (patch.chat_id !== undefined) job.deliver = { platform: 'telegram', chat_id: patch.chat_id };
  if (patch.repeat_times !== undefined) job.repeat = { ...job.repeat, times: patch.repeat_times };
  if (patch.schedule !== undefined) {
    job.schedule = await parseSchedule(patch.schedule, config);
    job.next_run_at = job.enabled ? await computeNextRun(job.schedule, config, now) : null;
  }
  if (patch.enabled !== undefined) {
    job.enabled = patch.enabled;
    job.state = patch.enabled ? 'scheduled' : 'paused';
    job.next_run_at = patch.enabled ? await computeNextRun(job.schedule, config, now) : null;
  }
  job.updated_at = now.toISOString();

  jobs[idx] = job;
  saveJobs(jobs);
  return job;
}

/** Pauses a job. */
export function pauseJob(id: string): CronJob {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  job.enabled = false;
  job.state = 'paused';
  job.next_run_at = null;
  job.updated_at = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

/** Resumes a paused job. */
export async function resumeJob(config: AouoConfig, id: string): Promise<CronJob> {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  job.enabled = true;
  job.state = 'scheduled';
  job.next_run_at = await computeNextRun(job.schedule, config, new Date());
  job.updated_at = new Date().toISOString();
  saveJobs(jobs);
  return job;
}

/** Removes a job by ID or name. */
export function removeJob(id: string): boolean {
  const jobs = loadJobs();
  const next = jobs.filter(j => j.id !== id && j.name !== id);
  if (next.length === jobs.length) return false;
  saveJobs(next);
  return true;
}

// ── Tick Execution ───────────────────────────────────────────────────────────

/**
 * Executes a single tick cycle — finds due jobs and runs them.
 *
 * @param config - Agent configuration.
 * @param delivery - Optional message delivery for proactive notifications.
 * @returns Count of jobs executed and the full job list.
 */
export async function tick(
  config: AouoConfig,
  delivery?: SchedulerDelivery,
): Promise<{ ran: number; jobs: CronJob[] }> {
  return withTickLock(async () => {
    const now = new Date();
    const jobs = loadJobs();
    const due = jobs.filter(j =>
      j.enabled &&
      j.state === 'scheduled' &&
      j.next_run_at &&
      new Date(j.next_run_at).getTime() <= now.getTime(),
    );

    for (const job of due) {
      await runJob(config, job.id, delivery);
    }

    return { ran: due.length, jobs: loadJobs() };
  });
}

/**
 * Runs a specific job by ID.
 *
 * Creates an Agent with a minimal CronAdapter (text-only, no interactive UI),
 * executes the job prompt, and delivers the result via the delivery interface.
 */
export async function runJob(
  config: AouoConfig,
  id: string,
  delivery?: SchedulerDelivery,
): Promise<CronJob> {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  if (!job.deliver.chat_id) throw new Error(`Cron job ${job.id} has no delivery chat_id`);

  const startedAt = new Date();
  job.state = 'running';
  job.updated_at = startedAt.toISOString();
  saveJobs(jobs);

  try {
    const output = await runAgentForJob(config, job);
    const status: 'ok' | 'silent' = output.startsWith(SILENT_MARKER) ? 'silent' : 'ok';

    if (status === 'ok' && delivery) {
      await delivery.sendProactiveMessage(Number(job.deliver.chat_id), output);
    }

    saveOutput(job, output || SILENT_MARKER);
    finishRun(config, job.id, status, undefined, startedAt);
  } catch (err) {
    const message = (err as Error).message;
    saveOutput(job, `ERROR: ${message}`);
    finishRun(config, job.id, 'error', message, startedAt);
  }

  return requireJob(loadJobs(), id);
}

// ── Internal: Agent Execution ────────────────────────────────────────────────

/**
 * Minimal adapter for cron execution — captures text output only.
 * No interactive UI, no approval prompts (auto-deny).
 */
class CronAdapter {
  readonly platform = 'cron';
  private chunks: string[] = [];

  async reply(content: string): Promise<void> {
    if (content) this.chunks.push(content);
  }

  async requestApproval(): Promise<'deny'> {
    return 'deny';
  }

  get content(): string {
    return this.chunks.join('\n\n').trim();
  }
}

async function runAgentForJob(config: AouoConfig, job: CronJob): Promise<string> {
  const { registerAllTools } = await import('../tools/registry.js');
  const { Agent } = await import('../agent/Agent.js');
  const { createProvider } = await import('../providers/index.js');
  const { getLoadedPacks } = await import('../packs/loader.js');
  const { buildSkillIndex, getSkill } = await import('../packs/skillRegistry.js');
  const { createSession, setActiveSkill } = await import('../storage/sessionStore.js');

  await registerAllTools();

  const adapter = new CronAdapter();
  const provider = createProvider(config);
  const agent = new Agent(config, adapter as any, provider, {
    packs: getLoadedPacks(),
    skillIndex: buildSkillIndex(),
    resolveSkill(name) {
      const skill = getSkill(name);
      return skill ? { body: skill.body, pack: skill.pack } : undefined;
    },
  });

  const prompt = [
    '[SYSTEM: Cron job execution. This is unattended. Do not ask clarifying questions. If there is nothing useful to send, respond exactly with [SILENT].]',
    `[Cron job: ${job.name}]`,
    job.pack ? `[Pack: ${job.pack}]` : '',
    job.skill ? `[Skill: ${job.skill}]` : '',
    job.prompt,
  ].filter(Boolean).join('\n\n');

  const sessionKey = `cron:${job.id}:${Date.now()}`;
  const sessionId = await createSession(sessionKey);
  if (job.skill) {
    await setActiveSkill(sessionId, job.skill);
  }

  // Cron runs unattended. Conservative allowlist + argFilter sub-permissions.
  //   persist  — record results into pack DB
  //   memory   — read-only (action='read'); writes require an interactive session
  // The scheduler delivers the final assistant text via sendProactiveMessage,
  // so tg_msg / msg / cron / clarify are intentionally NOT in the allowlist.
  const result = await agent.run(prompt, {
    sessionKey,
    sessionId,
    toolPolicy: {
      allow: ['persist', 'memory'],
      argFilter: {
        memory: (args: Record<string, unknown>): string | null => {
          const action = String(args['action'] || '');
          if (action !== 'read') {
            return `memory.${action} is not allowed in cron context; only "read" is permitted.`;
          }
          return null;
        },
      },
    },
  });

  return (adapter.content || result.content || '').trim();
}

// ── Internal: Run Completion ─────────────────────────────────────────────────

async function finishRun(
  config: AouoConfig,
  id: string,
  status: 'ok' | 'silent' | 'error',
  error: string | undefined,
  startedAt: Date,
): Promise<void> {
  const jobs = loadJobs();
  const job = requireJob(jobs, id);
  const now = new Date();

  job.repeat.completed += 1;
  job.last_run_at = startedAt.toISOString();
  job.last_status = status;
  job.last_error = error || '';
  job.updated_at = now.toISOString();

  const exhausted = job.repeat.times !== null && job.repeat.completed >= job.repeat.times;
  if (exhausted || job.schedule.kind === 'once') {
    job.state = 'completed';
    job.enabled = false;
    job.next_run_at = null;
  } else {
    job.state = 'scheduled';
    job.next_run_at = await computeNextRun(job.schedule, config, now);
  }

  saveJobs(jobs);
}

// ── Schedule Parsing ─────────────────────────────────────────────────────────

/**
 * Parses a human-readable schedule string into a structured CronSchedule.
 *
 * Supported formats:
 * - `"every 30m"` / `"every 2h"` / `"every 1d"` → interval
 * - `"30m"` / `"2h"` → once (relative from now)
 * - `"0 9 * * *"` → cron expression
 * - `"2026-01-15T09:00:00Z"` → once (absolute)
 */
export async function parseSchedule(schedule: string, config: AouoConfig): Promise<CronSchedule> {
  const text = schedule.trim();
  const lower = text.toLowerCase();

  // Interval: "every 30m"
  if (lower.startsWith('every ')) {
    const minutes = parseDurationMinutes(text.slice(6));
    return { kind: 'interval', minutes, display: `every ${minutes}m` };
  }

  // Cron expression: "0 9 * * *"
  if (isCronExpression(text)) {
    // Validate by parsing — will throw on invalid expression
    try {
      const { CronExpressionParser } = await import('cron-parser');
      CronExpressionParser.parse(text, {
        currentDate: new Date(),
        tz: config.cron?.timezone || 'UTC',
      });
    } catch {
      // If cron-parser isn't available, accept the expression anyway
    }
    return { kind: 'cron', expr: text, display: text };
  }

  // Absolute ISO timestamp
  if (text.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid schedule timestamp: ${text}`);
    return { kind: 'once', run_at: date.toISOString(), display: `once at ${date.toISOString()}` };
  }

  // Relative duration: "30m" → once in 30 minutes
  const minutes = parseDurationMinutes(text);
  const runAt = new Date(Date.now() + minutes * 60_000).toISOString();
  return { kind: 'once', run_at: runAt, display: `once in ${text}` };
}

async function computeNextRun(schedule: CronSchedule, config: AouoConfig, from: Date): Promise<string | null> {
  if (schedule.kind === 'once') return schedule.run_at;
  if (schedule.kind === 'interval') {
    return new Date(from.getTime() + schedule.minutes * 60_000).toISOString();
  }

  // Cron expression — try cron-parser
  try {
    const { CronExpressionParser } = await import('cron-parser');
    const parsed = CronExpressionParser.parse(schedule.expr, {
      currentDate: from,
      tz: config.cron?.timezone || 'UTC',
    });
    return parsed.next().toDate().toISOString();
  } catch {
    // Fallback: 1 hour from now if cron-parser unavailable
    return new Date(from.getTime() + 60 * 60_000).toISOString();
  }
}

function isCronExpression(text: string): boolean {
  const parts = text.split(/\s+/);
  return (parts.length === 5 || parts.length === 6) &&
    parts.every(p => /^[\d*?,/\-A-Za-z#LW]+$/.test(p));
}

function parseDurationMinutes(text: string): number {
  const match = text.trim().toLowerCase().match(
    /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/,
  );
  if (!match) {
    throw new Error(`Invalid schedule "${text}". Use "30m", "every 2h", ISO timestamp, or cron expression.`);
  }
  const value = Number(match[1]);
  const unit = match[2]![0]!;
  const multiplier = unit === 'd' ? 1440 : unit === 'h' ? 60 : 1;
  return value * multiplier;
}

// ── File I/O ─────────────────────────────────────────────────────────────────

function loadJobs(): CronJob[] {
  ensureCronFiles();
  try {
    const raw = readFileSync(CRON_JOBS_PATH, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as CronJob[] : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: CronJob[]): void {
  ensureCronFiles();
  const tmp = `${CRON_JOBS_PATH}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(jobs, null, 2) + '\n', 'utf-8');
  try { chmodSync(tmp, 0o600); } catch { /* non-posix */ }
  renameSync(tmp, CRON_JOBS_PATH);
  try { chmodSync(CRON_JOBS_PATH, 0o600); } catch { /* non-posix */ }
}

function ensureCronFiles(): void {
  ensureDirectories();
  if (!existsSync(CRON_JOBS_PATH)) {
    writeFileSync(CRON_JOBS_PATH, '[]\n', 'utf-8');
    try { chmodSync(CRON_JOBS_PATH, 0o600); } catch { /* non-posix */ }
  }
}

function requireJob(jobs: CronJob[], id: string): CronJob {
  const job = jobs.find(j => j.id === id || j.name === id);
  if (!job) throw new Error(`Cron job not found: ${id}`);
  return job;
}

function saveOutput(job: CronJob, output: string): void {
  mkdirSync(CRON_OUTPUT_DIR, { recursive: true });
  const jobDir = join(CRON_OUTPUT_DIR, job.id);
  mkdirSync(jobDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(jobDir, `${stamp}.md`), output + '\n', 'utf-8');
}

// ── Lock ─────────────────────────────────────────────────────────────────────

async function withTickLock<T>(fn: () => Promise<T>): Promise<T> {
  mkdirSync(CRON_DIR, { recursive: true });
  try {
    mkdirSync(LOCK_DIR);
  } catch {
    if (isStaleLock()) {
      rmSync(LOCK_DIR, { recursive: true, force: true });
      mkdirSync(LOCK_DIR);
    } else {
      return { ran: 0, jobs: loadJobs() } as T;
    }
  }

  try {
    return await fn();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

function isStaleLock(): boolean {
  try {
    const ageMs = Date.now() - statSync(LOCK_DIR).mtimeMs;
    return ageMs > 10 * 60_000; // 10 minutes
  } catch {
    return true;
  }
}
