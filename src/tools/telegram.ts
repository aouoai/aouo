/**
 * @module tools/telegram
 * @description Unified Telegram messaging tool (`tg_msg`).
 *
 * Consolidates all Telegram Bot API outbound endpoints into a single
 * polymorphic tool, saving ~1300 prompt tokens vs discrete tool schemas.
 *
 * Supported types: text, audio, voice, document, keyboard, quiz,
 * edit, delete, react, action, countdown, paginate
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

/**
 * Parse a raw argument into a 2D string array (for button grids).
 */
function parseArray(raw: unknown): string[][] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[][];
}

/**
 * Parse a raw argument into a 1D string array (for quiz options).
 */
function parseStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw as string[];
}

register({
  name: 'tg_msg',
  description: 'Send or manage Telegram messages. Use `type` to choose: text, audio, voice, document, keyboard (inline buttons), quiz, edit, delete, react, action, countdown, paginate. Default parse mode is HTML.',
  parameters: {
    type: 'object',
    properties: {
      type:       { type: 'string', description: 'Message type: text | audio | voice | document | keyboard | quiz | edit | delete | react | action | countdown | paginate' },
      text:       { type: 'string', description: 'Message text/caption (HTML format). For countdown: use {seconds} as placeholder. For paginate: pages separated by ---PAGE--- delimiter.' },
      url:        { type: 'string', description: 'For audio/voice/document: URL or file path of the media.' },
      buttons:    { type: 'string', description: 'JSON 2D array for keyboard: [["label|callback_data",...]].' },
      options:    { type: 'string', description: 'For quiz: JSON array of option strings.' },
      correct:    { type: 'integer', description: 'For quiz: 0-based index of correct answer.' },
      explanation:{ type: 'string', description: 'For quiz: explanation shown after answering.' },
      message_id: { type: 'string', description: 'For edit/react: target message_id or tag.' },
      reply_to:   { type: 'string', description: 'Reply to a message_id, tag, or "user" for the incoming message.' },
      tag:        { type: 'string', description: 'Tag this message for later reference.' },
      emoji:      { type: 'string', description: 'For react: emoji to use.' },
      action:     { type: 'string', description: 'For action type: typing, record_voice, upload_document, etc.' },
      parse_mode: { type: 'string', description: 'Parse mode: HTML (default), Markdown, MarkdownV2, or none.' },
      seconds:    { type: 'integer', description: 'For countdown: duration in seconds.' },
      expire_text:{ type: 'string', description: 'For countdown: text when timer reaches 0.' },
    },
    required: ['type'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const type = String(args.type);
    const adapter = context.adapter;

    // Normalize literal \n sequences from LLM JSON args
    for (const field of ['text', 'caption'] as const) {
      if (typeof args[field] === 'string') {
        args[field] = (args[field] as string).replace(/\\n/g, '\n');
      }
    }

    // The tg_msg tool depends on a Telegram-specific adapter that implements
    // sendMessage, sendAudio, sendVoice, sendKeyboard, etc.
    // We use duck-typing to check for the required methods.
    const tg = adapter as unknown as Record<string, unknown>;

    switch (type) {
      case 'text': {
        if (typeof tg['sendMessage'] === 'function') {
          const msgId = await (tg as any).sendMessage(String(args.text || ''), {
            replyTo: args.reply_to, tag: args.tag,
            parseMode: args.parse_mode || 'HTML',
          });
          return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
        }
        // Fallback: use generic reply
        await adapter.reply(String(args.text || ''));
        return JSON.stringify({ ok: true, sent_content: true });
      }

      case 'audio':
      case 'voice': {
        const url = String(args.url || '');
        if (!url) return JSON.stringify({ ok: false, error: 'url is required' });
        const method = type === 'audio' ? 'sendAudio' : 'sendVoice';
        if (typeof tg[method] === 'function') {
          const msgId = await (tg as any)[method](url, args.text || undefined, {
            replyTo: args.reply_to, tag: args.tag,
            parseMode: args.parse_mode || 'HTML',
          });
          return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: `Adapter does not support ${method}` });
      }

      case 'document': {
        if (typeof tg['sendDocument'] === 'function') {
          const msgId = await (tg as any).sendDocument(String(args.url || ''), {
            caption: args.text, replyTo: args.reply_to, tag: args.tag,
            parseMode: args.parse_mode || 'HTML',
          });
          return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support sendDocument' });
      }

      case 'keyboard': {
        const buttons = parseArray(args.buttons);
        if (typeof tg['sendKeyboard'] === 'function') {
          if (args.url && typeof tg['sendVoice'] === 'function') {
            await (tg as any).sendVoice(String(args.url), undefined, {});
          }
          const msgId = await (tg as any).sendKeyboard(String(args.text || ''), buttons, {
            replyTo: args.reply_to, tag: args.tag,
          });
          return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support sendKeyboard' });
      }

      case 'quiz': {
        const options = parseStringArray(args.options);
        if (typeof tg['sendQuiz'] === 'function') {
          const result = await (tg as any).sendQuiz(
            String(args.text || ''), options, Number(args.correct ?? 0), args.explanation,
          );
          return JSON.stringify({ ok: true, ...result, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support sendQuiz' });
      }

      case 'edit': {
        if (typeof tg['editMessage'] === 'function') {
          const ref = args.message_id;
          const buttons = args.buttons ? parseArray(args.buttons) : undefined;
          await (tg as any).editMessage(
            isNaN(Number(ref)) ? ref : Number(ref),
            String(args.text || ''), buttons,
          );
          return JSON.stringify({ ok: true, sent_content: false });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support editMessage' });
      }

      case 'delete': {
        if (typeof tg['deleteMsg'] === 'function') {
          const ref = args.message_id;
          const deleted = await (tg as any).deleteMsg(isNaN(Number(ref)) ? ref : Number(ref));
          return JSON.stringify({ ok: deleted });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support deleteMsg' });
      }

      case 'react': {
        if (typeof tg['react'] === 'function') {
          await (tg as any).react(args.message_id, String(args.emoji || '👍'));
          return JSON.stringify({ ok: true, sent_content: false });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support react' });
      }

      case 'action': {
        if (typeof tg['sendChatAction'] === 'function') {
          await (tg as any).sendChatAction(String(args.action || 'typing'));
          return JSON.stringify({ ok: true, sent_content: false });
        }
        return JSON.stringify({ ok: true, sent_content: false });
      }

      case 'countdown': {
        if (typeof tg['sendCountdown'] === 'function') {
          const msgId = await (tg as any).sendCountdown(
            String(args.text || ''), Number(args.seconds || 60),
            String(args.expire_text || '⏱️ Time\'s up!'),
            { replyTo: args.reply_to, tag: args.tag },
          );
          return JSON.stringify({ ok: true, message_id: msgId, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support sendCountdown' });
      }

      case 'paginate': {
        const delimiter = '---PAGE---';
        const rawText = String(args.text || '');
        const pages = rawText.split(delimiter).map(p => p.trim());
        if (typeof tg['sendPaginate'] === 'function') {
          const trailingButtons = String(args.buttons || '[]');
          const msgId = await (tg as any).sendPaginate(pages, trailingButtons, {
            replyTo: args.reply_to, tag: args.tag,
          });
          return JSON.stringify({ ok: true, message_id: msgId, page_count: pages.length, sent_content: true });
        }
        return JSON.stringify({ ok: false, error: 'Adapter does not support sendPaginate' });
      }

      default:
        return JSON.stringify({ error: `Unknown type: ${type}. Use: text, audio, voice, document, keyboard, quiz, edit, delete, react, action, paginate.` });
    }
  },
});
