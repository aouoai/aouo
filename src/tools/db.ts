/**
 * @module tools/db
 * @description Direct SQLite database tool with SQL security guards.
 */

import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { register } from './registry.js';
import { AOUO_HOME } from '../lib/paths.js';
import type { ToolContext } from '../agent/types.js';

const STORE_DIR = join(AOUO_HOME, 'data', 'store');
const dbCache = new Map<string, DatabaseSync>();

const ALLOWED = ['SELECT','INSERT','UPDATE','DELETE','CREATE TABLE','CREATE INDEX','CREATE UNIQUE INDEX','ALTER TABLE','PRAGMA','EXPLAIN','WITH'];
const BLOCKED = [/\bDROP\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i, /\bTRUNCATE\b/i, /\bATTACH\b/i, /\bDETACH\b/i];

function validateSql(sql: string): string | null {
  for (const p of BLOCKED) if (p.test(sql)) return `Blocked: ${p.source}`;
  if (!ALLOWED.some(a => sql.trimStart().toUpperCase().startsWith(a))) return `SQL must start with: ${ALLOWED.join(', ')}`;
  return null;
}

function isRead(sql: string): boolean {
  const u = sql.trimStart().toUpperCase();
  return u.startsWith('SELECT') || u.startsWith('PRAGMA') || u.startsWith('EXPLAIN') || u.startsWith('WITH');
}

export function getDatabase(name: string): DatabaseSync {
  const safe = basename(name).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new Error('Invalid database name');
  if (dbCache.has(safe)) return dbCache.get(safe)!;
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  const db = new DatabaseSync(join(STORE_DIR, `${safe}.db`));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  dbCache.set(safe, db);
  return db;
}

function schema(db: DatabaseSync): unknown {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{name:string}>;
  return tables.map(t => ({
    table: t.name,
    columns: (db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{name:string;type:string;notnull:number;pk:number}>).map(c => ({
      name: c.name, type: c.type, notnull: c.notnull === 1, pk: c.pk === 1,
    })),
  }));
}

function parseParams(raw: unknown): unknown[] {
  if (!raw) return [];
  const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(p) ? p : [p];
}

register({
  name: 'db',
  description: 'Execute SQL on a named SQLite database (~/.aouo/data/store/<name>.db). Pass `sql` + `params`, or `queries` for batch, or omit both for schema.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Database name' },
      sql: { type: 'string', description: 'SQL statement' },
      params: { type: 'string', description: 'JSON array of params' },
      queries: { type: 'string', description: 'Batch: JSON array of {sql,params?}' },
    },
    required: ['name'],
  },
  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
    const n = String(args.name||'').trim();
    if (!n) return JSON.stringify({error:'Missing name'});
    const sql = String(args.sql||'').trim();

    if (args.queries) {
      let qs: Array<{sql:string;params?:unknown}>;
      try { qs = typeof args.queries==='string' ? JSON.parse(args.queries) : args.queries as any; } catch { return JSON.stringify({error:'Bad queries JSON'}); }
      for (const q of qs) { const e = validateSql(q.sql); if (e) return JSON.stringify({error:e}); }
      const db = getDatabase(n);
      const results: unknown[] = [];
      db.exec('BEGIN');
      try {
        for (const q of qs) {
          const p = parseParams(q.params);
          if (isRead(q.sql)) { results.push({rows:(db.prepare(q.sql).all(...p as any[])).slice(0,50)}); }
          else { const r = db.prepare(q.sql).run(...p as any[]); results.push({ok:true,changes:Number(r.changes)}); }
        }
        db.exec('COMMIT');
        return JSON.stringify({ok:true,results});
      } catch (e) { db.exec('ROLLBACK'); return JSON.stringify({error:(e as Error).message}); }
    }

    if (!sql) { try { return JSON.stringify({schema:schema(getDatabase(n))}); } catch(e) { return JSON.stringify({error:(e as Error).message}); } }

    const err = validateSql(sql);
    if (err) return JSON.stringify({error:err});
    const db = getDatabase(n);
    const p = parseParams(args.params);
    try {
      if (isRead(sql)) { const rows = db.prepare(sql).all(...p as any[]); return JSON.stringify({rows:rows.slice(0,100),count:rows.length}); }
      const r = db.prepare(sql).run(...p as any[]);
      return JSON.stringify({ok:true,changes:r.changes,lastInsertRowid:typeof r.lastInsertRowid==='bigint'?Number(r.lastInsertRowid):r.lastInsertRowid});
    } catch(e) { return JSON.stringify({error:(e as Error).message}); }
  },
});
