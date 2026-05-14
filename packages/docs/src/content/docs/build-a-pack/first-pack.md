---
title: Your First Pack
description: Build a simple notes companion pack from scratch.
---

Build a simple "Notes" companion from scratch.

## 1. Create the Directory

```bash
mkdir -p ~/.aouo/packs/notes/skills/{daily-note,onboarding,aggregator}
mkdir -p ~/.aouo/packs/notes/templates
```

## 2. Write the Manifest

`pack.yml`:

```yaml
name: notes
version: 1.0.0
display_name: Notes Companion
description: Daily journaling and reflection companion

provided_skills:
  - onboarding
  - aggregator
  - daily-note

schema:
  file: schema.sql
  owned_tables: [entries]

persist_contract:
  skill_type_prefix: "notes."
  required_fields: [skill_type, content]

cron_defaults:
  - id: evening-prompt
    schedule: "0 21 * * *"
    skill: daily-note
    enabled_by_default: true
```

## 3. Define the Schema

`schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  skill_type TEXT NOT NULL,
  content TEXT NOT NULL,
  mood TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 4. Write a Skill

`skills/daily-note/SKILL.md`:

```markdown
---
name: Daily Note
description: Guided daily journaling session
command: true
---

# Daily Note

Guide the user through a brief journaling session.

1. Ask a reflective prompt
2. Listen and ask a follow-up
3. Summarize key themes
4. Save via persist (skill_type: "notes.daily")

Keep it to 3-5 exchanges. End with encouragement.
```

## 5. Test

```bash
aouo gateway start
```

The pack is automatically discovered from `~/.aouo/packs/notes/`.
