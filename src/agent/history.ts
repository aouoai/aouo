/**
 * @module agent/history
 * @description Conversation history utilities for the ReAct loop.
 *
 * Provides operations to sanitize and truncate message sequences:
 * - **Truncation**: Restricts message counts without severing tool
 *   results from their associated assistant invocation.
 * - **Sanitization**: Enforces LLM provider turn-ordering rules ensuring
 *   invalid patterns are safely dropped instead of triggering exceptions.
 */

import type { Message } from './types.js';
import { logger } from '../lib/logger.js';

/**
 * Truncates the message history to the specified maximum length while
 * preserving tool message continuity.
 *
 * Backtracks over leading tool responses to guarantee that tool results
 * are never retained without their originating assistant tool-call message.
 *
 * @param history - The current array of conversation messages.
 * @param maxHistory - The maximum allowed number of messages.
 * @returns A truncated array of messages.
 */
export function truncateHistory(history: Message[], maxHistory: number): Message[] {
  if (history.length <= maxHistory) return history;

  let sliceIndex = history.length - maxHistory;
  while (sliceIndex > 0 && history[sliceIndex]?.role === 'tool') {
    sliceIndex--;
  }
  const truncated = history.slice(Math.max(0, sliceIndex));
  logger.info({ msg: 'history_truncated', sliced: truncated.length });
  return truncated;
}

/**
 * Sanitizes conversation history to adhere to expected turn ordering.
 *
 * Enforces the following:
 * 1. The first message must originate from a 'user'.
 * 2. An assistant message with `toolCalls` must be followed by 'tool' responses.
 * 3. Orphaned 'tool' messages without preceding tool calls are discarded.
 * 4. Invalid sequences are skipped and logged as warnings.
 *
 * @param history - The complete array of raw conversation messages.
 * @returns A sanitized message array suitable for LLM consumption.
 */
export function sanitizeHistory(history: Message[]): Message[] {
  if (history.length === 0) return history;

  const result: Message[] = [];

  // Skip leading non-user messages
  let startIdx = 0;
  while (startIdx < history.length && history[startIdx]?.role !== 'user') {
    logger.warn({ msg: 'history_sanitize_skip_leading', role: history[startIdx]?.role });
    startIdx++;
  }

  for (let i = startIdx; i < history.length; i++) {
    const msg = history[i]!;

    if (msg.role === 'tool') {
      const prev = result[result.length - 1];
      if (prev && ((prev.role === 'assistant' && prev.toolCalls) || prev.role === 'tool')) {
        result.push(msg);
      } else {
        logger.warn({ msg: 'history_sanitize_drop_orphan_tool', toolName: msg.toolName });
      }
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Aggregate subsequent tool results
      let j = i + 1;
      const toolResults: Message[] = [];
      while (j < history.length && history[j]?.role === 'tool') {
        toolResults.push(history[j]!);
        j++;
      }

      if (toolResults.length > 0) {
        result.push(msg);
        for (const tr of toolResults) {
          result.push(tr);
        }
        i = j - 1;
      } else {
        logger.warn({
          msg: 'history_sanitize_drop_orphan_toolcall',
          tools: msg.toolCalls.map(t => t.name),
        });
      }
    } else {
      result.push(msg);
    }
  }

  if (result.length !== history.length) {
    logger.info({
      msg: 'history_sanitized',
      original: history.length,
      cleaned: result.length,
    });
  }

  return result;
}
