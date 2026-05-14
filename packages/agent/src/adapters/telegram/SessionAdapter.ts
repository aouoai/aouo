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
    photo: true,
    voice: true,
    audio: true,
    document: true,
    editMessage: true,
  } as const;

  private ctx: Context;
  private bot: Bot;
  private pendingApprovals: Map<string, PendingApproval>;
  private pendingChoices: Map<string, PendingChoice>;

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

  // ── Streaming-reply state ────────────────────────────────────────────────
  // When `streamingReply` is fed by the provider's onToken callback we
  // create exactly one outbound message and edit it in-place, throttled
  // to avoid Telegram's 30 edits/s/chat ceiling. After the agent run
  // finishes, `finalizeStreamingReply` flushes any pending buffer and
  // (optionally) appends the active-pack badge.
  private streamingMessageId?: number;
  private streamingContent = '';
  private streamingBuffer = '';
  private streamingLastEditTs = 0;
  /** Min chars accumulated since last edit before we issue another. */
  private static readonly STREAM_MIN_BUFFER = 50;
  /** Min ms since last edit before we issue another. */
  private static readonly STREAM_MIN_INTERVAL_MS = 800;

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
    opts?: { activePack?: string | null; showPackBadge?: boolean },
  ) {
    this.ctx = ctx;
    this.bot = bot;
    this.pendingApprovals = pendingApprovals;
    this.pendingChoices = pendingChoices;
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

  // ── Streaming Reply (token-by-token edits) ────────────────────────────────

  /**
   * Feed one assistant-text delta into the streaming reply pipeline. The
   * first call creates a new outbound message; subsequent calls edit it
   * in-place — throttled by {@link STREAM_MIN_BUFFER} and
   * {@link STREAM_MIN_INTERVAL_MS} so we never hit Telegram's 30 edits/s/chat
   * rate limit.
   *
   * Fire-and-forget: serialized through {@link outboundQueue} so token
   * deltas land in order without the caller having to await each one.
   * Silent when the adapter (or the chat surface) doesn't support
   * editMessage, or when a message tool already sent the content.
   */
  streamingReply(delta: string): void {
    if (!this.capabilities.editMessage) return;
    if (this.hasSentContent) return;
    if (!delta) return;
    this.streamingContent += delta;
    this.streamingBuffer += delta;
    this.enqueue(() => this.flushStreamingIfReady());
  }

  /**
   * Inside the outbound queue: either create the streaming message (first
   * call) or edit it if the throttle window is satisfied. Idempotent —
   * safe to call repeatedly with nothing buffered.
   */
  private async flushStreamingIfReady(): Promise<void> {
    if (!this.streamingContent) return;

    if (!this.streamingMessageId) {
      // First flush — create the message.
      const msg = await this.bot.api.sendMessage(this.chatId, this.streamingContent, {
        ...this.threadOpts,
        reply_parameters: this.autoReplyTo() ? { message_id: this.autoReplyTo()! } : undefined,
      }).catch((err) => {
        logger.warn({ msg: 'tg_stream_create_failed', error: err?.message });
        return null;
      });
      if (msg) {
        this.streamingMessageId = msg.message_id;
        this.streamingLastEditTs = Date.now();
        this.streamingBuffer = '';
        this.trackMessage(msg.message_id);
      }
      return;
    }

    const now = Date.now();
    const enoughText = this.streamingBuffer.length >= TelegramSessionAdapter.STREAM_MIN_BUFFER;
    const enoughTime = now - this.streamingLastEditTs >= TelegramSessionAdapter.STREAM_MIN_INTERVAL_MS;
    if (!enoughText || !enoughTime) return;

    await this.bot.api.editMessageText(
      this.chatId,
      this.streamingMessageId,
      this.streamingContent,
    ).catch((err) => {
      logger.debug({ msg: 'tg_stream_edit_failed', error: err?.message });
    });
    this.streamingLastEditTs = now;
    this.streamingBuffer = '';
  }

  /**
   * Final edit at the end of the agent run: flush any remaining buffered
   * content, append the active-pack badge (when applicable), and mark the
   * adapter as having sent content so the post-run `reply()` short-circuits
   * instead of double-posting.
   *
   * Returns true when streaming actually delivered the reply (caller can
   * skip a subsequent `reply()`), false when no streaming happened.
   */
  async finalizeStreamingReply(): Promise<boolean> {
    if (!this.streamingMessageId) return false;
    const finalText = appendPackBadge(this.streamingContent, {
      activePack: this.activePack,
      show: this.showPackBadge,
    });
    await this.enqueue(async () => {
      try {
        await this.bot.api.editMessageText(this.chatId, this.streamingMessageId!, finalText);
      } catch (err) {
        logger.debug({ msg: 'tg_stream_finalize_failed', error: (err as Error).message });
      }
    });
    this.hasSentContent = true;
    return true;
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

      case 'photo': {
        if (!message.url) return { ok: false, error: 'url is required', sentContent: false };
        const msgId = await this.sendPhoto(message.url, message.text, {
          replyTo: message.replyTo,
          tag: message.tag,
          parseMode: message.parseMode as SendMessageOptions['parseMode'],
        });
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'keyboard': {
        const msgId = await this.sendKeyboard(message.text || '', message.buttons || [], {
          replyTo: message.replyTo,
          tag: message.tag,
        });
        return { ok: true, messageId: msgId, sentContent: true };
      }

      case 'action': {
        await this.sendChatAction(message.action || 'typing');
        return { ok: true, sentContent: false };
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

  /** Send a photo. Accepts URL or absolute local path. */
  async sendPhoto(photo: string, caption?: string, opts?: SendMessageOptions): Promise<number> {
    return this.enqueue(async () => {
      const replyTo = this.autoReplyTo(opts?.replyTo);
      const parseMode = opts?.parseMode === 'none' ? undefined : (opts?.parseMode || 'HTML');
      const source = isAbsolute(photo) || photo.startsWith('.') ? new InputFile(photo) : photo;

      const msg = await this.bot.api.sendPhoto(this.chatId, source, {
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
