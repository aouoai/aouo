import { describe, expect, it } from 'vitest';
import { WebSessionAdapter, WEB_CAPABILITIES } from '../../../src/adapters/web/WebSessionAdapter.js';
import type { SseEvent } from '../../../src/server/sse.js';

function makeRecorder() {
  const events: SseEvent[] = [];
  const emit = (evt: SseEvent): void => {
    events.push(evt);
  };
  return { events, emit };
}

describe('WebSessionAdapter', () => {
  it('declares platform="web" and disables non-text channels', () => {
    const adapter = new WebSessionAdapter(() => {});
    expect(adapter.platform).toBe('web');
    expect(adapter.capabilities).toBe(WEB_CAPABILITIES);
    expect(adapter.capabilities.editMessage).toBe(true);
    expect(adapter.capabilities.photo).toBe(false);
    expect(adapter.capabilities.voice).toBe(false);
    expect(adapter.capabilities.audio).toBe(false);
    expect(adapter.capabilities.document).toBe(false);
  });

  it('reply() emits a `final` event with the content', async () => {
    const { events, emit } = makeRecorder();
    const adapter = new WebSessionAdapter(emit);
    await adapter.reply('hello world');
    expect(events).toEqual([{ event: 'final', data: { content: 'hello world' } }]);
  });

  it('showToolCall() emits a `tool_call` event with name + args', () => {
    const { events, emit } = makeRecorder();
    const adapter = new WebSessionAdapter(emit);
    adapter.showToolCall('persist', { entity: 'note', content: 'x' });
    expect(events).toEqual([
      { event: 'tool_call', data: { tool: 'persist', args: { entity: 'note', content: 'x' } } },
    ]);
  });

  it('showToolResult() emits a `tool_result` event including error flag', () => {
    const { events, emit } = makeRecorder();
    const adapter = new WebSessionAdapter(emit);
    adapter.showToolResult('persist', 'oops', true);
    expect(events).toEqual([
      { event: 'tool_result', data: { tool: 'persist', result: 'oops', isError: true } },
    ]);
  });

  it('dispatchMessage() forwards the payload as a `dispatch` event', async () => {
    const { events, emit } = makeRecorder();
    const adapter = new WebSessionAdapter(emit);
    const result = await adapter.dispatchMessage({ type: 'text', text: 'hi' });
    expect(events).toEqual([{ event: 'dispatch', data: { type: 'text', text: 'hi' } }]);
    expect(result).toEqual({ ok: true, sentContent: true });
  });

  it('requestApproval() auto-allows in MVP', async () => {
    const adapter = new WebSessionAdapter(() => {});
    await expect(adapter.requestApproval('rm -rf /')).resolves.toBe('allow');
  });

  it('requestChoice() throws to force Agent autonomous fallback', async () => {
    const adapter = new WebSessionAdapter(() => {});
    await expect(adapter.requestChoice('pick one', ['a', 'b'])).rejects.toThrow(/not implemented/);
  });
});
