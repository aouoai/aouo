/**
 * @module storage/db
 * @description Singleton SQLite database connection using better-sqlite3.
 *
 * Manages the lifecycle of the core database connection, using WAL mode
 * for concurrent read performance. Handles automatic schema initialization
 * for sessions and messages tables.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../lib/paths.js';

let _db: Database.Database | null = null;

/**
 * Initializes the core database schema.
 *
 * Creates `sessions` and `messages` tables if they don't exist.
 * Idempotent — safe to call on every startup.
 */
function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL,
      title TEXT DEFAULT '',
      active_skill TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_key ON sessions(session_key);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      raw_parts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
  `);

  // Migration: add active_skill column to existing databases
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN active_skill TEXT DEFAULT NULL');
  } catch {
    // Column already exists
  }
}

/**
 * Retrieves the singleton SQLite database instance.
 *
 * Creates the data directory, initializes the connection with WAL mode
 * and busy timeout, and runs schema initialization on first call.
 *
 * @returns The initialized database connection.
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec('PRAGMA busy_timeout = 5000');

  initializeSchema(_db);

  return _db;
}

/**
 * Closes the active database connection and resets the singleton.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
