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
      quiz: true, voice: true, audio: true,
      countdown: true, paginate: true, react: true, editMessage: true,
    };
    const noCaps: AdapterCapabilities = {
      quiz: false, voice: false, audio: false,
      countdown: false, paginate: false, react: false, editMessage: false,
    };

    it('passes through baseline types unchanged regardless of caps', () => {
      const payload: AdapterMessagePayload = { type: 'text', text: 'hi' };
      expect(degradeMessagePayload(payload, noCaps)).toEqual({ payload });
      const kb: AdapterMessagePayload = { type: 'keyboard', text: 'Pick', buttons: [['a|a']] };
      expect(degradeMessagePayload(kb, noCaps)).toEqual({ payload: kb });
    });

    it('passes optional types through when the gate is open', () => {
      const quiz: AdapterMessagePayload = { type: 'quiz', text: 'Q', options: ['a', 'b'] };
      expect(degradeMessagePayload(quiz, fullCaps)).toEqual({ payload: quiz });
    });

    it('degrades quiz → keyboard when caps.quiz is false', () => {
      const quiz: AdapterMessagePayload = { type: 'quiz', text: 'Q?', options: ['Yes', 'No'] };
      const { payload, note } = degradeMessagePayload(quiz, noCaps);
      expect(payload).toEqual({
        type: 'keyboard',
        text: 'Q?',
        buttons: [['Yes|quiz_0'], ['No|quiz_1']],
      });
      expect(note).toContain('quiz');
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

    it('degrades countdown → text with seconds substitution', () => {
      const cd: AdapterMessagePayload = { type: 'countdown', text: 'Starting in {seconds}s', seconds: 5 };
      const { payload } = degradeMessagePayload(cd, noCaps);
      expect(payload).toEqual({ type: 'text', text: 'Starting in 5s' });
    });

    it('degrades paginate → text with delimiter collapsed', () => {
      const p: AdapterMessagePayload = { type: 'paginate', text: 'Page 1---PAGE---Page 2---PAGE---Page 3' };
      const { payload } = degradeMessagePayload(p, noCaps);
      expect(payload).toEqual({ type: 'text', text: 'Page 1\n\nPage 2\n\nPage 3' });
    });
  });
});
