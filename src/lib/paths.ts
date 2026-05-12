/**
 * @module lib/paths
 * @description Centralized directory hierarchy and path resolution for aouo.
 *
 * Consolidates all application data into a single root directory (`AOUO_HOME`),
 * ensuring atomic state, trivial portability, and isolated test environments.
 *
 * Directory architecture:
 * ```
 * ~/.aouo/                         (AOUO_HOME)
 * ├── config.json                  Runtime configuration
 * ├── SOUL.md                      Agent persona (core-owned)
 * ├── RULES.md                     Behavioral rules (core-owned)
 * ├── packs/                       Pack-scoped data
 * │   └── <pack>/
 * │       ├── USER.md              Pack-owned user profile
 * │       ├── MEMORY.md            Pack-owned learner state
 * │       └── data/                Pack-owned databases
 * ├── data/
 * │   ├── store/
 * │   │   └── state.db             Session histories
 * │   ├── audio/                   Voice/TTS artifacts
 * │   └── images/                  Image artifacts
 * ├── logs/                        Structured telemetry
 * ├── run/                         Process lifecycle (PID files)
 * └── cron/                        Scheduled execution state
 * ```
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * Root directory for all agent data and configuration.
 *
 * Supports environment variable injection (`AOUO_HOME`) for CI/testing isolation.
 *
 * @example
 * ```bash
 * # Override for testing
 * AOUO_HOME=/tmp/aouo-test node dist/bin/aouo.js init
 * ```
 */
export const AOUO_HOME = process.env['AOUO_HOME'] || join(homedir(), '.aouo');

// ── Configuration ────────────────────────────────────────────────────────────

export const CONFIG_PATH = join(AOUO_HOME, 'config.json');

// ── Identity (Core-owned) ────────────────────────────────────────────────────

export const SOUL_PATH = join(AOUO_HOME, 'SOUL.md');
export const RULES_PATH = join(AOUO_HOME, 'RULES.md');

// ── Packs ────────────────────────────────────────────────────────────────────

/** Root directory for pack-scoped data. */
export const PACKS_DATA_DIR = join(AOUO_HOME, 'packs');

/**
 * Resolves a path within a specific pack's data directory.
 *
 * @param packName - The pack identifier (e.g., 'english').
 * @param subpath - Relative path within the pack directory.
 * @returns Absolute path to the requested resource.
 *
 * @example
 * ```typescript
 * packDataPath('english', 'USER.md')   // ~/.aouo/packs/english/USER.md
 * packDataPath('english', 'data/study.db') // ~/.aouo/packs/english/data/study.db
 * ```
 */
export function packDataPath(packName: string, subpath: string): string {
  return join(PACKS_DATA_DIR, packName, subpath);
}

/**
 * Returns the root data directory for a specific pack.
 *
 * @param packName - The pack identifier.
 * @returns Absolute path to the pack's data root.
 */
export function packDataDir(packName: string): string {
  return join(PACKS_DATA_DIR, packName);
}

// ── Skills ───────────────────────────────────────────────────────────────────

export const SKILLS_DIR = join(AOUO_HOME, 'skills');

// ── Data (persistent storage) ────────────────────────────────────────────────

/** Root data directory for core storage. */
export const DATA_DIR = join(AOUO_HOME, 'data');

/** SQLite database root directory. */
export const STORE_DIR = join(DATA_DIR, 'store');

/** Primary database housing sessions and messages. */
export const DB_PATH = join(STORE_DIR, 'state.db');

/** Web search artifact cache. */
export const SEARCH_CACHE_DIR = join(DATA_DIR, 'search');

/** General-purpose cache directory. */
export const CACHE_DIR = join(DATA_DIR, 'cache');

/** Audio artifacts root. */
export const AUDIO_DIR = join(DATA_DIR, 'audio');

/** Voice messages from adapters. */
export const VOICE_DIR = join(AUDIO_DIR, 'voice');

/** Synthesized TTS audio outputs. */
export const TTS_DIR = join(AUDIO_DIR, 'tts');

/** Image artifacts root. */
export const IMAGE_DIR = join(DATA_DIR, 'images');

/** Images received from adapters. */
export const IMAGE_RECEIVED_DIR = join(IMAGE_DIR, 'received');

// ── Runtime ──────────────────────────────────────────────────────────────────

export const LOGS_DIR = join(AOUO_HOME, 'logs');
export const RUN_DIR = join(AOUO_HOME, 'run');

// ── Cron ────────────────────────────────────────────────────────────────────

export const CRON_DIR = join(AOUO_HOME, 'cron');
export const CRON_JOBS_PATH = join(CRON_DIR, 'jobs.json');
export const CRON_OUTPUT_DIR = join(CRON_DIR, 'output');

// ── Directory Setup ──────────────────────────────────────────────────────────

/**
 * Initializes the entire application filesystem hierarchy.
 *
 * Creates all required nested directories. Idempotent — safe to call multiple times.
 * Must be invoked before database mounting or logging.
 */
export function ensureDirectories(): void {
  const dirs = [
    AOUO_HOME,
    PACKS_DATA_DIR,
    SKILLS_DIR,
    DATA_DIR,
    STORE_DIR,
    SEARCH_CACHE_DIR,
    CACHE_DIR,
    AUDIO_DIR,
    VOICE_DIR,
    TTS_DIR,
    IMAGE_DIR,
    IMAGE_RECEIVED_DIR,
    LOGS_DIR,
    RUN_DIR,
    CRON_DIR,
    CRON_OUTPUT_DIR,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Ensures the data directory for a specific pack exists.
 *
 * @param packName - The pack identifier.
 */
export function ensurePackDataDir(packName: string): void {
  const dir = packDataDir(packName);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  // Also ensure the pack's data subdirectory exists
  const dataSubDir = join(dir, 'data');
  if (!existsSync(dataSubDir)) {
    mkdirSync(dataSubDir, { recursive: true });
  }
}

/**
 * Checks whether the agent has been initialized.
 *
 * @returns True if the configuration file exists.
 */
export function isInitialized(): boolean {
  return existsSync(CONFIG_PATH);
}
