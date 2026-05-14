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
  // Table first — fresh installs get all columns; existing installs get a
  // no-op here and rely on the ALTER block below to backfill new columns.
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      day TEXT NOT NULL,
      service TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
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
  // Migrations — must run BEFORE any index that references new columns,
  // otherwise the index DDL fails on existing databases.
  try {
    db.exec(`ALTER TABLE usage_events ADD COLUMN provider TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  try {
    db.exec(`ALTER TABLE usage_events ADD COLUMN session_id TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* already exists */
  }
  // Now safe to create indexes that depend on migrated columns.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_events(session_id, service);
    CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_events(month, day, service);
  `);
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
 * @param sessionId - Session attribution for quota enforcement; '' if unbound.
 */
export function trackLlm(
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
  provider = '',
  sessionId = '',
): void {
  ensureSchema();
  getDb()
    .prepare(
      `INSERT INTO usage_events (month, day, service, provider, session_id, calls, input_tokens, output_tokens, cached_tokens) VALUES (?, ?, 'llm', ?, ?, 1, ?, ?, ?)`,
    )
    .run(currentMonth(), currentDay(), provider, sessionId, inputTokens, outputTokens, cachedTokens);
}

/**
 * Sum of (input + output) tokens accumulated by a specific session across its
 * entire lifetime. Used by the Agent's quota gate to enforce
 * `advanced.session_tokens_max`. Returns 0 if the session has no llm events
 * recorded yet (or for sessions tracked before the session_id column existed).
 */
export function getSessionTokenTotal(sessionId: string): number {
  ensureSchema();
  if (!sessionId) return 0;
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage_events WHERE service = 'llm' AND session_id = ?`,
    )
    .get(sessionId) as { total: number } | undefined;
  return row?.total ?? 0;
}

/**
 * Sum of (input + output) tokens recorded for LLM events on the current local
 * day. Used to enforce `advanced.daily_tokens_max`. The bucket key is
 * `(month, day)` rather than a full ISO date so it matches the persistence
 * format already used by {@link trackLlm}.
 */
export function getDailyTokenTotal(): number {
  ensureSchema();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage_events WHERE service = 'llm' AND month = ? AND day = ?`,
    )
    .get(currentMonth(), currentDay()) as { total: number } | undefined;
  return row?.total ?? 0;
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
