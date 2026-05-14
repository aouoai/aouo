/**
 * @module agent/Agent
 * @description Core ReAct (Reason + Act) agent loop.
 *
 * The Agent orchestrates conversation between the user, LLM, and tools:
 *
 * ```text
 * User Input → [System Prompt + History + Input] → LLM
 *                                                   ↓
 *                                            Tool Calls? ──yes──→ Execute → Feed Results → Loop
 *                                                   ↓ no
 *                                            Text Response → reply() → User
 * ```
 *
 * Platform-agnostic by design — communicates with users exclusively through
 * the {@link Adapter} interface.
 */

import type { Adapter, AouoConfig, LLMProvider, Message, MessageFile } from './types.js';
import type { LoadedPack } from '../packs/types.js';
import { buildSystemPrompt, buildActiveSkillSystemPrompt } from './promptBuilder.js';
import { getToolSchemas, dispatch } from '../tools/registry.js';
import {
  getOrCreateSession,
  createSession,
  loadMessages,
  saveMessages,
  updateSessionTitle,
  getActiveSkill,
  setActiveSkill,
} from '../storage/sessionStore.js';
import { logger } from '../lib/logger.js';
import { trackLlm } from '../lib/usage.js';
import { truncateHistory, sanitizeHistory } from './history.js';
import { classifyApiError } from './errorClassifier.js';
import { ContextCompressor, estimateTokens } from './contextCompressor.js';

/**
 * Per-run tool filtering policy.
 */
export interface ToolPolicy {
  /** Whitelist of allowed tool names. If provided, overrides deny list. */
  allow?: string[];
  /** Blacklist of tool names to exclude from the run. */
  deny?: string[];
}

/**
 * Configuration for a single {@link Agent.run} execution.
 */
export interface RunOptions {
  /** Unique session key for history persistence (e.g., 'tg:12345'). */
  sessionKey: string;
  /** Explicit session ID. If omitted, resolved from sessionKey. */
  sessionId?: string;
  /** Force creation of a new session. */
  newSession?: boolean;
  /** Attached files for multimodal input. */
  files?: MessageFile[];
  /** Per-run tool filtering policy. */
  toolPolicy?: ToolPolicy;
}

/**
 * Structured result from {@link Agent.run}.
 */
export interface RunResult {
  /** Final text content for display to the user. */
  content: string;
  /** Active session ID used during this run. */
  sessionId: string;
  /** Total tool calls executed during this run. */
  toolCallCount: number;
  /** Whether a tool already delivered visible content to the user. */
  tgSent: boolean;
}

/**
 * Skill lookup function signature.
 *
 * Injected by the pack system to resolve skill names to their body content.
 * Decouples the Agent from the skill loading implementation.
 */
export type SkillResolver = (name: string) => { body: string; pack?: string } | undefined;

/**
 * The core aouo Agent encapsulating the ReAct loop.
 *
 * Lifecycle per user message:
 * 1. Load or create session and conversation history from SQLite.
 * 2. Build the system prompt (personality, rules, pack profiles, skills).
 * 3. Sanitize and truncate history.
 * 4. Execute the ReAct loop: LLM → tools → loop until text response.
 * 5. Save new messages to session history.
 * 6. Return final text response.
 */
export class Agent {
  /** @internal */
  readonly config: AouoConfig;
  /** @internal */
  readonly adapter: Adapter;

  private provider: LLMProvider;
  private packs: LoadedPack[];
  private skillIndex: string;
  private resolveSkill: SkillResolver;

  constructor(
    config: AouoConfig,
    adapter: Adapter,
    provider: LLMProvider,
    options?: {
      packs?: LoadedPack[];
      skillIndex?: string;
      resolveSkill?: SkillResolver;
    },
  ) {
    this.config = config;
    this.adapter = adapter;
    this.provider = provider;
    this.packs = options?.packs ?? [];
    this.skillIndex = options?.skillIndex ?? '';
    this.resolveSkill = options?.resolveSkill ?? (() => undefined);
  }

  /**
   * Executes the agent loop with user input.
   *
   * @param input - Raw text input from the user.
   * @param options - Execution options for session and tool policies.
   * @returns The final run result.
   */
  async run(input: string, options: RunOptions): Promise<RunResult> {
    const { sessionKey, newSession, files, toolPolicy } = options;
    let { sessionId } = options;

    // ── Session Resolution ──
    if (!sessionId) {
      sessionId = newSession
        ? await createSession(sessionKey)
        : await getOrCreateSession(sessionKey);
    }

    // ── History Loading & Cleanup ──
    let history = loadMessages(sessionId);
    const maxHistory = this.config.advanced.max_history_messages || 200;
    history = truncateHistory(history, maxHistory);
    history = trimOldToolResults(history);
    history = sanitizeHistory(history);

    // ── System Prompt ──
    const baseSystemPrompt = buildSystemPrompt(this.config, this.packs, this.skillIndex);
    const activeSkillName = getActiveSkill(sessionId);
    let systemPrompt = baseSystemPrompt;
    let activePack = this.packs.length === 1 ? this.packs[0]!.manifest.name : undefined;
    if (activeSkillName) {
      const skill = this.resolveSkill(activeSkillName);
      if (skill) {
        activePack = skill.pack ?? activePack;
        systemPrompt = buildActiveSkillSystemPrompt(baseSystemPrompt, activeSkillName, skill.body);
      }
    }

    // Append timestamp to user message (not system prompt) for cache stability
    const timestampedInput = `[${new Date().toISOString()}] ${input}`;

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: timestampedInput, files },
    ];

    const newMessages: Message[] = [{ role: 'user', content: input, files }];

    // Auto-title from first message
    if (history.length === 0) {
      const title = input.length > 50 ? input.substring(0, 50) + '...' : input;
      await updateSessionTitle(sessionId, title);
    }

    // ── ReAct Loop ──
    const maxLoops = this.config.advanced.max_react_loops;
    const contextLimit = this.config.advanced.context_window;
    const compressor = new ContextCompressor(this.config, this.provider);
    let totalToolCalls = 0;
    let toolSentContent = false;
    let compressionCount = 0;
    const MAX_COMPRESSIONS = 3;
    let lastRealTokenCount = 0;
    let firstLlmCall = true;

    for (let loop = 0; loop < maxLoops; loop++) {
      // Context compression check
      const tokenCount =
        lastRealTokenCount || estimateTokens(messages, this.config.tools.enabled.length);
      if (
        compressor.shouldCompress(messages, tokenCount, contextLimit) &&
        compressionCount < MAX_COMPRESSIONS
      ) {
        compressionCount++;
        const compressed = await compressor.compress(messages, contextLimit);
        messages.length = 0;
        messages.push(...compressed);
        lastRealTokenCount = 0;
      }

      const toolSchemas = getToolSchemas(this.config, this.adapter.platform, toolPolicy);
      const model = this.config.provider.model;

      let response;
      try {
        response = await this.provider.chat(messages, toolSchemas, this.config, { sessionId });

        // Strip file data after first LLM call to prevent repeated base64 uploads
        if (firstLlmCall && files && files.length > 0) {
          firstLlmCall = false;
          for (const m of messages) {
            if (m.files) {
              m.content =
                `[📷 ${m.files.length} image(s) attached — already processed]\n${m.content || ''}`.trim();
              delete m.files;
            }
          }
        } else {
          firstLlmCall = false;
        }
      } catch (err) {
        const classified = classifyApiError(err);
        if (classified.shouldCompress && compressionCount < MAX_COMPRESSIONS) {
          compressionCount++;
          logger.warn({ msg: 'context_overflow_recovery', loop, compressionCount });
          const compressed = await compressor.compress(messages, contextLimit);
          messages.length = 0;
          messages.push(...compressed);
          lastRealTokenCount = 0;
          continue;
        }
        throw err;
      }

      if (response.usage?.promptTokens) {
        lastRealTokenCount = response.usage.promptTokens;
      }

      // Logging
      const u = response.usage;
      const logEntry: Record<string, unknown> = {
        msg: 'llm_call',
        model,
        sessionId,
        loop,
        duration_ms: response.durationMs || 0,
      };

      if (u) {
        Object.assign(logEntry, {
          tokens: {
            in: u.promptTokens,
            out: u.completionTokens,
            cached: u.cachedTokens || 0,
            thoughts: u.thoughtsTokens || 0,
            total: u.totalTokens,
          },
        });
      }

      logEntry['tools'] = response.toolCalls?.length || 0;
      logEntry['hasContent'] = !!response.content;
      logger.info(logEntry);

      if (u) {
        trackLlm(u.promptTokens || 0, u.completionTokens || 0, u.cachedTokens || 0, this.provider.name);
      }

      // ── Tool Calls ──
      if (response.toolCalls && response.toolCalls.length > 0) {
        totalToolCalls += response.toolCalls.length;

        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || undefined,
          toolCalls: response.toolCalls,
          _rawParts: response.rawModelParts,
        };
        messages.push(assistantMsg);
        newMessages.push(assistantMsg);

        for (const toolCall of response.toolCalls) {
          if (this.config.ui.show_tool_calls && this.adapter.showToolCall) {
            this.adapter.showToolCall(toolCall.name, toolCall.args);
          }

          const result = await dispatch(toolCall.name, toolCall.args, {
            adapter: this.adapter,
            config: this.config,
            sessionId,
            sessionKey,
            pack: activePack,
          });

          // Active skill persistence on skill_view
          if (toolCall.name === 'skill_view' && !toolCall.args['file'] && !result.isError) {
            const skillName = String(toolCall.args['name'] || '');
            const skill = this.resolveSkill(skillName);
            if (skill) {
              await setActiveSkill(sessionId, skillName);
              activePack = skill.pack ?? activePack;
              messages[0] = {
                role: 'system',
                content: buildActiveSkillSystemPrompt(
                  buildSystemPrompt(this.config, this.packs, this.skillIndex),
                  skillName,
                  skill.body,
                ),
              };
              result.content = `[Skill "${skillName}" loaded — instructions are now in active context]`;
            }
          }

          if (!result.isError && toolResultSentContent(result.content)) {
            toolSentContent = true;
          }

          if (this.config.ui.show_tool_calls && this.adapter.showToolResult) {
            this.adapter.showToolResult(toolCall.name, result.content, result.isError);
          }

          const toolMsg: Message = {
            role: 'tool',
            content: result.content,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }

        continue;
      }

      // ── Text Response (loop complete) ──
      const finalContent = response.content || '';
      const assistantMsg: Message = {
        role: 'assistant',
        content: finalContent,
        _rawParts: response.rawModelParts,
      };
      newMessages.push(assistantMsg);

      const degraded = degradeForStorage(newMessages);
      await saveMessages(sessionId, degraded);

      return {
        content: finalContent,
        sessionId,
        toolCallCount: totalToolCalls,
        tgSent: toolSentContent,
      };
    }

    // Max loop fallback
    const fallbackMsg = 'Warning: Maximum loop count reached. Please try simplifying your request.';
    newMessages.push({ role: 'assistant', content: fallbackMsg });
    const degraded = degradeForStorage(newMessages);
    await saveMessages(sessionId, degraded);

    return {
      content: fallbackMsg,
      sessionId,
      toolCallCount: totalToolCalls,
      tgSent: toolSentContent,
    };
  }
}

// ── Multimodal Degradation ──────────────────────────────────────────────────

/**
 * Strips transient file data for SQLite persistence.
 *
 * Replaces the `files` field with a text placeholder to prevent
 * MB-scale base64 blobs from inflating conversation history.
 */
function degradeForStorage(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (msg.files && msg.files.length > 0) {
      const { files, ...rest } = msg;
      return {
        ...rest,
        content: `[📷 User sent ${files.length} image(s)]\n${msg.content || ''}`.trim(),
      };
    }
    return msg;
  });
}

function toolResultSentContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as { ok?: unknown; sent_content?: unknown };
    return parsed.ok === true && parsed.sent_content === true;
  } catch {
    return false;
  }
}

// ── History Tool Result Trimming ────────────────────────────────────────────

const KEEP_RECENT_TOOL_RESULTS = 8;
const MAX_OLD_TOOL_CHARS = 200;

/**
 * Truncates old tool interactions in conversation history.
 *
 * Preserves the most recent tool messages at full length.
 * Older ones are trimmed, and their paired assistant tool-call messages
 * are collapsed to compact summaries.
 */
function trimOldToolResults(history: Message[]): Message[] {
  let toolCount = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role === 'tool') {
      toolCount++;
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const content = msg.content || '';
        if (content.length > MAX_OLD_TOOL_CHARS) {
          history[i] = {
            ...msg,
            content: content.substring(0, MAX_OLD_TOOL_CHARS) + '\n[...truncated]',
          };
        }
      }
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      if (toolCount > KEEP_RECENT_TOOL_RESULTS) {
        const toolNames = msg.toolCalls.map((t) => t.name).join(', ');
        const parts: string[] = [`[Executed tools: ${toolNames}]`];

        // Preserve sent text for conversational continuity
        for (const tc of msg.toolCalls) {
          if ((tc.name === 'msg' || tc.name === 'tg_msg') && tc.args?.['text']) {
            const text = String(tc.args['text']);
            const preview = text.length > 500 ? text.substring(0, 500) + '...' : text;
            parts.push(`[Sent to user: ${preview}]`);
          }
        }
        if (msg.content) {
          parts.push(msg.content);
        }
        history[i] = { role: 'assistant', content: parts.join('\n') };
      }
    }
  }
  return history;
}
