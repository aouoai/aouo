/**
 * @module adapters/telegram/SessionAdapter
 * @description Per-request Telegram adapter implementing the core {@link Adapter} interface.
 *
 * Each incoming message or callback spawns a fresh SessionAdapter instance.
 * It owns the outbound message queue, tag registry, status window, and
 * content-dedup flag for that single turn. State does not survive across turns.
 *
 * Architecture:
 * - All outbound Telegram API calls flow through a serial PQueue (concurrency=1)
 *   to guarantee message ordering and prevent Telegram flood errors.
 * - First content message auto-replies to the user (smart reply).
 * - A single "status" message is created then edited in-place during tool execution.
 * - `hasSentContent` prevents the Agent from double-sending its final reply
 *   when a message tool already delivered content to the user.
 */

import { isAbsolute } from 'node:path';
import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';
import PQueue from 'p-queue';
import type {
  Adapter,
  AdapterMessagePayload,
  AdapterMessageResult,
} from '../../agent/types.js';
import { logger } from '../../lib/logger.js';
import { splitMarkdownForTelegram } from './markdown.js';
import { appendPackBadge, extractThreadId } from './routing.js';
import type { SendMessageOptions, PendingApproval, PendingChoice } from './types.js';

// ── Tool Status Labels ───────────────────────────────────────────────────────

/** User-facing labels for tool execution status. Empty string suppresses the status. */
const TOOL_LABELS: Record<string, string> = {
  read_file: '📄 Reading file',
  write_file: '✏️ Writing file',
  list_dir: '📁 Browsing directory',
  web_search: '🌐 Searching web',
  memory: '🧠 Updating memory',
  skill_view: '🎓 Loading skill',
  clarify: '💬 Asking question',
  msg: '',             // suppress — the message itself arrives immediately
  tg_msg: '',          // legacy alias for msg
  tts: '🔊 Generating audio',
  db: '🗄️ Querying database',
  persist: '💾 Saving data',
  cron: '⏰ Updating schedule',
};

// ── Keyboard Builder ─────────────────────────────────────────────────────────

/**
 * Builds a Grammy InlineKeyboard from a 2D string array.
 *
 * Each string uses `"Label|callback_data"` format. If no pipe separator
 * is present, the label is used as both text and callback data.
 *
 * @param buttons - 2D array of button strings.
 * @returns A Grammy InlineKeyboard instance.
 */
function buildInlineKeyboard(buttons: string[][]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of buttons) {
    for (const cell of row) {
      const pipeIdx = cell.lastIndexOf('|');
      if (pipeIdx === -1) {
        kb.text(cell.trim(), cell.trim());
      } else {
        kb.text(cell.substring(0, pipeIdx).trim(), cell.substring(pipeIdx + 1).trim());
      }
    }
    kb.row();
  }
  return kb;
}

// ── SessionAdapter ───────────────────────────────────────────────────────────

export class TelegramSessionAdapter implements Adapter {
  readonly platform = 'telegram' as const;
  readonly capabilities = {
    quiz: true,
    voice: true,
    audio: true,
    countdown: true,
    paginate: true,
    react: true,
    editMessage: true,
  } as const;

  private ctx: Context;
  private bot: Bot;
  private pendingApprovals: Map<string, PendingApproval>;
  private pendingChoices: Map<string, PendingChoice>;
  private activePolls: Map<string, { chatId: number; threadId?: number; options: string[]; correctIndex: number }>;
  private paginatedMessages: Map<number, { pages: string[]; buttons: string; chatId: number }>;

  /** User-defined tag → Telegram message_id mapping for later reference. */
  private taggedMessages = new Map<string, number>();
  private lastSentMessageId?: number;

  /** Strict-ordering outbound queue — all TG API calls go through this. */
  private outboundQueue = new PQueue({ concurrency: 1 });

  /** Single status message that gets edited in-place during tool execution. */
  private statusMessageId?: number;
  private statusText = '🧠 Thinking...';

  /** True once any message tool sends content. Used to skip duplicate final reply. */
  private hasSentContent = false;

  /** True after the first content message replies to the user's incoming message. */
  private hasRepliedToUser = false;

  /** Overrides chatId for contexts without ctx.chat (e.g., poll_answer). */
  private _overrideChatId?: number;

  /**
   * Captured at construction (or overridden later for events without topic
   * context such as poll_answer). Replies must include this so they land
   * back in the same forum topic instead of falling through to General.
   * `undefined` for private chats, non-forum groups, and General topic.
   */
  private threadId: number | undefined;

  /**
   * Name of the pack currently bound to this route, or null when no pack
   * has been picked yet. Used only for the final-reply badge — does not
   * influence routing or tool dispatch (those happen upstream in the
   * adapter and agent).
   */
  private activePack: string | null;

  /**
   * Whether the final `reply()` should append a "— <pack>" badge. True
   * only when the chat surface doesn't already convey the pack (e.g.,
   * forum topic title) AND multiple packs are loaded (so the badge
   * carries real information). Adapter decides; SessionAdapter just
   * applies.
   */
  private showPackBadge: boolean;

  constructor(
    ctx: Context,
    bot: Bot,
    pendingApprovals: Map<string, PendingApproval>,
    pendingChoices: Map<string, PendingChoice>,
    activePolls?: Map<string, { chatId: number; threadId?: number; options: string[]; correctIndex: number }>,
    paginatedMessages?: Map<number, { pages: string[]; buttons: string; chatId: number }>,
    opts?: { activePack?: string | null; showPackBadge?: boolean },
  ) {
    this.ctx = ctx;
    this.bot = bot;
    this.pendingApprovals = pendingApprovals;
    this.pendingChoices = pendingChoices;
    this.activePolls = activePolls ?? new Map();
    this.paginatedMessages = paginatedMessages ?? new Map();
    this.threadId = extractThreadId(ctx);
    this.activePack = opts?.activePack ?? null;
    this.showPackBadge = opts?.showPackBadge ?? false;
  }

  // ── Chat Resolution ────────────────────────────────────────────────────────

  private get chatId(): number {
    return this._overrideChatId ?? this.ctx.chat!.id;
  }

  /**
   * Spread into every outbound send-options object so the reply lands in
   * the originating forum topic. Empty object when not in a topic.
   */
  private get threadOpts(): { message_thread_id?: number } {
    return this.threadId ? { message_thread_id: this.threadId } : {};
  }

  /** Override chatId for contexts without ctx.chat (e.g., poll_answer). */
  setChatIdOverride(id: number): void {
    this._overrideChatId = id;
  }

  /**
   * Override the captured forum-topic id. Used by poll_answer event handlers
   * where the incoming context lacks `message_thread_id` but we know the
   * originating topic from the saved poll record.
   */
  setThreadIdOverride(id: number | undefined): void {
    this.threadId = id;
  }

  // ── Queue Infrastructure ───────────────────────────────────────────────────

  /** Enqueue a TG API call to guarantee strict ordering. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return this.outboundQueue.add(fn, { priority: 0 }) as Promise<T>;
  }

  /** Resolve a reference (numeric ID or tag string) to a TG message_id. */
  private resolveRef(ref?: number | string): number | undefined {
    if (!ref) return undefined;
    if (typeof ref === 'number') return ref;
    return this.taggedMessages.get(ref);
  }

  /**
   * Smart auto-reply: the first content message in a turn replies to
   * the user's incoming message. Subsequent messages don't auto-reply
   * to avoid creating noisy reply chains.
   */
  private autoReplyTo(explicitReplyTo?: number | string): number | undefined {
    const resolved = this.resolveRef(explicitReplyTo);
    if (resolved) return resolved;

    if (!this.hasRepliedToUser) {
      this.hasRepliedToUser = true;
      return this.getUserMessageId();
    }
    return undefined;
  }

  /** Track a sent message for later reference. */
  private trackMessage(messageId: number, tag?: string): void {
    this.lastSentMessageId = messageId;
    if (tag) this.taggedMessages.set(tag, messageId);
  }

  // ── Core Adapter Interface ─────────────────────────────────────────────────

  /**
   * Sends the agent's final text reply to the user.
   *
   * - Converts markdown to Telegram HTML.
   * - Falls back to stripped plain text if HTML parsing fails.
   * - Splits long messages at safe boundaries (paragraph > line > space).
   * - Skips if a message tool already sent content (dedup).
   */
  async reply(content: string): Promise<void> {
    await this.outboundQueue.onIdle();

    if (this.hasSentContent || !content) return;

    const replyTo = this.autoReplyTo();
    const replyParams = replyTo ? { message_id: replyTo } : undefined;

    // Append the active-pack badge to the final reply (when applicable) so
    // the user can tell which pack is bound to the route without running
    // `/whereami`. Badge is appended BEFORE splitting so it lands in the
    // last segment naturally — splitMarkdownForTelegram prefers paragraph
    // breaks, and the badge starts with `\n\n` so the splitter won't tear
    // it from the trailing content.
    const decorated = appendPackBadge(content, {
      activePack: this.activePack,
      show: this.showPackBadge,
    });

    const segments = splitMarkdownForTelegram(decorated, 4000);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const rp = i === 0 ? replyParams : undefined;

      const msg = await this.bot.api.sendMessage(this.chatId, segment!, {
        ...this.threadOpts,
        reply_parameters: rp,
      }).catch((err) => {
        logger.warn({ msg: 'tg_reply_failed', error: err?.message, idx: i });
        return null;
      });

      if (msg) this.trackMessage(msg.message_id);
    }
  }

  // ── Status Window (single line, edited in-place) ───────────────────────────

  /**
   * Sends the initial "Thinking..." status message.
   * Called immediately before agent.run().
   */
  async sendThinking(): Promise<void> {
    this.statusText = '🧠 Thinking...';
    const msg = await this.ctx.reply(this.statusText, {
      ...this.threadOpts,
      parse_mode: undefined,
    }).catch(() => null);
    if (msg) this.statusMessageId = msg.message_id;
  }

  /** Updates status to reflect the current tool being executed. */
  showToolCall(toolName: string, _args: Record<string, unknown>): void {
    const label = TOOL_LABELS[toolName];
    if (label === '') return;                    // suppress for message tools
    this.statusText = `${label || `⚙️ ${toolName}`}...`;
    this.enqueue(() => this.flushStatus());
  }

  /** Resets status back to "Thinking..." after a tool completes. */
  showToolResult(_toolName: string, _result: string, _isError: boolean): void {
    this.statusText = '🧠 Thinking...';
    this.enqueue(() => this.flushStatus());
  }

  /** Flush the current status line — always edits the same message. */
  private async flushStatus(): Promise<void> {
    try {
      if (!this.statusMessageId) {
        const msg = await this.ctx.reply(this.statusText, {
          ...this.threadOpts,
          parse_mode: undefined,
        }).catch(() => null);
        if (msg) this.statusMessageId = msg.message_id;
      } else {
        await this.bot.api.editMessageText(this.chatId, this.statusMessageId, this.statusText).catch(() => {});
      }
    } catch {
      // Callback contexts may lack chat info; swallow to avoid crashing the gateway.
    }
  }

  /** Deletes the status message at end of turn. */
  async cleanupStatus(): Promise<void> {
    if (this.statusMessageId) {
      await this.bot.api.deleteMessage(this.chatId, this.statusMessageId).catch(() => {});
      this.statusMessageId = undefined;
    }
  }

  // ── Interactive Dialogs ────────────────────────────────────────────────────

  /**
   * Presents an approval prompt with Allow / Deny / Always buttons.
   * Resolves when user taps a button, or times out after 5 minutes (deny).
   */
  async requestApproval(description: string): Promise<'allow' | 'deny' | 'always'> {
    const id = `approval_${Date.now()}`;

    const keyboard = new InlineKeyboard()
      .text('✅ Allow', `${id}:allow`)
      .text('❌ Deny', `${id}:deny`)
      .text('🔓 Always', `${id}:always`);

    await this.enqueue(async () => {
      await this.ctx.reply(`🔐 Approval Required\n\n${description}`, {
        ...this.threadOpts,
        reply_markup: keyboard,
      });
    });

    return new Promise<'allow' | 'deny' | 'always'>((resolve) => {
      this.pendingApprovals.set(id, { resolve });
      setTimeout(() => {
        if (this.pendingApprovals.has(id)) {
          this.pendingApprovals.delete(id);
          resolve('deny');
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Presents a multi-option choice prompt with inline buttons.
   * Times out after 10 minutes, returning empty string.
   */
  async requestChoice(description: string, choices: string[]): Promise<string> {
    const key = `choice_${Date.now()}`;
    const keyboard = new InlineKeyboard();

    choices.forEach((choice, i) => {
      keyboard.text(choice, `${key}:${i}`);
      keyboard.row();
    });

    const sent = await this.ctx.reply(description, {
      ...this.threadOpts,
      reply_markup: keyboard,
    });

    return new Promise<string>((resolve) => {
      this.pendingChoices.set(key, { resolve });
      setTimeout(() => {
        if (this.pendingChoices.has(key)) {
          this.pendingChoices.delete(key);
          this.bot.api.editMessageText(this.chatId, sent.message_id, `${description}\n\n⏱ Timed out`).catch(() => {});
          resolve('');
        }
      }, 10 * 60 * 1000);
    });
  }

  // ── Telegram-Specific Capabilities ─────────────────────────────────────────
  //
  // Message intents enter through dispatchMessage(). The helper methods below
  // are Telegram-specific implementations and all go through the outbound queue.

  async dispatchMessage(message: AdapterMessagePayload): Promise<AdapterMessageResult> {
    switch (message.type) {
      case 'text': {
        const msgId = await this.sendMessage(message.text || '', {
          replyTo: message.replyTo,
          tag: message.tag,
          parseMode: message.parseMode as SendMessageOptions['parseMode'],
        });
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'audio':
      case 'voice': {
        if (!message.url) return { ok: false, error: 'url is required', sentContent: false };
        const msgId = message.type === 'audio'
          ? await this.sendAudio(message.url, message.text, {
            replyTo: message.replyTo,
            tag: message.tag,
            parseMode: message.parseMode as SendMessageOptions['parseMode'],
          })
          : await this.sendVoice(message.url, message.text, {
            replyTo: message.replyTo,
            tag: message.tag,
            parseMode: message.parseMode as SendMessageOptions['parseMode'],
          });
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'document': {
        if (!message.url) return { ok: false, error: 'url is required', sentContent: false };
        const msgId = await this.sendDocument(message.url, {
          caption: message.text,
          replyTo: message.replyTo,
          tag: message.tag,
          parseMode: message.parseMode,
        });
        return { ok: msgId !== null, messageId: msgId, sentContent: msgId !== null };
      }

      case 'keyboard': {
        if (message.url) {
          await this.sendVoice(message.url, undefined, {});
        }
        const msgId = await this.sendKeyboard(message.text || '', message.buttons || [], {
          replyTo: message.replyTo,
          tag: message.tag,
        });
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'quiz': {
        const result = await this.sendQuiz(
          message.text || '',
          message.options || [],
          message.correct ?? 0,
          message.explanation,
        );
        return {
          ok: true,
          messageId: result.messageId,
          pollId: result.pollId,
          sentContent: true,
        };
      }

      case 'edit': {
        if (message.messageId === undefined) {
          return { ok: false, error: 'message_id is required', sentContent: false };
        }
        await this.editMessage(message.messageId, message.text || '', message.buttons);
        return { ok: true, sentContent: false };
      }

      case 'delete': {
        if (message.messageId === undefined) {
          return { ok: false, error: 'message_id is required', sentContent: false };
        }
        const deleted = await this.deleteMsg(message.messageId);
        return { ok: deleted, sentContent: false };
      }

      case 'react': {
        if (message.messageId === undefined) {
          return { ok: false, error: 'message_id is required', sentContent: false };
        }
        await this.react(message.messageId, message.emoji || '👍');
        return { ok: true, sentContent: false };
      }

      case 'action': {
        await this.sendChatAction(message.action || 'typing');
        return { ok: true, sentContent: false };
      }

      case 'countdown': {
        const msgId = await this.sendCountdown(
          message.text || '',
          message.seconds || 60,
          message.expireText || 'Time is up.',
          { replyTo: message.replyTo, tag: message.tag },
        );
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'paginate': {
        const pages = (message.text || '').split('---PAGE---').map(page => page.trim());
        const msgId = await this.sendPaginate(
          pages,
          JSON.stringify(message.buttons || []),
          { replyTo: message.replyTo, tag: message.tag },
        );
        return { ok: true, messageId: msgId, pageCount: pages.length, sentContent: true };
      }

      default:
        return { ok: false, error: `Unsupported message type: ${message.type}`, sentContent: false };
    }
  }

  /** Send a text message with optional parse mode. */
  async sendMessage(text: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');

      let msg;
      try {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          ...this.threadOpts,
          parse_mode: parseMode as any,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      } catch {
        // Fallback: send without parse mode
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          ...this.threadOpts,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      }

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  /** Send an audio file. Accepts URL or absolute local path. */
  async sendAudio(audio: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = isAbsolute(audio) || audio.startsWith('.') ? new InputFile(audio) : audio;

      const msg = await this.bot.api.sendAudio(this.chatId, source, {
        ...this.threadOpts,
        caption: caption || undefined,
        parse_mode: parseMode as any,
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  /** Send a voice note. Input MUST be OGG/Opus for native voice bubble. */
  async sendVoice(voicePath: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');

      const msg = await this.bot.api.sendVoice(this.chatId, new InputFile(voicePath), {
        ...this.threadOpts,
        caption: caption || undefined,
        parse_mode: parseMode as any,
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      if (caption) this.hasSentContent = true;
      logger.info({ msg: 'tg_voice_sent', path: voicePath });
      return msg.message_id;
    });
  }

  /** Send a message with inline keyboard buttons. */
  async sendKeyboard(text: string, buttons: string[][], opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const keyboard = buildInlineKeyboard(buttons);

      let msg;
      try {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          ...this.threadOpts,
          parse_mode: 'HTML',
          reply_markup: keyboard,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      } catch {
        msg = await this.bot.api.sendMessage(this.chatId, text, {
          ...this.threadOpts,
          reply_markup: keyboard,
          reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        });
      }

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;
      return msg.message_id;
    });
  }

  /** Send a native Telegram quiz poll with auto-scoring. */
  async sendQuiz(
    question: string,
    options: string[],
    correctIndex: number,
    explanation?: string,
  ): Promise<{ messageId: number; pollId: string }> {
    return this.enqueue(async () => {
      const msg = await this.bot.api.sendPoll(this.chatId, question, options, {
        ...this.threadOpts,
        type: 'quiz',
        correct_option_id: correctIndex,
        is_anonymous: false,
        explanation: explanation || undefined,
      } as Record<string, unknown>);

      this.trackMessage(msg.message_id);
      this.hasSentContent = true;

      this.activePolls.set(msg.poll!.id, {
        chatId: this.chatId,
        ...(this.threadId !== undefined ? { threadId: this.threadId } : {}),
        options,
        correctIndex,
      });

      return { messageId: msg.message_id, pollId: msg.poll!.id };
    });
  }

  /** Edit an existing message's text and optionally its buttons. */
  async editMessage(messageId: number | string, text: string, buttons?: string[][]): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);

      const replyMarkup = buttons ? buildInlineKeyboard(buttons) : undefined;

      await this.bot.api.editMessageText(this.chatId, msgId, text, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }).catch(async () => {
        await this.bot.api.editMessageText(this.chatId, msgId, text, {
          reply_markup: replyMarkup,
        }).catch(() => {});
      });
    });
  }

  /** Send a document (file) with optional caption. */
  async sendDocument(
    fileUrl: string,
    opts: { caption?: string; tag?: string; replyTo?: number | string; parseMode?: string } = {},
  ): Promise<number | null> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts.replyTo);
      const rp = replyTo ? { message_id: replyTo } : undefined;
      const source = isAbsolute(fileUrl) ? new InputFile(fileUrl) : fileUrl;

      const msg = await this.bot.api.sendDocument(this.chatId, source, {
        ...this.threadOpts,
        caption: opts.caption,
        parse_mode: (opts.parseMode as any) || undefined,
        reply_parameters: rp,
      }).catch((err) => {
        logger.error({ msg: 'tg_send_document_error', error: err?.message });
        return null;
      });

      if (msg) {
        this.trackMessage(msg.message_id);
        if (opts.tag) this.taggedMessages.set(opts.tag, msg.message_id);
        return msg.message_id;
      }
      return null;
    });
  }

  /** Show a chat action indicator (typing, record_voice, etc). */
  async sendChatAction(action: string = 'typing'): Promise<void> {
    return this.enqueue(async () => {
      await this.bot.api.sendChatAction(this.chatId, action as any, this.threadOpts).catch(() => {});
    });
  }

  /** Delete a message by ID or tag. */
  async deleteMsg(messageId: number | string): Promise<boolean> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string'
        ? this.taggedMessages.get(messageId) ?? Number(messageId)
        : messageId;
      if (!msgId || isNaN(msgId)) return false;
      return this.bot.api.deleteMessage(this.chatId, msgId)
        .then(() => true)
        .catch(() => false);
    });
  }

  /** Add an emoji reaction to a message. */
  async react(messageId: number | string, emoji: string): Promise<void> {
    return this.enqueue(async () => {
      const msgId = typeof messageId === 'string' ? this.taggedMessages.get(messageId) : messageId;
      if (!msgId) throw new Error(`Message not found: ${messageId}`);
      await this.bot.api.setMessageReaction(this.chatId, msgId, [
        { type: 'emoji', emoji: emoji as any },
      ]).catch(() => {});
    });
  }

  /**
   * Send a countdown timer that auto-edits at sparse intervals.
   * >10s: every 5s. ≤10s: every 1s.
   */
  async sendCountdown(
    initialText: string,
    seconds: number,
    expireText: string,
    opts?: SendMessageOptions,
  ): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const fmt = (s: number) => initialText.replace(/\{seconds\}/g, String(s));

      const msg = await this.bot.api.sendMessage(this.chatId, fmt(seconds), {
        ...this.threadOpts,
        parse_mode: 'HTML',
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;

      let remaining = seconds;
      const interval = setInterval(async () => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(interval);
          await this.bot.api.editMessageText(this.chatId, msg.message_id, expireText, {
            parse_mode: 'HTML',
          }).catch(() => {});
        } else if (remaining <= 10 || remaining % 5 === 0) {
          await this.bot.api.editMessageText(this.chatId, msg.message_id, fmt(remaining), {
            parse_mode: 'HTML',
          }).catch(() => {});
        }
      }, 1000);

      return msg.message_id;
    });
  }

  /**
   * Send a paginated message. Pages are stored in memory; the user
   * flips with ⬅️/➡️ buttons that edit the message client-side (no LLM call).
   */
  async sendPaginate(
    pages: string[],
    trailingButtons: string,
    opts?: SendMessageOptions,
  ): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);

      // Parse trailing buttons once
      let trailingRows: Array<Array<{ text: string; callback_data: string }>> = [];
      try {
        const parsed = JSON.parse(trailingButtons) as string[][];
        trailingRows = parsed.map(row =>
          row.map(cell => {
            const parts = cell.split('|');
            return { text: parts[0] ?? cell, callback_data: parts[1] ?? parts[0] ?? cell };
          }),
        );
      } catch { /* ignore */ }

      const msg = await this.bot.api.sendMessage(this.chatId, pages[0]!, {
        ...this.threadOpts,
        parse_mode: 'HTML',
        reply_parameters: replyTo ? { message_id: replyTo } : undefined,
        reply_markup: { inline_keyboard: [...trailingRows] },
      });

      this.trackMessage(msg.message_id, opts?.tag);
      this.hasSentContent = true;

      // Store for later page flipping
      this.paginatedMessages.set(msg.message_id, {
        pages,
        buttons: trailingButtons,
        chatId: this.chatId,
      });

      // Edit to add nav buttons (we needed msg.message_id first)
      if (pages.length > 1) {
        const navRow = [{ text: `➡️ 2/${pages.length}`, callback_data: `page:${msg.message_id}:1` }];
        await this.bot.api.editMessageReplyMarkup(this.chatId, msg.message_id, {
          reply_markup: { inline_keyboard: [navRow, ...trailingRows] },
        }).catch(() => {});
      }

      return msg.message_id;
    });
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  getLastMessageId(): number | undefined {
    return this.lastSentMessageId;
  }

  getTaggedMessageId(tag: string): number | undefined {
    return this.taggedMessages.get(tag);
  }

  getUserMessageId(): number | undefined {
    return this.ctx.message?.message_id;
  }
}
