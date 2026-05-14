/**
 * @module lib/pidfile
 * @description UNIX-style PID file management for background services.
 *
 * Tracks running services via PID files in `~/.aouo/run/`.
 * Supports status inspection, stale cleanup, and graceful/force stop.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_DIR } from './paths.js';

function pidPath(service: string): string {
  return join(RUN_DIR, `${service}.pid`);
}

/**
 * Writes the current process PID to the service's PID file.
 */
export function writePid(service: string): void {
  writeFileSync(pidPath(service), String(process.pid), 'utf-8');
}

/**
 * Reads the recorded PID from a service's PID file.
 */
export function readPid(service: string): number | null {
  const path = pidPath(service);
  if (!existsSync(path)) return null;
  try {
    const pid = parseInt(readFileSync(path, 'utf-8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Removes the PID file for a service.
 */
export function removePid(service: string): void {
  try {
    if (existsSync(pidPath(service))) unlinkSync(pidPath(service));
  } catch { /* ignore */ }
}

/**
 * Checks if a process is alive via `kill(pid, 0)`.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the running state of a service. Cleans stale PID files.
 */
export function isServiceRunning(service: string): { running: boolean; pid: number | null } {
  const pid = readPid(service);
  if (pid === null) return { running: false, pid: null };

  if (isProcessRunning(pid)) {
    return { running: true, pid };
  }

  // Stale PID file — process died without cleanup
  removePid(service);
  return { running: false, pid: null };
}

/**
 * Stops a running service. SIGTERM first, SIGKILL after timeout.
 */
export async function stopService(service: string, timeoutMs = 3000): Promise<boolean> {
  const { running, pid } = isServiceRunning(service);
  if (!running || pid === null) return false;

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    removePid(service);
    return false;
  }

  // Poll until process exits
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (!isProcessRunning(pid)) {
      removePid(service);
      return true;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Force kill
  try {
    process.kill(pid, 'SIGKILL');
  } catch { /* ignore */ }

  removePid(service);
  return true;
}
