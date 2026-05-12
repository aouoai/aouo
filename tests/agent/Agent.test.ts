import { describe, it, expect } from 'vitest';
import { Agent } from '../../src/agent/Agent.js';
import type { Adapter, LLMProvider, LLMResponse } from '../../src/agent/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

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
});
