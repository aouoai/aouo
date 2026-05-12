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
  description: 'Pack-aware structured data persistence. Default action="save" writes a record. Other actions depend on the active pack. Pass `db` for the database name, `action` for the operation, and key-value fields for data.',
  parameters: {
    type: 'object',
    properties: {
      db: { type: 'string', description: 'Database name (defaults to pack name or "default").' },
      action: { type: 'string', description: 'Operation: save | query | recent | summary. Pack-specific actions are also supported.' },
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

    // Auto-inject session key
    if (context.sessionKey) {
      args.session_id = context.sessionKey;
    }

    try {
      const db = getDatabase(dbName);

      switch (action) {
        case 'save': {
          const table = String(args.table || '');
          if (!table) return JSON.stringify({ error: 'table is required for save' });

          let data: Record<string, unknown>;
          try {
            data = typeof args.data === 'string' ? JSON.parse(args.data) : (args.data as Record<string, unknown>) || {};
          } catch {
            return JSON.stringify({ error: 'Invalid data JSON' });
          }

          // ── Pack contract validation ──
          if (context.pack) {
            const manifest = findManifest(context.pack);
            if (manifest) {
              const validationError = validatePersistContract(data, manifest);
              if (validationError) {
                return JSON.stringify({ error: `Contract violation: ${validationError}` });
              }
            }
          }

          // Auto-add timestamp
          if (!data['created_at']) data['created_at'] = new Date().toISOString();

          const keys = Object.keys(data);
          const placeholders = keys.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          const values = keys.map(k => data[k]);

          const result = db.prepare(sql).run(...values as any[]);
          return JSON.stringify({
            ok: true,
            id: typeof result.lastInsertRowid === 'bigint' ? Number(result.lastInsertRowid) : result.lastInsertRowid,
          });
        }

        case 'query': {
          const sql = String(args.sql || '');
          if (!sql) return JSON.stringify({ error: 'sql is required for query' });

          let params: unknown[] = [];
          if (args.params) {
            params = typeof args.params === 'string' ? JSON.parse(args.params) : args.params as unknown[];
          }

          const rows = db.prepare(sql).all(...params as any[]);
          const limit = Number(args.limit) || 50;
          return JSON.stringify({ rows: rows.slice(0, limit), count: rows.length });
        }

        case 'recent': {
          const table = String(args.table || '');
          if (!table) return JSON.stringify({ error: 'table is required for recent' });
          const limit = Number(args.limit) || 10;
          const rows = db.prepare(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT ?`).all(limit);
          return JSON.stringify({ rows, count: rows.length });
        }

        case 'summary': {
          const table = String(args.table || '');
          if (!table) return JSON.stringify({ error: 'table is required for summary' });
          const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).all() as Array<{ count: number }>;
          return JSON.stringify({ table, count: count[0]?.count || 0 });
        }

        default:
          return JSON.stringify({ error: `Unknown persist action: ${action}. Available: save, query, recent, summary.` });
      }
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
});
