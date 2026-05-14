import { describe, it, expect } from 'vitest';
import { Agent, RouteRequiredError, QuotaExceededError } from '../../src/agent/Agent.js';
import type { Adapter, LLMProvider, LLMResponse } from '../../src/agent/types.js';
import type { LoadedPack } from '../../src/packs/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { register } from '../../src/tools/registry.js';
import { createSession, loadMessages, setActiveSkill } from '../../src/storage/sessionStore.js';
import { trackLlm } from '../../src/lib/usage.js';

/** Minimal LoadedPack stub. Includes the fields buildSystemPrompt touches. */
function fakePack(name: string): LoadedPack {
  return {
    manifest: { name, provided_skills: [] },
    sourcePath: '/dev/null',
    dataPath: '/dev/null',
    onboarded: true,
  } as unknown as LoadedPack;
}

/** Minimal adapter stub. */
const stubAdapter: Adapter = {
  platform: 'test',
  async reply() {},
  async requestApproval() {
    return 'allow' as const;
  },
};

/** Minimal provider stub that returns echo content. */
const stubProvider: LLMProvider = {
  name: 'test',
  async chat(messages): Promise<LLMResponse> {
    // Echo the last user message content
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return {
      content: `echo: ${lastUser?.content || 'no input'}`,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };
  },
};

describe('agent/Agent', () => {
  it('should instantiate with config, adapter, and provider', () => {
    const agent = new Agent(DEFAULT_CONFIG, stubAdapter, stubProvider);
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.config).toBe(DEFAULT_CONFIG);
    expect(agent.adapter).toBe(stubAdapter);
  });

  it('should expose config and adapter as readonly properties', () => {
    const agent = new Agent(DEFAULT_CONFIG, stubAdapter, stubProvider);
    expect(agent.config.version).toBe('0.1.0');
    expect(agent.adapter.platform).toBe('test');
  });

  it('passes the active skill pack into tool context', async () => {
    register({
      name: 'capture_pack_context',
      description: 'Captures the active pack context for tests.',
      parameters: { type: 'object', properties: {} },
      async execute(_args, context) {
        return JSON.stringify({ pack: context.pack ?? null });
      },
    });

    const config = structuredClone(DEFAULT_CONFIG);
    config.tools.enabled = ['capture_pack_context'];
    config.ui.show_tool_calls = false;
    config.advanced.max_react_loops = 2;

    let calls = 0;
    const provider: LLMProvider = {
      name: 'test',
      async chat(): Promise<LLMResponse> {
        calls++;
        if (calls === 1) {
          return {
            toolCalls: [{ id: 'call-1', name: 'capture_pack_context', args: {} }],
            usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          };
        }
        return {
          content: 'done',
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        };
      },
    };

    const sessionKey = `test:agent-pack:${Date.now()}`;
    const sessionId = await createSession(sessionKey);
    await setActiveSkill(sessionId, 'daily-note');

    const agent = new Agent(config, stubAdapter, provider, {
      resolveSkill(name) {
        return name === 'daily-note' ? { body: 'Daily note instructions', pack: 'notes' } : undefined;
      },
    });

    await agent.run('write today note', { sessionKey, sessionId });

    const toolMessage = loadMessages(sessionId).find((message) => message.toolName === 'capture_pack_context');
    expect(toolMessage).toBeDefined();
    expect(JSON.parse(toolMessage!.content || '{}')).toEqual({ pack: 'notes' });
  });

  it('marks a run as already replied when any tool reports sent_content', async () => {
    register({
      name: 'capture_sent_content',
      description: 'Pretends to send a message.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return JSON.stringify({ ok: true, sent_content: true });
      },
    });

    const config = structuredClone(DEFAULT_CONFIG);
    config.tools.enabled = ['capture_sent_content'];
    config.ui.show_tool_calls = false;
    config.advanced.max_react_loops = 2;

    let calls = 0;
    const provider: LLMProvider = {
      name: 'test',
      async chat(): Promise<LLMResponse> {
        calls++;
        if (calls === 1) {
          return {
            toolCalls: [{ id: 'call-1', name: 'capture_sent_content', args: {} }],
            usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          };
        }
        return {
          content: 'done',
          usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
        };
      },
    };

    const agent = new Agent(config, stubAdapter, provider);
    const result = await agent.run('send something', {
      sessionKey: `test:sent-content:${Date.now()}`,
    });

    expect(result.tgSent).toBe(true);
  });

  describe('pack-resolution gate', () => {
    /** Provider that fails the test if invoked — used to prove the gate fires pre-LLM. */
    const refuseProvider: LLMProvider = {
      name: 'test-refuse',
      async chat(): Promise<LLMResponse> {
        throw new Error('LLM should not have been contacted when RouteRequiredError applies.');
      },
    };

    it('throws RouteRequiredError when multiple packs are loaded and activePack is omitted', async () => {
      const agent = new Agent(DEFAULT_CONFIG, stubAdapter, refuseProvider, {
        packs: [fakePack('notes'), fakePack('creator')],
      });

      await expect(
        agent.run('hi', { sessionKey: `test:multi-no-pick:${Date.now()}` }),
      ).rejects.toMatchObject({
        name: 'RouteRequiredError',
        reason: 'multi-pack-no-selection',
        availablePacks: ['notes', 'creator'],
      });
    });

    it('throws RouteRequiredError when activePack does not match any loaded pack', async () => {
      const agent = new Agent(DEFAULT_CONFIG, stubAdapter, refuseProvider, {
        packs: [fakePack('notes')],
      });

      try {
        await agent.run('hi', {
          sessionKey: `test:bad-pack:${Date.now()}`,
          activePack: 'creator',
        });
        throw new Error('expected RouteRequiredError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RouteRequiredError);
        const e = err as RouteRequiredError;
        expect(e.reason).toBe('pack-not-loaded');
        expect(e.requestedPack).toBe('creator');
        expect(e.availablePacks).toEqual(['notes']);
      }
    });

    it('uses explicit activePack from options for tool context', async () => {
      register({
        name: 'capture_pack_explicit',
        description: 'Captures the active pack context for tests.',
        parameters: { type: 'object', properties: {} },
        async execute(_args, context) {
          return JSON.stringify({ pack: context.pack ?? null });
        },
      });

      const config = structuredClone(DEFAULT_CONFIG);
      config.tools.enabled = ['capture_pack_explicit'];
      config.ui.show_tool_calls = false;
      config.advanced.max_react_loops = 2;

      let calls = 0;
      const provider: LLMProvider = {
        name: 'test',
        async chat(): Promise<LLMResponse> {
          calls++;
          if (calls === 1) {
            return {
              toolCalls: [{ id: 'call-1', name: 'capture_pack_explicit', args: {} }],
              usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
            };
          }
          return {
            content: 'done',
            usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          };
        },
      };

      const agent = new Agent(config, stubAdapter, provider, {
        packs: [fakePack('notes'), fakePack('creator')],
      });

      const sessionKey = `test:explicit-pack:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      await agent.run('hi', { sessionKey, sessionId, activePack: 'creator' });

      const toolMessage = loadMessages(sessionId).find((m) => m.toolName === 'capture_pack_explicit');
      expect(toolMessage).toBeDefined();
      expect(JSON.parse(toolMessage!.content || '{}')).toEqual({ pack: 'creator' });
    });

    it('single-pack mode auto-resolves activePack without explicit selection', async () => {
      register({
        name: 'capture_pack_single',
        description: 'Captures the active pack context for tests.',
        parameters: { type: 'object', properties: {} },
        async execute(_args, context) {
          return JSON.stringify({ pack: context.pack ?? null });
        },
      });

      const config = structuredClone(DEFAULT_CONFIG);
      config.tools.enabled = ['capture_pack_single'];
      config.ui.show_tool_calls = false;
      config.advanced.max_react_loops = 2;

      let calls = 0;
      const provider: LLMProvider = {
        name: 'test',
        async chat(): Promise<LLMResponse> {
          calls++;
          if (calls === 1) {
            return {
              toolCalls: [{ id: 'call-1', name: 'capture_pack_single', args: {} }],
              usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
            };
          }
          return {
            content: 'done',
            usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          };
        },
      };

      const agent = new Agent(config, stubAdapter, provider, {
        packs: [fakePack('notes')],
      });

      const sessionKey = `test:single-pack:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      await agent.run('hi', { sessionKey, sessionId });

      const toolMessage = loadMessages(sessionId).find((m) => m.toolName === 'capture_pack_single');
      expect(toolMessage).toBeDefined();
      expect(JSON.parse(toolMessage!.content || '{}')).toEqual({ pack: 'notes' });
    });

    it('throws QuotaExceededError when session_tokens_max is exhausted before the LLM call', async () => {
      const refuseProvider: LLMProvider = {
        name: 'test-refuse',
        async chat(): Promise<LLMResponse> {
          throw new Error('LLM should not have been contacted when quota is exhausted.');
        },
      };

      const config = structuredClone(DEFAULT_CONFIG);
      config.advanced.session_tokens_max = 100;
      config.advanced.daily_tokens_max = 0; // disable daily so the test isolates session scope

      const sessionKey = `test:quota-session:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      // Pre-seed enough usage to push the session past its cap.
      trackLlm(80, 30, 0, 'test', sessionId);

      const agent = new Agent(config, stubAdapter, refuseProvider);

      try {
        await agent.run('hi', { sessionKey, sessionId });
        throw new Error('expected QuotaExceededError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QuotaExceededError);
        const e = err as QuotaExceededError;
        expect(e.scope).toBe('session');
        expect(e.cap).toBe(100);
        expect(e.used).toBeGreaterThanOrEqual(110);
      }
    });

    it('throws QuotaExceededError with daily scope when daily_tokens_max is exhausted', async () => {
      const refuseProvider: LLMProvider = {
        name: 'test-refuse',
        async chat(): Promise<LLMResponse> {
          throw new Error('LLM should not have been contacted when quota is exhausted.');
        },
      };

      const config = structuredClone(DEFAULT_CONFIG);
      config.advanced.session_tokens_max = 0; // disable session scope
      // Set daily cap to 0 effectively can't trigger because we already have
      // some usage; instead set a cap just above 0 and seed past it.
      config.advanced.daily_tokens_max = 1;

      const sessionKey = `test:quota-daily:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      trackLlm(10, 5, 0, 'test', sessionId); // contributes to today's total

      const agent = new Agent(config, stubAdapter, refuseProvider);

      try {
        await agent.run('hi', { sessionKey, sessionId });
        throw new Error('expected QuotaExceededError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QuotaExceededError);
        expect((err as QuotaExceededError).scope).toBe('daily');
      }
    });

    it('quota caps set to 0 are treated as disabled (no error)', async () => {
      // Echo provider so the run completes cleanly.
      const echoProvider: LLMProvider = {
        name: 'test-echo',
        async chat(): Promise<LLMResponse> {
          return {
            content: 'ok',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        },
      };

      const config = structuredClone(DEFAULT_CONFIG);
      config.advanced.session_tokens_max = 0;
      config.advanced.daily_tokens_max = 0;

      const sessionKey = `test:quota-disabled:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      // Seed a non-trivial backlog. With caps disabled, even a session that
      // would otherwise hit `session_tokens_max=500_000` must run unblocked.
      // Kept under 5k so this test does not contaminate the shared
      // `daily_tokens_max` budget read by other tests in this file.
      trackLlm(2000, 1000, 0, 'test', sessionId);

      const agent = new Agent(config, stubAdapter, echoProvider);
      const result = await agent.run('hi', { sessionKey, sessionId });
      expect(result.content).toBe('ok');
    });

    it('zero-pack mode (unit-test / degenerate) leaves pack context undefined', async () => {
      register({
        name: 'capture_pack_zero',
        description: 'Captures the active pack context for tests.',
        parameters: { type: 'object', properties: {} },
        async execute(_args, context) {
          return JSON.stringify({ pack: context.pack ?? null });
        },
      });

      const config = structuredClone(DEFAULT_CONFIG);
      config.tools.enabled = ['capture_pack_zero'];
      config.ui.show_tool_calls = false;
      config.advanced.max_react_loops = 2;

      let calls = 0;
      const provider: LLMProvider = {
        name: 'test',
        async chat(): Promise<LLMResponse> {
          calls++;
          if (calls === 1) {
            return {
              toolCalls: [{ id: 'call-1', name: 'capture_pack_zero', args: {} }],
              usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
            };
          }
          return {
            content: 'done',
            usage: { promptTokens: 10, completionTokens: 1, totalTokens: 11 },
          };
        },
      };

      const agent = new Agent(config, stubAdapter, provider);
      const sessionKey = `test:zero-pack:${Date.now()}`;
      const sessionId = await createSession(sessionKey);
      await agent.run('hi', { sessionKey, sessionId });

      const toolMessage = loadMessages(sessionId).find((m) => m.toolName === 'capture_pack_zero');
      expect(toolMessage).toBeDefined();
      expect(JSON.parse(toolMessage!.content || '{}')).toEqual({ pack: null });
    });
  });
});
