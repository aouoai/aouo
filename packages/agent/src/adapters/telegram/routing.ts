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
 * Build the inline-keyboard layout for the pack picker. One button per pack,
 * one per row so long display names don't get clipped. Callback data is
 * namespaced with `pack:` so the dispatcher can route it without colliding
 * with user-defined callbacks.
 */
export function packPickerKeyboard(packs: string[]): Array<Array<{ text: string; callback_data: string }>> {
  return packs.map((name) => [{ text: `📦 ${name}`, callback_data: `pack:${name}` }]);
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
