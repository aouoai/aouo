/**
 * @module packs/schema
 * @description Pack database schema migration runner.
 *
 * Executes a pack's `schema.sql` file against its dedicated SQLite
 * database. Uses additive-only migrations: supports CREATE TABLE
 * and ALTER TABLE ADD COLUMN, but not destructive operations.
 */

import { readFileSync, existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ensurePackDataDir, STORE_DIR } from '../lib/paths.js';
import { logger } from '../lib/logger.js';

/**
 * Runs schema migration for a pack.
 *
 * Opens the pack's dedicated database file and executes the
 * schema SQL. If tables already exist, existing statements
 * are silently skipped via `IF NOT EXISTS`.
 *
 * @param packName - The pack identifier.
 * @param schemaFile - Relative path to the schema.sql within the pack source.
 * @param packSourceDir - Absolute path to the pack's source directory.
 * @returns True if migration succeeded.
 */
export function runPackMigration(
  packName: string,
  schemaFile: string,
  packSourceDir: string,
): boolean {
  const schemaPath = join(packSourceDir, schemaFile);

  if (!existsSync(schemaPath)) {
    logger.info({ msg: 'schema_skip', pack: packName, reason: 'no schema.sql found' });
    return true; // No schema is valid — pack may not need its own DB
  }

  ensurePackDataDir(packName);
  const dbPath = getPackDbPath(packName);

  // Ensure data directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  try {
    const sql = readFileSync(schemaPath, 'utf-8');
    const db = new Database(dbPath);

    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');

    // Execute the schema SQL — must use IF NOT EXISTS for idempotency
    db.exec(sql);

    db.close();

    logger.info({ msg: 'schema_migrated', pack: packName, db: dbPath });
    return true;
  } catch (err) {
    logger.error({
      msg: 'schema_migration_failed',
      pack: packName,
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Gets the database path for a pack.
 *
 * @param packName - The pack identifier.
 * @returns Absolute path to the pack's database file.
 */
export function getPackDbPath(packName: string): string {
  return join(STORE_DIR, `${packName}.db`);
}

/**
 * Applies `extends_columns` declarations from a pack manifest.
 *
 * For each shared table declared in `extends_columns`, checks
 * existing columns via PRAGMA and adds any missing ones via
 * ALTER TABLE ADD COLUMN.
 *
 * @param packName - The pack identifier (for logging).
 * @param extendsColumns - Map of table name → { column_name: column_type }.
 */
export function runExtendsColumns(
  packName: string,
  extendsColumns: Record<string, Record<string, string>>,
): void {
  for (const [table, columns] of Object.entries(extendsColumns)) {
    if (!columns || Object.keys(columns).length === 0) continue;

    try {
      // Use the pack's own database
      const dbPath = getPackDbPath(packName);
      const db = new Database(dbPath);

      // Get existing columns
      const existingCols = db
        .prepare(`PRAGMA table_info(${table})`)
        .all() as Array<{ name: string }>;
      const existingSet = new Set(existingCols.map(c => c.name));

      for (const [colName, colType] of Object.entries(columns)) {
        if (!existingSet.has(colName)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colType}`);
          logger.info({
            msg: 'extends_column_added',
            pack: packName,
            table,
            column: colName,
            type: colType,
          });
        }
      }

      db.close();
    } catch (err) {
      // Table might not exist yet — that's fine, the column will be
      // added when the table is first created with the full schema
      logger.warn({
        msg: 'extends_columns_skipped',
        pack: packName,
        table,
        error: (err as Error).message,
      });
    }
  }
}
