import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { packDataDir } from '../../src/lib/paths.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');

interface MemoryListBody {
  files: Array<{
    name: string;
    displayName: string;
    exists: boolean;
    size: number;
    mtime: string;
  }>;
}

interface MemoryFileBody {
  name: string;
  content: string;
  size: number;
  mtime: string;
}

describe('GET /api/packs/:pack/memory[/<file>]', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);

    // Seed the pack data dir with a USER.md and a custom note so listing
    // exercises both canonical-files and extra-markdown branches.
    const dir = packDataDir('hello-world');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'USER.md'), '# user\n\nseeded content\n', 'utf-8');
    writeFileSync(join(dir, 'NOTES.md'), '- one\n- two\n', 'utf-8');

    handle = await startUiServer({ port: 0, token: 'test-memory' });
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

  it('returns 404 listing when pack is not loaded', async () => {
    const { status } = await api('/api/packs/does-not-exist/memory');
    expect(status).toBe(404);
  });

  it('lists canonical files plus extra markdown, marking missing ones', async () => {
    const { status, body } = await api<MemoryListBody>(
      '/api/packs/hello-world/memory',
    );
    expect(status).toBe(200);
    const byName = Object.fromEntries(body.files.map((f) => [f.name, f]));

    expect(byName['USER.md']).toBeDefined();
    expect(byName['USER.md']!.exists).toBe(true);
    expect(byName['USER.md']!.size).toBeGreaterThan(0);

    // Canonical placeholder for MEMORY.md is present even though we never
    // wrote it — the picker uses `exists: false` to drive the empty state.
    expect(byName['MEMORY.md']).toBeDefined();
    expect(byName['MEMORY.md']!.exists).toBe(false);

    // Extra notes get appended after the canonical pair.
    expect(byName['NOTES.md']).toBeDefined();
    expect(byName['NOTES.md']!.exists).toBe(true);

    expect(body.files[0]!.name).toBe('USER.md');
    expect(body.files[1]!.name).toBe('MEMORY.md');
  });

  it('reads the contents of a present file', async () => {
    const { status, body } = await api<MemoryFileBody>(
      '/api/packs/hello-world/memory/USER.md',
    );
    expect(status).toBe(200);
    expect(body.name).toBe('USER.md');
    expect(body.content).toContain('seeded content');
    expect(body.size).toBeGreaterThan(0);
    expect(body.mtime).toMatch(/T/);
  });

  it('returns 404 for a markdown file the pack has not written', async () => {
    const { status } = await api('/api/packs/hello-world/memory/MEMORY.md');
    expect(status).toBe(404);
  });

  it('rejects path traversal in the filename', async () => {
    const { status } = await api('/api/packs/hello-world/memory/..%2Fconfig.json');
    // URL-decoded, the filename is `../config.json` which contains a slash;
    // the validator should refuse it as 400 (after the path-segment routing
    // hands the decoded segment to the handler).
    expect(status === 400 || status === 404).toBe(true);
  });

  it('rejects non-markdown files', async () => {
    const { status } = await api('/api/packs/hello-world/memory/USER.txt');
    expect(status).toBe(400);
  });

  it('returns 404 when pack is not loaded on file read', async () => {
    const { status } = await api('/api/packs/does-not-exist/memory/USER.md');
    expect(status).toBe(404);
  });
});
