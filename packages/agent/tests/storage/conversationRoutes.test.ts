/**
 * @module tests/storage/conversationRoutes
 * @description Adapter-agnostic route table CRUD, including TG private chat,
 *              TG forum topic, and per-user routes inside a shared chat.
 */

import { describe, it, expect } from 'vitest';
import {
  getOrCreateRoute,
  getRouteState,
  setRoutePack,
  setRouteSession,
  setRouteActiveSkill,
  conversationSessionKey,
  type ConversationAddress,
} from '../../src/storage/conversationRoutes.js';
import { createSession } from '../../src/storage/sessionStore.js';

/** Build a unique-per-test address so tests in the same DB stay isolated. */
function uniqAddr(partial: Partial<ConversationAddress> = {}): ConversationAddress {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    platform: partial.platform ?? 'tg',
    chatId: partial.chatId ?? `chat-${id}`,
    ...(partial.threadId !== undefined ? { threadId: partial.threadId } : {}),
    ...(partial.userId !== undefined ? { userId: partial.userId } : {}),
  };
}

describe('conversationRoutes', () => {
  it('creates a new route on first lookup', () => {
    const addr = uniqAddr();
    const route = getOrCreateRoute(addr);
    expect(route.id).toBeTruthy();
    expect(route.address.platform).toBe('tg');
    expect(route.address.chatId).toBe(addr.chatId);
    expect(route.activePack).toBeNull();
    expect(route.activeSkill).toBeNull();
    expect(route.sessionId).toBeNull();
  });

  it('returns the same route on subsequent lookups (idempotent)', () => {
    const addr = uniqAddr();
    const a = getOrCreateRoute(addr);
    const b = getOrCreateRoute(addr);
    expect(b.id).toBe(a.id);
  });

  it('isolates routes by thread_id (forum topic)', () => {
    const chat = `chat-forum-${Date.now()}`;
    const main = getOrCreateRoute({ platform: 'tg', chatId: chat });
    const topicA = getOrCreateRoute({ platform: 'tg', chatId: chat, threadId: '7' });
    const topicB = getOrCreateRoute({ platform: 'tg', chatId: chat, threadId: '8' });

    const ids = new Set([main.id, topicA.id, topicB.id]);
    expect(ids.size).toBe(3);
  });

  it('isolates routes by user_id within a shared chat', () => {
    const chat = `chat-group-${Date.now()}`;
    const u1 = getOrCreateRoute({ platform: 'tg', chatId: chat, userId: '100' });
    const u2 = getOrCreateRoute({ platform: 'tg', chatId: chat, userId: '200' });
    expect(u1.id).not.toBe(u2.id);
  });

  it('setRoutePack binds active_pack and clears the session', async () => {
    const addr = uniqAddr();
    const route = getOrCreateRoute(addr);
    const sid = await createSession('seed:' + route.id);
    setRouteSession(route.id, sid);

    setRoutePack(route.id, 'notes', 'onboarding');
    const after = getRouteState(addr);

    expect(after).not.toBeNull();
    expect(after!.activePack).toBe('notes');
    expect(after!.activeSkill).toBe('onboarding');
    // Switching packs must drop the previously-bound session to prevent
    // cross-pack history bleed.
    expect(after!.sessionId).toBeNull();
  });

  it('setRoutePack(null) fully unbinds the route', () => {
    const addr = uniqAddr();
    const route = getOrCreateRoute(addr);
    setRoutePack(route.id, 'notes');
    setRoutePack(route.id, null);
    const after = getRouteState(addr)!;
    expect(after.activePack).toBeNull();
    expect(after.activeSkill).toBeNull();
  });

  it('setRouteSession attaches a session without touching the pack', async () => {
    const addr = uniqAddr();
    const route = getOrCreateRoute(addr);
    setRoutePack(route.id, 'notes');
    const sid = await createSession('attach:' + route.id);
    setRouteSession(route.id, sid);

    const after = getRouteState(addr)!;
    expect(after.activePack).toBe('notes');
    expect(after.sessionId).toBe(sid);
  });

  it('setRouteActiveSkill updates skill without dropping the session', async () => {
    const addr = uniqAddr();
    const route = getOrCreateRoute(addr);
    setRoutePack(route.id, 'notes', 'onboarding');
    const sid = await createSession('skill:' + route.id);
    setRouteSession(route.id, sid);

    setRouteActiveSkill(route.id, 'daily-note');
    const after = getRouteState(addr)!;
    expect(after.activeSkill).toBe('daily-note');
    expect(after.sessionId).toBe(sid);
  });

  it('getRouteState returns null for unknown addresses', () => {
    const result = getRouteState({ platform: 'tg', chatId: `never-${Date.now()}` });
    expect(result).toBeNull();
  });

  it('conversationSessionKey embeds the pack so swapping isolates history', () => {
    const addr: ConversationAddress = { platform: 'tg', chatId: '42' };
    expect(conversationSessionKey(addr, 'notes')).toBe('tg:42:pack:notes');
    expect(conversationSessionKey(addr, 'creator')).toBe('tg:42:pack:creator');
  });

  it('conversationSessionKey includes thread and user when present', () => {
    const addr: ConversationAddress = {
      platform: 'tg',
      chatId: '-100abc',
      threadId: '7',
      userId: '900',
    };
    expect(conversationSessionKey(addr, 'notes')).toBe(
      'tg:-100abc:thread:7:user:900:pack:notes',
    );
  });

  it('topic + pack scoping prevents session cross-talk in a shared supergroup', async () => {
    // Regression for the production bug where two forum topics inside the
    // same supergroup shared a single `tg:<chatId>` session — the first
    // bound `activePack` would burn into every subsequent topic.
    const chat = `chat-cross-${Date.now()}`;
    const general = getOrCreateRoute({ platform: 'tg', chatId: chat });
    const topicA = getOrCreateRoute({ platform: 'tg', chatId: chat, threadId: 't-A' });
    const topicB = getOrCreateRoute({ platform: 'tg', chatId: chat, threadId: 't-B' });

    setRoutePack(general.id, 'notes');
    setRoutePack(topicA.id, 'vocab');
    setRoutePack(topicB.id, 'create');

    const keyGeneral = conversationSessionKey(general.address, 'notes');
    const keyA = conversationSessionKey(topicA.address, 'vocab');
    const keyB = conversationSessionKey(topicB.address, 'create');

    expect(new Set([keyGeneral, keyA, keyB]).size).toBe(3);

    const sidGeneral = await createSession(keyGeneral);
    const sidA = await createSession(keyA);
    const sidB = await createSession(keyB);
    expect(new Set([sidGeneral, sidA, sidB]).size).toBe(3);
  });

  it('swapping the active pack on the same route mints a fresh session key', () => {
    // Same physical address, two different packs — must NOT collide. This
    // protects against a regression where the adapter caches the pre-swap
    // sessionKey somewhere downstream and leaks history into the new pack.
    const addr: ConversationAddress = { platform: 'tg', chatId: `chat-swap-${Date.now()}` };
    expect(conversationSessionKey(addr, 'vocab')).not.toBe(
      conversationSessionKey(addr, 'notes'),
    );
  });
});
