---
title: Schema & Persist API
description: Define pack-owned schema and write data through persist.
---

Packs define their database schema in `schema.sql` and interact with it exclusively through the `persist` tool. Direct SQL access is not available to skills.

## Data Isolation

Each pack gets its own isolated SQLite database:

```
~/.aouo/data/
└── store/
    ├── english.db       ← english pack's data
    ├── notes.db         ← notes pack's data
    └── fitness.db       ← fitness pack's data
```

| Rule | Description |
|------|-------------|
| **DB per pack** | Database name = pack name |
| **No cross-access** | A pack cannot read or write another pack's database |
| **No ATTACH** | `ATTACH DATABASE` is blocked at the tool layer |
| **Shared user data** | Cross-pack info (name, timezone) lives in `~/.aouo/config.json` |

## Writing `schema.sql`

Your schema file runs on the pack's database at startup. Use `CREATE TABLE IF NOT EXISTS` for idempotency:

```sql
-- Pack: english
-- Tables: samples, vocabulary

CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  skill_type TEXT NOT NULL,
  response TEXT,
  subcap_scores TEXT,          -- JSON: {"listening.gist": 7, "vocab.recall": 5}
  errors TEXT,                 -- JSON array of error objects
  metadata TEXT,               -- JSON for pack-specific data
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT UNIQUE NOT NULL,
  definition TEXT,
  context TEXT,
  cefr_level TEXT,
  srs_interval_days REAL DEFAULT 1,
  srs_ease REAL DEFAULT 2.5,
  next_review TEXT,
  review_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_samples_skill ON samples(skill_type);
CREATE INDEX IF NOT EXISTS idx_samples_created ON samples(created_at);
CREATE INDEX IF NOT EXISTS idx_vocab_review ON vocabulary(next_review);
```

### Conventions

- Use `TEXT` for dates (ISO 8601 strings) — SQLite has no native datetime
- Use `TEXT` for JSON columns — parse in application logic
- Always include `created_at` with a default
- Declare tables in `owned_tables` in your `pack.yml`

### Schema Evolution

v0.1 supports **additive changes only**:

- ✅ `ALTER TABLE ... ADD COLUMN` — core auto-detects missing columns
- ❌ `DROP COLUMN` / `RENAME COLUMN` — requires pack major version bump + DB rebuild

## The Persist Tool

Skills interact with the database through the `persist` tool. The LLM calls it as a tool with structured arguments.

### Actions

#### `practice` — Save a practice record

```json
{
  "action": "practice",
  "skill_type": "english.dictation",
  "session_id": "abc123",
  "response": "User transcribed 80% correctly",
  "subcap_scores": {
    "listening.detail": 7,
    "listening.gist": 8
  },
  "errors": [
    { "key": "spelling", "detail": "wrote 'recieve' instead of 'receive'" }
  ]
}
```

#### `recent_practice` — Read recent records

```json
{
  "action": "recent_practice",
  "skill_type": "english.dictation",
  "limit": 10
}
```

Returns the last N practice records for the specified skill type.

Pack-specific actions such as `coach_context`, `word_upsert`, or `due_words` should be implemented as JS/TS pack tools that call `persist` or return structured data for the runtime to persist.

### Validation

The `persist_contract` in `pack.yml` enables automatic validation:

- `skill_type` must start with the declared `skill_type_prefix`
- `required_fields` must all be present
- `subcap_scores` keys must be in the declared `subcap_keys` list

Invalid calls return an error to the LLM, which can self-correct.

## State Files

Beyond the database, packs can maintain markdown state files:

| File | Location | Purpose |
|------|----------|---------|
| `USER.md` | `~/.aouo/data/packs/<pack>/` | Stable user facts for this domain (goals, preferences) |
| `MEMORY.md` | `~/.aouo/data/packs/<pack>/` | Evolving state (current level, strategy, notes) |

These are read into the system prompt so the agent has persistent context. The `memory` tool can read and write them.

:::tip
Not every pack needs state files. A simple utility pack (e.g. a web clipper) can work with just the database. State files are for packs that need the LLM to have persistent awareness of the user's journey.
:::
