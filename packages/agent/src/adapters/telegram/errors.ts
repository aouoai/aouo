/**
 * @module adapters/telegram/errors
 * @description Error formatting and typing indicator utilities.
 *
 * Translates raw API errors into safe, user-facing messages and
 * manages the Telegram "typing..." indicator lifecycle.
 */

import type { Context } from 'grammy';

// ── Error Classification ─────────────────────────────────────────────────────

/**
 * Translates a raw Error into a safe, user-facing Telegram message.
 *
 * Strips URLs to prevent information leakage and classifies common
 * HTTP status codes into actionable user guidance.
 *
 * @param error - The original Error from agent execution.
 * @returns A sanitized, emoji-prefixed error string.
 */
export function formatTgError(error: Error): string {
  const msg = error.message || 'Unknown error';

  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return '⚠️ Rate limit reached. Please wait a moment and try again.';
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('API_KEY_INVALID')) {
    return '⚠️ API key is invalid or expired. Check your configuration.';
  }

  if (/50[0-3]/.test(msg)) {
    return '⚠️ API service temporarily unavailable. Please try again later.';
  }

  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('AbortError')) {
    return '⚠️ Request timed out. Please try again.';
  }

  // Strip URLs for safety, truncate to 200 chars
  const clean = msg.replace(/https?:\/\/[^\s"]+/g, '[url]').substring(0, 200);
  return `⚠️ ${clean}`;
}

// ── Typing Indicator ─────────────────────────────────────────────────────────

/**
 * Starts a repeating "typing..." indicator on the chat.
 *
 * Telegram's typing indicator expires after ~5s, so we repeat every 4s.
 * Returns the interval handle for cleanup.
 *
 * @param ctx - Grammy context for the active chat.
 * @returns A clearable interval handle.
 */
export function startTypingIndicator(ctx: Context): ReturnType<typeof setInterval> {
  const send = () => ctx.replyWithChatAction('typing').catch(() => {});
  send();
  return setInterval(send, 4000);
}
