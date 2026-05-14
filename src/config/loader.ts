/**
 * @module config/loader
 * @description Configuration loading and deep merging.
 *
 * Two-layer priority system:
 * 1. Default values (lowest priority).
 * 2. User-defined JSON (`~/.aouo/config.json`).
 *
 * Runtime settings and secrets intentionally come from config.json only.
 * `AOUO_HOME` may still select which config file is loaded, but it does not
 * override values inside the configuration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIG_PATH } from '../lib/paths.js';
import { DEFAULT_CONFIG, type AouoConfig } from './defaults.js';

function cloneConfig(config: AouoConfig): AouoConfig {
  return structuredClone(config);
}

export function createDefaultConfig(): AouoConfig {
  return cloneConfig(DEFAULT_CONFIG);
}

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

// ── Singleton ────────────────────────────────────────────────────────────────

let _config: AouoConfig | null = null;

/**
 * Loads configuration from defaults and config.json.
 *
 * Priority: Defaults < File.
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
    createDefaultConfig() as unknown as Record<string, unknown>,
    fileConfig as unknown as Record<string, unknown>,
  ) as unknown as AouoConfig;

  _config = merged;
  return merged;
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
  writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  // mode in writeFileSync only applies on creation; chmod for the in-place rewrite case.
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* non-POSIX or read-only fs */ }
  _config = toSave;
}

/**
 * Best-effort config persistence. Silently ignores write failures.
 */
export function persistConfig(config: AouoConfig): void {
  try {
    const dir = dirname(CONFIG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    try { chmodSync(CONFIG_PATH, 0o600); } catch { /* non-POSIX or read-only fs */ }
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
