import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/agent/Agent.js';
import type { Adapter, LLMProvider, LLMResponse } from '../../src/agent/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { register } from '../../src/tools/registry.js';
import { createSession, loadMessages, setActiveSkill } from '../../src/storage/sessionStore.js';

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
});
