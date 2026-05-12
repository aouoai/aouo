/**
 * @module lib/tgFormat
 * @description Markdown → Telegram HTML conversion pipeline.
 *
 * Telegram's `parse_mode: 'HTML'` supports only a restricted tag set:
 *   `<b>` `<i>` `<u>` `<s>` `<code>` `<pre>` `<a>` `<blockquote>` `<tg-spoiler>` `<tg-emoji>`
 *
 * This module converts standard Markdown (as emitted by LLMs) into Telegram-safe
 * HTML. The Agent emits pure Markdown; platform-specific formatting lives here.
 *
 * Pipeline:
 * 1. marked → raw HTML
 * 2. Protect <pre><code> blocks
 * 3. Map unsupported tags (h1-h6 → <b>, strong → <b>, em → <i>, etc.)
 * 4. Convert lists to plain text bullets
 * 5. Strip all tags not in the Telegram whitelist
 * 6. Restore code blocks
 * 7. Collapse excess whitespace
 */

import { marked } from 'marked';

/** Telegram-allowed HTML tags (lowercase). */
const ALLOWED_TAGS = new Set([
  'b', 'i', 'u', 's', 'code', 'pre', 'a',
  'blockquote', 'tg-spoiler', 'tg-emoji',
]);

/**
 * Converts Markdown text to Telegram-safe HTML.
 *
 * @param md - Markdown text from the LLM.
 * @returns Sanitized HTML safe for `parse_mode: 'HTML'`.
 */
export function markdownToTelegramHtml(md: string): string {
  let html = marked.parse(md, { gfm: true, async: false }) as string;

  // 1. Protect <pre><code>…</code></pre> from subsequent transforms.
  const codeBlocks: string[] = [];
  html = html.replace(
    /<pre>\s*<code([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/g,
    (_match, attrs: string, body: string) => {
      codeBlocks.push(`<pre><code${attrs}>${body.replace(/\n+$/, '')}</code></pre>`);
      return `\x00CB${codeBlocks.length - 1}\x00`;
    },
  );

  // 2. Headings → <b>…</b> + newline.
  html = html.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g, '<b>$1</b>\n');

  // 3. Inline tag aliases.
  html = html.replace(/<strong>([\s\S]*?)<\/strong>/g, '<b>$1</b>');
  html = html.replace(/<em>([\s\S]*?)<\/em>/g, '<i>$1</i>');
  html = html.replace(/<del>([\s\S]*?)<\/del>/g, '<s>$1</s>');

  // 4. Unordered list → bullet lines.
  html = html.replace(/<ul>\s*([\s\S]*?)\s*<\/ul>/g, (_m, inner: string) => {
    return inner
      .replace(/<li>\s*([\s\S]*?)\s*<\/li>/g, '• $1\n')
      .replace(/\n\s*\n/g, '\n')
      .trimEnd() + '\n';
  });

  // 5. Ordered list → numbered lines.
  html = html.replace(/<ol>\s*([\s\S]*?)\s*<\/ol>/g, (_m, inner: string) => {
    let n = 0;
    return inner
      .replace(/<li>\s*([\s\S]*?)\s*<\/li>/g, (_, item: string) => `${++n}. ${item}\n`)
      .replace(/\n\s*\n/g, '\n')
      .trimEnd() + '\n';
  });

  // 6. Blockquote: strip inner <p> wrappers, preserve attrs.
  html = html.replace(
    /<blockquote([^>]*)>\s*([\s\S]*?)\s*<\/blockquote>/g,
    (_m, attrs: string, inner: string) => {
      const text = inner.replace(/<p>([\s\S]*?)<\/p>/g, '$1').trim();
      return `<blockquote${attrs}>${text}</blockquote>`;
    },
  );

  // 7. <br> / <hr>.
  html = html.replace(/<br\s*\/?>/g, '\n');
  html = html.replace(/<hr\s*\/?>/g, '\n━━━━━━\n');

  // 8. Strip <p> wrappers — keep content plus paragraph break.
  html = html.replace(/<p>([\s\S]*?)<\/p>/g, '$1\n');

  // 9. Strip any remaining tags not in the Telegram whitelist.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>/g, (full, tag: string) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? full : '';
  });

  // 10. Restore code blocks.
  html = html.replace(/\x00CB(\d+)\x00/g, (_m, i: string) => codeBlocks[+i]!);

  // 11. Collapse excessive blank lines, trim edges.
  html = html.replace(/\n{3,}/g, '\n\n').trim();

  return html;
}
