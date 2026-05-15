/**
 * @module server/storage
 * @description Pack-scoped SQLite browser endpoints (read-only).
 *
 * The dashboard's Storage tab shows the structured side of a pack: which
 * tables it owns, and the most recent rows in each. We do not expose a
 * SELECT-anything surface — table names are validated as bare SQL
 * identifiers and reads are pinned to "ORDER BY rowid DESC LIMIT ?" so
 * the endpoint stays a viewer, not a query engine. Writes are reserved
 * for the pack's `persist` tool path.
 *
 * The file may not exist yet (a freshly installed pack hasn't persisted
 * anything). We short-circuit before `getDatabase` would create an empty
 * file, so visiting Storage doesn't pollute the data dir with stub DBs.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { AOUO_HOME } from '../lib/paths.js';
import { getLoadedPacks } from '../packs/loader.js';

const STORE_DIR = join(AOUO_HOME, 'data', 'store');

function isLoaded(packName: string): boolean {
  return getLoadedPacks().some((p) => p.manifest.name === packName);
}

/** Mirrors the sanitization in `tools/db.ts#getDatabase` so a stale DB file lookup matches. */
function safeName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9_-]/g, '');
}

function packDbPath(packName: string): string {
  return join(STORE_DIR, `${safeName(packName)}.db`);
}

/**
 * Opens the pack DB in read-only mode for one inspection request. We use a
 * fresh connection (not the shared write-cache in `tools/db.ts`) so the
 * viewer cannot share locks or accidentally hold open a writer slot.
 */
function openReadOnly(packName: string): Database.Database | null {
  const path = packDbPath(packName);
  if (!existsSync(path)) return null;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.exec('PRAGMA query_only = ON');
  return db;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount: number;
}

export interface StorageTablesResponse {
  /** False when the pack hasn't materialized a DB file yet. */
  exists: boolean;
  tables: TableInfo[];
}

export function handleListStorageTables(packName: string): StorageTablesResponse | null {
  if (!isLoaded(packName)) return null;

  const db = openReadOnly(packName);
  if (!db) return { exists: false, tables: [] };

  try {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;

    const tables: TableInfo[] = rows.map((r) => {
      const columns = (
        db.prepare(`PRAGMA table_info("${r.name.replace(/"/g, '""')}")`).all() as Array<{
          name: string;
          type: string;
          notnull: number;
          pk: number;
        }>
      ).map((c) => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull === 1,
        pk: c.pk === 1,
      }));
      const countRow = db
        .prepare(`SELECT COUNT(*) AS n FROM "${r.name.replace(/"/g, '""')}"`)
        .get() as { n: number };
      return { name: r.name, columns, rowCount: countRow.n };
    });

    return { exists: true, tables };
  } finally {
    db.close();
  }
}

export interface StorageRowsResponse {
  table: string;
  columns: ColumnInfo[];
  rows: Array<Record<string, unknown>>;
  /** True when the result is capped at `limit` (more rows exist past it). */
  truncated: boolean;
  rowCount: number;
}

export type StorageRowsResult =
  | { ok: true; data: StorageRowsResponse }
  | { ok: false; status: 400 | 404; error: string };

/** SQLite identifier rule for tables we will inspect — no schema-qualified, no whitespace. */
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function handleReadStorageRows(
  packName: string,
  tableName: string,
  limit: number,
): StorageRowsResult {
  if (!isLoaded(packName)) {
    return { ok: false, status: 404, error: `Pack not loaded: ${packName}` };
  }
  if (!TABLE_NAME_PATTERN.test(tableName)) {
    return { ok: false, status: 400, error: 'Table name must match [A-Za-z_][A-Za-z0-9_]*' };
  }

  const db = openReadOnly(packName);
  if (!db) {
    return { ok: false, status: 404, error: 'Pack storage has not been initialized.' };
  }

  try {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName) as { name: string } | undefined;
    if (!exists) {
      return { ok: false, status: 404, error: `Table not found: ${tableName}` };
    }

    const columns = (
      db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>
    ).map((c) => ({
      name: c.name,
      type: c.type,
      notnull: c.notnull === 1,
      pk: c.pk === 1,
    }));

    const rowCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM "${tableName}"`).get() as { n: number }
    ).n;

    // ORDER BY rowid DESC gives us "most recent" semantics for the common
    // case of plain tables with rowids. WITHOUT ROWID tables don't expose
    // the column — fall back to natural order silently rather than 500.
    let rows: Array<Record<string, unknown>>;
    try {
      rows = db
        .prepare(`SELECT * FROM "${tableName}" ORDER BY rowid DESC LIMIT ?`)
        .all(limit) as Array<Record<string, unknown>>;
    } catch {
      rows = db
        .prepare(`SELECT * FROM "${tableName}" LIMIT ?`)
        .all(limit) as Array<Record<string, unknown>>;
    }

    return {
      ok: true,
      data: {
        table: tableName,
        columns,
        rows,
        truncated: rowCount > rows.length,
        rowCount,
      },
    };
  } finally {
    db.close();
  }
}
