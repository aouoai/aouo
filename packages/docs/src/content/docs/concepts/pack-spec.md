---
title: Pack Spec v1
description: The current contract for local aouo packs.
---

:::note
This is the v1 Pack Specification. It may evolve as we validate with more packs.
:::

A Pack is a **vertical agent app** — skills + tools + DB schema + cron + memory state + declared permissions.

## File Structure

```
my-pack/
├── pack.yml                 # Manifest (required)
├── schema.sql               # Database schema (optional)
├── menu.json                # Fast-path menus (optional)
├── soul-additions.md        # Append to SOUL (optional)
├── rules-additions.md       # Append to RULES (optional)
├── skills/
│   ├── onboarding/SKILL.md  # Required
│   ├── aggregator/SKILL.md  # Required
│   └── .../SKILL.md
├── tools/                   # Custom tools (optional)
├── templates/
│   ├── USER.md.tmpl
│   └── MEMORY.md.tmpl
└── i18n/                    # Translations (optional)
```

## pack.yml Example

```yaml
name: english
version: 1.0.0
display_name: English Companion
description: IELTS-oriented English learning companion

provided_skills:
  - onboarding
  - aggregator
  - shadowing
  - dictation
  - freetalk

schema:
  file: schema.sql
  owned_tables: [samples, vocabulary, sessions]

persist_contract:
  skill_type_prefix: "english."
  required_fields: [skill_type, session_id, response]
  subcap_keys: [listening.gist, listening.detail, vocab.recall]

cron_defaults:
  - id: daily-reminder
    schedule: "0 7 * * *"
    skill: daily-task
    enabled_by_default: true

custom_tools:
  - name: pronAssess
    path: tools/pronAssess.ts

permissions:
  files: []
  network: []
  platforms: [telegram]
  cron: true
  external_commands: []

runtime:
  js:
    tools: true
  external_tools: []
```

## Key Rules

1. `onboarding` and `aggregator` skills are **mandatory**
2. `persist_contract` enables schema validation on save
3. `soul-additions.md` / `rules-additions.md` are **append-only**
4. Templates are copied once on first install, never overwritten
5. Custom tools must export a valid `ToolDefinition`
6. Durable data writes go through `persist`; `db` is read-only diagnostics
