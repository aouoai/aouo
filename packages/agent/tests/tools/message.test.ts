import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/tools/registry.js';
import type { AdapterCapabilities, AouoConfig, Adapter, AdapterMessagePayload, ToolContext } from '../../src/agent/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import '../../src/tools/message.js';
import { degradeMessagePayload } from '../../src/tools/message.js';

describe('tools/message', () => {
  it('sends plain text through the active adapter', async () => {
    const sent: string[] = [];
    const adapter: Adapter = {
      platform: 'test',
      async reply(content) {
        sent.push(content);
      },
      async requestApproval() {
        return 'deny' as const;
      },
    };
    const context: ToolContext = {
      adapter,
      config: DEFAULT_CONFIG as AouoConfig,
      sessionId: 'test-session',
      sessionKey: 'test:message',
    };

    const result = await dispatch('msg', { type: 'text', text: 'hello' }, context);

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({ ok: true, sent_content: true });
    expect(sent).toEqual(['hello']);
  });

  it('passes rich message intents to the active adapter', async () => {
    const dispatched: unknown[] = [];
    const adapter: Adapter = {
      platform: 'test',
      async reply() {},
      async requestApproval() {
        return 'deny' as const;
      },
      async dispatchMessage(message) {
        dispatched.push(message);
        return { ok: true, messageId: 'm-1', sentContent: true };
      },
    };
    const context: ToolContext = {
      adapter,
      config: DEFAULT_CONFIG as AouoConfig,
      sessionId: 'test-session',
      sessionKey: 'test:message',
    };

    const result = await dispatch('msg', {
      type: 'keyboard',
      text: 'Pick one',
      buttons: '[["A|a","B|b"]]',
    }, context);

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      message_id: 'm-1',
      sent_content: true,
    });
    expect(dispatched).toEqual([{
      type: 'keyboard',
      text: 'Pick one',
      buttons: [['A|a', 'B|b']],
    }]);
  });

  describe('degradeMessagePayload', () => {
    const fullCaps: AdapterCapabilities = {
      photo: true, voice: true, audio: true, document: true, editMessage: true,
    };
    const noCaps: AdapterCapabilities = {
      photo: false, voice: false, audio: false, document: false, editMessage: false,
    };

    it('passes through baseline types unchanged regardless of caps', () => {
      const payload: AdapterMessagePayload = { type: 'text', text: 'hi' };
      expect(degradeMessagePayload(payload, noCaps)).toEqual({ payload });
      const kb: AdapterMessagePayload = { type: 'keyboard', text: 'Pick', buttons: [['a|a']] };
      expect(degradeMessagePayload(kb, noCaps)).toEqual({ payload: kb });
    });

    it('passes optional types through when the gate is open', () => {
      const photo: AdapterMessagePayload = { type: 'photo', url: '/tmp/a.png', text: 'caption' };
      expect(degradeMessagePayload(photo, fullCaps)).toEqual({ payload: photo });
    });

    it('degrades photo → text when caps.photo is false', () => {
      const photo: AdapterMessagePayload = { type: 'photo', url: '/tmp/a.png', text: 'caption' };
      const { payload, note } = degradeMessagePayload(photo, noCaps);
      expect(payload).toEqual({ type: 'text', text: 'caption' });
      expect(note).toContain('photo');
    });

    it('degrades voice → audio when only audio is supported', () => {
      const partial: AdapterCapabilities = { ...noCaps, audio: true };
      const voice: AdapterMessagePayload = { type: 'voice', url: '/tmp/a.ogg' };
      const { payload, note } = degradeMessagePayload(voice, partial);
      expect(payload).toEqual({ type: 'audio', url: '/tmp/a.ogg' });
      expect(note).toContain('voice');
    });

    it('degrades voice → text when neither voice nor audio is supported', () => {
      const voice: AdapterMessagePayload = { type: 'voice', url: '/tmp/a.ogg' };
      expect(degradeMessagePayload(voice, noCaps).payload).toEqual({
        type: 'text',
        text: '/tmp/a.ogg',
      });
    });

    it('degrades audio → text when caps.audio is false', () => {
      const audio: AdapterMessagePayload = { type: 'audio', url: '/tmp/a.mp3', text: 'song' };
      const { payload, note } = degradeMessagePayload(audio, noCaps);
      expect(payload).toEqual({ type: 'text', text: 'song' });
      expect(note).toContain('audio');
    });

    it('degrades document → text when caps.document is false', () => {
      const doc: AdapterMessagePayload = { type: 'document', url: '/tmp/file.pdf' };
      const { payload, note } = degradeMessagePayload(doc, noCaps);
      expect(payload).toEqual({ type: 'text', text: '/tmp/file.pdf' });
      expect(note).toContain('document');
    });
  });
});
