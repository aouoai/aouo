---
title: Writing Skills
description: Write SKILL.md workflows that define pack behavior.
---

A **skill** is a markdown file (`SKILL.md`) that gives the agent structured instructions for a specific task. Each skill lives in its own directory under `skills/`.

## File Structure

```
skills/
├── onboarding/
│   └── SKILL.md
├── shadowing/
│   └── SKILL.md
└── daily-note/
    └── SKILL.md
```

## SKILL.md Format

Every skill is a standard Markdown file with YAML frontmatter:

```markdown
---
name: Listening Dictation
pack: english
description: Dictation practice — listen and transcribe
command: true
triggers:
  - dictation
  - 听写
---

# Listening Dictation

## Goal
Improve detail listening through transcription exercises.

## Procedure
1. Pick an audio clip matching the user's level (use MEMORY.md)
2. Play the clip via tts tool
3. Ask the user to transcribe what they heard
4. Compare, highlight errors
5. Save results via persist (skill_type: "english.dictation")

## Scoring
- accuracy: percentage of words correct
- speed: time taken vs clip duration

## Rules
- Always give encouragement after scoring
- If accuracy < 60%, suggest an easier clip next time
```

## Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Human-readable skill name |
| `pack` | `string` | ✅ | Pack this skill belongs to (must match `pack.yml` name) |
| `description` | `string` | ✅ | One-line description |
| `command` | `boolean` | ❌ | If `true`, the skill appears in the command menu |
| `triggers` | `string[]` | ❌ | Keywords that activate this skill via natural language |
| `requires` | `string[]` | ❌ | Capabilities required (e.g. `[browser]`). Skill is hidden if not met. |
| `fallback` | `string` | ❌ | Skill to use when `requires` is not met |

## Mandatory Skills

Every pack **must** include these two skills:

### `onboarding`

Run when the pack is first enabled for a user. Establishes a baseline:

- Conduct a diagnostic assessment
- Write initial profile via `persist()`
- Initialize `MEMORY.md` (if the pack uses it)
- Must output a `<pack>_level` or `<pack>_initial_assessment` field

### `aggregator`

Run periodically (default: every 7 days) to synthesize progress:

- Read recent practice data via `persist(action: "recent_practice")`
- Update `MEMORY.md` with current state
- Generate a progress snapshot

## Skill Resolution Priority

When the agent resolves a skill name:

1. `~/.aouo/skills/<name>/` — User-created overrides (highest priority)
2. `~/.aouo/packs/<active-pack>/skills/<name>/` — Pack-provided
3. Core built-in support skills (lowest priority)

Users can override any pack skill by placing a `SKILL.md` with the same name in their personal `~/.aouo/skills/` directory.

## Best Practices

- **Be specific**: The LLM follows your markdown literally. Vague instructions produce vague behavior.
- **Reference tools**: Name the exact tools the skill should use (`persist`, `tts`, `msg`, etc.). Use `msg(type=...)` for user-facing output and let each adapter render it.
- **Include scoring rubrics**: Structured output → better data → better MEMORY updates
- **Keep it under 500 lines**: Long skills increase token cost. Split complex flows into sub-skills.
- **Test with real conversations**: Run 5–10 real sessions before considering the skill stable.
