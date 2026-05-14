/**
 * @module server/handlers
 * @description JSON API handlers for the local dashboard server.
 *
 * Endpoint surface (matches the dashboard's use-config hooks):
 * - GET  /api/config             — masked snapshot for display
 * - GET  /api/config/raw         — unmasked snapshot for form values
 * - PUT  /api/config/:section    — deep-merge + persist one top-level section
 * - GET  /api/status             — doctor-style health check report
 * - GET  /api/packs              — installed pack listing
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig, deepMerge } from '../config/loader.js';
import type { AouoConfig } from '../config/defaults.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { AOUO_HOME, CONFIG_PATH, DB_PATH, PACKS_DIR, RULES_PATH, SOUL_PATH, isInitialized } from '../lib/paths.js';
import { hasCodexAuth } from '../lib/auth.js';
import { loadManifestFile } from '../packs/manifest.js';
import { scanForPacks } from '../packs/loader.js';

// ── Masking ──────────────────────────────────────────────────────────────────

function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.substring(0, 4)}****${value.substring(value.length - 4)}`;
}

/**
 * Returns a deep clone of the config with every secret field masked.
 * Mirrors the masking surface of commands/config.ts#runConfigShow.
 */
export function maskConfig(config: AouoConfig): AouoConfig {
  const masked = structuredClone(config);
  if (masked.gemini.api_key) masked.gemini.api_key = maskSecret(masked.gemini.api_key);
  if (masked.deepseek.api_key) masked.deepseek.api_key = maskSecret(masked.deepseek.api_key);
  if (masked.tools.web_search.api_key) {
    masked.tools.web_search.api_key = maskSecret(masked.tools.web_search.api_key);
  }
  if (masked.telegram.bot_token) masked.telegram.bot_token = maskSecret(masked.telegram.bot_token);
  if (masked.stt.groq_api_key) masked.stt.groq_api_key = maskSecret(masked.stt.groq_api_key);
  if (masked.azure.speech_key) masked.azure.speech_key = maskSecret(masked.azure.speech_key);
  return masked;
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface ConfigResponse {
  config: AouoConfig;
}

export function handleGetConfig(): AouoConfig {
  return maskConfig(loadConfig());
}

export function handleGetConfigRaw(): AouoConfig {
  return loadConfig();
}

const EDITABLE_SECTIONS: ReadonlySet<keyof AouoConfig> = new Set([
  'provider',
  'gemini',
  'deepseek',
  'tools',
  'security',
  'packs',
  'telegram',
  'cron',
  'stt',
  'tts',
  'azure',
  'ui',
  'advanced',
]);

export interface SaveResult {
  ok: boolean;
  error?: string;
  status?: number;
  config?: AouoConfig;
}

/**
 * Deep-merges `body` into the named section and persists the new config.
 * Rejects unknown sections and refuses to touch the `version` field.
 */
export function handlePutConfig(section: string, body: unknown): SaveResult {
  if (!EDITABLE_SECTIONS.has(section as keyof AouoConfig)) {
    return { ok: false, status: 400, error: `Unknown config section: ${section}` };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Request body must be a JSON object.' };
  }

  const current = loadConfig();
  const sectionBefore = (current as unknown as Record<string, unknown>)[section];
  const before = (sectionBefore && typeof sectionBefore === 'object'
    ? (sectionBefore as Record<string, unknown>)
    : {});
  const merged = deepMerge(before, body as Record<string, unknown>);

  const next = { ...current, [section]: merged } as AouoConfig;
  try {
    saveConfig(next);
  } catch (err) {
    return { ok: false, status: 500, error: `Failed to persist config: ${(err as Error).message}` };
  }
  return { ok: true, config: maskConfig(next) };
}

// ── Status ───────────────────────────────────────────────────────────────────

export interface StatusCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface StatusResponse {
  version: string;
  provider: string;
  home: string;
  configPath: string;
  checks: StatusCheck[];
}

export function handleGetStatus(): StatusResponse {
  const config = loadConfig();

  const nodeMajor = parseInt(process.version.slice(1), 10);
  const initialized = isInitialized();
  const dbExists = existsSync(DB_PATH);
  const telegramAllowlist = config.telegram.allowed_user_ids.length;

  const checks: StatusCheck[] = [
    {
      name: 'Node.js',
      ok: nodeMajor >= 22,
      detail: nodeMajor >= 22 ? process.version : `${process.version} (requires ≥ 22)`,
    },
    {
      name: 'Initialized',
      ok: initialized,
      detail: initialized ? AOUO_HOME : 'Not initialized. Run `aouo init`.',
    },
    {
      name: 'SOUL.md',
      ok: existsSync(SOUL_PATH),
      detail: existsSync(SOUL_PATH) ? 'present' : 'missing — rerun `aouo init`',
    },
    {
      name: 'RULES.md',
      ok: existsSync(RULES_PATH),
      detail: existsSync(RULES_PATH) ? 'present' : 'missing — rerun `aouo init`',
    },
    {
      name: 'Database',
      ok: dbExists,
      detail: dbExists ? DB_PATH : 'not yet created (created on first run)',
    },
    {
      name: 'Provider credential',
      ok: providerCredentialOk(config),
      detail: providerCredentialDetail(config),
    },
    {
      name: 'Telegram',
      ok: !config.telegram.enabled || (Boolean(config.telegram.bot_token) && telegramAllowlist > 0),
      detail: telegramDetail(config),
    },
    {
      name: 'Token quota',
      ok: true,
      detail: `session ${config.advanced.session_tokens_max} · daily ${config.advanced.daily_tokens_max}`,
    },
  ];

  return {
    version: DEFAULT_CONFIG.version,
    provider: `${config.provider.backend} (${config.provider.model})`,
    home: AOUO_HOME,
    configPath: CONFIG_PATH,
    checks,
  };
}

function providerCredentialOk(config: AouoConfig): boolean {
  switch (config.provider.backend) {
    case 'gemini':
      return Boolean(config.gemini.api_key);
    case 'codex':
      return hasCodexAuth();
    case 'deepseek':
      return Boolean(config.deepseek.api_key);
  }
}

function providerCredentialDetail(config: AouoConfig): string {
  switch (config.provider.backend) {
    case 'gemini':
      return config.gemini.api_key ? 'Gemini key configured' : 'Gemini key missing';
    case 'codex':
      return hasCodexAuth() ? 'Codex OAuth authenticated' : 'Codex OAuth not authenticated';
    case 'deepseek':
      return config.deepseek.api_key ? 'DeepSeek key configured' : 'DeepSeek key missing';
  }
}

function telegramDetail(config: AouoConfig): string {
  if (!config.telegram.enabled) return 'disabled';
  if (!config.telegram.bot_token) return 'bot token missing';
  const n = config.telegram.allowed_user_ids.length;
  return n === 0
    ? 'allowlist empty — bot will reject every message'
    : `${n} allowed user(s)`;
}

// ── Packs ────────────────────────────────────────────────────────────────────

export interface PackInfo {
  name: string;
  version: string;
  path: string;
  description: string;
  skills: number;
  cronDefaults: number;
}

export interface PacksResponse {
  packs: PackInfo[];
}

export function handleGetPacks(): PacksResponse {
  const config = loadConfig();
  const scanDirs = [PACKS_DIR, ...config.packs.scan_dirs];
  const found = scanDirs.flatMap((dir) => (existsSync(dir) ? scanForPacks(dir) : []));

  const packs: PackInfo[] = [];
  const seen = new Set<string>();

  for (const entry of found) {
    const result = loadManifestFile(join(entry.path, 'pack.yml'));
    if (!result.ok || !result.manifest) continue;
    const m = result.manifest;
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    packs.push({
      name: m.name,
      version: m.version,
      path: entry.path,
      description: m.description ?? '',
      skills: m.provided_skills.length,
      cronDefaults: m.cron_defaults.length,
    });
  }

  return { packs };
}
