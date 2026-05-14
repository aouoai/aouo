/**
 * @module tests/lib/diagnostics
 * @description Unit tests for the doctor / health module. Fetch is
 *              injected per-check so no real network is touched.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runChecks,
  nodeVersionCheck,
  initializedCheck,
  dbWritableCheck,
  telegramTokenCheck,
  providerKeyCheck,
  reachabilityCheck,
  formatCheckLine,
  computeExitCode,
  type DiagnosticCheck,
  type DiagnosticResult,
} from '../../src/lib/diagnostics.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AouoConfig } from '../../src/config/defaults.js';

/** Build a fake `fetch` that returns the next queued response per call. */
function makeFetch(responses: Array<{ ok?: boolean; status?: number; body?: unknown; throws?: Error }>): typeof fetch {
  let i = 0;
  return (async (_url: string | URL | Request, _init?: RequestInit) => {
    const r = responses[i++];
    if (!r) throw new Error('fetch called more times than queued');
    if (r.throws) throw r.throws;
    return {
      ok: r.ok ?? (r.status ?? 200) < 400,
      status: r.status ?? 200,
      async json() { return r.body; },
    } as Response;
  }) as unknown as typeof fetch;
}

describe('lib/diagnostics', () => {
  describe('nodeVersionCheck', () => {
    it('passes when Node major >= 22', async () => {
      const r = await nodeVersionCheck('v22.5.0').run({});
      expect(r.ok).toBe(true);
      expect(r.detail).toBe('v22.5.0');
    });

    it('fails when Node major < 22 and provides a fix', async () => {
      const r = await nodeVersionCheck('v18.0.0').run({});
      expect(r.ok).toBe(false);
      expect(r.fix).toContain('Node 22');
    });
  });

  describe('initializedCheck', () => {
    it('passes when all files exist', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'diag-init-'));
      try {
        const soul = join(dir, 'SOUL.md');
        const rules = join(dir, 'RULES.md');
        const cfg = join(dir, 'config.json');
        for (const p of [soul, rules, cfg]) {
          (await import('node:fs')).writeFileSync(p, '');
        }
        const r = await initializedCheck({ soulPath: soul, rulesPath: rules, configPath: cfg }).run({});
        expect(r.ok).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports which files are missing in detail', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'diag-init-'));
      try {
        const r = await initializedCheck({
          soulPath: join(dir, 'SOUL.md'),
          rulesPath: join(dir, 'RULES.md'),
          configPath: join(dir, 'config.json'),
        }).run({});
        expect(r.ok).toBe(false);
        expect(r.detail).toContain('SOUL.md');
        expect(r.detail).toContain('RULES.md');
        expect(r.detail).toContain('config.json');
        expect(r.fix).toContain('aouo init');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('dbWritableCheck', () => {
    it('passes when the directory is writable', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'diag-db-'));
      try {
        const r = await dbWritableCheck(dir).run({});
        expect(r.ok).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails when the directory does not exist', async () => {
      const r = await dbWritableCheck('/this/path/should/not/exist/diag-test').run({});
      expect(r.ok).toBe(false);
      expect(r.fix).toContain('aouo init');
    });
  });

  describe('telegramTokenCheck', () => {
    it('warns when token is not configured (not fatal)', async () => {
      const r = await telegramTokenCheck(undefined).run({});
      expect(r.ok).toBe(false);
      expect(r.warning).toBe(true);
      expect(r.fix).toContain('aouo config channels');
    });

    it('passes when getMe returns ok:true', async () => {
      const r = await telegramTokenCheck('111:abc').run({
        fetch: makeFetch([{ ok: true, body: { ok: true, result: { username: 'aouoai_bot' } } }]),
      });
      expect(r.ok).toBe(true);
      expect(r.detail).toBe('@aouoai_bot');
    });

    it('fails on HTTP non-200 with an actionable fix', async () => {
      const r = await telegramTokenCheck('111:bad').run({
        fetch: makeFetch([{ ok: false, status: 401 }]),
      });
      expect(r.ok).toBe(false);
      expect(r.fix).toContain('@BotFather');
    });

    it('fails when network throws', async () => {
      const r = await telegramTokenCheck('111:abc').run({
        fetch: makeFetch([{ throws: new Error('ENOTFOUND') }]),
      });
      expect(r.ok).toBe(false);
      expect(r.detail).toContain('ENOTFOUND');
    });
  });

  describe('providerKeyCheck', () => {
    it('checks Codex via the auth function, not a network call', async () => {
      const config: AouoConfig = { ...DEFAULT_CONFIG, provider: { ...DEFAULT_CONFIG.provider, backend: 'codex' } };
      const r1 = await providerKeyCheck(config, () => true).run({});
      expect(r1.ok).toBe(true);
      const r2 = await providerKeyCheck(config, () => false).run({});
      expect(r2.ok).toBe(false);
      expect(r2.fix).toContain('Codex');
    });

    it('passes for gemini when API call succeeds', async () => {
      const config: AouoConfig = {
        ...DEFAULT_CONFIG,
        provider: { ...DEFAULT_CONFIG.provider, backend: 'gemini' },
        gemini: { ...DEFAULT_CONFIG.gemini, api_key: 'k1' },
      };
      const r = await providerKeyCheck(config, () => false).run({
        fetch: makeFetch([{ ok: true, status: 200 }]),
      });
      expect(r.ok).toBe(true);
    });

    it('fails for deepseek on 401 with a regenerate-key fix', async () => {
      const config: AouoConfig = {
        ...DEFAULT_CONFIG,
        provider: { ...DEFAULT_CONFIG.provider, backend: 'deepseek' },
        deepseek: { ...DEFAULT_CONFIG.deepseek, api_key: 'k1' },
      };
      const r = await providerKeyCheck(config, () => false).run({
        fetch: makeFetch([{ ok: false, status: 401 }]),
      });
      expect(r.ok).toBe(false);
      expect(r.fix).toContain('Regenerate');
    });

    it('reports missing key when the configured backend has no key', async () => {
      const config: AouoConfig = {
        ...DEFAULT_CONFIG,
        provider: { ...DEFAULT_CONFIG.provider, backend: 'gemini' },
        gemini: { ...DEFAULT_CONFIG.gemini, api_key: '' },
      };
      const r = await providerKeyCheck(config, () => false).run({});
      expect(r.ok).toBe(false);
      expect(r.detail).toContain('not configured');
    });
  });

  describe('reachabilityCheck', () => {
    it('passes when any HTTP response comes back (even 404)', async () => {
      const r = await reachabilityCheck('https://example.com').run({
        fetch: makeFetch([{ ok: false, status: 404 }]),
      });
      expect(r.ok).toBe(true);
      expect(r.detail).toBe('HTTP 404');
    });

    it('fails when fetch throws', async () => {
      const r = await reachabilityCheck('https://example.com').run({
        fetch: makeFetch([{ throws: new Error('EHOSTUNREACH') }]),
      });
      expect(r.ok).toBe(false);
      expect(r.fix).toContain('firewall');
    });
  });

  describe('runChecks', () => {
    it('runs every check in order even when one fails', async () => {
      const log: string[] = [];
      const mk = (id: string, ok: boolean): DiagnosticCheck => ({
        id,
        label: id,
        async run() {
          log.push(id);
          return { ok };
        },
      });
      const results = await runChecks([mk('a', false), mk('b', true), mk('c', true)]);
      expect(log).toEqual(['a', 'b', 'c']);
      expect(results.map((r) => r.result.ok)).toEqual([false, true, true]);
    });

    it('skips needsNetwork checks under --fast', async () => {
      const networkCheck: DiagnosticCheck = {
        id: 'net',
        label: 'network',
        needsNetwork: true,
        async run() {
          throw new Error('should not run');
        },
      };
      const offlineCheck: DiagnosticCheck = {
        id: 'off',
        label: 'offline',
        async run() {
          return { ok: true };
        },
      };
      const results = await runChecks([networkCheck, offlineCheck], { fast: true });
      expect(results[0]!.result.skipped).toBe(true);
      expect(results[0]!.result.detail).toContain('--fast');
      expect(results[1]!.result.ok).toBe(true);
    });

    it('catches unexpected exceptions per check', async () => {
      const broken: DiagnosticCheck = {
        id: 'x',
        label: 'broken',
        async run() {
          throw new Error('boom');
        },
      };
      const results = await runChecks([broken]);
      expect(results[0]!.result.ok).toBe(false);
      expect(results[0]!.result.detail).toContain('boom');
    });
  });

  describe('formatCheckLine + computeExitCode', () => {
    const check: DiagnosticCheck = { id: 'x', label: 'My check', async run() { return { ok: true }; } };

    it('renders ✅ for pass, ❌ for fail, ⚠️ for warning, ⏭️ for skipped', () => {
      expect(formatCheckLine(check, { ok: true })).toContain('✅');
      expect(formatCheckLine(check, { ok: false })).toContain('❌');
      expect(formatCheckLine(check, { ok: false, warning: true })).toContain('⚠️');
      expect(formatCheckLine(check, { ok: true, skipped: true })).toContain('⏭️');
    });

    it('appends fix lines only on failures', () => {
      expect(formatCheckLine(check, { ok: true, fix: 'do x' })).not.toContain('→');
      expect(formatCheckLine(check, { ok: false, fix: 'do x' })).toContain('→ do x');
    });

    it('computeExitCode returns 0 for all-pass and skipped, 1 for hard failures', () => {
      const ok: DiagnosticResult = { ok: true };
      const skipped: DiagnosticResult = { ok: true, skipped: true };
      const warn: DiagnosticResult = { ok: false, warning: true };
      const fail: DiagnosticResult = { ok: false };
      const wrap = (r: DiagnosticResult) => ({ result: r });
      expect(computeExitCode([wrap(ok), wrap(skipped), wrap(warn)])).toBe(0);
      expect(computeExitCode([wrap(ok), wrap(fail)])).toBe(1);
    });
  });
});

// Suppress unused-import lints when running this file standalone.
void mkdirSync;
void chmodSync;
void existsSync;
