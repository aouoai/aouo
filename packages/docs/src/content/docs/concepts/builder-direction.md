---
title: The Builder Direction
description: Where the pack format is going — AI-assisted app assembly. Why this needs typed skill contracts, and why it's the structural advantage over flat skill libraries.
---

The hardest thing about a pack is that it has many parts. Skills, memory, schema, persist contract, cron, permissions, evals — a user who wants "an English coach" should not have to design all of that by hand.

That is what the **pack builder** is for.

> Long-term goal, not yet shipped. This page describes the direction so the architectural decisions made today stay aligned with it.

## The user-facing pitch

The user describes what they want, in their own language:

> "A personal content creation agent that can collect links, summarize them, ask me for angles, draft posts, and keep a calendar."

The builder composes a pack from reusable pieces:

- relevant skills
- required tools
- memory defaults
- optional schema and persist contract
- cron schedules and triggers
- permissions
- UI panels
- evals and sample fixtures

The user reviews the result, runs it locally, edits anything they want, and ships it.

## Why this is not skill mixing

A naive version of this is: search a skill library, pick a few that sound related, glue them into a folder, hand the user a chatbot.

That fails. The result has no coherent storage, no schedule, no permission scope, and no way to know whether the skills actually compose into a usable workflow.

The pack builder needs to compile **a narrow, coherent app** — not a bag.

The difference is that every skill must declare a typed contract.

## Typed skill contracts

A skill's `SKILL.md` frontmatter today is mostly prose. The builder direction is to make it look more like a module signature:

```yaml
id: writing_feedback
description: Review English writing and extract reusable review items.
when_to_use: The user submits a paragraph, journal entry, or draft for feedback.
inputs:
  - writing_submission
outputs:
  - feedback
  - corrections
  - review_items
reads:
  - learner_profile
  - mistake_patterns
writes:
  - writing_submissions
  - review_queue
required_tools:
  - persist
  - query_db
evals:
  - feedback_accuracy
  - cefr_consistency
estimated_context_tokens: 1200
```

Once skills declare what they read, write, need, and produce, the builder can:

| Task | How the contract helps |
| --- | --- |
| Pick skills | Filter by `description` + `when_to_use` semantically; rank by relevance to the user's brief |
| Compose persist contract | Union all `writes` declarations across selected skills |
| Generate `schema.sql` | Infer table shapes from `writes` entity types |
| Pick required tools | Union of `required_tools` across selected skills |
| Plan cron | Skills with `suggested_triggers` get scheduled |
| Estimate context budget | Sum `estimated_context_tokens` for typical concurrent skills |
| Run evals | `evals` declarations become regression suites |

The contract turns "pick some skills" into a typed problem.

## The pieces the builder composes

A built pack is more than skill files. The builder generates:

```text
new-pack/
├── pack.yml              ← identity + skills + memory + cron + permissions + context
├── schema.sql            ← inferred from writes
├── migrations/           ← initial migration only at first build
├── skills/<id>/SKILL.md  ← copied from the library (versioned)
├── memory/
│   ├── soul.md           ← templated tone for the chosen domain
│   ├── user.md.tmpl      ← onboarding-fillable
│   └── state.md.tmpl     ← initial structure
├── tools/                ← only if the brief requires custom tools
├── evals/                ← copied from selected skills + a few high-level suite tests
└── permissions.yml       ← scope inferred from required_tools
```

The user sees the diff, edits anything they disagree with, and installs.

## Why this is a moat

Several competing approaches exist for "AI app composition":

| Approach | Limit |
| --- | --- |
| Custom GPTs | One assistant + knowledge files; no per-skill state, no schedule, no inspect |
| Skill libraries (Hermes, openclaw) | Flat library; the user installs N skills, the model routes between them every turn |
| Code-first frameworks (LangChain, LlamaIndex) | The user writes Python; no end-user pack format |
| Custom-built vertical apps | Each app rebuilds storage, cron, memory, permissions from scratch |

The pack format sits between code and prompt. It lets a non-developer get a serious, stateful, scheduled, permissioned agent app without writing the wiring — because the builder fills in the wiring, and the runtime enforces it.

The structural advantage is that **the builder doesn't have to be right the first time**. The user can:

1. Inspect every file the builder produced
2. Edit any of them
3. Re-run the builder against the same brief and diff the result
4. Save the edit as a new template

This is how good code-generation tools work. Pack assembly is the same shape applied to vertical agents.

## What needs to be true first

This isn't built today. The honest list of what has to come first:

- **Skills must declare contracts.** Today's `SKILL.md` frontmatter is prose; the typed shape above is aspirational.
- **A skill library.** There needs to be a corpus of well-typed skills to compose from. The samples in `apps/` are early examples.
- **A persist-contract generator.** Inferring `schema.sql` from `writes:` declarations across N skills is mechanical but unbuilt.
- **An eval generator.** Picking which evals to run on a composed pack needs heuristics.
- **A diff/review UI.** The user reviewing builder output is part of the safety contract — that surface belongs in the desktop client.

## What we are doing today

Even before the builder exists, every design decision in the runtime should keep the door open for it:

- **Manifest fields are declarative** — `permissions:`, `cron:`, `persist:`, `context:` are all enforced from `pack.yml`, not from runtime imports. A generated `pack.yml` works the same as a hand-written one.
- **Skills are file-shaped** — `SKILL.md` per skill, loadable on demand. Adding a frontmatter field doesn't change the runtime's loader.
- **Pack-scoped isolation** — a builder-generated pack runs alongside hand-written packs with no cross-contamination.

That is what "build toward the builder" means in practice: keep packs declarative, keep skills modular, keep state typed.

## Related

- [Why Packs](/concepts/why-packs/) — why pack composition is a richer problem than skill picking
- [Skills](/build-a-pack/skills/) — current `SKILL.md` format
- [Pack Spec](/concepts/pack-spec/) — what the manifest declares
- [Example Packs](/concepts/example-packs/) — three shapes a builder should be able to produce
