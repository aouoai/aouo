/**
 * @module tools/persist
 * @description Pack-aware data persistence gateway.
 *
 * Routes structured data operations to pack-owned databases.
 * This tool is domain-agnostic — packs define
 * their own actions and schemas via pack.yml persist_contract.
 *
 * When a pack context is available, the `save` action validates
 * the payload against the pack's `persist_contract`:
 * - `skill_type` must start with the declared prefix
 * - All `required_fields` must be present
 * - `subcap` keys must be in the declared whitelist
 */

import { register } from './registry.js';
import { getDatabase } from './db.js';
import { getLoadedPacks } from '../packs/loader.js';
import type { ToolContext } from '../agent/types.js';
import type { PackManifest } from '../packs/types.js';

const CONTROL_KEYS = new Set(['db', 'action', 'table', 'data', 'sql', 'params', 'limit']);
const READ_SQL = ['SELECT', 'PRAGMA', 'EXPLAIN', 'WITH'];
const WRITE_SQL_PATTERN = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|VACUUM|ATTACH|DETACH|TRUNCATE)\b/i;

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function validateIdentifier(kind: string, value: string): string | null {
  return isSafeIdentifier(value) ? null : `Invalid ${kind} identifier "${value}"`;
}

function validateReadSql(sql: string): string | null {
  const trimmed = sql.trimStart();
  const upper = trimmed.toUpperCase();
  if (!READ_SQL.some((prefix) => upper.startsWith(prefix))) {
    return `SQL must be read-only and start with: ${READ_SQL.join(', ')}`;
  }
  if (WRITE_SQL_PATTERN.test(trimmed)) {
    return 'SQL must be read-only for persist query';
  }
  return null;
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function parseDataPayload(args: Record<string, unknown>): { data?: Record<string, unknown>; error?: string } {
  const inline: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (!CONTROL_KEYS.has(key)) {
      inline[key] = value;
    }
  }

  if (!('data' in args) || args.data === undefined || args.data === null || args.data === '') {
    return { data: inline };
  }

  try {
    const parsed = typeof args.data === 'string' ? JSON.parse(args.data) : args.data;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'data must be a JSON object' };
    }
    return { data: { ...inline, ...(parsed as Record<string, unknown>) } };
  } catch {
    return { error: 'Invalid data JSON' };
  }
}

function getDefaultTable(manifest?: PackManifest): string | undefined {
  return manifest?.schema.owned_tables[0];
}

function validateTableAccess(table: string, manifest?: PackManifest): string | null {
  const identifierError = validateIdentifier('table', table);
  if (identifierError) return identifierError;
  if (!manifest) return null;
  if (!manifest.schema.owned_tables.includes(table)) {
    return `Table "${table}" is not owned by pack "${manifest.name}"`;
  }
  return null;
}

function tableHasColumn(db: ReturnType<typeof getDatabase>, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

// ── Contract Validation ──────────────────────────────────────────────────────

/**
 * Validates a save payload against the pack's persist_contract.
 * Returns null if valid, or an error string if invalid.
 */
function validatePersistContract(
  data: Record<string, unknown>,
  manifest: PackManifest,
): string | null {
  const contract = manifest.persist_contract;
  if (!contract || !contract.skill_type_prefix) return null; // No contract = no validation

  // 1. Validate skill_type prefix
  const skillType = data['skill_type'];
  if (typeof skillType === 'string' && contract.skill_type_prefix) {
    if (!skillType.startsWith(contract.skill_type_prefix)) {
      return `skill_type "${skillType}" must start with "${contract.skill_type_prefix}" (pack: ${manifest.name})`;
    }
  }

  // 2. Validate required_fields
  for (const field of contract.required_fields) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      return `Missing required field "${field}" for pack "${manifest.name}"`;
    }
  }

  // 3. Validate subcap_keys whitelist (if subcap_scores is present)
  if (contract.subcap_keys.length > 0 && data['subcap_scores']) {
    const subcaps = typeof data['subcap_scores'] === 'string'
      ? JSON.parse(data['subcap_scores'])
      : data['subcap_scores'];

    if (typeof subcaps === 'object' && subcaps !== null) {
      const allowed = new Set(contract.subcap_keys);
      for (const key of Object.keys(subcaps)) {
        if (!allowed.has(key)) {
          return `subcap key "${key}" not in pack "${manifest.name}" whitelist: [${contract.subcap_keys.join(', ')}]`;
        }
      }
    }
  }

  return null;
}

/**
 * Finds the manifest for the given pack name from loaded packs.
 */
function findManifest(packName: string): PackManifest | undefined {
  const packs = getLoadedPacks();
  return packs.find(p => p.manifest.name === packName)?.manifest;
}

// ── Tool Registration ────────────────────────────────────────────────────────

register({
  name: 'persist',
  description: 'Pack-aware structured data persistence. Default action="save" writes a record. Supports practice, recent_practice, query, recent, and summary for the active pack.',
  parameters: {
    type: 'object',
    properties: {
      db: { type: 'string', description: 'Database name (defaults to pack name or "default").' },
      action: { type: 'string', description: 'Operation: save | practice | recent_practice | query | recent | summary.' },
      table: { type: 'string', description: 'Target table name.' },
      data: { type: 'string', description: 'JSON object of fields to persist.' },
      sql: { type: 'string', description: 'For action=query: raw SELECT SQL.' },
      params: { type: 'string', description: 'JSON array of params for sql.' },
      limit: { type: 'integer', description: 'Row limit for read actions.' },
    },
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<string> {
    const action = String(args.action || 'save');
    const dbName = String(args.db || context.pack || 'default');
    const manifest = context.pack ? findManifest(context.pack) : undefined;

    try {
      const db = getDatabase(dbName);

      switch (action) {
        case 'practice':
        case 'save': {
          const table = String(args.table || (action === 'practice' ? getDefaultTable(manifest) : '') || '');
          if (!table) return JSON.stringify({ error: `table is required for ${action}` });

          const tableError = validateTableAccess(table, manifest);
          if (tableError) return JSON.stringify({ error: tableError });

          const parsed = parseDataPayload(args);
          if (parsed.error) return JSON.stringify({ error: parsed.error });
          const data = parsed.data ?? {};

          if (context.sessionKey && !data['session_id']) {
            data['session_id'] = context.sessionKey;
          }

          // ── Pack contract validation ──
          if (manifest) {
            const validationError = validatePersistContract(data, manifest);
            if (validationError) {
              return JSON.stringify({ error: `Contract violation: ${validationError}` });
            }
          }

          // Auto-add timestamp
          if (!data['created_at']) data['created_at'] = new Date().toISOString();

          const keys = Object.keys(data);
          if (keys.length === 0) return JSON.stringify({ error: 'No data fields to persist' });
          for (const key of keys) {
            const keyError = validateIdentifier('column', key);
            if (keyError) return JSON.stringify({ error: keyError });
          }
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          const values = keys.map(k => normalizeValue(data[k]));

          const result = db.prepare(sql).run(...values as any[]);
          return JSON.stringify({
            ok: true,
            table,
            id: typeof result.lastInsertRowid === 'bigint' ? Number(result.lastInsertRowid) : result.lastInsertRowid,
          });
        }

        case 'query': {
          const sql = String(args.sql || '');
          if (!sql) return JSON.stringify({ error: 'sql is required for query' });
          const sqlError = validateReadSql(sql);
          if (sqlError) return JSON.stringify({ error: sqlError });

          let params: unknown[] = [];
          if (args.params) {
            params = typeof args.params === 'string' ? JSON.parse(args.params) : args.params as unknown[];
          }

          const rows = db.prepare(sql).all(...params as any[]);
          const limit = Number(args.limit) || 50;
          return JSON.stringify({ rows: rows.slice(0, limit), count: rows.length });
        }

        case 'recent_practice':
        case 'recent': {
          const table = String(args.table || (action === 'recent_practice' ? getDefaultTable(manifest) : '') || '');
          if (!table) return JSON.stringify({ error: 'table is required for recent' });
          const tableError = validateTableAccess(table, manifest);
          if (tableError) return JSON.stringify({ error: tableError });

          const limit = Number(args.limit) || 10;
          const orderColumn = tableHasColumn(db, table, 'created_at') ? 'created_at' : 'rowid';
          const skillType = typeof args.skill_type === 'string' ? args.skill_type : undefined;
          const hasSkillType = skillType && tableHasColumn(db, table, 'skill_type');
          const sql = hasSkillType
            ? `SELECT * FROM ${table} WHERE skill_type = ? ORDER BY ${orderColumn} DESC, rowid DESC LIMIT ?`
            : `SELECT * FROM ${table} ORDER BY ${orderColumn} DESC, rowid DESC LIMIT ?`;
          const rows = hasSkillType
            ? db.prepare(sql).all(skillType, limit)
            : db.prepare(sql).all(limit);
          return JSON.stringify({ rows, count: rows.length });
        }

        case 'summary': {
          const table = String(args.table || '');
          if (!table) return JSON.stringify({ error: 'table is required for summary' });
          const tableError = validateTableAccess(table, manifest);
          if (tableError) return JSON.stringify({ error: tableError });
          const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).all() as Array<{ count: number }>;
          return JSON.stringify({ table, count: count[0]?.count || 0 });
        }

        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}. Available: save, practice, recent_practice, query, recent, summary.` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});
