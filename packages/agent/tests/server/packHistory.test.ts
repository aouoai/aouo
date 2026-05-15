import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { closeDb, getDb } from '../../src/storage/db.js';
import { createSession, saveMessages } from '../../src/storage/sessionStore.js';
import {
  conversationSessionKey,
  getOrCreateRoute,
  setRoutePack,
  setRouteSession,
} from '../../src/storage/conversationRoutes.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

interface HistoryResponse {
  sessionId: string | null;
  messages: Array<{
    id: number;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;
}

describe('GET /api/packs/:pack/history', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    // Other suites (chat.test.ts) share the same in-tmp DB and may have
    // bound a route + session for this pack. Wipe just the dashboard route
    // for hello-world so this suite starts from a known-empty state.
    const db = getDb();
    db.prepare(
      `DELETE FROM conversation_routes
       WHERE platform = 'web' AND chat_id = 'dashboard' AND thread_id = 'hello-world'`,
    ).run();
    handle = await startUiServer({ port: 0, token: 'test-history' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
    closeDb();
  });

  beforeEach(() => {
    // Each case manages its own session state; nothing global to reset.
  });

  async function api<T>(path: string): Promise<{ status: number; body: T }> {
    const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
      headers: { 'X-Aouo-Token': handle.token },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('returns 404 when the pack is not loaded', async () => {
    const { status } = await api('/api/packs/does-not-exist/history');
    expect(status).toBe(404);
  });

  it('returns an empty payload when no session has been bound yet', async () => {
    const { status, body } = await api<HistoryResponse>(
      '/api/packs/hello-world/history',
    );
    expect(status).toBe(200);
    expect(body.sessionId).toBeNull();
    expect(body.messages).toEqual([]);
  });

  it('returns user/assistant messages for the bound session in oldest-first order', async () => {
    // Seed a route + session the same way the chat handler does.
    const address = {
      platform: 'web',
      chatId: 'dashboard',
      threadId: 'hello-world',
      userId: 'local',
    };
    const route = getOrCreateRoute(address);
    setRoutePack(route.id, 'hello-world');
    const sessionKey = conversationSessionKey(address, 'hello-world');
    const sessionId = await createSession(sessionKey, 'history-test');
    setRouteSession(route.id, sessionId);

    await saveMessages(sessionId, [
      { role: 'system', content: 'system prompt — should be excluded' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't1', name: 'noop', arguments: '{}' }],
      },
      { role: 'tool', content: 'tool output', toolCallId: 't1', toolName: 'noop' },
      { role: 'user', content: 'how are you' },
      { role: 'assistant', content: 'doing well' },
    ]);

    const { status, body } = await api<HistoryResponse>(
      '/api/packs/hello-world/history',
    );
    expect(status).toBe(200);
    expect(body.sessionId).toBe(sessionId);
    expect(body.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'hello'],
      ['assistant', 'hi there'],
      ['user', 'how are you'],
      ['assistant', 'doing well'],
    ]);
    // Stable, monotonic ids the dashboard can use as React keys.
    const ids = body.messages.map((m) => m.id);
    expect(ids.every((id) => Number.isInteger(id))).toBe(true);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('honours the limit query parameter', async () => {
    const { status, body } = await api<HistoryResponse>(
      '/api/packs/hello-world/history?limit=2',
    );
    expect(status).toBe(200);
    // Most-recent two visible messages: "how are you" + "doing well".
    expect(body.messages.map((m) => m.content)).toEqual([
      'how are you',
      'doing well',
    ]);
  });
});
