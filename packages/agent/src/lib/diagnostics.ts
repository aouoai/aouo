/**
 * @module lib/diagnostics
 * @description Adapter-agnostic environment health checks for `aouo doctor`,
 *              the dashboard's status panel, and any future health endpoint
 *              (Prom exporter, readiness probe, etc.).
 *
 * Design rules:
 *   - Each check is a pure factory that returns a {@link DiagnosticCheck}.
 *   - I/O is performed inside `run(deps)` using injected dependencies, so
 *     tests can mock `fetch` without monkey-patching globals.
 *   - Results are structured ({@link DiagnosticResult}) — callers decide
 *     how to render (CLI text, JSON, Prom metrics, etc.).
 *   - Network checks are gated by an explicit `fast` flag so callers can
 *     skip them in tight loops or offline environments.
 */

import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { AouoConfig } from '../config/defaults.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticResult {
  ok: boolean;
  /** Short human-readable reason; printed after the check name. */
  detail?: string;
  /** Actionable fix the user can run/do — printed indented below the status. */
  fix?: string;
  /** Non-fatal: render in yellow, don't flip the overall exit code. */
  warning?: boolean;
  /** Set when the check was skipped (e.g., `--fast` or precondition unmet). */
  skipped?: boolean;
}

export interface DiagnosticDeps {
  /** Injectable fetch for testing. Defaults to the runtime's global fetch. */
  fetch?: typeof fetch;
  /** Override for `Date.now()`/timeouts during tests. */
  now?: () => number;
}

export interface DiagnosticCheck {
  /** Short identifier used in test assertions and JSON output. */
  id: string;
  /** Human-readable label printed by the CLI. */
  label: string;
  /** Set to true to skip when caller asks for `--fast`. */
  needsNetwork?: boolean;
  run(deps: DiagnosticDeps): Promise<DiagnosticResult>;
}

export interface RunOptions {
  /** Skip checks marked `needsNetwork: true`. */
  fast?: boolean;
}

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * Execute a list of checks in order, returning structured results.
 *
 * Network checks (those declaring `needsNetwork: true`) are short-circuited
 * to a `skipped: true` result when `opts.fast` is set. Failures don't stop
 * the run — every check executes — so the CLI can show a complete report
 * even when one early check fails.
 */
export async function runChecks(
  checks: DiagnosticCheck[],
  opts: RunOptions = {},
  deps: DiagnosticDeps = {},
): Promise<Array<{ check: DiagnosticCheck; result: DiagnosticResult }>> {
  const out: Array<{ check: DiagnosticCheck; result: DiagnosticResult }> = [];
  for (const check of checks) {
    if (opts.fast && check.needsNetwork) {
      out.push({ check, result: { ok: true, skipped: true, detail: 'skipped (--fast)' } });
      continue;
    }
    try {
      const result = await check.run(deps);
      out.push({ check, result });
    } catch (err) {
      out.push({
        check,
        result: {
          ok: false,
          detail: `unexpected error: ${(err as Error).message}`,
        },
      });
    }
  }
  return out;
}

// ── Check Factories ──────────────────────────────────────────────────────────

/**
 * Verifies the running Node version meets the documented minimum (22+).
 * Synchronous; never hits the network.
 */
export function nodeVersionCheck(actualVersion = process.version): DiagnosticCheck {
  return {
    id: 'node_version',
    label: 'Node.js version',
    async run() {
      const major = parseInt(actualVersion.slice(1), 10);
      const ok = major >= 22;
      return ok
        ? { ok: true, detail: actualVersion }
        : {
            ok: false,
            detail: `${actualVersion} (requires ≥ 22)`,
            fix: 'Install Node 22 via your version manager (nvm, fnm, volta, etc.) and re-run.',
          };
    },
  };
}

/**
 * Verifies AOUO_HOME has been initialized — SOUL.md, RULES.md, and
 * config.json all present (each is created by `aouo init`).
 */
export function initializedCheck(paths: {
  soulPath: string;
  rulesPath: string;
  configPath: string;
}): DiagnosticCheck {
  return {
    id: 'initialized',
    label: 'AOUO_HOME initialized',
    async run() {
      const missing: string[] = [];
      if (!existsSync(paths.soulPath)) missing.push('SOUL.md');
      if (!existsSync(paths.rulesPath)) missing.push('RULES.md');
      if (!existsSync(paths.configPath)) missing.push('config.json');
      if (missing.length === 0) return { ok: true };
      return {
        ok: false,
        detail: `missing: ${missing.join(', ')}`,
        fix: 'Run `aouo init` to create the missing files.',
      };
    },
  };
}

/**
 * Verifies the SQLite data directory is writable by creating and removing
 * a small probe file. Catches the "permissions changed" / "disk read-only"
 * class of failures that surface only when the gateway tries to log a
 * usage event mid-run.
 */
export function dbWritableCheck(dbDir: string): DiagnosticCheck {
  return {
    id: 'db_writable',
    label: 'Database directory writable',
    async run() {
      if (!existsSync(dbDir)) {
        return {
          ok: false,
          detail: `directory does not exist: ${dbDir}`,
          fix: 'Run `aouo init` to create the data directories.',
        };
      }
      const probe = join(dbDir, `.doctor-probe-${process.pid}-${Date.now()}.tmp`);
      try {
        writeFileSync(probe, 'ok');
        unlinkSync(probe);
        return { ok: true, detail: dbDir };
      } catch (err) {
        return {
          ok: false,
          detail: `write failed: ${(err as Error).message}`,
          fix: `Check filesystem permissions on ${dbDir}.`,
        };
      }
    },
  };
}

/**
 * Calls Telegram Bot API `getMe` with the configured token. A 200 response
 * with `ok: true` confirms the token is valid AND the network can reach
 * api.telegram.org — useful as a single combined check.
 *
 * Times out at 5 seconds so a network outage doesn't hang `aouo doctor`.
 */
export function telegramTokenCheck(botToken: string | undefined): DiagnosticCheck {
  return {
    id: 'telegram_token',
    label: 'Telegram bot token',
    needsNetwork: true,
    async run(deps) {
      if (!botToken) {
        return {
          ok: false,
          warning: true,
          detail: 'not configured',
          fix: 'Run `aouo config channels` and paste your @BotFather token.',
        };
      }
      const fetchImpl = deps.fetch ?? fetch;
      try {
        const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/getMe`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return {
            ok: false,
            detail: `HTTP ${res.status}`,
            fix: 'Token is rejected by Telegram — regenerate via @BotFather and rerun `aouo config channels`.',
          };
        }
        const body = (await res.json()) as { ok: boolean; result?: { username?: string } };
        if (!body.ok) {
          return {
            ok: false,
            detail: 'Telegram returned ok: false',
            fix: 'Token is rejected by Telegram — regenerate via @BotFather and rerun `aouo config channels`.',
          };
        }
        return { ok: true, detail: `@${body.result?.username ?? 'unknown'}` };
      } catch (err) {
        return {
          ok: false,
          detail: `network error: ${(err as Error).message}`,
          fix: 'Check your internet connection or whether api.telegram.org is blocked from this network.',
        };
      }
    },
  };
}

/**
 * Sends a minimal 1-token chat completion to verify the configured
 * provider key is valid. Cost: ≈ 0.001¢ per run — negligible for a
 * command users invoke manually a few times per week.
 *
 * Currently supports Gemini, DeepSeek, and OpenAI (API-key providers).
 * Codex uses OAuth so `hasCodexAuth()` is checked instead.
 */
export function providerKeyCheck(config: AouoConfig, hasCodexAuth: () => boolean): DiagnosticCheck {
  return {
    id: 'provider_key',
    label: 'Provider API key',
    needsNetwork: true,
    async run(deps) {
      const backend = config.provider.backend;
      const fetchImpl = deps.fetch ?? fetch;

      if (backend === 'codex') {
        return hasCodexAuth()
          ? { ok: true, detail: 'codex OAuth token present' }
          : {
              ok: false,
              detail: 'Codex OAuth not authenticated',
              fix: 'Run `aouo config provider` and complete the Codex device-auth flow.',
            };
      }

      const keyMap: Record<string, { key: string | undefined; testUrl: string }> = {
        gemini: {
          key: config.gemini.api_key,
          testUrl: `https://generativelanguage.googleapis.com/v1beta/models?key=${config.gemini.api_key}`,
        },
        deepseek: {
          key: config.deepseek.api_key,
          testUrl: 'https://api.deepseek.com/v1/models',
        },
        openai: {
          // openai may not be configured for older config files; fall back to ''
          key: (config as AouoConfig & { openai?: { api_key?: string } }).openai?.api_key,
          testUrl: 'https://api.openai.com/v1/models',
        },
      };

      const target = keyMap[backend];
      if (!target) {
        return {
          ok: true,
          skipped: true,
          detail: `no validation routine for backend '${backend}'`,
        };
      }
      if (!target.key) {
        return {
          ok: false,
          detail: `${backend} API key not configured`,
          fix: 'Run `aouo config provider` to set it.',
        };
      }

      try {
        const headers: Record<string, string> = {};
        if (backend === 'deepseek' || backend === 'openai') {
          headers['Authorization'] = `Bearer ${target.key}`;
        }
        const res = await fetchImpl(target.testUrl, {
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return { ok: true, detail: `${backend} key accepted` };
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            detail: `HTTP ${res.status} (invalid or revoked)`,
            fix: 'Regenerate the key in the provider console and run `aouo config provider`.',
          };
        }
        return {
          ok: false,
          warning: true,
          detail: `HTTP ${res.status}`,
          fix: 'Provider responded but not 200 — may be temporarily unavailable.',
        };
      } catch (err) {
        return {
          ok: false,
          warning: true,
          detail: `network error: ${(err as Error).message}`,
          fix: 'Check internet connectivity to the provider endpoint.',
        };
      }
    },
  };
}

/**
 * Generic reachability check for a URL. Used to surface a clearer error
 * when a more specific check (e.g., telegram_token) fails — sometimes
 * the underlying cause is simply "no internet."
 */
export function reachabilityCheck(url: string, label?: string): DiagnosticCheck {
  return {
    id: `reach_${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32)}`,
    label: label ?? `Reachability: ${url}`,
    needsNetwork: true,
    async run(deps) {
      const fetchImpl = deps.fetch ?? fetch;
      try {
        const res = await fetchImpl(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000),
        });
        // Treat any HTTP response as "reachable" — even 404 means DNS/TCP/TLS worked.
        return { ok: true, detail: `HTTP ${res.status}` };
      } catch (err) {
        return {
          ok: false,
          detail: `unreachable: ${(err as Error).message}`,
          fix: `Check whether ${url} is blocked by a firewall, proxy, or DNS issue.`,
        };
      }
    },
  };
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/**
 * Render one check's result as multi-line CLI output. Indented hierarchy
 * keeps the doctor command readable when run in a narrow terminal.
 */
export function formatCheckLine(
  check: DiagnosticCheck,
  result: DiagnosticResult,
): string {
  const icon = result.skipped
    ? '⏭️ '
    : result.ok
      ? '✅'
      : result.warning
        ? '⚠️ '
        : '❌';
  const detail = result.detail ? `: ${result.detail}` : '';
  const lines = [`  ${icon} ${check.label}${detail}`];
  if (result.fix && !result.ok) {
    lines.push(`     → ${result.fix}`);
  }
  return lines.join('\n');
}

/**
 * Compute the process exit code from a result set. Warnings are
 * non-fatal; skipped checks are non-fatal. Only `ok: false && !warning`
 * flips to a non-zero exit.
 */
export function computeExitCode(results: Array<{ result: DiagnosticResult }>): number {
  for (const { result } of results) {
    if (!result.ok && !result.warning && !result.skipped) return 1;
  }
  return 0;
}
