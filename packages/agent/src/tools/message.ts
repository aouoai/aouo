/**
 * @module tools/message
 * @description Cross-platform outbound message intent tool.
 *
 * The tool schema is platform-neutral. Each adapter decides how to render
 * the requested type or how to degrade it (typically to text) when the
 * adapter doesn't natively support the requested form.
 *
 * Seven types only — the smallest set that round-trips across Telegram,
 * Discord, Slack, and Feishu without lossy translation. Platform-specific
 * niceties (live countdown, native polls, message edits, emoji reactions)
 * are deliberately absent: they either lacked skill-loop value (the LLM
 * rarely sees the user's reaction) or are better expressed as text +
 * inline keyboard buttons.
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
    type:       { type: 'string', description: 'One of: text | photo | audio | voice | document | keyboard | action.' },
    text:       { type: 'string', description: 'Body text, or caption for media payloads.' },
    url:        { type: 'string', description: 'For photo/audio/voice/document: URL or absolute local path.' },
    buttons:    { type: 'string', description: 'For keyboard: JSON 2D array, cells use `label|callback_data` syntax. Example: [["Yes|y","No|n"]].' },
    reply_to:   { type: 'string', description: 'Reply target message id, adapter tag, or "user" for the incoming message.' },
    tag:        { type: 'string', description: 'Adapter-local tag so later turns can reference this message.' },
    action:     { type: 'string', description: 'For action: typing, upload_voice, upload_document, …' },
    parse_mode: { type: 'string', description: 'Platform parse mode when supported: HTML, Markdown, MarkdownV2, or none.' },
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

function optionalString(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  return String(raw);
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
  const replyTo = normalized.reply_to as string | number | undefined;
  if (replyTo !== undefined) payload.replyTo = replyTo;
  const tag = optionalString(normalized.tag);
  if (tag !== undefined) payload.tag = tag;
  const action = optionalString(normalized.action);
  if (action !== undefined) payload.action = action;
  const parseMode = optionalString(normalized.parse_mode);
  if (parseMode !== undefined) payload.parseMode = parseMode;

  const buttons = parseArray(normalized.buttons);
  if (buttons.length > 0) payload.buttons = buttons;

  return payload;
}

/**
 * Map a payload type onto the capability flag that gates it. Returns
 * `undefined` for baseline types (`text`, `keyboard`, `action`) that
 * every adapter must support; those bypass the degrade tier.
 *
 * Kept as a switch (not a Record) so future additions to
 * AdapterMessageType cause a type-check failure rather than silently
 * defaulting to "no gate".
 */
function capabilityGateFor(type: AdapterMessagePayload['type']): keyof AdapterCapabilities | undefined {
  switch (type) {
    case 'photo': return 'photo';
    case 'voice': return 'voice';
    case 'audio': return 'audio';
    case 'document': return 'document';
    case 'text':
    case 'keyboard':
    case 'action':
      return undefined;
  }
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
    case 'photo':
      return {
        payload: { type: 'text', text: payload.text || payload.url || '(photo)' },
        note: 'platform_lacks_photo_rendered_as_text',
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
    case 'document':
      return {
        payload: { type: 'text', text: payload.text || payload.url || '(document)' },
        note: 'platform_lacks_document_rendered_as_text',
      };
    default:
      return { payload };
  }
}

function serializeMessageResult(result: AdapterMessageResult): string {
  const { ok, messageId, sentContent, error, ...extra } = result;
  const output: Record<string, unknown> = { ok, ...extra };
  if (messageId !== undefined) output.message_id = messageId;
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
  description: 'Send a platform-neutral message intent. Set `type` to text, photo, audio, voice, document, keyboard, or action; the active adapter renders or degrades it according to its platform rules.',
  parameters: MESSAGE_TOOL_PARAMETERS,
  execute: executeMessageTool,
});
