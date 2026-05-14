/**
 * @module adapters/telegram/routing
 * @description Pure helpers that translate Telegram (Grammy) context objects
 *              into adapter-agnostic conversation addresses and render route
 *              state for user-facing slash commands (/pack, /whereami).
 *
 * Kept side-effect free so it is unit-testable without spinning up a Bot.
 */

import type { ConversationAddress, ConversationRoute } from '../../storage/conversationRoutes.js';

/**
 * Minimal shape of a Grammy Context that the routing helper needs. We avoid
 * importing the heavyweight Grammy `Context` type at the helper layer so this
 * module stays testable with plain fixtures.
 */
export interface TelegramRouteCtx {
  chat?: { id: number; type?: string };
  message?: { message_thread_id?: number; is_topic_message?: boolean };
  callbackQuery?: { message?: { message_thread_id?: number; chat?: { id: number } } };
}

/**
 * Build a {@link ConversationAddress} from a Grammy context.
 *
 * Routing semantics:
 *   - `chatId` is the Telegram chat id (private DM, group, or supergroup).
 *   - `threadId` is the forum topic id when the message is a topic post.
 *     The "General" topic (no `message_thread_id`) maps to the chat-level route.
 *   - `userId` is intentionally NOT included by default — group members share
 *     a single conversation route. Per-user isolation inside groups is a
 *     future capability and would change `(chatId, userId)` to a composite key.
 *
 * Returns `null` when neither `chat.id` nor a callback chat id is available
 * (e.g., poll answers without a chat — caller falls back to legacy behavior).
 */
export function buildAddressFromTelegram(ctx: TelegramRouteCtx): ConversationAddress | null {
  const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat?.id;
  if (chatId === undefined) return null;

  const address: ConversationAddress = {
    platform: 'tg',
    chatId: String(chatId),
  };

  const threadId =
    ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id;
  // Telegram emits `message_thread_id` for *every* message in a forum
  // supergroup, including the General topic — only treat it as a real topic
  // when `is_topic_message` is true or when it's a callback (which doesn't
  // carry the flag, so we accept any non-zero id).
  if (threadId !== undefined && threadId > 0) {
    const isTopic = ctx.message?.is_topic_message ?? true;
    if (isTopic) address.threadId = String(threadId);
  }

  return address;
}

/**
 * Extract the numeric forum-topic id from a Grammy context, or undefined
 * when the message is not a real topic post (private chat, group without
 * topics, or the General topic of a forum supergroup).
 *
 * Mirrors {@link buildAddressFromTelegram} so the inbound route and the
 * outbound reply agree on whether the message lives in a topic. Outbound
 * `sendMessage` / `sendAudio` / etc. should spread the result into the
 * options object as `message_thread_id` so replies land back in the
 * originating topic instead of falling through to General.
 */
export function extractThreadId(ctx: TelegramRouteCtx): number | undefined {
  const threadId =
    ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id;
  if (threadId === undefined || threadId <= 0) return undefined;
  const isTopic = ctx.message?.is_topic_message ?? true;
  return isTopic ? threadId : undefined;
}

/**
 * Build the inline-keyboard layout for the pack picker. One button per pack,
 * one per row so long display names don't get clipped. Callback data is
 * namespaced with `pack:` so the dispatcher can route it without colliding
 * with user-defined callbacks.
 *
 * When `currentPack` is provided, the matching button is prefixed with `✅ `
 * (instead of `📦 `) so the user can see at a glance which pack is currently
 * bound to this route.
 */
export function packPickerKeyboard(
  packs: string[],
  currentPack?: string,
): Array<Array<{ text: string; callback_data: string }>> {
  return packs.map((name) => {
    const prefix = name === currentPack ? '✅' : '📦';
    return [{ text: `${prefix} ${name}`, callback_data: `pack:${name}` }];
  });
}

/**
 * Append a small "— <pack>" footer to a reply so the user can tell which
 * pack is currently bound to the conversation without running `/whereami`.
 *
 * Pure helper, adapter-agnostic. The decision of *when* to badge is the
 * adapter's responsibility (typically: multiple packs loaded AND the chat
 * surface doesn't already convey it — e.g., not inside a forum topic
 * whose title is the pack name).
 *
 * Returns the content unchanged when `show` is false or `activePack` is
 * absent, so callers can pass the decision boolean down without branching.
 * Uses plain text (no parse_mode dependency) so it composes safely with
 * adapters that don't render Markdown/HTML.
 */
export function appendPackBadge(
  content: string,
  opts: { activePack?: string | null; show: boolean },
): string {
  if (!opts.show || !opts.activePack) return content;
  return `${content}\n\n— ${opts.activePack}`;
}

/**
 * Render a `/whereami` summary line for the user. Pure function so we can
 * assert format in unit tests.
 */
export function formatRouteSummary(
  route: ConversationRoute,
  loadedPackNames: string[],
): string {
  const lines: string[] = [];
  lines.push(`📍 *Where am I?*`);
  lines.push(`• platform: \`${route.address.platform}\``);
  lines.push(`• chat: \`${route.address.chatId}\``);
  if (route.address.threadId) lines.push(`• topic: \`${route.address.threadId}\``);
  lines.push(`• active pack: \`${route.activePack ?? '(none)'}\``);
  lines.push(`• active skill: \`${route.activeSkill ?? '(none)'}\``);
  lines.push(`• session: \`${route.sessionId ?? '(unbound)'}\``);
  lines.push('');
  lines.push(`Loaded packs: ${loadedPackNames.length === 0 ? '(none)' : loadedPackNames.map((n) => `\`${n}\``).join(', ')}`);
  if (loadedPackNames.length > 1 && !route.activePack) {
    lines.push('');
    lines.push('Pick one with `/use <pack>` or `/pack`.');
  }
  return lines.join('\n');
}

/**
 * Decide whether an inbound Telegram message is allowed to reach the agent.
 *
 * Policy: `allowed_user_ids` is an explicit allowlist. An empty allowlist
 * means **deny all** — the previous behavior (empty = allow all) was a
 * dangerous default since it lets any caller who learns the bot username
 * burn the operator's LLM credits. Set `telegram.allowed_user_ids` in
 * `config.json` to the Telegram numeric IDs that may use the bot.
 */
export function isUserAuthorized(allowedIds: readonly number[], userId?: number): boolean {
  if (allowedIds.length === 0) return false;
  return userId !== undefined && allowedIds.includes(userId);
}

/**
 * Parse the argument to `/use <pack>[:<skill>]`. Returns `null` when the
 * argument is missing or syntactically empty.
 */
export function parseUseCommand(raw: string): { pack: string; skill?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx === -1) return { pack: trimmed };
  const pack = trimmed.substring(0, colonIdx).trim();
  const skill = trimmed.substring(colonIdx + 1).trim();
  if (!pack) return null;
  return skill ? { pack, skill } : { pack };
}
