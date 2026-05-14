/**
 * @module tests/lib/logger
 * @description Verifies the secret-redaction pipeline that wraps every Pino
 *              log emission. The patterns are conservative on purpose — we
 *              accept false negatives but must not introduce false positives
 *              that would corrupt operational logs.
 */

import { describe, it, expect } from 'vitest';
import { redactSecrets, redactLogObject } from '../../src/lib/logger.js';

describe('lib/logger redaction', () => {
  describe('redactSecrets', () => {
    it('redacts a Telegram bot token embedded in a file download URL', () => {
      const url = 'https://api.telegram.org/file/bot1234567890:AAH-redacted-base64-token-here/voice/abc.ogg';
      const redacted = redactSecrets(url);
      expect(redacted).not.toContain('AAH-redacted-base64-token-here');
      expect(redacted).toContain('bot<redacted>');
      expect(redacted).toContain('/voice/abc.ogg');
    });

    it('redacts standalone Telegram tokens in error messages', () => {
      const msg = 'connect ECONNREFUSED token=bot9876543210:XYZabc123_long-token-value-here';
      expect(redactSecrets(msg)).toContain('bot<redacted>');
      expect(redactSecrets(msg)).not.toContain('XYZabc123_long-token-value-here');
    });

    it('redacts Bearer tokens', () => {
      const header = 'Authorization: Bearer sk-proj-abcd1234efgh5678';
      const out = redactSecrets(header);
      expect(out).toBe('Authorization: Bearer <redacted>');
    });

    it('redacts api_key / apiKey / api-key json fields', () => {
      // The regex captures the prefix (incl. opening quote) and replaces the
      // value body; a trailing quote outside the captured group is preserved.
      expect(redactSecrets('"api_key":"sk-abc123def456"')).toBe('"api_key":"<redacted>"');
      expect(redactSecrets('apiKey=zzz_long_key_abc')).toBe('apiKey=<redacted>');
      expect(redactSecrets('"api-key": "tok_1234_5678"')).toBe('"api-key": "<redacted>"');
    });

    it('redacts Google AI ?key= query parameter', () => {
      const url = 'https://generativelanguage.googleapis.com/v1?key=AIzaSyXXXXXXXX_abcd';
      const out = redactSecrets(url);
      expect(out).toContain('?key=<redacted>');
      expect(out).not.toContain('AIzaSyXXXXXXXX_abcd');
    });

    it('returns the input unchanged when no secret pattern matches', () => {
      const benign = 'hello world — chat_id=12345, user agent: aouo/0.1';
      expect(redactSecrets(benign)).toBe(benign);
    });

    it('handles empty / falsy strings without throwing', () => {
      expect(redactSecrets('')).toBe('');
    });
  });

  describe('redactLogObject', () => {
    it('redacts string values at the top level of a log payload', () => {
      const out = redactLogObject({
        msg: 'tg_voice_download_error',
        url: 'https://api.telegram.org/file/bot1234567890:AAH-redacted-base64-token-here/voice.ogg',
        attempt: 1,
      });
      expect(out['url']).toContain('bot<redacted>');
      expect(out['msg']).toBe('tg_voice_download_error');
      expect(out['attempt']).toBe(1);
    });

    it('leaves non-string fields untouched (numbers, booleans, objects)', () => {
      const inner = { token: 'should not be walked recursively' };
      const out = redactLogObject({
        count: 42,
        flag: true,
        nested: inner,
        items: ['a', 'b'],
      });
      expect(out['count']).toBe(42);
      expect(out['flag']).toBe(true);
      expect(out['nested']).toBe(inner);
      expect(out['items']).toEqual(['a', 'b']);
    });

    it('is a no-op on objects with no secret-shaped strings', () => {
      const input = { msg: 'tool_call', tool: 'persist', sessionId: 'abc-123' };
      expect(redactLogObject({ ...input })).toEqual(input);
    });
  });
});
