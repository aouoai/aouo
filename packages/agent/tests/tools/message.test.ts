import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/tools/registry.js';
import type { AouoConfig, Adapter, ToolContext } from '../../src/agent/types.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import '../../src/tools/message.js';

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
});
