---
title: Manifest Reference
description: The pack.yml fields that define a vertical agent app.
---

Every pack requires a `pack.yml` at its root. This file declares what the pack provides and how the core should load it.

## Minimal Example

```yaml
name: notes
version: 1.0.0
display_name: Notes Companion
description: Daily journaling and reflection companion

provided_skills:
  - onboarding
  - aggregator
  - daily-note
```

## Full Example

```yaml
name: english
version: 1.0.0
display_name: English Coach
description: Listening, speaking, reading, writing & vocabulary training
requires_core: ">=0.1.0"

# Skills this pack provides (must match skills/ subdirectories)
provided_skills:
  - onboarding
  - aggregator
  - shadowing
  - dictation
  - freetalk
  - vocab-review

# Fast-path routing (deterministic UI, no LLM cost)
fast_paths:
  menu: ./menu.json
  i18n: ./i18n/zh-CN.json

# Database schema (one DB per pack, isolated)
schema:
  file: ./schema.sql
  owned_tables:
    - samples
    - vocabulary
    - daily_plan

# Persist data contract — enforced on every persist() call
persist_contract:
  skill_type_prefix: "english."
  required_fields:
    - skill_type
    - session_id
    - response
  optional_fields:
    - subcap_scores
    - errors
    - metadata
  subcap_keys:
    - listening.gist
    - listening.detail
    - vocab.recall

# Cron jobs registered on pack load
cron_defaults:
  - id: morning-reading
    schedule: "0 8 * * *"
    skill: daily-article
    enabled_by_default: false

# Custom tools (optional, must export ToolDefinition)
custom_tools:
  - name: pronAssess
    path: tools/pronAssess.ts

# Declared capabilities for review and future install prompts
permissions:
  files: []
  network:
    - "https://api.example.com"
  platforms:
    - telegram
  cron: true
  external_commands: []

# Runtime requirements
runtime:
  js:
    tools: true
  external_tools: []
```

## Field Reference

### Top-Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Pack identifier. Must be lowercase, alphanumeric + hyphens. Used as DB name and directory name. |
| `version` | `string` | ✅ | Semver version of the pack. |
| `display_name` | `string` | ✅ | Human-readable name shown in menus and UI. |
| `description` | `string` | ✅ | One-line description. |
| `requires_core` | `string` | ❌ | Semver range for core compatibility, e.g. `">=0.1.0"`. |
| `depends_on` | `string[]` | ❌ | Other packs that must be installed. v0.1: not enforced at runtime. |

### `provided_skills`

Array of skill directory names. Each must have a corresponding `skills/<name>/SKILL.md`.

Two skills are **mandatory** for every pack:

- **`onboarding`** — Initial diagnostic, run when the pack is first enabled
- **`aggregator`** — Periodic profile synthesis, run by cron or on demand

### `fast_paths`

| Field | Description |
|-------|-------------|
| `menu` | Path to `menu.json` — deterministic UI navigation, zero LLM cost |
| `i18n` | Path to translation JSON — template strings for the pack's language |

### `schema`

| Field | Description |
|-------|-------------|
| `file` | Path to `schema.sql` — run on pack's isolated SQLite DB |
| `owned_tables` | Tables this pack creates and owns. Core enforces that only this pack accesses them. |

:::note
Each pack gets its own database at `~/.aouo/data/store/<pack-name>.db`. Cross-pack access is forbidden in v0.1.
:::

### `persist_contract`

Defines validation rules for the `persist` tool when called from this pack's skills.

| Field | Description |
|-------|-------------|
| `skill_type_prefix` | All `skill_type` values must start with this (e.g. `"english."`) |
| `required_fields` | Fields that must be present on every `persist()` call |
| `optional_fields` | Additional allowed fields |
| `subcap_keys` | Valid keys for structured sub-capability scoring |

### `cron_defaults`

Array of cron job definitions:

| Field | Description |
|-------|-------------|
| `id` | Unique job identifier within the pack |
| `schedule` | Cron expression (e.g. `"0 8 * * *"`) or interval (e.g. `"every 2h"`) |
| `skill` | Skill to invoke when the job fires |
| `enabled_by_default` | Whether the job is active on install |

### `custom_tools`

Array of pack-specific tool registrations:

| Field | Description |
|-------|-------------|
| `name` | Tool name exposed to the LLM |
| `path` | Relative path to TypeScript file exporting a `ToolDefinition` |

### `permissions`

Declared capabilities for review, validation, and future install prompts.

| Field | Description |
|-------|-------------|
| `files` | File paths the pack needs to access |
| `network` | Network origins or services the pack needs |
| `platforms` | Platform accounts/channels the pack integrates with |
| `cron` | Whether the pack registers scheduled jobs |
| `external_commands` | External command names requested through the future external-tool protocol |

### `runtime`

Runtime requirements. MVP treats JS/TS tools as first-class. Python and other languages should be declared later through `external_tools` with explicit command, JSON input/output, dependency checks, permissions, and sandbox policy.
