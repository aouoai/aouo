---
title: Example Packs
description: Three concrete pack shapes — English Coach, Creator Studio, Daily Journal — with the storage, memory, cron, and skills each one actually needs.
---

A pack is judged by whether it keeps a real user coming back for weeks. The way to evaluate the format is to look at three concrete shapes a serious vertical agent app might take.

This page sketches each one — its memory, its tables, its cron jobs, and the skills that move data through it.

## English Coach

> "Remember what I got wrong last week and quiz me on it this morning."

A pack that runs a long-term English-learning loop. The user practices daily; the pack tracks what they confuse and surfaces it in tomorrow's mission.

### What it remembers

```text
memory/
├── soul.md     — Coaching tone: encouraging, specific, not patronizing
├── user.md     — Stable: CEFR level, target (IELTS), available minutes/day
└── state.md    — Evolving: this week's focus, recent mistake patterns

schema.sql
├── writing_submissions   — every paragraph the user has written
├── review_queue          — SRS items with phrase, due_at, ease_factor
├── mistake_patterns      — recurring error types (article use, tense agreement)
└── weekly_progress       — week-keyed summary rows
```

### Skills

| Skill | Trigger | Writes |
| --- | --- | --- |
| `onboarding` | First open | `user.md` (CEFR, goals), seed `state.md` |
| `daily_mission` | 9am cron, manual | `writing_submissions` |
| `writing_feedback` | After submission | `review_queue`, `mistake_patterns` |
| `vocab_review` | Manual, button | Updates `review_queue.ease_factor` |
| `weekly_report` | Sunday 8pm cron | `weekly_progress` |
| `aggregator` | Weekly | Updates `state.md` summary |

### Cron

```yaml
cron:
  - { id: daily_practice, schedule: "0 9 * * *", skill: daily_mission }
  - { id: weekly_review,  schedule: "0 20 * * 0", skill: weekly_report }
```

### Why it works

Everything the agent says next morning is grounded in `review_queue` and `mistake_patterns`, not the conversation history. The user can open `state.md` and read exactly what the pack thinks of them. If something is wrong, they can edit it.

## Creator Studio

> "Capture this link, draft three angles for it, slot the best one on Thursday."

A pack that turns raw inputs (URLs, ideas, screenshots) into a publishing pipeline. The user feeds it material; the pack drafts, scores, and schedules.

### What it remembers

```text
memory/
├── soul.md     — Writing voice: tight, opinionated, no fluff
├── user.md     — Stable: target platforms, audience, tone constraints
└── state.md    — Evolving: this week's themes, posts in flight

schema.sql
├── sources         — captured URLs, notes, attachments
├── ideas           — angles extracted from sources
├── drafts          — drafts with status (queued / scheduled / published)
├── publishing_log  — what shipped where, when
└── brand_voice     — accepted/rejected drafts → tone signal over time
```

### Skills

| Skill | Trigger | Writes |
| --- | --- | --- |
| `capture` | Inbound link or note | `sources` |
| `ingest_url` | Async after capture | Enriches `sources` with summary |
| `prompt_me` | Manual, button | `ideas` from existing sources |
| `draft_post` | Manual, button | `drafts` with platform variant |
| `score_draft` | After accept/reject | Updates `brand_voice` |
| `weekly_plan` | Sunday cron | Reorders the `drafts` queue |

### Cron

```yaml
cron:
  - { id: morning_idea,   schedule: "0 8 * * 1-5", skill: prompt_me }
  - { id: weekly_plan,    schedule: "0 18 * * 0",  skill: weekly_plan }
```

### Why it works

The pack does not "be a writing assistant." It runs the loop the user actually does: capture → angle → draft → ship → review. Each step writes structured data that the next step reads. A general chat assistant has to be re-told all of that every conversation.

## Daily Journal

> "Two weeks of notes — what kept coming up?"

A pack for reflective journaling, mood tracking, and weekly review. Lighter on tables than the other two, heavier on memory.

### What it remembers

```text
memory/
├── soul.md     — Companion tone: warm, curious, not therapeutic
├── user.md     — Stable: rough rhythm, life areas being worked on
└── state.md    — Evolving: themes from the past 2-4 weeks

schema.sql
├── daily_notes     — date, content, mood tag, energy
├── goals           — long-running goals with status
├── action_items    — extracted next-actions from notes
└── weekly_reviews  — synthesized weekly summary rows
```

### Skills

| Skill | Trigger | Writes |
| --- | --- | --- |
| `daily_note` | 9pm cron, manual | `daily_notes` |
| `extract_actions` | After note | `action_items` |
| `review_week` | Friday evening cron | `weekly_reviews` |
| `theme_finder` | Manual | Updates `state.md` themes |

### Cron

```yaml
cron:
  - { id: evening_prompt, schedule: "0 21 * * *", skill: daily_note }
  - { id: friday_review,  schedule: "0 19 * * 5", skill: review_week }
```

### Why it works

The user does not have to "remember to journal." The pack opens the conversation at 9pm. The user does not have to "write a weekly summary." The pack offers one on Friday based on the past 7 days of `daily_notes`. The memory contract lets the agent stay coherent across weeks.

## What unifies the three

| Property | Why all three need it |
| --- | --- |
| Typed state | The thing the user keeps coming back to is the *accumulated* state, not the last reply |
| Per-pack memory | `soul.md`/`user.md`/`state.md` keep each pack in its own voice |
| Schedule | The pack opens the conversation; the user does not have to remember to engage |
| Permission scope | Each pack only touches what its `pack.yml` declares |
| Eval surface | Each pack can be regression-checked: did the SRS scheduler still pick the right cards? did drafts still match the brand voice? |

If a vertical agent doesn't need at least four of those, it probably doesn't need to be a pack. A one-shot tool does not need a `.aouo` bundle.

## Building your own

These three are sketches — they are not shipped as code in this repo. The samples actually in `apps/` (`notes`, `create`, `vocab`) are earlier and smaller versions of the same idea.

To start: see [Your First Pack](/build-a-pack/first-pack/), then [Pack Spec](/concepts/pack-spec/) and [Schema & Persist](/build-a-pack/schema/).

## Related

- [Why Packs](/concepts/why-packs/) — what the pack boundary buys
- [Five Pillars](/concepts/five-pillars/) — what a serious pack should implement
- [Builder Direction](/concepts/builder-direction/) — the long-term goal of NL → pack
