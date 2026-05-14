/**
 * @module storage/sessionStore
 * @description Persistent storage layer for conversational sessions and messages.
 *
 * Wraps the base database to handle multi-turn conversation persistence.
 * Ensures safe concurrent writes via retry mechanisms and manages the
 * full lifecycle of sessions and their associated messages.
 */

import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { Message } from '../agent/types.js';

const MAX_WRITE_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 200;

/**
 * Executes a synchronous database write with async retry for lock contention.
 *
 * @param fn - Synchronous database operation closure.
 * @returns Promise resolving to the operation result.
 */
async function withWriteRetry<T>(fn: () => T): Promise<T> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isLocked = err instanceof Error && err.message.includes('database is locked');
      if (isLocked && attempt < MAX_WRITE_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY_MS * (attempt + 1) + Math.random() * 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withWriteRetry: unreachable');
}

/**
 * Metadata for a conversational session.
 */
export interface SessionInfo {
  /** Session UUID. */
  id: string;
  /** External identifier key (e.g., Telegram user ID). */
  sessionKey: string;
  /** Human-readable session title. */
  title: string;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Total message count. */
  messageCount: number;
}

/**
 * Gets or creates the most recent session for a given key.
 *
 * @param sessionKey - External identifier (e.g., 'tg:12345').
 * @returns The session UUID.
 */
export async function getOrCreateSession(sessionKey: string): Promise<string> {
  const db = getDb();
  const rows = db
    .prepare('SELECT id FROM sessions WHERE session_key = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1')
    .all(sessionKey) as Array<{ id: string }>;

  if (rows.length > 0) return rows[0]!.id;

  const id = randomUUID();
  await withWriteRetry(() => {
    db.prepare('INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)').run(id, sessionKey, '');
  });

  return id;
}

/**
 * Forces creation of a new session, ignoring existing ones.
 *
 * @param sessionKey - External identifier.
 * @param title - Optional initial title.
 * @returns The new session UUID.
 */
export async function createSession(sessionKey: string, title?: string): Promise<string> {
  const db = getDb();
  const id = randomUUID();

  await withWriteRetry(() => {
    db.prepare('INSERT INTO sessions (id, session_key, title) VALUES (?, ?, ?)').run(id, sessionKey, title || '');
  });

  return id;
}

/**
 * Loads complete message history for a session, ordered by sequence.
 *
 * @param sessionId - The session UUID.
 * @returns Array of messages reconstructed from the database.
 */
export function loadMessages(sessionId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT role, content, tool_calls, tool_call_id, tool_name, raw_parts FROM messages WHERE session_id = ? ORDER BY seq ASC',
    )
    .all(sessionId) as Array<{
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
    tool_name: string | null;
    raw_parts: string | null;
  }>;

  return rows.map((row) => {
    const msg: Message = {
      role: row.role as Message['role'],
      content: row.content || undefined,
    };

    if (row.tool_calls) {
      try {
        msg.toolCalls = JSON.parse(row.tool_calls);
      } catch {
        /* ignore parse errors */
      }
    }

    if (row.raw_parts) {
      try {
        msg._rawParts = JSON.parse(row.raw_parts);
      } catch {
        /* ignore parse errors */
      }
    }

    if (row.tool_call_id) msg.toolCallId = row.tool_call_id;
    if (row.tool_name) msg.toolName = row.tool_name;

    return msg;
  });
}

/**
 * Appends messages to a session in an atomic transaction.
 *
 * @param sessionId - Target session UUID.
 * @param messages - Messages to append.
 */
export async function saveMessages(sessionId: string, messages: Message[]): Promise<void> {
  await withWriteRetry(() => {
    const db = getDb();

    const seqRows = db
      .prepare('SELECT COALESCE(MAX(seq), -1) as max_seq FROM messages WHERE session_id = ?')
      .all(sessionId) as Array<{ max_seq: number }>;

    let seq = (seqRows[0]?.max_seq ?? -1) + 1;

    const insertMsg = db.prepare(`
      INSERT INTO messages (session_id, role, content, tool_calls, tool_call_id, tool_name, raw_parts, seq)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateMeta = db.prepare(`
      UPDATE sessions SET
        updated_at = datetime('now'),
        message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?)
      WHERE id = ?
    `);

    db.exec('BEGIN');
    try {
      for (const msg of messages) {
        insertMsg.run(
          sessionId,
          msg.role,
          msg.content || null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
          msg.toolCallId || null,
          msg.toolName || null,
          msg._rawParts ? JSON.stringify(msg._rawParts) : null,
          seq++,
        );
      }
      updateMeta.run(sessionId, sessionId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });
}

/**
 * Updates a session's title.
 *
 * @param sessionId - Session UUID.
 * @param title - New title.
 */
export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await withWriteRetry(() => {
    getDb().prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
  });
}

/**
 * Lists recent sessions ordered by last update time.
 *
 * @param limit - Maximum sessions to return.
 * @returns Array of session metadata.
 */
export function listSessions(limit: number = 20): SessionInfo[] {
  const rows = getDb()
    .prepare(`SELECT id, session_key, title, created_at, updated_at, message_count FROM sessions ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Array<{
    id: string;
    session_key: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionKey: r.session_key,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

/**
 * Returns the `session_key` recorded when a session was created, or `null`
 * if no such session exists. Callers use this to detect stale route-bound
 * session pointers: a route may hold a session_id that was minted under an
 * earlier (chat-wide) key format, and silently reusing it would resurrect
 * cross-topic / cross-pack history. Compare against the freshly-computed
 * sessionKey for the inbound event and mint a new session on mismatch.
 */
export function getSessionKey(sessionId: string): string | null {
  const rows = getDb()
    .prepare('SELECT session_key FROM sessions WHERE id = ?')
    .all(sessionId) as Array<{ session_key: string }>;
  return rows.length > 0 ? rows[0]!.session_key : null;
}

/**
 * Gets the active skill name for a session.
 *
 * @param sessionId - Session UUID.
 * @returns Skill name or null.
 */
export function getActiveSkill(sessionId: string): string | null {
  const rows = getDb()
    .prepare('SELECT active_skill FROM sessions WHERE id = ?')
    .all(sessionId) as Array<{ active_skill: string | null }>;
  return rows.length > 0 ? (rows[0]!.active_skill ?? null) : null;
}

/**
 * Sets or clears the active skill for a session.
 *
 * @param sessionId - Session UUID.
 * @param skillName - Skill name to activate, or null to clear.
 */
export async function setActiveSkill(sessionId: string, skillName: string | null): Promise<void> {
  await withWriteRetry(() => {
    getDb().prepare('UPDATE sessions SET active_skill = ? WHERE id = ?').run(skillName, sessionId);
  });
}
