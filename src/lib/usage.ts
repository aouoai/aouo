/**
 * @module lib/usage
 * @description Centralized analytics and cost-tracking engine.
 *
 * Persists usage metrics to SQLite (`state.db → usage_events`),
 * capturing LLM, TTS, STT, web search, and vision invocations.
 *
 * Uses atomic INSERT operations — no concurrency issues across
 * multiple processes sharing the same database.
 */

import { getDb } from '../storage/db.js';

let _schemaReady = false;

function ensureSchema(): void {
  if (_schemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      day TEXT NOT NULL,
      service TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      calls INTEGER NOT NULL DEFAULT 1,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cached_tokens INTEGER NOT NULL DEFAULT 0,
      chars INTEGER NOT NULL DEFAULT 0,
      duration_sec REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_usage_month ON usage_events(month, service);
  `);
  try {
    db.exec(`ALTER TABLE usage_events ADD COLUMN provider TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  _schemaReady = true;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentDay(): string {
  return String(new Date().getDate()).padStart(2, '0');
}

/**
 * Track LLM API call with token counts.
 *
 * @param inputTokens - Total input tokens.
 * @param outputTokens - Output tokens generated.
 * @param cachedTokens - Tokens served from cache.
 * @param provider - Provider name (e.g., 'gemini', 'openai').
 */
export function trackLlm(
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
  provider = '',
): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO usage_events (month, day, service, provider, calls, input_tokens, output_tokens, cached_tokens) VALUES (?, ?, 'llm', ?, 1, ?, ?, ?)`,
    )
    .run(currentMonth(), currentDay(), provider, inputTokens, outputTokens, cachedTokens);
}

/**
 * Track a TTS call.
 *
 * @param chars - Billable character count.
 * @param durationSec - Audio duration in seconds.
 */
export function trackTts(chars: number, durationSec: number): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO usage_events (month, day, service, calls, chars, duration_sec) VALUES (?, ?, 'tts', 1, ?, ?)`,
    )
    .run(currentMonth(), currentDay(), chars, durationSec);
}

/**
 * Track an STT call.
 *
 * @param durationSec - Audio duration transcribed in seconds.
 */
export function trackStt(durationSec: number): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO usage_events (month, day, service, calls, duration_sec) VALUES (?, ?, 'stt', 1, ?)`,
    )
    .run(currentMonth(), currentDay(), durationSec);
}

/**
 * Track a generic service call (extensible for pack-provided services).
 *
 * @param service - Service name (e.g., 'web_search', 'vision', pack-specific).
 * @param details - Optional extra fields.
 */
export function trackService(
  service: string,
  details?: { chars?: number; duration_sec?: number },
): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO usage_events (month, day, service, calls, chars, duration_sec) VALUES (?, ?, ?, 1, ?, ?)`,
    )
    .run(currentMonth(), currentDay(), service, details?.chars ?? 0, details?.duration_sec ?? 0);
}

/** Track a web search call. */
export function trackWebSearch(): void {
  trackService('web_search');
}

/** Track a Vision call. */
export function trackVision(): void {
  trackService('vision');
}
