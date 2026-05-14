/**
 * @module server/token
 * @description Ephemeral token mint + constant-time compare for the local dashboard server.
 *
 * Tokens are minted at server boot, embedded in the launch URL, and never written
 * to disk. The dashboard reads the token from `?token=` and echoes it back as the
 * `X-Aouo-Token` header on every API request.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function safeEqualToken(expected: string, actual: string): boolean {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(actual, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
