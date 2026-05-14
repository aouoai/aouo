/**
 * @module tools/message
 * @description Cross-platform outbound message intent tool.
 *
 * The tool schema is platform-neutral. Each adapter decides how to render or
 * degrade the requested message type according to its own platform rules.
 */

import { register } from './registry.js';
import type {
  AdapterCapabilities,
  AdapterMessagePayload,
  AdapterMessageResult,
  ToolContext,
  ToolParameterSchema,
} from '../agent/types.js';
import { FULL_ADAPTER_CAPABILITIES } from '../agent/types.js';

export const MESSAGE_TOOL_PARAMETERS: ToolParameterSchema = {
  type: 'object',
  properties: {
    type:       { type: 'string', description: 'Message type: text | audio | voice | document | keyboard | quiz | edit | delete | react | action | countdown | paginate' },
    text:       { type: 'string', description: 'Message text/caption. For countdown: use {seconds} as placeholder. For paginate: pages separated by ---PAGE--- delimiter.' },
    url:        { type: 'string', description: 'For audio/voice/document: URL or local file path.' },
    buttons:    { type: 'string', description: 'JSON 2D array for buttons: [["label|callback_data",...]].' },
    options:    { type: 'string', description: 'For quiz: JSON array of option strings.' },
    correct:    { type: 'integer', description: 'For quiz: 0-based index of the correct answer.' },
    explanation:{ type: 'string', description: 'For quiz: explanation shown after answering.' },
    message_id: { type: 'string', description: 'For edit/delete/react: target platform message id or adapter tag.' },
    reply_to:   { type: 'string', description: 'Reply target message id, adapter tag, or "user" for the incoming message.' },
    tag:        { type: 'string', description: 'Adapter-local tag for later reference.' },
    emoji:      { type: 'string', description: 'For react: emoji to use.' },
    action:     { type: 'string', description: 'For action: typing, record_voice, upload_document, etc.' },
    parse_mode: { type: 'string', description: 'Platform parse mode when supported: HTML, Markdown, MarkdownV2, or none.' },
    seconds:    { type: 'integer', description: 'For countdown: duration in seconds.' },
    expire_text:{ type: 'string', description: 'For countdown: text when timer reaches 0.' },
  },
  required: ['type'],
};

function parseArray(raw: unknown): string[][] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as string[][]; } catch { return []; }
  }
  return raw as string[][];
}

function parseStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return raw as string[];
}

function optionalString(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
}

function optionalNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

export function normalizeMessageArgs(args: Record<string, unknown>): AdapterMessagePayload {
  const normalized = { ...args };
  for (const field of ['text', 'caption'] as const) {
    if (typeof normalized[field] === 'string') {
      normalized[field] = (normalized[field] as string).replace(/\\n/g, '\n');
    }
  }

  const type = String(normalized.type || 'text') as AdapterMessagePayload['type'];
  const payload: AdapterMessagePayload = { type };

  const text = optionalString(normalized.text);
  if (text !== undefined) payload.text = text;
  const url = optionalString(normalized.url);
  if (url !== undefined) payload.url = url;
  const explanation = optionalString(normalized.explanation);
  if (explanation !== undefined) payload.explanation = explanation;
  const messageId = normalized.message_id as string | number | undefined;
  if (messageId !== undefined) payload.messageId = messageId;
  const replyTo = normalized.reply_to as string | number | undefined;
  if (replyTo !== undefined) payload.replyTo = replyTo;
  const tag = optionalString(normalized.tag);
  if (tag !== undefined) payload.tag = tag;
  const emoji = optionalString(normalized.emoji);
  if (emoji !== undefined) payload.emoji = emoji;
  const action = optionalString(normalized.action);
  if (action !== undefined) payload.action = action;
  const parseMode = optionalString(normalized.parse_mode);
  if (parseMode !== undefined) payload.parseMode = parseMode;
  const expireText = optionalString(normalized.expire_text);
  if (expireText !== undefined) payload.expireText = expireText;

  const buttons = parseArray(normalized.buttons);
  if (buttons.length > 0) payload.buttons = buttons;
  const options = parseStringArray(normalized.options);
  if (options.length > 0) payload.options = options;
  const correct = optionalNumber(normalized.correct);
  if (correct !== undefined) payload.correct = correct;
  const seconds = optionalNumber(normalized.seconds);
  if (seconds !== undefined) payload.seconds = seconds;

  return payload;
}

/**
 * Map a payload type onto the capability flag that gates it. Returns
 * `undefined` for baseline types (text, keyboard, edit, delete, action,
 * document) that every adapter is expected to support; those bypass the
 * degrade tier.
 *
 * Kept as a small switch (not a Record) so future additions to
 * AdapterMessageType cause a type-check failure rather than silently
 * defaulting to "no gate".
 */
function capabilityGateFor(type: AdapterMessagePayload['type']): keyof AdapterCapabilities | undefined {
  switch (type) {
    case 'quiz': return 'quiz';
    case 'voice': return 'voice';
    case 'audio': return 'audio';
    case 'countdown': return 'countdown';
    case 'paginate': return 'paginate';
    case 'react': return 'react';
    case 'edit': return 'editMessage';
    case 'text':
    case 'keyboard':
    case 'document':
    case 'delete':
    case 'action':
      return undefined;
  }
}

/**
 * Render a quiz as a text + inline-keyboard pair when the adapter lacks
 * native quiz support. Each option becomes a button with `quiz_<idx>`
 * callback data so adapters can wire up answer correlation; the prompt
 * line keeps the question and (when present) the explanation as a hint.
 */
function quizToKeyboard(payload: AdapterMessagePayload): AdapterMessagePayload {
  const options = payload.options ?? [];
  const buttons: string[][] = options.map((opt, idx) => [`${opt}|quiz_${idx}`]);
  const text = (payload.text ?? '').trim() || '(quiz)';
  return {
    type: 'keyboard',
    text,
    buttons,
  };
}

/**
 * Apply capability-aware degrade to a payload. Returns the original
 * payload unchanged when the adapter natively supports the requested
 * type, otherwise returns a degraded payload that uses only baseline
 * features. The accompanying `note` is appended to the result message
 * so the LLM knows the requested form didn't render verbatim.
 *
 * Pure helper, testable in isolation. The actual capability table is
 * passed in so future adapters with custom rules don't have to live
 * inside this module.
 */
export function degradeMessagePayload(
  payload: AdapterMessagePayload,
  caps: AdapterCapabilities,
): { payload: AdapterMessagePayload; note?: string } {
  const gate = capabilityGateFor(payload.type);
  if (!gate || caps[gate]) return { payload };

  switch (payload.type) {
    case 'quiz':
      return {
        payload: quizToKeyboard(payload),
        note: 'platform_lacks_native_quiz_rendered_as_keyboard',
      };
    case 'voice':
      if (caps.audio) {
        return {
          payload: { ...payload, type: 'audio' },
          note: 'platform_lacks_voice_rendered_as_audio',
        };
      }
      return {
        payload: { type: 'text', text: payload.text || payload.url || '(voice message)' },
        note: 'platform_lacks_voice_rendered_as_text',
      };
    case 'audio':
      return {
        payload: { type: 'text', text: payload.text || payload.url || '(audio message)' },
        note: 'platform_lacks_audio_rendered_as_text',
      };
    case 'countdown':
      return {
        payload: {
          type: 'text',
          text: (payload.text || 'Countdown').replace(/\{seconds\}/g, String(payload.seconds ?? 0)),
        },
        note: 'platform_lacks_live_countdown_rendered_as_static_text',
      };
    case 'paginate': {
      // splitMarkdownForTelegram-style paginate input uses ---PAGE--- as
      // a delimiter (see MESSAGE_TOOL_PARAMETERS); we just collapse pages.
      const text = (payload.text || '').split(/-{3}PAGE-{3}/).join('\n\n');
      return {
        payload: { type: 'text', text },
        note: 'platform_lacks_pagination_rendered_as_flat_text',
      };
    }
    case 'react':
      return {
        payload: { type: 'text', text: `(reaction: ${payload.emoji ?? '👍'})` },
        note: 'platform_lacks_reactions_rendered_as_text',
      };
    case 'edit':
      return {
        payload: { type: 'text', text: payload.text || '' },
        note: 'platform_lacks_message_edit_sent_as_new_message',
      };
    default:
      return { payload };
  }
}

function serializeMessageResult(result: AdapterMessageResult): string {
  const { ok, messageId, pollId, pageCount, sentContent, error, ...extra } = result;
  const output: Record<string, unknown> = { ok, ...extra };
  if (messageId !== undefined) output.message_id = messageId;
  if (pollId !== undefined) output.poll_id = pollId;
  if (pageCount !== undefined) output.page_count = pageCount;
  if (sentContent !== undefined) output.sent_content = sentContent;
  if (error !== undefined) output.error = error;
  return JSON.stringify(output);
}

export async function executeMessageTool(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const rawPayload = normalizeMessageArgs(args);
  // Apply capability-aware degrade BEFORE dispatch so adapters never see
  // payloads they can't render. Adapters that omit `capabilities` are
  // treated as fully-featured (legacy behavior).
  const caps = context.adapter.capabilities ?? FULL_ADAPTER_CAPABILITIES;
  const { payload, note } = degradeMessagePayload(rawPayload, caps);

  if (context.adapter.dispatchMessage) {
    const result = await context.adapter.dispatchMessage(payload);
    return serializeMessageResult(note ? { ...result, degraded: note } : result);
  }

  if (payload.type === 'text') {
    const text = (payload.text || '').trim();
    if (!text) {
      return serializeMessageResult({ ok: false, error: 'text is required', sentContent: false });
    }
    await context.adapter.reply(text);
    return serializeMessageResult({ ok: true, sentContent: true });
  }

  if (payload.type === 'action') {
    return serializeMessageResult({ ok: true, sentContent: false });
  }

  return serializeMessageResult({
    ok: false,
    sentContent: false,
    error: `Adapter "${context.adapter.platform}" does not support msg type "${payload.type}".`,
  });
}

register({
  name: 'msg',
  description: 'Send a platform-neutral message intent. Set `type` to text, audio, voice, document, keyboard, quiz, edit, delete, react, action, countdown, or paginate; the active adapter renders or degrades it according to its platform rules.',
  parameters: MESSAGE_TOOL_PARAMETERS,
  execute: executeMessageTool,
});
