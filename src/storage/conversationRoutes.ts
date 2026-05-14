/**
 * @module storage/conversationRoutes
 * @description Adapter-agnostic conversation routing state.
 *
 * A `ConversationRoute` is the durable binding between an external address
 * (platform + chat + thread + user) and the runtime scope (active pack,
 * active skill, session). It is the source of truth used by `Agent.run`
 * to decide which pack a message belongs to.
 *
 * Lifecycle:
 *   1. Adapter receives an inbound event and builds a `ConversationAddress`.
 *   2. `getOrCreateRoute(address)` returns a route row, creating one if new.
 *   3. If `activePack` is null and multiple packs are loaded, the adapter
 *      must show a pack picker — Agent.run will refuse to enter the LLM.
 *   4. After the user picks (or in single-pack mode), `setRoutePack` binds
 *      the pack and, optionally, the default skill and session.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

/**
 * Adapter-agnostic identity for a conversation surface.
 *
 * Examples:
 *   - Telegram private chat:  { platform: 'tg', chatId: '12345', userId: '12345' }
 *   - Telegram forum topic:   { platform: 'tg', chatId: '-100…', threadId: '42' }
 *   - CLI / web UI:           { platform: 'cli', chatId: '<profile>' }
 */
export interface ConversationAddress {
  platform: string;
  chatId: string;
  threadId?: string;
  userId?: string;
}

/**
 * Materialized route row, including current active pack / skill / session.
 */
export interface ConversationRoute {
  id: string;
  address: ConversationAddress;
  activePack: string | null;
  activeSkill: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RouteRow {
  id: string;
  platform: string;
  chat_id: string;
  thread_id: string;
  user_id: string;
  active_pack: string | null;
  active_skill: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
}

function normalize(address: ConversationAddress): Required<Pick<ConversationAddress, 'platform' | 'chatId'>> & {
  threadId: string;
  userId: string;
} {
  return {
    platform: address.platform,
    chatId: address.chatId,
    threadId: address.threadId ?? '',
    userId: address.userId ?? '',
  };
}

function rowToRoute(row: RouteRow): ConversationRoute {
  const address: ConversationAddress = {
    platform: row.platform,
    chatId: row.chat_id,
  };
  if (row.thread_id) address.threadId = row.thread_id;
  if (row.user_id) address.userId = row.user_id;
  return {
    id: row.id,
    address,
    activePack: row.active_pack,
    activeSkill: row.active_skill,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns the route for an address, creating a fresh empty row if none exists.
 * The returned route is always in a usable state — caller may still need to
 * bind an active pack before invoking the agent.
 */
export function getOrCreateRoute(address: ConversationAddress): ConversationRoute {
  const db = getDb();
  const n = normalize(address);

  const existing = db
    .prepare(
      'SELECT id, platform, chat_id, thread_id, user_id, active_pack, active_skill, session_id, created_at, updated_at ' +
        'FROM conversation_routes WHERE platform = ? AND chat_id = ? AND thread_id = ? AND user_id = ?',
    )
    .get(n.platform, n.chatId, n.threadId, n.userId) as RouteRow | undefined;

  if (existing) return rowToRoute(existing);

  const id = randomUUID();
  db.prepare(
    'INSERT INTO conversation_routes (id, platform, chat_id, thread_id, user_id) VALUES (?, ?, ?, ?, ?)',
  ).run(id, n.platform, n.chatId, n.threadId, n.userId);

  const inserted = db
    .prepare(
      'SELECT id, platform, chat_id, thread_id, user_id, active_pack, active_skill, session_id, created_at, updated_at ' +
        'FROM conversation_routes WHERE id = ?',
    )
    .get(id) as RouteRow;
  return rowToRoute(inserted);
}

/**
 * Read-only lookup. Returns `null` if no route exists for the address.
 * Use this when you do not want to mint a new row (e.g., for diagnostics).
 */
export function getRouteState(address: ConversationAddress): ConversationRoute | null {
  const db = getDb();
  const n = normalize(address);
  const row = db
    .prepare(
      'SELECT id, platform, chat_id, thread_id, user_id, active_pack, active_skill, session_id, created_at, updated_at ' +
        'FROM conversation_routes WHERE platform = ? AND chat_id = ? AND thread_id = ? AND user_id = ?',
    )
    .get(n.platform, n.chatId, n.threadId, n.userId) as RouteRow | undefined;
  return row ? rowToRoute(row) : null;
}

/**
 * Bind a pack (and optionally a default skill) to a route. Clears the
 * previously-bound session_id so the next agent run mints a fresh session
 * under the new pack — this prevents history from one pack bleeding into
 * another when the user switches.
 *
 * Pass `null` for `packName` to fully unbind the route (used when a pack
 * is uninstalled or the user issues `/leave`).
 */
export function setRoutePack(
  routeId: string,
  packName: string | null,
  defaultSkill?: string | null,
): void {
  const db = getDb();
  db.prepare(
    'UPDATE conversation_routes ' +
      'SET active_pack = ?, active_skill = ?, session_id = NULL, updated_at = datetime(\'now\') ' +
      'WHERE id = ?',
  ).run(packName, defaultSkill ?? null, routeId);
}

/**
 * Attach (or clear) the bound session for a route. Used after the agent
 * mints / resolves a session under the active pack so that subsequent
 * messages on the same address resume the conversation.
 */
export function setRouteSession(routeId: string, sessionId: string | null): void {
  const db = getDb();
  db.prepare(
    'UPDATE conversation_routes SET session_id = ?, updated_at = datetime(\'now\') WHERE id = ?',
  ).run(sessionId, routeId);
}

/**
 * Update the active skill within the bound pack. Does NOT change the
 * session — the caller decides whether a skill change warrants a new
 * session.
 */
export function setRouteActiveSkill(routeId: string, skillName: string | null): void {
  const db = getDb();
  db.prepare(
    'UPDATE conversation_routes SET active_skill = ?, updated_at = datetime(\'now\') WHERE id = ?',
  ).run(skillName, routeId);
}

/**
 * Build the session key used by the rest of the storage layer for a
 * route. The key embeds the active pack so swapping packs naturally
 * isolates history.
 */
export function conversationSessionKey(
  address: ConversationAddress,
  activePack: string,
): string {
  const n = normalize(address);
  const thread = n.threadId ? `:thread:${n.threadId}` : '';
  const user = n.userId ? `:user:${n.userId}` : '';
  return `${n.platform}:${n.chatId}${thread}${user}:pack:${activePack}`;
}
