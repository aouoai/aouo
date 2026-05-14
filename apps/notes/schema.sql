-- notes pack schema
-- Tables: entries, weekly_summaries

PRAGMA foreign_keys = ON;

-- Journal entries — one row per note/journal session
CREATE TABLE IF NOT EXISTS entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL DEFAULT '',
    skill_type      TEXT NOT NULL,
    content         TEXT NOT NULL,
    mood            TEXT,
    tags            TEXT NOT NULL DEFAULT '',          -- JSON array
    word_count      INTEGER NOT NULL DEFAULT 0,
    metadata        TEXT NOT NULL DEFAULT '',          -- JSON object
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Weekly summaries — aggregator output
CREATE TABLE IF NOT EXISTS weekly_summaries (
    week            TEXT PRIMARY KEY,                  -- ISO week, e.g. 2026-W20
    period_start    TEXT NOT NULL,
    period_end      TEXT NOT NULL,
    entry_count     INTEGER NOT NULL DEFAULT 0,
    total_words     INTEGER NOT NULL DEFAULT 0,
    top_themes      TEXT NOT NULL DEFAULT '',          -- JSON array
    mood_summary    TEXT NOT NULL DEFAULT '',
    highlights      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at);
CREATE INDEX IF NOT EXISTS idx_entries_skill ON entries(skill_type);
CREATE INDEX IF NOT EXISTS idx_entries_mood ON entries(mood);
