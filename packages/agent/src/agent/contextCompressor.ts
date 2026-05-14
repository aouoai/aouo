/**
 * @module agent/contextCompressor
 * @description State-aware context compression for conversation memory.
 *
 * Architecture:
 * 1. **Protection Zones**: Preserves the system prompt (head) and recent
 *    user dialogue (tail).
 * 2. **Summarization**: Isolates the middle segment and proxies it to an
 *    LLM to generate a structured semantic summary.
 * 3. **Tool Pre-trimming**: Truncates oversized tool outputs before
 *    summarization to maximize extraction density.
 */

import type { Message, LLMProvider, AouoConfig } from './types.js';
import { logger } from '../lib/logger.js';

/**
 * Contract for a context engine that can measure and compress messages.
 */
export interface ContextEngine {
  /**
   * Determines whether compression should be triggered.
   *
   * @param messages - Complete conversation sequence.
   * @param estimatedTokens - Currently projected token count.
   * @param contextLimit - Model's context window limit.
   * @returns True if compression should be invoked.
   */
  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean;

  /**
   * Compresses the conversation to a smaller token footprint.
   *
   * @param messages - The original conversation sequence.
   * @param contextLimit - Context window limit guiding summarization.
   * @returns The compressed message array.
   */
  compress(messages: Message[], contextLimit: number): Promise<Message[]>;
}

/** Messages at the start of the array to always preserve (system prompt + first turns). */
const PROTECT_HEAD = 3;
/** Messages at the end of the array to always preserve (recent conversation). */
const PROTECT_TAIL = 8;
/** Maximum characters for tool results passed to summarizer. */
const MAX_TOOL_RESULT_CHARS = 2000;

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summariser. Given a section of conversation history between a user and an AI assistant, produce a structured summary in this exact format:

**Goal**: What the user is trying to accomplish (1-2 sentences)
**Progress**: What has been done so far (bullet list, max 5 items)
**Decisions**: Key decisions made and their reasons (bullet list)
**Pending**: Open questions or unresolved items (bullet list, or "None")
**Key Data**: Important file paths, variable names, URLs, numbers mentioned (bullet list, or "None")

Be concise. Preserve technical details (exact paths, commands, error messages) that would be needed to continue the work. Omit pleasantries and filler.`;

/**
 * Standard context compressor using the primary LLM provider for summarization.
 *
 * Implements dual-trigger compression:
 * 1. **Context limit**: Approaching the model's max context window.
 * 2. **Economic ceiling**: Token count exceeds a practical threshold with
 *    enough messages to indicate accumulated stale history.
 */
export class ContextCompressor implements ContextEngine {
  private config: AouoConfig;
  private provider: LLMProvider;
  private thresholdRatio: number;

  constructor(config: AouoConfig, provider: LLMProvider) {
    this.config = config;
    this.provider = provider;
    this.thresholdRatio = config.advanced.compress_threshold || 0.75;
  }

  shouldCompress(messages: Message[], estimatedTokens: number, contextLimit: number): boolean {
    const hasEnoughMessages = messages.length > PROTECT_HEAD + PROTECT_TAIL + 2;
    if (!hasEnoughMessages) return false;

    // Approaching model context limit
    const threshold = contextLimit * this.thresholdRatio;
    if (estimatedTokens > threshold) return true;

    // Economic ceiling: cap token spend within a session.
    // Sessions reaching 25K tokens / 20 messages indicate accumulated
    // practice turns worth compressing.
    const ECONOMIC_TOKEN_CEILING = 25_000;
    const ECONOMIC_MESSAGE_FLOOR = 20;
    if (estimatedTokens > ECONOMIC_TOKEN_CEILING && messages.length > ECONOMIC_MESSAGE_FLOOR) {
      return true;
    }

    return false;
  }

  async compress(messages: Message[], _contextLimit: number): Promise<Message[]> {
    if (messages.length <= PROTECT_HEAD + PROTECT_TAIL) return messages;

    const head = messages.slice(0, PROTECT_HEAD);
    const tail = messages.slice(-PROTECT_TAIL);
    const middle = messages.slice(PROTECT_HEAD, messages.length - PROTECT_TAIL);

    if (middle.length === 0) return messages;

    // Trim oversized tool outputs before summarization
    const trimmed = middle.map((m) => {
      if (m.role === 'tool' && m.content && m.content.length > MAX_TOOL_RESULT_CHARS) {
        return {
          ...m,
          content: m.content.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... [truncated]',
        };
      }
      return m;
    });

    const summaryText = await this.generateSummary(trimmed);

    const summaryMessage: Message = {
      role: 'user',
      content: `[Previous conversation summary]\n\n${summaryText}\n\n[End of summary — conversation continues below]`,
    };

    const compressed = [...head, summaryMessage, ...tail];
    logger.info({
      msg: 'context_compressed',
      originalMessages: messages.length,
      compressedMessages: compressed.length,
      middleCompressed: middle.length,
    });

    return compressed;
  }

  private async generateSummary(messages: Message[]): Promise<string> {
    const conversationText = messages
      .map((m) => {
        const role =
          m.role === 'assistant'
            ? 'Assistant'
            : m.role === 'user'
              ? 'User'
              : `Tool(${m.toolName || 'unknown'})`;
        const content =
          m.content ||
          (m.toolCalls ? `[called: ${m.toolCalls.map((t) => t.name).join(', ')}]` : '[no content]');
        return `${role}: ${content}`;
      })
      .join('\n\n');

    try {
      const response = await this.provider.chat(
        [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Summarise this conversation segment:\n\n${conversationText}` },
        ],
        [],
        this.config,
      );

      return response.content || '[Summary generation failed — no content returned]';
    } catch (err) {
      logger.error({ msg: 'compression_summary_failed', error: (err as Error).message });
      return this.fallbackSummary(messages);
    }
  }

  private fallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter((m) => m.role === 'user' && m.content).map((m) => m.content!);
    const assistantMessages = messages.filter((m) => m.role === 'assistant' && m.content);

    const lines: string[] = ['[Fallback summary — LLM call failed]'];

    if (userMessages.length > 0) {
      lines.push(
        `**User topics**: ${userMessages.slice(0, 3).map((m) => m.slice(0, 100)).join('; ')}`,
      );
    }
    if (assistantMessages.length > 0) {
      lines.push(`**Assistant responses**: ${assistantMessages.length} messages`);
    }

    const toolNames = [...new Set(messages.filter((m) => m.toolName).map((m) => m.toolName!))];
    if (toolNames.length > 0) {
      lines.push(`**Tools used**: ${toolNames.join(', ')}`);
    }

    return lines.join('\n');
  }
}

// ── Token Estimation ─────────────────────────────────────────────────────────

const CJK_RANGE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]/g;
const TOOL_SCHEMA_OVERHEAD_TOKENS = 200;

/**
 * Estimates total token count for a message array.
 *
 * Uses a character-based heuristic with CJK-aware density adjustments.
 * Strictly for threshold decisions, not billing.
 *
 * @param messages - The message chain to evaluate.
 * @param toolCount - Number of tool schemas exposed in the request.
 * @returns Estimated token count.
 */
export function estimateTokens(messages: Message[], toolCount: number = 0): number {
  let tokens = 0;
  for (const m of messages) {
    if (m.content) tokens += estimateStringTokens(m.content);
    if (m.toolCalls) tokens += estimateStringTokens(JSON.stringify(m.toolCalls));
  }
  tokens += toolCount * TOOL_SCHEMA_OVERHEAD_TOKENS;
  return Math.ceil(tokens);
}

function estimateStringTokens(text: string): number {
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const nonCjkCount = text.length - cjkCount;
  return cjkCount / 1.5 + nonCjkCount / 4;
}
