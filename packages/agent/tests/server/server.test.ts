import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';

describe('server/index', () => {
  let handle: UiServerHandle;

  beforeEach(async () => {
    // port:0 → ephemeral; token override → deterministic for assertions
    handle = await startUiServer({ port: 0, token: 'test-token-0123' });
  });

  afterEach(async () => {
    await handle.stop();
  });

  function url(path: string): string {
    return `http://127.0.0.1:${handle.port}${path}`;
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    const res = await fetch(url(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Aouo-Token': handle.token,
        ...init.headers,
      },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('rejects /api requests without a valid token', async () => {
    const res = await fetch(url('/api/config'));
    expect(res.status).toBe(401);
  });

  it('rejects /api requests with the wrong token', async () => {
    const res = await fetch(url('/api/config'), { headers: { 'X-Aouo-Token': 'wrong' } });
    expect(res.status).toBe(401);
  });

  it('GET /api/config returns a masked AouoConfig', async () => {
    const { status, body } = await api<{ provider: { backend: string; model: string } }>('/api/config');
    expect(status).toBe(200);
    expect(body.provider).toBeTypeOf('object');
    expect(body.provider.backend).toBeTypeOf('string');
    expect(body.provider.model).toBeTypeOf('string');
  });

  it('GET /api/config/raw returns a full AouoConfig', async () => {
    const { status, body } = await api<{ version: string; advanced: { session_tokens_max: number } }>(
      '/api/config/raw',
    );
    expect(status).toBe(200);
    expect(body.version).toBeTypeOf('string');
    expect(body.advanced.session_tokens_max).toBeTypeOf('number');
  });

  it('GET /api/status returns checks array with expected entries', async () => {
    const { status, body } = await api<{ checks: Array<{ name: string; ok: boolean; detail: string }> }>(
      '/api/status',
    );
    expect(status).toBe(200);
    expect(Array.isArray(body.checks)).toBe(true);
    const names = body.checks.map((c) => c.name);
    expect(names).toContain('Node.js');
    expect(names).toContain('Initialized');
    expect(names).toContain('Provider credential');
  });

  it('GET /api/packs returns a packs array', async () => {
    const { status, body } = await api<{ packs: unknown[] }>('/api/packs');
    expect(status).toBe(200);
    expect(Array.isArray(body.packs)).toBe(true);
  });

  it('PUT /api/config/:section rejects unknown sections', async () => {
    const { status } = await api('/api/config/bogus', {
      method: 'PUT',
      body: JSON.stringify({ x: 1 }),
    });
    expect(status).toBe(400);
  });

  it('PUT /api/config/ui persists a change and returns masked config', async () => {
    const { status, body } = await api<{ ok: boolean; config: { ui: { show_tool_calls: boolean } } }>(
      '/api/config/ui',
      {
        method: 'PUT',
        body: JSON.stringify({ show_tool_calls: false }),
      },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config.ui.show_tool_calls).toBe(false);

    // Round-trip through GET to confirm persistence.
    const after = await api<{ ui: { show_tool_calls: boolean } }>('/api/config');
    expect(after.body.ui.show_tool_calls).toBe(false);
  });

  it('returns 404 for unknown API routes', async () => {
    const { status } = await api('/api/does-not-exist');
    expect(status).toBe(404);
  });

  it('returns 404 for non-API paths when no dashboardDir is configured', async () => {
    const res = await fetch(url('/'));
    expect(res.status).toBe(404);
  });
});
