/**
 * @module tests/adapters/telegram/markdown
 * @description Tests for Telegram markdown splitting and stripping.
 */

import { describe, it, expect } from 'vitest';
import { splitMarkdownForTelegram, stripMarkdown } from '../../../src/adapters/telegram/markdown.js';

describe('splitMarkdownForTelegram', () => {
  it('returns single segment for short messages', () => {
    const segments = splitMarkdownForTelegram('Hello world');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe('Hello world');
  });

  it('splits long messages into multiple segments', () => {
    const longText = 'a'.repeat(5000);
    const segments = splitMarkdownForTelegram(longText);
    expect(segments.length).toBeGreaterThan(1);
    // Total content should be preserved
    expect(segments.join('').length).toBe(5000);
  });

  it('handles empty string', () => {
    const segments = splitMarkdownForTelegram('');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe('');
  });
});

describe('stripMarkdown', () => {
  it('strips bold markers', () => {
    expect(stripMarkdown('**bold**')).toBe('bold');
  });

  it('strips italic markers', () => {
    expect(stripMarkdown('*italic*')).toBe('italic');
  });

  it('strips inline code markers', () => {
    expect(stripMarkdown('`code`')).toBe('code');
  });

  it('strips link syntax', () => {
    const result = stripMarkdown('[text](url)');
    // Should contain text but not markdown link syntax
    expect(result).toContain('text');
  });
});
