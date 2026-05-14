import { describe, it, expect } from 'vitest';
import {
  register,
  registerAllTools,
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
  it('should expand the file tool group into concrete file tools', async () => {
    await registerAllTools();
    const schemas = getToolSchemas(DEFAULT_CONFIG as AouoConfig, 'telegram');

    expect(schemas.some(s => s.name === 'read_file')).toBe(true);
    expect(schemas.some(s => s.name === 'write_file')).toBe(true);
    expect(schemas.some(s => s.name === 'list_dir')).toBe(true);
  });

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

  it('should expose pack tools without adding them to global enabled tools', () => {
    const packTool: ToolDefinition = {
      name: 'pack_auto_enabled_tool',
      description: 'A pack tool available when the pack is loaded',
      parameters: { type: 'object', properties: {} },
      async execute() { return 'pack result'; },
    };

    registerPackTools('test-pack', [packTool]);
    const config = { ...DEFAULT_CONFIG } as AouoConfig;
    expect(config.tools.enabled).not.toContain('pack_auto_enabled_tool');

    const schemas = getToolSchemas(config, 'telegram');
    expect(schemas.some(s => s.name === 'pack_auto_enabled_tool')).toBe(true);
  });

  it('should filter tools by platform', () => {
    const telegramOnlyTool: ToolDefinition = {
      name: 'telegram_only_test_tool',
      platforms: ['telegram'],
      description: 'Only works on Telegram',
      parameters: { type: 'object', properties: {} },
      async execute() { return 'telegram only'; },
    };

    register(telegramOnlyTool);
    const config = {
      ...DEFAULT_CONFIG,
      tools: {
        ...DEFAULT_CONFIG.tools,
        enabled: [...DEFAULT_CONFIG.tools.enabled, 'telegram_only_test_tool'],
      },
    } as AouoConfig;

    const tgSchemas = getToolSchemas(config, 'telegram');
    const cliSchemas = getToolSchemas(config, 'cli');

    expect(tgSchemas.some(s => s.name === 'telegram_only_test_tool')).toBe(true);
    expect(cliSchemas.some(s => s.name === 'telegram_only_test_tool')).toBe(false);
  });

  it('should reject dispatching a platform-limited tool on the wrong adapter', async () => {
    const telegramOnlyTool: ToolDefinition = {
      name: 'telegram_only_dispatch_tool',
      platforms: ['telegram'],
      description: 'Only works on Telegram',
      parameters: { type: 'object', properties: {} },
      async execute() { return 'telegram only'; },
    };

    register(telegramOnlyTool);
    const result = await dispatch('telegram_only_dispatch_tool', {}, makeContext({
      adapter: {
        platform: 'cli',
        reply: async () => {},
        requestApproval: async () => 'deny' as const,
      },
    }));

    expect(result.isError).toBe(true);
    expect(result.content).toContain('not available on platform "cli"');
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
