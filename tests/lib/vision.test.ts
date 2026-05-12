/**
 * @module tests/lib/vision
 * @description Tests for vision module — validation only (no actual API calls).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzeImage } from '../../src/lib/vision.js';
import { DEFAULT_CONFIG, type AouoConfig } from '../../src/config/defaults.js';

const config: AouoConfig = {
  ...DEFAULT_CONFIG,
  gemini: { api_key: '', vision_model: 'gemini-2.5-flash' },
};

describe('analyzeImage validation', () => {
  let savedGeminiKey: string | undefined;

  beforeEach(() => {
    // Ensure no env key interferes
    savedGeminiKey = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    if (savedGeminiKey !== undefined) process.env['GEMINI_API_KEY'] = savedGeminiKey;
  });

  it('rejects when no API key with existing file', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const path = '/tmp/aouo_test_vision_apikey.jpg';
    writeFileSync(path, 'fake-jpeg-data');
    try {
      const result = await analyzeImage(path, config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    } finally {
      unlinkSync(path);
    }
  });

  it('rejects missing files', async () => {
    const cfgWithKey = { ...config, gemini: { ...config.gemini, api_key: 'fake' } };
    const result = await analyzeImage('/tmp/nonexistent_img_12345.jpg', cfgWithKey);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects unsupported formats', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const path = '/tmp/aouo_test_vision.svg';
    writeFileSync(path, 'fake');
    const cfgWithKey = { ...config, gemini: { ...config.gemini, api_key: 'fake' } };
    try {
      const result = await analyzeImage(path, cfgWithKey);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported');
    } finally {
      unlinkSync(path);
    }
  });
});
