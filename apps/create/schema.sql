-- create pack schema
-- Tables: materials, posts, voices

PRAGMA foreign_keys = ON;

-- Raw material captured by the user (text / voice transcript / image caption / URL)
CREATE TABLE IF NOT EXISTS materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL DEFAULT '',
    skill_type      TEXT NOT NULL,
    kind            TEXT NOT NULL,                     -- text | voice | image | url
    content         TEXT NOT NULL,                     -- raw text or transcript
    source_url      TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',          -- LLM-generated digest
    tags            TEXT NOT NULL DEFAULT '',          -- JSON array
    metadata        TEXT NOT NULL DEFAULT '',          -- JSON object (mime, duration, etc.)
    used_in_post_id INTEGER,                           -- nullable FK to posts(id)
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_materials_created ON materials(created_at);
CREATE INDEX IF NOT EXISTS idx_materials_kind ON materials(kind);
CREATE INDEX IF NOT EXISTS idx_materials_used ON materials(used_in_post_id);

-- Generated post drafts
CREATE TABLE IF NOT EXISTS posts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    platform        TEXT NOT NULL,                     -- twitter | xiaohongshu | linkedin | custom
    voice_name      TEXT NOT NULL,
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',     -- draft | posted | archived
    material_ids    TEXT NOT NULL DEFAULT '',          -- JSON array of source material ids
    metadata        TEXT NOT NULL DEFAULT '',
    posted_at       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);

-- Platform voice templates — pre-seeded; users can edit or add
CREATE TABLE IF NOT EXISTS voices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    platform        TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    system_prompt   TEXT NOT NULL,
    max_length      INTEGER NOT NULL DEFAULT 0,        -- char cap; 0 = unbounded
    is_default      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the three baseline voices. Users can edit these or insert new ones
-- (e.g. a personal "Threads cynical-engineer" voice). The system_prompt is
-- what gets prepended when draft-post runs for that platform.
INSERT OR IGNORE INTO voices (name, platform, description, system_prompt, max_length, is_default) VALUES
('twitter-default', 'twitter',
 'Punchy, hook-first, single tweet under 280 chars.',
 'Write a single tweet under 280 characters. Lead with a hook in the first 6 words. No hashtags unless directly meaningful. No emojis unless they replace a word naturally. Plain prose, no thread-style numbering.',
 280, 1),
('xiaohongshu-default', 'xiaohongshu',
 'Conversational, emoji-rich, ends with hashtags.',
 'Write a 小红书 post in Simplified Chinese. Conversational and warm, like talking to a friend. Use natural emojis throughout. Open with a relatable hook. End with 3-6 relevant hashtags on a new line. Aim for 200-600 Chinese characters.',
 1000, 1),
('linkedin-default', 'linkedin',
 'Professional voice, insight-driven, ~3 short paragraphs.',
 'Write a LinkedIn post in English. Tone: thoughtful professional, not corporate. Structure: 1) a one-line opener that frames the takeaway, 2) two short paragraphs of supporting context or a brief story, 3) a closing question or invitation. No buzzwords. No hashtags inside paragraphs (optional 1-3 hashtags on the last line).',
 3000, 1);
