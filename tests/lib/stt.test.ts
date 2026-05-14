/**
 * @module tests/lib/stt
 * @description Tests for STT module — validation only (no actual API calls).
 */

import { describe, it, expect } from 'vitest';
import { transcribeAudio } from '../../src/lib/stt.js';
import { DEFAULT_CONFIG, type AouoConfig } from '../../src/config/defaults.js';

const config: AouoConfig = {
  ...DEFAULT_CONFIG,
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
};

describe('transcribeAudio validation', () => {
  it('rejects unsupported file formats', async () => {
    const result = await transcribeAudio('/tmp/test.txt', config);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported format');
  });

  it('rejects missing files', async () => {
    const result = await transcribeAudio('/tmp/nonexistent_audio_12345.ogg', config);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });

  it('rejects when no API key is configured', async () => {
    // Create a minimal temp file
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const previousGroq = process.env['GROQ_API_KEY'];
    process.env['GROQ_API_KEY'] = 'ignored-env-key';
    const path = '/tmp/aouo_test_stt.ogg';
    writeFileSync(path, 'fake');
    try {
      const result = await transcribeAudio(path, config);
      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    } finally {
      unlinkSync(path);
      if (previousGroq === undefined) delete process.env['GROQ_API_KEY'];
      else process.env['GROQ_API_KEY'] = previousGroq;
    }
  });
});
