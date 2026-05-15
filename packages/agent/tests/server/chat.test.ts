import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import type { LLMProvider, LLMResponse } from '../../src/agent/types.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

// Capture what the test wants the next chat call's provider to do.
const providerScript: {
  tokens: string[];
  shouldThrow?: string;
  capturedInput?: string;
} = { tokens: [] };

vi.mock('../../src/providers/index.js', () => ({
  createProvider(): LLMProvider {
    return {
      name: 'mock-test',
      async chat(messages, _tools, _config, options): Promise<LLMResponse> {
        const last = [...messages].reverse().find((m) => m.role === 'user');
        if (last && typeof last.content === 'string') {
          providerScript.capturedInput = last.content;
        }
        if (providerScript.shouldThrow) {
          throw new Error(providerScript.shouldThrow);
        }
        for (const t of providerScript.tokens) options?.onToken?.(t);
        const content = providerScript.tokens.join('');
        return {
          content,
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    };
  },
}));

interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Pull all SSE frames from a Response stream until the server closes it.
 * Ignores keep-alive comment lines and assumes UTF-8 text framing.
 */
async function consumeSse(res: Response): Promise<SseFrame[]> {
  if (!res.body) throw new Error('Missing response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames: SseFrame[] = [];
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const block of parts) {
      const lines = block.split('\n').filter((l) => !l.startsWith(':'));
      const evLine = lines.find((l) => l.startsWith('event: '));
      const dataLine = lines.find((l) => l.startsWith('data: '));
      if (!evLine || !dataLine) continue;
      const event = evLine.slice('event: '.length);
      const data = JSON.parse(dataLine.slice('data: '.length));
      frames.push({ event, data });
    }
  }
  return frames;
}

describe('POST /api/packs/:pack/chat (SSE)', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    handle = await startUiServer({ port: 0, token: 'test-chat-token' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
  });

  beforeEach(() => {
    providerScript.tokens = [];
    providerScript.shouldThrow = undefined;
    providerScript.capturedInput = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`http://127.0.0.1:${handle.port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Aouo-Token': handle.token,
      },
      body: JSON.stringify(body),
    });
  }

  it('streams token frames then a done frame for a normal completion', async () => {
    providerScript.tokens = ['Hello', ', ', 'world', '!'];
    const res = await post('/api/packs/hello-world/chat', { input: 'hi' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const frames = await consumeSse(res);
    const tokens = frames.filter((f) => f.event === 'token').map((f) => f.data);
    expect(tokens).toEqual(['Hello', ', ', 'world', '!']);
    const done = frames.find((f) => f.event === 'done');
    expect(done).toBeDefined();
    const doneData = done!.data as { sessionId: string };
    expect(typeof doneData.sessionId).toBe('string');
    expect(doneData.sessionId.length).toBeGreaterThan(0);
  });

  it('prefixes the model input with a skill hint when provided', async () => {
    providerScript.tokens = ['ok'];
    const res = await post('/api/packs/hello-world/chat', {
      input: 'summarize today',
      skillHint: 'greeting',
    });
    await consumeSse(res);
    expect(providerScript.capturedInput).toContain('[skill:greeting]');
    expect(providerScript.capturedInput).toContain('summarize today');
  });

  it('returns 400 JSON when input is empty', async () => {
    const res = await post('/api/packs/hello-world/chat', { input: '   ' });
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/input/i);
  });

  it('returns 404 JSON when pack is not loaded', async () => {
    const res = await post('/api/packs/no-such-pack/chat', { input: 'hi' });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('no-such-pack');
  });

  it('emits an error frame when the agent throws', async () => {
    providerScript.shouldThrow = 'simulated provider failure';
    const res = await post('/api/packs/hello-world/chat', { input: 'hi' });
    expect(res.status).toBe(200);
    const frames = await consumeSse(res);
    const errFrame = frames.find((f) => f.event === 'error');
    expect(errFrame).toBeDefined();
    expect(String(errFrame!.data)).toContain('simulated provider failure');
  });
});
