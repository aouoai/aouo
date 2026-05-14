/**
 * @module lib/logger
 * @description Structured logging for the aouo agent runtime.
 *
 * Uses Pino for high-performance, JSON-structured logging.
 */

import pino from 'pino';

/**
 * Singleton logger instance.
 *
 * All structured log records pass through {@link redactSecrets} so accidental
 * inclusion of bot tokens, bearer tokens, or API keys in a log payload is
 * scrubbed before transport. The redaction is conservative — it only matches
 * recognized secret shapes, so plain log content is untouched.
 *
 * @example
 * ```typescript
 * logger.info({ msg: 'tool_call', tool: 'persist' });
 * ```
 */
export const logger = pino({
  name: 'aouo',
  level: process.env['LOG_LEVEL'] || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
    log: redactLogObject,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Updates the logger's log level at runtime.
 *
 * @param level - The desired log level.
 */
export function setLogLevel(level: string): void {
  logger.level = level;
}

/**
 * Strip secrets from strings before they enter log records.
 *
 * Covers:
 *   - Telegram bot tokens (`bot<digits>:<base64>`) — appear in download URLs
 *   - Bearer tokens in headers / error echoes
 *   - JSON-shaped api_key / apiKey / api-key fields
 *   - `?key=…` query parameters used by Google AI Studio
 *
 * Patterns are conservative — false negatives are acceptable, false
 * positives must not be (we'd silently corrupt logs). Use only on
 * untrusted strings such as upstream provider error bodies.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  return input
    // Telegram: `bot1234567890:AAH…` in URLs or log lines
    .replace(/bot\d{6,}:[A-Za-z0-9_-]{20,}/g, 'bot<redacted>')
    // Bearer / Authorization: Bearer xxx
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1<redacted>')
    // JSON / form: api_key: "…", apiKey="…", api-key=…
    .replace(/(["']?api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{8,}/gi, '$1<redacted>')
    // URL query: ?key=… or &key=…
    .replace(/([?&]key=)[A-Za-z0-9._-]{8,}/g, '$1<redacted>');
}

/**
 * Pino `formatters.log` hook — walks the top-level object emitted by each log
 * call and runs every string value through {@link redactSecrets}. Non-string
 * values pass through unchanged. Pino already serialized any nested data into
 * the same object level (via `mergingObject`), so a one-level walk is
 * sufficient for the structured log style this codebase uses.
 */
export function redactLogObject(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string') {
      const redacted = redactSecrets(v);
      if (redacted !== v) obj[key] = redacted;
    }
  }
  return obj;
}
