/**
 * @module adapters/telegram/markdown
 * @description Markdown formatting utilities for Telegram's limited markup.
 */

/**
 * Splits a long markdown message into Telegram-safe chunks.
 *
 * Telegram has a 4096-character limit per message. This function
 * splits on paragraph boundaries to preserve formatting.
 *
 * @param text - The full markdown text.
 * @param maxLength - Maximum characters per chunk (default 4000).
 * @returns Array of text chunks, each under maxLength.
 */
export function splitMarkdownForTelegram(text: string, maxLength: number = 4000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a paragraph boundary
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx <= 0) {
      // Fall back to line boundary
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx <= 0) {
      // Fall back to space
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx <= 0) {
      // Hard split
      splitIdx = maxLength;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

/**
 * Strips markdown formatting to produce plain text.
 *
 * @param text - Markdown-formatted text.
 * @returns Plain text with formatting removed.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, '')
    .trim();
}
