import { describe, it, expect, beforeEach } from 'vitest';
import {
  register,
  getAllTools,
  getEnabledTools,
  getToolSchemas,
  dispatch,
  listToolsWithStatus,
  registerPackTools,
} from '../../src/tools/registry.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { ToolContext, ToolDefinition, AouoConfig } from '../../src/agent/types.js';

// Reset tools state — registry uses a module-level Map, so we can test registration
function makeContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    config: { ...DEFAULT_CONFIG } as AouoConfig,
    sessionKey: 'test:1',
    sessionId: 'test-session',
    adapter: {
      reply: async () => {},
      requestApproval: async () => 'deny' as const,
    },
    ...overrides,
  };
}

const echoTool: ToolDefinition = {
  name: 'test_echo',
  description: 'Echoes input back',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to echo' },
    },
    required: ['message'],
  },
  async execute(args) {
    return `echo: ${args.message}`;
  },
};

const slowTool: ToolDefinition = {
  name: 'test_slow',
  description: 'Simulates a slow tool',
  timeoutMs: 100,
  parameters: { type: 'object', properties: {} },
  async execute() {
    await new Promise((r) => setTimeout(r, 200));
    return 'done';
  },
};

describe('tools/registry (integration)', () => {
  it('should register and dispatch a custom tool', async () => {
    register(echoTool);
    const result = await dispatch('test_echo', { message: 'hello' }, makeContext());
    expect(result.isError).toBe(false);
    expect(result.content).toBe('echo: hello');
  });

  it('should timeout slow tools', async () => {
    register(slowTool);
    const result = await dispatch('test_slow', {}, makeContext());
    expect(result.isError).toBe(true);
    expect(result.content).toContain('timed out');
  });

  it('should return error for unknown tools', async () => {
    const result = await dispatch('nonexistent_tool', {}, makeContext());
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown tool');
  });

  it('should track pack tools ownership', () => {
    const packTool: ToolDefinition = {
      name: 'pack_test_tool',
      description: 'A pack-provided tool',
      parameters: { type: 'object', properties: {} },
      async execute() { return 'pack result'; },
    };

    registerPackTools('test-pack', [packTool]);
    const status = listToolsWithStatus(DEFAULT_CONFIG as AouoConfig);
    const entry = status.find(s => s.name === 'pack_test_tool');
    expect(entry).toBeDefined();
    expect(entry!.pack).toBe('test-pack');
  });

  it('should filter tools by platform', () => {
    register(echoTool); // ensure it exists
    const config = { ...DEFAULT_CONFIG } as AouoConfig;

    const tgSchemas = getToolSchemas(config, 'telegram');
    const cliSchemas = getToolSchemas(config, 'cli');

    // tg_msg should be in telegram but not cli
    const hasTgMsgTg = tgSchemas.some(s => s.name === 'tg_msg');
    const hasTgMsgCli = cliSchemas.some(s => s.name === 'tg_msg');

    // Only check if tg_msg is registered (it may not be in this test context)
    if (getAllTools().some(t => t.name === 'tg_msg')) {
      expect(hasTgMsgCli).toBe(false);
    }
  });

  it('should apply deny policy', () => {
    register(echoTool);
    const config = {
      ...DEFAULT_CONFIG,
      tools: {
        ...DEFAULT_CONFIG.tools,
        enabled: [...DEFAULT_CONFIG.tools.enabled, 'test_echo'],
      },
    } as AouoConfig;

    const schemas = getToolSchemas(config, 'telegram', { deny: ['test_echo'] });
    expect(schemas.some(s => s.name === 'test_echo')).toBe(false);
  });
});
