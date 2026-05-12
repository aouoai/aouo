/**
 * @module tests/lib/tgFormat
 * @description Tests for Markdown → Telegram HTML conversion.
 */

import { describe, it, expect } from 'vitest';
import { markdownToTelegramHtml } from '../../src/lib/tgFormat.js';

describe('markdownToTelegramHtml', () => {
  it('converts bold and italic', () => {
    const result = markdownToTelegramHtml('**bold** and *italic*');
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<i>italic</i>');
  });

  it('converts headings to bold', () => {
    const result = markdownToTelegramHtml('# Title\n## Subtitle');
    expect(result).toContain('<b>Title</b>');
    expect(result).toContain('<b>Subtitle</b>');
    expect(result).not.toMatch(/<h[12]/);
  });

  it('converts unordered lists to bullets', () => {
    const result = markdownToTelegramHtml('- item 1\n- item 2');
    expect(result).toContain('• item 1');
    expect(result).toContain('• item 2');
    expect(result).not.toContain('<li>');
  });

  it('converts ordered lists to numbered items', () => {
    const result = markdownToTelegramHtml('1. first\n2. second');
    expect(result).toContain('1. first');
    expect(result).toContain('2. second');
  });

  it('preserves code blocks', () => {
    const result = markdownToTelegramHtml('```js\nconst x = 1;\n```');
    expect(result).toContain('<pre><code');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('</code></pre>');
  });

  it('preserves inline code', () => {
    const result = markdownToTelegramHtml('use `npm install`');
    expect(result).toContain('<code>npm install</code>');
  });

  it('strips non-Telegram tags', () => {
    const result = markdownToTelegramHtml('text with **bold** and [link](https://example.com)');
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<a');
    expect(result).not.toMatch(/<div|<span|<img/);
  });

  it('converts strikethrough', () => {
    const result = markdownToTelegramHtml('~~deleted~~');
    expect(result).toContain('<s>deleted</s>');
  });

  it('handles hr as separator line', () => {
    const result = markdownToTelegramHtml('above\n\n---\n\nbelow');
    expect(result).toContain('━━━━━━');
  });

  it('collapses excessive blank lines', () => {
    const result = markdownToTelegramHtml('line1\n\n\n\n\nline2');
    const lines = result.split('\n').filter(l => l.trim() === '');
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});
