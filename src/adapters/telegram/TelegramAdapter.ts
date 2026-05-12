/**
 * @module adapters/telegram/TelegramAdapter
 * @description Top-level Telegram bot lifecycle manager.
 *
 * Owns the Grammy Bot instance, registers event handlers, manages per-chat
 * serial processing, and coordinates long-polling. For each incoming turn
 * it spawns a transient {@link TelegramSessionAdapter}.
 *
 * ## Domain Agnosticism
 * This adapter has ZERO domain knowledge. Commands, skills, and menus
 * are discovered dynamically from loaded packs. The adapter simply
 * routes incoming events to the Agent and renders outbound messages.
 *
 * ## Callback Routing
 * Callback queries are dispatched across four tiers:
 *   1. `approval_*` — Resolves a pending requestApproval() promise.
 *   2. `choice_*`   — Resolves a pending requestChoice() promise.
 *   3. `page:*`     — Client-side pagination (no LLM call).
 *   4. Other        — Fed into Agent.run() as `[callback] <data>`.
 *
 * ## Per-Chat Serialization
 * Multiple concurrent messages in the same chat are serialized via
 * a per-chat promise chain, preventing race conditions on shared
 * session state and status messages.
 */

import { Bot, type Context } from 'grammy';
import { Agent, type RunResult } from '../../agent/Agent.js';
import { registerAllTools } from '../../tools/registry.js';
import { logger } from '../../lib/logger.js';
import { getAllSkills, getSkill } from '../../packs/skillRegistry.js';
import { getLoadedPacks } from '../../packs/loader.js';
import { createSession, setActiveSkill } from '../../storage/sessionStore.js';
import { resolveFastPath } from '../../packs/fastpath.js';
import type { AouoConfig } from '../../config/defaults.js';
import type { MessageFile } from '../../agent/types.js';
import type { LLMProvider } from '../../agent/types.js';
import { createProvider } from '../../providers/index.js';

import { TelegramSessionAdapter } from './SessionAdapter.js';
import type { PendingApproval, PendingChoice } from './types.js';
import { formatTgError, startTypingIndicator } from './errors.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetches a URL with exponential backoff retry.
 * Used for downloading user-sent files (audio, images) from Telegram.
 */
async function fetchWithRetry(url: string, maxAttempts = 3, timeoutMs = 15_000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return res;
      logger.warn({ msg: 'fetch_retry', attempt, status: res.status });
    } catch (err) {
      lastError = err as Error;
      logger.warn({ msg: 'fetch_retry', attempt, error: (err as Error).message });
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
  }
  throw lastError ?? new Error(`Download failed after ${maxAttempts} attempts`);
}

/**
 * Resolves a button's display label from a callback_query context.
 */
function getCallbackLabel(ctx: Context, data: string): string {
  const keyboard = ctx.callbackQuery?.message?.reply_markup?.inline_keyboard;
  if (!keyboard) return data;
  for (const row of keyboard) {
    for (const btn of row) {
      if ('callback_data' in btn && btn.callback_data === data) return btn.text;
    }
  }
  return data;
}

// ── TelegramAdapter ──────────────────────────────────────────────────────────

export class TelegramAdapter {
  private bot: Bot;
  private config: AouoConfig;
  private provider: LLMProvider;

  /** Pending approval dialogs, keyed by approval ID. */
  private pendingApprovals = new Map<string, PendingApproval>();
  /** Pending choice dialogs, keyed by choice ID. */
  private pendingChoices = new Map<string, PendingChoice>();
  /** Per-chat serial execution queue. */
  private chatQueue = new Map<number, Promise<void>>();
  /** Active quiz polls for answer correlation. */
  activePolls = new Map<string, { chatId: number; options: string[]; correctIndex: number }>();
  /** In-memory paginated message store for client-side page flipping. */
  paginatedMessages = new Map<number, { pages: string[]; buttons: string; chatId: number }>();

  constructor(config: AouoConfig) {
    if (!config.telegram.bot_token) {
      throw new Error('Telegram bot_token not configured. Run "aouo init" or set AOUO_TELEGRAM_BOT_TOKEN.');
    }
    this.config = config;
    this.bot = new Bot(config.telegram.bot_token);
    this.provider = createProvider(config);
  }

  // ── Per-Chat Queue ─────────────────────────────────────────────────────────

  /**
   * Appends an async task onto the serial execution queue for a chat.
   * Errors are caught and logged — they never break the queue chain.
   */
  private enqueuePerChat(chatId: number, task: () => Promise<void>): void {
    const prev = this.chatQueue.get(chatId) ?? Promise.resolve();
    const next = prev.then(task).catch(err => {
      logger.error({ msg: 'tg_queue_error', chatId, error: (err as Error).message });
    });
    this.chatQueue.set(chatId, next);
    next.then(() => {
      if (this.chatQueue.get(chatId) === next) this.chatQueue.delete(chatId);
    });
  }

  // ── Pending Dialog Management ──────────────────────────────────────────────

  /**
   * Cancels all pending user dialogs (approvals + choices).
   * Approvals default to 'deny', choices to empty string.
   *
   * @returns Number of cancelled dialogs.
   */
  private cancelPending(): number {
    let count = 0;
    for (const [, p] of this.pendingApprovals) { p.resolve('deny'); count++; }
    this.pendingApprovals.clear();
    for (const [, p] of this.pendingChoices) { p.resolve(''); count++; }
    this.pendingChoices.clear();
    return count;
  }

  // ── Authorization ──────────────────────────────────────────────────────────

  /**
   * Checks if a user is allowed to interact with the bot.
   * If `allowed_user_ids` is empty, all users are allowed.
   */
  private isAuthorized(userId?: number): boolean {
    const allowed = this.config.telegram.allowed_user_ids;
    if (allowed.length === 0) return true;
    return userId !== undefined && allowed.includes(userId);
  }

  /**
   * Finds the first loaded pack that hasn't completed onboarding.
   * Returns null if all packs are onboarded or none are loaded.
   */
  private getUnonboardedPack() {
    return getLoadedPacks().find(p => !p.onboarded) ?? null;
  }

  // ── Core Message Pipeline ──────────────────────────────────────────────────

  /**
   * Core message handling pipeline. Used by text, voice, photo, and callback handlers.
   *
   * Orchestrates:
   * 1. Authorization check
   * 2. Typing indicator
   * 3. SessionAdapter instantiation
   * 4. Agent execution
   * 5. Fallback reply (if no tool sent content)
   * 6. Error rendering
   * 7. Status cleanup
   */
  private async handleIncoming(
    ctx: Context,
    input: string,
    cleanup?: () => void,
    files?: MessageFile[],
  ): Promise<void> {
    const userId = ctx.from?.id;

    if (!this.isAuthorized(userId)) {
      await ctx.reply('⛔ Unauthorized. Your user ID is not in the allowed list.');
      logger.warn({ msg: 'unauthorized_user', userId, chatId: ctx.chat?.id });
      return;
    }

    const sessionKey = `tg:${ctx.chat!.id}`;
    const typingInterval = startTypingIndicator(ctx);

    logger.info({
      msg: 'tg_incoming',
      chatId: ctx.chat!.id,
      userId,
      input: input.substring(0, 200),
    });

    const sessionAdapter = new TelegramSessionAdapter(
      ctx, this.bot,
      this.pendingApprovals, this.pendingChoices,
      this.activePolls, this.paginatedMessages,
    );

    const agent = new Agent(this.config, sessionAdapter, this.provider);

    // ── Onboarding guard (§4.2) ──
    // If any loaded pack hasn't been onboarded, force-activate its
    // onboarding skill so the user completes initial setup first.
    const unonboarded = this.getUnonboardedPack();
    if (unonboarded) {
      const onboardingSkill = getSkill(`${unonboarded.manifest.name}:onboarding`)
        || getSkill('onboarding');
      if (onboardingSkill) {
        await setActiveSkill(sessionKey, onboardingSkill.name);
        logger.info({
          msg: 'onboarding_forced',
          pack: unonboarded.manifest.name,
          skill: onboardingSkill.name,
        });
      }
    }

    try {
      await sessionAdapter.sendThinking();
      const result: RunResult = await agent.run(input, { sessionKey, files });

      if (!result.tgSent && result.content) {
        if (result.toolCallCount > 0) {
          logger.warn({
            msg: 'tg_bare_text_fallback',
            chatId: ctx.chat!.id,
            toolCallCount: result.toolCallCount,
          });
        }
        await sessionAdapter.reply(result.content);
      }
    } catch (err) {
      const error = err as Error;
      logger.error({ msg: 'tg_error', chatId: ctx.chat!.id, error: error.message });
      await ctx.reply(formatTgError(error), { link_preview_options: { is_disabled: true } });
    } finally {
      await sessionAdapter.cleanupStatus();
      clearInterval(typingInterval);
      cleanup?.();
    }
  }

  // ── Proactive Messaging ────────────────────────────────────────────────────

  /**
   * Sends a message to a chat outside the normal request/reply flow.
   * Used by cron jobs and system notifications.
   */
  async sendProactiveMessage(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text, {
      link_preview_options: { is_disabled: true },
    }).catch(() => {});
  }

  // ── Bot Start ──────────────────────────────────────────────────────────────

  /**
   * Initializes all handlers and starts long-polling.
   *
   * Handler registration order:
   * 1. System commands (/start, /new, /kill)
   * 2. Dynamic pack-provided skill commands
   * 3. Text message handler
   * 4. Voice message handler (STT)
   * 5. Photo message handler (Vision)
   * 6. Callback query dispatcher
   * 7. Poll answer handler
   */
  async start(): Promise<void> {
    await registerAllTools();

    // ── Discover skills and build command list ──
    const skills = getAllSkills();
    const botCommands: Array<{ command: string; description: string }> = [
      { command: 'new', description: '🔄 New session' },
    ];
    const skillCommandMap = new Map<string, string>();

    for (const skill of skills) {
      if (!skill.command) continue;
      const cmd = skill.name.replace(/[^a-z0-9_]/g, '_').substring(0, 32);
      const desc = (skill.description || skill.name).substring(0, 256);
      botCommands.push({ command: cmd, description: desc });
      skillCommandMap.set(cmd, skill.name);
    }

    // ── System commands ──

    this.bot.command('start', async (ctx) => {
      const cmdList = [...skillCommandMap.keys()].map(c => `/${c}`).join('  ');
      await ctx.reply(
        `Hello! 👋\n\n` +
        `Send me a message, or try:\n\n` +
        `${cmdList}\n\n` +
        `/new — new session  ·  /kill — force stop`,
      );
    });

    this.bot.command('new', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      this.cancelPending();
      await createSession(sessionKey);
      logger.info({ msg: 'tg_new_session', chatId: ctx.chat.id });

      // Try to activate the default start skill (if packs define one)
      const startSkill = skills.find(s => s.name === 'planner') || skills[0];
      if (startSkill) {
        const input = `[/command: ${startSkill.name}] Run the "${startSkill.name}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      } else {
        await ctx.reply('🔄 Session cleared. Send a message to start.');
      }
    });

    this.bot.command('kill', async (ctx) => {
      const sessionKey = `tg:${ctx.chat.id}`;
      const cancelled = this.cancelPending();
      await createSession(sessionKey);
      const extra = cancelled > 0 ? ` Cancelled ${cancelled} pending task(s).` : '';
      await ctx.reply(`💀 Stopped.${extra}\nSession cleared — send a message to start over.`);
      logger.info({ msg: 'tg_kill', chatId: ctx.chat.id, cancelled });
    });

    // Append system commands to the menu list
    botCommands.push(
      { command: 'kill', description: '💀 Force stop & clear' },
    );

    // Register commands with Telegram API
    await this.bot.api.setMyCommands(botCommands).catch(() => {});

    // ── Dynamic skill command handlers ──

    for (const [cmd, skillName] of skillCommandMap) {
      this.bot.command(cmd, async (ctx) => {
        logger.info({ msg: 'tg_skill_cmd', chatId: ctx.chat.id, skill: skillName });
        const sessionKey = `tg:${ctx.chat.id}`;
        await createSession(sessionKey);
        const input = `[/command: ${skillName}] Run the "${skillName}" skill now.`;
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
      });
    }

    // ── Text message handler ──

    this.bot.on('message:text', async (ctx) => {
      logger.info({
        msg: 'tg_message',
        chatId: ctx.chat.id,
        userId: ctx.from?.id,
        text: ctx.message.text.substring(0, 100),
      });
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, ctx.message.text));
    });

    // ── Voice message handler ──

    this.bot.on('message:voice', async (ctx) => {
      logger.info({
        msg: 'tg_voice',
        chatId: ctx.chat.id,
        duration: ctx.message.voice.duration,
      });

      // Download voice file
      let audioPath: string;
      try {
        const { join } = await import('node:path');
        const { mkdirSync, writeFileSync } = await import('node:fs');
        const { AOUO_HOME } = await import('../../lib/paths.js');

        const file = await ctx.getFile();
        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetchWithRetry(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        const voiceDir = join(AOUO_HOME, 'cache', 'voice');
        mkdirSync(voiceDir, { recursive: true });
        audioPath = join(voiceDir, `voice_${Date.now()}.ogg`);
        writeFileSync(audioPath, buffer);
      } catch (err) {
        logger.error({ msg: 'tg_voice_download_error', error: (err as Error).message });
        await ctx.reply('❌ Voice download failed, please try again.');
        return;
      }

      // STT is pack-provided — try dynamic import
      let transcript = '';
      try {
        const stt = await import('../../lib/stt.js');
        const result = await stt.transcribeAudio(audioPath, this.config);
        if (result.success && result.transcript) {
          transcript = result.transcript;
        } else {
          await ctx.reply(`🎤 ${result.error || 'Could not recognize speech'}`);
          return;
        }
      } catch {
        // No STT module — pass raw audio path reference
        transcript = '[voice message — STT not available]';
      }

      const input = `[Voice message | audio_path: ${audioPath}]\n"${transcript}"`;
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    // ── Photo message handler ──

    this.bot.on('message:photo', async (ctx) => {
      const caption = ctx.message.caption || '';
      logger.info({
        msg: 'tg_photo',
        chatId: ctx.chat.id,
        caption: caption.substring(0, 100),
      });

      // Download largest photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      let imagePath = '';

      try {
        const { join, extname } = await import('node:path');
        const { mkdirSync, writeFileSync } = await import('node:fs');
        const { AOUO_HOME } = await import('../../lib/paths.js');

        if (!photo) {
          await ctx.reply('❌ No photo found.');
          return;
        }
        const file = await ctx.api.getFile(photo.file_id);
        if (!file.file_path) {
          await ctx.reply('❌ Failed to download image.');
          return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${this.config.telegram.bot_token}/${file.file_path}`;
        const response = await fetchWithRetry(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        const imageDir = join(AOUO_HOME, 'cache', 'images');
        mkdirSync(imageDir, { recursive: true });
        const ext = extname(file.file_path) || '.jpg';
        imagePath = join(imageDir, `photo_${Date.now()}${ext}`);
        writeFileSync(imagePath, buffer);
      } catch (err) {
        logger.error({ msg: 'tg_photo_download_error', error: (err as Error).message });
        await ctx.reply('❌ Image download failed, please try again.');
        return;
      }

      // Vision is pack-provided — try dynamic import
      let visionDesc = '';
      try {
        const vision = await import('../../lib/vision.js');
        const result = await vision.analyzeImage(imagePath, this.config, caption || undefined);
        if (result.success && result.description) {
          visionDesc = result.description;
        }
      } catch {
        // No vision module — pass image as file attachment
        const ext = imagePath.split('.').pop() || 'jpg';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
          gif: 'image/gif', webp: 'image/webp',
        };
        const files: MessageFile[] = [{ path: imagePath, mimeType: mimeMap[ext] || 'image/jpeg' }];
        const input = caption ? `[Photo: "${caption}"]` : '[User sent a photo]';
        this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input, undefined, files));
        return;
      }

      const input = caption
        ? `[Photo with caption: "${caption}"]\n[Vision: ${visionDesc}]`
        : `[User sent a photo]\n[Vision: ${visionDesc}]`;
      this.enqueuePerChat(ctx.chat.id, () => this.handleIncoming(ctx, input));
    });

    // ── Callback Query Dispatcher ──

    this.bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;

      // Always answer to dismiss Telegram loading spinner
      await ctx.answerCallbackQuery().catch(() => {});

      // Tier 1: Choice resolution
      if (data.startsWith('choice_')) {
        const sepIdx = data.indexOf(':');
        const choiceId = data.substring(0, sepIdx);
        const pending = this.pendingChoices.get(choiceId);
        if (pending) {
          this.pendingChoices.delete(choiceId);
          const selectedText = getCallbackLabel(ctx, data);
          pending.resolve(selectedText);
          await ctx.editMessageText(
            ctx.callbackQuery.message?.text + `\n\n→ ${selectedText || 'Selected'}`
          ).catch(() => {});
        }
        return;
      }

      // Tier 2: Client-side pagination
      if (data.startsWith('page:')) {
        const parts = data.split(':');
        const msgId = Number(parts[1]);
        const pageIdx = Number(parts[2]);
        const entry = this.paginatedMessages.get(msgId);
        if (entry && pageIdx >= 0 && pageIdx < entry.pages.length) {
          this.handlePageFlip(entry, msgId, pageIdx);
        }
        return;
      }

      // Tier 3: Fast-path navigation (pack-defined menus)
      if (data.startsWith('nav:') || data === 'menu') {
        const pageId = data === 'menu' ? 'main' : data;
        const result = resolveFastPath(pageId);
        if (result.matched && result.page) {
          const { InlineKeyboard } = await import('grammy');
          const kb = new InlineKeyboard();
          for (const row of result.page.rows) {
            for (const item of row) {
              kb.text(item.text, item.callback);
            }
            kb.row();
          }
          try {
            await ctx.editMessageText(result.page.title, { reply_markup: kb });
          } catch (err) {
            logger.error({ msg: 'tg_nav_error', data, error: (err as Error).message });
          }
        }
        return;
      }

      // Tier 4: Generic callback → route to Agent
      const userId = ctx.from?.id;
      if (!this.isAuthorized(userId)) return;

      const selectedLabel = getCallbackLabel(ctx, data);
      const matchedSkill = getSkill(data);
      const isSkillSwitch = !!matchedSkill;

      if (!isSkillSwitch) {
        await ctx.editMessageText(
          ctx.callbackQuery.message?.text + `\n\n→ ${selectedLabel}`
        ).catch(() => {});
      }

      const chatId = ctx.callbackQuery.message?.chat?.id;
      if (!chatId) return;

      const sessionKey = `tg:${chatId}`;
      const agentInput = `[callback] ${data}`;

      logger.info({
        msg: 'tg_callback',
        chatId, userId, data,
        label: selectedLabel,
        skillSwitch: isSkillSwitch,
      });

      this.enqueuePerChat(chatId, async () => {
        const sessionAdapter = new TelegramSessionAdapter(
          ctx as any, this.bot,
          this.pendingApprovals, this.pendingChoices,
          this.activePolls, this.paginatedMessages,
        );

        const agent = new Agent(this.config, sessionAdapter, this.provider);

        try {
          await sessionAdapter.sendThinking();
          const runOpts: Record<string, unknown> = { sessionKey };

          if (isSkillSwitch) {
            const newSid = await createSession(sessionKey);
            await setActiveSkill(newSid, data);
            runOpts.sessionId = newSid;
          }

          const result: RunResult = await agent.run(agentInput, runOpts as any);
          if (!result.tgSent && result.content) {
            await sessionAdapter.reply(result.content);
          }
        } catch (err) {
          logger.error({ msg: 'tg_callback_error', chatId, error: (err as Error).message });
          await this.bot.api.sendMessage(chatId, formatTgError(err as Error), {
            link_preview_options: { is_disabled: true },
          }).catch(() => {});
        } finally {
          await sessionAdapter.cleanupStatus();
        }
      });
    });

    // ── Poll Answer Handler (quiz feedback) ──

    this.bot.on('poll_answer', async (ctx) => {
      const answer = ctx.pollAnswer;
      const pollId = answer.poll_id;
      const poll = this.activePolls.get(pollId);
      if (!poll) return;

      const userId = answer.user?.id;
      if (!this.isAuthorized(userId)) return;

      const selectedIdx = answer.option_ids?.[0];
      if (selectedIdx === undefined) return;

      const selectedOption = poll.options[selectedIdx] || `Option ${selectedIdx}`;
      const isCorrect = selectedIdx === poll.correctIndex;
      const correctOption = poll.options[poll.correctIndex] || `Option ${poll.correctIndex}`;

      const input = isCorrect
        ? `[Quiz answer] User answered: "${selectedOption}" ✅ Correct`
        : `[Quiz answer] User answered: "${selectedOption}" ❌ Wrong (correct: "${correctOption}")`;

      logger.info({ msg: 'tg_poll_answer', chatId: poll.chatId, userId, pollId, isCorrect });

      this.enqueuePerChat(poll.chatId, async () => {
        const sessionKey = `tg:${poll.chatId}`;
        const sessionAdapter = new TelegramSessionAdapter(
          ctx as any, this.bot,
          this.pendingApprovals, this.pendingChoices,
          this.activePolls, this.paginatedMessages,
        );
        sessionAdapter.setChatIdOverride(poll.chatId);
        const agent = new Agent(this.config, sessionAdapter, this.provider);

        try {
          const result: RunResult = await agent.run(input, { sessionKey });
          if (!result.tgSent && result.content) {
            await sessionAdapter.reply(result.content);
          }
        } catch (err) {
          logger.error({ msg: 'tg_poll_error', chatId: poll.chatId, error: (err as Error).message });
        }
      });

      this.activePolls.delete(pollId);
    });

    // ── Start Bot ──

    logger.info({ msg: 'tg_bot_starting' });
    console.log('[gateway] Telegram bot starting...');

    // Start optional scheduler if configured
    if (this.config.cron?.enabled) {
      try {
        const { startScheduler } = await import('../../lib/scheduler.js');
        startScheduler(this.config, {
          sendProactiveMessage: (chatId: number, text: string) => this.sendProactiveMessage(chatId, text),
        });
      } catch { /* scheduler not available */ }
    }

    await this.bot.start({
      onStart: (info) => {
        console.log(`[gateway] Bot @${info.username} is running`);
        logger.info({ msg: 'tg_bot_started', username: info.username });
      },
    });
  }

  // ── Page Flip (client-side, no LLM call) ───────────────────────────────────

  private async handlePageFlip(
    entry: { pages: string[]; buttons: string; chatId: number },
    msgId: number,
    pageIdx: number,
  ): Promise<void> {
    const pageCount = entry.pages.length;
    const navRow: Array<{ text: string; callback_data: string }> = [];

    if (pageIdx > 0) {
      navRow.push({ text: `⬅️ ${pageIdx}/${pageCount}`, callback_data: `page:${msgId}:${pageIdx - 1}` });
    }
    if (pageIdx < pageCount - 1) {
      navRow.push({ text: `➡️ ${pageIdx + 2}/${pageCount}`, callback_data: `page:${msgId}:${pageIdx + 1}` });
    }

    let trailingRows: Array<Array<{ text: string; callback_data: string }>> = [];
    try {
      const parsed = JSON.parse(entry.buttons) as string[][];
      trailingRows = parsed.map(row =>
        row.map(cell => {
          const parts = cell.split('|');
          return { text: parts[0] ?? cell, callback_data: parts[1] ?? parts[0] ?? cell };
        }),
      );
    } catch { /* ignore */ }

    try {
      await this.bot.api.editMessageText(entry.chatId, msgId, entry.pages[pageIdx]!, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            ...(navRow.length ? [navRow] : []),
            ...trailingRows,
          ],
        },
      });
    } catch (err) {
      logger.error({ msg: 'page_flip_failed', msgId, pageIdx, error: (err as Error).message });
    }
  }

  // ── Shutdown ───────────────────────────────────────────────────────────────

  /** Gracefully stops the bot and optional scheduler. */
  async stop(): Promise<void> {
    try {
      const { stopScheduler } = await import('../../lib/scheduler.js');
      stopScheduler();
    } catch { /* no scheduler */ }

    this.bot.stop();
  }
}
