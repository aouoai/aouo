/**
 * @module tools/tts
 * @description Text-to-Speech synthesis tool.
 *
 * Supports simple mode (text + voice + rate) and dialogue mode
 * (multi-voice SSML segments). Returns the file path for delivery
 * via `tg_msg(type="voice")`.
 *
 * TTS implementation is expected to be injected via a pack or
 * configured as a lib module. This tool defines the interface contract.
 */

import { register } from './registry.js';
import type { ToolContext } from '../agent/types.js';

register({
  name: 'tts',
  timeoutMs: 60_000,
  description: `Generate speech audio via TTS. Returns the file path — use tg_msg(type="voice", url=filePath) to send it.

**Simple mode**: pass \`text\` + optional \`voice\`/\`rate\`.
**Dialogue mode**: pass \`segments\` JSON array for multi-voice audio with pauses.

Segments format: [{"voice":"en-GB-RyanNeural","text":"How are you?","rate":"-5%"},{"break":"800ms"},{"voice":"en-US-AriaNeural","text":"I'm fine."}]`,
  parameters: {
    type: 'object',
    properties: {
      text:     { type: 'string', description: 'Text to speak (simple mode).' },
      voice:    { type: 'string', description: 'Voice name. Examples: en-US-AriaNeural, en-GB-RyanNeural.' },
      rate:     { type: 'string', description: 'Speaking rate. Examples: "+20%", "-30%".' },
      segments: { type: 'string', description: 'JSON array of segments for multi-voice dialogue.' },
    },
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<string> {
    // TTS implementation must be provided by a pack or configured lib.
    // This stub returns an error until a TTS engine is registered.
    const text = String(args.text || '').trim();
    const segments = args.segments;

    if (!text && !segments) {
      return JSON.stringify({ success: false, error: 'text or segments is required' });
    }

    // Attempt dynamic import of TTS lib (pack-provided)
    try {
      // @ts-ignore — tts is an optional module, provided by packs
      const ttsModule = await import('../lib/tts.js');
      if (typeof ttsModule.textToSpeech === 'function') {
        const result = await ttsModule.textToSpeech(
          text || '[dialogue]',
          _context.config,
          {
            voice: args.voice as string | undefined,
            rate: args.rate as string | undefined,
            segments: segments ? (typeof segments === 'string' ? JSON.parse(segments) : segments) : undefined,
            format: 'opus',
          },
        );
        return JSON.stringify(result);
      }
    } catch {
      // TTS lib not available
    }

    return JSON.stringify({
      success: false,
      error: 'TTS engine not configured. Install a TTS-capable pack or configure lib/tts.',
    });
  },
});
