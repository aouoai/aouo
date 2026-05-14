/**
 * @module lib/daemonize
 * @description Self-fork detached daemon helper for long-running CLI services.
 *
 * Standard Node "double-fork-like" pattern adapted for single-binary CLIs:
 *  1. User runs `aouo <service> start` — this is the *parent* process.
 *  2. Parent spawns a *child* with `process.execPath` + `process.argv[1]`,
 *     passes `AOUO_DAEMON_CHILD=1`, stdio piped to a log file, and `detached: true`.
 *  3. Parent calls `child.unref()` so the event loop can exit; child survives.
 *  4. Child sees `AOUO_DAEMON_CHILD=1`, writes the pidfile, runs the actual
 *     service, and lives on as a session leader after the parent exits.
 *
 * The child is responsible for cleaning up its pidfile on graceful shutdown
 * (SIGTERM/SIGINT). `stopService` in `lib/pidfile` handles that contract.
 */

import { closeSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { LOGS_DIR } from './paths.js';

export const DAEMON_CHILD_ENV = 'AOUO_DAEMON_CHILD';

/** Returns true when the current process is a forked daemon child. */
export function isDaemonChild(): boolean {
  return process.env[DAEMON_CHILD_ENV] === '1';
}

/** Absolute path to the per-service log file. */
export function daemonLogPath(service: string): string {
  return join(LOGS_DIR, `${service}.log`);
}

/**
 * Spawns the current CLI binary as a detached daemon running the given
 * `args` (typically `['<service>', 'start']`). All stdio is appended to
 * the service log file. Returns the child PID for logging — the actual
 * pidfile is written by the *child* once it boots.
 */
export function spawnDetachedChild(service: string, args: string[]): { pid: number; logPath: string } {
  const logPath = daemonLogPath(service);
  const fd = openSync(logPath, 'a');
  try {
    const child = spawn(process.execPath, [process.argv[1]!, ...args], {
      detached: true,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, [DAEMON_CHILD_ENV]: '1' },
    });
    child.unref();
    return { pid: child.pid ?? -1, logPath };
  } finally {
    closeSync(fd);
  }
}
