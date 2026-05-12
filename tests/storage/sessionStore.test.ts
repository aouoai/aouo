/**
 * @module tests/storage/sessionStore
 * @description Tests for session CRUD and message persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOrCreateSession,
  createSession,
  loadMessages,
  saveMessages,
  updateSessionTitle,
  getActiveSkill,
  setActiveSkill,
} from '../../src/storage/sessionStore.js';

// These tests rely on in-memory SQLite or the test DB.
// AOUO_HOME should be set to a test dir in CI.

describe('sessionStore', () => {
  const key = `test:${Date.now()}`;

  it('creates a new session', async () => {
    const id = await createSession(key);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('getOrCreateSession returns same session for same key', async () => {
    const id1 = await getOrCreateSession(key);
    const id2 = await getOrCreateSession(key);
    expect(id1).toBe(id2);
  });

  it('saves and loads messages', async () => {
    const sessionId = await createSession(`test:msgs:${Date.now()}`);
    const messages = [
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'hi there' },
    ];
    await saveMessages(sessionId, messages);
    const loaded = await loadMessages(sessionId);
    expect(loaded.length).toBe(2);
    expect(loaded[0]!.content).toBe('hello');
    expect(loaded[1]!.content).toBe('hi there');
  });

  it('updates session title', async () => {
    const sessionId = await createSession(`test:title:${Date.now()}`);
    await updateSessionTitle(sessionId, 'My Title');
    // No throw = success (title is metadata, not returned by loadMessages)
  });

  it('manages active skill', async () => {
    const sessionId = await createSession(`test:skill:${Date.now()}`);
    const before = await getActiveSkill(sessionId);
    expect(before).toBeNull();

    await setActiveSkill(sessionId, 'shadowing');
    const after = await getActiveSkill(sessionId);
    expect(after).toBe('shadowing');
  });
});
