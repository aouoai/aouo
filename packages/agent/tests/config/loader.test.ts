import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deepMerge, loadConfig, getConfig, resetConfig, createDefaultConfig } from '../../src/config/loader.js';

describe('config/loader', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  describe('deepMerge', () => {
    it('should merge flat objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should recursively merge nested objects', () => {
      const target = { a: { x: 1, y: 2 }, b: 'hello' };
      const source = { a: { y: 3, z: 4 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 'hello' });
    });

    it('should replace arrays entirely', () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ items: [4, 5] });
    });

    it('should not modify the target object', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { c: 3 } };
      deepMerge(target, source);
      expect(target.b.c).toBe(2);
    });

    it('should handle empty source', () => {
      const target = { a: 1 };
      const result = deepMerge(target, {});
      expect(result).toEqual({ a: 1 });
    });

    it('should skip undefined source values', () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, b: 3 };
      const result = deepMerge(target, source as any);
      expect(result).toEqual({ a: 1, b: 3 });
    });

    it('should handle null source values as override', () => {
      const target = { a: { x: 1 } };
      const source = { a: null };
      const result = deepMerge(target, source as any);
      expect(result).toEqual({ a: null });
    });
  });

  describe('loadConfig', () => {
    it('should return defaults when no config file exists', () => {
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.provider).toBeDefined();
      expect(config.provider.backend).toBe('gemini');
    });

    it('should ignore runtime environment variables', () => {
      const previousGemini = process.env.GEMINI_API_KEY;
      const previousDeepSeek = process.env.DEEPSEEK_API_KEY;
      const previousLogLevel = process.env.AOUO_LOG_LEVEL;

      try {
        process.env.GEMINI_API_KEY = 'sk-test-gemini';
        process.env.DEEPSEEK_API_KEY = 'sk-test-deepseek';
        process.env.AOUO_LOG_LEVEL = 'debug';

        const config = loadConfig();

        expect(config.gemini.api_key).toBe('');
        expect(config.deepseek.api_key).toBe('');
        expect(config.advanced.log_level).toBe('info');
        expect(createDefaultConfig().gemini.api_key).toBe('');
      } finally {
        if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousGemini;
        if (previousDeepSeek === undefined) delete process.env.DEEPSEEK_API_KEY;
        else process.env.DEEPSEEK_API_KEY = previousDeepSeek;
        if (previousLogLevel === undefined) delete process.env.AOUO_LOG_LEVEL;
        else process.env.AOUO_LOG_LEVEL = previousLogLevel;
      }
    });
  });

  describe('getConfig', () => {
    it('should lazily load config', () => {
      const config = getConfig();
      expect(config).toBeDefined();
      expect(config.provider).toBeDefined();
    });

    it('should return same instance on subsequent calls', () => {
      const c1 = getConfig();
      const c2 = getConfig();
      expect(c1).toBe(c2);
    });
  });
});
