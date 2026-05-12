/**
 * @module config/loader
 * @description Configuration loading, deep merging, and environment override.
 *
 * Three-layer priority system:
 * 1. Default values (lowest priority).
 * 2. User-defined JSON (`~/.aouo/config.json`).
 * 3. Environment variables (highest priority).
 *
 * No config migration is needed since this is a fresh codebase.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_PATH } from '../lib/paths.js';
import { DEFAULT_CONFIG, type AouoConfig } from './defaults.js';

// ── Deep Merge ───────────────────────────────────────────────────────────────

/**
 * Deeply merges two objects. Source values override target values.
 * Arrays are replaced entirely (not appended).
 *
 * @param target - Base object providing default values.
 * @param source - Incoming object providing overrides.
 * @returns A new merged object.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal) &&
      targetVal !== null
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

// ── Environment Overrides ────────────────────────────────────────────────────

/**
 * Applies environment variable overrides to the configuration.
 *
 * Convention: `AOUO_<SECTION>_<KEY>` in uppercase.
 * Also accepts generic names like `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`.
 *
 * @param config - The configuration object to mutate.
 * @returns The mutated configuration object.
 */
function applyEnvOverrides(config: AouoConfig): AouoConfig {
  const envMap: Record<string, (c: AouoConfig, v: string) => void> = {
    // AOUO-specific prefixes
    AOUO_GEMINI_API_KEY: (c, v) => { c.gemini.api_key = v; },
    AOUO_TAVILY_API_KEY: (c, v) => { c.tools.web_search.api_key = v; },
    AOUO_TELEGRAM_BOT_TOKEN: (c, v) => { c.telegram.bot_token = v; },
    AOUO_LOG_LEVEL: (c, v) => { c.advanced.log_level = v as AouoConfig['advanced']['log_level']; },
    AOUO_MODEL: (c, v) => { c.provider.model = v; },
    AOUO_PROVIDER_BACKEND: (c, v) => { c.provider.backend = v as AouoConfig['provider']['backend']; },

    // Generic env names (common convention)
    GEMINI_API_KEY: (c, v) => { if (!c.gemini.api_key) c.gemini.api_key = v; },
    TELEGRAM_BOT_TOKEN: (c, v) => { if (!c.telegram.bot_token) c.telegram.bot_token = v; },
    OPENAI_API_KEY: (c, v) => { if (!c.gemini.api_key) c.gemini.api_key = v; }, // fallback
  };

  for (const [envKey, setter] of Object.entries(envMap)) {
    const value = process.env[envKey];
    if (value) setter(config, value);
  }

  return config;
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _config: AouoConfig | null = null;

/**
 * Loads configuration from file and environment.
 *
 * Priority: Defaults < File < Environment.
 *
 * @returns The finalized configuration object.
 */
export function loadConfig(): AouoConfig {
  let fileConfig: Partial<AouoConfig> = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw) as Partial<AouoConfig>;
    } catch (err) {
      console.error(`Warning: Failed to parse config.json: ${(err as Error).message}`);
      console.error('   Using default configuration.');
    }
  }

  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    fileConfig as unknown as Record<string, unknown>,
  ) as unknown as AouoConfig;

  const final = applyEnvOverrides(merged);
  _config = final;
  return final;
}

/**
 * Returns the current configuration singleton, lazily loading if needed.
 */
export function getConfig(): AouoConfig {
  if (!_config) return loadConfig();
  return _config;
}

/**
 * Saves the configuration to disk.
 *
 * @param config - Configuration to save. Defaults to the active singleton.
 */
export function saveConfig(config?: AouoConfig): void {
  const toSave = config || _config;
  if (!toSave) throw new Error('No config to save.');

  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2) + '\n', 'utf-8');
  _config = toSave;
}

/**
 * Best-effort config persistence. Silently ignores write failures.
 */
export function persistConfig(config: AouoConfig): void {
  try {
    const dir = dirname(CONFIG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch {
    // Intentionally silent — in-memory config still works.
  }
}

/**
 * Resets the singleton. Used for test isolation.
 */
export function resetConfig(): void {
  _config = null;
}

export { deepMerge };
