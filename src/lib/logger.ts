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
