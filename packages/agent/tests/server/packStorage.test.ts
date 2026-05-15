import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startUiServer, type UiServerHandle } from '../../src/server/index.js';
import { loadPack, unloadAllPacks } from '../../src/packs/loader.js';
import { AOUO_HOME } from '../../src/lib/paths.js';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'packs', 'hello-world');
const STORE_DIR = join(AOUO_HOME, 'data', 'store');
const PACK_DB = join(STORE_DIR, 'hello-world.db');

interface TablesBody {
  exists: boolean;
  tables: Array<{
    name: string;
    rowCount: number;
    columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>;
  }>;
}

interface RowsBody {
  table: string;
  columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }>;
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  rowCount: number;
}

describe('GET /api/packs/:pack/storage/tables[/<name>]', () => {
  let handle: UiServerHandle;

  beforeAll(async () => {
    unloadAllPacks();
    await loadPack(FIXTURE);
    // Wipe any stale DB left by prior runs so the "no storage yet" branch
    // can be exercised before we seed.
    if (existsSync(PACK_DB)) rmSync(PACK_DB);
    handle = await startUiServer({ port: 0, token: 'test-storage' });
  });

  afterAll(async () => {
    await handle.stop();
    unloadAllPacks();
    if (existsSync(PACK_DB)) rmSync(PACK_DB);
  });

  async function api<T>(path: string): Promise<{ status: number; body: T }> {
    const res = await fetch(`http://127.0.0.1:${handle.port}${path}`, {
      headers: { 'X-Aouo-Token': handle.token },
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  it('returns exists=false when the pack DB has not been created', async () => {
    const { status, body } = await api<TablesBody>(
      '/api/packs/hello-world/storage/tables',
    );
    expect(status).toBe(200);
    expect(body.exists).toBe(false);
    expect(body.tables).toEqual([]);
  });

  it('returns 404 listing for an unknown pack', async () => {
    const { status } = await api('/api/packs/does-not-exist/storage/tables');
    expect(status).toBe(404);
  });

  it('lists tables with columns and rowCount after the pack writes', async () => {
    // Seed a small schema + a few rows the way a real pack would via persist.
    mkdirSync(STORE_DIR, { recursive: true });
    const seed = new Database(PACK_DB);
    seed.exec(`
      CREATE TABLE greetings (
        id INTEGER PRIMARY KEY,
        text TEXT NOT NULL,
        meta TEXT
      );
      INSERT INTO greetings (text, meta) VALUES ('hello', '{"v":1}');
      INSERT INTO greetings (text, meta) VALUES ('hi', NULL);
      INSERT INTO greetings (text) VALUES ('hey');
    `);
    seed.close();

    const { status, body } = await api<TablesBody>(
      '/api/packs/hello-world/storage/tables',
    );
    expect(status).toBe(200);
    expect(body.exists).toBe(true);

    const greetings = body.tables.find((t) => t.name === 'greetings');
    expect(greetings).toBeDefined();
    expect(greetings!.rowCount).toBe(3);

    const idCol = greetings!.columns.find((c) => c.name === 'id')!;
    expect(idCol.pk).toBe(true);
    const textCol = greetings!.columns.find((c) => c.name === 'text')!;
    expect(textCol.notnull).toBe(true);
  });

  it('reads rows for a table in most-recent-first order', async () => {
    const { status, body } = await api<RowsBody>(
      '/api/packs/hello-world/storage/tables/greetings',
    );
    expect(status).toBe(200);
    expect(body.table).toBe('greetings');
    expect(body.rowCount).toBe(3);
    expect(body.rows.length).toBe(3);
    // ORDER BY rowid DESC ⇒ the last inserted row ('hey') comes first.
    expect(body.rows[0]!['text']).toBe('hey');
    expect(body.rows[2]!['text']).toBe('hello');
  });

  it('clamps the limit query and reports truncation', async () => {
    const { body } = await api<RowsBody>(
      '/api/packs/hello-world/storage/tables/greetings?limit=2',
    );
    expect(body.rows.length).toBe(2);
    expect(body.truncated).toBe(true);
  });

  it('rejects unsafe table names with 400', async () => {
    const { status } = await api(
      '/api/packs/hello-world/storage/tables/greetings;drop',
    );
    expect(status).toBe(400);
  });

  it('returns 404 for a table that does not exist', async () => {
    const { status } = await api(
      '/api/packs/hello-world/storage/tables/nope',
    );
    expect(status).toBe(404);
  });

  it('returns 404 reading rows when the pack DB has not been created', async () => {
    // hello-world DB exists from earlier seeding — exercise the branch on a
    // never-persisted pack by routing through one that is not loaded; the
    // pack-not-loaded check fires first, but we want to verify the DB-missing
    // branch on the only loaded pack too. Drop the file and retry.
    rmSync(PACK_DB);
    const { status, body } = await api<{ error: string }>(
      '/api/packs/hello-world/storage/tables/greetings',
    );
    expect(status).toBe(404);
    expect(body.error).toMatch(/not been initialized/i);
  });
});
