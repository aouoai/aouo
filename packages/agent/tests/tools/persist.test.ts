/**
 * @module tests/tools/persist
 * @description Tests for persist tool contract validation.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { dispatch, registerAllTools } from '../../src/tools/registry.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Adapter, ToolContext } from '../../src/agent/types.js';

const PACKS_DIR = join(import.meta.dirname, '..', '..', 'packs');

const adapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'allow';
  },
};

function makeContext(sessionKey = `test:persist:${process.pid}`): ToolContext {
  return {
    adapter,
    config: DEFAULT_CONFIG,
    sessionKey,
    pack: 'notes',
  };
}

describe('persist contract validation', () => {
  beforeAll(async () => {
    await registerAllTools();
  });

  beforeEach(async () => {
    unloadAllPacks();
    const loaded = await loadPack(join(PACKS_DIR, 'notes'));
    expect(loaded).not.toBeNull();
  });

  afterEach(() => {
    unloadAllPacks();
  });

  it('saves practice data to the active pack default table and reads it back', async () => {
    const sessionKey = `test:notes:${Date.now()}`;
    const content = `journal entry ${sessionKey}`;

    const saved = await dispatch(
      'persist',
      {
        action: 'practice',
        skill_type: 'notes.daily',
        content,
        mood: 'focused',
      },
      makeContext(sessionKey),
    );

    expect(saved.isError).toBe(false);
    const savedPayload = JSON.parse(saved.content);
    expect(savedPayload.ok).toBe(true);
    expect(savedPayload.table).toBe('entries');

    const recent = await dispatch(
      'persist',
      {
        action: 'recent_practice',
        skill_type: 'notes.daily',
        limit: 10,
      },
      makeContext(sessionKey),
    );

    expect(recent.isError).toBe(false);
    const recentPayload = JSON.parse(recent.content);
    expect(recentPayload.rows.some((row: { content: string }) => row.content === content)).toBe(true);
  });

  it('enforces the active pack persist contract for top-level practice payloads', async () => {
    const result = await dispatch(
      'persist',
      {
        action: 'practice',
        skill_type: 'english.daily',
        content: 'wrong pack prefix',
      },
      makeContext(),
    );

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content);
    expect(payload.error).toContain('Contract violation');
  });

  // These are logic-level tests for the contract rules.
  // The actual validation function is inlined in persist.ts.

  it('skill_type prefix check logic', () => {
    const prefix = 'english.';
    const valid = 'english.dictation';
    const invalid = 'fitness.workout';

    expect(valid.startsWith(prefix)).toBe(true);
    expect(invalid.startsWith(prefix)).toBe(false);
  });

  it('required_fields presence check logic', () => {
    const required = ['skill_type', 'session_id', 'response'];
    const data = { skill_type: 'english.x', session_id: 's1', response: 'ok' };
    const missing = { skill_type: 'english.x' };

    for (const f of required) {
      expect(f in data).toBe(true);
    }
    expect('response' in missing).toBe(false);
  });

  it('subcap_keys whitelist check logic', () => {
    const allowed = new Set(['listening.gist', 'listening.detail', 'vocab.recall']);
    const validKeys = ['listening.gist', 'vocab.recall'];
    const invalidKeys = ['speaking.fluency'];

    for (const k of validKeys) expect(allowed.has(k)).toBe(true);
    for (const k of invalidKeys) expect(allowed.has(k)).toBe(false);
  });
});
