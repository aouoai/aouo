-- vocab pack schema
-- Tables: words, user_state, cards, intervals, reviews, assessment_items, assessment_runs

PRAGMA foreign_keys = ON;

-- Word entries (LLM-fills these lazily after assessment; not pre-seeded).
CREATE TABLE IF NOT EXISTS words (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    word            TEXT NOT NULL UNIQUE,
    cefr_level      TEXT NOT NULL,                     -- A1|A2|B1|B2|C1|C2
    ipa             TEXT NOT NULL DEFAULT '',
    def_en          TEXT NOT NULL DEFAULT '',
    def_zh          TEXT NOT NULL DEFAULT '',
    example_en      TEXT NOT NULL DEFAULT '',
    example_zh      TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_words_level ON words(cefr_level);

-- Single-row KV store for user-level state. Keys: cefr_level, daily_target,
-- last_assessed_at, active_interval_id, total_reviewed.
CREATE TABLE IF NOT EXISTS user_state (
    k               TEXT PRIMARY KEY,
    v               TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO user_state (k, v) VALUES
('cefr_level', ''),
('daily_target', '15'),
('last_assessed_at', ''),
('active_interval_id', '1'),
('total_reviewed', '0');

-- One card per word the user is learning. SRS state lives here.
CREATE TABLE IF NOT EXISTS cards (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id             INTEGER NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'new',   -- new | learning | review | mastered
    interval_index      INTEGER NOT NULL DEFAULT 0,    -- index into the active intervals.days_csv
    next_due            TEXT NOT NULL DEFAULT (date('now')),
    last_reviewed_at    TEXT,
    lapses              INTEGER NOT NULL DEFAULT 0,
    ease                INTEGER NOT NULL DEFAULT 250,  -- /100, mirrors Anki-style ease factor
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(next_due);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

-- User-customizable interval curves. `days_csv` is a comma-separated list of
-- day deltas to next review at each successful step. Editing the active row
-- (or adding a new row + flipping active_interval_id) reshapes the schedule.
CREATE TABLE IF NOT EXISTS intervals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    days_csv        TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO intervals (name, days_csv, is_active) VALUES
('default',  '1,3,7,14,30,60',    1),
('quick',    '1,2,4,8,16',        0),
('extended', '1,4,10,21,45,90',   0);

-- Review log — every flashcard rating ends up here for stats + report.
CREATE TABLE IF NOT EXISTS reviews (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id         INTEGER NOT NULL,
    reviewed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    result          TEXT NOT NULL,                     -- again | hard | good | easy
    response_ms     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_when ON reviews(reviewed_at);

-- CEFR placement test items — packaged with the pack (30 questions across A2-C1).
CREATE TABLE IF NOT EXISTS assessment_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cefr_level      TEXT NOT NULL,
    prompt          TEXT NOT NULL,
    options_json    TEXT NOT NULL,                     -- JSON array of 4 strings
    correct_index   INTEGER NOT NULL,                  -- 0-based
    rationale       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_assessment_level ON assessment_items(cefr_level);

-- Assessment runs — one row per placement attempt.
CREATE TABLE IF NOT EXISTS assessment_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    cefr_estimate   TEXT NOT NULL DEFAULT '',
    score_json      TEXT NOT NULL DEFAULT ''           -- per-level correct/total
);

-- Seed CEFR placement bank (30 items across A2/B1/B2/C1).
-- Items are gap-fill, definition match, or collocation choice.
INSERT OR IGNORE INTO assessment_items (cefr_level, prompt, options_json, correct_index) VALUES
-- A2 (10)
('A2', 'Choose the best fit: She ___ a coffee every morning.', '["drinks","drink","drinking","is drink"]', 0),
('A2', 'What does "rarely" mean?', '["very often","sometimes","almost never","never at all"]', 2),
('A2', 'Pick the correct preposition: I am afraid ___ spiders.', '["from","of","with","at"]', 1),
('A2', 'Choose the past form: Yesterday I ___ to the market.', '["go","goes","went","gone"]', 2),
('A2', 'What does "borrow" mean?', '["lend something","take something temporarily","steal","buy"]', 1),
('A2', 'Pick the best word: The soup is ___ hot to drink.', '["very","too","much","so"]', 1),
('A2', 'Which is a synonym of "huge"?', '["tiny","massive","narrow","empty"]', 1),
('A2', 'Choose the article: I saw ___ interesting movie last night.', '["a","an","the","(no article)"]', 1),
('A2', 'What does "to postpone" mean?', '["to cancel","to start early","to delay","to repeat"]', 2),
('A2', 'Pick the best fit: He''s ___ better at chess than I am.', '["very","much","more","most"]', 1),

-- B1 (10)
('B1', 'Choose the best word: She gave a ___ explanation that everyone understood.', '["clear","loud","high","cheap"]', 0),
('B1', 'What does "to figure out" mean?', '["to draw","to understand after thinking","to count","to imagine"]', 1),
('B1', 'Pick the correct form: If I ___ more time, I would travel more.', '["have","had","will have","would have"]', 1),
('B1', 'Choose the synonym of "reluctant".', '["eager","unwilling","tired","brave"]', 1),
('B1', 'Pick the collocation: They reached an ___ on the price.', '["argument","agreement","arrangement","achievement"]', 1),
('B1', 'What does "to overlook" mean here: "Don''t overlook the small details."', '["to look down at","to ignore by mistake","to inspect carefully","to admire"]', 1),
('B1', 'Choose the linker: She''s tired, ___ she keeps working.', '["because","so","however","therefore"]', 2),
('B1', 'Pick the best word: The film was ___ entertaining throughout.', '["consistently","constantly","occasionally","rarely"]', 0),
('B1', 'Which means "to bring back to memory"?', '["recall","recoil","recline","reclaim"]', 0),
('B1', 'Choose the best fit: She ___ the team since 2020.', '["leads","has led","is leading","led"]', 1),

-- B2 (6)
('B2', 'Pick the synonym of "ubiquitous".', '["unique","present everywhere","ambiguous","temporary"]', 1),
('B2', 'What does "to mitigate" mean?', '["to make worse","to lessen severity","to support","to investigate"]', 1),
('B2', 'Choose the best word: His arguments were ___ but ultimately unconvincing.', '["fluent","cogent","candid","blunt"]', 1),
('B2', 'Pick the collocation: She made a ___ contribution to the project.', '["substantial","substantive","sustained","subsequent"]', 0),
('B2', 'What does the idiom "to cut corners" mean?', '["to take a shortcut, often by skipping quality steps","to give up","to argue","to plan carefully"]', 0),
('B2', 'Choose the best fit: ___ I disagree with him, I respect his honesty.', '["Although","Despite","However","In spite"]', 0),

-- C1 (4)
('C1', 'Pick the closest meaning of "to obfuscate".', '["to clarify","to deliberately make unclear","to remove","to delay"]', 1),
('C1', 'What does "ostensibly" mean?', '["definitely","apparently / on the surface","reluctantly","privately"]', 1),
('C1', 'Choose the best word: The committee was ___ in its decision — no one dissented.', '["unanimous","ubiquitous","universal","uniform"]', 0),
('C1', 'Pick the best fit: Her remarks were ___, hinting at meanings she wouldn''t state directly.', '["explicit","oblique","candid","verbose"]', 1);
