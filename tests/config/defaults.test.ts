import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AouoConfig } from '../../src/config/defaults.js';

describe('config/defaults', () => {
  it('should export a valid DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.version).toBe('0.1.0');
  });

  it('should have zero domain-specific tools in default enabled list', () => {
    const domainTools = ['pron_assess', 'pronAssess'];
    for (const tool of domainTools) {
      expect(DEFAULT_CONFIG.tools.enabled).not.toContain(tool);
    }
  });

  it('should expose the platform-neutral message tool by default', () => {
    expect(DEFAULT_CONFIG.tools.enabled).toContain('msg');
    expect(DEFAULT_CONFIG.tools.enabled).not.toContain('tg_msg');
  });

  it('should default security paths to ~/.aouo/', () => {
    expect(DEFAULT_CONFIG.security.allowed_paths).toContain('~/.aouo/');
  });

  it('should have packs config with empty defaults', () => {
    expect(DEFAULT_CONFIG.packs).toBeDefined();
    expect(DEFAULT_CONFIG.packs.enabled).toEqual([]);
    expect(DEFAULT_CONFIG.packs.scan_dirs).toEqual([]);
  });

  it('should satisfy the AouoConfig type', () => {
    const config: AouoConfig = { ...DEFAULT_CONFIG };
    expect(config.provider.backend).toBe('gemini');
    expect(config.advanced.max_react_loops).toBe(20);
  });
});
