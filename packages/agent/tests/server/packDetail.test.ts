import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

interface PackDetailBody {
  name: string;
  version: string;
  displayName: string;
  description: string;
  path: string;
  skills: Array<{
    name: string;
    qualifiedName: string;
    displayName: string;
    description: string;
  }>;
  cron: Array<{ id: string; schedule: string; skill: string; enabledByDefault: boolean }>;
}

describe('GET /api/packs/:pack', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    handle = await startUiServer({ port: 0, token: 'test-token-detail' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
  });

  async function api<T>(path: string): Promise<{ status: number; body: T }> {
    const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
      headers: { 'X-Aouo-Token': handle.token },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('returns 404 when the pack is not loaded', async () => {
    const { status } = await api('/api/packs/does-not-exist');
    expect(status).toBe(404);
  });

  it('returns 400 when the pack name is missing or contains a slash', async () => {
    const sub = await api('/api/packs/foo/bar');
    expect(sub.status).toBe(400);
  });

  it('returns pack manifest fields and parsed skill metadata for a loaded pack', async () => {
    const { status, body } = await api<PackDetailBody>('/api/packs/hello-world');
    expect(status).toBe(200);
    expect(body.name).toBe('hello-world');
    expect(body.version).toBe('1.0.0');
    expect(body.displayName).toBe('Hello World Pack');
    expect(body.description).toContain('minimal test pack');

    expect(Array.isArray(body.skills)).toBe(true);
    const greeting = body.skills.find((s) => s.name === 'greeting');
    expect(greeting).toBeDefined();
    expect(greeting!.qualifiedName).toBe('hello-world:greeting');
    expect(greeting!.description).toContain('greeting skill');
  });
});
